"""Reddit Before/After Car Photo Pair Collector using the official PRAW API."""

from __future__ import annotations

import logging
import os
import random
import re
import time
from typing import Generator, List, Optional, Tuple, Dict, Any
from dotenv import load_dotenv
from PIL import Image

import praw
from praw.models import Submission

from scraper.config import (
    DEFAULT_SUBREDDITS,
    REDDIT_SEARCH_QUERIES,
    TITLE_PAIR_PATTERNS,
    ENABLE_VISION_VALIDATION,
    EXCLUDED_PRIMARY_TREATMENT_PATTERNS,
    DEFAULT_USER_AGENT,
    DEFAULT_REQUEST_DELAY,
    RANDOM_DELAY_JITTER,
)
from scraper.dedup import PerceptualDedupIndex
from scraper.image_utils import (
    download_image,
    validate_image_dimensions,
    is_side_by_side_collage,
    is_stacked_collage,
    is_likely_full_shot,
    split_horizontal_collage,
    split_vertical_collage,
)
from scraper.storage import DatasetStorage
from scraper.vision_validator import VisionPairValidator

# Load .env / .env.local if present
load_dotenv()
load_dotenv(".env.local")

logger = logging.getLogger("scraper.reddit")


def is_excluded_treatment(title_or_text: str) -> bool:
    """Check if title matches excluded treatments (e.g. PPF, ceramic coating)."""
    if not title_or_text:
        return False
    for pat in EXCLUDED_PRIMARY_TREATMENT_PATTERNS:
        if re.search(pat, title_or_text):
            return True
    return False



class RedditPairCollector:
    """Collects before/after car modification image pairs using official Reddit PRAW API."""

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        user_agent: Optional[str] = None,
        storage: Optional[DatasetStorage] = None,
        dedup_index: Optional[PerceptualDedupIndex] = None,
        vision_validator: Optional[VisionPairValidator] = None,
        request_delay: float = DEFAULT_REQUEST_DELAY,
        allow_split_collages: bool = True,
        enable_vision_validation: bool = ENABLE_VISION_VALIDATION,
    ):
        self.client_id = client_id or os.getenv("REDDIT_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("REDDIT_CLIENT_SECRET")
        self.user_agent = user_agent or os.getenv("REDDIT_USER_AGENT") or DEFAULT_USER_AGENT

        self.storage = storage or DatasetStorage()
        self.dedup_index = dedup_index or PerceptualDedupIndex()
        self.vision_validator = vision_validator or (VisionPairValidator() if enable_vision_validation else None)
        self.request_delay = request_delay
        self.allow_split_collages = allow_split_collages
        self.enable_vision_validation = enable_vision_validation

        self.reddit: Optional[praw.Reddit] = None
        self._compiled_patterns = [re.compile(p, re.IGNORECASE) for p in TITLE_PAIR_PATTERNS]

    def authenticate(self) -> bool:
        """Initialize PRAW Reddit client."""
        if not self.client_id or not self.client_secret:
            logger.error(
                "Missing Reddit API credentials. Please set REDDIT_CLIENT_ID and "
                "REDDIT_CLIENT_SECRET in your .env or environment variables."
            )
            return False

        try:
            self.reddit = praw.Reddit(
                client_id=self.client_id,
                client_secret=self.client_secret,
                user_agent=self.user_agent,
                check_for_updates=False,
            )
            # Test read-only access
            _ = self.reddit.read_only
            logger.info("Successfully authenticated with Reddit API (read-only mode).")
            return True
        except Exception as e:
            logger.error(f"Failed to authenticate with Reddit PRAW: {e}")
            return False

    def is_matching_title(self, title: str) -> bool:
        """Check if post title matches before/after keywords or patterns."""
        if not title:
            return False
        return any(pat.search(title) for pat in self._compiled_patterns)

    def _sleep_politely(self) -> None:
        """Add polite delay with random jitter between requests to respect rate limits."""
        delay = self.request_delay + random.uniform(0, RANDOM_DELAY_JITTER)
        time.sleep(delay)

    def extract_gallery_images(self, submission: Submission) -> Optional[Tuple[Image.Image, Image.Image, str]]:
        """
        Extract before and after images from a Reddit gallery post.
        Returns (img_before, img_after, extraction_method) or None.
        """
        if not getattr(submission, "is_gallery", False):
            return None

        media_metadata = getattr(submission, "media_metadata", {})
        gallery_data = getattr(submission, "gallery_data", {})

        if not media_metadata or not gallery_data:
            return None

        items = gallery_data.get("items", [])
        if len(items) < 2:
            return None

        # Extract image URLs in order
        image_entries: List[Dict[str, Any]] = []
        for item in items:
            media_id = item.get("media_id")
            caption = (item.get("caption") or "").lower()
            meta = media_metadata.get(media_id, {})
            if meta.get("status") != "valid":
                continue

            # Highest resolution image
            source_info = meta.get("s", {})
            img_url = source_info.get("u") or source_info.get("gif")
            if img_url:
                # Unescape HTML entities in Reddit preview URLs (e.g. &amp; -> &)
                img_url = img_url.replace("&amp;", "&")
                image_entries.append({"url": img_url, "caption": caption})

        if len(image_entries) < 2:
            return None

        # Determine which is before and which is after
        before_idx = 0
        after_idx = 1

        # Check captions if present
        for idx, entry in enumerate(image_entries):
            cap = entry["caption"]
            if any(w in cap for w in ["before", "stock", "prior", "original", "day 1", "start"]):
                before_idx = idx
            elif any(w in cap for w in ["after", "wrapped", "modded", "done", "finished", "final", "result"]):
                after_idx = idx

        if before_idx == after_idx:
            # Fallback to first 2 images
            before_idx = 0
            after_idx = 1

        logger.debug(f"Downloading gallery pair from {submission.permalink}...")
        img_before = download_image(image_entries[before_idx]["url"], user_agent=self.user_agent)
        self._sleep_politely()
        img_after = download_image(image_entries[after_idx]["url"], user_agent=self.user_agent)

        if not img_before or not img_after:
            return None

        if not validate_image_dimensions(img_before) or not validate_image_dimensions(img_after):
            return None

        return img_before, img_after, "reddit_gallery"

    def extract_single_or_split_image(self, submission: Submission) -> Optional[Tuple[Image.Image, Image.Image, str]]:
        """
        Extract before and after pair from a single image post that contains a side-by-side or stacked collage.
        """
        if not self.allow_split_collages:
            return None

        url = getattr(submission, "url", "")
        if not url or not any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"]):
            return None

        # If it's a direct image URL
        img = download_image(url, user_agent=self.user_agent)
        if not img:
            return None

        if is_side_by_side_collage(img):
            b, a = split_horizontal_collage(img)
            if validate_image_dimensions(b) and validate_image_dimensions(a):
                return b, a, "reddit_horizontal_split"

        if is_stacked_collage(img):
            b, a = split_vertical_collage(img)
            if validate_image_dimensions(b) and validate_image_dimensions(a):
                return b, a, "reddit_vertical_split"

        return None

    def search_submissions(
        self,
        subreddits: Optional[List[str]] = None,
        limit_per_query: int = 25,
    ) -> Generator[Submission, None, None]:
        """Search subreddits using PRAW for before/after submissions."""
        if not self.reddit:
            if not self.authenticate():
                return

        subs = subreddits or DEFAULT_SUBREDDITS
        seen_submission_ids = set()

        for sub_name in subs:
            logger.info(f"Scanning subreddit: r/{sub_name}...")
            try:
                sub = self.reddit.subreddit(sub_name)

                for query in REDDIT_SEARCH_QUERIES:
                    logger.debug(f"Searching r/{sub_name} for query: {query}")
                    try:
                        results = sub.search(query, sort="relevance", time_filter="all", limit=limit_per_query)
                        for post in results:
                            if post.id in seen_submission_ids:
                                continue
                            seen_submission_ids.add(post.id)

                            if self.is_matching_title(post.title):
                                yield post
                    except Exception as e:
                        logger.warning(f"Error querying r/{sub_name} with '{query}': {e}")
                    
                    self._sleep_politely()

            except Exception as e:
                logger.error(f"Error accessing subreddit r/{sub_name}: {e}")

    def collect(
        self,
        target_count: int = 15,
        subreddits: Optional[List[str]] = None,
    ) -> int:
        """
        Run the Reddit collection process until `target_count` valid pairs are collected.
        Returns the number of pairs successfully collected.
        """
        if not self.reddit:
            if not self.authenticate():
                logger.error("Cannot run Reddit collector without authentication.")
                return 0

        collected = 0
        duplicates_skipped = 0
        total_examined = 0

        logger.info(f"Starting Reddit pair collection (target: {target_count} pairs)...")

        for submission in self.search_submissions(subreddits=subreddits):
            total_examined += 1
            logger.info(f"[{total_examined}] Checking: '{submission.title}' (r/{submission.subreddit.display_name})")

            # Hard filter: exclude invisible treatments (PPF, ceramic coating, etc.)
            if is_excluded_treatment(submission.title):
                logger.info(f"Skipping Reddit post due to excluded treatment in title: '{submission.title}'")
                continue

            pair_result = None
            if getattr(submission, "is_gallery", False):
                pair_result = self.extract_gallery_images(submission)
            else:
                pair_result = self.extract_single_or_split_image(submission)

            if not pair_result:
                logger.debug(f"No valid image pair could be extracted from post {submission.id}")
                continue

            img_before, img_after, method = pair_result

            # Dedup check
            is_dup, reason = self.dedup_index.is_invalid_or_duplicate(img_before, img_after)
            if is_dup:
                logger.info(f"Skipping candidate from {submission.id}: {reason}")
                duplicates_skipped += 1
                continue

            # Automated Claude Vision validation check
            vision_info = None
            if self.vision_validator and self.vision_validator.is_available():
                v_res = self.vision_validator.validate_pair(img_before, img_after, pair_title=submission.title)
                vision_info = v_res
                if not v_res.get("passed", False):
                    logger.info(f"Vision validation REJECTED '{submission.title[:40]}': {v_res.get('reason')}")
                    continue

            # Save pair to dataset
            author_name = str(submission.author.name) if submission.author else "unknown"
            source_url = f"https://www.reddit.com{submission.permalink}"
            
            extra = {
                "reddit_post_id": submission.id,
                "score": submission.score,
                "upvote_ratio": getattr(submission, "upvote_ratio", None),
            }
            if vision_info:
                extra["vision_validation"] = vision_info

            pair_id, meta = self.storage.save_pair(
                img_before=img_before,
                img_after=img_after,
                title=submission.title,
                source_url=source_url,
                source_type="reddit",
                author=author_name,
                subreddit=str(submission.subreddit.display_name),
                extraction_method=method,
                extra_info=extra,
            )

            # Update dedup index
            self.dedup_index.add_pair(
                pair_id=pair_id,
                hashes_before={"phash": meta["hashes"]["phash_before"], "dhash": meta["hashes"]["dhash_before"]},
                hashes_after={"phash": meta["hashes"]["phash_after"], "dhash": meta["hashes"]["dhash_after"]},
            )

            collected += 1
            logger.info(f"Saved pair #{pair_id} ('{submission.title}') via {method} [{collected}/{target_count}]")

            if collected >= target_count:
                logger.info(f"Reached target collection goal of {target_count} pairs.")
                break

            self._sleep_politely()

        logger.info(
            f"Reddit collection finished. Examined {total_examined} posts, collected {collected} pairs, "
            f"skipped {duplicates_skipped} duplicates."
        )
        return collected

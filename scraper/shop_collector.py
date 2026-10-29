"""Curated car wrap & modification shop portfolio scraper with robots.txt & rate limit compliance."""

from __future__ import annotations

import logging
import random
import re
import time
from typing import Dict, List, Optional, Tuple, Any
from urllib.parse import urljoin, urlparse
import urllib.robotparser

import requests
from bs4 import BeautifulSoup
from PIL import Image

from scraper.config import (
    CURATED_SHOP_SOURCES,
    DEFAULT_USER_AGENT,
    DEFAULT_REQUEST_DELAY,
    ENABLE_VISION_VALIDATION,
    EXCLUDED_PRIMARY_TREATMENT_PATTERNS,
    RANDOM_DELAY_JITTER,
    TIMEOUT_SECONDS,
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

logger = logging.getLogger("scraper.shops")


def is_excluded_treatment(title_or_text: str) -> bool:
    """
    Check if title or treatment description matches excluded invisible treatments
    (e.g., PPF, clear bra, ceramic coating, machine polish, detailing only).
    """
    if not title_or_text:
        return False
    for pat in EXCLUDED_PRIMARY_TREATMENT_PATTERNS:
        if re.search(pat, title_or_text):
            return True
    return False



class ShopPortfolioCollector:
    """Collects before/after car modification pairs from curated shop portfolios."""

    def __init__(
        self,
        storage: Optional[DatasetStorage] = None,
        dedup_index: Optional[PerceptualDedupIndex] = None,
        vision_validator: Optional[VisionPairValidator] = None,
        user_agent: str = DEFAULT_USER_AGENT,
        request_delay: float = DEFAULT_REQUEST_DELAY,
        allow_split_collages: bool = True,
        enable_vision_validation: bool = ENABLE_VISION_VALIDATION,
    ):
        self.storage = storage or DatasetStorage()
        self.dedup_index = dedup_index or PerceptualDedupIndex()
        self.vision_validator = vision_validator or (VisionPairValidator() if enable_vision_validation else None)
        self.user_agent = user_agent
        self.request_delay = request_delay
        self.allow_split_collages = allow_split_collages
        self.enable_vision_validation = enable_vision_validation

        # Cache robot parsers per domain
        self._robot_parsers: Dict[str, urllib.robotparser.RobotFileParser] = {}

    def is_allowed_by_robots(self, url: str) -> bool:
        """Check robots.txt for the given target URL."""
        try:
            parsed = urlparse(url)
            domain_root = f"{parsed.scheme}://{parsed.netloc}"

            if domain_root not in self._robot_parsers:
                rp = urllib.robotparser.RobotFileParser()
                robots_url = urljoin(domain_root, "/robots.txt")
                try:
                    res = requests.get(
                        robots_url,
                        headers={"User-Agent": self.user_agent},
                        timeout=10,
                    )
                    if res.status_code == 200:
                        rp.parse(res.text.splitlines())
                    else:
                        # If robots.txt is 404 or not found, crawling is allowed
                        rp.parse([])
                except Exception:
                    # Default permissive if robots.txt unreachable
                    rp.parse([])
                self._robot_parsers[domain_root] = rp

            return self._robot_parsers[domain_root].can_fetch(self.user_agent, url)
        except Exception as e:
            logger.debug(f"Robots check error for {url}: {e}")
            return True

    def _sleep_politely(self) -> None:
        """Add polite delay with random jitter."""
        delay = self.request_delay + random.uniform(0, RANDOM_DELAY_JITTER)
        time.sleep(delay)

    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch and parse HTML page if allowed by robots.txt."""
        if not self.is_allowed_by_robots(url):
            logger.warning(f"URL disallowed by robots.txt: {url}")
            return None

        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        try:
            res = requests.get(url, headers=headers, timeout=TIMEOUT_SECONDS)
            if res.status_code != 200:
                logger.debug(f"HTTP {res.status_code} when fetching {url}")
                return None
            return BeautifulSoup(res.text, "html.parser")
        except Exception as e:
            logger.warning(f"Error fetching shop page {url}: {e}")
            return None

    def _extract_image_url_from_element(self, tag: BeautifulSoup, base_url: str) -> Optional[str]:
        """Extract valid image URL from various tag attributes or inline CSS styles."""
        if not tag:
            return None

        # Check standard src attributes
        for attr in ["src", "data-src", "data-lazy-src", "data-original", "data-full-url", "data-image", "data-bg"]:
            val = tag.get(attr)
            if val and not val.startswith("data:image/svg"):
                return urljoin(base_url, val)

        # Check srcset
        srcset = tag.get("srcset") or tag.get("data-srcset")
        if srcset:
            parts = srcset.split(",")
            if parts:
                last_candidate = parts[-1].strip().split()[0]
                if last_candidate and not last_candidate.startswith("data:image/svg"):
                    return urljoin(base_url, last_candidate)

        # Check inline CSS background-image
        style = tag.get("style", "")
        bg_match = re.search(r"background(?:-image)?\s*:\s*url\((['\"]?)(.*?)\1\)", style, re.IGNORECASE)
        if bg_match:
            bg_url = bg_match.group(2)
            if bg_url and not bg_url.startswith("data:"):
                return urljoin(base_url, bg_url)

        return None

    def extract_pairs_from_html(
        self,
        soup: BeautifulSoup,
        base_url: str,
        shop_name: str,
    ) -> List[Tuple[Image.Image, Image.Image, str, str]]:
        """
        Extract before/after image pairs from various common web gallery patterns:
        1. TwentyTwenty / Before-After Slider containers.
        2. Side-by-side div wrappers with explicit before/after classes or alt tags.
        3. Wide collage single images.
        4. Curated project gallery items.
        
        Returns list of (img_before, img_after, title, extraction_method).
        """
        pairs: List[Tuple[Image.Image, Image.Image, str, str]] = []

        # 1. Look for before-after slider containers (TwentyTwenty, BeerSlider, Cocoen, etc.)
        slider_containers = soup.select(
            ".twentytwenty-container, .beer-slider, .cocoen, .juxtapose, "
            "[data-before-after], .before-after-slider, .ba-slider, .image-comparison, .comparison-slider"
        )
        for container in slider_containers:
            imgs = container.find_all("img")
            if len(imgs) >= 2:
                url_b = self._extract_image_url_from_element(imgs[0], base_url)
                url_a = self._extract_image_url_from_element(imgs[1], base_url)
                if url_b and url_a:
                    title = imgs[0].get("alt") or imgs[1].get("alt") or container.get_text(strip=True) or f"{shop_name} Slider Comparison"
                    self._sleep_politely()
                    img_b = download_image(url_b, user_agent=self.user_agent)
                    img_a = download_image(url_a, user_agent=self.user_agent)

                    if img_b and img_a and validate_image_dimensions(img_b) and validate_image_dimensions(img_a):
                        pairs.append((img_b, img_a, title[:150], "shop_slider_widget"))

        # 2. Look for paired elements explicitly labeled 'before' and 'after'
        before_elements = soup.find_all(
            lambda tag: tag.name in ["div", "figure", "section", "article", "li"]
            and any("before" in str(c).lower() for c in tag.get("class", []))
        )

        for b_elem in before_elements:
            parent = b_elem.parent
            if not parent:
                continue
            a_elem = parent.find(
                lambda tag: tag.name in ["div", "figure", "section", "article", "li"]
                and any("after" in str(c).lower() for c in tag.get("class", []))
            )
            if a_elem and a_elem != b_elem:
                img_b_tag = b_elem.find("img") or b_elem
                img_a_tag = a_elem.find("img") or a_elem
                url_b = self._extract_image_url_from_element(img_b_tag, base_url)
                url_a = self._extract_image_url_from_element(img_a_tag, base_url)
                if url_b and url_a:
                    title = (
                        (img_b_tag.get("alt") if hasattr(img_b_tag, "get") else None)
                        or (img_a_tag.get("alt") if hasattr(img_a_tag, "get") else None)
                        or f"{shop_name} Before/After Transformation"
                    )

                    self._sleep_politely()
                    img_b = download_image(url_b, user_agent=self.user_agent)
                    img_a = download_image(url_a, user_agent=self.user_agent)

                    if img_b and img_a and validate_image_dimensions(img_b) and validate_image_dimensions(img_a):
                        pairs.append((img_b, img_a, title[:150], "shop_paired_markup"))

        # 3. Look for gallery images that might be side-by-side before/after collages
        if self.allow_split_collages:
            all_imgs = soup.find_all(["img", "a"])
            for elem in all_imgs:
                alt = (elem.get("alt") if hasattr(elem, "get") else "") or ""
                url = self._extract_image_url_from_element(elem, base_url)
                if not url:
                    continue

                if any(k in alt.lower() or k in url.lower() for k in ["before-after", "before_after", "b4-after", "transformation", "before_and_after"]):
                    self._sleep_politely()
                    downloaded = download_image(url, user_agent=self.user_agent)
                    if not downloaded:
                        continue

                    if is_side_by_side_collage(downloaded):
                        b, a = split_horizontal_collage(downloaded)
                        if validate_image_dimensions(b) and validate_image_dimensions(a):
                            pairs.append((b, a, (alt or f"{shop_name} Side-by-Side")[:150], "shop_horizontal_split"))
                    elif is_stacked_collage(downloaded):
                        b, a = split_vertical_collage(downloaded)
                        if validate_image_dimensions(b) and validate_image_dimensions(a):
                            pairs.append((b, a, (alt or f"{shop_name} Stacked Split")[:150], "shop_vertical_split"))

        return pairs

    def extract_project_links(self, soup: BeautifulSoup, base_url: str) -> List[Tuple[str, str]]:
        """Extract individual car project/build showcase links from a portfolio page."""
        links: List[Tuple[str, str]] = []
        seen = set()
        parsed_base = urlparse(base_url)

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("#") or any(href.lower().endswith(ext) for ext in [".jpg", ".png", ".pdf", ".mp4", ".zip"]):
                continue
            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)
            if parsed.netloc != parsed_base.netloc:
                continue

            path = parsed.path.lower()
            if path == parsed_base.path or path in [
                "/", "/portfolio", "/gallery", "/contact", "/about", "/services",
                "/cart", "/privacy", "/terms", "/faq", "/careers", "/colours",
                "/manufacturers", "/locations", "/shop", "/ppf", "/ppf-portfolio"
            ]:
                continue

            # Hard filter on link path / text for excluded treatments
            link_text = a.get_text(strip=True)
            if is_excluded_treatment(path) or is_excluded_treatment(link_text):
                continue

            # Check if link references specific car builds, projects, or restyling jobs
            car_keywords = [
                "project", "view", "wrap", "build", "bmw", "mustang", "porsche",
                "defender", "audi", "ferrari", "civic", "yaris", "mazda", "targa",
                "amg", "m3", "m4", "gtr", "r8", "corvette", "challenger", "camaro",
                "ford", "toyota", "nissan", "mercedes", "lamborghini", "mclaren",
                "aston", "vw", "mini", "tesla", "model-", "focus", "f150", "c63",
                "c43", "dbx", "296", "840d", "t5", "srt", "125i", "m140i", "850i",
                "vantage", "m440i", "crafter", "m8", "mach1", "lotus", "350z",
                "golf", "m2", "a35", "wrangler", "amarok", "rs4", "ftype", "pantera",
                "emira", "gwagon", "595"
            ]

            text = link_text.lower()
            if any(k in path or k in text for k in car_keywords):
                if full_url not in seen:
                    seen.add(full_url)
                    title = link_text or path.strip("/").replace("-", " ").title()
                    if title.lower() in ["view the project", "view project", "view", "read more"]:
                        title = path.strip("/").replace("-", " ").title()
                    links.append((full_url, title))

        return links

    def collect(
        self,
        target_count: int = 15,
        shop_sources: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """
        Crawl curated shop list and collect before/after pairs.
        Returns total pairs collected.
        """
        shops = shop_sources or CURATED_SHOP_SOURCES
        collected = 0
        duplicates_skipped = 0

        logger.info(f"Starting Shop Portfolio collection (target: {target_count} pairs across {len(shops)} curated shops)...")

        for shop in shops:
            if collected >= target_count:
                break

            name = shop.get("name", "Auto Mod Shop")
            url = shop.get("url", "")
            if not url:
                continue

            logger.info(f"Visiting curated shop: {name} ({url})")
            soup = self.fetch_page(url)
            self._sleep_politely()

            if not soup:
                continue

            # 1. Extract direct pairs from portfolio page (sliders, markup, collages)
            extracted = self.extract_pairs_from_html(soup, base_url=url, shop_name=name)
            logger.info(f"Found {len(extracted)} direct candidate pairs at {name}")

            for img_before, img_after, title, method in extracted:
                if collected >= target_count:
                    break

                # Hard filter: exclude invisible treatments (PPF, ceramic coating, etc.)
                if is_excluded_treatment(title):
                    logger.info(f"Skipping pair due to excluded treatment in title: '{title}'")
                    continue

                # Perceptual dedup check
                is_dup, reason = self.dedup_index.is_invalid_or_duplicate(img_before, img_after)
                if is_dup:
                    logger.info(f"Skipping shop candidate: {reason}")
                    duplicates_skipped += 1
                    continue

                # Automated Claude Vision validation check
                vision_info = None
                if self.vision_validator and self.vision_validator.is_available():
                    v_res = self.vision_validator.validate_pair(img_before, img_after, pair_title=title)
                    vision_info = v_res
                    if not v_res.get("passed", False):
                        logger.info(f"Vision validation REJECTED '{title[:40]}': {v_res.get('reason')}")
                        continue

                # Save pair
                extra = {
                    "shop_category": shop.get("category"),
                    "region": shop.get("region"),
                }
                if vision_info:
                    extra["vision_validation"] = vision_info

                pair_id, meta = self.storage.save_pair(
                    img_before=img_before,
                    img_after=img_after,
                    title=title,
                    source_url=url,
                    source_type="shop_portfolio",
                    author=name,
                    extraction_method=method,
                    extra_info=extra,
                )

                # Register in dedup
                self.dedup_index.add_pair(
                    pair_id=pair_id,
                    hashes_before={"phash": meta["hashes"]["phash_before"], "dhash": meta["hashes"]["dhash_before"]},
                    hashes_after={"phash": meta["hashes"]["phash_after"], "dhash": meta["hashes"]["dhash_after"]},
                )

                collected += 1
                logger.info(f"Saved shop pair #{pair_id} ('{title}') [{collected}/{target_count}]")

            # 2. If needed, explore individual car project showcase links from this shop
            if collected < target_count:
                proj_links = self.extract_project_links(soup, base_url=url)
                if proj_links:
                    logger.info(f"Discovered {len(proj_links)} individual car build projects at {name}")

                for proj_url, proj_title in proj_links:
                    if collected >= target_count:
                        break

                    # Hard filter check on project title and URL
                    if is_excluded_treatment(proj_title) or is_excluded_treatment(proj_url):
                        logger.debug(f"Skipping project with excluded treatment: {proj_title} ({proj_url})")
                        continue

                    logger.debug(f"Checking project page: {proj_url}")
                    psoup = self.fetch_page(proj_url)
                    self._sleep_politely()
                    if not psoup:
                        continue

                    # Check page heading/title for excluded treatments
                    h1 = psoup.find("h1")
                    page_title = (h1.get_text(strip=True) if h1 else (psoup.title.string if psoup.title else proj_title))
                    page_title = re.sub(r"\s*[—–|-]\s*Monsterwraps.*$", "", page_title, flags=re.IGNORECASE).strip()

                    if is_excluded_treatment(page_title):
                        logger.debug(f"Skipping project with excluded treatment in page title: '{page_title}'")
                        continue

                    # Check for sliders or direct pairs on project page
                    p_pairs = self.extract_pairs_from_html(psoup, base_url=proj_url, shop_name=name)
                    if not p_pairs:
                        # Extract distinct images from the project gallery with metadata for full-shot ranking
                        distinct_candidates: List[Tuple[str, str]] = []  # (url, alt)
                        seen_slugs = set()
                        for pimg in psoup.find_all("img"):
                            p_src = self._extract_image_url_from_element(pimg, proj_url)
                            if not p_src or not p_src.startswith("http") or "logo" in p_src.lower():
                                continue
                            slug = p_src.split("?")[0].split("/")[-1]
                            if slug not in seen_slugs:
                                seen_slugs.add(slug)
                                p_alt = (pimg.get("alt") if hasattr(pimg, "get") else "") or slug
                                distinct_candidates.append((p_src, p_alt))

                        if len(distinct_candidates) >= 2:
                            # Download candidates and score them to prefer full-car / full-panel shots over tight crops
                            downloaded_ranked = []
                            for cand_url, cand_alt in distinct_candidates[:6]:
                                cand_img = download_image(cand_url, user_agent=self.user_agent)
                                if cand_img and validate_image_dimensions(cand_img):
                                    score, _ = is_likely_full_shot(cand_img, cand_alt + " " + cand_url)
                                    downloaded_ranked.append((score, cand_img))
                                self._sleep_politely()

                            # Sort by full-shot likelihood score descending
                            downloaded_ranked.sort(key=lambda x: x[0], reverse=True)

                            if len(downloaded_ranked) >= 2:
                                im_b = downloaded_ranked[0][1]
                                im_a = downloaded_ranked[1][1]
                                p_pairs.append((im_b, im_a, f"{name}: {page_title}"[:150], "shop_project_showcase"))

                    for img_before, img_after, title, method in p_pairs:
                        if collected >= target_count:
                            break

                        if is_excluded_treatment(title):
                            logger.info(f"Skipping pair due to excluded treatment: '{title}'")
                            continue

                        is_dup, reason = self.dedup_index.is_invalid_or_duplicate(img_before, img_after)
                        if is_dup:
                            logger.debug(f"Skipping project candidate: {reason}")
                            duplicates_skipped += 1
                            continue

                        # Automated Claude Vision validation check
                        vision_info = None
                        if self.vision_validator and self.vision_validator.is_available():
                            v_res = self.vision_validator.validate_pair(img_before, img_after, pair_title=title)
                            vision_info = v_res
                            if not v_res.get("passed", False):
                                logger.info(f"Vision validation REJECTED '{title[:40]}': {v_res.get('reason')}")
                                continue

                        extra = {
                            "shop_category": shop.get("category"),
                            "region": shop.get("region"),
                        }
                        if vision_info:
                            extra["vision_validation"] = vision_info

                        pair_id, meta = self.storage.save_pair(
                            img_before=img_before,
                            img_after=img_after,
                            title=title,
                            source_url=proj_url,
                            source_type="shop_portfolio",
                            author=name,
                            extraction_method=method,
                            extra_info=extra,
                        )

                        self.dedup_index.add_pair(
                            pair_id=pair_id,
                            hashes_before={"phash": meta["hashes"]["phash_before"], "dhash": meta["hashes"]["dhash_before"]},
                            hashes_after={"phash": meta["hashes"]["phash_after"], "dhash": meta["hashes"]["dhash_after"]},
                        )

                        collected += 1
                        logger.info(f"Saved project pair #{pair_id} ('{title}') [{collected}/{target_count}]")

        logger.info(
            f"Shop portfolio collection finished. Collected {collected} pairs, skipped {duplicates_skipped} duplicates."
        )
        return collected

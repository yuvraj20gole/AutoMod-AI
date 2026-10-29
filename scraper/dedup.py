"""Perceptual hashing and deduplication module for car photo pairs."""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple
from PIL import Image
import imagehash

from scraper.config import PHASH_HAMMING_THRESHOLD, IDENTICAL_PAIR_THRESHOLD

logger = logging.getLogger("scraper.dedup")


class PerceptualDedupIndex:
    """Maintains an index of perceptual hashes (pHash and dHash) to detect near-duplicate images."""

    def __init__(self, hamming_threshold: int = PHASH_HAMMING_THRESHOLD):
        self.hamming_threshold = hamming_threshold
        # Key: pair_id, Value: dict of { "phash_before": ..., "phash_after": ..., "dhash_before": ..., ... }
        self.indexed_pairs: Dict[str, Dict[str, str]] = {}

    @staticmethod
    def compute_hashes(img: Image.Image) -> Dict[str, str]:
        """Compute pHash and dHash for a PIL Image."""
        # Convert to RGB if needed
        if img.mode != "RGB":
            img = img.convert("RGB")
        ph = str(imagehash.phash(img))
        dh = str(imagehash.dhash(img))
        return {
            "phash": ph,
            "dhash": dh,
        }

    @staticmethod
    def hamming_distance(hash1_str: str, hash2_str: str) -> int:
        """Compute hamming distance between two hex hash strings."""
        try:
            h1 = imagehash.hex_to_hash(hash1_str)
            h2 = imagehash.hex_to_hash(hash2_str)
            return h1 - h2
        except Exception:
            return 999

    def load_from_metadata(self, metadata_list: List[dict]) -> int:
        """Populate hash index from an existing list of metadata records."""
        count = 0
        for item in metadata_list:
            pair_id = item.get("pair_id")
            hashes = item.get("hashes", {})
            if pair_id and ("phash_before" in hashes or "phash_after" in hashes):
                self.indexed_pairs[pair_id] = hashes
                count += 1
        logger.info(f"Loaded {count} existing pairs into perceptual dedup index.")
        return count

    def is_invalid_or_duplicate(
        self,
        img_before: Image.Image,
        img_after: Image.Image,
    ) -> Tuple[bool, Optional[str]]:
        """
        Check:
        1. If img_before is virtually identical to img_after (not a real modification pair).
        2. If either image matches an already indexed pair (near-duplicate from another post).
        
        Returns:
            (is_duplicate_or_invalid, reason_string)
        """
        try:
            hashes_b = self.compute_hashes(img_before)
            hashes_a = self.compute_hashes(img_after)
        except Exception as e:
            return True, f"Failed to compute image hashes: {e}"

        # 1. Check self-similarity (before == after)
        self_dist = self.hamming_distance(hashes_b["phash"], hashes_a["phash"])
        if self_dist <= IDENTICAL_PAIR_THRESHOLD:
            return True, f"Before and After images are virtually identical (pHash distance: {self_dist})"

        # 2. Check against indexed pairs
        for existing_id, hashes in self.indexed_pairs.items():
            ex_b = hashes.get("phash_before")
            ex_a = hashes.get("phash_after")

            if ex_b:
                dist_bb = self.hamming_distance(hashes_b["phash"], ex_b)
                dist_ba = self.hamming_distance(hashes_b["phash"], ex_a or "")
                if dist_bb <= self.hamming_threshold or dist_ba <= self.hamming_threshold:
                    return True, f"Before image is duplicate of existing pair {existing_id} (distance: {min(dist_bb, dist_ba)})"

            if ex_a:
                dist_ab = self.hamming_distance(hashes_a["phash"], ex_b or "")
                dist_aa = self.hamming_distance(hashes_a["phash"], ex_a)
                if dist_ab <= self.hamming_threshold or dist_aa <= self.hamming_threshold:
                    return True, f"After image is duplicate of existing pair {existing_id} (distance: {min(dist_ab, dist_aa)})"

        return False, None

    def add_pair(
        self,
        pair_id: str,
        hashes_before: Dict[str, str],
        hashes_after: Dict[str, str],
    ) -> None:
        """Register a new pair's hashes in the index."""
        self.indexed_pairs[pair_id] = {
            "phash_before": hashes_before["phash"],
            "dhash_before": hashes_before["dhash"],
            "phash_after": hashes_after["phash"],
            "dhash_after": hashes_after["dhash"],
        }

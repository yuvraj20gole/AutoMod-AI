"""Storage and metadata management for collected before/after car pairs."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image

from scraper.config import (
    DATASET_ROOT,
    DATASET_METADATA_JSON,
    DATASET_METADATA_JSONL,
)
from scraper.dedup import PerceptualDedupIndex

logger = logging.getLogger("scraper.storage")


class DatasetStorage:
    """Manages reading, saving, and indexing before/after image pairs and their metadata."""

    def __init__(self, output_dir: Optional[Path] = None):
        self.output_dir = Path(output_dir) if output_dir else DATASET_ROOT
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.output_dir / "metadata.json"
        self.metadata_jsonl = self.output_dir / "metadata.jsonl"
        self.metadata: List[Dict[str, Any]] = self._load_metadata()

    def _load_metadata(self) -> List[Dict[str, Any]]:
        """Load existing metadata.json if present."""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        return data
            except Exception as e:
                logger.warning(f"Could not parse existing metadata.json: {e}")
        return []

    def get_existing_metadata(self) -> List[Dict[str, Any]]:
        """Return in-memory metadata list."""
        return self.metadata

    def get_next_pair_id(self) -> str:
        """Find the next 4-digit sequential ID (e.g. '0001', '0002')."""
        existing_ids = set()
        for item in self.metadata:
            pid = item.get("pair_id")
            if pid and pid.isdigit():
                existing_ids.add(int(pid))

        # Also check on disk for any existing 0001_before.jpg files
        for f in self.output_dir.glob("*_before.jpg"):
            prefix = f.name.split("_")[0]
            if prefix.isdigit():
                existing_ids.add(int(prefix))

        next_num = 1
        while next_num in existing_ids:
            next_num += 1

        return f"{next_num:04d}"

    def save_pair(
        self,
        img_before: Image.Image,
        img_after: Image.Image,
        title: str,
        source_url: str,
        source_type: str,
        author: Optional[str] = None,
        subreddit: Optional[str] = None,
        extraction_method: str = "gallery",
        extra_info: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Save before and after images to disk and append metadata.
        Returns (pair_id, metadata_record).
        """
        pair_id = self.get_next_pair_id()
        before_filename = f"{pair_id}_before.jpg"
        after_filename = f"{pair_id}_after.jpg"

        before_path = self.output_dir / before_filename
        after_path = self.output_dir / after_filename

        # Save images as high quality RGB JPEGs
        img_before.save(before_path, format="JPEG", quality=92, optimize=True)
        img_after.save(after_path, format="JPEG", quality=92, optimize=True)

        # Compute perceptual hashes
        hashes_b = PerceptualDedupIndex.compute_hashes(img_before)
        hashes_a = PerceptualDedupIndex.compute_hashes(img_after)

        metadata_record: Dict[str, Any] = {
            "pair_id": pair_id,
            "title": title.strip(),
            "source_type": source_type,
            "source_url": source_url,
            "subreddit": subreddit,
            "author": author,
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "extraction_method": extraction_method,
            "filenames": {
                "before": before_filename,
                "after": after_filename,
            },
            "dimensions": {
                "before": [img_before.width, img_before.height],
                "after": [img_after.width, img_after.height],
            },
            "hashes": {
                "phash_before": hashes_b["phash"],
                "dhash_before": hashes_b["dhash"],
                "phash_after": hashes_a["phash"],
                "dhash_after": hashes_a["dhash"],
            },
            "review_status": "pending",  # pending | approved | rejected | needs_swap
            "review_notes": "",
        }

        if extra_info:
            metadata_record.update(extra_info)

        self.metadata.append(metadata_record)
        self._persist_metadata()

        return pair_id, metadata_record

    def _persist_metadata(self) -> None:
        """Write metadata atomically to metadata.json and append to metadata.jsonl."""
        # 1. Write metadata.json atomically
        temp_file = self.metadata_file.with_suffix(".tmp")
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self.metadata, f, indent=2, ensure_ascii=False)
            temp_file.replace(self.metadata_file)
        except Exception as e:
            logger.error(f"Failed to write metadata.json: {e}")

        # 2. Re-write metadata.jsonl
        try:
            with open(self.metadata_jsonl, "w", encoding="utf-8") as f:
                for item in self.metadata:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.error(f"Failed to write metadata.jsonl: {e}")

    def get_summary(self) -> Dict[str, Any]:
        """Return statistics on collected dataset."""
        sources: Dict[str, int] = {}
        for item in self.metadata:
            s = item.get("source_type", "unknown")
            sources[s] = sources.get(s, 0) + 1

        return {
            "total_pairs": len(self.metadata),
            "sources_breakdown": sources,
            "output_directory": str(self.output_dir),
        }

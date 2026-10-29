"""Main CLI entrypoint for the AutoMod AI Before/After Car Dataset Scraper."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

# Ensure project root is on sys.path for direct script execution
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scraper.benchmark_seed import load_seed_benchmark_pairs
from scraper.config import (
    DATASET_ROOT,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_SUBREDDITS,
)
from scraper.dedup import PerceptualDedupIndex
from scraper.reddit_collector import RedditPairCollector
from scraper.review_generator import generate_review_html
from scraper.shop_collector import ShopPortfolioCollector
from scraper.storage import DatasetStorage
from scraper.vision_validator import VisionPairValidator


def setup_logging(verbose: bool = False) -> None:
    """Configure structured logging output."""
    level = logging.DEBUG if verbose else logging.INFO
    format_str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(level=level, format=format_str, datefmt="%H:%M:%S")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AutoMod AI — Collect real before/after car modification photo pairs for AI training & fine-tuning."
    )
    parser.add_argument(
        "--source",
        choices=["all", "reddit", "shops"],
        default="all",
        help="Data source to scrape (default: all)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=15,
        help="Target number of before/after pairs to collect (default: 15)",
    )
    parser.add_argument(
        "--test-batch",
        action="store_true",
        help="Run a small test batch (10-20 pairs) for manual quality review",
    )
    parser.add_argument(
        "--seed-samples",
        action="store_true",
        help="Ingest curated benchmark test pairs directly into dataset",
    )
    parser.add_argument(
        "--subreddits",
        type=str,
        default="",
        help="Comma-separated list of custom subreddits to search",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(DATASET_ROOT),
        help=f"Output directory for pairs & metadata (default: {DATASET_ROOT})",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=DEFAULT_REQUEST_DELAY,
        help=f"Polite delay between HTTP requests in seconds (default: {DEFAULT_REQUEST_DELAY})",
    )
    parser.add_argument(
        "--no-split",
        action="store_true",
        help="Disable automatic splitting of side-by-side or stacked collage images",
    )
    parser.add_argument(
        "--audit-existing",
        action="store_true",
        help="Run Claude Vision validation retroactively on all existing dataset pairs and update metadata",
    )
    parser.add_argument(
        "--generate-review-only",
        action="store_true",
        help="Only regenerate the dataset/before-after-pairs/review.html viewer and exit",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose debug logging",
    )

    args = parser.parse_args()
    setup_logging(args.verbose)
    logger = logging.getLogger("scraper.main")

    output_dir = Path(args.output_dir)
    storage = DatasetStorage(output_dir=output_dir)

    if args.generate_review_only:
        review_path = generate_review_html(storage=storage, output_path=output_dir / "review.html")
        print(f"\n[✓] Generated interactive review tool at: {review_path.resolve()}")
        return

    # Retroactive Claude Vision Audit on existing dataset
    if args.audit_existing:
        print("=" * 70)
        print("  AutoMod AI — Retroactive Claude Vision Audit")
        print("=" * 70)
        validator = VisionPairValidator()
        if not validator.is_available():
            print("[✗] Error: ANTHROPIC_API_KEY is not set or client could not be initialized.")
            sys.exit(1)

        metadata = storage.get_existing_metadata()
        print(f"Auditing {len(metadata)} existing dataset pairs with Claude Vision ({validator.model})...\n")

        passed_count = 0
        failed_count = 0

        from PIL import Image

        for idx, item in enumerate(metadata, 1):
            pair_id = item.get("pair_id")
            title = item.get("title", f"Pair #{pair_id}")
            filenames = item.get("filenames", {})
            b_name = filenames.get("before", f"{pair_id}_before.jpg")
            a_name = filenames.get("after", f"{pair_id}_after.jpg")

            b_path = output_dir / b_name
            a_path = output_dir / a_name

            if not b_path.exists() or not a_path.exists():
                print(f"[{idx}/{len(metadata)}] #{pair_id}: [SKIP] Missing image files on disk.")
                continue

            try:
                img_b = Image.open(b_path)
                img_a = Image.open(a_path)

                result = validator.validate_pair(img_b, img_a, pair_title=title)
                item["vision_validation"] = result

                if result.get("passed", False):
                    passed_count += 1
                    # Keep pending for human review or leave as approved
                    if item.get("review_status") == "rejected":
                        pass
                    print(f"[{idx}/{len(metadata)}] #{pair_id}: [PASS] {result.get('reason')}")
                else:
                    failed_count += 1
                    # Auto-reject failed pairs
                    item["review_status"] = "rejected"
                    item["review_notes"] = f"Auto-rejected by Claude Vision: {result.get('reason')}"
                    print(f"[{idx}/{len(metadata)}] #{pair_id}: [FAIL -> REJECTED] {result.get('reason')}")

            except Exception as e:
                print(f"[{idx}/{len(metadata)}] #{pair_id}: [ERROR] {e}")

        # Persist updated metadata
        storage._persist_metadata()
        review_path = generate_review_html(storage=storage, output_path=output_dir / "review.html")

        print("\n" + "=" * 70)
        print("  VISION AUDIT COMPLETE")
        print("=" * 70)
        print(f"Total Audited  : {len(metadata)}")
        print(f"Passed         : {passed_count}")
        print(f"Auto-Rejected  : {failed_count}")
        print(f"Review Tool    : {review_path.resolve()}")
        print("=" * 70)
        return

    # If test batch flag is passed, enforce limit
    target_limit = 15 if args.test_batch else args.limit

    print("=" * 70)
    print("  AutoMod AI — Before/After Car Photo Pair Scraper")
    print("=" * 70)
    print(f"Target Limit : {target_limit} pairs")
    print(f"Source       : {args.source}")
    print(f"Output Dir   : {output_dir.resolve()}")
    print(f"Delay        : {args.delay}s (with jitter & robots.txt compliance)")
    print(f"Dedup        : Enabled (pHash & dHash perceptual distance check)")
    print("=" * 70)

    # Initialize perceptual deduplication index with any existing records
    dedup_index = PerceptualDedupIndex()
    existing_count = dedup_index.load_from_metadata(storage.get_existing_metadata())
    if existing_count > 0:
        logger.info(f"Dataset already has {existing_count} pairs. New collections will append and dedup against them.")

    total_collected_this_run = 0
    subs = [s.strip() for s in args.subreddits.split(",") if s.strip()] or DEFAULT_SUBREDDITS

    # 0. Check explicit seed samples request
    if args.seed_samples:
        seed_collected = load_seed_benchmark_pairs(
            storage=storage,
            dedup_index=dedup_index,
            limit=target_limit,
        )
        total_collected_this_run += seed_collected

    # 1. Source 1: Reddit via official PRAW API
    if args.source in ["all", "reddit"] and total_collected_this_run < target_limit and not args.seed_samples:
        reddit_collector = RedditPairCollector(
            storage=storage,
            dedup_index=dedup_index,
            request_delay=args.delay,
            allow_split_collages=not args.no_split,
        )

        has_reddit_creds = bool(os.getenv("REDDIT_CLIENT_ID") and os.getenv("REDDIT_CLIENT_SECRET"))
        if not has_reddit_creds:
            print("\n[!] Notice: REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not detected in environment or .env.")
            print("    To enable Reddit collection via PRAW:")
            print("    1. Create a script app at https://www.reddit.com/prefs/apps")
            print("    2. Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT to your .env or .env.local file.")
            if args.source == "reddit":
                print("    Aborting Reddit-only run. Exiting.")
                sys.exit(1)
            else:
                print("    Proceeding with available sources / test batch...")
                if args.test_batch and total_collected_this_run == 0:
                    seed_collected = load_seed_benchmark_pairs(
                        storage=storage,
                        dedup_index=dedup_index,
                        limit=target_limit,
                    )
                    total_collected_this_run += seed_collected
        else:
            needed = target_limit - total_collected_this_run
            reddit_collected = reddit_collector.collect(target_count=needed, subreddits=subs)
            total_collected_this_run += reddit_collected

    # 2. Source 2: Curated Car Wrap/Mod Shop Portfolios
    if args.source in ["all", "shops"] and total_collected_this_run < target_limit and not args.seed_samples:
        shop_collector = ShopPortfolioCollector(
            storage=storage,
            dedup_index=dedup_index,
            request_delay=args.delay,
            allow_split_collages=not args.no_split,
        )
        needed = target_limit - total_collected_this_run
        shop_collected = shop_collector.collect(target_count=needed)
        total_collected_this_run += shop_collected

    # Generate the visual review HTML page
    review_path = generate_review_html(storage=storage, output_path=output_dir / "review.html")

    # Print Final Summary
    summary = storage.get_summary()
    print("\n" + "=" * 70)
    print("  COLLECTION RUN COMPLETED")
    print("=" * 70)
    print(f"Pairs collected this run : {total_collected_this_run}")
    print(f"Total pairs in dataset   : {summary['total_pairs']}")
    print(f"Sources breakdown        : {summary['sources_breakdown']}")
    print(f"Dataset directory        : {output_dir.resolve()}")
    print(f"Metadata file            : {(output_dir / 'metadata.json').resolve()}")
    print(f"Interactive Review Tool  : {review_path.resolve()}")
    print("-" * 70)
    print("To review the collected test batch, open the interactive review tool:")
    print(f"  open \"{review_path.resolve()}\"")
    print("=" * 70)


if __name__ == "__main__":
    main()

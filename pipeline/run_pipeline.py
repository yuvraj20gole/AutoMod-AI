#!/usr/bin/env python3
"""Orchestrate AutoMod AI dataset pipeline: CompCars -> source pack -> wheel masks."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def run_step(cmd: list[str], description: str) -> None:
    print(f"\n>>> {description}")
    print("    " + " ".join(cmd))
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        raise SystemExit(f"Step failed: {description}")


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoMod AI dataset pipeline orchestrator")
    parser.add_argument(
        "--part",
        choices=["1", "2", "3", "all"],
        default="1",
        help="1=CompCars, 2=export Colab source pack, 3=CompCars wheel masks",
    )
    parser.add_argument("--test-batch", type=int, default=20, help="Source pack size for Part 2")
    parser.add_argument("--mask-limit", type=int, default=40, help="Part 3 image count (0=all)")
    parser.add_argument("--skip-download", action="store_true", help="Part 1: use existing kagglehub cache")
    args = parser.parse_args()

    py = sys.executable

    if args.part in ("1", "all"):
        cmd = [py, "pipeline/download_compcars.py"]
        if args.skip_download:
            cmd.append("--skip-download")
        run_step(cmd, "Part 1 — CompCars download & organization")

    if args.part in ("2", "all"):
        run_step(
            [py, "pipeline/export_source_pack.py", "--batch-size", str(args.test_batch)],
            f"Part 2 prep — export {args.test_batch}-image source pack for Colab",
        )
        print("\nNext: upload pipeline/colab_generate_synthetic_pairs.ipynb to Colab (T4 GPU),")
        print("upload dataset/synthetic-source-pack.zip, Runtime → Run all, download synthetic-pairs-v2.zip.")

    if args.part in ("3", "all"):
        run_step(
            [py, "pipeline/segment_cars.py", "--limit", str(args.mask_limit)],
            f"Part 3 — CompCars wheel masks (limit={args.mask_limit})",
        )
        print("\nOpen dataset/compcars/masks/preview.html and check the red wheel overlays.")

    print("\nPipeline step(s) complete.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Print mean Lab delta vs original before/after post-processing (no model).

Uses sample pairs under inference/qwen/samples/ (or paths passed on CLI).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from postprocess import mean_abs_lab_delta, postprocess  # noqa: E402


def one_pair(original: Path, raw: Path, label: str) -> None:
    orig = Image.open(original).convert("RGB")
    edit = Image.open(raw).convert("RGB")
    before = mean_abs_lab_delta(edit, orig)
    fixed = postprocess(orig, edit, stem=label)
    after = mean_abs_lab_delta(fixed, orig)
    print(f"{label}: mean |ΔLab| before={before:.3f}  after={after:.3f}  Δ={before - after:+.3f}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--original", type=Path, default=HERE / "samples/original_rear34.png")
    p.add_argument(
        "--raw",
        type=Path,
        nargs="*",
        default=[
            HERE / "samples/raw_lip_spoiler.png",
            HERE / "samples/raw_ducktail.png",
        ],
    )
    args = p.parse_args()
    if not args.original.is_file():
        print(f"missing original {args.original}", file=sys.stderr)
        return 2
    for raw in args.raw:
        if not raw.is_file():
            print(f"skip missing {raw}", file=sys.stderr)
            continue
        one_pair(args.original, raw, raw.stem)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

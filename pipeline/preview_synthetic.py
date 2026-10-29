"""Generate a simple HTML preview page for synthetic before/after pairs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.config import SYNTHETIC_PAIRS_ROOT

# Keys required by this preview (must match pipeline + Colab notebook output)
REQUIRED_TOP_KEYS = ("pair_id", "filenames")
REQUIRED_FILENAME_KEYS = ("before", "after")


def _normalize_row(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    """
    Normalize one metadata row to the canonical schema.

    Canonical keys (written by generate_synthetic_pairs.py + Colab v2 notebook):
      pair_id, filenames.before, filenames.after, modification_category, modification_change
    Legacy v1 sometimes used `id` instead of `pair_id` — accept that as a fallback only.
    """
    if not isinstance(item, dict):
        raise ValueError(f"metadata[{index}] must be an object, got {type(item).__name__}")

    pair_id = item.get("pair_id") or item.get("id")
    if not pair_id:
        raise KeyError(
            f"metadata[{index}] missing pair_id (and no legacy id). "
            "Re-export from the v2 Colab notebook so metadata.json includes pair_id."
        )

    filenames = item.get("filenames")
    if not isinstance(filenames, dict):
        raise KeyError(
            f"metadata[{index}] (pair_id={pair_id!r}) missing filenames.{{before,after}}. "
            "Re-export from the v2 Colab notebook."
        )
    for key in REQUIRED_FILENAME_KEYS:
        if not filenames.get(key):
            raise KeyError(
                f"metadata[{index}] (pair_id={pair_id!r}) missing filenames.{key}"
            )

    return {
        "pair_id": str(pair_id),
        "before": filenames["before"],
        "after": filenames["after"],
        "modification_category": item.get("modification_category", "?"),
        "modification_change": item.get("modification_change", "?"),
    }


def generate_preview(output_dir: Path) -> Path:
    meta_path = output_dir / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"No metadata.json in {output_dir}")

    raw = json.loads(meta_path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("metadata.json must be a JSON array of pair objects")

    cards: List[str] = []
    for i, item in enumerate(raw):
        row = _normalize_row(item, i)
        before_path = output_dir / row["before"]
        after_path = output_dir / row["after"]
        if not before_path.exists():
            raise FileNotFoundError(f"Missing before image for #{row['pair_id']}: {before_path}")
        if not after_path.exists():
            raise FileNotFoundError(f"Missing after image for #{row['pair_id']}: {after_path}")

        cards.append(f"""
        <div class="card">
          <h3>#{row['pair_id']} — {row['modification_category']}: {row['modification_change']}</h3>
          <div class="imgs">
            <figure><img src="{row['before']}" alt="before"><figcaption>Before</figcaption></figure>
            <figure><img src="{row['after']}" alt="after"><figcaption>After</figcaption></figure>
          </div>
        </div>""")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Synthetic Pairs Preview</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #0f1117; color: #e5e7eb; padding: 24px; }}
    h1 {{ margin-bottom: 8px; }}
    .sub {{ color: #94a3b8; margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 20px; }}
    .card {{ background: #1a1d27; border: 1px solid #2d3348; border-radius: 12px; padding: 16px; }}
    .imgs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
    img {{ width: 100%; border-radius: 8px; background: #000; }}
    figcaption {{ font-size: 12px; color: #94a3b8; margin-top: 4px; }}
  </style>
</head>
<body>
  <h1>Synthetic Before/After Preview</h1>
  <p class="sub">{len(cards)} pairs — review quality before scaling to full batch</p>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>"""

    out = output_dir / "preview.html"
    out.write_text(html, encoding="utf-8")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=str, default=str(SYNTHETIC_PAIRS_ROOT))
    args = parser.parse_args()
    path = generate_preview(Path(args.output))
    print(f"Preview written to {path.resolve()}")


if __name__ == "__main__":
    main()

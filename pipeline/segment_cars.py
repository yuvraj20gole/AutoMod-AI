"""Part 3 — CompCars wheel masks (windows saved as a free extra from the same model).

Synthetic-pair masking is deferred until paint/wrap v2 lands.
Wheels stay parked for InstructPix2Pix; these masks feed ControlNet+inpaint later.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.compcars_utils import CompCarsLabel, select_source_images
from pipeline.config import COMPCARS_DATA, COMPCARS_MASKS_ROOT, SEGMENTATION_MASK_SUFFIX, SOURCE_VIEWPOINTS
from pipeline.wheel_segmenter import WheelSegmenter, overlay_wheels, result_record

logger = logging.getLogger("pipeline.segment_cars")


def _mask_paths(masks_root: Path, rel_path: str) -> Dict[str, Path]:
    stem = Path(rel_path).with_suffix("").as_posix()
    wheels = masks_root / "wheels" / f"{stem}{SEGMENTATION_MASK_SUFFIX}"
    windows = masks_root / "windows" / f"{stem}_windows.png"
    overlay = masks_root / "overlays" / f"{stem}_overlay.jpg"
    return {"wheels": wheels, "windows": windows, "overlay": overlay}


def _save_png(path: Path, arr) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(path)


def write_preview(masks_root: Path, records: List[Dict[str, Any]], limit: int = 40) -> Path:
    cards = []
    for rec in records[:limit]:
        rel = rec["rel_path"]
        paths = _mask_paths(masks_root, rel)
        ov = paths["overlay"].relative_to(masks_root).as_posix()
        wh = paths["wheels"].relative_to(masks_root).as_posix()
        cards.append(
            f"""
        <div class="card">
          <h3>{rel}</h3>
          <p>{rec.get('n_wheel_detections', rec['n_wheels'])} wheel det(s) · {rec['n_wheels']} blob(s) · {rec['n_windows']} window(s) · {rec['backend']}</p>
          <div class="imgs">
            <figure><img src="{ov}" alt="overlay"><figcaption>Overlay</figcaption></figure>
            <figure><img src="{wh}" alt="mask"><figcaption>Wheel mask</figcaption></figure>
          </div>
        </div>"""
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CompCars wheel masks</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #111; color: #eee; padding: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); gap: 16px; }}
    .card {{ background: #1b1b1b; padding: 12px; border: 1px solid #333; }}
    .imgs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }}
    img {{ width: 100%; background: #000; }}
    p, figcaption {{ color: #aaa; font-size: 13px; }}
  </style>
</head>
<body>
  <h1>CompCars wheel masks</h1>
  <p>{len(records)} images — red overlay = predicted wheels</p>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>"""
    out = masks_root / "preview.html"
    out.write_text(html, encoding="utf-8")
    return out


def segment_compcars(
    data_root: Path,
    masks_root: Path,
    limit: int,
    viewpoints: set[str],
    save_windows: bool = True,
) -> Dict[str, Any]:
    sources: List[CompCarsLabel] = select_source_images(
        data_root, limit=limit if limit > 0 else 10**9, viewpoints=viewpoints
    )
    if not sources:
        raise SystemExit(f"No CompCars sources under {data_root} for viewpoints {viewpoints}")

    segmenter = WheelSegmenter()
    records: List[Dict[str, Any]] = []
    n_with_wheels = 0
    n_hough = 0

    for i, label in enumerate(sources):
        img_path = data_root / "image" / label.rel_path
        if not img_path.exists():
            logger.warning("Missing image %s", img_path)
            continue
        image = Image.open(img_path).convert("RGB")
        result = segmenter.segment(image, vehicle_bbox=label.bbox)
        paths = _mask_paths(masks_root, label.rel_path)
        _save_png(paths["wheels"], result.wheels)
        if save_windows:
            _save_png(paths["windows"], result.windows)
        overlay = overlay_wheels(image, result.wheels)
        paths["overlay"].parent.mkdir(parents=True, exist_ok=True)
        overlay.save(paths["overlay"], quality=88)

        rec = result_record(
            label.rel_path,
            result,
            extra={
                "viewpoint": label.viewpoint,
                "bbox": list(label.bbox),
                "mask": paths["wheels"].relative_to(masks_root).as_posix(),
                "overlay": paths["overlay"].relative_to(masks_root).as_posix(),
            },
        )
        records.append(rec)
        if result.n_wheel_detections > 0 or result.n_wheels > 0:
            n_with_wheels += 1
        if result.backend == "hough_fallback":
            n_hough += 1
        logger.info(
            "[%d/%d] %s — %d det / %d blob via %s",
            i + 1,
            len(sources),
            label.rel_path,
            result.n_wheel_detections,
            result.n_wheels,
            result.backend,
        )

    index: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_root": str(data_root),
        "masks_root": str(masks_root),
        "limit": limit,
        "viewpoints": sorted(viewpoints),
        "n_images": len(records),
        "n_with_wheels": n_with_wheels,
        "n_hough_fallback": n_hough,
        "wheel_hit_rate": round(n_with_wheels / max(1, len(records)), 3),
        "records": records,
    }
    masks_root.mkdir(parents=True, exist_ok=True)
    (masks_root / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    preview = write_preview(masks_root, records)
    index["preview"] = str(preview)
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate CompCars wheel masks (Part 3)")
    parser.add_argument("--compcars-data", type=str, default=str(COMPCARS_DATA))
    parser.add_argument("--output", type=str, default=str(COMPCARS_MASKS_ROOT))
    parser.add_argument(
        "--limit",
        type=int,
        default=40,
        help="How many diverse front-3/4 + side images to mask (0 = all matching)",
    )
    parser.add_argument(
        "--viewpoints",
        nargs="+",
        default=sorted(SOURCE_VIEWPOINTS),
        help="CompCars viewpoints to include",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    print("=" * 70)
    print("  AutoMod AI — Part 3 wheel masks (CompCars)")
    print("=" * 70)
    print("Synthetic-pair masking: deferred until paint/wrap v2")
    print(f"Limit: {args.limit or 'ALL'} | viewpoints: {args.viewpoints}")
    print("=" * 70)

    index = segment_compcars(
        data_root=Path(args.compcars_data),
        masks_root=Path(args.output),
        limit=args.limit,
        viewpoints=set(args.viewpoints),
    )
    print(f"\nImages        : {index['n_images']}")
    print(f"With wheels   : {index['n_with_wheels']} ({index['wheel_hit_rate']*100:.1f}%)")
    print(f"Hough fallback: {index['n_hough_fallback']}")
    print(f"Index         : {Path(args.output) / 'index.json'}")
    print(f"Preview       : {index['preview']}")
    print("Open the preview in a browser and check the red overlays before scaling.")


if __name__ == "__main__":
    main()

"""Export a compact CompCars source pack for Google Colab (no full dataset upload)."""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import zipfile
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.compcars_utils import select_source_images
from pipeline.config import (
    COMPCARS_DATA,
    DEFAULT_TEST_BATCH_SIZE,
    INSTRUCT_PIX2PIX_GUIDANCE,
    INSTRUCT_PIX2PIX_IMAGE_GUIDANCE,
    INSTRUCT_PIX2PIX_RESOLUTION,
    INSTRUCT_PIX2PIX_STEPS,
    SYNTHETIC_BATCH_TAG,
)
from pipeline.instruct_pix2pix import DEFAULT_NEGATIVE_PROMPT
from pipeline.generate_synthetic_pairs import crop_vehicle
from pipeline.modifications import specs_for_batch

logger = logging.getLogger("pipeline.export_source_pack")


def export_pack(
    compcars_data: Path,
    pack_dir: Path,
    batch_size: int = DEFAULT_TEST_BATCH_SIZE,
    seed: int = 42,
    include_wheels: bool = False,
    resolution: int = INSTRUCT_PIX2PIX_RESOLUTION,
) -> Path:
    from pipeline.instruct_pix2pix import center_square_resize

    pack_dir.mkdir(parents=True, exist_ok=True)
    images_dir = pack_dir / "befores"
    images_dir.mkdir(exist_ok=True)

    sources = select_source_images(compcars_data, limit=batch_size * 3)
    if len(sources) < batch_size:
        raise RuntimeError(f"Need {batch_size} sources, found {len(sources)}")

    specs = specs_for_batch(batch_size, seed=seed, include_wheels=include_wheels)
    jobs = []

    for idx, label in enumerate(sources[:batch_size]):
        spec = specs[idx]
        img = Image.open(compcars_data / "image" / label.rel_path).convert("RGB")
        cropped = crop_vehicle(img, label)
        # Export already as 512×512 so Colab before/after stay locked to same geometry
        square = center_square_resize(cropped, resolution)
        out_name = f"{idx:04d}_before.jpg"
        square.save(images_dir / out_name, format="JPEG", quality=92)

        jobs.append(
            {
                "job_index": idx,
                "before_path": f"befores/{out_name}",
                "source_rel_path": label.rel_path,
                "source_viewpoint": label.viewpoint,
                "source_bbox": list(label.bbox),
                "crop": False,
                "already_512": True,
                "modification_category": spec.category,
                "modification_change": spec.change,
                "edit_prompt": spec.prompt,
                "needs_localized_edit": False,
            }
        )

    jobs_path = pack_dir / "jobs.json"
    jobs_path.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

    # Settings stamp for Colab
    (pack_dir / "settings.json").write_text(
        json.dumps(
            {
                "batch_tag": SYNTHETIC_BATCH_TAG,
                "include_wheels": include_wheels,
                "resolution": resolution,
                "image_guidance_scale": INSTRUCT_PIX2PIX_IMAGE_GUIDANCE,
                "guidance_scale": INSTRUCT_PIX2PIX_GUIDANCE,
                "num_inference_steps": INSTRUCT_PIX2PIX_STEPS,
                "batch_size": batch_size,
                "prompt_style": "short_positive_v2",
                "negative_prompt": DEFAULT_NEGATIVE_PROMPT,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    zip_path = pack_dir.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in pack_dir.rglob("*"):
            if f.is_file() and f != zip_path:
                zf.write(f, f.relative_to(pack_dir.parent))

    logger.info("Exported %d sources → %s (%s)", batch_size, pack_dir, zip_path)
    return zip_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Export CompCars source pack for Colab")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_TEST_BATCH_SIZE)
    parser.add_argument("--compcars-data", type=str, default=str(COMPCARS_DATA))
    parser.add_argument(
        "--output",
        type=str,
        default=str(PROJECT_ROOT / "dataset" / "synthetic-source-pack"),
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--include-wheels",
        action="store_true",
        help="Include wheel jobs (default OFF — parked until ControlNet)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)

    pack_dir = Path(args.output)
    if pack_dir.exists():
        shutil.rmtree(pack_dir)

    zip_path = export_pack(
        compcars_data=Path(args.compcars_data),
        pack_dir=pack_dir,
        batch_size=args.batch_size,
        seed=args.seed,
        include_wheels=args.include_wheels,
    )
    print(f"Source pack ready: {zip_path.resolve()}")
    print("Upload this zip to Colab, then run the paint/wrap retune cells.")


if __name__ == "__main__":
    main()

"""Generate synthetic before/after car modification pairs with InstructPix2Pix (diffusers).

Paint/wrap only for this retune round. Wheels parked until ControlNet+masks (Part 3).
Output: always matching 512×512 before/after JPEGs under dataset/synthetic-pairs/.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.compcars_utils import CompCarsLabel, select_source_images
from pipeline.config import (
    COMPCARS_DATA,
    IMAGE_EDIT_MODEL,
    INSTRUCT_PIX2PIX_GUIDANCE,
    INSTRUCT_PIX2PIX_IMAGE_GUIDANCE,
    INSTRUCT_PIX2PIX_RESOLUTION,
    INSTRUCT_PIX2PIX_STEPS,
    SYNTHETIC_PAIRS_ROOT,
    SYNTHETIC_BATCH_TAG,
)
from pipeline.modifications import category_recommendation, specs_for_batch
from pipeline.synthetic_metadata import load_metadata, next_pair_id, save_metadata

logger = logging.getLogger("pipeline.generate_synthetic_pairs")


def crop_vehicle(img: Image.Image, label: CompCarsLabel) -> Image.Image:
    x1, y1, x2, y2 = label.bbox
    w, h = img.size
    pad_x = int((x2 - x1) * 0.05)
    pad_y = int((y2 - y1) * 0.05)
    left = max(0, x1 - pad_x)
    top = max(0, y1 - pad_y)
    right = min(w, x2 + pad_x)
    bottom = min(h, y2 + pad_y)
    return img.crop((left, top, right, bottom))


def generate_pairs(
    compcars_data: Path,
    output_dir: Path,
    batch_size: int = 20,
    model_id: str = IMAGE_EDIT_MODEL,
    seed: int = 42,
    steps: int = INSTRUCT_PIX2PIX_STEPS,
    resolution: int = INSTRUCT_PIX2PIX_RESOLUTION,
    image_guidance_scale: float = INSTRUCT_PIX2PIX_IMAGE_GUIDANCE,
    guidance_scale: float = INSTRUCT_PIX2PIX_GUIDANCE,
    include_wheels: bool = False,
    jobs_json: Optional[Path] = None,
) -> Tuple[int, List[Dict[str, Any]]]:
    from pipeline.instruct_pix2pix import InstructPix2PixEditor, enforce_square

    output_dir.mkdir(parents=True, exist_ok=True)
    befores_dir = output_dir / "befores"
    afters_dir = output_dir / "afters"
    befores_dir.mkdir(exist_ok=True)
    afters_dir.mkdir(exist_ok=True)

    metadata = load_metadata(output_dir)
    specs = specs_for_batch(batch_size, seed=seed, include_wheels=include_wheels)

    jobs: List[Dict[str, Any]] = []
    if jobs_json and jobs_json.exists():
        jobs = json.loads(jobs_json.read_text(encoding="utf-8"))[:batch_size]
        logger.info("Loaded %d jobs from %s", len(jobs), jobs_json)
    else:
        sources = select_source_images(compcars_data, limit=batch_size * 3)
        if len(sources) < batch_size:
            raise RuntimeError(
                f"Not enough CompCars sources ({len(sources)}), need {batch_size}."
            )
        for idx, label in enumerate(sources[:batch_size]):
            spec = specs[idx]
            jobs.append(
                {
                    "source_rel_path": label.rel_path,
                    "source_viewpoint": label.viewpoint,
                    "source_bbox": list(label.bbox),
                    "before_path": str(compcars_data / "image" / label.rel_path),
                    "crop": True,
                    "bbox": list(label.bbox),
                    "modification_category": spec.category,
                    "modification_change": spec.change,
                    "edit_prompt": spec.prompt,
                    "needs_localized_edit": spec.needs_localized_edit,
                }
            )

    editor = InstructPix2PixEditor(
        model_id=model_id,
        num_inference_steps=steps,
        resolution=resolution,
        image_guidance_scale=image_guidance_scale,
        guidance_scale=guidance_scale,
    )

    generated: List[Dict[str, Any]] = []
    timings: List[float] = []

    for idx, job in enumerate(jobs):
        pair_id = next_pair_id(metadata + generated)
        category = job["modification_category"]
        change = job["modification_change"]
        prompt = job["edit_prompt"]

        before_path = Path(job["before_path"])
        if not before_path.is_absolute() and jobs_json:
            before_path = jobs_json.parent / before_path

        before_raw = Image.open(before_path).convert("RGB")
        if job.get("crop") and job.get("bbox"):
            bbox = tuple(job["bbox"])
            dummy = CompCarsLabel(
                rel_path=job.get("source_rel_path", ""),
                viewpoint_code=0,
                viewpoint=job.get("source_viewpoint", "unknown"),
                bbox=bbox,  # type: ignore[arg-type]
                make_id="",
                model_id="",
                year="",
                filename="",
            )
            if before_raw.width > 600 or before_raw.height > 400:
                before_raw = crop_vehicle(before_raw, dummy)

        # Canonical square before — same tensor geometry fed to the model
        before_sq = editor.prepare_before(before_raw)

        logger.info("[%d/%d] #%s — %s / %s", idx + 1, len(jobs), pair_id, category, change)

        t0 = time.perf_counter()
        try:
            after_sq = editor.edit(before_sq, prompt, seed=seed + idx)
        except Exception as exc:
            logger.error("Failed pair #%s: %s", pair_id, exc)
            continue
        elapsed = time.perf_counter() - t0
        timings.append(elapsed)

        # Hard size assert — this was the v1 Colab bug
        before_sq = enforce_square(before_sq, resolution)
        after_sq = enforce_square(after_sq, resolution)
        assert before_sq.size == after_sq.size == (resolution, resolution), (
            f"Size mismatch: before={before_sq.size} after={after_sq.size}"
        )
        logger.info("  done in %.1fs | size=%s", elapsed, after_sq.size)

        before_name = f"{pair_id}_before.jpg"
        after_name = f"{pair_id}_after.jpg"
        # Flat layout + befores/afters subdirs (both identical files for compatibility)
        before_sq.save(output_dir / before_name, format="JPEG", quality=92)
        after_sq.save(output_dir / after_name, format="JPEG", quality=92)
        before_sq.save(befores_dir / before_name, format="JPEG", quality=92)
        after_sq.save(afters_dir / after_name, format="JPEG", quality=92)

        record = {
            "pair_id": pair_id,
            "id": pair_id,
            "title": f"Synthetic {category}: {change}",
            "source_type": "synthetic_compcars",
            "source_image": job.get("source_rel_path"),
            "source_viewpoint": job.get("source_viewpoint"),
            "source_bbox": job.get("source_bbox") or job.get("bbox"),
            "modification_category": category,
            "modification_change": change,
            "edit_prompt": prompt,
            "instruction": prompt,
            "edit_model": model_id,
            "edit_backend": "instruct_pix2pix",
            "edit_steps": steps,
            "edit_resolution": resolution,
            "image_guidance_scale": image_guidance_scale,
            "guidance_scale": guidance_scale,
            "recommended_method": category_recommendation(category),
            "needs_localized_edit": False,
            "generation_seconds": round(elapsed, 2),
            "filenames": {"before": before_name, "after": after_name},
            "dimensions": {
                "before": [before_sq.width, before_sq.height],
                "after": [after_sq.width, after_sq.height],
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "review_status": "pending",
            "batch_tag": SYNTHETIC_BATCH_TAG,
        }
        generated.append(record)
        metadata.append(record)
        save_metadata(output_dir, metadata)

    if timings:
        avg = sum(timings) / len(timings)
        logger.info(
            "Timing: n=%d avg=%.1fs/image (est. 200 ≈ %.0f min)",
            len(timings),
            avg,
            200 * avg / 60,
        )

    return len(generated), generated


def main() -> None:
    parser = argparse.ArgumentParser(description="InstructPix2Pix synthetic pairs (paint/wrap)")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--compcars-data", type=str, default=str(COMPCARS_DATA))
    parser.add_argument("--output", type=str, default=str(SYNTHETIC_PAIRS_ROOT))
    parser.add_argument("--model", type=str, default=IMAGE_EDIT_MODEL)
    parser.add_argument("--steps", type=int, default=INSTRUCT_PIX2PIX_STEPS)
    parser.add_argument("--resolution", type=int, default=INSTRUCT_PIX2PIX_RESOLUTION)
    parser.add_argument("--image-guidance", type=float, default=INSTRUCT_PIX2PIX_IMAGE_GUIDANCE)
    parser.add_argument("--guidance", type=float, default=INSTRUCT_PIX2PIX_GUIDANCE)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--jobs", type=str, default="")
    parser.add_argument(
        "--include-wheels",
        action="store_true",
        help="Include wheels (default OFF — parked until ControlNet)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    print("=" * 70)
    print("  Synthetic Pairs — InstructPix2Pix paint/wrap retune v2")
    print("=" * 70)
    print(f"image_guidance_scale : {args.image_guidance}")
    print(f"guidance_scale       : {args.guidance}")
    print(f"resolution           : {args.resolution}×{args.resolution} (hard-enforced)")
    print(f"batch_size           : {args.batch_size} (wheels={'ON' if args.include_wheels else 'OFF'})")
    print("=" * 70)

    count, records = generate_pairs(
        compcars_data=Path(args.compcars_data),
        output_dir=Path(args.output),
        batch_size=args.batch_size,
        model_id=args.model,
        seed=args.seed,
        steps=args.steps,
        resolution=args.resolution,
        image_guidance_scale=args.image_guidance,
        guidance_scale=args.guidance,
        include_wheels=args.include_wheels,
        jobs_json=Path(args.jobs) if args.jobs else None,
    )

    print(f"\nGenerated {count} pairs → {Path(args.output).resolve()}")
    if records:
        secs = [r["generation_seconds"] for r in records]
        print(f"Avg {sum(secs)/len(secs):.1f}s/image")
        bad = [r for r in records if r["dimensions"]["after"] != [args.resolution, args.resolution]]
        print(f"Size violations: {len(bad)} (must be 0)")


if __name__ == "__main__":
    main()

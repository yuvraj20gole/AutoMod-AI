# AutoMod AI Dataset Pipeline

## Layout

```
dataset/
  compcars/                 # Part 1 — CompCars (kagglehub)
    data/                   # images + labels
    masks/                  # Part 3 — wheel (and window) masks
  synthetic-source-pack/    # Compact 20-image pack for Colab upload
  synthetic-pairs/          # Part 2 — InstructPix2Pix before/after pairs
  real-eval-pairs/          # Held-out eval — DO NOT MODIFY
```

## Part 1 — CompCars

```bash
pip install -r pipeline/requirements.txt
python3 pipeline/download_compcars.py
```

## Part 2 — Synthetic pairs (InstructPix2Pix, free Colab T4)

**Retune v2:** paint/wrap only, `image_guidance_scale=2.0`, `guidance_scale=8.5`, hard 512×512 I/O.
Wheels are parked until ControlNet+inpaint.

```bash
# Legacy small pack (tight crops — superseded by v2 pack below)
.venv/bin/python pipeline/export_source_pack.py --batch-size 20
```

### Source pack v2 (recommended)

Larger, looser-cropped CompCars befores for spoilers / hoods / wheels / paint.
Uses project `.venv` (Python 3.12). Excludes sources already listed in
`dataset/synthetic-pairs/metadata.json` and `dataset/synthetic-pairs/chatgpt/metadata.json`.
Does **not** write to `synthetic-pairs/` or `real-eval-pairs/`.

```bash
.venv/bin/python pipeline/export_source_pack_v2.py
# outputs:
#   dataset/synthetic-source-pack-v2/          # 0101_before.jpg ..., manifest.json, review.html
#   dataset/synthetic-source-pack-v2.zip
open dataset/synthetic-source-pack-v2/review.html   # contact sheet
```

Quotas: 40 rear/rear_side, 40 front/front_side, 30 side. Crops pad the bbox ~18%,
expand to square, then resize to 512×512 so the whole car stays in frame.

Upload a **fresh** copy of `pipeline/colab_generate_synthetic_pairs.ipynb` and
`dataset/synthetic-source-pack.zip` (or the v2 zip when the Colab notebook is updated) to Colab (T4 GPU).
Download results into `dataset/synthetic-pairs/` only after review.

### Expected timing (Colab free-tier T4, fp16, 512px, 20 steps)

| Stage | Time |
|-------|------|
| Model load (once) | ~2–4 min |
| **Per image** | **~8–15 s** |
| 20-pair retune batch | ~3–6 min (+ load) |

## Part 3 — Wheel masks (CompCars)

```bash
python3 pipeline/segment_cars.py --limit 40
open dataset/compcars/masks/preview.html
```

Uses a YOLO car-parts segmenter (`wheel` class) with a Hough-circle fallback.
Synthetic-pair masking waits until paint/wrap v2 is on disk.

## Notes

- `dataset/real-eval-pairs/` is never written by these scripts.
- Do not scale Part 2 to 200 until the 20-pair v2 batch is reviewed.

#!/usr/bin/env python3
"""Export synthetic-source-pack-v2: diverse CompCars befores with loose square crops.

Creates:
  dataset/synthetic-source-pack-v2/
    0101_before.jpg ...
    manifest.json
    review.html
  dataset/synthetic-source-pack-v2.zip

Does NOT modify dataset/synthetic-pairs/ or dataset/real-eval-pairs/.
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import shutil
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import numpy as np
from PIL import Image, ImageOps

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.compcars_utils import CompCarsLabel, iter_vehicle_images
from pipeline.config import COMPCARS_DATA, DATASET_ROOT, SYNTHETIC_PAIRS_ROOT

logger = logging.getLogger("pipeline.export_source_pack_v2")

START_PAIR_ID = 101
RESOLUTION = 512
PAD_FRAC = 0.18
MIN_SHORT_SIDE = 600
MIN_BBOX_WIDTH_FRAC = 0.50
BLUR_LAPLACIAN_MIN = 45.0

QUOTAS = {
    "rear_group": 40,
    "front_group": 40,
    "side_group": 30,
}

VIEWPOINT_TO_GROUP = {
    "rear": "rear_group",
    "rear_side": "rear_group",
    "front": "front_group",
    "front_side": "front_group",
    "side": "side_group",
}

GROUP_EDITS = {
    "rear_group": ["spoiler", "paint", "wrap"],
    "front_group": ["hood", "wheels", "paint", "wrap"],
    "side_group": ["wheels", "paint", "wrap"],
}

BODY_PREF = {
    "sedan",
    "hatchback",
    "SUV",
    "sports",
    "coupe",
    "fastback",
    "estate",
    "crossover",
}


@dataclass
class Candidate:
    label: CompCarsLabel
    img_path: Path
    width: int
    height: int
    color_bucket: str
    body_type: str
    make_name: str
    model_name: str
    note: str


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def load_excluded_sources(synthetic_root: Path) -> Set[str]:
    paths = [
        synthetic_root / "metadata.json",
        synthetic_root / "chatgpt" / "metadata.json",
    ]
    excluded: Set[str] = set()
    for path in paths:
        if not path.exists():
            print(f"Note: exclusion file missing (ok): {path}")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            die(f"Invalid JSON in {path}: {exc}")
        if not isinstance(data, list):
            die(f"{path} must be a JSON array")
        for row in data:
            src = row.get("source_image") or row.get("source_rel_path")
            if src:
                excluded.add(str(src).replace("\\", "/"))
        print(f"Loaded {len(data)} rows from {path}")
    print(f"Total excluded CompCars sources: {len(excluded)}")
    return excluded


def load_make_model_tables(misc_dir: Path) -> Tuple[List[str], List[str], Dict[int, str]]:
    make_names: List[str] = []
    model_names: List[str] = []
    body_by_model: Dict[int, str] = {}
    try:
        import scipy.io as sio

        mm = sio.loadmat(str(misc_dir / "make_model_name.mat"), squeeze_me=True)
        make_names = [str(x) for x in mm["make_names"].tolist()]
        model_names = [str(x) for x in mm["model_names"].tolist()]
        types = [
            str(x)
            for x in sio.loadmat(str(misc_dir / "car_type.mat"), squeeze_me=True)["types"].tolist()
        ]
        attr_path = misc_dir / "attributes.txt"
        if attr_path.exists():
            for line in attr_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                parts = line.strip().split()
                if not parts or parts[0] == "model_id":
                    continue
                try:
                    mid = int(parts[0])
                    t = int(parts[-1])
                except ValueError:
                    continue
                if 1 <= t <= len(types):
                    body_by_model[mid] = types[t - 1]
    except Exception as exc:
        print(f"Warning: could not load CompCars name tables ({exc}); using ids only")
    return make_names, model_names, body_by_model


def resolve_names(
    label: CompCarsLabel,
    make_names: Sequence[str],
    model_names: Sequence[str],
    body_by_model: Dict[int, str],
) -> Tuple[str, str, str]:
    make = label.make_id
    model = label.model_id
    body = "unknown"
    try:
        mi = int(label.make_id)
        if 1 <= mi <= len(make_names):
            make = make_names[mi - 1]
    except ValueError:
        pass
    try:
        mdi = int(label.model_id)
        if 1 <= mdi <= len(model_names):
            model = model_names[mdi - 1]
        body = body_by_model.get(mdi, "unknown")
    except ValueError:
        pass
    if "coupe" in model.lower():
        body = "coupe"
    return make, model, body


def bbox_geometry_ok(label: CompCarsLabel, w: int, h: int, rejects: Counter) -> bool:
    x1, y1, x2, y2 = label.bbox
    bw, bh = x2 - x1, y2 - y1
    if bw <= 1 or bh <= 1:
        rejects["bad_bbox"] += 1
        return False
    if bw / w < MIN_BBOX_WIDTH_FRAC:
        rejects["bbox_width_lt_50pct"] += 1
        return False

    aspect = bw / max(1, bh)
    height_frac = bh / h
    area_frac = (bw * bh) / (w * h)
    vp = label.viewpoint

    if vp == "side":
        if aspect < 1.45:
            rejects["side_too_square_likely_door_crop"] += 1
            return False
        if height_frac < 0.28:
            rejects["side_too_short"] += 1
            return False
    elif vp in ("rear", "rear_side"):
        if height_frac < 0.32:
            rejects["rear_missing_trunk_height"] += 1
            return False
        if vp == "rear_side" and aspect < 1.05:
            rejects["rear_side_too_tight"] += 1
            return False
        if area_frac < 0.18:
            rejects["rear_area_too_small"] += 1
            return False
    elif vp in ("front", "front_side"):
        if height_frac < 0.28:
            rejects["front_too_short"] += 1
            return False
        if area_frac < 0.16:
            rejects["front_area_too_small"] += 1
            return False
    return True


def laplacian_var(gray: np.ndarray) -> float:
    g = gray.astype(np.float32)
    lap = (
        -4 * g
        + np.roll(g, 1, 0)
        + np.roll(g, -1, 0)
        + np.roll(g, 1, 1)
        + np.roll(g, -1, 1)
    )
    return float(lap[1:-1, 1:-1].var())


def color_bucket_from_crop(rgb: np.ndarray) -> str:
    h, w = rgb.shape[:2]
    y0, y1 = int(h * 0.35), int(h * 0.70)
    x0, x1 = int(w * 0.30), int(w * 0.70)
    patch = rgb[y0:y1, x0:x1].reshape(-1, 3).astype(np.float32)
    if patch.size == 0:
        return "other"
    lo = np.percentile(patch, 15, axis=0)
    hi = np.percentile(patch, 85, axis=0)
    mask = np.all((patch >= lo) & (patch <= hi), axis=1)
    patch = patch[mask] if mask.any() else patch
    mean = patch.mean(axis=0)
    r, g, b = mean
    mx, mn = float(mean.max()), float(mean.min())
    sat = (mx - mn) / max(mx, 1.0)
    val = mx
    if val > 200 and sat < 0.18:
        return "white"
    if val < 55:
        return "black"
    if sat < 0.16 and 70 <= val <= 200:
        return "silver"
    if r > g + 25 and r > b + 25:
        return "red"
    if b > r + 15 and b > g + 10:
        return "blue"
    return "other"


def band_edge_density(gray: np.ndarray, y0: int, y1: int) -> float:
    band = gray[y0:y1, :]
    if band.size == 0:
        return 0.0
    gx = np.abs(np.diff(band.astype(np.float32), axis=1))
    return float((gx > 28).mean())


def suspected_text_overlay(gray: np.ndarray, rejects: Counter) -> bool:
    h, _w = gray.shape
    top = band_edge_density(gray, 0, max(1, int(h * 0.08)))
    bot = band_edge_density(gray, h - max(1, int(h * 0.08)), h)
    mid = band_edge_density(gray, int(h * 0.35), int(h * 0.65))
    if top > mid * 2.2 and top > 0.12:
        rejects["watermark_top"] += 1
        return True
    if bot > mid * 2.2 and bot > 0.12:
        rejects["watermark_bottom"] += 1
        return True
    return False


def suspected_people_or_decal(
    rgb: np.ndarray, bbox: Tuple[int, int, int, int], rejects: Counter
) -> bool:
    x1, y1, x2, y2 = bbox
    crop = rgb[y1:y2, x1:x2]
    if crop.size == 0:
        return False
    r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
    skin = (r > 95) & (g > 40) & (b > 20) & (r > g) & (r > b) & ((r - g) > 15)
    if float(skin.mean()) > 0.08:
        rejects["people_skin_overlap"] += 1
        return True
    mx = crop.max(axis=2).astype(np.float32)
    mn = crop.min(axis=2).astype(np.float32)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    if float((sat > 0.65).mean()) > 0.22:
        rejects["decal_or_graphic_wrap"] += 1
        return True

    # Text / vinyl lettering on doors — many small bright/dark blobs in mid-body band
    ch, cw = crop.shape[:2]
    mid = crop[int(ch * 0.38) : int(ch * 0.75), int(cw * 0.08) : int(cw * 0.92)]
    if mid.size:
        from scipy import ndimage

        mid_gray = (0.299 * mid[..., 0] + 0.587 * mid[..., 1] + 0.114 * mid[..., 2]).astype(
            np.float32
        )
        for thresh, name in ((190, "bright"), (45, "dark")):
            mask = mid_gray > thresh if name == "bright" else mid_gray < thresh
            frac = float(mask.mean())
            if frac < 0.025 or frac > 0.45:
                continue
            labeled, n = ndimage.label(mask)
            # Lettering / stripes → many separate components; solid panels → few
            if n >= 12 and frac < 0.35:
                rejects["decal_text_on_body"] += 1
                return True
    return False


def edge_fill_color(img: Image.Image) -> Tuple[int, int, int]:
    arr = np.asarray(img.convert("RGB"))
    border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]], axis=0)
    return tuple(int(x) for x in border.mean(axis=0))


def padded_square_crop(
    img: Image.Image, bbox: Tuple[int, int, int, int], pad_frac: float = PAD_FRAC
) -> Image.Image:
    w, h = img.size
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1
    pad_x = int(bw * pad_frac)
    pad_y = int(bh * pad_frac)
    left, top = x1 - pad_x, y1 - pad_y
    right, bottom = x2 + pad_x, y2 + pad_y

    cw, ch = right - left, bottom - top
    side = max(cw, ch)
    cx = (left + right) / 2.0
    cy = (top + bottom) / 2.0
    left = int(round(cx - side / 2.0))
    top = int(round(cy - side / 2.0))
    right = left + side
    bottom = top + side

    pad_l = max(0, -left)
    pad_t = max(0, -top)
    pad_r = max(0, right - w)
    pad_b = max(0, bottom - h)
    if pad_l or pad_t or pad_r or pad_b:
        img = ImageOps.expand(img, border=(pad_l, pad_t, pad_r, pad_b), fill=edge_fill_color(img))
        left += pad_l
        top += pad_t
        right += pad_l
        bottom += pad_t

    return img.crop((left, top, right, bottom)).resize(
        (RESOLUTION, RESOLUTION), Image.Resampling.LANCZOS
    )


def intended_edits_for(group: str) -> List[str]:
    return list(GROUP_EDITS[group])


def pick_diverse(
    pool: List[Candidate],
    need: int,
    rng: random.Random,
    used_models: Set[str],
) -> List[Candidate]:
    """Greedy diversity pick: unique make/model/year first, balance colour + body."""
    if not pool:
        return []
    rng.shuffle(pool)

    def vp_bonus(vp: str) -> float:
        return {
            "rear": 3.0,
            "rear_side": 1.5,
            "front_side": 2.5,
            "front": 1.5,
            "side": 2.0,
        }.get(vp, 0.0)

    picked: List[Candidate] = []
    color_counts: Counter = Counter()
    body_counts: Counter = Counter()

    def score(c: Candidate) -> float:
        s = vp_bonus(c.label.viewpoint)
        s += 2.5 / (1 + color_counts[c.color_bucket])
        if c.body_type in BODY_PREF:
            s += 2.5 / (1 + body_counts[c.body_type])
        if c.color_bucket in ("white", "black", "silver", "red", "blue"):
            s += 0.4
        return s

    # Pass 1 — unique model keys
    remaining = list(pool)
    while len(picked) < need and remaining:
        remaining.sort(key=score, reverse=True)
        chosen = None
        for c in remaining:
            key = f"{c.label.make_id}/{c.label.model_id}/{c.label.year}"
            if key in used_models:
                continue
            chosen = c
            used_models.add(key)
            break
        if chosen is None:
            break
        picked.append(chosen)
        remaining.remove(chosen)
        color_counts[chosen.color_bucket] += 1
        body_counts[chosen.body_type] += 1

    # Pass 2 — allow model repeats if still short
    have = {c.label.rel_path for c in picked}
    remaining = [c for c in pool if c.label.rel_path not in have]
    while len(picked) < need and remaining:
        remaining.sort(key=score, reverse=True)
        chosen = remaining.pop(0)
        picked.append(chosen)
        color_counts[chosen.color_bucket] += 1
        body_counts[chosen.body_type] += 1
        have.add(chosen.label.rel_path)

    return picked


def write_review_html(pack_dir: Path, rows: List[Dict[str, Any]]) -> Path:
    cards = []
    for row in rows:
        cards.append(
            f"""
            <figure class="card">
              <img src="{row['filename']}" alt="{row['pair_id']}" loading="lazy">
              <figcaption>
                <strong>{row['pair_id']}</strong> · {row['source_viewpoint']}<br>
                {row.get('make','')} {row.get('model','')} ({row.get('year','')})<br>
                edits: {', '.join(row.get('intended_edits', []))}
              </figcaption>
            </figure>"""
        )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>synthetic-source-pack-v2 review</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background:#111; color:#eee; margin:0; padding:24px; }}
    h1 {{ margin:0 0 8px; }}
    .sub {{ color:#9aa; margin-bottom:20px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }}
    .card {{ background:#1a1a1a; border:1px solid #333; border-radius:10px; padding:8px; margin:0; }}
    img {{ width:100%; aspect-ratio:1; object-fit:cover; border-radius:6px; background:#000; display:block; }}
    figcaption {{ font-size:12px; color:#bbb; margin-top:8px; line-height:1.35; }}
  </style>
</head>
<body>
  <h1>synthetic-source-pack-v2</h1>
  <p class="sub">{len(rows)} sources · 512×512 padded square crops · eyeball spoilers / hoods / wheels</p>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>"""
    out = pack_dir / "review.html"
    out.write_text(html, encoding="utf-8")
    return out


def evaluate_image(
    img_path: Path,
    label: CompCarsLabel,
    rejects: Counter,
    make_names: Sequence[str],
    model_names: Sequence[str],
    body_by_model: Dict[int, str],
) -> Optional[Candidate]:
    try:
        with Image.open(img_path) as im:
            w, h = im.size
            if min(w, h) < MIN_SHORT_SIDE:
                rejects["short_side_lt_600"] += 1
                return None
            if not bbox_geometry_ok(label, w, h, rejects):
                return None
            rgb = np.asarray(im.convert("RGB"))
    except OSError:
        rejects["unreadable_image"] += 1
        return None

    x1, y1, x2, y2 = label.bbox
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        rejects["bad_bbox"] += 1
        return None

    gray = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.float32)
    if laplacian_var(gray[y1:y2, x1:x2]) < BLUR_LAPLACIAN_MIN:
        rejects["motion_blur"] += 1
        return None
    if suspected_text_overlay(gray, rejects):
        return None
    if suspected_people_or_decal(rgb, (x1, y1, x2, y2), rejects):
        return None

    make_name, model_name, body = resolve_names(label, make_names, model_names, body_by_model)
    color = color_bucket_from_crop(rgb[y1:y2, x1:x2])
    group = VIEWPOINT_TO_GROUP[label.viewpoint]
    note = (
        f"{group}: padded square crop ({int(PAD_FRAC * 100)}% bbox pad); "
        f"intended for {', '.join(intended_edits_for(group))}"
    )
    return Candidate(
        label=label,
        img_path=img_path,
        width=w,
        height=h,
        color_bucket=color,
        body_type=body,
        make_name=make_name,
        model_name=model_name,
        note=note,
    )


def export_pack_v2(
    compcars_data: Path,
    pack_dir: Path,
    synthetic_root: Path,
    seed: int = 42,
    max_scan: int = 0,
) -> Dict[str, Any]:
    if not (compcars_data / "image").exists():
        die(f"CompCars image dir missing: {compcars_data / 'image'}")

    excluded = load_excluded_sources(synthetic_root)
    make_names, model_names, body_by_model = load_make_model_tables(compcars_data / "misc")
    rng = random.Random(seed)
    rejects: Counter = Counter()

    # Pass 1: index labels by group (no decode)
    print("Indexing CompCars labels by viewpoint group...")
    indexed: Dict[str, List[Tuple[Path, CompCarsLabel]]] = defaultdict(list)
    scanned = 0
    for img_path, label in iter_vehicle_images(compcars_data):
        scanned += 1
        if max_scan and scanned > max_scan:
            break
        group = VIEWPOINT_TO_GROUP.get(label.viewpoint)
        if group is None:
            rejects["viewpoint_unused"] += 1
            continue
        if label.rel_path in excluded:
            rejects["already_used"] += 1
            continue
        indexed[group].append((img_path, label))

    for g in QUOTAS:
        rng.shuffle(indexed[g])
        print(f"  indexed {g}: {len(indexed[g])} (excluding used/wrong-vp)")

    # Pass 2: decode until we have surplus candidates per group
    target_pool = {g: QUOTAS[g] * 6 for g in QUOTAS}
    pools: Dict[str, List[Candidate]] = {g: [] for g in QUOTAS}
    attempts: Counter = Counter()

    for group in QUOTAS:
        print(f"Filtering {group} (need ~{target_pool[group]} quality candidates)...")
        for img_path, label in indexed[group]:
            if len(pools[group]) >= target_pool[group]:
                break
            attempts[group] += 1
            cand = evaluate_image(
                img_path, label, rejects, make_names, model_names, body_by_model
            )
            if cand is not None:
                pools[group].append(cand)
            if attempts[group] % 500 == 0:
                print(
                    f"  {group}: tried {attempts[group]} | kept {len(pools[group])}"
                )
        print(f"  {group}: kept {len(pools[group])} / tried {attempts[group]}")

    used_models: Set[str] = set()
    selected: Dict[str, List[Candidate]] = {}
    shortfalls: Dict[str, int] = {}
    for group, need in QUOTAS.items():
        picked = pick_diverse(pools[group], need, rng, used_models)
        selected[group] = picked
        if len(picked) < need:
            shortfalls[group] = need - len(picked)

    ordered: List[Candidate] = []
    for g in ("rear_group", "front_group", "side_group"):
        chunk = list(selected[g])
        rng.shuffle(chunk)
        ordered.extend(chunk)

    if not ordered:
        die("No candidates selected — check CompCars path and filters")

    if pack_dir.exists():
        shutil.rmtree(pack_dir)
    pack_dir.mkdir(parents=True, exist_ok=True)

    manifest: List[Dict[str, Any]] = []
    viewpoint_counts: Counter = Counter()
    color_out: Counter = Counter()
    body_out: Counter = Counter()

    for i, cand in enumerate(ordered):
        pair_id = f"{START_PAIR_ID + i:04d}"
        filename = f"{pair_id}_before.jpg"
        try:
            with Image.open(cand.img_path) as im:
                square = padded_square_crop(im.convert("RGB"), cand.label.bbox, PAD_FRAC)
        except OSError as exc:
            die(f"Failed to crop {cand.label.rel_path}: {exc}")

        square.save(pack_dir / filename, format="JPEG", quality=92)
        if square.size != (RESOLUTION, RESOLUTION):
            die(f"Crop size bug for {filename}: {square.size}")

        group = VIEWPOINT_TO_GROUP[cand.label.viewpoint]
        row = {
            "pair_id": pair_id,
            "filename": filename,
            "source_image": cand.label.rel_path,
            "source_viewpoint": cand.label.viewpoint,
            "make": cand.make_name,
            "model": cand.model_name,
            "year": cand.label.year,
            "bbox": list(cand.label.bbox),
            "intended_edits": intended_edits_for(group),
            "note": cand.note,
            "color_bucket": cand.color_bucket,
            "body_type": cand.body_type,
            "source_size": [cand.width, cand.height],
        }
        manifest.append(row)
        viewpoint_counts[cand.label.viewpoint] += 1
        color_out[cand.color_bucket] += 1
        body_out[cand.body_type] += 1

    (pack_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    review_path = write_review_html(pack_dir, manifest)

    zip_path = pack_dir.with_suffix(".zip")
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(pack_dir.rglob("*")):
            if f.is_file():
                zf.write(f, arcname=str(f.relative_to(pack_dir.parent)))

    summary = {
        "scanned": scanned,
        "selected_total": len(manifest),
        "viewpoint_counts": dict(viewpoint_counts),
        "group_counts": {g: len(selected[g]) for g in QUOTAS},
        "quotas": dict(QUOTAS),
        "shortfalls": shortfalls,
        "rejects": dict(rejects),
        "attempts_per_group": dict(attempts),
        "pool_sizes": {g: len(pools[g]) for g in QUOTAS},
        "color_buckets": dict(color_out),
        "body_types": dict(body_out),
        "pack_dir": str(pack_dir.resolve()),
        "zip_path": str(zip_path.resolve()),
        "review_html": str(review_path.resolve()),
        "manifest": str((pack_dir / "manifest.json").resolve()),
        "excluded_sources": len(excluded),
    }
    (pack_dir / "export_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    # Also include summary in zip — rewrite zip to include it (already written before zip... 
    # export_summary written after zip above — fix: write summary before zip)
    return summary


def print_summary(summary: Dict[str, Any]) -> None:
    print("\n" + "=" * 70)
    print("  synthetic-source-pack-v2 export summary")
    print("=" * 70)
    print(f"Scanned images     : {summary['scanned']}")
    print(f"Excluded (prior)   : {summary['excluded_sources']}")
    print(f"Selected total     : {summary['selected_total']} (target {sum(QUOTAS.values())})")
    print("Group fills:")
    for g, need in QUOTAS.items():
        got = summary["group_counts"].get(g, 0)
        print(f"  {g:12} {got:3}/{need}")
    print("Viewpoint counts:")
    for vp, n in sorted(summary["viewpoint_counts"].items()):
        print(f"  {vp:12} {n}")
    print("Colour buckets:", summary["color_buckets"])
    print("Body types    :", summary["body_types"])
    print("Rejects:")
    for reason, n in sorted(summary["rejects"].items(), key=lambda kv: -kv[1]):
        print(f"  {reason:40} {n}")
    if summary["shortfalls"]:
        print("SHORTFALLS:")
        for g, n in summary["shortfalls"].items():
            print(f"  {g}: missing {n}")
    else:
        print("SHORTFALLS: none — all quotas filled")
    print(f"Pack dir : {summary['pack_dir']}")
    print(f"Zip      : {summary['zip_path']}")
    print(f"Manifest : {summary['manifest']}")
    print(f"Review   : {summary['review_html']}")
    print("=" * 70)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export synthetic-source-pack-v2 from CompCars (padded 512 crops)"
    )
    parser.add_argument("--compcars-data", type=str, default=str(COMPCARS_DATA))
    parser.add_argument(
        "--output",
        type=str,
        default=str(DATASET_ROOT / "synthetic-source-pack-v2"),
    )
    parser.add_argument(
        "--synthetic-root",
        type=str,
        default=str(SYNTHETIC_PAIRS_ROOT),
        help="Read-only: metadata here used for exclusions",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--max-scan",
        type=int,
        default=0,
        help="Optional cap on CompCars images indexed (0 = all)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    try:
        # Run export but zip AFTER summary file is written
        summary = _export_and_zip(
            compcars_data=Path(args.compcars_data),
            pack_dir=Path(args.output),
            synthetic_root=Path(args.synthetic_root),
            seed=args.seed,
            max_scan=args.max_scan,
        )
    except SystemExit:
        raise
    except Exception as exc:
        die(f"Export failed: {exc}")

    print_summary(summary)
    if summary["selected_total"] == 0:
        die("Export produced zero images")
    empty = [g for g, n in summary["group_counts"].items() if n == 0]
    if empty:
        die(f"Empty quota groups: {empty}")


def _export_and_zip(
    compcars_data: Path,
    pack_dir: Path,
    synthetic_root: Path,
    seed: int,
    max_scan: int,
) -> Dict[str, Any]:
    """Wrapper so export_summary.json is included in the zip."""
    # Inline call to core logic without final zip, then zip here.
    # Simpler: call export_pack_v2 then re-zip including summary.
    summary = export_pack_v2(
        compcars_data=compcars_data,
        pack_dir=pack_dir,
        synthetic_root=synthetic_root,
        seed=seed,
        max_scan=max_scan,
    )
    zip_path = Path(summary["zip_path"])
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(pack_dir.rglob("*")):
            if f.is_file():
                zf.write(f, arcname=str(f.relative_to(pack_dir.parent)))
    return summary


if __name__ == "__main__":
    main()

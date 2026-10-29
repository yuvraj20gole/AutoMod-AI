"""Restore the original number-plate recess after a Detailed edit.

Qwen often hallucinates scribbled text onto a blank plate recess. The
edit-region blend cannot fix this when the plate sits inside the edit mask.

Pipeline:
1. Detect the plate recess (YOLO plate / trunk-guided classical).
2. Expand the box using dark / high-frequency pixels in the *edited* image
   so the whole recess (not just the left half) is covered, then +10–15% margin.
3. Soft-blend a colour-matched, detail-preserved original patch (wide feather).
4. Fail-safe: skip if no recess found, or if the view looks like a side shot.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

BBox = tuple[int, int, int, int]  # x0, y0, x1, y1


def _bbox_from_mask(mask: np.ndarray, pad: int = 2) -> BBox | None:
    ys, xs = np.where(mask)
    if len(xs) < 20:
        return None
    h, w = mask.shape
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + 1 + pad)
    y1 = min(h, int(ys.max()) + 1 + pad)
    if x1 - x0 < 8 or y1 - y0 < 4:
        return None
    return (x0, y0, x1, y1)


def _yolo_parts(original: Image.Image) -> dict[str, BBox]:
    """Return name → bbox for panel classes we care about."""
    try:
        from ultralytics import YOLO
    except Exception:
        return {}
    weights = Path(__file__).resolve().parents[1] / "weights" / "panel_best.pt"
    if not weights.is_file():
        return {}
    try:
        model = YOLO(str(weights))
        img = original.convert("RGB")
        res = model.predict(img, conf=0.2, retina_masks=True, verbose=False, device="cpu")[0]
        out: dict[str, BBox] = {}
        if res.boxes is None:
            return out
        for c, xyxy in zip(res.boxes.cls.tolist(), res.boxes.xyxy.tolist()):
            name = res.names[int(c)]
            box = (int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]))
            if name not in out:
                out[name] = box
            else:
                ox0, oy0, ox1, oy1 = out[name]
                if (box[2] - box[0]) * (box[3] - box[1]) > (ox1 - ox0) * (oy1 - oy0):
                    out[name] = box
        if res.masks is not None:
            w, h = img.size
            data = res.masks.data.cpu().numpy()
            plate = np.zeros((h, w), dtype=bool)
            found = False
            for c, m in zip(res.boxes.cls.tolist(), data):
                if res.names[int(c)] != "license-plate":
                    continue
                found = True
                mm = m > 0.5
                if mm.shape != (h, w):
                    mm = np.asarray(Image.fromarray(mm.astype(np.uint8) * 255).resize((w, h))) > 127
                plate |= mm
            if found:
                bb = _bbox_from_mask(plate, pad=3)
                if bb:
                    out["license-plate"] = bb
        return out
    except Exception:
        return {}


def is_front_or_rear_view(original: Image.Image, parts: dict[str, BBox] | None = None) -> bool:
    """Side views must not get plate paste-back."""
    parts = parts if parts is not None else _yolo_parts(original)
    if not parts:
        # No YOLO — allow classical detect; side cars rarely find a recess.
        return True
    front_rear = {"trunk", "back-bumper", "front-bumper", "tail-light", "headlight", "license-plate"}
    sideish = {"front-door", "back-door", "rocker-panel", "front-wheel", "back-wheel"}
    fr = sum(1 for k in front_rear if k in parts)
    side = sum(1 for k in sideish if k in parts)
    if "trunk" in parts or "front-bumper" in parts or "back-bumper" in parts or "license-plate" in parts:
        return True
    if side >= 3 and fr == 0:
        return False
    return fr > 0


def detect_plate_yolo(original: Image.Image) -> BBox | None:
    return _yolo_parts(original).get("license-plate")


def _search_plate_in_roi(
    arr: np.ndarray, roi: BBox, prefer_center: tuple[float, float] | None = None
) -> BBox | None:
    """Sliding-window plate search inside roi on HxWx3 float image."""
    x0, y0, x1, y1 = roi
    h, w = arr.shape[:2]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 - x0 < 40 or y1 - y0 < 16:
        return None
    best: tuple[float, BBox] | None = None
    rh, rw = y1 - y0, x1 - x0
    # Plate recess is a modest rectangle — not the whole bumper/trunk width.
    # Image-fraction caps only on large photos; small synthetic tests need
    # the ROI-relative limit alone.
    max_pw = min(int(rw * 0.55), rw - 4)
    max_ph = min(int(rh * 0.55), rh - 4)
    if arr.shape[1] >= 800:
        max_pw = min(max_pw, int(arr.shape[1] * 0.14))
    if arr.shape[0] >= 600:
        max_ph = min(max_ph, int(arr.shape[0] * 0.08))
    for ph in (max(12, rh // 6), max(14, rh // 5), max(18, rh // 4), max(22, min(rh // 3, max_ph))):
        if ph > max_ph:
            continue
        for aspect in (2.4, 2.8, 3.2, 3.6, 4.0):
            pw = int(ph * aspect)
            if pw >= rw or ph >= rh or pw > max_pw:
                continue
            step_y = max(2, ph // 5)
            step_x = max(2, pw // 6)
            for yy in range(y0, y1 - ph, step_y):
                for xx in range(x0, x1 - pw, step_x):
                    patch = arr[yy : yy + ph, xx : xx + pw]
                    interior = patch[3:-3, 5:-5]
                    if interior.size < 40:
                        continue
                    istd = float(interior.std())
                    if istd > 32:
                        continue
                    gray = patch.mean(axis=-1)
                    gy, gx = np.gradient(gray)
                    edge = float(
                        np.mean(np.abs(gx[:, :2]))
                        + np.mean(np.abs(gx[:, -2:]))
                        + np.mean(np.abs(gy[:2, :]))
                        + np.mean(np.abs(gy[-2:, :]))
                    )
                    if edge < 3.5:
                        continue
                    cx, cy = xx + pw / 2, yy + ph / 2
                    if prefer_center is not None:
                        pcx, pcy = prefer_center
                        dist = abs(cx - pcx) / max(rw, 1) + abs(cy - pcy) / max(rh, 1)
                        center_bias = max(0.2, 1.0 - dist)
                    else:
                        center_bias = 1.0
                    lower_bias = 0.7 + 0.3 * ((yy - y0) / max(rh - ph, 1))
                    score = (edge / (istd + 1e-3)) * center_bias * lower_bias * min(pw / ph, 4.0)
                    box = (xx, yy, xx + pw, yy + ph)
                    if best is None or score > best[0]:
                        best = (score, box)
    if best is None or best[0] < 1.0:
        return None
    return best[1]


def detect_plate_classical(original: Image.Image, search_roi: BBox | None = None) -> BBox | None:
    img = original.convert("RGB")
    w, h = img.size
    arr = np.asarray(img, dtype=np.float32)
    if search_roi is None:
        search_roi = (int(w * 0.15), int(h * 0.35), int(w * 0.95), int(h * 0.85))
        prefer = (w / 2, h * 0.55)
    else:
        x0, y0, x1, y1 = search_roi
        prefer = ((x0 + x1) / 2, y0 + 0.65 * (y1 - y0))
    return _search_plate_in_roi(arr, search_roi, prefer_center=prefer)


def _pad_bbox(box: BBox, img_size: tuple[int, int], frac: float = 0.12) -> BBox:
    x0, y0, x1, y1 = box
    w, h = img_size
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    nw, nh = bw * (1 + frac * 2), bh * (1 + frac * 2)
    return (
        max(0, int(round(cx - nw / 2))),
        max(0, int(round(cy - nh / 2))),
        min(w, int(round(cx + nw / 2))),
        min(h, int(round(cy + nh / 2))),
    )


def _clip_box(box: BBox, w: int, h: int) -> BBox | None:
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 - x0 < 8 or y1 - y0 < 4:
        return None
    return (x0, y0, x1, y1)


def _recess_from_original(original: Image.Image, seed: BBox) -> BBox:
    """Walk out from the classical seed along the blank recess on the original."""
    g = np.asarray(original.convert("RGB"), dtype=np.float32).mean(axis=-1)
    gy, gx = np.gradient(g)
    x0, y0, x1, y1 = seed
    mid = float(g[y0:y1, (x0 + x1) // 2].mean())
    # Prefer horizontal growth; vertical stay near the plate strip.
    max_up, max_down = 18, 22

    def walk_left(start: int) -> int:
        x = start
        while x > seed[0] - 130:
            col = g[y0:y1, x]
            edge = float(np.abs(gx[y0:y1, x]).mean())
            if x < seed[0] - 5 and edge > 8 and float(col.mean()) > mid + 15:
                return x + 1
            if float(col.mean()) > mid + 35:
                return x + 1
            x -= 1
        return x

    def walk_right(start: int) -> int:
        x = start
        while x < seed[2] + 130:
            col = g[y0:y1, x]
            edge = float(np.abs(gx[y0:y1, x]).mean())
            if x > seed[2] + 5 and edge > 8 and float(col.mean()) > mid + 15:
                return x
            if float(col.mean()) > mid + 35:
                return x
            x += 1
        return x

    def walk_up(start: int) -> int:
        y = start
        limit = seed[1] - max_up
        while y > limit:
            if (
                y < seed[1] - 3
                and float(np.abs(gy[y, seed[0] : seed[2]]).mean()) > 6
                and float(g[y, seed[0] : seed[2]].mean()) > mid + 20
            ):
                return y + 1
            y -= 1
        return y

    def walk_down(start: int) -> int:
        y = start
        limit = seed[3] + max_down
        while y < limit:
            if y > seed[3] + 3 and float(np.abs(gy[y, seed[0] : seed[2]]).mean()) > 6:
                return y
            y += 1
        return y

    box = (walk_left(seed[0]), walk_up(seed[1]), walk_right(seed[2] - 1), walk_down(seed[3] - 1))
    return _clip_box(box, original.size[0], original.size[1]) or seed


def expand_box_from_edit(
    edited: Image.Image,
    seed: BBox,
    *,
    original: Image.Image | None = None,
    search_roi: BBox | None = None,
    margin_frac: float = 0.13,
) -> BBox:
    """Expand seed to the whole recess + Qwen plate scribbles, then +margin.

    Uses the original's recess walls when available, then grows into dark /
    high-frequency edit pixels inside a capped trunk-centre band (gap-tolerant
    column scan so sparse text still extends the box).
    """
    edit = edited.convert("RGB")
    w, h = edit.size
    e = np.asarray(edit, dtype=np.float32)
    eg = e.mean(axis=-1)
    gy, gx = np.gradient(eg)
    freq = np.hypot(gx, gy)

    if original is not None:
        orig_img = original.convert("RGB")
        if orig_img.size != (w, h):
            orig_img = orig_img.resize((w, h), Image.Resampling.LANCZOS)
        base = _recess_from_original(orig_img, seed)
        o = np.asarray(orig_img, dtype=np.float32)
        og = o.mean(axis=-1)
    else:
        base = seed
        og = eg
        o = e

    x0, y0, x1, y1 = base
    sw, sh = max(1, x1 - x0), max(1, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    # Hard caps keep the paste on the plate recess, not the bumper.
    # On small synthetics, allow growth from seed; on large photos, cap by image fraction.
    max_w = int(max(sw * 1.7, (seed[2] - seed[0]) * 1.7, sh * 5.0))
    # Keep height close to the plate strip — over-tall boxes paste trunk
    # paint into Qwen-modified spoiler zones and leave tone seams.
    max_h = int(max(sh * 1.25, (seed[3] - seed[1]) * 1.35, 24))
    if w >= 800:
        max_w = min(max_w, int(w * 0.17), 250)
    else:
        max_w = min(max_w, w - 4)
    if h >= 600:
        max_h = min(max_h, int(h * 0.055), 58)
    else:
        max_h = min(max_h, h - 4)
    band_x0 = max(0, int(cx - max_w / 2))
    band_x1 = min(w, int(cx + max_w / 2))
    band_y0 = max(0, int(cy - max_h / 2))
    band_y1 = min(h, int(cy + max_h / 2))
    if search_roi is not None:
        band_x0 = max(band_x0, search_roi[0])
        band_y0 = max(band_y0, search_roi[1])
        band_x1 = min(band_x1, search_roi[2])
        band_y1 = min(band_y1, search_roi[3])

    body = float(np.median(og[max(0, seed[1] - 25) : seed[1], seed[0] : seed[2]]))
    if not np.isfinite(body):
        body = float(np.median(og[y0:y1, x0:x1]))
    diff = np.abs(eg - og)
    art = np.zeros((h, w), dtype=bool)
    art |= eg < min(body - 45, 105)
    art |= (eg < body - 12) & (freq > 6.5) & (diff > 14)
    art |= (freq > 10.5) & (diff > 18) & (eg < body + 15)
    band = np.zeros_like(art)
    band[band_y0:band_y1, band_x0:band_x1] = True
    art &= band

    dens = art[band_y0:band_y1].mean(axis=0)
    thr = max(0.04, float(dens[x0:x1].mean()) * 0.3 if x1 > x0 else 0.05)
    keep = np.zeros(w, dtype=bool)
    keep[x0:x1] = True
    gap_tol = 22
    gap = 0
    for x in range(x1, band_x1):
        if dens[x] >= thr:
            keep[x] = True
            gap = 0
        else:
            gap += 1
            if gap > gap_tol:
                break
    gap = 0
    for x in range(x0 - 1, band_x0 - 1, -1):
        if dens[x] >= thr:
            keep[x] = True
            gap = 0
        else:
            gap += 1
            if gap > gap_tol:
                break

    xs = np.where(keep)[0]
    if len(xs) == 0:
        return _pad_bbox(seed, (w, h), margin_frac)
    ux0, ux1 = int(xs.min()), int(xs.max()) + 1
    sub = art[band_y0:band_y1, ux0:ux1]
    ys, _ = np.where(sub)
    uy0, uy1 = y0, y1
    if len(ys):
        uy0 = min(uy0, band_y0 + int(ys.min()))
        uy1 = max(uy1, band_y0 + int(ys.max()) + 1)
    if uy1 - uy0 > max_h:
        uy0, uy1 = int(cy - max_h / 2), int(cy + max_h / 2)
    if ux1 - ux0 > max_w:
        ux0, ux1 = int(cx - max_w / 2), int(cx + max_w / 2)

    expanded = _clip_box((ux0, uy0, ux1, uy1), w, h) or seed
    padded = _pad_bbox(expanded, (w, h), margin_frac)
    # Re-cap after margin so we don't spill onto the bumper.
    px0, py0, px1, py1 = padded
    if px1 - px0 > max_w + int(max_w * margin_frac * 2):
        pcx = (px0 + px1) / 2
        half = (max_w * (1 + 2 * margin_frac)) / 2
        px0, px1 = int(pcx - half), int(pcx + half)
    if py1 - py0 > max_h + int(max_h * margin_frac * 2):
        pcy = (py0 + py1) / 2
        half = (max_h * (1 + 2 * margin_frac)) / 2
        py0, py1 = int(pcy - half), int(pcy + half)
    return _clip_box((px0, py0, px1, py1), w, h) or expanded


def detect_plate(
    original: Image.Image,
    edited: Image.Image | None = None,
) -> BBox | None:
    """Detect full plate recess; optionally expand using edited-image artifacts."""
    parts = _yolo_parts(original)
    if not is_front_or_rear_view(original, parts):
        return None

    w, h = original.size
    seed: BBox | None = None
    search_roi: BBox | None = None

    if "license-plate" in parts:
        seed = parts["license-plate"]
    else:
        for key in ("trunk", "back-bumper", "front-bumper"):
            if key not in parts:
                continue
            x0, y0, x1, y1 = parts[key]
            if key == "trunk":
                search_roi = (x0, y0 + int(0.30 * (y1 - y0)), x1, min(h, y1 + int(0.20 * (y1 - y0))))
            else:
                search_roi = (
                    x0 + int(0.10 * (x1 - x0)),
                    y0,
                    x1 - int(0.10 * (x1 - x0)),
                    y0 + int(0.60 * (y1 - y0)),
                )
            seed = detect_plate_classical(original, search_roi=search_roi)
            if seed is not None:
                break
        if seed is None:
            seed = detect_plate_classical(original)

    if seed is None:
        return None

    if edited is not None:
        edit = edited.convert("RGB")
        if edit.size != (w, h):
            edit = edit.resize((w, h), Image.Resampling.LANCZOS)
        return expand_box_from_edit(
            edit,
            seed,
            original=original,
            search_roi=search_roi,
            margin_frac=0.13,
        )

    return _pad_bbox(seed, (w, h), 0.13)


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    a = rgb.copy()
    mask = a <= 0.04045
    a[mask] = a[mask] / 12.92
    a[~mask] = ((a[~mask] + 0.055) / 1.055) ** 2.4
    m = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float64,
    )
    xyz = a @ m.T
    xyz[..., 0] /= 0.95047
    xyz[..., 2] /= 1.08883
    eps = 216 / 24389
    kappa = 24389 / 27

    def f(t):
        out = np.empty_like(t)
        msk = t > eps
        out[msk] = np.cbrt(t[msk])
        out[~msk] = (kappa * t[~msk] + 16) / 116
        return out

    fx, fy, fz = f(xyz[..., 0]), f(xyz[..., 1]), f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def _lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116
    fx = fy + A / 500
    fz = fy - B / 200
    eps = 216 / 24389
    kappa = 24389 / 27

    def finv(t):
        t3 = t**3
        out = np.empty_like(t)
        msk = t3 > eps
        out[msk] = t3[msk]
        out[~msk] = (116 * t[~msk] - 16) / kappa
        return out

    xyz = np.stack([finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883], axis=-1)
    m_inv = np.array(
        [
            [3.2404542, -1.5371385, -0.4985314],
            [-0.9692660, 1.8760108, 0.0415560],
            [0.0556434, -0.2040259, 1.0572252],
        ],
        dtype=np.float64,
    )
    linear = xyz @ m_inv.T
    linear = np.clip(linear, 0, None)
    a = np.empty_like(linear)
    mask = linear <= 0.0031308
    a[mask] = 12.92 * linear[mask]
    a[~mask] = 1.055 * np.power(linear[~mask], 1 / 2.4) - 0.055
    return np.clip(a, 0, 1)


def _match_lab_stats(src_rgb: np.ndarray, ref_mean: np.ndarray, ref_std: np.ndarray) -> np.ndarray:
    """src HxWx3 uint-ish float 0-255 → colour-matched float 0-255."""
    lab = _rgb_to_lab(np.clip(src_rgb / 255.0, 0, 1).astype(np.float64))
    for c in range(3):
        s = lab[..., c]
        s_mean, s_std = float(s.mean()), float(s.std()) + 1e-6
        lab[..., c] = (s - s_mean) * (float(ref_std[c]) / s_std) + float(ref_mean[c])
    return _lab_to_rgb(lab) * 255.0


def _gaussian(arr: np.ndarray, radius: float) -> np.ndarray:
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32)


def _soft_rect_mask(size: tuple[int, int], box: BBox, feather_px: int) -> np.ndarray:
    """Full-image soft mask; plate core stays fully opaque, edges feather out."""
    from PIL import ImageDraw

    w, h = size
    x0, y0, x1, y1 = box
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    blur_r = max(int(feather_px), 8)
    # Grow the solid fill slightly so after blur the *interior* of the recess
    # remains ~255 (no see-through scribbles in the middle).
    grow = max(2, blur_r // 3)
    fx0, fy0 = max(0, x0 - grow), max(0, y0 - grow)
    fx1, fy1 = min(w, x1 + grow), min(h, y1 + grow)
    core = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(core)
    rad = max(3, min(bw, bh) // 5)
    try:
        d.rounded_rectangle([fx0, fy0, fx1, fy1], radius=rad, fill=255)
    except Exception:
        d.rectangle([fx0, fy0, fx1, fy1], fill=255)
    blurred = core.filter(ImageFilter.GaussianBlur(radius=blur_r))
    a = np.asarray(blurred, dtype=np.float32) / 255.0
    # Force full opacity inside the recess proper.
    a[y0:y1, x0:x1] = np.maximum(a[y0:y1, x0:x1], 0.98)
    return np.clip(a, 0, 1)


def restore_plate(
    original: Image.Image,
    edited: Image.Image,
    *,
    bbox: BBox | None = None,
    feather_px: int = 12,
) -> Image.Image:
    """Blend a colour-matched original recess into the edit. No-op if no plate."""
    orig = original.convert("RGB")
    edit = edited.convert("RGB")
    if edit.size != orig.size:
        edit = edit.resize(orig.size, Image.Resampling.LANCZOS)

    box = bbox if bbox is not None else detect_plate(orig, edited=edit)
    if box is None:
        return edit

    w, h = orig.size
    box = _clip_box(box, w, h)
    if box is None:
        return edit
    x0, y0, x1, y1 = box
    feather = max(int(feather_px), 8)

    o_arr = np.asarray(orig, dtype=np.float32)
    e_arr = np.asarray(edit, dtype=np.float32)

    # Work on an expanded ROI so the feather has real original pixels (not black).
    pad = feather + 6
    ex0, ey0 = max(0, x0 - pad), max(0, y0 - pad)
    ex1, ey1 = min(w, x1 + pad), min(h, y1 + pad)

    # Surrounding ring in the *edit* for colour reference — exclude dark
    # leftovers so a leftover plate edge does not pull the match down.
    dil = feather + 10
    rx0, ry0 = max(0, x0 - dil), max(0, y0 - dil)
    rx1, ry1 = min(w, x1 + dil), min(h, y1 + dil)
    ring = np.zeros((h, w), dtype=bool)
    ring[ry0:ry1, rx0:rx1] = True
    ring[y0:y1, x0:x1] = False
    ring &= e_arr.mean(axis=-1) > 125
    if int(ring.sum()) < 40:
        ref_lab = _rgb_to_lab(e_arr / 255.0)
        ref_mean = ref_lab.reshape(-1, 3).mean(axis=0)
        ref_std = ref_lab.reshape(-1, 3).std(axis=0) + 1e-6
    else:
        ref_pix = e_arr[ring]
        ref_lab = _rgb_to_lab(ref_pix.reshape(-1, 1, 3) / 255.0).reshape(-1, 3)
        ref_mean = ref_lab.mean(axis=0)
        ref_std = ref_lab.std(axis=0) + 1e-6

    # (1) Original expanded patch, Lanczos-resampled to output pixel grid.
    patch_o = o_arr[ey0:ey1, ex0:ex1]
    po_img = Image.fromarray(np.clip(patch_o, 0, 255).astype(np.uint8)).resize(
        (ex1 - ex0, ey1 - ey0), Image.Resampling.LANCZOS
    )
    patch_o = np.asarray(po_img, dtype=np.float32)

    # (2) Match colour/brightness to surrounding Qwen (same LAB mean/std idea
    # as the global colour-match), but blend only 70% of the shift so the
    # recess does not flatten into a grey stamp.
    matched_full = _match_lab_stats(patch_o, ref_mean, ref_std).astype(np.float32)
    matched = patch_o * 0.30 + matched_full * 0.70

    # (4) High-frequency: match surrounding sharpness (boost if softer than
    # Qwen surround; ease off if sharper so we do not leave a sharp island).
    blur_r = 1.3
    matched_blur = _gaussian(matched, blur_r)
    detail = matched - matched_blur
    surround = e_arr[ey0:ey1, ex0:ex1]
    s_blur = _gaussian(surround, blur_r)
    s_detail_amp = float(np.abs(surround - s_blur).mean()) + 1e-3
    m_detail_amp = float(np.abs(detail).mean()) + 1e-3
    boost = float(np.clip(s_detail_amp / m_detail_amp, 0.85, 1.55))
    patch = np.clip(matched_blur + detail * boost, 0, 255)

    # (3) Wide soft feather; force near-full opacity inside the recess.
    alpha = _soft_rect_mask((w, h), box, feather_px=feather)[..., None]
    inset = max(3, feather // 3)
    if y1 - y0 > 2 * inset and x1 - x0 > 2 * inset:
        alpha[y0 + inset : y1 - inset, x0 + inset : x1 - inset] = 1.0

    full_patch = e_arr.copy()
    full_patch[ey0:ey1, ex0:ex1] = patch
    out = full_patch * alpha + e_arr * (1.0 - alpha)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), mode="RGB")


def restore_plate_safe(original: Image.Image, edited: Image.Image, **kwargs) -> Image.Image:
    """Never raise — on any failure return edited unchanged."""
    # Default OFF — plate paste-back overgrew into wheels / floor on Corolla
    # sheets. Set AUTOMOD_PLATE_RESTORE=1 to re-enable. Code kept intact.
    if os.environ.get("AUTOMOD_PLATE_RESTORE", "0") != "1":
        return edited.convert("RGB") if edited.mode != "RGB" else edited
    try:
        return restore_plate(original, edited, **kwargs)
    except Exception:
        return edited.convert("RGB")

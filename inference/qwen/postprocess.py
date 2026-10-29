"""Post-process Qwen Image Edit outputs for AutoMod Detailed engine.

Per-option policy in prompts.json ``postprocess`` (currently **all** ``"none"``):

- ``"none"`` — Lanczos-resize raw edit to original size only. No colour-match,
  no region blend, no plate paste-back.
- ``"full"`` — reserved path: resize + optional gentle L-match + plate
  paste-back (plate gated by ``AUTOMOD_PLATE_RESTORE``, default off).
  Regional edit-mask blend is never applied.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageFilter

PostprocessMode = Literal["full", "none"]

# Additive / local parts — gentle match + plate paste-back (no region blend).
FULL_POSTPROCESS_PARTS = frozenset(
    {
        "lip_spoiler",
        "ducktail",
        "gt_wing",
        "front_lip",
        "side_skirts",
        "rear_diffuser",
        "front_bumper_finish",
        "rear_bumper_finish",
    }
)


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """rgb float01 HxWx3 → Lab (D65)."""
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
    L = 116 * fy - 16
    A = 500 * (fx - fy)
    B = 200 * (fy - fz)
    return np.stack([L, A, B], axis=-1)


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


def colour_match(edit: Image.Image, original: Image.Image) -> Image.Image:
    """Match edit's global LAB mean/std to original (same size). Kept for tests/tools."""
    e = np.asarray(edit.convert("RGB"), dtype=np.float64) / 255.0
    o = np.asarray(original.convert("RGB"), dtype=np.float64) / 255.0
    e_lab = _rgb_to_lab(e)
    o_lab = _rgb_to_lab(o)
    for c in range(3):
        src = e_lab[..., c]
        dst = o_lab[..., c]
        s_mean, s_std = float(src.mean()), float(src.std()) + 1e-6
        d_mean, d_std = float(dst.mean()), float(dst.std()) + 1e-6
        e_lab[..., c] = (src - s_mean) * (d_std / s_std) + d_mean
    out = (_lab_to_rgb(e_lab) * 255.0).round().astype(np.uint8)
    return Image.fromarray(out, mode="RGB")


def mean_abs_lab_delta(a: Image.Image, b: Image.Image) -> float:
    """Mean absolute Lab difference between two same-size images."""
    aa = np.asarray(a.convert("RGB").resize(b.size, Image.Resampling.LANCZOS), dtype=np.float64) / 255.0
    bb = np.asarray(b.convert("RGB"), dtype=np.float64) / 255.0
    if aa.shape != bb.shape:
        aa = np.asarray(a.convert("RGB").resize(b.size, Image.Resampling.LANCZOS), dtype=np.float64) / 255.0
    return float(np.abs(_rgb_to_lab(aa) - _rgb_to_lab(bb)).mean())


def edit_region_blend(
    original: Image.Image,
    edit: Image.Image,
    *,
    diff_threshold: float = 12.0,
    dilate_px: int = 6,
    feather_px: int = 8,
) -> Image.Image:
    """Legacy regional blend — kept for unit tests; NOT used by ``postprocess(full)``."""
    orig = original.convert("RGB")
    ow, oh = orig.size
    edit_up = edit.convert("RGB").resize((ow, oh), Image.Resampling.LANCZOS)

    o_arr = np.asarray(orig, dtype=np.float32)
    e_arr = np.asarray(edit_up, dtype=np.float32)
    o_y = 0.299 * o_arr[..., 0] + 0.587 * o_arr[..., 1] + 0.114 * o_arr[..., 2]
    e_y = 0.299 * e_arr[..., 0] + 0.587 * e_arr[..., 1] + 0.114 * e_arr[..., 2]
    chroma = np.linalg.norm(e_arr - o_arr, axis=-1)
    diff = np.maximum(np.abs(e_y - o_y), chroma * 0.5)

    mask = (diff > diff_threshold).astype(np.uint8) * 255
    mask_img = Image.fromarray(mask, mode="L")
    if dilate_px > 0:
        mask_img = mask_img.filter(ImageFilter.MaxFilter(dilate_px * 2 + 1))
    if feather_px > 0:
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=feather_px))

    alpha = np.asarray(mask_img, dtype=np.float32)[..., None] / 255.0
    blended = e_arr * alpha + o_arr * (1.0 - alpha)
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), mode="RGB")


def gentle_low_chroma_match(
    edit: Image.Image,
    original: Image.Image,
    *,
    chroma_max: float = 16.0,
    strength: float = 0.30,
    max_l_delta: float = 8.0,
) -> Image.Image:
    """Nudge brightness of dull pixels (bg / silver body) toward the original.

    High-chroma pixels are untouched. Only L is shifted, capped, and only where
    *both* edit and original are low-chroma — avoids washing saturated paint
    and avoids banding from hard masks (soft weight via chroma falloff).
    """
    orig = original.convert("RGB")
    edit_up = edit.convert("RGB").resize(orig.size, Image.Resampling.LANCZOS)
    e = np.asarray(edit_up, dtype=np.float64) / 255.0
    o = np.asarray(orig, dtype=np.float64) / 255.0
    e_lab = _rgb_to_lab(e)
    o_lab = _rgb_to_lab(o)
    e_chroma = np.sqrt(e_lab[..., 1] ** 2 + e_lab[..., 2] ** 2)
    o_chroma = np.sqrt(o_lab[..., 1] ** 2 + o_lab[..., 2] ** 2)
    # Soft weight: 1 when both chromas << chroma_max, 0 when either is colourful.
    w_e = np.clip(1.0 - e_chroma / chroma_max, 0.0, 1.0)
    w_o = np.clip(1.0 - o_chroma / chroma_max, 0.0, 1.0)
    w = (w_e * w_o)[..., None] * strength
    dL = np.clip(o_lab[..., 0] - e_lab[..., 0], -max_l_delta, max_l_delta)
    out_lab = e_lab.copy()
    out_lab[..., 0] = e_lab[..., 0] + dL * w[..., 0]
    out = (_lab_to_rgb(out_lab) * 255.0).round().astype(np.uint8)
    return Image.fromarray(out, mode="RGB")


def postprocess_mode_for_part(part: str, entry: dict | None = None) -> PostprocessMode:
    """Resolve ``full`` vs ``none`` from a prompts.json entry.

    Default is ``none`` (raw Lanczos only) — matching current prompts.json.
    """
    if entry and entry.get("postprocess") in ("full", "none"):
        return entry["postprocess"]  # type: ignore[return-value]
    return "none"


def postprocess_none(original: Image.Image, raw_edit: Image.Image) -> Image.Image:
    """Raw edit only — Lanczos upscale/downscale to original size."""
    orig = original.convert("RGB")
    return raw_edit.convert("RGB").resize(orig.size, Image.Resampling.LANCZOS)


def postprocess(
    original: Image.Image,
    raw_edit: Image.Image,
    *,
    debug_dir: str | Path | None = None,
    stem: str = "edit",
    restore_number_plate: bool = True,
    mode: PostprocessMode = "none",
    # Off by default: soft L-match produced wheel halos on Corolla sheets.
    gentle_match: bool = False,
) -> Image.Image:
    """Apply post-process policy.

    ``none`` = resize only (live default for every Detailed option).
    ``full`` = resize → (optional gentle L match) → plate paste-back
    (plate only if ``AUTOMOD_PLATE_RESTORE=1``).
    Regional edit-mask blend is intentionally never applied.
    """
    if mode == "none":
        final = postprocess_none(original, raw_edit)
    else:
        resized = postprocess_none(original, raw_edit)
        if gentle_match:
            final = gentle_low_chroma_match(resized, original)
        else:
            final = resized
        if restore_number_plate:
            from plate import restore_plate_safe

            final = restore_plate_safe(original, final)

    debug = debug_dir if debug_dir is not None else (
        Path(os.environ["AUTOMOD_DEBUG_DIR"])
        if os.environ.get("AUTOMOD_DEBUG") == "1" and os.environ.get("AUTOMOD_DEBUG_DIR")
        else None
    )
    if os.environ.get("AUTOMOD_DEBUG") == "1":
        out_dir = Path(debug) if debug else Path(os.environ.get("AUTOMOD_DEBUG_DIR", "/tmp/automod_qwen_debug"))
        out_dir.mkdir(parents=True, exist_ok=True)
        raw_edit.convert("RGB").save(out_dir / f"{stem}_raw.png")
        final.save(out_dir / f"{stem}_post.png")

    return final

#!/usr/bin/env python3
"""
One-time preprocessing: build a clean-plate background estimate from the
locked-camera turntable sequence, then difference-matte every frame against
it in Lab color space, baking the result to alpha-transparent PNGs.

Usage:
    python3 scripts/build_matte.py [--low 9] [--high 28] [--frame N]

Run with --frame N to process (and preview) a single frame quickly while
tuning thresholds; omit it to process the full sequence.
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FRAMES_DIR = ROOT / "public" / "frames"
OUT_DIR = ROOT / "public" / "frames-matted"
CACHE_DIR = ROOT / "scripts" / ".cache"
PLATE_PATH = CACHE_DIR / "background_plate.png"
TRUSTED_MASK_PATH = CACHE_DIR / "trusted_mask.png"

FRAME_COUNT = 300
FRAME_NAME = "ezgif-frame-{:03d}.jpg"
OUT_NAME = "ezgif-frame-{:03d}.png"


def load_frames():
    frames = []
    for i in range(1, FRAME_COUNT + 1):
        p = FRAMES_DIR / FRAME_NAME.format(i)
        if not p.exists():
            sys.exit(f"Missing frame: {p}")
        frames.append(np.asarray(Image.open(p).convert("RGB"), dtype=np.uint8))
    return frames


def build_plate(frames, std_cutoff=None, debug_prefix=None):
    """Background estimate for a locked-camera turntable sequence.

    Plain per-pixel median-across-frames fails in the central region: the
    car sits there in effectively every frame (it's centered on the
    turntable), so there's no majority of "background" samples to recover
    there — median just gives a blurred ghost of the car.

    Instead: compute per-pixel temporal variance. True background (the
    static studio floor/wall) has low frame-to-frame variance; anywhere the
    car sweeps through has high variance from different paint/glass/trim
    colors passing through. Trust the median only where variance is low,
    then reconstruct the untrusted (always-occluded) region by fitting a
    smooth 2D polynomial — appropriate since the studio backdrop is a
    smooth gradient with no texture to preserve — to the trusted pixels,
    and blending it in with a feathered mask so there's no seam.
    """
    stack = np.stack(frames, axis=0).astype(np.float32)  # (N,H,W,3)
    median = np.median(stack, axis=0)  # (H,W,3)
    luminance = stack.mean(axis=-1)  # (N,H,W)
    std_map = luminance.std(axis=0)  # (H,W)
    del stack, luminance

    if debug_prefix:
        norm = (std_map / std_map.max() * 255).astype(np.uint8)
        Image.fromarray(norm, mode="L").save(f"{debug_prefix}_std.png")

    if std_cutoff is None:
        # Empirically (see scripts/README or std percentile dump): background
        # pixels cluster below ~15, the car region jumps to ~36+. 22 sits
        # cleanly in that gap.
        std_cutoff = 22.0

    trusted = std_map < std_cutoff  # (H,W) bool

    # Erode inward: the mask boundary sits exactly where variance crosses
    # the cutoff, which is contaminated by partial car/background blending
    # at that edge. Shrinking the trusted region a few pixels keeps only
    # deep-interior, unambiguous background as inpainting source data.
    trusted_u8 = (trusted * 255).astype(np.uint8)
    trusted_u8 = cv2.erode(trusted_u8, np.ones((9, 9), np.uint8))
    trusted = trusted_u8 > 0

    if debug_prefix:
        Image.fromarray(trusted_u8, mode="L").save(f"{debug_prefix}_trusted_mask.png")

    # The studio backdrop has a floor/wall seam (different gradients meeting
    # at a horizon line) — a single smooth parametric surface fit across the
    # whole occluded region blends the two together incorrectly. cv2.inpaint
    # instead propagates inward from the trusted boundary in every local
    # direction, which naturally respects that seam.
    inpaint_mask = (~trusted).astype(np.uint8) * 255
    median_u8 = np.clip(median, 0, 255).astype(np.uint8)
    inpainted = cv2.inpaint(median_u8, inpaint_mask, inpaintRadius=25, flags=cv2.INPAINT_NS)

    # Feather the mask so the inpainted fill blends smoothly into the real
    # (median) background rather than showing a hard seam at the boundary.
    feather = Image.fromarray(inpaint_mask, mode="L").filter(ImageFilter.GaussianBlur(8))
    feather_arr = (np.asarray(feather).astype(np.float32) / 255.0)[..., None]
    plate = feather_arr * inpainted.astype(np.float32) + (1 - feather_arr) * median

    return plate, trusted  # float32 0-255, bool (H,W)


# ---- sRGB (0-255) -> CIE Lab, fully vectorized ----
def srgb_to_lab(img_u8):
    c = img_u8.astype(np.float64) / 255.0
    linear = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = linear[..., 0], linear[..., 1], linear[..., 2]

    x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b

    xn, yn, zn = 0.95047, 1.0, 1.08883
    xr, yr, zr = x / xn, y / yn, z / zn

    delta = 6.0 / 29.0

    def f(t):
        return np.where(t > delta ** 3, np.cbrt(t), t / (3 * delta ** 2) + 4.0 / 29.0)

    fx, fy, fz = f(xr), f(yr), f(zr)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_ = 200.0 * (fy - fz)
    return np.stack([L, a, b_], axis=-1)


def smoothstep(x, edge0, edge1):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def matte_frame(frame_u8, plate_lab, low, high):
    frame_lab = srgb_to_lab(frame_u8)
    dist = np.sqrt(np.sum((frame_lab - plate_lab) ** 2, axis=-1))
    alpha = smoothstep(dist, low, high)  # 0..1
    alpha_u8 = (alpha * 255).astype(np.uint8)

    # Morphological closing: a small transparent hole fully enclosed within
    # opaque car geometry can't be real background (background isn't
    # trapped inside a solid body panel) — it's a local coincidental color
    # match between this frame and the reconstructed plate guess. Closing
    # bridges gaps up to the kernel size while leaving the true silhouette
    # edge alone, since that edge borders real background, not an enclosure.
    alpha_u8 = cv2.morphologyEx(
        alpha_u8, cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8)
    )

    # Slight blur on the alpha channel only, to soften jaggy JPEG-block edges
    alpha_img = Image.fromarray(alpha_u8, mode="L").filter(ImageFilter.GaussianBlur(0.6))
    rgba = np.dstack([frame_u8, np.asarray(alpha_img)])
    return Image.fromarray(rgba, mode="RGBA"), dist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--low", type=float, default=9.0)
    ap.add_argument("--high", type=float, default=28.0)
    ap.add_argument("--frame", type=int, default=None, help="process just this 1-indexed frame")
    ap.add_argument("--rebuild-plate", action="store_true", help="ignore any cached plate")
    ap.add_argument("--std-cutoff", type=float, default=None)
    args = ap.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading {FRAME_COUNT} frames from {FRAMES_DIR} ...")
    frames = load_frames()

    if PLATE_PATH.exists() and TRUSTED_MASK_PATH.exists() and not args.rebuild_plate:
        print(f"Reusing existing plate at {PLATE_PATH}")
        plate = np.asarray(Image.open(PLATE_PATH).convert("RGB"), dtype=np.float32)
        trusted = np.asarray(Image.open(TRUSTED_MASK_PATH).convert("L")) > 0
    else:
        print("Computing background plate (variance-trusted + fitted fill) ...")
        plate, trusted = build_plate(
            frames, std_cutoff=args.std_cutoff, debug_prefix=str(CACHE_DIR / "debug")
        )
        Image.fromarray(plate.astype(np.uint8), mode="RGB").save(PLATE_PATH)
        Image.fromarray((trusted * 255).astype(np.uint8), mode="L").save(TRUSTED_MASK_PATH)
        print(f"Saved plate -> {PLATE_PATH}")

    plate_lab = srgb_to_lab(plate.astype(np.uint8))

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = [args.frame] if args.frame else range(1, FRAME_COUNT + 1)
    for i in targets:
        frame_u8 = frames[i - 1]
        out_img, dist = matte_frame(frame_u8, plate_lab, args.low, args.high)
        out_path = OUT_DIR / OUT_NAME.format(i)
        out_img.save(out_path)
        if args.frame:
            print(f"frame {i}: dist min/mean/max = {dist.min():.1f}/{dist.mean():.1f}/{dist.max():.1f}")
            print(f"Saved -> {out_path}")

    if not args.frame:
        print(f"Done. Wrote {len(list(targets))} matted PNGs -> {OUT_DIR}")


if __name__ == "__main__":
    main()

"""Unit tests for number-plate paste-back (no model load)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from plate import (  # noqa: E402
    detect_plate_classical,
    expand_box_from_edit,
    restore_plate,
)


def _synthetic_car_with_plate(size=(320, 240), plate=(110, 140, 210, 170)) -> Image.Image:
    """Silver-ish body with a blank light plate rectangle (dark border)."""
    img = Image.new("RGB", size, (160, 160, 165))
    d = ImageDraw.Draw(img)
    d.rectangle(plate, fill=(150, 150, 155), outline=(40, 40, 45), width=3)
    x0, y0, x1, y1 = plate
    d.rectangle((x0 + 3, y0 + 3, x1 - 3, y1 - 3), fill=(175, 175, 178))
    return img


def test_restore_plate_removes_scribble():
    orig = _synthetic_car_with_plate()
    edit = orig.copy()
    d = ImageDraw.Draw(edit)
    # Scribble across left AND right of the plate
    d.text((115, 148), "XY", fill=(10, 10, 10))
    d.text((175, 148), "Z9", fill=(5, 5, 5))
    bbox = (110, 140, 210, 170)
    out = restore_plate(orig, edit, bbox=bbox, feather_px=8)
    core = np.asarray(out.crop((125, 148, 195, 162)), dtype=np.float32)
    orig_core = np.asarray(orig.crop((125, 148, 195, 162)), dtype=np.float32)
    # Colour-match shifts tone slightly; scribble must be gone
    assert float(np.abs(core - orig_core).mean()) < 25.0
    assert (core.mean(axis=-1) < 40).mean() < 0.02
    # Pixels that were near-black in the edit are restored to mid-grey
    edit_lum = np.asarray(edit.crop((125, 148, 195, 162)), dtype=np.float32).mean(axis=-1)
    out_lum = core.mean(axis=-1)
    dark = edit_lum < 50
    if dark.any():
        assert float(out_lum[dark].mean()) > 120.0


def test_expand_covers_right_side_scribble():
    orig = _synthetic_car_with_plate()
    edit = orig.copy()
    d = ImageDraw.Draw(edit)
    d.rectangle((180, 145, 205, 165), fill=(20, 20, 20))  # dark fill on right
    seed = (110, 140, 160, 170)  # only left half
    expanded = expand_box_from_edit(edit, seed, margin_frac=0.12)
    assert expanded[2] >= 205  # reaches the right scribble (+ margin)


def test_restore_plate_noop_when_no_detection(monkeypatch):
    orig = Image.new("RGB", (64, 48), (100, 100, 100))
    edit = Image.new("RGB", (64, 48), (200, 50, 50))
    monkeypatch.setattr("plate.detect_plate", lambda *a, **k: None)
    out = restore_plate(orig, edit, bbox=None)
    assert list(out.getpixel((10, 10))) == [200, 50, 50]


def test_classical_detects_synthetic_plate():
    orig = _synthetic_car_with_plate()
    box = detect_plate_classical(orig)
    assert box is not None
    x0, y0, x1, y1 = box
    ix0, iy0, ix1, iy1 = max(x0, 110), max(y0, 140), min(x1, 210), min(y1, 170)
    assert (ix1 - ix0) > 40 and (iy1 - iy0) > 10


def test_side_view_skips_paste():
    # Wide side-like image with no trunk-like recess — detect_plate should
    # return None when YOLO parts look side-dominant (mocked).
    orig = Image.new("RGB", (400, 200), (170, 170, 175))
    edit = orig.copy()
    fake_parts = {
        "front-door": (40, 40, 180, 160),
        "back-door": (180, 40, 320, 160),
        "rocker-panel": (40, 150, 320, 190),
        "front-wheel": (50, 140, 110, 195),
        "back-wheel": (280, 140, 340, 195),
    }
    with patch("plate._yolo_parts", return_value=fake_parts):
        from plate import detect_plate

        assert detect_plate(orig, edited=edit) is None

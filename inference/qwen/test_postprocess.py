"""Unit tests for Qwen post-processing (no model load)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from postprocess import colour_match, edit_region_blend, mean_abs_lab_delta, postprocess  # noqa: E402
import runner as runner_mod  # noqa: E402

SAMPLES = HERE / "samples"


def _solid(size, color) -> Image.Image:
    return Image.new("RGB", size, color)


def test_colour_match_reduces_global_shift():
    orig = _solid((64, 48), (120, 110, 100))
    # cooler / brighter wash
    edit = _solid((64, 48), (160, 170, 180))
    matched = colour_match(edit, orig)
    before = mean_abs_lab_delta(edit, orig)
    after = mean_abs_lab_delta(matched, orig)
    assert after < before
    assert after < 5.0


def test_edit_region_blend_restores_unchanged_pixels():
    orig = _solid((80, 60), (100, 100, 100))
    edit = orig.copy()
    # paint a bright patch in the center (the "edit")
    px = edit.load()
    for y in range(20, 40):
        for x in range(30, 50):
            px[x, y] = (220, 40, 40)
    out = edit_region_blend(orig, edit, diff_threshold=8, dilate_px=2, feather_px=1)
    # corner should stay original grey
    assert out.getpixel((2, 2)) == (100, 100, 100)
    # center should be closer to red than grey
    r, g, b = out.getpixel((40, 30))
    assert r > 150 and g < 100


def test_postprocess_on_samples_reduces_lab_delta():
    if not (SAMPLES / "original_rear34.png").is_file():
        pytest.skip("sample images not present")
    orig = Image.open(SAMPLES / "original_rear34.png")
    raw = Image.open(SAMPLES / "raw_lip_spoiler.png")
    before = mean_abs_lab_delta(raw, orig)
    fixed = postprocess(orig, raw)
    after = mean_abs_lab_delta(fixed, orig)
    assert after <= before + 0.05  # allow tiny numerical noise
    assert fixed.size == orig.size


def test_runner_cli_mocked(tmp_path):
    """Runner wires prompt + postprocess without loading mflux."""
    inp = tmp_path / "in.png"
    out = tmp_path / "out.png"
    Image.new("RGB", (128, 96), (90, 90, 90)).save(inp)

    fake_raw = Image.new("RGB", (64, 48), (200, 200, 210))
    with patch.object(runner_mod, "_generate", return_value=fake_raw):
        runner_mod.run_edit(inp, out, "lip_spoiler", 7)
    assert out.is_file()
    result = Image.open(out)
    assert result.size == (128, 96)

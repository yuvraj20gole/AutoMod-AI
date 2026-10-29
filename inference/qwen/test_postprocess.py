"""Unit tests for Qwen post-processing (no model load)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from PIL import Image

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from postprocess import (  # noqa: E402
    FULL_POSTPROCESS_PARTS,
    colour_match,
    edit_region_blend,
    gentle_low_chroma_match,
    mean_abs_lab_delta,
    postprocess,
    postprocess_mode_for_part,
    postprocess_none,
)
import runner as runner_mod  # noqa: E402

SAMPLES = HERE / "samples"


def _solid(size, color) -> Image.Image:
    return Image.new("RGB", size, color)


def test_colour_match_reduces_global_shift():
    orig = _solid((64, 48), (120, 110, 100))
    edit = _solid((64, 48), (160, 170, 180))
    matched = colour_match(edit, orig)
    before = mean_abs_lab_delta(edit, orig)
    after = mean_abs_lab_delta(matched, orig)
    assert after < before
    assert after < 5.0


def test_edit_region_blend_restores_unchanged_pixels():
    """Legacy helper still works; full path must not call it."""
    orig = _solid((80, 60), (100, 100, 100))
    edit = orig.copy()
    px = edit.load()
    for y in range(20, 40):
        for x in range(30, 50):
            px[x, y] = (220, 40, 40)
    out = edit_region_blend(orig, edit, diff_threshold=8, dilate_px=2, feather_px=1)
    assert out.getpixel((2, 2)) == (100, 100, 100)
    r, g, b = out.getpixel((40, 30))
    assert r > 150 and g < 100


def test_postprocess_full_never_region_blends(tmp_path):
    """full must keep the whole resized edit — not restore original outside a mask."""
    orig = _solid((100, 80), (180, 180, 185))
    # Entire frame is vivid red at edit resolution — regional blend would
    # have restored silver corners; full must keep red everywhere.
    raw = _solid((50, 40), (220, 30, 40))
    with patch("postprocess.edit_region_blend") as blend:
        out = postprocess(orig, raw, mode="full", restore_number_plate=False)
        blend.assert_not_called()
    assert out.size == orig.size
    r, g, b = out.getpixel((2, 2))
    assert r > 180 and g < 80


def test_gentle_match_preserves_saturated_red():
    orig = _solid((64, 48), (180, 180, 185))
    edit = _solid((64, 48), (220, 30, 40))
    matched = gentle_low_chroma_match(edit, orig)
    r, g, b = matched.getpixel((32, 24))
    assert r > 180 and g < 80


def test_gentle_match_nudges_dull_grey_toward_original():
    orig = _solid((64, 48), (140, 140, 145))
    edit = _solid((64, 48), (200, 200, 205))  # brighter dull grey
    matched = gentle_low_chroma_match(edit, orig, strength=0.5, max_l_delta=20)
    # Should move closer to original than the uncorrected edit.
    before = mean_abs_lab_delta(edit, orig)
    after = mean_abs_lab_delta(matched, orig)
    assert after < before


def test_postprocess_on_samples_keeps_size():
    if not (SAMPLES / "original_rear34.png").is_file():
        pytest.skip("sample images not present")
    orig = Image.open(SAMPLES / "original_rear34.png")
    raw = Image.open(SAMPLES / "raw_lip_spoiler.png")
    fixed = postprocess(orig, raw, mode="full")
    assert fixed.size == orig.size


def test_runner_cli_mocked(tmp_path):
    inp = tmp_path / "in.png"
    out = tmp_path / "out.png"
    Image.new("RGB", (128, 96), (90, 90, 90)).save(inp)

    fake_raw = Image.new("RGB", (64, 48), (200, 200, 210))
    with patch.object(runner_mod, "_generate", return_value=fake_raw):
        runner_mod.run_edit(inp, out, "lip_spoiler", 7)
    assert out.is_file()
    assert Image.open(out).size == (128, 96)


def test_prompts_json_postprocess_policy():
    """Every Detailed option is raw-only (postprocess none)."""
    prompts = json.loads((HERE / "prompts.json").read_text())
    for part, entry in prompts.items():
        mode = entry.get("postprocess")
        assert mode == "none", f"{part}: expected none, got {mode}"
        assert postprocess_mode_for_part(part, entry) == "none"
    # Additive parts remain listed for docs, but prompts force none.
    assert "lip_spoiler" in FULL_POSTPROCESS_PARTS


def test_runner_lip_and_skirts_are_raw_none(tmp_path):
    """Live runner path uses none for former full parts (no plate, no blend)."""
    inp = tmp_path / "in.png"
    Image.new("RGB", (100, 80), (170, 170, 175)).save(inp)
    fake_raw = Image.new("RGB", (50, 40), (40, 40, 50))
    for part in ("lip_spoiler", "side_skirts"):
        out = tmp_path / f"{part}.png"
        with patch.object(runner_mod, "_generate", return_value=fake_raw):
            with patch("postprocess.edit_region_blend") as blend:
                with patch("plate.restore_plate_safe") as plate:
                    runner_mod.run_edit(inp, out, part, 7)
                    blend.assert_not_called()
                    plate.assert_not_called()
        assert Image.open(out).size == (100, 80)


def test_postprocess_none_preserves_edit_colour():
    orig = _solid((128, 96), (180, 180, 185))
    raw = _solid((64, 48), (220, 30, 40))
    none_out = postprocess(orig, raw, mode="none")
    assert none_out.size == orig.size
    nr, ng, nb = none_out.getpixel((64, 48))
    assert nr > 180 and ng < 80


def test_runner_paint_none_preserves_vivid_colour(tmp_path):
    inp = tmp_path / "in.png"
    out = tmp_path / "out.png"
    Image.new("RGB", (100, 80), (170, 170, 175)).save(inp)
    fake_raw = Image.new("RGB", (50, 40), (30, 200, 40))
    with patch.object(runner_mod, "_generate", return_value=fake_raw):
        runner_mod.run_edit(inp, out, "paint_candy_red", 7)
    r, g, b = Image.open(out).getpixel((50, 40))
    assert g > 150 and r < 80


def test_plate_restore_flag_defaults_off(monkeypatch):
    from plate import restore_plate_safe

    orig = _solid((40, 30), (180, 180, 185))
    edit = _solid((40, 30), (20, 20, 25))
    monkeypatch.delenv("AUTOMOD_PLATE_RESTORE", raising=False)
    out = restore_plate_safe(orig, edit)
    assert out.getpixel((20, 15)) == (20, 20, 25)  # unchanged — flag off


def test_plate_restore_flag_can_enable(monkeypatch):
    from plate import restore_plate_safe

    orig = _solid((40, 30), (180, 180, 185))
    edit = _solid((40, 30), (20, 20, 25))
    monkeypatch.setenv("AUTOMOD_PLATE_RESTORE", "1")
    with patch("plate.restore_plate", return_value=orig) as rp:
        out = restore_plate_safe(orig, edit)
        rp.assert_called_once()
        assert out.getpixel((20, 15)) == (180, 180, 185)

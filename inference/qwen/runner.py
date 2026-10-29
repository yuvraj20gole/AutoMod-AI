#!/usr/bin/env python3
"""Short-lived Qwen Image Edit job for AutoMod Detailed.

Loads the q4 model + Lightning LoRA, runs one edit, post-processes, writes
output, and exits so GPU/RAM are released. Invoked as a subprocess by the
inference server — never keep this process alive across jobs.

Usage:
  python runner.py --input in.png --output out.png --part lip_spoiler [--seed 7]
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import traceback
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PROMPTS_PATH = HERE / "prompts.json"
LONG_SIDE = 768
STEPS = 8
GUIDANCE = 2.5
LORA = "lightx2v/Qwen-Image-Lightning:Qwen-Image-Edit-Lightning-8steps-V1.0-bf16.safetensors"
LORA_SCALE = 0.5
MODEL_PATH = "mflux-community/qwen-image-edit-2511-mflux-q4"


def load_prompts() -> dict:
    return json.loads(PROMPTS_PATH.read_text())


def resize_long_side(img: Image.Image, long_side: int = LONG_SIDE) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    scale = long_side / max(w, h)
    nw = max(16, (int(round(w * scale)) // 16) * 16)
    nh = max(16, (int(round(h * scale)) // 16) * 16)
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def run_edit(input_path: Path, output_path: Path, part: str, seed: int | None) -> None:
    prompts = load_prompts()
    if part not in prompts:
        raise SystemExit(f"unknown part {part!r}; known: {sorted(prompts)}")
    entry = prompts[part]
    prompt = entry["prompt"]
    use_seed = int(seed if seed is not None else entry["seed"])

    original = Image.open(input_path).convert("RGB")
    small = resize_long_side(original, LONG_SIDE)
    w, h = small.size

    with tempfile.TemporaryDirectory(prefix="automod_qwen_") as tmp:
        tmp_in = Path(tmp) / "in.png"
        tmp_raw = Path(tmp) / "raw.png"
        small.save(tmp_in)

        # Prefer the Python API when mflux is importable in this interpreter;
        # otherwise shell out to mflux-generate-qwen-edit.
        raw = _generate(tmp_in, tmp_raw, prompt, use_seed, w, h)

        from postprocess import postprocess  # same directory when run as script

        final = postprocess(original, raw, stem=part)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        final.save(output_path)
        print(
            f"OK part={part} seed={use_seed} size={final.size[0]}x{final.size[1]} -> {output_path}",
            flush=True,
        )


def _generate(tmp_in: Path, tmp_raw: Path, prompt: str, seed: int, w: int, h: int) -> Image.Image:
    try:
        from mflux.models.common.config.model_config import ModelConfig
        from mflux.models.qwen.variants.edit.qwen_image_edit import QwenImageEdit
    except ImportError:
        return _generate_cli(tmp_in, tmp_raw, prompt, seed, w, h)

    print(f"Loading {MODEL_PATH}…", flush=True)
    model = QwenImageEdit(
        model_config=ModelConfig.qwen_image_edit_2511(),
        model_path=MODEL_PATH,
        lora_paths=[LORA],
        lora_scales=[LORA_SCALE],
        bake_lora=False,
    )
    image = model.generate_image(
        seed=seed,
        prompt=prompt,
        image_paths=[str(tmp_in)],
        image_path=str(tmp_in),
        num_inference_steps=STEPS,
        guidance=GUIDANCE,
        width=w,
        height=h,
    )
    image.save(path=tmp_raw)
    return Image.open(tmp_raw).convert("RGB")


def _generate_cli(tmp_in: Path, tmp_raw: Path, prompt: str, seed: int, w: int, h: int) -> Image.Image:
    import subprocess

    from availability import mflux_cli

    cli = mflux_cli()
    if not cli:
        raise RuntimeError("mflux not importable and mflux-generate-qwen-edit not on PATH")
    cmd = [
        cli,
        "--model",
        MODEL_PATH,
        "--base-model",
        "qwen-image-edit-2511",
        "--image-paths",
        str(tmp_in),
        "--prompt",
        prompt,
        "--steps",
        str(STEPS),
        "--guidance",
        str(GUIDANCE),
        "--seed",
        str(seed),
        "--width",
        str(w),
        "--height",
        str(h),
        "--output",
        str(tmp_raw),
        "--lora-paths",
        LORA,
        "--lora-scales",
        str(LORA_SCALE),
        "--no-bake-lora",
    ]
    print("Running:", " ".join(cmd[:8]), "…", flush=True)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        raise RuntimeError(f"mflux CLI failed with code {proc.returncode}")
    if not tmp_raw.is_file():
        raise RuntimeError("mflux CLI exited 0 but wrote no output")
    return Image.open(tmp_raw).convert("RGB")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="AutoMod Detailed (Qwen) single-edit runner")
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--part", required=True, help="Key in prompts.json")
    p.add_argument("--seed", type=int, default=None)
    args = p.parse_args(argv)
    if not args.input.is_file():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        return 2
    try:
        # Allow `python runner.py` from any cwd
        sys.path.insert(0, str(HERE))
        run_edit(args.input, args.output, args.part, args.seed)
        return 0
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 1
        if e.code and not isinstance(e.code, int):
            print(f"ERROR: {e.code}", file=sys.stderr)
        return code or 1
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

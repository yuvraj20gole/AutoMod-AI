"""InstructPix2Pix (diffusers) image editor — free, local/Colab GPU."""

from __future__ import annotations

import logging
from typing import Optional

from PIL import Image

logger = logging.getLogger("pipeline.instruct_pix2pix")

DEFAULT_MODEL_ID = "timbrooks/instruct-pix2pix"

# Leak + "no-op" both belong here. Do not pile "do not X" into the positive prompt —
# InstructPix2Pix treats long negation lists as a reason to barely edit.
DEFAULT_NEGATIVE_PROMPT = (
    "tinted windows, colored glass, painted windshield, red glass, blue glass, green glass, "
    "colored headlights, tinted headlights, yellow headlights, painted wheels, body-colored wheels, "
    "color bleed onto glass, color bleed onto tires, color cast on chrome, recolored license plate, "
    "unchanged body color, original paint, identical to input, no color change, "
    "blurry, distorted, different car, different camera angle"
)


def center_square_resize(image: Image.Image, resolution: int) -> Image.Image:
    """Center-crop to square, then resize to exact resolution. Always returns RGB."""
    img = image.convert("RGB")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    return img.resize((resolution, resolution), Image.Resampling.LANCZOS)


def enforce_square(image: Image.Image, resolution: int) -> Image.Image:
    """Guarantee exact (resolution, resolution) RGB output."""
    img = image.convert("RGB")
    if img.size != (resolution, resolution):
        img = center_square_resize(img, resolution)
    return img


class InstructPix2PixEditor:
    """
    Wrapper around StableDiffusionInstructPix2PixPipeline.

    Tuned for Colab free-tier T4 (16GB):
      - float16
      - 512px square I/O (hard-enforced on output)
      - image_guidance_scale ~2.0 (preserve structure, reduce leak)
      - Euler Ancestral scheduler
    """

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        device: Optional[str] = None,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.0,
        image_guidance_scale: float = 2.0,
        resolution: int = 512,
        negative_prompt: str = DEFAULT_NEGATIVE_PROMPT,
    ):
        import torch
        from diffusers import EulerAncestralDiscreteScheduler, StableDiffusionInstructPix2PixPipeline

        self.num_inference_steps = num_inference_steps
        self.guidance_scale = guidance_scale
        self.image_guidance_scale = image_guidance_scale
        self.resolution = resolution
        self.negative_prompt = negative_prompt

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device

        dtype = torch.float16 if device == "cuda" else torch.float32
        logger.info(
            "Loading InstructPix2Pix (%s) on %s | steps=%d image_guidance=%.2f res=%d",
            model_id,
            device,
            num_inference_steps,
            image_guidance_scale,
            resolution,
        )

        self.pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
            model_id,
            torch_dtype=dtype,
            safety_checker=None,
            requires_safety_checker=False,
        )
        self.pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(self.pipe.scheduler.config)
        self.pipe = self.pipe.to(device)

        if device == "cuda":
            try:
                self.pipe.enable_attention_slicing()
            except Exception:
                pass

        logger.info("InstructPix2Pix ready.")

    def prepare_before(self, image: Image.Image) -> Image.Image:
        """Canonical 512×512 before crop used for both editing and saving."""
        return center_square_resize(image, self.resolution)

    def edit(self, image: Image.Image, prompt: str, seed: Optional[int] = None) -> Image.Image:
        """
        Edit image. Input may be any size; output is ALWAYS exactly (resolution, resolution).
        Prefer passing an already-prepared 512×512 before for consistency.
        """
        import torch

        prepared = enforce_square(image, self.resolution)
        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        call_kwargs = dict(
            prompt=prompt,
            negative_prompt=self.negative_prompt,
            image=prepared,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            image_guidance_scale=self.image_guidance_scale,
            generator=generator,
        )
        try:
            result = self.pipe(height=self.resolution, width=self.resolution, **call_kwargs)
        except TypeError:
            result = self.pipe(**call_kwargs)

        out = result.images[0].convert("RGB")
        if out.size != (self.resolution, self.resolution):
            logger.warning(
                "InstructPix2Pix returned %s, resizing to %dx%d",
                out.size,
                self.resolution,
                self.resolution,
            )
            out = out.resize((self.resolution, self.resolution), Image.Resampling.LANCZOS)
        return out

"""Claude Vision automated validation step for before/after car modification dataset."""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Tuple, Union
from PIL import Image

import anthropic
from dotenv import load_dotenv

from scraper.config import CLAUDE_VISION_MODEL

load_dotenv()
load_dotenv(".env.local")

logger = logging.getLogger("scraper.vision_validator")

VISION_JUDGMENT_SYSTEM_PROMPT = """You are an expert automotive and computer vision data quality auditor evaluating "Before" and "After" car modification photo pairs for an AI image-to-image dataset.

Your task is to examine two images (Image 1 = "Before", Image 2 = "After") and evaluate them on four strict criteria:

1. SAME VEHICLE: Is this genuinely the same vehicle model, generation, and body proportions in both images? (Minor angle difference is fine; two completely different cars or unrelated subjects is a FAIL).
2. CLEAN "BEFORE" VIEW: Is the "Before" image a clean, complete, clear view of the vehicle or full body panel? (FAIL if it is a messy in-progress installation shot with hands, squeegees, heat guns, half-peeled vinyl, masking tape, or an extreme macro crop like just a lug nut/badge/stitching).
3. CLEAN "AFTER" VIEW: Is the "After" image a clean, complete, finished view of the vehicle? (FAIL if it contains hands, installation tools, or is mid-progress).
4. VISIBLE MODIFICATION: Is there a clearly discernible, meaningful modification or transformation between Before and After (e.g. color change wrap, livery, body kit, wheels, front splitter, spoiler, suspension/stance)? (FAIL if both images look virtually identical or if it's only an invisible clear PPF/coating with zero visible difference).

Respond ONLY with valid JSON matching this exact schema:
{
  "passed": true,
  "same_vehicle": true,
  "clean_before": true,
  "clean_after": true,
  "visible_modification": true,
  "mod_type": "string describing modification e.g. color wrap from grey to satin green",
  "reason": "1-2 concise sentences summarizing your verdict"
}
"""


class VisionPairValidator:
    """Automated vision-based dataset pair auditor using Claude's multimodal API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model = model or CLAUDE_VISION_MODEL
        self.client: Optional[anthropic.Anthropic] = None

        if self.api_key:
            try:
                self.client = anthropic.Anthropic(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Could not initialize Anthropic client: {e}")
        else:
            logger.warning(
                "ANTHROPIC_API_KEY not found in environment or .env/.env.local. "
                "Vision validation will be disabled until key is provided."
            )

    def is_available(self) -> bool:
        """Check if Claude vision validator is ready."""
        return self.client is not None

    def _image_to_base64_jpeg(self, img: Image.Image, max_dim: int = 1200) -> str:
        """Resize image if needed and convert to base64 JPEG."""
        im = img.copy()
        if im.mode != "RGB":
            im = im.convert("RGB")

        # Resize large images to keep latency and tokens reasonable while maintaining high visual fidelity
        w, h = im.size
        if max(w, h) > max_dim:
            if w > h:
                new_w = max_dim
                new_h = int(h * (max_dim / float(w)))
            else:
                new_h = max_dim
                new_w = int(w * (max_dim / float(h)))
            im = im.resize((new_w, new_h), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        im.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def validate_pair(
        self,
        img_before: Image.Image,
        img_after: Image.Image,
        pair_title: str = "",
    ) -> Dict[str, Any]:
        """
        Send before/after images to Claude Vision to judge pair validity.

        Returns a dictionary with:
        - passed: bool
        - reason: str
        - details: Dict[str, Any]
        """
        if not self.is_available():
            logger.debug("Vision validation skipped: Anthropic client not initialized.")
            return {
                "passed": True,
                "reason": "Vision validation skipped (no API key configured)",
                "details": {"skipped": True},
            }

        try:
            b64_before = self._image_to_base64_jpeg(img_before)
            b64_after = self._image_to_base64_jpeg(img_after)

            prompt_text = (
                f"Please evaluate this car modification pair.\n"
                f"Candidate Title: {pair_title or 'Untitled Pair'}\n"
                f"Image 1 = 'Before' candidate\n"
                f"Image 2 = 'After' candidate\n\n"
                f"Evaluate the 4 criteria and return the JSON decision."
            )

            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                temperature=0.0,
                system=VISION_JUDGMENT_SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Image 1 (Before):"},
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": b64_before,
                                },
                            },
                            {"type": "text", "text": "Image 2 (After):"},
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": b64_after,
                                },
                            },
                            {"type": "text", "text": prompt_text},
                        ],
                    }
                ],
            )

            response_text = ""
            for block in response.content:
                if getattr(block, "type", "") == "text":
                    response_text += block.text

            # Parse JSON from response
            cleaned_json = response_text.strip()
            # If wrapped in markdown code fence
            if "```" in cleaned_json:
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned_json)
                if match:
                    cleaned_json = match.group(1).strip()

            parsed = json.loads(cleaned_json)
            passed = bool(parsed.get("passed", False))
            reason = parsed.get("reason", "No reason provided")

            logger.info(
                f"Vision Validation for '{pair_title[:40]}': "
                f"[{'PASS' if passed else 'FAIL'}] — {reason}"
            )

            return {
                "passed": passed,
                "reason": reason,
                "details": parsed,
                "model": self.model,
            }

        except Exception as e:
            logger.error(f"Error during Claude vision validation: {e}")
            # Fail closed or open depending on preference; default to warning & pass to avoid hard pipeline blocker if network glitch
            return {
                "passed": False,
                "reason": f"Vision validator error: {str(e)}",
                "details": {"error": str(e)},
            }

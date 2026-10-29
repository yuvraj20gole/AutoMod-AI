"""Image downloading, validation, splitting, and processing utilities."""

from __future__ import annotations

import io
import logging
from typing import Optional, Tuple
import requests
from PIL import Image, ImageOps

from scraper.config import (
    DEFAULT_USER_AGENT,
    MIN_IMAGE_WIDTH,
    MIN_IMAGE_HEIGHT,
    TIMEOUT_SECONDS,
)

logger = logging.getLogger("scraper.images")


def download_image(
    url: str,
    user_agent: str = DEFAULT_USER_AGENT,
    timeout: int = TIMEOUT_SECONDS,
) -> Optional[Image.Image]:
    """Download an image from a URL and return it as an RGB PIL Image."""
    if not url or not url.startswith("http"):
        return None

    headers = {
        "User-Agent": user_agent,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/",
    }

    try:
        response = requests.get(url, headers=headers, timeout=timeout, stream=True)
        if response.status_code != 200:
            logger.debug(f"Failed to fetch {url} (HTTP {response.status_code})")
            return None

        content_type = response.headers.get("Content-Type", "")
        if "text/html" in content_type:
            # Not an image (likely redirect or block page)
            return None

        img_bytes = response.content
        if len(img_bytes) < 2000:  # less than 2KB is likely a tracking pixel or icon
            return None

        img = Image.open(io.BytesIO(img_bytes))
        # Handle EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Convert to RGB (strip Alpha / CMYK / P modes)
        if img.mode != "RGB":
            img = img.convert("RGB")

        return img
    except Exception as e:
        logger.debug(f"Error downloading image from {url}: {e}")
        return None


def validate_image_dimensions(
    img: Image.Image,
    min_width: int = MIN_IMAGE_WIDTH,
    min_height: int = MIN_IMAGE_HEIGHT,
) -> bool:
    """Validate that image meets minimum resolution requirements."""
    if not img:
        return False
    w, h = img.size
    return w >= min_width and h >= min_height


def is_side_by_side_collage(img: Image.Image) -> bool:
    """
    Heuristic to check if a single image is likely a horizontal side-by-side
    before/after comparison (typically wide aspect ratio: width/height >= 1.45).
    """
    if not img:
        return False
    w, h = img.size
    aspect_ratio = w / float(h)
    return aspect_ratio >= 1.45 and w >= 800


def is_stacked_collage(img: Image.Image) -> bool:
    """
    Heuristic to check if a single image is likely a vertically stacked
    before/after comparison (typically tall aspect ratio: height/width >= 1.45).
    """
    if not img:
        return False
    w, h = img.size
    aspect_ratio = h / float(w)
    return aspect_ratio >= 1.45 and h >= 800


def split_horizontal_collage(
    img: Image.Image,
) -> Tuple[Image.Image, Image.Image]:
    """Split a wide side-by-side image in half: Left = Before, Right = After."""
    w, h = img.size
    mid_x = w // 2
    # Left crop (0, 0, mid_x, h)
    left_img = img.crop((0, 0, mid_x, h))
    # Right crop (mid_x, 0, w, h)
    right_img = img.crop((mid_x, 0, w, h))
    return left_img, right_img


def split_vertical_collage(
    img: Image.Image,
) -> Tuple[Image.Image, Image.Image]:
    """Split a tall stacked image in half: Top = Before, Bottom = After."""
    w, h = img.size
    mid_y = h // 2
    # Top crop (0, 0, w, mid_y)
    top_img = img.crop((0, 0, w, mid_y))
    # Bottom crop (0, mid_y, w, h)
    bottom_img = img.crop((0, mid_y, w, h))
    return top_img, bottom_img


def is_likely_full_shot(img: Image.Image, alt_or_url: str = "") -> Tuple[float, str]:
    """
    Score whether an image is likely a full-car or full-panel angle rather than a tight detail crop.
    
    Returns (score, reason):
    - Landscape orientation (aspect ratio 1.25 to 1.85) is standard for full vehicle shots.
    - Extreme close-up keywords (lug nuts, calipers, badges, emblems, stitching, door handle, tire tread) get penalized.
    - Full-car keywords (front, rear, side, profile, main, 3/4, overall, wide) get boosted.
    - Very high resolution / wide framing gets positive score.
    """
    if not img:
        return (0.0, "empty")

    w, h = img.size
    aspect = w / float(h)
    score = 1.0
    reasons = []

    # Aspect ratio preference: full car/panel shots are typically landscape (1.2 to 1.9)
    if 1.25 <= aspect <= 1.85:
        score += 0.8
        reasons.append("landscape_aspect")
    elif 0.75 <= aspect <= 1.25:
        # square or slight portrait (sometimes okay for 3/4 front, but lower priority)
        score += 0.2
        reasons.append("square_or_portrait")
    elif aspect > 2.2 or aspect < 0.5:
        # extreme banner or panoramic slit
        score -= 0.6
        reasons.append("extreme_aspect")

    # Resolution weight: larger images often capture the full vehicle
    if w >= 1600 and h >= 900:
        score += 0.5
        reasons.append("high_res")

    # Text / naming cues
    text = (alt_or_url or "").lower()
    
    # Penalize close-up crop indicators
    crop_keywords = [
        "caliper", "brake", "lug", "nut", "badge", "emblem", "door handle",
        "stitching", "interior", "steering", "exhaust tip", "detail", "close-up",
        "closeup", "macro", "tread", "tire", "tyre", "mirror cap", "side mirror"
    ]
    if any(k in text for k in crop_keywords):
        score -= 1.2
        reasons.append("detail_crop_keyword")

    # Reward full vehicle cues
    full_keywords = [
        "main", "cover", "front", "rear", "side", "profile", "three-quarter",
        "3-4", "3/4", "overall", "hero", "full", "exterior", "walkaround", "angle"
    ]
    if any(k in text for k in full_keywords):
        score += 1.0
        reasons.append("full_vehicle_keyword")

    return (score, ",".join(reasons))


"""Wheel (and optional window) instance masks on CompCars images.

Primary backend: YOLOv11 car-parts segmentation (Ultralytics carparts-seg classes,
including ``wheel``). Geometric Hough-circle fallback if the detector finds nothing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from pipeline.config import (
    WHEEL_CLASS_NAMES,
    WHEEL_SEG_CONF,
    WHEEL_SEG_MODEL_ID,
    WHEEL_SEG_WEIGHTS_FILE,
    WINDOW_CLASS_SUBSTRINGS,
)

logger = logging.getLogger("pipeline.wheel_segmenter")

BBox = Tuple[int, int, int, int]


@dataclass
class WheelSegResult:
    wheels: np.ndarray  # HxW uint8, 0 or 255
    windows: np.ndarray
    n_wheels: int  # connected components after cleanup
    n_wheel_detections: int  # raw YOLO wheel hits (preferred metric)
    n_windows: int
    backend: str
    confidences: List[float] = field(default_factory=list)
    class_hits: Dict[str, int] = field(default_factory=dict)

    @property
    def wheel_area_px(self) -> int:
        return int((self.wheels > 0).sum())


def _blank(h: int, w: int) -> np.ndarray:
    return np.zeros((h, w), dtype=np.uint8)


def _clip_bbox(bbox: BBox, w: int, h: int, pad_frac: float = 0.08) -> BBox:
    x1, y1, x2, y2 = bbox
    bw, bh = max(1, x2 - x1), max(1, y2 - y1)
    px, py = int(bw * pad_frac), int(bh * pad_frac)
    return (
        max(0, x1 - px),
        max(0, y1 - py),
        min(w, x2 + px),
        min(h, y2 + py),
    )


def _apply_bbox_gate(mask: np.ndarray, bbox: Optional[BBox]) -> np.ndarray:
    if bbox is None:
        return mask
    h, w = mask.shape
    x1, y1, x2, y2 = _clip_bbox(bbox, w, h)
    gated = _blank(h, w)
    gated[y1:y2, x1:x2] = mask[y1:y2, x1:x2]
    return gated


def _drop_tiny(mask: np.ndarray, bbox: Optional[BBox], min_frac: float = 0.002) -> np.ndarray:
    """Remove connected components smaller than min_frac of the vehicle bbox area."""
    import cv2

    if mask.max() == 0:
        return mask
    h, w = mask.shape
    if bbox is None:
        ref_area = h * w
    else:
        x1, y1, x2, y2 = bbox
        ref_area = max(1, (x2 - x1) * (y2 - y1))
    min_area = max(40, int(ref_area * min_frac))

    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), connectivity=8)
    out = _blank(h, w)
    kept = 0
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            out[labels == i] = 255
            kept += 1
    return out


def count_components(mask: np.ndarray) -> int:
    import cv2

    if mask.max() == 0:
        return 0
    n, _ = cv2.connectedComponents((mask > 0).astype(np.uint8), connectivity=8)
    return max(0, n - 1)


def overlay_wheels(image: Image.Image, wheels: np.ndarray, color: Tuple[int, int, int] = (255, 40, 40)) -> Image.Image:
    rgb = np.array(image.convert("RGB"), dtype=np.float32)
    tint = np.zeros_like(rgb)
    tint[..., 0] = color[0]
    tint[..., 1] = color[1]
    tint[..., 2] = color[2]
    m = (wheels > 0).astype(np.float32)[..., None]
    blended = rgb * (1.0 - 0.55 * m) + tint * (0.55 * m)
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8))


class WheelSegmenter:
    """Load once, segment many images."""

    def __init__(self, conf: float = WHEEL_SEG_CONF):
        self.conf = conf
        self.model = None
        self.backend_name = "none"
        self._load_yolo()

    def _load_yolo(self) -> None:
        try:
            from huggingface_hub import hf_hub_download
            from ultralytics import YOLO
        except ImportError as exc:
            raise SystemExit(
                "Part 3 needs ultralytics + huggingface_hub. Install with:\n"
                "  pip install -r pipeline/requirements.txt"
            ) from exc

        weights = hf_hub_download(
            repo_id=WHEEL_SEG_MODEL_ID,
            filename=WHEEL_SEG_WEIGHTS_FILE,
        )
        self.model = YOLO(weights)
        self.backend_name = "yolo_carparts"
        logger.info("Loaded wheel segmenter from %s/%s", WHEEL_SEG_MODEL_ID, WHEEL_SEG_WEIGHTS_FILE)

    def segment(
        self,
        image: Image.Image,
        vehicle_bbox: Optional[BBox] = None,
        hough_fallback: bool = True,
    ) -> WheelSegResult:
        rgb = np.array(image.convert("RGB"))
        h, w = rgb.shape[:2]
        wheels = _blank(h, w)
        windows = _blank(h, w)
        confidences: List[float] = []
        class_hits: Dict[str, int] = {}

        assert self.model is not None
        results = self.model.predict(rgb, conf=self.conf, verbose=False, retina_masks=True)
        result = results[0]
        names: Dict[int, str] = result.names if isinstance(result.names, dict) else dict(enumerate(result.names))

        if result.boxes is not None:
            import cv2

            cls_ids = result.boxes.cls.cpu().numpy().astype(int)
            confs = result.boxes.conf.cpu().numpy()
            xyxy = result.boxes.xyxy.cpu().numpy()
            polygons = result.masks.xy if result.masks is not None else [None] * len(cls_ids)

            for poly, box, cls_id, conf in zip(polygons, xyxy, cls_ids, confs):
                name = str(names.get(int(cls_id), "")).lower().strip()
                class_hits[name] = class_hits.get(name, 0) + 1
                layer = _blank(h, w)
                if poly is not None and len(poly) >= 3:
                    pts = np.round(poly).astype(np.int32)
                    cv2.fillPoly(layer, [pts], 255)
                else:
                    x1, y1, x2, y2 = [int(v) for v in box]
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    ax, ay = max(1, (x2 - x1) // 2), max(1, (y2 - y1) // 2)
                    cv2.ellipse(layer, (cx, cy), (ax, ay), 0, 0, 360, 255, -1)
                if name in WHEEL_CLASS_NAMES or "wheel" in name:
                    wheels = np.maximum(wheels, layer)
                    confidences.append(float(conf))
                elif any(s in name for s in WINDOW_CLASS_SUBSTRINGS):
                    windows = np.maximum(windows, layer)

        wheels = _apply_bbox_gate(wheels, vehicle_bbox)
        windows = _apply_bbox_gate(windows, vehicle_bbox)
        # Break thin side-skirt bridges so front/rear wheels count as separate blobs
        if wheels.max() > 0:
            import cv2

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            wheels = cv2.morphologyEx(wheels, cv2.MORPH_OPEN, kernel)
        wheels = _drop_tiny(wheels, vehicle_bbox)
        windows = _drop_tiny(windows, vehicle_bbox, min_frac=0.001)

        backend = self.backend_name
        n_wheel_detections = len(confidences)
        n_wheels = count_components(wheels)
        if n_wheel_detections == 0 and n_wheels == 0 and hough_fallback and vehicle_bbox is not None:
            wheels = hough_wheel_mask(rgb, vehicle_bbox)
            wheels = _drop_tiny(wheels, vehicle_bbox)
            n_wheels = count_components(wheels)
            if n_wheels:
                backend = "hough_fallback"
                n_wheel_detections = n_wheels
                logger.debug("Hough fallback found %d wheel(s)", n_wheels)

        return WheelSegResult(
            wheels=wheels,
            windows=windows,
            n_wheels=n_wheels,
            n_wheel_detections=n_wheel_detections,
            n_windows=count_components(windows),
            backend=backend,
            confidences=confidences,
            class_hits=class_hits,
        )


def hough_wheel_mask(rgb: np.ndarray, bbox: BBox) -> np.ndarray:
    """Circle detector in the lower 70% of the vehicle box — side/3-quarter views."""
    import cv2

    h, w = rgb.shape[:2]
    x1, y1, x2, y2 = _clip_bbox(bbox, w, h, pad_frac=0.02)
    crop = rgb[y1:y2, x1:x2]
    if crop.size == 0:
        return _blank(h, w)
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    gray = cv2.medianBlur(gray, 5)
    ch, cw = gray.shape
    min_r = max(6, min(ch, cw) // 22)
    max_r = max(min_r + 2, min(ch, cw) // 6)
    circles = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.15,
        minDist=max(12, min(ch, cw) // 7),
        param1=90,
        param2=26,
        minRadius=min_r,
        maxRadius=max_r,
    )
    mask = _blank(h, w)
    if circles is None:
        return mask
    for cx, cy, r in np.round(circles[0]).astype(int):
        if cy < int(ch * 0.28):
            continue
        cv2.circle(mask, (x1 + cx, y1 + cy), int(r * 1.05), 255, thickness=-1)
    return mask


def result_record(rel_path: str, result: WheelSegResult, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    row: Dict[str, Any] = {
        "rel_path": rel_path,
        "n_wheels": result.n_wheels,
        "n_wheel_detections": result.n_wheel_detections,
        "n_windows": result.n_windows,
        "wheel_area_px": int((result.wheels > 0).sum()),
        "backend": result.backend,
        "confidences": [round(c, 3) for c in result.confidences],
        "class_hits": result.class_hits,
    }
    if extra:
        row.update(extra)
    return row

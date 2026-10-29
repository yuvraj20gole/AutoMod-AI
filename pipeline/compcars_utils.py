"""CompCars label parsing, indexing, and source-image selection utilities."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from pipeline.config import COMPCARS_DATA, SOURCE_VIEWPOINTS, VIEWPOINT_MAP

logger = logging.getLogger("pipeline.compcars")

# CompCars part IDs (folder name under make/model/year/)
PART_ID_MAP = {
    "1": "headlight",
    "2": "taillight",
    "3": "fog_light",
    "4": "air_intake",
    "5": "console",
    "6": "steering_wheel",
    "7": "dashboard",
    "8": "gear_lever",
}


@dataclass
class CompCarsLabel:
    rel_path: str
    viewpoint_code: int
    viewpoint: str
    bbox: Tuple[int, int, int, int]
    make_id: str
    model_id: str
    year: str
    filename: str
    is_part: bool = False
    part_name: Optional[str] = None


def parse_vehicle_label(rel_path: str, label_text: str) -> CompCarsLabel:
    """
    Parse a CompCars vehicle label file (3 lines):
      line 0: viewpoint code (1-5)
      line 1: (reserved / model metadata in some splits)
      line 2: x1 y1 x2 y2 bounding box
    """
    lines = [ln.strip() for ln in label_text.strip().splitlines() if ln.strip()]
    if len(lines) < 3:
        raise ValueError(f"Expected 3 label lines, got {len(lines)} for {rel_path}")

    vp_code = int(lines[0])
    x1, y1, x2, y2 = map(int, lines[2].split())
    parts = rel_path.replace("\\", "/").split("/")
    make_id, model_id, year, filename = parts[0], parts[1], parts[2], parts[3]

    return CompCarsLabel(
        rel_path=rel_path,
        viewpoint_code=vp_code,
        viewpoint=VIEWPOINT_MAP.get(vp_code, "unknown"),
        bbox=(x1, y1, x2, y2),
        make_id=make_id,
        model_id=model_id,
        year=year,
        filename=filename,
        is_part=False,
    )


def iter_vehicle_images(data_root: Path) -> Iterator[Tuple[Path, CompCarsLabel]]:
    """Yield (image_path, parsed_label) for every vehicle image with a valid label."""
    image_root = data_root / "image"
    label_root = data_root / "label"
    if not image_root.exists():
        return

    for img_path in sorted(image_root.rglob("*.jpg")):
        rel = img_path.relative_to(image_root).as_posix()
        label_path = label_root / rel.replace(".jpg", ".txt")
        if not label_path.exists():
            continue
        try:
            label = parse_vehicle_label(rel, label_path.read_text(encoding="utf-8", errors="ignore"))
        except (ValueError, OSError) as exc:
            logger.debug("Skipping %s: %s", rel, exc)
            continue
        yield img_path, label


def iter_part_images(data_root: Path) -> Iterator[Tuple[Path, str]]:
    """
    Yield (image_path, part_name) for part-level images.
    CompCars layout: data/part/{make}/{model}/{year}/{part_id}/{image}.jpg
    where part_id is 1..8 (headlight..gear_lever).
    """
    part_root = data_root / "part"
    if not part_root.exists():
        return

    for img_path in sorted(part_root.rglob("*.jpg")):
        parts = img_path.relative_to(part_root).parts
        if len(parts) < 2:
            continue
        part_id = parts[-2]
        part_name = PART_ID_MAP.get(part_id, f"part_{part_id}")
        yield img_path, part_name


def build_index(data_root: Path) -> Dict[str, Any]:
    """Build a searchable index of vehicle images, viewpoints, and parts."""
    vehicles: List[Dict[str, Any]] = []
    viewpoint_counts: Dict[str, int] = {}
    part_counts: Dict[str, int] = {}

    for img_path, label in iter_vehicle_images(data_root):
        entry = asdict(label)
        entry["abs_path"] = str(img_path)
        vehicles.append(entry)
        viewpoint_counts[label.viewpoint] = viewpoint_counts.get(label.viewpoint, 0) + 1

    for img_path, part_name in iter_part_images(data_root):
        part_counts[part_name] = part_counts.get(part_name, 0) + 1

    return {
        "data_root": str(data_root),
        "total_vehicle_images": len(vehicles),
        "total_part_images": sum(part_counts.values()),
        "viewpoint_counts": viewpoint_counts,
        "part_counts": part_counts,
        "vehicles_sample": vehicles[:5],
    }


def select_source_images(
    data_root: Path,
    limit: int = 200,
    viewpoints: Optional[set] = None,
) -> List[CompCarsLabel]:
    """
    Select clean front-3/4 (front_side) and side-view vehicle images as synthetic 'before' sources.
    One image per make/model/year to maximize diversity.
    """
    viewpoints = viewpoints or SOURCE_VIEWPOINTS
    seen_models: set[str] = set()
    selected: List[CompCarsLabel] = []

    for _img_path, label in iter_vehicle_images(data_root):
        if label.viewpoint not in viewpoints:
            continue
        model_key = f"{label.make_id}/{label.model_id}/{label.year}"
        if model_key in seen_models:
            continue
        seen_models.add(model_key)
        selected.append(label)
        if len(selected) >= limit:
            break

    return selected


def save_index(data_root: Path, index_path: Path) -> Dict[str, Any]:
    index = build_index(data_root)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
    return index


def verify_annotations(data_root: Path) -> Dict[str, Any]:
    """Verify part annotations and viewpoint labels are readable."""
    report: Dict[str, Any] = {
        "data_root_exists": data_root.exists(),
        "image_dir": (data_root / "image").exists(),
        "label_dir": (data_root / "label").exists(),
        "part_dir": (data_root / "part").exists(),
        "misc_dir": (data_root / "misc").exists(),
        "sample_vehicle_label": None,
        "sample_part": None,
        "viewpoint_labels_readable": False,
        "part_annotations_readable": False,
        "errors": [],
    }

    try:
        for _img, label in iter_vehicle_images(data_root):
            report["sample_vehicle_label"] = {
                "path": label.rel_path,
                "viewpoint": label.viewpoint,
                "viewpoint_code": label.viewpoint_code,
                "bbox": label.bbox,
            }
            report["viewpoint_labels_readable"] = True
            break
    except Exception as exc:
        report["errors"].append(f"vehicle labels: {exc}")

    try:
        for part_path, part_name in iter_part_images(data_root):
            report["sample_part"] = {"part_name": part_name, "path": str(part_path)}
            report["part_annotations_readable"] = True
            break
    except Exception as exc:
        report["errors"].append(f"part images: {exc}")

    misc = data_root / "misc"
    if misc.exists():
        report["misc_files"] = sorted(p.name for p in misc.iterdir())

    return report

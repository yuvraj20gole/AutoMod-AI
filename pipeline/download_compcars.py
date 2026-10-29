"""Download CompCars from Kaggle and organize into dataset/compcars/."""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pipeline.compcars_utils import save_index, verify_annotations
from pipeline.config import COMPCARS_DATA, COMPCARS_RAW, COMPCARS_ROOT, KAGGLE_DATASET

logger = logging.getLogger("pipeline.download_compcars")


def setup_kaggle_credentials() -> bool:
    """Ensure Kaggle API credentials are available via env or ~/.kaggle/kaggle.json."""
    if os.getenv("KAGGLE_USERNAME") and os.getenv("KAGGLE_KEY"):
        kaggle_dir = Path.home() / ".kaggle"
        kaggle_dir.mkdir(parents=True, exist_ok=True)
        kaggle_json = kaggle_dir / "kaggle.json"
        if not kaggle_json.exists():
            kaggle_json.write_text(
                json.dumps(
                    {
                        "username": os.environ["KAGGLE_USERNAME"],
                        "key": os.environ["KAGGLE_KEY"],
                    }
                ),
                encoding="utf-8",
            )
            kaggle_json.chmod(0o600)
        return True

    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    return kaggle_json.exists()


def download_from_kaggle(raw_dir: Path) -> Path:
    """Download CompCars archive from Kaggle mirror (renancostaalencar/compcars)."""
    raw_dir.mkdir(parents=True, exist_ok=True)

    try:
        import kagglehub

        logger.info("Downloading %s via kagglehub ...", KAGGLE_DATASET)
        cache_path = Path(kagglehub.dataset_download(KAGGLE_DATASET))
        logger.info("Kaggle dataset cached at: %s", cache_path)
        marker = raw_dir / ".kagglehub_cache"
        marker.write_text(str(cache_path), encoding="utf-8")
        return cache_path
    except ImportError:
        logger.info("kagglehub not installed, falling back to kaggle CLI")

    if not setup_kaggle_credentials():
        raise RuntimeError(
            "Could not download CompCars. Install kagglehub or set KAGGLE_USERNAME/KAGGLE_KEY. "
            f"Accept dataset terms at https://www.kaggle.com/datasets/{KAGGLE_DATASET}"
        )

    logger.info("Downloading %s to %s via kaggle CLI ...", KAGGLE_DATASET, raw_dir)
    cmd = [
        sys.executable,
        "-m",
        "kaggle",
        "datasets",
        "download",
        "-d",
        KAGGLE_DATASET,
        "-p",
        str(raw_dir),
        "--unzip",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Kaggle download failed (exit {result.returncode}):\n"
            f"{result.stderr or result.stdout}"
        )

    logger.info("Download complete.")
    return raw_dir


def resolve_raw_root(raw_dir: Path) -> Path:
    """Resolve extracted root from kagglehub cache marker or raw download dir."""
    marker = raw_dir / ".kagglehub_cache"
    if marker.exists():
        return Path(marker.read_text(encoding="utf-8").strip())
    return raw_dir


def find_data_root(extracted_root: Path) -> Path:
    """
    Locate the CompCars root that contains image/, label/, part/, misc/.
    Kaggle mirror (renancostaalencar/compcars) places these at the dataset root
    (or under versions/N/), not always under a nested `data/` folder.
    """
    candidates = [
        extracted_root,
        extracted_root / "data",
        extracted_root / "versions" / "1",
        extracted_root / "CompCars" / "data",
        extracted_root / "compcars" / "data",
    ]
    for candidate in candidates:
        if (candidate / "image").exists() and (candidate / "label").exists():
            return candidate

    for path in extracted_root.rglob("image"):
        parent = path.parent
        if (parent / "label").exists():
            return parent

    raise FileNotFoundError(
        f"Could not locate CompCars image/ + label/ under {extracted_root}."
    )


def organize_compcars(raw_dir: Path, dest_data: Path, copy_files: bool = False) -> Path:
    """
    Organize extracted CompCars into dataset/compcars/data/ preserving original structure:
      data/image/, data/label/, data/part/, data/misc/

    By default uses a symlink to avoid duplicating ~15GB. Pass copy_files=True to copy instead.
    """
    data_root = find_data_root(raw_dir)
    dest_data.parent.mkdir(parents=True, exist_ok=True)

    if dest_data.exists() or dest_data.is_symlink():
        if dest_data.is_symlink():
            dest_data.unlink()
        else:
            logger.info("Removing existing %s for fresh organization", dest_data)
            shutil.rmtree(dest_data)

    if copy_files:
        logger.info("Copying CompCars data from %s -> %s", data_root, dest_data)
        shutil.copytree(data_root, dest_data)
    else:
        logger.info("Linking CompCars data %s -> %s", data_root, dest_data)
        dest_data.symlink_to(data_root, target_is_directory=True)

    # Also copy any top-level mapping files (e.g. full_model_name_updated.txt)
    for extra in raw_dir.rglob("full_model_name*.txt"):
        dest = dest_data.parent / extra.name
        if not dest.exists():
            shutil.copy2(extra, dest)

    return dest_data


def count_images(data_root: Path) -> dict:
    vehicle = sum(1 for _ in (data_root / "image").rglob("*.jpg")) if (data_root / "image").exists() else 0
    parts = sum(1 for _ in (data_root / "part").rglob("*.jpg")) if (data_root / "part").exists() else 0
    labels = sum(1 for _ in (data_root / "label").rglob("*.txt")) if (data_root / "label").exists() else 0
    return {"vehicle_images": vehicle, "part_images": parts, "label_files": labels, "total_images": vehicle + parts}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and organize CompCars dataset")
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip Kaggle download; only organize/verify existing raw extract",
    )
    parser.add_argument(
        "--raw-dir",
        type=str,
        default=str(COMPCARS_RAW),
        help="Directory for Kaggle download/extract",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(COMPCARS_DATA),
        help="Organized data output (dataset/compcars/data/)",
    )
    parser.add_argument(
        "--copy",
        action="store_true",
        help="Copy files instead of symlinking (duplicates ~15GB)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    raw_dir = Path(args.raw_dir)
    dest_data = Path(args.output)

    print("=" * 70)
    print("  AutoMod AI — CompCars Download & Organization")
    print("=" * 70)

    if not args.skip_download:
        download_from_kaggle(raw_dir)
    elif not raw_dir.exists() and not (raw_dir / ".kagglehub_cache").exists():
        raise SystemExit(f"Raw dir {raw_dir} does not exist. Run without --skip-download.")

    extracted_root = resolve_raw_root(raw_dir)
    organize_compcars(extracted_root, dest_data, copy_files=args.copy)

    counts = count_images(dest_data)
    verification = verify_annotations(dest_data)
    index = save_index(dest_data, COMPCARS_ROOT / "index.json")

    print("\n--- CompCars Report ---")
    print(f"Organized data root : {dest_data.resolve()}")
    print(f"Vehicle images      : {counts['vehicle_images']:,}")
    print(f"Part images         : {counts['part_images']:,}")
    print(f"Label files         : {counts['label_files']:,}")
    print(f"Total images        : {counts['total_images']:,}")
    print(f"Viewpoint labels    : {'OK' if verification['viewpoint_labels_readable'] else 'MISSING'}")
    print(f"Part annotations    : {'OK' if verification['part_annotations_readable'] else 'MISSING'}")
    print(f"Viewpoint breakdown : {index.get('viewpoint_counts', {})}")
    print(f"Part breakdown      : {index.get('part_counts', {})}")
    if verification.get("sample_vehicle_label"):
        print(f"Sample label        : {verification['sample_vehicle_label']}")
    if verification.get("sample_part"):
        print(f"Sample part         : {verification['sample_part']}")
    print(f"Index saved         : {(COMPCARS_ROOT / 'index.json').resolve()}")
    print("=" * 70)


if __name__ == "__main__":
    main()

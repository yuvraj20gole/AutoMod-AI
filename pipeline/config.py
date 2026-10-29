"""Shared configuration for the AutoMod AI dataset pipeline."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Dataset roots — do NOT write to real-eval-pairs (held-out manual eval set)
DATASET_ROOT = PROJECT_ROOT / "dataset"
COMPCARS_ROOT = DATASET_ROOT / "compcars"
COMPCARS_RAW = COMPCARS_ROOT / "raw"
COMPCARS_DATA = COMPCARS_ROOT / "data"
SYNTHETIC_PAIRS_ROOT = DATASET_ROOT / "synthetic-pairs"
REAL_EVAL_PAIRS_ROOT = DATASET_ROOT / "real-eval-pairs"  # read-only; never modified by pipeline

KAGGLE_DATASET = "renancostaalencar/compcars"

# CompCars viewpoint codes (line 0 of each label .txt file)
VIEWPOINT_MAP = {
    1: "front",
    2: "rear",
    3: "side",
    4: "front_side",
    5: "rear_side",
}
SOURCE_VIEWPOINTS = {"front_side", "side"}  # front-3/4 and side for synthetic "before" sources

# Synthetic pair generation — InstructPix2Pix (free, Hugging Face / Colab)
INSTRUCT_PIX2PIX_MODEL = os.getenv("INSTRUCT_PIX2PIX_MODEL", "timbrooks/instruct-pix2pix")
IMAGE_EDIT_MODEL = os.getenv("IMAGE_EDIT_MODEL", INSTRUCT_PIX2PIX_MODEL)
INSTRUCT_PIX2PIX_STEPS = int(os.getenv("INSTRUCT_PIX2PIX_STEPS", "20"))
INSTRUCT_PIX2PIX_RESOLUTION = int(os.getenv("INSTRUCT_PIX2PIX_RESOLUTION", "512"))
# Higher image_guidance preserves structure and reduces color leak onto glass/wheels
INSTRUCT_PIX2PIX_IMAGE_GUIDANCE = float(os.getenv("INSTRUCT_PIX2PIX_IMAGE_GUIDANCE", "2.0"))
# Raised from 7.0 so the colour/wrap instruction still lands at image_guidance=2.0
INSTRUCT_PIX2PIX_GUIDANCE = float(os.getenv("INSTRUCT_PIX2PIX_GUIDANCE", "8.5"))
SYNTHETIC_BATCH_TAG = "paint_wrap_retune_v2"
# Expected ~8–15s / image on Colab free-tier T4 @ 20 steps, 512px, fp16

PAINT_COLOURS = [
    "matte black",
    "gloss red",
    "pearl white",
    "British racing green",
    "deep blue",
    "satin grey",
]
# Base hues for wrap prompts — avoid "gloss gloss red" duplication with WRAP_FINISHES
WRAP_BASE_COLOURS = [
    "black",
    "red",
    "pearl white",
    "British racing green",
    "deep blue",
    "grey",
]
WRAP_FINISHES = ["matte", "satin", "gloss"]
WHEEL_DESIGNS = [
    "5-spoke sport alloy wheels in gloss black",
    "multi-spoke deep-dish wheels in gunmetal grey",
    "mesh motorsport wheels in silver",
]

DEFAULT_TEST_BATCH_SIZE = 20  # paint/wrap-only retune batch
DEFAULT_FULL_BATCH_SIZE = 200

# Segmentation (Part 3 — CompCars wheel masks first; synthetic-pair masking later)
SEGMENTATION_MASK_SUFFIX = "_wheels.png"
SEGMENTATION_CLASSES = ["wheels", "windows", "body"]
COMPCARS_MASKS_ROOT = COMPCARS_ROOT / "masks"
WHEEL_SEG_MODEL_ID = os.getenv(
    "WHEEL_SEG_MODEL_ID", "Majorburn/yolov11-carparts-seg"
)
WHEEL_SEG_WEIGHTS_FILE = os.getenv("WHEEL_SEG_WEIGHTS_FILE", "best.pt")
WHEEL_SEG_CONF = float(os.getenv("WHEEL_SEG_CONF", "0.25"))
WHEEL_CLASS_NAMES = {"wheel", "wheels", "tire", "tyre"}
WINDOW_CLASS_SUBSTRINGS = ("glass", "window")

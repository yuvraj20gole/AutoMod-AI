"""Detect whether the Detailed (Qwen/mflux) engine can run on this machine."""

from __future__ import annotations

import os
import shutil
from pathlib import Path


QWEN_MODEL = "mflux-community/qwen-image-edit-2511-mflux-q4"
HF_CACHE_MARKER = Path.home() / ".cache/huggingface/hub/models--mflux-community--qwen-image-edit-2511-mflux-q4"


def mflux_python() -> str | None:
    """Prefer AUTOMOD_MFLUX_PYTHON, then the uv tool env, then PATH."""
    env = os.environ.get("AUTOMOD_MFLUX_PYTHON")
    if env and Path(env).is_file():
        return env
    uv = Path.home() / ".local/share/uv/tools/mflux/bin/python"
    if uv.is_file():
        return str(uv)
    which = shutil.which("python3")
    return which


def mflux_cli() -> str | None:
    env = os.environ.get("AUTOMOD_MFLUX_CLI")
    if env and Path(env).is_file():
        return env
    local = Path.home() / ".local/bin/mflux-generate-qwen-edit"
    if local.is_file():
        return str(local)
    return shutil.which("mflux-generate-qwen-edit")


def model_cache_present() -> bool:
    return HF_CACHE_MARKER.is_dir() and any(HF_CACHE_MARKER.rglob("*.safetensors"))


def _mflux_usable() -> bool:
    """True if the uv mflux tool python or CLI is present (not a bare system python3)."""
    if mflux_cli():
        return True
    uv = Path.home() / ".local/share/uv/tools/mflux/bin/python"
    env = os.environ.get("AUTOMOD_MFLUX_PYTHON")
    if env and Path(env).is_file():
        return True
    return uv.is_file()


def detailed_status() -> dict:
    cli = mflux_cli()
    py = mflux_python()
    cache = model_cache_present()
    usable = _mflux_usable()
    ready = usable and cache
    reason = None
    if not usable:
        reason = "mflux is not installed (uv tool install mflux)"
    elif not cache:
        reason = f"Qwen q4 model cache missing (~/.cache/huggingface/…/{QWEN_MODEL.split('/')[-1]})"
    return {
        "id": "detailed",
        "label": "Detailed",
        "ready": ready,
        "reason": reason,
        "mflux_cli": cli,
        "mflux_python": py,
        "model": QWEN_MODEL,
    }

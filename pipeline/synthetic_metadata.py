"""Shared metadata helpers for synthetic before/after pairs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


def load_metadata(output_dir: Path) -> List[Dict[str, Any]]:
    meta_path = output_dir / "metadata.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    return []


def save_metadata(output_dir: Path, metadata: List[Dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    with open(output_dir / "metadata.jsonl", "w", encoding="utf-8") as f:
        for item in metadata:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")


def next_pair_id(metadata: List[Dict[str, Any]]) -> str:
    existing = {int(m["pair_id"]) for m in metadata if str(m.get("pair_id", "")).isdigit()}
    n = 1
    while n in existing:
        n += 1
    return f"{n:04d}"

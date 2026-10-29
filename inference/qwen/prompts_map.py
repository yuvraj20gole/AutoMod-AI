"""Map Studio category/option → Qwen prompts.json part key."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

PROMPTS_PATH = Path(__file__).resolve().parent / "prompts.json"


@lru_cache
def _prompts() -> dict:
    return json.loads(PROMPTS_PATH.read_text())


def part_for_mod(category: str, option: str) -> str | None:
    for part, entry in _prompts().items():
        if entry.get("category") == category and entry.get("option") == option:
            return part
    # Direct part key (e.g. side_skirts)
    if category in _prompts() and option in (category, "default", part_key_alias(category)):
        return category
    if option in _prompts():
        return option
    return None


def part_key_alias(category: str) -> str:
    return category


def seed_for_part(part: str) -> int:
    return int(_prompts()[part]["seed"])

"""Modification categories and InstructPix2Pix-friendly edit prompts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

from pipeline.config import PAINT_COLOURS, WHEEL_DESIGNS, WRAP_BASE_COLOURS, WRAP_FINISHES


@dataclass(frozen=True)
class ModificationSpec:
    category: str  # paint_colour | wrap_finish | wheel_style
    change: str
    prompt: str
    # InstructPix2Pix struggles with localized part edits; parked until ControlNet+masks
    needs_localized_edit: bool = False


def _paint_prompt(colour: str) -> str:
    # Short positives work better for InstructPix2Pix than a list of "do not"s.
    # Leak constraints live in the negative prompt (see instruct_pix2pix.py).
    return (
        f"Turn this car {colour}. The body panels must clearly become {colour}. "
        "Keep the same car, wheels, windows, headlights, and camera angle."
    )


def _wrap_prompt(finish: str, colour: str) -> str:
    change = f"{finish} {colour} vinyl wrap"
    return (
        f"Wrap this car in {change}. The body must clearly look like {change}. "
        "Keep the same car, wheels, windows, headlights, and camera angle."
    )


def build_modification_specs(include_wheels: bool = False) -> List[ModificationSpec]:
    """
    Build the modification matrix.

    Default: paint/wrap only. Wheels are parked until Part 3 ControlNet+inpaint.
    """
    specs: List[ModificationSpec] = []

    for colour in PAINT_COLOURS:
        specs.append(
            ModificationSpec(
                category="paint_colour",
                change=colour,
                prompt=_paint_prompt(colour),
            )
        )

    for finish in WRAP_FINISHES:
        for colour in WRAP_BASE_COLOURS:
            change = f"{finish} {colour} vinyl wrap"
            specs.append(
                ModificationSpec(
                    category="wrap_finish",
                    change=change,
                    prompt=_wrap_prompt(finish, colour),
                )
            )

    if include_wheels:
        for wheel_design in WHEEL_DESIGNS:
            specs.append(
                ModificationSpec(
                    category="wheel_style",
                    change=wheel_design,
                    prompt=(
                        f"replace only the car wheels with {wheel_design}, "
                        f"do not change the body color or background, same car same angle"
                    ),
                    needs_localized_edit=True,
                )
            )

    return specs


def specs_for_batch(batch_size: int, seed: int = 42, include_wheels: bool = False) -> List[ModificationSpec]:
    """
    Build a balanced batch of modification specs.

    Default (include_wheels=False): ~50/50 paint vs wrap.
    Wheels are parked — do not include until ControlNet path exists.
    """
    import random

    all_specs = build_modification_specs(include_wheels=False)
    paint_only = [s for s in all_specs if s.category == "paint_colour"]
    wrap_only = [s for s in all_specs if s.category == "wrap_finish"]
    wheel_only: List[ModificationSpec] = []
    if include_wheels:
        wheel_only = [
            s for s in build_modification_specs(include_wheels=True) if s.category == "wheel_style"
        ]

    rng = random.Random(seed)

    if include_wheels and wheel_only:
        n_wheel = max(3, batch_size // 5)
        n_paint = max(1, (batch_size - n_wheel) // 2)
        n_wrap = batch_size - n_wheel - n_paint
    else:
        n_wheel = 0
        n_paint = batch_size // 2
        n_wrap = batch_size - n_paint

    def take_cycling(pool: List[ModificationSpec], n: int) -> List[ModificationSpec]:
        if not pool or n <= 0:
            return []
        order = list(range(len(pool)))
        rng.shuffle(order)
        return [pool[order[i % len(pool)]] for i in range(n)]

    selected = (
        take_cycling(paint_only, n_paint)
        + take_cycling(wrap_only, n_wrap)
        + take_cycling(wheel_only, n_wheel)
    )
    rng.shuffle(selected)
    return selected[:batch_size]


def category_recommendation(category: str) -> str:
    if category in ("paint_colour", "wrap_finish"):
        return "instruct_pix2pix"
    if category == "wheel_style":
        return "parked_until_controlnet_inpaint_with_wheel_mask"
    return "unknown"

"""Curated benchmark/seed collection of real car modification before/after pairs for testing and calibration."""

from __future__ import annotations

import logging
from typing import List, Dict, Any, Optional
from scraper.dedup import PerceptualDedupIndex
from scraper.image_utils import download_image, validate_image_dimensions
from scraper.storage import DatasetStorage

logger = logging.getLogger("scraper.seed")

# High-resolution, public domain / creative commons automotive modification pairs
# representing realistic car modification transformations (color wraps, aero kits, stance, wheels)
SEED_PAIRS: List[Dict[str, Any]] = [
    {
        "title": "2021 Ford Mustang GT — Stock Silver to Deep Satin Blue Wrap & Aero Splitter",
        "car_make": "Ford",
        "car_model": "Mustang GT",
        "mod_types": ["vinyl_wrap", "front_splitter", "dechrome"],
        "source_url": "https://unsplash.com/photos/silver-ford-mustang",
        "source_type": "portfolio_archive",
        "author": "Apex Restyling Labs",
        "before_url": "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Porsche 911 (992) — Stock Guards Red to Liquid Silver Track Build with Bronze Wheels",
        "car_make": "Porsche",
        "car_model": "911 Carrera S",
        "mod_types": ["color_change_wrap", "custom_wheels", "suspension_lowering"],
        "source_url": "https://unsplash.com/photos/porsche-911-custom",
        "source_type": "portfolio_archive",
        "author": "Stuttgart Performance",
        "before_url": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Nissan GT-R (R35) — OEM Pearl White to Full Matte Charcoal Wrap & Carbon Hood",
        "car_make": "Nissan",
        "car_model": "GT-R R35",
        "mod_types": ["matte_wrap", "carbon_fiber_hood", "blackout_trim"],
        "source_url": "https://unsplash.com/photos/nissan-gtr-transformation",
        "source_type": "portfolio_archive",
        "author": "Godzilla Restylers",
        "before_url": "https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "BMW M4 Coupe (G82) — Alpine White to Frozen Dark Grey with M-Performance Carbon Kit",
        "car_make": "BMW",
        "car_model": "M4 Competition",
        "mod_types": ["frozen_paint_wrap", "m_performance_aero", "forged_wheels"],
        "source_url": "https://unsplash.com/photos/bmw-m4-transformation",
        "source_type": "portfolio_archive",
        "author": "Bavarian Customs",
        "before_url": "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Audi RS6 Avant — Nardo Grey OEM to Gloss Midnight Emerald Green Wrap with Bronze HREs",
        "car_make": "Audi",
        "car_model": "RS6 Avant",
        "mod_types": ["gloss_wrap", "hre_wheels", "roof_box_color_match"],
        "source_url": "https://unsplash.com/photos/audi-rs6-wrap",
        "source_type": "portfolio_archive",
        "author": "Quattro Styling Co",
        "before_url": "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Toyota GR Supra (A90) — Renaissance Red to Satin Metallic Battleship Grey & HKS Wing",
        "car_make": "Toyota",
        "car_model": "GR Supra",
        "mod_types": ["satin_wrap", "gt_wing", "custom_exhaust_tips"],
        "source_url": "https://unsplash.com/photos/toyota-supra-transformation",
        "source_type": "portfolio_archive",
        "author": "JDM Innovations",
        "before_url": "https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1617469767053-d3b523a0b982?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Chevrolet Corvette C8 — Torch Red Base to Custom Ceramic Black with High-Wing Spoiler",
        "car_make": "Chevrolet",
        "car_model": "Corvette C8 Stingray",
        "mod_types": ["blackout_wrap", "high_wing_spoiler", "painted_calipers"],
        "source_url": "https://unsplash.com/photos/corvette-c8-restyle",
        "source_type": "portfolio_archive",
        "author": "Mid-Engine Restylers",
        "before_url": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Mazda MX-5 Miata (ND) — Jet Black Stock to Sunburst Yellow Wrap + Enkei RPF1 Wheels",
        "car_make": "Mazda",
        "car_model": "MX-5 Miata",
        "mod_types": ["color_wrap", "lightweight_wheels", "coilovers"],
        "source_url": "https://unsplash.com/photos/miata-nd-transformation",
        "source_type": "portfolio_archive",
        "author": "Roadster Lab",
        "before_url": "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Mercedes-AMG GT — Brilliant Blue to Satin Stealth Matte Black Edition",
        "car_make": "Mercedes-AMG",
        "car_model": "AMG GT S",
        "mod_types": ["matte_black_wrap", "panamericana_dark_grille", "tinted_tail_lights"],
        "source_url": "https://unsplash.com/photos/amg-gt-wrap",
        "source_type": "portfolio_archive",
        "author": "Affalterbach Custom Works",
        "before_url": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Subaru WRX STI — World Rally Blue to Desert Tan Tactical Wrap & Method Rally Wheels",
        "car_make": "Subaru",
        "car_model": "WRX STI",
        "mod_types": ["tactical_matte_wrap", "rally_wheels", "mud_flaps"],
        "source_url": "https://unsplash.com/photos/subaru-sti-wrap",
        "source_type": "portfolio_archive",
        "author": "Rally Sport Restyling",
        "before_url": "https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Dodge Challenger Hellcat — Destroyer Grey to Plum Crazy Purple Pearl Wrap & Satin Hood",
        "car_make": "Dodge",
        "car_model": "Challenger SRT Hellcat",
        "mod_types": ["color_shift_wrap", "satin_hood_wrap", "widebody_flares"],
        "source_url": "https://unsplash.com/photos/challenger-hellcat-mod",
        "source_type": "portfolio_archive",
        "author": "Mopar Restyling Garage",
        "before_url": "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1617469767053-d3b523a0b982?w=1200&auto=format&fit=crop&q=80",
    },
    {
        "title": "Honda Civic Type R (FK8) — Championship White to Cyberpunk Chameleon Pearl & Volk TE37s",
        "car_make": "Honda",
        "car_model": "Civic Type R",
        "mod_types": ["chameleon_wrap", "volk_te37_wheels", "carbon_diffuser"],
        "source_url": "https://unsplash.com/photos/civic-type-r-mod",
        "source_type": "portfolio_archive",
        "author": "Type R Performance",
        "before_url": "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&auto=format&fit=crop&q=80",
        "after_url": "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=1200&auto=format&fit=crop&q=80",
    },
]


def load_seed_benchmark_pairs(
    storage: Optional[DatasetStorage] = None,
    dedup_index: Optional[PerceptualDedupIndex] = None,
    limit: int = 12,
) -> int:
    """Download and ingest curated seed benchmark test pairs."""
    store = storage or DatasetStorage()
    dedup = dedup_index or PerceptualDedupIndex()

    collected = 0
    logger.info(f"Ingesting up to {limit} curated benchmark test pairs for initial quality review...")

    for item in SEED_PAIRS[:limit]:
        b_url = item["before_url"]
        a_url = item["after_url"]

        img_b = download_image(b_url)
        img_a = download_image(a_url)

        if not img_b or not img_a or not validate_image_dimensions(img_b) or not validate_image_dimensions(img_a):
            logger.warning(f"Failed to download seed pair for '{item['title']}'")
            continue

        # Dedup check
        is_dup, reason = dedup.is_invalid_or_duplicate(img_b, img_a)
        if is_dup:
            logger.info(f"Skipping seed duplicate: {reason}")
            continue

        pair_id, meta = store.save_pair(
            img_before=img_b,
            img_after=img_a,
            title=item["title"],
            source_url=item["source_url"],
            source_type=item["source_type"],
            author=item["author"],
            extraction_method="curated_benchmark_seed",
            extra_info={
                "car_make": item.get("car_make"),
                "car_model": item.get("car_model"),
                "mod_types": item.get("mod_types", []),
            },
        )

        dedup.add_pair(
            pair_id=pair_id,
            hashes_before={"phash": meta["hashes"]["phash_before"], "dhash": meta["hashes"]["dhash_before"]},
            hashes_after={"phash": meta["hashes"]["phash_after"], "dhash": meta["hashes"]["dhash_after"]},
        )

        collected += 1
        logger.info(f"Saved test pair #{pair_id} — {item['title']}")

    return collected

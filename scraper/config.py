"""Configuration settings for the AutoMod AI Before/After Car Dataset Scraper."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Dict, Any

# Root paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_ROOT = PROJECT_ROOT / "dataset" / "before-after-pairs"
DATASET_METADATA_JSON = DATASET_ROOT / "metadata.json"
DATASET_METADATA_JSONL = DATASET_ROOT / "metadata.jsonl"
REVIEW_HTML_PATH = DATASET_ROOT / "review.html"

# Default User-Agent for polite scraping
DEFAULT_USER_AGENT = (
    "AutoModAI-ResearchScraper/1.0 (academic/fine-tuning dataset collector; "
    "respectful rate limits; +https://automod.ai)"
)

# Vision Validator settings (Claude Vision)
CLAUDE_VISION_MODEL = os.getenv("CLAUDE_VISION_MODEL", "claude-sonnet-4-5-20250929")
ENABLE_VISION_VALIDATION = os.getenv("ENABLE_VISION_VALIDATION", "true").lower() in ("true", "1", "yes")

# Request throttling & politeness (seconds)
DEFAULT_REQUEST_DELAY = 1.5
RANDOM_DELAY_JITTER = 0.5
TIMEOUT_SECONDS = 20

# Perceptual Hashing & Image Quality Thresholds
MIN_IMAGE_WIDTH = 380
MIN_IMAGE_HEIGHT = 280
MAX_ASPECT_RATIO_DIFF = 0.6  # pairs shouldn't have wildly different aspect ratios
PHASH_HAMMING_THRESHOLD = 6   # distance <= 6 is considered near-duplicate
IDENTICAL_PAIR_THRESHOLD = 2  # distance <= 2 between before/after indicates not a real pair

# Target Subreddits (mod-focused, wrap, body, detailing, enthusiast communities)
DEFAULT_SUBREDDITS = [
    "CarWraps",
    "Wraps",
    "projectcar",
    "Autobody",
    "AutoDetailing",
    "Stance",
    "StanceNation",
    "CarAV",
    "JDM",
    "Mustang",
    "civic",
    "GolfGTI",
    "BMW",
    "ft86",
    "Miata",
    "Challenger",
    "Camaro",
    "WRX",
    "Wheels",
    "Trucks",
    "plastidip",
]

# Search queries for Reddit API
REDDIT_SEARCH_QUERIES = [
    '"before" "after"',
    '"before and after"',
    '"before/after"',
    '"before & after"',
    '"b4/after"',
    '"b/a"',
    '"transformation"',
    '"wrapped" "before"',
    '"progress" "before and after"',
]

# Regex patterns to validate titles
TITLE_PAIR_PATTERNS = [
    r"(?i)\bbefore\s*(?:and|&|\/|\+)\s*after\b",
    r"(?i)\bb4\s*(?:\/|and|&)\s*after\b",
    r"(?i)\bbefore\/after\b",
    r"(?i)\bb\/a\b",
    r"(?i)\btransformation\b",
    r"(?i)\bprogress\s*:\s*before\b",
]

# Hard filter: exclude projects where primary treatment is PPF, ceramic coating, clear bra,
# or paint protection, as these produce visually imperceptible before/after differences.
EXCLUDED_PRIMARY_TREATMENT_PATTERNS = [
    r"(?i)\bppf\b",
    r"(?i)\bpaint\s*protection\s*(?:film)?\b",
    r"(?i)\bclear\s*bra\b",
    r"(?i)\bceramic\s*coating\b",
    r"(?i)\bceramic\s*pro\b",
    r"(?i)\bstone\s*guard\b",
    r"(?i)\bmachine\s*polish(?:\s*\+\s*ceramic)?\b",
    r"(?i)\bstage\s*[1-3]\s*polish\b",
    r"(?i)\bwindow\s*tint(?:ing)?\s*only\b",
]

# Curated shop portfolio websites with publicly available before/after galleries & build showcases
CURATED_SHOP_SOURCES: List[Dict[str, Any]] = [
    {
        "name": "Monster Wraps UK — Automotive Portfolio",
        "url": "https://monsterwraps.co.uk/portfolio",
        "category": "Vehicle Wraps & Custom Styling",
        "region": "UK",
    },
    {
        "name": "Monster Wraps UK — Race Cars",
        "url": "https://monsterwraps.co.uk/racecars",
        "category": "Motorsport Livery & Custom Wraps",
        "region": "UK",
    },
    {
        "name": "Capital Wraps — Portfolio Gallery",
        "url": "https://capitalwraps.com/gallery/",
        "category": "Commercial & Vehicle Wraps",
        "region": "US-NC",
    },
    {
        "name": "Apex Customs AZ — Custom Auto Gallery",
        "url": "https://apexcustoms.com/gallery/",
        "category": "Custom Auto, Wraps & Wheels",
        "region": "US-AZ",
    },
    {
        "name": "TKO Graphix — Vehicle Graphics Portfolio",
        "url": "https://tkographix.com/portfolio/",
        "category": "Commercial Graphics & Fleet Wraps",
        "region": "US-IN",
    },
    {
        "name": "Brandfuel — Vehicle Wraps Portfolio",
        "url": "https://brandfuel.com/portfolio/",
        "category": "Custom Vehicle Wraps",
        "region": "US-NC",
    },
    {
        "name": "Wicked Wraps — Restyling Portfolio",
        "url": "https://wickedwraps.net/portfolio/",
        "category": "Vehicle Graphics & Color Wraps",
        "region": "US-WA",
    },
    {
        "name": "AdGraphics — Vehicle Wraps & Styling",
        "url": "https://adgraphics.us/vehicle-wraps/",
        "category": "Commercial & Custom Vehicle Wraps",
        "region": "US-FL",
    },
    {
        "name": "CarWraps.com — Gallery & Transformations",
        "url": "https://carwraps.com/gallery/",
        "category": "Custom Vinyl Wraps",
        "region": "US-CA",
    },
    {
        "name": "Absolute Perfection Wraps — Portfolio",
        "url": "https://apwraps.com/portfolio/",
        "category": "Vehicle Wraps & Restyling",
        "region": "US-MD",
    },
    {
        "name": "First Class Auto Body — Custom Work",
        "url": "https://www.firstclassautobody.com/",
        "category": "Custom Body, Paint & Collision Restoration",
        "region": "US-AZ",
    },
    {
        "name": "Atlanta Custom Wraps — Gallery",
        "url": "https://atlantacustomwraps.com/",
        "category": "Exotic & Custom Wraps",
        "region": "US-GA",
    },
    {
        "name": "Chicago Auto Haus — Custom Paint & Body",
        "url": "https://chicagoautohaus.com/",
        "category": "Custom Paint & Body Kits",
        "region": "US-IL",
    },
    {
        "name": "SignZoo — Vehicle Wrap Portfolio",
        "url": "https://www.signzoo.com/portfolio/",
        "category": "Fleet & Custom Vehicle Wraps",
        "region": "US-FL",
    },
    {
        "name": "SkinzWraps — Custom Vehicle Wraps",
        "url": "https://skinzwraps.com/",
        "category": "Color Change & Commercial Wraps",
        "region": "US-TX",
    },
    {
        "name": "Pro Image Design — Vehicle Wrap Portfolio",
        "url": "https://proimagedesign.com/portfolio/",
        "category": "Vehicle Wraps & Livery",
        "region": "US-MI",
    },
    {
        "name": "WrapJax — Vehicle Wrap Gallery",
        "url": "https://wrapjax.com/gallery/",
        "category": "Custom Wraps & Styling",
        "region": "US-WA",
    },
    {
        "name": "Phenomenal Vinyl — NY Restyling Studio",
        "url": "https://www.phenomenalvinyl.com/",
        "category": "Vinyl Wraps & Styling",
        "region": "US-NY",
    },
    {
        "name": "Metro Restyling — Vehicle Gallery",
        "url": "https://www.metrorestyling.com/",
        "category": "Vehicle Wraps & Restyling",
        "region": "US-MI",
    },
    {
        "name": "DipYourCar — Custom Color Transformations",
        "url": "https://www.dipyourcar.com/",
        "category": "Liquid Wraps & Color Change",
        "region": "US-FL",
    },
    {
        "name": "Tint World — Automotive Styling Showcase",
        "url": "https://www.tintworld.com/",
        "category": "Automotive Styling & Wraps",
        "region": "US-FL",
    },
    {
        "name": "Vortex Wraps — Vehicle Studio",
        "url": "https://vortexwraps.com/",
        "category": "Custom Vehicle Wraps",
        "region": "US-TX",
    },
]

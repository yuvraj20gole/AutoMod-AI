PRESETS = {
    "paint": {
        "label": "Paint",
        "template": "repaint only the car body panels in {value} paint, keep the windows, headlights, wheels, tyres and background unchanged",
        "image_guidance": 1.8,
        "options": {
            "gloss_black": "gloss black",
            "candy_red": "candy red",
            "deep_blue": "deep metallic blue",
            "emerald_green": "deep emerald green",
            "bright_orange": "bright orange",
            "sunshine_yellow": "sunshine yellow",
        },
        "model": "base",
    },
    "wrap": {
        "label": "Wrap",
        "template": "apply a {value} vinyl wrap to the car body panels only, keep the windows, headlights, wheels, tyres and background unchanged",
        "image_guidance": 1.8,
        "options": {
            "matte_black": "matte black",
            "satin_blue": "satin blue",
            "satin_purple": "satin purple",
            "matte_green": "matte army green",
            "gloss_teal": "gloss teal",
            "satin_orange": "satin racing-orange",
        },
        "model": "base",
    },
    "wheels": {
        "label": "Wheels",
        "template": "change only the wheel rims to {value} multi-spoke alloy rims, keep the car body colour, windows, headlights and background unchanged",
        "image_guidance": 2.2,
        "options": {
            "gloss_black": "gloss black",
            "gold": "gold",
            "bronze": "bronze",
            "white": "white",
        },
        "model": "base",
    },
    "hood": {
        "label": "Hood",
        "template": "change the hood to a {value} hood",
        "image_guidance": 2.0,
        "options": {
            "matte_black": "bold matte black",
            "carbon_fibre": "bold matte black carbon-fibre",
            "gloss_red": "bold glossy red",
        },
        "model": "lora",
    },
    "spoiler": {
        "label": "Spoiler",
        "template": "add a large, clearly visible gloss black {value} on the rear of the car",
        "image_guidance": 1.5,
        "options": {
            "gt_wing": "GT-style rear wing spoiler mounted on two uprights",
            "roof_spoiler": "roof-mounted rear spoiler above the rear window",
            "ducktail": "ducktail rear spoiler",
        },
        "model": "lora",
    },
}


def build_instruction(category: str, option: str) -> str:
    preset = PRESETS[category]
    return preset["template"].format(value=preset["options"][option])

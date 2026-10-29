import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

CLIP_ID = "openai/clip-vit-base-patch16"

# (make, model, first year, last year or None if still sold)
CATALOGUE = [
    ("Maruti Suzuki", "Swift", 2005, None), ("Maruti Suzuki", "Baleno", 2015, None),
    ("Maruti Suzuki", "Brezza", 2016, None), ("Maruti Suzuki", "Dzire", 2008, None),
    ("Maruti Suzuki", "Ertiga", 2012, None), ("Maruti Suzuki", "Alto", 2000, None),
    ("Maruti Suzuki", "WagonR", 1999, None), ("Maruti Suzuki", "Grand Vitara", 2022, None),
    ("Maruti Suzuki", "Fronx", 2023, None), ("Maruti Suzuki", "Ciaz", 2014, None),
    ("Maruti Suzuki", "S-Presso", 2019, None), ("Maruti Suzuki", "Celerio", 2014, None),
    ("Hyundai", "Creta", 2015, None), ("Hyundai", "Venue", 2019, None),
    ("Hyundai", "i20", 2008, None), ("Hyundai", "Verna", 2006, None),
    ("Hyundai", "Grand i10 Nios", 2019, None), ("Hyundai", "Exter", 2023, None),
    ("Hyundai", "Alcazar", 2021, None),
    ("Tata", "Nexon", 2017, None), ("Tata", "Punch", 2021, None),
    ("Tata", "Harrier", 2019, None), ("Tata", "Safari", 2021, None),
    ("Tata", "Altroz", 2020, None), ("Tata", "Tiago", 2016, None),
    ("Mahindra", "Thar", 2010, None), ("Mahindra", "Scorpio-N", 2022, None),
    ("Mahindra", "XUV700", 2021, None), ("Mahindra", "XUV300", 2019, None),
    ("Mahindra", "Bolero", 1999, None),
    ("Kia", "Seltos", 2019, None), ("Kia", "Sonet", 2020, None), ("Kia", "Carens", 2022, None),
    ("Toyota", "Fortuner", 2009, None), ("Toyota", "Innova Crysta", 2016, None),
    ("Toyota", "Glanza", 2019, None), ("Toyota", "Urban Cruiser Hyryder", 2022, None),
    ("Toyota", "Supra", 1978, None), ("Toyota", "Corolla", 1966, None),
    ("Honda", "City", 1998, None), ("Honda", "Amaze", 2013, None),
    ("Honda", "Elevate", 2023, None), ("Honda", "Civic", 1972, None),
    ("Volkswagen", "Virtus", 2022, None), ("Volkswagen", "Taigun", 2021, None),
    ("Skoda", "Slavia", 2022, None), ("Skoda", "Kushaq", 2021, None),
    ("MG", "Hector", 2019, None), ("Renault", "Kwid", 2015, None),
    ("Jeep", "Compass", 2017, None), ("Ford", "EcoSport", 2013, 2022),
    ("Ford", "Mustang", 1964, None), ("Chevrolet", "Camaro", 1966, None),
    ("Porsche", "911", 1964, None), ("BMW", "3 Series", 1975, None),
    ("BMW", "M3", 1986, None), ("Mercedes-Benz", "C-Class", 1993, None),
    ("Audi", "A4", 1994, None), ("Nissan", "GT-R", 2007, None),
    ("Lamborghini", "Huracan", 2014, None),
]

TEMPLATES = [
    "a photo of a {} car.",
    "a photo of the front of a {}.",
    "a photo of the side of a {}.",
    "a photo of the back of a {}.",
]


ANGLE_PROMPTS = {
    "front_34": "a photo of a car seen from the front three-quarter angle, showing the front and one side",
    "front": "a photo of the front of a car, seen straight from the front",
    "side": "a photo of a car seen from the side, in profile",
    "rear_34": "a photo of a car seen from the rear three-quarter angle, showing the back and one side",
    "rear": "a photo of the back of a car, seen straight from behind",
}
FRONT_PARTS = {"headlight", "hood", "front-bumper", "grille", "windshield"}
REAR_PARTS = {"tail-light", "back-bumper", "trunk", "back-windshield"}


class CarIdentifier:
    def __init__(self):
        self.model = CLIPModel.from_pretrained(CLIP_ID).eval()
        self.proc = CLIPProcessor.from_pretrained(CLIP_ID)
        names = [f"{mk} {md}" for mk, md, _, _ in CATALOGUE]
        feats = []
        with torch.no_grad():
            for t in TEMPLATES:
                tok = self.proc(text=[t.format(n) for n in names], return_tensors="pt", padding=True)
                f = self._text(tok)
                feats.append(f / f.norm(dim=-1, keepdim=True))
        avg = torch.stack(feats).mean(0)
        self.text = avg / avg.norm(dim=-1, keepdim=True)
        self.angle_keys = list(ANGLE_PROMPTS)
        with torch.no_grad():
            tok = self.proc(text=list(ANGLE_PROMPTS.values()), return_tensors="pt", padding=True)
            a = self._text(tok)
            self.angle_text = a / a.norm(dim=-1, keepdim=True)

    def _text(self, tok):
        out = self.model.text_model(input_ids=tok["input_ids"], attention_mask=tok["attention_mask"])
        return self.model.text_projection(out.pooler_output)

    def _image(self, px):
        out = self.model.vision_model(pixel_values=px["pixel_values"])
        return self.model.visual_projection(out.pooler_output)

    def identify(self, img: Image.Image, top_k: int = 4):
        with torch.no_grad():
            px = self.proc(images=img.convert("RGB"), return_tensors="pt")
            f = self._image(px)
            f = f / f.norm(dim=-1, keepdim=True)
            probs = (100.0 * f @ self.text.T).softmax(dim=-1)[0]
        with torch.no_grad():
            ap = (100.0 * f @ self.angle_text.T).softmax(dim=-1)[0].tolist()
        self.last_angle_probs = dict(zip(self.angle_keys, ap))
        vals, idx = probs.topk(top_k)
        out = []
        for v, i in zip(vals.tolist(), idx.tolist()):
            mk, md, y0, y1 = CATALOGUE[i]
            out.append({"make": mk, "model": md, "year_from": y0, "year_to": y1, "score": round(v, 4)})
        return out


    def angle(self, parts=None):
        p = self.last_angle_probs
        # Near-perfect profile: both doors and both wheels are clearly
        # segmented, while front/rear cues are only edge slivers. In a true
        # profile the lamps/grille are seen edge-on (tiny masks), and the
        # hood/windshield are heavily foreshortened; in front_34/rear_34
        # they are large. A segmented trunk rules the profile out (rear_34).
        if parts:
            cov = {}
            for name, mask in (parts.items() if hasattr(parts, "items") else []):
                try:
                    cov[name] = float(mask.mean())
                except Exception:
                    continue
            if cov:
                both_doors = cov.get("front-door", 0) > 0 and cov.get("back-door", 0) > 0
                both_wheels = cov.get("front-wheel", 0) > 0 and cov.get("back-wheel", 0) > 0
                weak_lamps_grille = (
                    cov.get("headlight", 0) < 0.008
                    and cov.get("tail-light", 0) < 0.008
                    and cov.get("grille", 0) < 0.005
                )
                foreshortened = cov.get("hood", 0) < 0.012 and cov.get("windshield", 0) < 0.012
                no_trunk = cov.get("trunk", 0) < 0.01
                if both_doors and both_wheels and weak_lamps_grille and foreshortened and no_trunk:
                    return "side"
        p34 = p["front_34"] + p["rear_34"]
        pstraight = p["front"] + p["rear"]
        pside = p["side"]
        if parts:
            names = set(parts)
            if {"front-door", "back-door"} <= names and not (names & {"headlight", "tail-light"}):
                pside += 0.3
        view = max(("34", p34), ("straight", pstraight), ("side", pside), key=lambda t: t[1])[0]
        if view == "side":
            return "side"
        front_ev = sum(1 for n in (parts or {}) if n in FRONT_PARTS)
        rear_ev = sum(1 for n in (parts or {}) if n in REAR_PARTS)
        if front_ev == rear_ev:
            front_ev = p["front"] + p["front_34"]
            rear_ev = p["rear"] + p["rear_34"]
        facing = "front" if front_ev > rear_ev else "rear"
        return f"{facing}_34" if view == "34" else facing

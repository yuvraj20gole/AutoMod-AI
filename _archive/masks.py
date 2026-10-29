import math

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageFilter
from transformers import AutoTokenizer, CLIPSegForImageSegmentation

CLIPSEG_ID = "CIDAS/clipseg-rd64-refined"
SAM_ID = "facebook/sam-vit-base"
CLIP_ID = "openai/clip-vit-base-patch16"
_SAM_MEAN = torch.tensor([123.675, 116.28, 103.53]).view(1, 3, 1, 1)
_SAM_STD = torch.tensor([58.395, 57.12, 57.375]).view(1, 3, 1, 1)
_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

PROMPTS = {
    "car": "a car",
    "glass": "car window glass",
    "headlight": "car headlight",
    "taillight": "car tail light",
    "wheel": "car wheel and tyre",
    "plate": "car number plate",
    "grille": "car front grille",
    "hood": "car hood",
    "bonnet": "front bonnet of a car",
    "trunk": "car trunk lid and rear window",
}

THRESH = {
    "car": 0.35,
    "glass": 0.40,
    "headlight": 0.40,
    "taillight": 0.40,
    "wheel": 0.40,
    "plate": 0.40,
    "grille": 0.40,
    "hood": 0.45,
    "trunk": 0.40,
}

NEEDS = {
    "paint": ["car", "glass", "headlight", "taillight", "wheel", "plate", "grille"],
    "wrap": ["car", "glass", "headlight", "taillight", "wheel", "plate", "grille"],
    "wheels": ["wheel"],
    "hood": ["car", "hood"],
    "spoiler": ["car", "trunk"],
}


class Segmenter:
    def __init__(self):
        self.tok = AutoTokenizer.from_pretrained(CLIPSEG_ID)
        self.model = CLIPSegForImageSegmentation.from_pretrained(CLIPSEG_ID).eval()
        self.sam = None
        self.clip = None
        try:
            from transformers import CLIPModel

            self.clip = CLIPModel.from_pretrained(CLIP_ID).eval()
            self.clip_tok = AutoTokenizer.from_pretrained(CLIP_ID)
        except Exception as exc:
            print("CLIP classifier failed to load:", exc)
        try:
            from transformers import SamModel

            self.sam = SamModel.from_pretrained(SAM_ID).eval()
        except Exception as exc:
            print("SAM failed to load, using coarse masks only:", exc)

    @torch.no_grad()
    def probs(self, img, keys):
        w, h = img.size
        small = img.convert("RGB").resize((352, 352), Image.BICUBIC)
        arr = (np.asarray(small, dtype=np.float32) / 255.0 - _MEAN) / _STD
        pv = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).repeat(len(keys), 1, 1, 1)
        enc = self.tok([PROMPTS[k] for k in keys], padding=True, return_tensors="pt")
        out = self.model(
            input_ids=enc["input_ids"],
            attention_mask=enc["attention_mask"],
            pixel_values=pv,
        )
        lg = out.logits
        if lg.dim() == 2:
            lg = lg.unsqueeze(0)
        p = torch.sigmoid(lg).cpu().numpy()
        res = {}
        for k, m in zip(keys, p):
            im = Image.fromarray((m * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
            res[k] = np.asarray(im, dtype=np.float32) / 255.0
        return res


def _bin(p, t):
    if p.max() < t:
        return np.zeros_like(p, dtype=bool)
    return p >= t


def _filter(mask, flt):
    im = Image.fromarray((mask.astype(np.uint8)) * 255)
    return np.asarray(im.filter(flt)) > 127


def _dilate(mask, px):
    if px <= 0:
        return mask
    return _filter(mask, ImageFilter.MaxFilter(2 * px + 1))


def _erode(mask, px):
    if px <= 0:
        return mask
    return _filter(mask, ImageFilter.MinFilter(2 * px + 1))


def _clean(mask, px=2):
    return _dilate(_erode(mask, px), px)


def build_mask_coarse(seg, category, img):
    keys = NEEDS[category]
    P = seg.probs(img, keys)
    B = {k: _bin(P[k], THRESH[k]) for k in keys}
    h, w = B[keys[0]].shape
    px = max(1, round(max(w, h) / 160))

    if category in ("paint", "wrap"):
        car = _clean(B["car"], px)
        exclude = np.zeros_like(car)
        for k in ("glass", "headlight", "taillight", "wheel", "plate", "grille"):
            exclude |= B[k]
        exclude = _dilate(exclude, px)
        return car & ~exclude

    if category == "wheels":
        return _dilate(_clean(B["wheel"], px), px * 2)

    if category == "hood":
        car = _dilate(_clean(B["car"], px), px)
        return _clean(B["hood"], px) & car

    if category == "spoiler":
        car = _clean(B["car"], px)
        trunk = _dilate(_clean(B["trunk"], px), px * 8)
        ys, xs = np.where(car)
        band = np.zeros_like(car)
        if len(ys):
            y0, y1 = ys.min(), ys.max()
            x0, x1 = xs.min(), xs.max()
            bh = y1 - y0
            band[max(0, y0 - round(bh * 0.15)): y0 + round(bh * 0.30), x0:x1] = True
        return trunk | band

    raise ValueError(category)


def soft(mask, radius):
    im = Image.fromarray((mask.astype(np.uint8)) * 255)
    return im.filter(ImageFilter.GaussianBlur(radius))


def composite(orig_full, edited_full, mask, blur_frac=0.004):
    W, H = orig_full.size
    m = soft(mask, 1).resize((W, H), Image.BICUBIC)
    m = m.filter(ImageFilter.GaussianBlur(max(1.0, W * blur_frac)))
    return Image.composite(edited_full, orig_full, m)


def overlay(img, mask):
    base = np.asarray(img.convert("RGB"), dtype=np.float32)
    tint = np.zeros_like(base)
    tint[..., 0] = 255
    m = mask[..., None].astype(np.float32) * 0.55
    return Image.fromarray((base * (1 - m) + tint * m).astype(np.uint8))


def _sam_embed(sam, img):
    w, h = img.size
    sc = 1024 / max(w, h)
    rw, rh = max(1, round(w * sc)), max(1, round(h * sc))
    arr = torch.from_numpy(
        np.asarray(img.convert("RGB").resize((rw, rh), Image.BILINEAR), dtype=np.float32)
    ).permute(2, 0, 1).unsqueeze(0)
    arr = (arr - _SAM_MEAN) / _SAM_STD
    pad = torch.zeros(1, 3, 1024, 1024)
    pad[:, :, :rh, :rw] = arr
    with torch.no_grad():
        emb = sam.get_image_embeddings(pad)
    return {"emb": emb, "scale": sc, "size": (w, h), "rsize": (rw, rh)}


def _sam_post(logits, ctx):
    w, h = ctx["size"]
    rw, rh = ctx["rsize"]
    lh, lw = math.ceil(rh / 4), math.ceil(rw / 4)
    x = logits[:, :lh, :lw].unsqueeze(1)
    x = F.interpolate(x, size=(h, w), mode="bilinear", align_corners=False)
    return (x[:, 0] > 0).numpy()


@torch.no_grad()
def _sam_box(sam, ctx, box):
    sc = ctx["scale"]
    b = torch.tensor([[[box[0] * sc, box[1] * sc, box[2] * sc, box[3] * sc]]], dtype=torch.float32)
    out = sam(image_embeddings=ctx["emb"], input_boxes=b, multimask_output=True)
    masks = _sam_post(out.pred_masks[0, 0], ctx)
    return masks, out.iou_scores[0, 0].numpy()


@torch.no_grad()
def _sam_points(sam, ctx, pts, chunk=40):
    sc = ctx["scale"]
    all_masks, all_iou = [], []
    for i in range(0, len(pts), chunk):
        part = pts[i: i + chunk]
        P = len(part)
        p = torch.tensor(part, dtype=torch.float32).view(1, P, 1, 2) * sc
        l = torch.ones(1, P, 1, dtype=torch.long)
        out = sam(image_embeddings=ctx["emb"], input_points=p, input_labels=l, multimask_output=True)
        pm = out.pred_masks[0].reshape(P * 3, 256, 256)
        m = _sam_post(pm, ctx)
        all_masks.append(m.reshape(P, 3, m.shape[-2], m.shape[-1]))
        all_iou.append(out.iou_scores[0].numpy())
    return np.concatenate(all_masks, 0), np.concatenate(all_iou, 0)


def _largest_bbox(mask):
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def sam_car_and_segments(seg, img, P):
    w, h = img.size
    car_c = _clean(_bin(P["car"], THRESH["car"]), 2)
    bb = _largest_bbox(car_c)
    if bb is None:
        return None, []
    x0, y0, x1, y1 = bb
    padx, pady = round((x1 - x0) * 0.03), round((y1 - y0) * 0.03)
    box = (max(0, x0 - padx), max(0, y0 - pady), min(w - 1, x1 + padx), min(h - 1, y1 + pady))
    ctx = _sam_embed(seg.sam, img)
    cm, ciou = _sam_box(seg.sam, ctx, box)
    barea = (box[2] - box[0]) * (box[3] - box[1])
    best, best_s = None, -1
    for m, s in zip(cm, ciou):
        a = m.sum() / max(1, barea)
        if 0.25 <= a <= 0.95 and s > best_s:
            best, best_s = m, s
    car = best if best is not None else car_c
    car = _clean(car, 1)
    cb = _largest_bbox(car)
    if cb is None:
        return car_c, []
    cx0, cy0, cx1, cy1 = cb
    n = 15
    xs = np.linspace(cx0, cx1, n + 2)[1:-1]
    ys = np.linspace(cy0, cy1, n + 2)[1:-1]
    pts = [[float(x), float(y)] for y in ys for x in xs if car[int(y), int(x)]]
    if not pts:
        return car, []
    masks, ious = _sam_points(seg.sam, ctx, pts)
    carA = max(1, car.sum())
    cand = []
    for pi in range(masks.shape[0]):
        for k in range(3):
            m = masks[pi, k]
            iou = float(ious[pi, k])
            a = m.sum()
            if iou < 0.78 or a < 0.004 * carA or a > 0.6 * carA:
                continue
            inside = (m & car).sum() / max(1, a)
            if inside < 0.7:
                continue
            cand.append((iou, m & car))
    cand.sort(key=lambda t: -t[0])
    kept = []
    for iou, m in cand:
        dup = False
        for _, k in kept:
            inter = (m & k).sum()
            if inter / max(1, (m | k).sum()) > 0.85:
                dup = True
                break
        if not dup:
            kept.append((iou, m))
        if len(kept) >= 60:
            break
    return car, [m for _, m in kept]


def _mean(p, m):
    return float(p[m].mean()) if m.any() else 0.0



SEG_LABELS = {
    "glass": "a photo of a car window",
    "wheel": "a photo of a car wheel with a tyre",
    "headlight": "a photo of a car headlight",
    "taillight": "a photo of a car tail light",
    "plate": "a photo of a car license plate",
    "grille": "a photo of a car front grille",
    "hood": "a photo of the hood of a car",
    "roof": "a photo of the roof of a car",
    "body": "a photo of a painted car door panel",
    "bumper": "a photo of a car bumper",
    "mirror": "a photo of a car side mirror",
    "ground": "a photo of a shadow on the ground",
}
EXCLUDE = {"glass", "wheel", "headlight", "taillight", "plate", "grille"}


@torch.no_grad()
def classify_segments(seg, img, segs):
    names = list(SEG_LABELS)
    enc = seg.clip_tok([SEG_LABELS[n] for n in names], padding=True, return_tensors="pt")
    base = np.asarray(img.convert("RGB"))
    H, W = base.shape[:2]
    crops = []
    for m in segs:
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        pad = max(4, round(0.08 * max(y1 - y0, x1 - x0)))
        y0, y1 = max(0, y0 - pad), min(H, y1 + pad)
        x0, x1 = max(0, x0 - pad), min(W, x1 + pad)
        patch = base[y0:y1, x0:x1].copy()
        mm = m[y0:y1, x0:x1]
        patch[~mm] = (patch[~mm] * 0.25 + 128 * 0.75).astype(np.uint8)
        im = Image.fromarray(patch)
        side = max(im.size)
        sq = Image.new("RGB", (side, side), (128, 128, 128))
        sq.paste(im, ((side - im.size[0]) // 2, (side - im.size[1]) // 2))
        arr = (np.asarray(sq.resize((224, 224), Image.BICUBIC), dtype=np.float32) / 255.0 - _MEAN) / _STD
        crops.append(torch.from_numpy(arr.transpose(2, 0, 1)))
    out = []
    for i in range(0, len(crops), 24):
        pv = torch.stack(crops[i: i + 24])
        r = seg.clip(
            input_ids=enc["input_ids"].repeat(1, 1),
            attention_mask=enc["attention_mask"],
            pixel_values=pv,
        )
        out.append(torch.softmax(r.logits_per_image, dim=-1))
    probs = torch.cat(out, 0).numpy() if out else np.zeros((0, len(names)))
    return names, probs



def _rgb2lab(rgb):
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], dtype=np.float32)
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16.0 / 116.0)
    L = 116.0 * f[..., 1] - 16.0
    a = 500.0 * (f[..., 0] - f[..., 1])
    b = 200.0 * (f[..., 1] - f[..., 2])
    return L, a, b


def _body_by_colour(img, car):
    L, a, b = _rgb2lab(np.asarray(img.convert("RGB")))
    chroma = np.hypot(a, b)
    cc = chroma[car]
    if cc.size == 0:
        return car
    if np.percentile(cc, 75) < 14:
        return car
    sel = car & (chroma >= np.percentile(cc, 60))
    a0, b0 = np.median(a[sel]), np.median(b[sel])
    dist = np.hypot(a - a0, b - b0)
    return car & (dist < 32) & (chroma > 9) & (L > 8)


def _fill_small_holes(mask, px):
    return _erode(_dilate(mask, px * 2), px * 2) | mask


@torch.no_grad()
def _sam_point_masks(sam, img, pt):
    ctx = _sam_embed(sam, img)
    masks, ious = _sam_points(sam, ctx, [list(pt)])
    return masks[0], ious[0]


def build_mask(seg, category, img):
    if getattr(seg, "sam", None) is None or getattr(seg, "clip", None) is None:
        return build_mask_coarse(seg, category, img)
    P = seg.probs(img, ["car"])
    car, segs = sam_car_and_segments(seg, img, P)
    if car is None or not car.any() or not segs:
        return build_mask_coarse(seg, category, img)
    h, w = car.shape
    px = max(1, round(max(w, h) / 160))
    carA = car.sum()
    names, probs = classify_segments(seg, img, segs)

    def lab_prob(k, name):
        return float(probs[k][names.index(name)])

    def strong(kind, t):
        u = np.zeros_like(car)
        for k, m in enumerate(segs):
            if lab_prob(k, kind) >= t and m.sum() < 0.35 * carA:
                u |= m
        return u

    ground = strong("ground", 0.5)
    car = car & ~_dilate(ground, 1)
    cb = _largest_bbox(car)
    cx0, cy0, cx1, cy1 = cb

    if category == "wheels":
        wheels = strong("wheel", 0.30)
        if not wheels.any():
            return build_mask_coarse(seg, category, img)
        return _dilate(wheels, px)

    wheels_s = strong("wheel", 0.5)
    plate_s = strong("plate", 0.5)
    lights_s = strong("headlight", 0.5) | strong("taillight", 0.5)
    glass_s = strong("glass", 0.6)
    hard_excl = _dilate(wheels_s | plate_s | lights_s | glass_s, px)

    body = _body_by_colour(img, car) & ~hard_excl
    body = _clean(_fill_small_holes(body, px), 1)

    if category in ("paint", "wrap"):
        return body

    if category == "hood":
        wind = None
        best_a = 0
        for k, m in enumerate(segs):
            if lab_prob(k, "glass") >= 0.4:
                a = m.sum()
                if a > best_a:
                    wind, best_a = m, a
        hl = strong("headlight", 0.4) | strong("grille", 0.4)
        if wind is None or not hl.any():
            return build_mask_coarse(seg, category, img)
        wy, wx = np.where(wind)
        ly, lx = np.where(hl)
        fx_side = lx.mean() > wx.mean()
        sel = wy >= np.percentile(wy, 80)
        wp = (wx[sel].mean(), wy[sel].mean())
        lp = (lx.mean(), ly[ly <= np.percentile(ly, 50)].mean())
        pt = (0.5 * (wp[0] + lp[0]), 0.5 * (wp[1] + lp[1]))
        masks, ious = _sam_point_masks(seg.sam, img, pt)
        best, best_s = None, -1
        for m, s_ in zip(masks, ious):
            m = m & car
            a = m.sum() / carA
            if 0.02 <= a <= 0.25 and s_ > best_s:
                best, best_s = m, float(s_)
        if best is None:
            return build_mask_coarse(seg, category, img)
        return _clean(best & ~hard_excl, 1)

    if category == "spoiler":
        front = strong("headlight", 0.4) | strong("grille", 0.4)
        rear = strong("taillight", 0.4)
        bw, bh = cx1 - cx0, cy1 - cy0
        top0 = max(0, cy0 - round(bh * 0.18))
        top1 = cy0 + round(bh * 0.32)
        band = np.zeros_like(car)
        xa, xb = cx0, cx1
        if front.any() and not rear.any():
            ys, xs = np.where(front)
            if xs.mean() > (cx0 + cx1) / 2:
                xb = cx0 + round(bw * 0.5)
            else:
                xa = cx0 + round(bw * 0.5)
        band[top0:top1, xa:xb] = True
        return band & _dilate(car, px * 10)

    raise ValueError(category)

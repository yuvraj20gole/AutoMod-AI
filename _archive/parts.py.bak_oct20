import os

import numpy as np
from PIL import Image, ImageFilter

PANEL_REPO = "shanexf/car-panel-yolo11s-seg-scratch"
PANEL_FILE = "panel_best.pt"
LOCAL_WEIGHTS = os.path.join(os.path.dirname(__file__), "weights", PANEL_FILE)

BODY = {
    "front-door", "back-door", "fender", "quarter-panel", "hood",
    "front-bumper", "back-bumper", "trunk", "rocker-panel", "roof", "mirror",
}
GLASS = {"windshield", "back-windshield", "front-window", "back-window"}
LIGHTS = {"headlight", "tail-light"}
OTHER_EXCLUDE = {"grille", "license-plate"}
WHEELS = {"front-wheel", "back-wheel"}
EXCLUDE = GLASS | LIGHTS | OTHER_EXCLUDE | WHEELS
REAR_MARKERS = {"tail-light", "back-bumper", "trunk", "back-windshield"}


class NoRearView(Exception):
    pass


# Union of all detected parts from the most recent build_mask() call,
# stashed so composite() can clip to the car silhouette without
# changing build_mask()'s return value (server.py is untouched).
_LAST_SILHOUETTE = None


class PartsSegmenter:
    def __init__(self):
        from ultralytics import YOLO

        path = LOCAL_WEIGHTS
        if not os.path.exists(path):
            from huggingface_hub import hf_hub_download

            path = hf_hub_download(PANEL_REPO, PANEL_FILE)
        self.model = YOLO(path)

    def parts(self, img):
        w, h = img.size
        res = self.model.predict(
            img.convert("RGB"),
            conf=0.25,
            retina_masks=True,
            agnostic_nms=True,
            verbose=False,
            device="cpu",
        )[0]
        out = {}
        if res.masks is None:
            return out
        data = res.masks.data.cpu().numpy()
        for c, m in zip(res.boxes.cls.tolist(), data):
            name = res.names[int(c)]
            mm = m > 0.5
            if mm.shape != (h, w):
                mm = np.asarray(Image.fromarray(mm.astype(np.uint8) * 255).resize((w, h))) > 127
            out[name] = out.get(name, np.zeros((h, w), dtype=bool)) | mm
        return out


def _filter(mask, flt):
    im = Image.fromarray(mask.astype(np.uint8) * 255)
    return np.asarray(im.filter(flt)) > 127


def _dilate(mask, px):
    return mask if px <= 0 else _filter(mask, ImageFilter.MaxFilter(2 * px + 1))


def _erode(mask, px):
    return mask if px <= 0 else _filter(mask, ImageFilter.MinFilter(2 * px + 1))


def _clean(mask, px=1):
    return _dilate(_erode(mask, px), px)


def _fill_small_holes(mask, px):
    return _erode(_dilate(mask, px * 2), px * 2) | mask


def _union(P, names, shape):
    u = np.zeros(shape, dtype=bool)
    for n in names:
        if n in P:
            u |= P[n]
    return u


def _rgb2lab(rgb):
    c = rgb.astype(np.float32) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], dtype=np.float32)
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16.0 / 116.0)
    return 116.0 * f[..., 1] - 16.0, 500.0 * (f[..., 0] - f[..., 1]), 200.0 * (f[..., 1] - f[..., 2])


def _bbox(mask):
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def _median_smooth(v, k):
    if len(v) < 3:
        return v.copy()
    k = min(k, len(v) if len(v) % 2 == 1 else len(v) - 1)
    if k < 3:
        return v.copy()
    out = v.copy()
    r = k // 2
    for i in range(len(v)):
        out[i] = np.median(v[max(0, i - r): i + r + 1])
    return out


def _roof_pillar_extension(P, img, shape):
    """Roof + A/B/C-pillar area the panel detector misses (it never
    returns a usable ``roof`` mask on rear / 3/4 views, and the thin
    pillars between the windows are not panels either).

    The detector does give the glass. The car's greenhouse therefore
    spans, per image column, from the glass bottom up to the roof top.
    The roof top in a column is the topmost strong vertical luminance
    edge above the glass (glass->roof and roof->background are the only
    strong edges in that band on a car); columns where that edge is
    weak inherit the roofline from neighbouring columns where it is
    clear, and the line is smoothed because a real roof outline does
    not jump column to column. Filling between that roofline and the
    glass bottom and then removing the glass (and every other excluded
    part, done by the caller) leaves exactly the roof and pillars --
    car-coloured bodywork, never background, because the fill is
    bounded above by the detected roof edge.
    """
    glass = _union(P, GLASS, shape)
    if not glass.any():
        return np.zeros(shape, dtype=bool)
    h, w = shape
    L, _, _ = _rgb2lab(np.asarray(img.convert("RGB")))
    grad = np.abs(np.gradient(L.astype(np.float64), axis=0))

    ys, xs = np.where(glass)
    gx0, gx1 = int(xs.min()), int(xs.max())
    gy0, gy1 = int(ys.min()), int(ys.max())
    gh = max(1, gy1 - gy0)

    tops = np.full(w, np.nan)
    bots = np.full(w, np.nan)
    for x in range(gx0, gx1 + 1):
        col = np.where(glass[:, x])[0]
        if len(col):
            tops[x] = col.min()
            bots[x] = col.max()
    valid = ~np.isnan(tops)
    if valid.sum() < 2:
        return np.zeros(shape, dtype=bool)
    xi = np.arange(w)
    tops_i = np.interp(xi, xi[valid], tops[valid])
    bots_i = np.interp(xi, xi[valid], bots[valid])

    # Topmost strong edge above the glass, per column.
    max_rise = int(0.42 * gh)
    found = tops_i.copy()
    for x in range(gx0, gx1 + 1):
        gt = int(round(tops_i[x]))
        y0 = max(1, gt - max_rise)
        y1 = max(y0 + 1, gt - 2)
        edges = np.where(grad[y0:y1, x] > 1.8)[0]
        if len(edges):
            found[x] = y0 + int(edges[0])

    # Columns with a meaningful rise above the glass are roofline
    # anchors; interpolate across the rest (e.g. where a silver roof
    # meets a grey background too softly for a clean edge), then smooth.
    seg = found[gx0:gx1 + 1].copy()
    seg_tops = tops_i[gx0:gx1 + 1]
    anchor = seg <= seg_tops - 4
    if len(seg) >= 2:
        anchor[0] = True
        anchor[-1] = True
        seg[0] = seg_tops[0] - 3
        seg[-1] = seg_tops[-1] - 3
    if anchor.sum() > 2:
        xs_seg = np.arange(len(seg))
        seg = np.interp(xs_seg, xs_seg[anchor], seg[anchor])
    # Envelope: a column whose own edge landed on the glass->roof seam
    # instead of the roof outline borrows the highest roof point nearby.
    if len(seg) >= 3:
        r = min(7, len(seg) // 2)
        seg = np.array([seg[max(0, i - r): i + r + 1].min() for i in range(len(seg))])
    seg = _median_smooth(seg, 25)
    if len(seg) > 11:
        kernel = np.ones(11) / 11
        for _ in range(2):
            seg = np.convolve(np.pad(seg, (5, 5), mode="edge"), kernel, mode="valid")
    # A roof outline cannot drop/climb faster than this column to column.
    for _ in range(2):
        for i in range(1, len(seg)):
            seg[i] = min(seg[i], seg[i - 1] + 1.5)
        for i in range(len(seg) - 2, -1, -1):
            seg[i] = min(seg[i], seg[i + 1] + 1.5)
    # Taper the rise at the extreme ends, where the A/C pillars slope
    # away and a borrowed roofline would spill onto the background.
    if len(seg) >= 2:
        idx = np.arange(len(seg))
        dist_end = np.minimum(idx, len(seg) - 1 - idx)
        taper = 0.35 + 0.65 * np.minimum(1.0, dist_end / max(1.0, 0.12 * len(seg)))
        seg = seg_tops - (seg_tops - seg) * taper
    found[gx0:gx1 + 1] = np.minimum(seg, seg_tops)

    # The fill must reach the bodywork below the glass, not stop at the
    # glass bottom: the C-pillar runs on down to the quarter panel /
    # trunk. Extend each column to the first detected body panel below
    # the glass (at most one glass-height further down).
    panels = _union(P, BODY, shape)
    bots_ext = bots_i.copy()
    rows = np.arange(h)
    for x in range(gx0, gx1 + 1):
        col = np.where(panels[:, x] & (rows >= bots_i[x] - 2))[0]
        if len(col):
            bots_ext[x] = max(bots_i[x], min(float(col.min()), bots_i[x] + gh))

    yy = np.arange(h)[:, None]
    filled = (yy >= found[None, :]) & (yy <= bots_ext[None, :])
    filled[:, :gx0] = False
    filled[:, gx1 + 1:] = False

    # C-pillar wedge beyond the rear edge of the glass. The fill above
    # only spans the glass columns, but on a front 3/4 the C-pillar
    # slopes on past the back window, above the quarter panel, before
    # it meets the rear deck -- that triangle kept the original colour
    # (a white wedge on the Verna). Continue past the back window's
    # outer edge: per column the car outline there is the topmost
    # strong edge above the body panel top, smoothed like the roofline
    # and filled down into the panel so it joins the existing mask.
    bw = P.get("back-window")
    if bw is not None and bw.any():
        bx0, _, bx1, _ = _bbox(bw)
        rear_right = (bx0 + bx1) / 2 >= (gx0 + gx1) / 2
        panels_all = _union(P, BODY, shape)
        ext = round(1.5 * gh)
        if rear_right:
            cols = list(range(gx1 + 1, min(w, gx1 + 1 + ext)))
            start_outline = found[gx1]
        else:
            cols = list(range(gx0 - 1, max(-1, gx0 - 1 - ext), -1))
            start_outline = found[gx0]
        outlines = np.full(len(cols), np.nan)
        panel_tops = np.full(len(cols), np.nan)
        for i, x in enumerate(cols):
            col = np.where(panels_all[:, x])[0]
            if not len(col):
                continue
            ptop = int(col.min())
            panel_tops[i] = ptop
            y0 = max(1, ptop - round(0.85 * gh))
            y1 = max(y0 + 1, ptop - 2)
            edges = np.where(grad[y0:y1, x] > 1.8)[0]
            if len(edges):
                outlines[i] = y0 + int(edges[0])
        anchor = ~np.isnan(outlines) & ~np.isnan(panel_tops) & (outlines <= panel_tops - 4)
        if anchor.sum() >= 2:
            idx = np.arange(len(cols))
            # Join the roofline at the glass edge, interpolate the rest.
            xs_a = np.concatenate(([-1], idx[anchor]))
            vs_a = np.concatenate(([start_outline], outlines[anchor]))
            line = np.interp(idx, xs_a, vs_a)
            line = _median_smooth(line, 11)
            for i in range(1, len(line)):
                line[i] = min(line[i], line[i - 1] + 1.5)
            for i in range(len(line) - 2, -1, -1):
                line[i] = min(line[i], line[i + 1] + 1.5)
            for i, x in enumerate(cols):
                if np.isnan(panel_tops[i]):
                    continue
                top = int(round(min(line[i], panel_tops[i] - 1)))
                bot = int(min(h, panel_tops[i] + 7))
                if top < bot:
                    filled[top:bot, x] = True
    return filled & ~glass


def _front_corner_extension(P, img, shape, allp):
    """Front bumper corner / fascia strip the detector misses.

    In a rear 3/4 view there is often no ``front-bumper`` part at all,
    so the car-coloured corner in front of the front wheel, under the
    headlight, belongs to no panel; in a front 3/4 view a thin body
    strip between the hood and the grille/headlight falls between two
    detected parts the same way. Three conservative fills, all bounded
    by detected parts and -- for the outward scans -- by the car's own
    colour and outline edge, so background is not swept in:

    1. per row, scan outward from the frontmost detected part through
       car-coloured pixels, stopping at the outline edge or where the
       pixel becomes the row's edge-of-frame background;
    2. per column near the headlight, fill a short gap directly above
       or below a body panel (never a hole enclosed by a single panel,
       e.g. a grille opening inside a bumper, and never a
       headlight-bounded gap when no grille was detected -- that strip
       can be chrome trim that must keep its finish);
    3. scan up from the front wheel through car-coloured pixels to
       reach the bumper corner in front of the wheel.
    """
    if "headlight" not in P or not P["headlight"].any():
        return np.zeros(shape, dtype=bool)
    h, w = shape
    body = _union(P, BODY, shape)
    excl = _union(P, EXCLUDE, shape)
    L, a, b = _rgb2lab(np.asarray(img.convert("RGB")))
    lab = np.stack([L, a, b], axis=-1)

    cx0, cy0, cx1, cy1 = _bbox(allp)
    car_w = max(1, cx1 - cx0)
    hx0, hy0, hx1, hy1 = _bbox(P["headlight"])
    front_left = (hx0 + hx1) / 2 - cx0 < cx1 - (hx0 + hx1) / 2

    # Local body colour near the headlight, as the car-coloured test.
    near = np.zeros(shape, dtype=bool)
    near[max(0, hy0 - 50): hy1 + 60, max(0, hx0 - 60): hx1 + 60] = True
    ref_mask = body & near
    if ref_mask.sum() < 30:
        ref_mask = body
    if not ref_mask.any():
        return np.zeros(shape, dtype=bool)
    ref = np.median(lab[ref_mask], axis=0)
    car_coloured = np.sqrt(((lab - ref) ** 2).sum(axis=-1)) < 16

    cand = np.zeros(shape, dtype=bool)

    # 1) Row scan outward from the frontmost part in bumper/fender rows.
    bottoms = [
        int(_bbox(P[n])[3]) for n in ("front-bumper", "fender") if n in P and P[n].any()
    ]
    y_top = max(cy0, hy0 - 6)
    y_bot = (max(bottoms) + 12) if bottoms else hy1 + 40
    if "front-wheel" in P and P["front-wheel"].any():
        # the bumper corner wraps down in front of the tyre
        y_bot = max(y_bot, int(_bbox(P["front-wheel"])[3]) - 8)
    max_ext = round(0.07 * car_w)
    for y in range(y_top, min(h, y_bot + 1)):
        row = np.where(allp[y])[0]
        if not len(row):
            continue
        first = int(row.min()) if front_left else int(row.max())
        wheel_anchor = "front-wheel" in P and P["front-wheel"][y, first]
        if not (body[y, first] or P["headlight"][y, first] or wheel_anchor):
            continue
        edge_lab = np.median(lab[y, :8], axis=0) if front_left else np.median(lab[y, w - 8:], axis=0)
        step = -1 if front_left else 1
        x, n, gap = first + step, 0, 0
        while 0 <= x < w and n < max_ext:
            if car_coloured[y, x]:
                if n > 1 and np.sqrt(((lab[y, x] - edge_lab) ** 2).sum()) < 7:
                    break  # background beyond the outline
                cand[y, x] = True
                gap = 0
            else:
                # The bumper corner sits in front of the tyre, separated
                # from the fender by a few dark arch/tyre pixels. Skip a
                # short non-body run (without painting it) and keep
                # looking; a longer run is background or shadow.
                gap += 1
                if gap > 5:
                    break
            x += step
            n += 1

    # 2) Short vertical gap-fill in the front zone.
    obstacles = body | excl
    zx0, zx1 = (cx0, hx1 + 6) if front_left else (hx0 - 6, cx1)
    max_gap = round(0.06 * h)
    grille_any = "grille" in P and P["grille"].any()
    for x in range(max(0, zx0), min(w, zx1 + 1)):
        col = obstacles[:, x]
        y = 0
        while y < h:
            if col[y]:
                y += 1
                continue
            start = y
            while y < h and not col[y]:
                y += 1
            end = y - 1
            if start == 0 or y >= h or end - start + 1 > max_gap:
                continue
            above_parts = {n for n, m in P.items() if m[start - 1, x]}
            below_parts = {n for n, m in P.items() if m[y, x]}
            if above_parts & below_parts & BODY:
                continue  # hole inside one panel (e.g. grille opening)
            if not grille_any and ("headlight" in above_parts or "headlight" in below_parts):
                continue  # may be chrome headlight trim -- keep its finish
            if body[start - 1, x] or body[y, x]:
                cand[start:end + 1, x] = True

    # 3) Bumper corner above the front wheel. Start at each column's
    # own wheel top (columns outside the wheel have no business
    # scanning up -- on a shadow-side car the background there can be
    # close enough to the body colour to climb into it) and stop where
    # the pixel becomes the row's edge-of-frame background.
    wheel = P.get("front-wheel")
    if wheel is not None and wheel.any():
        wx0, wy0, wx1, wy1 = _bbox(wheel)
        ww = wx1 - wx0
        if front_left:
            cols = range(wx0, wx0 + round(0.45 * ww) + 1)
        else:
            cols = range(wx1 - round(0.45 * ww), wx1 + 1)
        for x in cols:
            col = np.where(wheel[:, x])[0]
            if not len(col):
                continue
            y, n = int(col.min()) - 1, 0
            while y >= 0 and n < round(0.8 * (wy1 - wy0)) and car_coloured[y, x]:
                edge_lab = np.median(lab[y, :8], axis=0) if front_left else np.median(lab[y, w - 8:], axis=0)
                if n > 1 and np.sqrt(((lab[y, x] - edge_lab) ** 2).sum()) < 7:
                    break
                cand[y, x] = True
                y -= 1
                n += 1

    return cand & ~_dilate(excl, 1)


def build_mask(seg, category, img):
    global _LAST_SILHOUETTE
    P = seg.parts(img)
    w, h = img.size
    shape = (h, w)
    px = max(1, round(max(w, h) / 160))
    allp = _union(P, P.keys(), shape)
    _LAST_SILHOUETTE = allp.copy()
    if not allp.any():
        if category == "spoiler":
            raise NoRearView()
        return None
    excl = _union(P, EXCLUDE, shape)

    if category in ("paint", "wrap"):
        panels = _union(P, BODY, shape)
        if not panels.any():
            return None
        body = panels.copy()
        L, a, b = _rgb2lab(np.asarray(img.convert("RGB")))
        chroma = np.hypot(a, b)
        pc = chroma[panels]
        if pc.size > 50 and np.percentile(pc, 75) >= 14:
            sel = panels & (chroma >= np.percentile(pc, 50))
            a0, b0 = np.median(a[sel]), np.median(b[sel])
            colour = (np.hypot(a - a0, b - b0) < 30) & (chroma > 9) & (L > 8)
            body |= colour & _dilate(panels, px * 6)
        # The detector gives no roof and no pillars (see the helper), so
        # without this the roof/pillar region keeps the original colour
        # on rear and 3/4 photos. Paint/wrap only: the hood, wheels and
        # spoiler branches must not inherit the greenhouse.
        body |= _roof_pillar_extension(P, img, shape)
        # Same story at the nose: bumper corner / fascia strip that no
        # detected panel owns (paint/wrap only, like the roof above).
        body |= _front_corner_extension(P, img, shape, allp)
        body &= ~_dilate(excl, 1)
        return _clean(_fill_small_holes(body, px), 1)

    if category == "wheels":
        wm = _union(P, WHEELS, shape)
        return _dilate(wm, px) if wm.any() else None

    if category == "hood":
        hm = P.get("hood")
        return _clean(hm, 1) if hm is not None and hm.any() else None

    if category == "spoiler":
        rear = _union(P, {"trunk", "back-windshield", "tail-light"}, shape)
        if not (set(P) & REAR_MARKERS) or not rear.any():
            raise NoRearView()
        cx0, cy0, cx1, cy1 = _bbox(allp)
        bh = cy1 - cy0
        keep_out = _union(P, GLASS | LIGHTS | OTHER_EXCLUDE, shape)

        # Sedan: rear glass sits above a separate boot lid (trunk extends well
        # below the glass). Anchor to the boot lid's rear/trailing edge --
        # just above the tail lights / plate -- not to the roof line, where a
        # band would float in the background. In a rear view a "windshield"
        # mask above the trunk is the rear glass mislabelled (e.g. Corolla),
        # so count it as rear glass here.
        trunk = P.get("trunk")
        rear_glass = _union(P, {"back-windshield", "windshield"}, shape)
        distinct_boot = False
        if trunk is not None and trunk.any() and rear_glass.any():
            tx0, ty0, tx1, ty1 = _bbox(trunk)
            gx0, gy0, gx1, gy1 = _bbox(rear_glass)
            distinct_boot = (
                (ty1 - gy1) >= round(bh * 0.15)
                and (ty1 - ty0) >= round(bh * 0.12)
                and gy1 <= ty0 + round(bh * 0.05)
            )
        if distinct_boot:
            if "tail-light" in P and P["tail-light"].any():
                edge_y = int(_bbox(P["tail-light"])[1])
            else:
                edge_y = ty0 + round((ty1 - ty0) * 0.30)
            padx = round((tx1 - tx0) * 0.08)
            band = np.zeros(shape, dtype=bool)
            band[
                max(0, edge_y - round(bh * 0.04)): edge_y + round(bh * 0.01),
                max(0, tx0 - padx): tx1 + padx,
            ] = True
        else:
            # Hatchback / SUV (no distinct boot lid): keep the roof-edge anchor.
            anchor = _union(P, {"back-windshield", "trunk"}, shape)
            if not anchor.any():
                anchor = rear
            ax0, ay0, ax1, ay1 = _bbox(anchor)
            padx = round((ax1 - ax0) * 0.08)
            band = np.zeros(shape, dtype=bool)
            band[
                max(0, ay0 - round(bh * 0.07)): ay0 + round(bh * 0.02),
                max(0, ax0 - padx): ax1 + padx,
            ] = True
        band &= ~_dilate(keep_out, 1)
        # Clip to the car silhouette (all detected parts, slightly eroded)
        # so no part of the band spills onto the background -- e.g. the few
        # pixels that used to leak past the right tail light.
        silhouette = _erode(allp, 1)
        if silhouette.any():
            band &= silhouette
        return band

    raise ValueError(category)


def composite(orig_full, edited_full, mask, blur_frac=0.004, silhouette=None, dark=None):
    """Composite the edit over the original through the mask.

    The mask itself (which pixels are bodywork) is unchanged; only the
    feathering moves. Previously the blurred mask was centred on the
    mask edge, so the transition band straddled the outline and its
    inner half blended the *original* paint back in -- on a dark
    recolour of a light car that inner half showed as a pale halo
    along the roof and rear outline. Now the mask is dilated by a
    couple of pixels at output resolution and blurred with a slightly
    smaller radius, and the un-blurred core is forced back on top, so
    every originally-masked pixel is fully recoloured and the feather
    falls outside the outline, on the recoloured side of the edge.

    The feathered alpha is then clipped to the car silhouette -- the
    union of all detected part masks (stashed by build_mask(), or
    passed in), unioned with the mask itself so the roof/pillar and
    front-corner extensions, which are car but not named parts, are
    not cut -- eroded by 1px at mask resolution and upsampled smoothly
    as an alpha ceiling, so no recolour or feather lands on the
    background and the clipped edge stays anti-aliased. For dark target colours
    (matte_black and similar: low luminance *and* low chroma in the
    edit, inferred from the edited pixels inside the mask unless
    ``dark`` is given) the 1-2px fringe just inside the silhouette
    near the recolour is then darkened toward the edit's interior
    colour, so light edge pixels of the original paint cannot show
    through along the outline.
    """
    W, H = orig_full.size
    core_img = Image.fromarray(mask.astype(np.uint8) * 255).resize((W, H), Image.Resampling.NEAREST)
    core = np.asarray(core_img) > 127
    grow = max(1, round(W * 0.0015))  # ~2px at 1024 wide
    grown = _dilate(core, grow)
    m = Image.fromarray(grown.astype(np.uint8) * 255).filter(
        ImageFilter.GaussianBlur(max(1.0, W * blur_frac * 0.6))
    )
    alpha = np.maximum(np.asarray(core_img), np.asarray(m))

    sil = silhouette if silhouette is not None else _LAST_SILHOUETTE
    sil_out = None
    if sil is not None and np.asarray(sil).any():
        # Erode by 1px at mask resolution (as the spoiler branch does),
        # then upsample smoothly: a binary clip upsampled with NEAREST
        # leaves a stepped, dashed edge at output resolution, while a
        # bilinear ceiling anti-aliases the same boundary.
        sil_union = np.asarray(sil).astype(bool) | mask.astype(bool)
        sil_er_m = _erode(sil_union, 1)
        if sil_er_m.any():
            clip = Image.fromarray(sil_er_m.astype(np.uint8) * 255).resize(
                (W, H), Image.Resampling.BILINEAR
            ).filter(ImageFilter.GaussianBlur(0.8))
            alpha = np.minimum(alpha, np.asarray(clip))
            sil_out = np.asarray(
                Image.fromarray(sil_union.astype(np.uint8) * 255).resize(
                    (W, H), Image.Resampling.BILINEAR
                )
            ) > 127
    out = Image.composite(edited_full, orig_full, Image.fromarray(alpha))

    edited = np.asarray(edited_full.convert("RGB")).astype(np.float32)
    if dark is None:
        inner = _erode(core, 2)
        if inner.sum() < 50:
            inner = core
        if inner.any():
            lum = edited @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            chroma = edited.max(axis=-1) - edited.min(axis=-1)
            dark = bool(np.median(lum[inner]) < 120 and np.median(chroma[inner]) < 50)
        else:
            dark = False
    if dark and sil_out is not None:
        # 1-2px fringe just inside the outline: the silhouette band
        # (clipped outermost pixel plus 1px inside it, kept tight to
        # the mask so silhouette overshoot on the background is not
        # darkened) union the mask's own edge band, which also covers
        # mask edges against glass and lights inside the silhouette.
        fringe = (sil_out & ~_erode(sil_out, 2) & _dilate(core, grow + 1)) | (
            _dilate(core, 2) & ~_erode(core, 2) & sil_out
        )
        inner = _erode(core, 3)
        if fringe.any() and inner.sum() >= 20:
            ref = np.median(edited[inner], axis=0)
            arr = np.asarray(out).astype(np.float32)
            lum = arr @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            ed_lum = edited @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            ref_lum = float(ref @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
            # Composite still light *and* the edit itself dark there:
            # the second condition keeps background pixels the
            # segmenter overshot (edit = background grey) untouched.
            light = fringe & (lum > ref_lum + 30) & (ed_lum < ref_lum + 50)
            if light.any():
                arr[light] = 0.3 * arr[light] + 0.7 * ref
                out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    return out

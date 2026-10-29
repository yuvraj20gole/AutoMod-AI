import sys

from PIL import Image

from masks import NEEDS, Segmenter, build_mask, overlay

RES = 512


def main(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    s = RES / max(w, h)
    img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.Resampling.LANCZOS)
    seg = Segmenter()
    for cat in NEEDS:
        m = build_mask(seg, cat, img)
        overlay(img, m).save(f"mask_{cat}.png")
        print(cat, "mask coverage: %.1f%%" % (100 * m.mean()))
    print("saved mask_*.png in the current folder")


if __name__ == "__main__":
    main(sys.argv[1])

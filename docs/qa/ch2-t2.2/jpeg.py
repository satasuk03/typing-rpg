"""Turn the capture PNGs into <400 KB JPEGs and build the comparison sheets.
   python3 docs/qa/ch2-t2.2/jpeg.py <pngDir> <outDir>
   PNG names: fen-1280, fen-1920, fen-t0/t1/t2 (1280), forest-1920, ch1-l02|l09-{before,after}
"""
import os
import sys
from PIL import Image, ImageChops, ImageDraw

src, out = sys.argv[1], sys.argv[2]
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def save(im, name, q=88):
    path = os.path.join(out, name)
    for qq in range(q, 40, -6):
        im.convert("RGB").save(path, "JPEG", quality=qq, optimize=True)
        if os.path.getsize(path) < 380_000:
            break
    print(name, os.path.getsize(path) // 1024, "KB q", qq)


for n in ["fen-1280", "fen-1920"]:
    save(Image.open(f"{src}/{n}.png"), f"{n}.jpg")

# Ch1 unchanged: before (base commit) | after (T2.2) | amplified difference (all-black = pixel identical)
for n in ["ch1-l02", "ch1-l09"]:
    a = Image.open(f"{src}/{n}-before.png").convert("RGB")
    b = Image.open(f"{src}/{n}-after.png").convert("RGB")
    d = ImageChops.difference(a, b)
    ident = d.getbbox() is None
    w, h = 640, 360
    sheet = Image.new("RGB", (w * 3, h + 24), (12, 12, 16))
    for i, (im, label) in enumerate([(a, "before (base 84b9d16)"), (b, "after (T2.2)"), (d.point(lambda v: min(255, v * 40)), "diff x40" + (" : IDENTICAL" if ident else ""))]):
        sheet.paste(im.resize((w, h), Image.LANCZOS), (i * w, 24))
        ImageDraw.Draw(sheet).text((i * w + 8, 6), f"{n} {label}", fill=(230, 230, 230))
    save(sheet, f"{n}-unchanged.jpg")


def cell(path, size=(800, 450)):
    return Image.open(path).convert("RGB").resize(size, Image.LANCZOS)


# comparison: C0.2 fen mock | T2.2 fen (real renderer) / Ch1 L2 forest (shipping) | T2.2 fen tier 2
rows = [
    ("C0.2 fen mock (target, scratch sprites)", os.path.join(repo, "docs/vfx/ch2-mock/ch2-fen.jpg"), "T2.2 fen (real renderer, Ch1 stand-in monsters)", f"{src}/fen-1920.png"),
    ("Ch1 L2 forest battle (shipping)", f"{src}/forest-1920.png", "T2.2 fen, tier 2 (opaque matte bog, 1280)", f"{src}/fen-t2.png"),
]
sheet = Image.new("RGB", (1600, len(rows) * 474), (12, 12, 16))
for r, (la, pa, lb, pb) in enumerate(rows):
    for c, (lab, p) in enumerate([(la, pa), (lb, pb)]):
        sheet.paste(cell(p), (c * 800, r * 474 + 24))
        ImageDraw.Draw(sheet).text((c * 800 + 8, r * 474 + 6), lab, fill=(230, 230, 230))
save(sheet, "comparison-sheet.jpg", 82)

# water-tier strip: the water band (bottom 40%) of tier 0 / 1 / 2, plus a full frame for orientation
tiers = [("tier 0: props + actors mirrored", "fen-t0"), ("tier 1: props only", "fen-t1"), ("tier 2: opaque matte bog", "fen-t2")]
W, H = 640, 360
strip = Image.new("RGB", (W * 3, H + 24 + 150), (12, 12, 16))
for i, (lab, n) in enumerate(tiers):
    im = Image.open(f"{src}/{n}.png").convert("RGB")
    strip.paste(im.resize((W, H), Image.LANCZOS), (i * W, 24))
    band = im.crop((0, int(im.height * 0.74), im.width, im.height)).resize((W, 150), Image.LANCZOS)
    strip.paste(band, (i * W, 24 + H))
    ImageDraw.Draw(strip).text((i * W + 8, 6), lab, fill=(230, 230, 230))
save(strip, "water-tiers.jpg", 84)

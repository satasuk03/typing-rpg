"""Turn the capture PNGs into <400 KB JPEGs and build the comparison sheet.
   python3 docs/qa/ch2-t2.1/jpeg.py <pngDir> <outDir>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageChops

src, out = sys.argv[1], sys.argv[2]
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def save(im, name, q=88):
    path = os.path.join(out, name)
    for qq in range(q, 40, -6):
        im.convert("RGB").save(path, "JPEG", quality=qq, optimize=True)
        if os.path.getsize(path) < 380_000:
            break
    print(name, os.path.getsize(path) // 1024, "KB q", qq)


for n in ["hushwood-1920", "hushwood-1280", "grove-1920", "grove-1280", "hushwood-tier2-1280", "grove-intro-bars-1920"]:
    save(Image.open(f"{src}/{n}.png"), f"{n}.jpg")

# Ch1 unchanged: before | after | amplified difference (all-black = pixel identical)
for n in ["ch1-l02", "ch1-l09"]:
    a = Image.open(f"{src}/{n}-before.png").convert("RGB")
    b = Image.open(f"{src}/{n}-after.png").convert("RGB")
    d = ImageChops.difference(a, b)
    ident = d.getbbox() is None
    w, h = 640, 360
    sheet = Image.new("RGB", (w * 3, h + 24), (12, 12, 16))
    for i, (im, label) in enumerate([(a, "before (main)"), (b, "after (T2.1)"), (d.point(lambda v: min(255, v * 40)), "diff x40" + (" : IDENTICAL" if ident else ""))]):
        sheet.paste(im.resize((w, h), Image.LANCZOS), (i * w, 24))
        ImageDraw.Draw(sheet).text((i * w + 8, 6), f"{n} {label}", fill=(230, 230, 230))
    save(sheet, f"{n}-unchanged.jpg")


# comparison sheet: poc v2 | Ch1 L2 forest (shipping) / C0.2 mock hushwood | T2.1 hushwood / mock grove | T2.1 grove
def cell(path):
    return Image.open(path).convert("RGB").resize((800, 450), Image.LANCZOS)


rows = [
    ("poc/v2-forest-battle (POC target)", os.path.join(repo, "poc/v2-forest-battle.png"), "Ch1 L2 forest battle (shipping)", f"{src}/ch1-l02-after.png"),
    ("C0.2 mock hushwood", os.path.join(repo, "docs/vfx/ch2-mock/ch2-hushwood.jpg"), "T2.1 hushwood (real renderer, Ch1 stand-ins)", f"{src}/hushwood-1920.png"),
    ("C0.2 mock grove", os.path.join(repo, "docs/vfx/ch2-mock/ch2-grove.jpg"), "T2.1 grove (real renderer, willow stand-in)", f"{src}/grove-1920.png"),
]
sheet = Image.new("RGB", (1600, 3 * 474), (12, 12, 16))
for r, (la, pa, lb, pb) in enumerate(rows):
    for c, (lab, p) in enumerate([(la, pa), (lb, pb)]):
        sheet.paste(cell(p), (c * 800, r * 474 + 24))
        ImageDraw.Draw(sheet).text((c * 800 + 8, r * 474 + 6), lab, fill=(230, 230, 230))
save(sheet, "comparison-sheet.jpg", 80)

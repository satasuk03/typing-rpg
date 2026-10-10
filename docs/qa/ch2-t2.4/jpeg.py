"""Build the T2.4 evidence JPEGs (< 400 KB each) from the capture PNGs.
   python3 docs/qa/ch2-t2.4/jpeg.py <pngDir> <outDir>
   PNG names: lNN (battle pose, 1280x720), l10-anchors, l10-boss, walk-lNN (optional), ch1-l02|l09-{before,after}
"""
import os
import sys
from PIL import Image, ImageChops, ImageDraw

src, out = sys.argv[1], sys.argv[2]
NAMES = [
    "L1 Moonward Trail (hushwood)", "L2 Lantern Path (hushwood)", "L3 Hollow Oaks (hushwood)", "L4 Owl's Rest (hushwood)",
    "L5 Mirewater Edge (fen)", "L6 Sunken Shrine (fen)", "L7 Reedmaze (fen)", "L8 Firefly Crossing (fen)",
    "L9 Weeping Reach (fen)", "L10 Willow's Heart (grove)",
]


def save(im, name, q=88):
    path = os.path.join(out, name)
    for qq in range(q, 40, -6):
        im.convert("RGB").save(path, "JPEG", quality=qq, optimize=True)
        if os.path.getsize(path) < 380_000:
            break
    print(name, os.path.getsize(path) // 1024, "KB q", qq)


def sheet(prefix, title, cols=2, w=640, h=360):
    rows = 5
    im = Image.new("RGB", (cols * w, rows * (h + 20)), (12, 12, 16))
    d = ImageDraw.Draw(im)
    for i, label in enumerate(NAMES):
        p = f"{src}/{prefix}{i + 1:02d}.png"
        if not os.path.exists(p):
            continue
        x, y = (i % cols) * w, (i // cols) * (h + 20)
        im.paste(Image.open(p).convert("RGB").resize((w, h), Image.LANCZOS), (x, y + 20))
        d.text((x + 8, y + 5), label, fill=(235, 235, 235))
    save(im, f"{title}.jpg", 80)


sheet("l", "contact-sheet-battle")  # file names l01.png ... l10.png
if os.path.exists(f"{src}/l10-anchors.png"):
    save(Image.open(f"{src}/l10-anchors.png"), "l10-anchors-overlay.jpg")
if os.path.exists(f"{src}/l10-boss.png"):
    save(Image.open(f"{src}/l10-boss.png"), "l10-boss-pose.jpg")
if os.path.exists(f"{src}/walk-l05.png"):
    w = 640
    im = Image.new("RGB", (w * 2, 360 * 2), (12, 12, 16))
    for k, n in enumerate(["walk-l01", "walk-l05", "walk-l08", "walk-l09"]):
        if os.path.exists(f"{src}/{n}.png"):
            im.paste(Image.open(f"{src}/{n}.png").convert("RGB").resize((w, 360), Image.LANCZOS), ((k % 2) * w, (k // 2) * 360))
    save(im, "walk-poses.jpg", 82)

# Ch1 unchanged: before (base commit) | after | amplified difference (all-black = pixel identical)
for n in ["ch1-l02", "ch1-l09"]:
    if not os.path.exists(f"{src}/{n}-before.png"):
        continue
    a = Image.open(f"{src}/{n}-before.png").convert("RGB")
    b = Image.open(f"{src}/{n}-after.png").convert("RGB")
    d = ImageChops.difference(a, b)
    ident = d.getbbox() is None
    w, h = 640, 360
    sh = Image.new("RGB", (w * 3, h + 24), (12, 12, 16))
    for i, (im, label) in enumerate([(a, "before (main)"), (b, "after (T2.4)"), (d.point(lambda v: min(255, v * 40)), "diff x40" + (" : IDENTICAL" if ident else " : DIFFERS"))]):
        sh.paste(im.resize((w, h), Image.LANCZOS), (i * w, 24))
        ImageDraw.Draw(sh).text((i * w + 8, 6), f"{n} {label}", fill=(230, 230, 230))
    save(sh, f"{n}-unchanged.jpg")
    print(n, "pixel identical:", ident)

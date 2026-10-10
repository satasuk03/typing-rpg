"""Turn the T2.3 capture PNGs into <400 KB JPEGs, the Ch1 diff sheets and the vs-mock sheet.
   python3 docs/qa/ch2-t2.3/jpeg.py <pngDir> <outDir>
"""
import os
import sys
from PIL import Image, ImageChops, ImageDraw

src, out = sys.argv[1], sys.argv[2]
repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def save(im, name, q=90):
    path = os.path.join(out, name)
    for qq in range(q, 40, -5):
        im.convert("RGB").save(path, "JPEG", quality=qq, optimize=True)
        if os.path.getsize(path) < 380_000:
            break
    print(name, os.path.getsize(path) // 1024, "KB q", qq)


for n, name in [
    ("sheet-enemies", "contact-sheet-enemies.jpg"),
    ("sheet-willow", "willow-strip.jpg"),
    ("hushwood-1280", "hushwood-battle-1280.jpg"),
    ("grove-1280", "grove-battle-1280.jpg"),
    ("hushwood-elite-1280", "hushwood-elite-wolf-1280.jpg"),
    ("hushwood-1920", "hushwood-battle-1920.jpg"),
    ("grove-1920", "grove-battle-1920.jpg"),
]:
    save(Image.open(f"{src}/{n}.png"), name)

# Ch1 unchanged: before (base commit) | after (this branch) | amplified difference
res = []
for n in ["ch1-l02", "ch1-l09"]:
    a = Image.open(f"{src}/{n}-before.png").convert("RGB")
    b = Image.open(f"{src}/{n}-after.png").convert("RGB")
    d = ImageChops.difference(a, b)
    ident = d.getbbox() is None
    res.append((n, ident))
    w, h = 640, 360
    sheet = Image.new("RGB", (w * 3, h + 24), (12, 12, 16))
    for i, (im, label) in enumerate([(a, "before (base)"), (b, "after (T2.3)"), (d.point(lambda v: min(255, v * 40)), "diff x40" + (" : IDENTICAL" if ident else " : DIFFERS"))]):
        sheet.paste(im.resize((w, h), Image.LANCZOS), (i * w, 24))
        ImageDraw.Draw(sheet).text((i * w + 8, 6), f"{n} {label}", fill=(230, 230, 230))
    save(sheet, f"{n}-unchanged.jpg")
print("ch1 identical:", res)

# vs-mock sheet: C0.2 mock (rows 2 and 3: frames, normals/emissive/silhouette) above this build's rows
mock = Image.open(os.path.join(repo, "docs/vfx/ch2-mock/ch2-sprites-sheet.jpg")).convert("RGB")
mine = Image.open(f"{src}/sheet-enemies.png").convert("RGB")
m_top = mock.crop((0, 270, 1920, 780))
my_top = mine.crop((0, 214, 1920, 830)).resize((1920, 616))
sheet = Image.new("RGB", (1920, 510 + 616 + 70), (12, 12, 16))
d = ImageDraw.Draw(sheet)
d.text((12, 6), "C0.2 MOCK (direction only): Ch2 enemies, frames + normal / emissive / silhouette rows", fill=(255, 210, 122))
sheet.paste(m_top, (0, 24))
d.text((12, 510 + 34), "T2.3 (this build): same enemies, production sprites", fill=(255, 210, 122))
sheet.paste(my_top, (0, 510 + 56))
save(sheet, "vs-c02-mock.jpg", 88)

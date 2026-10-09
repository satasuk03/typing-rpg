"""Builds the Chapter 1 level contact sheet: all 10 levels in the walk pose (5 x 2 grid).

Usage (from apps/game):  python3 tests/render/contactsheet.py [pose]   (pose = walk | battle1, default walk)
Reads  tests/render/__shots__/levels/<id>-<pose>.png  (written by levels.spec.ts)
Writes tests/render/__shots__/levels-contact-sheet.png  (the only committed level image)
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
shots = here / "__shots__"
pose = sys.argv[1] if len(sys.argv) > 1 else "walk"
ids = [f"ch1-l{i:02d}" for i in range(1, 11)]
names = [
    "Sunlit Glade",
    "Whispering Wood",
    "Amber Edge",
    "Ember Gate",
    "Overgrown Court",
    "Moonlit Colonnade",
    "The Descent",
    "Crystal Gallery",
    "Fungal Warren",
    "Golem Hollow",
]

cols, rows = 2, 5
tw, th = 640, 360
pad, label = 8, 22
sheet = Image.new(
    "RGB", (cols * (tw + pad) + pad, rows * (th + label + pad) + pad), (12, 10, 16)
)
d = ImageDraw.Draw(sheet)
for i, (lid, name) in enumerate(zip(ids, names)):
    f = shots / "levels" / f"{lid}-{pose}.png"
    if not f.exists():
        print("missing", f)
        continue
    c, r = i % cols, i // cols
    x = pad + c * (tw + pad)
    y = pad + r * (th + label + pad)
    d.text((x + 2, y + 4), f"{lid}  {name}  ({pose})", fill=(233, 196, 106))
    sheet.paste(Image.open(f).convert("RGB").resize((tw, th), Image.LANCZOS), (x, y + label))
out = shots / ("levels-contact-sheet.png" if pose == "walk" else f"levels-contact-sheet-{pose}.png")
sheet.save(out, optimize=True)
print("wrote", out)

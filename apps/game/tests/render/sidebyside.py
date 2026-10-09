"""Builds side-by-side comparison images: POC (left) vs this render core (right).

Usage: python3 tests/render/sidebyside.py [size]   (size = 1280x720 | 1920x1080, default 1280x720)
Reads  tests/render/__shots__/poc/<biome>-<size>.png and __shots__/<biome>-<size>.png
Writes tests/render/__shots__/side-by-side/<biome>-<size>.png
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
shots = here / "__shots__"
out_dir = shots / "side-by-side"
out_dir.mkdir(parents=True, exist_ok=True)
size = sys.argv[1] if len(sys.argv) > 1 else "1280x720"

for biome in ("forest", "ruins", "cave", "boss"):
    a = shots / "poc" / f"{biome}-{size}.png"
    b = shots / f"{biome}-{size}.png"
    if not (a.exists() and b.exists()):
        print("skip", biome)
        continue
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    w, h = ia.size
    ib = ib.resize((w, h)) if ib.size != ia.size else ib
    pad = 28
    img = Image.new("RGB", (w * 2 + 12, h + pad), (12, 10, 16))
    img.paste(ia, (0, pad))
    img.paste(ib, (w + 12, pad))
    d = ImageDraw.Draw(img)
    d.text((8, 8), f"POC v2 (reference) - {biome} {size}", fill=(233, 196, 106))
    d.text((w + 20, 8), f"render core (T2.1) - {biome} {size}", fill=(159, 220, 255))
    img.save(out_dir / f"{biome}-{size}.png")
    print("wrote", out_dir / f"{biome}-{size}.png")

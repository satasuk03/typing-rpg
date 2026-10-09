#!/usr/bin/env python3
"""Shrink the T2.3 combat stills (`__shots__/combat-*.png`, 1280x720) to < 1 MB each without changing their size.

The Playwright spec writes full-colour PNGs (~1.1 MB). This quantises them to an adaptive 256-colour palette with
Floyd-Steinberg dither (~0.35 MB), which keeps the bloom gradients clean. Run after `combat-fx.spec.ts`:

    python3 tests/vfx/shrink_stills.py
"""

import os
import sys
from pathlib import Path

from PIL import Image

here = Path(__file__).resolve().parent / "__shots__"
total_before = total_after = 0
for p in sorted(here.glob("combat-*.png")):
    before = os.path.getsize(p)
    im = Image.open(p).convert("RGB")
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(p, optimize=True)
    after = os.path.getsize(p)
    total_before += before
    total_after += after
    print(f"{p.name}: {before // 1024} KB -> {after // 1024} KB")
print(f"total {total_before // 1024} KB -> {total_after // 1024} KB")
sys.exit(0)

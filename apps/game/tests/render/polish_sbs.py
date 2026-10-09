"""Before/after side-by-sides for the T6.3 level polish (L4, L8, L9, L10).

Usage (from apps/game):  python3 tests/render/polish_sbs.py
Reads  tests/render/__shots__/polish/{before,after}/<id>-<pose>.png  (written by polish.spec.ts, POLISH_PHASE=before|after)
Writes docs/qa/t6.3-level-polish/<id>-before-after.jpg  (one row per pose, before | after, 560 px per panel)
"""

from pathlib import Path

from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
shots = here / "__shots__" / "polish"
out_dir = here.parents[3] / "docs" / "qa" / "t6.3-level-polish"
out_dir.mkdir(parents=True, exist_ok=True)
CASES = {
    "ch1-l04": ["walk", "battle1"],
    "ch1-l08": ["walk", "battle1"],
    "ch1-l09": ["walk", "battle1"],
    "ch1-l10": ["walk", "battle1", "boss"],
}
W, H, PAD, LABEL = 560, 315, 6, 18
for lid, poses in CASES.items():
    img = Image.new("RGB", (W * 2 + PAD * 3, len(poses) * (H + LABEL + PAD) + PAD), (12, 10, 16))
    d = ImageDraw.Draw(img)
    for r, pose in enumerate(poses):
        y = PAD + r * (H + LABEL + PAD)
        for c, phase in enumerate(("before", "after")):
            x = PAD + c * (W + PAD)
            d.text((x + 2, y + 3), f"{lid} {pose} - {phase}", fill=(233, 196, 106))
            f = shots / phase / f"{lid}-{pose}.png"
            img.paste(Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS), (x, y + LABEL))
    out = out_dir / f"{lid}-before-after.jpg"
    img.save(out, quality=84, optimize=True)
    print("wrote", out, out.stat().st_size // 1024, "KB")

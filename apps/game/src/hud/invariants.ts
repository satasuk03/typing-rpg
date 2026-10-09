/** Readability invariants checked by the Playwright readability test and by unit tests. */
import type { HudDebugSnapshot } from "./hud";
import { rectInside, rectsOverlap } from "./layout";

export const MIN_FONT_PX = 14;
export const MIN_CONTRAST = 4.5;

/** Returns a list of human-readable violations (empty = readable). */
export function checkSnapshot(s: HudDebugSnapshot): string[] {
  const out: string[] = [];
  const { w, h } = s.viewport;
  for (const p of s.plates) {
    if (!rectInside(p.rect, w, h, 0)) out.push(`plate ${p.id} outside viewport`);
    if (p.fontPx < MIN_FONT_PX)
      out.push(`plate ${p.id} font ${p.fontPx.toFixed(1)}px < ${MIN_FONT_PX}`);
    if (p.contrast < MIN_CONTRAST)
      out.push(`plate ${p.id} contrast ${p.contrast.toFixed(2)} < ${MIN_CONTRAST}`);
    for (const l of p.letters) {
      const t = 8; // tolerance for shake / bounce offsets
      if (
        l.x < p.rect.x - t ||
        l.y < p.rect.y - t ||
        l.x + l.w > p.rect.x + p.rect.w + t ||
        l.y + l.h > p.rect.y + p.rect.h + t
      )
        out.push(`plate ${p.id} letter outside its plate`);
    }
  }
  for (let i = 0; i < s.plates.length; i++) {
    for (let j = i + 1; j < s.plates.length; j++) {
      const a = s.plates[i];
      const b = s.plates[j];
      if (a && b && rectsOverlap(a.rect, b.rect, 0)) out.push(`plates ${a.id} and ${b.id} overlap`);
    }
  }
  return out;
}

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
  // pops, tags and banners must never intersect a live plate's letters
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const p of s.plates)
    for (const l of p.letters) {
      s.popRects.forEach((r, i) => {
        if (hit(r, l)) out.push(`pop/tag ${i} covers a letter of plate ${p.id}`);
      });
      s.bannerRects.forEach((r, i) => {
        if (hit(r, l)) out.push(`banner ${i} covers a letter of plate ${p.id}`);
      });
    }
  // T6.3 #9: panel text rows never overlap (e.g. "2ND WIND" vs the HP numbers)
  const pt = s.panelTextRects ?? [];
  for (let i = 0; i < pt.length; i++)
    for (let j = i + 1; j < pt.length; j++) {
      const a = pt[i];
      const b = pt[j];
      if (a && b && hit(a.rect, b.rect)) out.push(`panel text ${a.id} overlaps ${b.id}`);
    }
  // T6.3 #10: no pop/tag intersects the hero body or the boss plate
  s.popRects.forEach((r, i) => {
    if (s.heroRect && hit(r, s.heroRect)) out.push(`pop/tag ${i} covers the hero body`);
    if (s.bossPlateRect && hit(r, s.bossPlateRect)) out.push(`pop/tag ${i} covers the boss plate`);
  });
  // T6.3 #12: never a "0" damage number
  (s.popTexts ?? []).forEach((t, i) => {
    if (/^-?0$/.test(t.trim())) out.push(`pop ${i} shows a 0 damage number`);
  });
  return out;
}

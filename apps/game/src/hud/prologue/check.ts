/** Prologue readability invariants (P3.3), on top of `checkSnapshot` (which stays untouched and still runs). */
import type { HudDebugSnapshot } from "../hud";
import type { Rect } from "../layout";
import { rectInside } from "../layout";

export const DIALOGUE_MIN_CONTRAST = 7;
const hit = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Returns human-readable violations (empty = readable). */
export function checkPrologueSnapshot(s: HudDebugSnapshot): string[] {
  const out: string[] = [];
  const p = s.prologue;
  if (!p?.active) return out;
  const { w, h } = s.viewport;
  const named: [string, Rect | null][] = [
    ["grimoire", p.grimoireRect],
    ["dialogue", p.dialogueRect],
    ["hint", p.hintRect],
    ["skip ring", p.ringRect],
    ["ink line", p.inkRect],
  ];
  for (const [n, r] of named)
    if (r && !rectInside(r, w, h, 0)) out.push(`${n} outside the viewport`);

  // ---- dialogue: contrast, 2 lines, nothing over it
  if (p.dialogue) {
    if (p.dialogue.contrast < DIALOGUE_MIN_CONTRAST)
      out.push(`dialogue contrast ${p.dialogue.contrast.toFixed(2)} < ${DIALOGUE_MIN_CONTRAST}`);
    if (p.dialogue.speakerContrast < DIALOGUE_MIN_CONTRAST)
      out.push(
        `speaker plate contrast ${p.dialogue.speakerContrast.toFixed(2)} < ${DIALOGUE_MIN_CONTRAST}`,
      );
    if (p.dialogue.lines.length > 2) out.push(`dialogue wraps to ${p.dialogue.lines.length} lines`);
    if (p.dialogue.fontPx < 14) out.push(`dialogue font ${p.dialogue.fontPx}px < 14`);
  }
  const dr = p.dialogueRect;
  if (dr) {
    s.popRects.forEach((r, i) => {
      if (hit(r, dr)) out.push(`pop/tag ${i} covers the dialogue`);
    });
    s.bannerRects.forEach((r, i) => {
      if (hit(r, dr)) out.push(`banner ${i} covers the dialogue`);
    });
    for (const pl of s.plates)
      if (hit(pl.rect, dr)) out.push(`plate ${pl.id} overlaps the dialogue`);
    if (p.grimoireRect && hit(p.grimoireRect, dr)) out.push("grimoire overlaps the dialogue");
    if (p.emberRect && hit(p.emberRect, dr)) out.push("ember overlaps the dialogue");
    if (p.inkRect && hit(p.inkRect, dr)) out.push("ink line overlaps the dialogue");
    if (p.hintRect && hit(p.hintRect, dr)) out.push("hint overlaps the dialogue");
  }

  // ---- no pop or tag on Nul's mask or face
  if (p.maskRect) {
    const m = p.maskRect;
    s.popRects.forEach((r, i) => {
      if (hit(r, m)) out.push(`pop/tag ${i} ("${s.popTexts[i] ?? ""}") sits on Nul's mask`);
    });
  }

  // ---- the reserved rects: plates and pops keep clear of them
  const reserved: [string, Rect | null][] = [
    ["grimoire", p.grimoireRect],
    ["hint", p.hintRect],
    ["skip ring", p.ringRect],
    ["ink line", p.inkRect],
  ];
  for (const [n, r] of reserved) {
    if (!r) continue;
    for (const pl of s.plates) if (hit(pl.rect, r)) out.push(`plate ${pl.id} overlaps the ${n}`);
    s.popRects.forEach((pr, i) => {
      if (hit(pr, r)) out.push(`pop/tag ${i} covers the ${n}`);
    });
  }
  return out;
}

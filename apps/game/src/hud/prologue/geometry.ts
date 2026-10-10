/** Prologue HUD geometry (design px, 1280 wide). Pure: no DOM, so vitest covers the layout. */
import type { Rect } from "../layout";

// ---- Grimoire bar (base units, scale k = 1)
export const ORB = 52; // FRAME_CELLS (26) * 2
export const ORB_PITCH = 58;
export const GR_PAD = 8;
export const CHIP = 26;
export const CHIP_PITCH = 29;
export const ROW_GAP = 8;
export const GR_MARGIN = 16;
/** Part C scale of the bar: it lives in the dialogue lane (P4.2: only from the ink line to the end of the theft, never over the actors). */
export const GR_CUT_SCALE = 1.25;
/** Part C: the bar's bottom edge sits this fraction of H above the bottom of the screen (the dialogue lane). */
export const GR_LANE_BOTTOM = 0.035;

export function grimoireSize(n: number): { w: number; h: number } {
  const orbsW = Math.max(1, n) * ORB_PITCH - (ORB_PITCH - ORB);
  return { w: orbsW + GR_PAD * 2, h: GR_PAD + ORB + ROW_GAP + CHIP + GR_PAD };
}

// ---- Dialogue
export const DLG_W = 800;
export const DLG_PAD_X = 28;
export const DLG_PAD_Y = 16;
export const DLG_FONT = 18;
export const DLG_LINE_H = 26;
export const DLG_BOTTOM = 24;
export const DLG_PLATE_OVER = 16; // the speaker plate overhangs the box top
export interface DialogueGeom {
  box: Rect;
  /** Box plus the speaker plate overhang: the keep-out for every other element. */
  rect: Rect;
  inner: { x: number; y: number; w: number };
}
/** `boxW` is the fitted width (P3-5: min 40% of W for short lines); omitted = the widest box (the world keep-out). */
export function dialogueGeom(W: number, H: number, boxW?: number): DialogueGeom {
  const w = Math.min(boxW ?? DLG_W, DLG_W, W - 80);
  const h = DLG_PAD_Y * 2 + DLG_LINE_H * 2;
  const x = Math.round((W - w) / 2);
  const y = H - DLG_BOTTOM - h;
  return {
    box: { x, y, w, h },
    rect: { x, y: y - DLG_PLATE_OVER, w, h: h + DLG_PLATE_OVER },
    inner: { x: x + DLG_PAD_X, y: y + DLG_PAD_Y, w: w - DLG_PAD_X * 2 },
  };
}
/** Extra clearance world effects keep around the dialogue rect (art direction P2). */
export const DLG_KEEP_OUT_INFLATE = 24;

export interface GrimoireGeom {
  rect: Rect;
  k: number;
}
/** `slide` 0 = Part B (bottom left, k 1), 1 = Part C (bottom centre above the dialogue lane, k 1.35). */
export function grimoireGeom(W: number, H: number, n: number, slide: number): GrimoireGeom {
  const { w, h } = grimoireSize(n);
  const k1 = GR_CUT_SCALE;
  const x0 = 20;
  const y0 = H - GR_MARGIN - h;
  const x1 = (W - w * k1) / 2;
  const y1 = H * (1 - GR_LANE_BOTTOM) - h * k1;
  const t = Math.min(1, Math.max(0, slide));
  const k = 1 + (k1 - 1) * t;
  return {
    k,
    rect: {
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      w: w * k,
      h: h * k,
    },
  };
}

// ---- Ink line + caption
export const INK_FONT = 76;
export function inkRect(W: number, H: number, textW: number): Rect {
  const w = Math.min(W - 80, textW + 60);
  return { x: Math.round((W - w) / 2), y: Math.round(H * 0.17), w, h: Math.round(INK_FONT * 1.35) };
}

// ---- Hint card / skip ring
export function hintRect(W: number, H: number, textW: number): Rect {
  const w = Math.min(W - 60, Math.ceil(textW) + 56);
  return { x: Math.round((W - w) / 2), y: H - 118, w, h: 46 };
}
export function ringRect(W: number, H: number): Rect {
  return { x: W - 190, y: H - 84, w: 170, h: 64 };
}

// ---- Nul (from the projected head/feet anchors, design px)
export interface P2 {
  x: number;
  y: number;
}
/** Nul's sprite is 73 texels = 4.56 m tall (render/sprites/prologueArt NUL_HEIGHT_TX / 16). */
export const NUL_HEIGHT_M = 73 / 16;
/** The mask and face: the top ~25% of the sprite, collar wings wide (damage pops stay off it). */
export function maskRect(head: P2, feet: P2): Rect {
  const hpx = Math.max(1, feet.y - head.y);
  const pxm = hpx / NUL_HEIGHT_M;
  const w = 1.5 * pxm;
  return { x: head.x - w / 2, y: head.y - 0.05 * hpx, w, h: 1.25 * pxm };
}
/** The projected cloak trapezoid (art direction: top 1.0 m wide at y 2.9 m, bottom 1.75 m at y 0.45 m). */
export function cloakTrapezoid(head: P2, feet: P2): { pts: [P2, P2, P2, P2]; pxm: number } {
  const pxm = Math.max(1, feet.y - head.y) / NUL_HEIGHT_M;
  const yTop = feet.y - 2.9 * pxm;
  const yBot = feet.y - 0.45 * pxm;
  const cx = head.x;
  return {
    pxm,
    pts: [
      { x: cx - 0.5 * pxm, y: yTop },
      { x: cx + 0.5 * pxm, y: yTop },
      { x: cx + 0.875 * pxm, y: yBot },
      { x: cx - 0.875 * pxm, y: yBot },
    ],
  };
}

export const rectsHit = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const inflateRect = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + 2 * p,
  h: r.h + 2 * p,
});

/** Greedy word wrap. `measure` gives the pixel width of a string. */
export function wrapLines(measure: (s: string) => number, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && measure(t) > maxW) {
      out.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

// ---- the knight's hand (the ember and the landing shards): metres from his foot anchor, per cutscene anim frame
/** Where the open palm / closed fist is in each hero frame (the sprite is 1 texel = 1/16 m; read off `heroFrameX` in proceduralArt). */
const HAND_FRAMES: Readonly<Record<string, readonly { dx: number; dy: number }[]>> = {
  reach: [
    { dx: 0.53, dy: 1.22 },
    { dx: 0.655, dy: 1.155 },
  ],
  kneel: [
    { dx: 0.3, dy: 0.62 },
    { dx: 0.42, dy: 0.42 },
    { dx: 0.46, dy: 0.36 },
  ],
  rise: [
    { dx: 0.42, dy: 0.36 },
    { dx: 0.4, dy: 0.52 },
    { dx: 0.32, dy: 0.78 },
  ],
  swordOut: [
    { dx: 0.62, dy: 1.0 },
    { dx: 0.78, dy: 0.95 },
  ],
  raise: [{ dx: 0.5, dy: 0.9 }],
  idle: [{ dx: 0.3, dy: 0.85 }],
};
/** The hand offset (m) for a cutscene hero anim at `ageMs` (frames at 2.5 fps, like the stage's cutscene frames). */
export function heroHandOffset(anim: string | null, ageMs: number): { dx: number; dy: number } {
  const fr = (anim ? HAND_FRAMES[anim] : undefined) ?? HAND_FRAMES.idle ?? [];
  const i = fr.length > 1 ? Math.floor((Math.max(0, ageMs) / 1000) * 2.5) % fr.length : 0;
  return fr[i] ?? { dx: 0.3, dy: 0.85 };
}

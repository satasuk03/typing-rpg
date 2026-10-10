/** Chapter 2 pixel glyphs (shift key cap, healer cross, leaf). Drawn with fillRect, no per-frame allocation. */
import type { Ctx } from "./draw";

type Bitmap = readonly string[];

/** Shift arrow (9x9). */
const SHIFT_ARROW: Bitmap = [
  "....#....",
  "...###...",
  "..#####..",
  ".#######.",
  "#########",
  "..#####..",
  "..#####..",
  "..#####..",
  "..#####..",
];

/** Leaf (10x9), a pointed blade with a midrib (`m`). */
const LEAF: Bitmap = [
  "......####",
  "....######",
  "...###m###",
  "..###m####",
  "..##m#####",
  ".##m#####.",
  ".#m#####..",
  "#m#####...",
  "m.........",
];

function blit(
  c: Ctx,
  bm: Bitmap,
  x: number,
  y: number,
  px: number,
  fill: string,
  alt?: string,
): void {
  for (let r = 0; r < bm.length; r++) {
    const row = bm[r] as string;
    for (let k = 0; k < row.length; k++) {
      const ch = row[k];
      if (ch === "#") c.fillStyle = fill;
      else if (ch === "m") c.fillStyle = alt ?? fill;
      else continue;
      c.fillRect(x + k * px, y + r * px, px, px);
    }
  }
}

export const SHIFT_GUTTER_W = 30;
export const SHIFT_CAP = 24;

/**
 * The shift key cap in the plate's left gutter. Lit (gold, white arrow) when the next letter needs Shift,
 * otherwise a dim "Aa" marker (exact-case plate). Static: never pulses.
 */
export function drawShiftCue(c: Ctx, x: number, cy: number, lit: boolean): void {
  const y = cy - SHIFT_CAP / 2;
  c.save();
  c.fillStyle = "#0a0710";
  c.fillRect(x - 1, y - 1, SHIFT_CAP + 2, SHIFT_CAP + 2);
  c.fillStyle = lit ? "#7a5612" : "#241c2c";
  c.fillRect(x, y, SHIFT_CAP, SHIFT_CAP);
  c.fillStyle = lit ? "#ffd24a" : "#6a5a78";
  c.fillRect(x, y, SHIFT_CAP, 2);
  c.fillRect(x, y + SHIFT_CAP - 2, SHIFT_CAP, 2);
  c.fillRect(x, y, 2, SHIFT_CAP);
  c.fillRect(x + SHIFT_CAP - 2, y, 2, SHIFT_CAP);
  if (lit) {
    blit(c, SHIFT_ARROW, x + 3, y + 3, 2, "#fff6d0");
  } else {
    c.font = '700 11px "Silkscreen", "Press Start 2P", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#b8a8c8";
    c.fillText("Aa", x + SHIFT_CAP / 2, cy + 1);
  }
  c.restore();
}

/** Teal-gold leaf glyph (riddle leaf plates). `x,y` = top-left, 10x9 cells at 2 px. */
export function drawLeafGlyph(c: Ctx, x: number, y: number): void {
  c.save();
  blit(c, LEAF, x - 1, y - 1, 2, "#06201f");
  blit(c, LEAF, x + 1, y + 1, 2, "#06201f");
  blit(c, LEAF, x, y, 2, "#5ad8c0", "#e8d070");
  c.restore();
}

const CROSS: Bitmap = ["..#..", "..#..", "#####", "..#..", "..#.."];
/** Healer cross centred on (cx,cy), `px` per cell (5x5 grid). */
export function drawHealCross(c: Ctx, cx: number, cy: number, px: number, col: string): void {
  blit(c, CROSS, Math.round(cx - 2.5 * px), Math.round(cy - 2.5 * px), px, col);
}

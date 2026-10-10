/**
 * Skill icon shatter (plan §2 theft beat step 1, §4.3): a 2-frame crack, then the 16x16 icon breaks into 16 pixel
 * shards (4x4 texels each) that fall, turn grey and fade. The crack glow and the burst use the theft-only palette.
 * Closed-form in `age` (seeded per slot and shard), so a re-seek or a still reproduces the same frame and nothing
 * allocates per frame.
 */
import type { Ctx } from "../draw";
import { clamp } from "../draw";
import { getSkillIcon, ICON_PX } from "../skillIcons";

export const CRACK1_S = 0.14;
export const CRACK2_S = 0.14;
export const BREAK_AT_S = CRACK1_S + CRACK2_S;
/** The shards are gone (and the socket is empty) after this many seconds. */
export const SHATTER_DONE_S = 1.5;

const CELLS = 4; // 4x4 grid of 4x4-texel shards = 16 shards
const CELL_PX = ICON_PX / CELLS;
const GRAVITY = 760; // base px/s^2 (before the icon scale)

function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Crack polylines in icon texels (stage 1: one fissure; stage 2 adds two branches). */
const CRACK_MAIN: readonly (readonly [number, number])[] = [
  [8, 0],
  [7, 3],
  [9, 6],
  [7, 9],
  [8, 12],
  [7, 15],
];
const CRACK_BRANCH: readonly (readonly (readonly [number, number])[])[] = [
  [
    [9, 6],
    [13, 5],
    [15, 2],
  ],
  [
    [7, 9],
    [3, 10],
    [1, 13],
  ],
];

function line(
  c: Ctx,
  pts: readonly (readonly [number, number])[],
  ix: number,
  iy: number,
  S: number,
): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as readonly [number, number];
    const b = pts[i + 1] as readonly [number, number];
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * k) / Math.max(1, n));
      const y = Math.round(a[1] + ((b[1] - a[1]) * k) / Math.max(1, n));
      c.rect(ix + x * S, iy + y * S, S, S);
    }
  }
}

export interface ShatterOpts {
  reducedMotion: boolean;
  /** 0..1 effectsIntensity: scales the burst and glow. */
  intensity: number;
}

/**
 * Draw the shatter of icon `id` centred at (cx, cy); `S` is the screen scale of one texel (the orb uses 2).
 * Draw order for the caller: orb frame first, then this. Returns false once nothing is left to draw.
 */
export function drawShatter(
  c: Ctx,
  id: string,
  cx: number,
  cy: number,
  S: number,
  age: number,
  colour: string,
  o: ShatterOpts,
  slot = 0,
): boolean {
  if (age >= SHATTER_DONE_S) return false;
  const ic = getSkillIcon(id);
  const size = ICON_PX * S;
  const ix = Math.round(cx - size / 2);
  const iy = Math.round(cy - size / 2);
  c.save();
  c.imageSmoothingEnabled = false;
  if (age < BREAK_AT_S) {
    // ---- crack frames: the icon stays, a white fissure with a theft-colour glow behind it
    const stage = age < CRACK1_S ? 1 : 2;
    const shake = o.reducedMotion ? 0 : (hash(slot * 7 + Math.floor(age * 60)) - 0.5) * 2;
    const sx = Math.round(shake);
    c.drawImage(ic.color, 0, 0, ICON_PX, ICON_PX, ix + sx, iy, size, size);
    if (o.intensity > 0) {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = (stage === 1 ? 0.35 : 0.6) * o.intensity;
      c.fillStyle = colour;
      c.beginPath();
      line(c, CRACK_MAIN, ix + sx - 1, iy, S);
      if (stage === 2) for (const br of CRACK_BRANCH) line(c, br, ix + sx - 1, iy, S);
      c.fill();
      c.restore();
    }
    c.fillStyle = "#ffffff";
    c.beginPath();
    line(c, CRACK_MAIN, ix + sx, iy, S);
    if (stage === 2) for (const br of CRACK_BRANCH) line(c, br, ix + sx, iy, S);
    c.fill();
    c.restore();
    return true;
  }
  const a = age - BREAK_AT_S;
  // ---- theft-colour flash ring + pixel sparks
  if (o.intensity > 0 && a < 0.4) {
    const k = a / 0.4;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = (1 - k) * 0.85 * o.intensity;
    c.strokeStyle = colour;
    c.lineWidth = Math.max(1, S);
    c.beginPath();
    c.arc(cx, cy, size * (0.3 + 0.55 * k), 0, Math.PI * 2);
    c.stroke();
    if (!o.reducedMotion) {
      c.fillStyle = colour;
      for (let i = 0; i < 12; i++) {
        const ang = hash(slot * 131 + i) * Math.PI * 2;
        const sp = (60 + hash(slot * 977 + i) * 90) * (S / 2);
        const r = sp * a;
        c.globalAlpha = (1 - k) * o.intensity;
        c.fillRect(
          Math.round(cx + Math.cos(ang) * r),
          Math.round(cy + Math.sin(ang) * r - 20 * a * S),
          S,
          S,
        );
      }
    }
    c.restore();
  }
  // ---- shards: pop outward, fall, grey out, fade
  const grey = clamp(a / 0.55, 0, 1);
  const fade = 1 - clamp((a - 0.65) / 0.55, 0, 1);
  if (fade > 0) {
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const sid = slot * 64 + j * CELLS + i;
        const ox = ((i + 0.5) / CELLS - 0.5) * size;
        const oy = ((j + 0.5) / CELLS - 0.5) * size;
        const vx = ox * 4.6 + (hash(sid) - 0.5) * 110 * (S / 2);
        const vy = oy * 3.2 - (110 + hash(sid + 999) * 150) * (S / 2);
        const g = o.reducedMotion ? 0 : GRAVITY * (S / 2);
        const px = cx + ox + (o.reducedMotion ? 0 : vx * a);
        const py = cy + oy + (o.reducedMotion ? 0 : vy * a + 0.5 * g * a * a);
        const rot = o.reducedMotion ? 0 : (hash(sid + 31) - 0.5) * 12 * a;
        c.save();
        c.translate(px, py);
        c.rotate(rot);
        c.globalAlpha = fade;
        const sw = CELL_PX * S;
        c.drawImage(
          ic.color,
          i * CELL_PX,
          j * CELL_PX,
          CELL_PX,
          CELL_PX,
          -sw / 2,
          -sw / 2,
          sw,
          sw,
        );
        if (grey > 0) {
          c.globalAlpha = fade * grey;
          c.drawImage(
            ic.dim,
            i * CELL_PX,
            j * CELL_PX,
            CELL_PX,
            CELL_PX,
            -sw / 2,
            -sw / 2,
            sw,
            sw,
          );
        }
        c.restore();
      }
    }
  }
  c.restore();
  return true;
}

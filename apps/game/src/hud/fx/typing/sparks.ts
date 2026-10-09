/**
 * Shared HUD spark / flare / glint pool (one SoA pool, `layer` field routes each entry to the
 * "behind" or "above" effect). Letter spark bursts (§2.2), arrival flares (§2.3) and tier-up glints
 * and spark rings (§3.3) all live here. Negative age = delayed start.
 */
import { POOL_CAP, STREAK_STYLE } from "../../../level/typingFxParams";
import { drawGlow, type GlowSprites } from "./glowSprites";
import { FILL, I_BUCKET, I_WHITE, sparkIndex } from "./palette";
import { HudPool } from "./pool";

// float fields
const X = 0;
const Y = 1;
const VX = 2;
const VY = 3;
const AGE = 4;
const LIFE = 5;
const SIZE = 6;
// byte fields
const KIND = 0;
const COL = 1;
const LAYER = 2;

const HALO = "#140a06";
/** Tuned up from the spec (see the tuning log): 1.5x spark count and larger pixels read at 1280x720. */
export const SPARK_BOOST = 2;
export const SPARK_SPEED = 1.5;
export const K_SQ2 = 0;
export const K_SQ3 = 1;
export const K_GLINT = 2;
export const K_LINE = 3;
export const K_FLARE = 4;
export const K_NOTE = 5;
export const K_RING = 6;
/** Rises without gravity or drag (ATB-filled embers). */
export const K_EMBER = 7;
export const L_BEHIND = 0;
export const L_ABOVE = 1;
/** Arrival flares / sparks / ATB embers: drawn behind, clipped to the ATB bar rect (never spill on the HP bar). */
export const L_ATB = 2;

export interface SparkEnv {
  /** Design-to-CSS scale. */
  S: number;
  /** HUD clock (s). */
  time: number;
  /** Effects intensity 0..1. */
  k: number;
  /** Quality multiplier (spark counts). */
  q: number;
  reducedMotion: boolean;
  rng: () => number;
}

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class SparkField {
  readonly pool = new HudPool(POOL_CAP.sparks, 7, 3, AGE);

  get count(): number {
    return this.pool.count;
  }

  /** Spawn one entry. Velocities in CSS px/s, size in CSS px, life in seconds. */
  add(
    x: number,
    y: number,
    vx: number,
    vy: number,
    age: number,
    life: number,
    size: number,
    kind: number,
    col: number,
    layer: number,
  ): void {
    const p = this.pool;
    const i = p.spawn();
    const f = p.f;
    const b = p.b;
    (f[X] as Float32Array)[i] = x;
    (f[Y] as Float32Array)[i] = y;
    (f[VX] as Float32Array)[i] = vx;
    (f[VY] as Float32Array)[i] = vy;
    (f[AGE] as Float32Array)[i] = age;
    (f[LIFE] as Float32Array)[i] = life;
    (f[SIZE] as Float32Array)[i] = size;
    (b[KIND] as Uint8Array)[i] = kind;
    (b[COL] as Uint8Array)[i] = col;
    (b[LAYER] as Uint8Array)[i] = layer;
  }

  clear(): void {
    this.pool.clear();
  }

  /** @hot */
  update(dt: number, S: number): void {
    const p = this.pool;
    const x = p.f[X] as Float32Array;
    const y = p.f[Y] as Float32Array;
    const vx = p.f[VX] as Float32Array;
    const vy = p.f[VY] as Float32Array;
    const age = p.f[AGE] as Float32Array;
    const life = p.f[LIFE] as Float32Array;
    const kind = p.b[KIND] as Uint8Array;
    const drag = 1 - 3.2 * dt;
    const g = 620 * S * dt;
    for (let i = p.count - 1; i >= 0; i--) {
      const a = (age[i] as number) + dt;
      age[i] = a;
      if (a < 0) continue;
      if (a >= (life[i] as number)) {
        p.remove(i);
        continue;
      }
      const kd = kind[i] as number;
      if (kd === K_NOTE || kd === K_FLARE) continue;
      if (kd === K_EMBER) {
        x[i] = (x[i] as number) + (vx[i] as number) * dt;
        y[i] = (y[i] as number) + (vy[i] as number) * dt;
        continue;
      }
      vx[i] = (vx[i] as number) * drag;
      vy[i] = (vy[i] as number) * drag + (kd === K_RING ? 0 : g);
      x[i] = (x[i] as number) + (vx[i] as number) * dt;
      y[i] = (y[i] as number) + (vy[i] as number) * dt;
    }
  }

  /** @hot Draw the entries of one layer. The caller sets the composite op ("lighter"). */
  draw(c: CanvasRenderingContext2D, layer: number, S: number, sprites: GlowSprites): void {
    const p = this.pool;
    const x = p.f[X] as Float32Array;
    const y = p.f[Y] as Float32Array;
    const vx = p.f[VX] as Float32Array;
    const vy = p.f[VY] as Float32Array;
    const age = p.f[AGE] as Float32Array;
    const life = p.f[LIFE] as Float32Array;
    const size = p.f[SIZE] as Float32Array;
    const kind = p.b[KIND] as Uint8Array;
    const col = p.b[COL] as Uint8Array;
    const lay = p.b[LAYER] as Uint8Array;
    const n = p.count;
    const o = Math.max(1, Math.round(S));
    const arm = Math.max(4, Math.round(4.5 * S));
    // pass 1: a dark halo under every pixel spark (constant style, plain fillRects: cheaper than one big
    // path of rect subpaths), so the sparks read on bright worlds too (additive light alone vanishes)
    let anyLine = false;
    c.globalAlpha = 0.4;
    c.fillStyle = HALO;
    for (let i = 0; i < n; i++) {
      if (lay[i] !== layer || (age[i] as number) < 0) continue;
      const kd = kind[i] as number;
      if (kd === K_FLARE || kd === K_NOTE) continue;
      if (kd === K_LINE) {
        anyLine = true;
        continue;
      }
      const px = Math.round(x[i] as number);
      const py = Math.round(y[i] as number);
      if (kd === K_GLINT) {
        c.fillRect(px - arm - o, py - 1 - o, arm * 2 + 1 + 2 * o, 2 + 2 * o);
        c.fillRect(px - 1 - o, py - arm - o, 2 + 2 * o, arm * 2 + 1 + 2 * o);
      } else {
        const sz = Math.max(1, Math.round((size[i] as number) * S));
        c.fillRect(px - o, py - o, sz + 2 * o, sz + 2 * o);
      }
    }
    if (anyLine) {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        if (lay[i] !== layer || (age[i] as number) < 0 || kind[i] !== K_LINE) continue;
        c.moveTo(x[i] as number, y[i] as number);
        c.lineTo(
          (x[i] as number) - (vx[i] as number) * 0.05,
          (y[i] as number) - (vy[i] as number) * 0.05,
        );
      }
      c.globalAlpha = 0.4;
      c.strokeStyle = HALO;
      c.lineWidth = 3.5 * S;
      c.stroke();
    }
    // pass 2: the coloured sparks, then glows
    let lastFill = -1;
    let lastAlpha = -1;
    for (let i = 0; i < n; i++) {
      if (lay[i] !== layer) continue;
      const a = age[i] as number;
      if (a < 0) continue;
      const u = a / (life[i] as number);
      const rest = 1 - u;
      const kd = kind[i] as number;
      let ci = col[i] as number;
      if (a < 0.05 && kd <= K_LINE) ci = I_WHITE;
      if (kd === K_FLARE) {
        c.globalCompositeOperation = "lighter";
        drawGlow(
          c,
          sprites,
          ci,
          x[i] as number,
          y[i] as number,
          (size[i] as number) * S,
          rest * rest,
        );
        c.globalCompositeOperation = "source-over";
        lastAlpha = -1;
        continue;
      }
      if (kd === K_NOTE) {
        // tier-up note glint: glow sprite plus a thin cross
        const r = (size[i] as number) * S;
        const al = Math.min(1, rest * 1.6);
        c.globalCompositeOperation = "lighter";
        drawGlow(c, sprites, ci, x[i] as number, y[i] as number, r, al);
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = al;
        lastAlpha = -1;
        c.fillStyle = FILL[I_WHITE] as string;
        lastFill = I_WHITE;
        const ar = Math.round(r * 0.75);
        const px = Math.round(x[i] as number);
        const py = Math.round(y[i] as number);
        c.fillRect(px - ar, py - 1, ar * 2 + 1, 2);
        c.fillRect(px - 1, py - ar, 2, ar * 2 + 1);
        continue;
      }
      // alpha in 1/16 steps: fewer state changes, no visible banding on 3-6 px sparks
      const al = Math.round(rest ** 0.7 * 16) / 16;
      if (al !== lastAlpha) {
        c.globalAlpha = al;
        lastAlpha = al;
      }
      if (lastFill !== ci) {
        c.fillStyle = FILL[ci] as string;
        c.strokeStyle = FILL[ci] as string;
        lastFill = ci;
      }
      const px = Math.round(x[i] as number);
      const py = Math.round(y[i] as number);
      if (kd === K_LINE) {
        c.lineWidth = 2 * S;
        c.beginPath();
        c.moveTo(x[i] as number, y[i] as number);
        c.lineTo(
          (x[i] as number) - (vx[i] as number) * 0.05,
          (y[i] as number) - (vy[i] as number) * 0.05,
        );
        c.stroke();
      } else if (kd === K_GLINT) {
        c.fillRect(px - arm, py - 1, arm * 2 + 1, 2);
        c.fillRect(px - 1, py - arm, 2, arm * 2 + 1);
        c.fillStyle = FILL[I_WHITE] as string;
        c.fillRect(px - 2, py - 2, 4, 4);
        lastFill = I_WHITE;
      } else {
        const sz = Math.max(1, Math.round((size[i] as number) * S));
        c.fillRect(px, py, sz, sz);
      }
    }
  }
}

/**
 * Letter spark burst (§2.2). Emitters: 70% on the rect's top edge, 30% on the left/right edges at
 * mid-height; fan -90 +- 75 degrees; 140-320 px/s; life 220-380 ms; sizes 2/3/glint.
 * @hot
 */
export function emitLetterSparks(
  sp: SparkField,
  env: SparkEnv,
  r: RectLike,
  tier: number,
  element: number,
  isLast: boolean,
  colourOverride = -1,
): void {
  const n = Math.round(
    (STREAK_STYLE.sparks[tier] as number) * SPARK_BOOST * env.k * env.q * (isLast ? 1.5 : 1),
  );
  const rng = env.rng;
  const S = env.S;
  const bucket0 = Math.floor((env.time * 140) / 30);
  for (let i = 0; i < n; i++) {
    const top = rng() < 0.7;
    let x: number;
    let y: number;
    if (top) {
      x = r.x + rng() * r.w;
      y = r.y;
    } else {
      x = rng() < 0.5 ? r.x : r.x + r.w;
      y = r.y + r.h * 0.5;
    }
    const ang = -Math.PI / 2 + (rng() * 2 - 1) * ((75 * Math.PI) / 180);
    const sp0 = (140 + rng() * 180) * SPARK_SPEED * S;
    const roll = rng();
    let kind = roll < 0.6 ? K_SQ2 : roll < 0.9 ? K_SQ3 : K_GLINT;
    let size = kind === K_SQ2 ? 4 : kind === K_SQ3 ? 6 : 6;
    if (tier >= 2 && i < 2) {
      kind = K_LINE;
      size = 2;
    }
    const col =
      colourOverride >= 0
        ? colourOverride
        : tier >= 4 && !env.reducedMotion
          ? I_BUCKET + ((bucket0 + i) % 12)
          : sparkIndex(tier, element);
    sp.add(
      x,
      y,
      Math.cos(ang) * sp0,
      Math.sin(ang) * sp0,
      0,
      0.22 + rng() * 0.16,
      size,
      kind,
      col,
      L_ABOVE,
    );
  }
}

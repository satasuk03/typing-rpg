/**
 * Word-complete shatter (spec §5.1): the finished plate breaks into its own letters (glyph fragments in
 * the typed tier colour, gold when PERFECT) and a few frame shards. The fragments jump out, then
 * converge on the hero's weapon (or the hero's body for second wind, or just fall for minigame words).
 * Also owns the frame flash and the PERFECT rays. Pools are fixed-size SoA; nothing allocates per frame.
 *
 * Layers: `drawBehind` (frame flash, rays) and `drawAbove` (shards, fragments; clipped around letters).
 */
import { easeInCubic, fragmentArrivalSec, WORD } from "../../../level/typingFxParams";
import { FONT_PIX } from "../../theme";
import { drawGlow, type GlowSprites } from "./glowSprites";
import { FILL, hueBucket, I_BUCKET, I_SHARD, I_TIER, I_TYPED, I_WHITE } from "./palette";
import { HudPool } from "./pool";
import type { RectLike, SparkEnv } from "./sparks";

// fragment floats
const X0 = 0;
const Y0 = 1;
const VX = 2;
const VY = 3;
const AGE = 4;
const ROT = 5;
const ROTV = 6;
const TX = 7;
const TY = 8;
const CONV0 = 9;
const FPX = 10; // glyph font px (CSS)
const CODE = 11; // char code
const LIFE = 12; // arrival / end time (s)
const SCALE0 = 13; // burst scale base (1.0 or 1.25)
// fragment bytes
const FCOL = 0;
const FMODE = 1; // 0 converge, 1 fall
const FIDX = 2;

// shard floats
const SX = 0;
const SY = 1;
const SVX = 2;
const SVY = 3;
const SAGE = 4;
const SROT = 5;
const SROTV = 6;
const SSIZE = 7;
const SLIFE = 8;

// ray floats
const RX = 0;
const RY = 1;
const RDX = 2;
const RDY = 3;
const RLEN = 4;
const RAGE = 5;
const RLIFE = 6;

// frame flash floats
const FX_ = 0;
const FY_ = 1;
const FW_ = 2;
const FH_ = 3;
const FAGE = 4;
const FLIFE = 5;

const FRAG_CAP = 96;
const SHARD_CAP = 48;
const RAY_CAP = 48;
const FRAME_CAP = 6;
const FRAG_BURST_V = [180, 260] as const;

export interface ShatterTarget {
  x: number;
  y: number;
  /** 0 converge on the target, 1 fall (minigame), */
  mode: 0 | 1;
}

const GLYPHS = new Map<number, HTMLCanvasElement>();
const GLYPH_PX = 40;
const GLYPH_CV = 60;
/**
 * Pre-rendered glyph sprite (dark outline + fill) per (character, palette colour): created lazily the first
 * time a letter shatters in that colour, then every frame is one drawImage (no font parsing, no stroke).
 */
function glyphSprite(code: number, col: number): HTMLCanvasElement | null {
  const key = code * 128 + col;
  let cv = GLYPHS.get(key);
  if (cv) return cv;
  cv = document.createElement("canvas");
  cv.width = GLYPH_CV;
  cv.height = GLYPH_CV;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.font = `${GLYPH_PX}px ${FONT_PIX}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.miterLimit = 2;
  const ch = String.fromCharCode(code);
  g.strokeStyle = "rgba(8,5,12,0.95)";
  g.lineWidth = GLYPH_PX * 0.24;
  g.strokeText(ch, GLYPH_CV / 2, GLYPH_CV / 2);
  g.fillStyle = FILL[col] as string;
  g.fillText(ch, GLYPH_CV / 2, GLYPH_CV / 2);
  GLYPHS.set(key, cv);
  return cv;
}

function tickPool(p: HudPool, ageI: number, lifeI: number, dt: number): void {
  const age = p.f[ageI] as Float32Array;
  const life = p.f[lifeI] as Float32Array;
  for (let i = p.count - 1; i >= 0; i--) {
    age[i] = (age[i] as number) + dt;
    if ((age[i] as number) >= (life[i] as number)) p.remove(i);
  }
}

export class PlateShatter {
  readonly frags = new HudPool(FRAG_CAP, 14, 3, AGE);
  readonly shards = new HudPool(SHARD_CAP, 9, 0, SAGE);
  readonly rays = new HudPool(RAY_CAP, 7, 0, RAGE);
  readonly frames = new HudPool(FRAME_CAP, 6, 0, FAGE);
  /** Last fragment arrival of the most recent burst (s since the burst), for diagnostics. */
  lastArrivalSec = 0;

  get count(): number {
    return this.frags.count + this.shards.count + this.rays.count + this.frames.count;
  }
  get fragments(): number {
    return this.frags.count;
  }

  clear(): void {
    this.frags.clear();
    this.shards.clear();
    this.rays.clear();
    this.frames.clear();
  }

  /**
   * Spawn the fragments of one plate. `letters[i]` are CSS-px letter rects (null/undefined skipped),
   * `text` the answer. Returns the number of fragments spawned (the world side computes the same n).
   */
  burst(
    plate: RectLike,
    text: string,
    getLetter: (i: number, out: RectLike) => boolean,
    perfect: boolean,
    tier: number,
    tinted: boolean,
    target: ShatterTarget,
    sentence: boolean,
    env: SparkEnv,
    colOverride = -1,
  ): number {
    const S = env.S;
    const rng = env.rng;
    // letters to shatter (sample evenly when more than the cap)
    let total = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) !== 32) total++;
    const cap = target.mode === 1 ? 12 : WORD.maxFragments;
    const n = Math.min(total, cap);
    const frags = this.frags;
    const sz = (sentence ? 18 : 22) * S * 1.25;
    let seen = 0;
    let emitted = 0;
    const r: RectLike = { x: 0, y: 0, w: 0, h: 0 };
    const cx = plate.x + plate.w / 2;
    const cy = plate.y + plate.h / 2;
    const base = perfect ? 1.25 : 1.0;
    for (let i = 0; i < text.length && emitted < n; i++) {
      if (text.charCodeAt(i) === 32) continue;
      // pick letter number `seen` when it is the next sampled index
      const want = Math.floor((emitted * total) / n);
      if (seen++ < want) continue;
      if (!getLetter(i, r)) continue;
      const lx = r.x + r.w / 2;
      const ly = r.y + r.h / 2;
      let dx = lx - cx;
      let dy = ly - cy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const sp = (FRAG_BURST_V[0] + rng() * (FRAG_BURST_V[1] - FRAG_BURST_V[0])) * S * env.k;
      const j = frags.spawn();
      const f = frags.f;
      const b = frags.b;
      (f[X0] as Float32Array)[j] = lx;
      (f[Y0] as Float32Array)[j] = ly;
      (f[VX] as Float32Array)[j] = dx * sp + (rng() - 0.5) * 60 * S;
      (f[VY] as Float32Array)[j] = dy * sp * 0.6 - 120 * S;
      (f[AGE] as Float32Array)[j] = 0;
      (f[ROT] as Float32Array)[j] = 0;
      (f[ROTV] as Float32Array)[j] = (rng() * 2 - 1) * 6;
      (f[TX] as Float32Array)[j] = target.x;
      (f[TY] as Float32Array)[j] = target.y;
      (f[CONV0] as Float32Array)[j] =
        (WORD.burstMs + WORD.staggerMs * Math.min(emitted, WORD.staggerMax)) / 1000;
      (f[FPX] as Float32Array)[j] = sz;
      (f[CODE] as Float32Array)[j] = text.charCodeAt(i);
      (f[LIFE] as Float32Array)[j] = target.mode === 1 ? 0.7 : fragmentArrivalSec(emitted);
      (f[SCALE0] as Float32Array)[j] = base;
      (b[FMODE] as Uint8Array)[j] = target.mode;
      (b[FIDX] as Uint8Array)[j] = emitted;
      let col: number;
      if (colOverride >= 0) col = colOverride;
      else if (perfect) col = I_TIER + 1;
      else if (!tinted) col = I_TYPED;
      else if (tier >= 4 && !env.reducedMotion) col = I_BUCKET + hueBucket(env.time, 24 * i);
      else col = I_TYPED + tier;
      (b[FCOL] as Uint8Array)[j] = col;
      emitted++;
    }
    this.lastArrivalSec = target.mode === 1 ? 0.7 : fragmentArrivalSec(Math.max(0, emitted - 1));

    // frame shards: 2 per letter, word plates only (<= 12 letters)
    if (!sentence && total <= 12 && env.k > 0) {
      const ns = Math.round(total * 2 * Math.max(0.4, env.k));
      const sh = this.shards;
      for (let i = 0; i < ns; i++) {
        const j = sh.spawn();
        const f = sh.f;
        // along the plate perimeter
        const per = 2 * (plate.w + plate.h);
        let t = rng() * per;
        let x: number;
        let y: number;
        if (t < plate.w) {
          x = plate.x + t;
          y = plate.y;
        } else if (t < plate.w + plate.h) {
          x = plate.x + plate.w;
          y = plate.y + (t - plate.w);
        } else if (t < 2 * plate.w + plate.h) {
          t -= plate.w + plate.h;
          x = plate.x + plate.w - t;
          y = plate.y + plate.h;
        } else {
          t -= 2 * plate.w + plate.h;
          x = plate.x;
          y = plate.y + plate.h - t;
        }
        let dx = x - cx;
        let dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const sp = (120 + rng() * 140) * S;
        (f[SX] as Float32Array)[j] = x;
        (f[SY] as Float32Array)[j] = y;
        (f[SVX] as Float32Array)[j] = dx * sp;
        (f[SVY] as Float32Array)[j] = dy * sp - 90 * S;
        (f[SAGE] as Float32Array)[j] = 0;
        (f[SROT] as Float32Array)[j] = rng() * 6.28;
        (f[SROTV] as Float32Array)[j] = (rng() * 2 - 1) * 9;
        (f[SSIZE] as Float32Array)[j] = (5 + rng() * 3) * S * 1.4;
        (f[SLIFE] as Float32Array)[j] = 0.45;
      }
    }
    return emitted;
  }

  /** Frame flash: the plate frame lights up white for 80 ms (the plate itself is gone, no ghost). */
  frameFlash(r: RectLike): void {
    const j = this.frames.spawn();
    const f = this.frames.f;
    (f[FX_] as Float32Array)[j] = r.x;
    (f[FY_] as Float32Array)[j] = r.y;
    (f[FW_] as Float32Array)[j] = r.w;
    (f[FH_] as Float32Array)[j] = r.h;
    (f[FAGE] as Float32Array)[j] = 0;
    (f[FLIFE] as Float32Array)[j] = 0.14;
  }

  /** PERFECT rays: `count` gold lines of 30-60 px from the plate edge outward (260 ms). */
  rayBurst(plate: RectLike, count: number, S: number, rng: () => number): void {
    const cx = plate.x + plate.w / 2;
    const cy = plate.y + plate.h / 2;
    const rx = plate.w / 2;
    const ry = plate.h / 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.15;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // point on the plate's bounding ellipse-ish edge
      const t = 1 / Math.max(Math.abs(ca) / rx, Math.abs(sa) / ry);
      const j = this.rays.spawn();
      const f = this.rays.f;
      (f[RX] as Float32Array)[j] = cx + ca * t;
      (f[RY] as Float32Array)[j] = cy + sa * t;
      (f[RDX] as Float32Array)[j] = ca;
      (f[RDY] as Float32Array)[j] = sa;
      (f[RLEN] as Float32Array)[j] = (30 + rng() * 40) * S;
      (f[RAGE] as Float32Array)[j] = 0;
      (f[RLIFE] as Float32Array)[j] = 0.26;
    }
  }

  /** @hot */
  update(dt: number, S: number): void {
    // fragments
    {
      const p = this.frags;
      const age = p.f[AGE] as Float32Array;
      const life = p.f[LIFE] as Float32Array;
      const rot = p.f[ROT] as Float32Array;
      const rotv = p.f[ROTV] as Float32Array;
      for (let i = p.count - 1; i >= 0; i--) {
        const a = (age[i] as number) + dt;
        age[i] = a;
        rot[i] = (rot[i] as number) + (rotv[i] as number) * dt;
        if (a >= (life[i] as number)) p.remove(i);
      }
    }
    // shards
    {
      const p = this.shards;
      const x = p.f[SX] as Float32Array;
      const y = p.f[SY] as Float32Array;
      const vx = p.f[SVX] as Float32Array;
      const vy = p.f[SVY] as Float32Array;
      const age = p.f[SAGE] as Float32Array;
      const life = p.f[SLIFE] as Float32Array;
      const rot = p.f[SROT] as Float32Array;
      const rotv = p.f[SROTV] as Float32Array;
      const g = 900 * S * dt;
      for (let i = p.count - 1; i >= 0; i--) {
        const a = (age[i] as number) + dt;
        age[i] = a;
        if (a >= (life[i] as number)) {
          p.remove(i);
          continue;
        }
        vy[i] = (vy[i] as number) + g;
        x[i] = (x[i] as number) + (vx[i] as number) * dt;
        y[i] = (y[i] as number) + (vy[i] as number) * dt;
        rot[i] = (rot[i] as number) + (rotv[i] as number) * dt;
      }
    }
    tickPool(this.rays, RAGE, RLIFE, dt);
    tickPool(this.frames, FAGE, FLIFE, dt);
  }

  /** @hot "behind" layer: frame flash and rays. */
  drawBehind(c: CanvasRenderingContext2D, S: number, reducedFlash: boolean, k: number): void {
    const fr = this.frames;
    if (fr.count > 0 && !reducedFlash) {
      const f = fr.f;
      c.strokeStyle = "#ffffff";
      for (let i = 0; i < fr.count; i++) {
        const u = (f[FAGE]?.[i] as number) / ((f[FLIFE]?.[i] as number) || 1);
        const grow = (2 + 8 * u) * S;
        c.globalAlpha = Math.min(1, (1 - u) * 1.2) * Math.min(1, k + 0.2);
        c.lineWidth = 3 * S;
        c.strokeRect(
          (f[FX_]?.[i] as number) - grow,
          (f[FY_]?.[i] as number) - grow,
          (f[FW_]?.[i] as number) + 2 * grow,
          (f[FH_]?.[i] as number) + 2 * grow,
        );
      }
    }
    const rp = this.rays;
    if (rp.count > 0 && !reducedFlash) {
      const f = rp.f;
      c.lineCap = "round";
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath();
        for (let i = 0; i < rp.count; i++) {
          const u = (f[RAGE]?.[i] as number) / ((f[RLIFE]?.[i] as number) || 1);
          const e = 1 - (1 - u) ** 2;
          const len = (f[RLEN]?.[i] as number) * e;
          const gap = (f[RLEN]?.[i] as number) * 0.18 * e;
          const x0 = (f[RX]?.[i] as number) + (f[RDX]?.[i] as number) * (4 * S + gap);
          const y0 = (f[RY]?.[i] as number) + (f[RDY]?.[i] as number) * (4 * S + gap);
          c.moveTo(x0, y0);
          c.lineTo(x0 + (f[RDX]?.[i] as number) * len, y0 + (f[RDY]?.[i] as number) * len);
        }
        if (pass === 0) {
          c.globalAlpha = 0.45 * k;
          c.strokeStyle = "#140a06";
          c.lineWidth = 5 * S;
        } else {
          c.globalAlpha = 0.95 * k;
          c.strokeStyle = FILL[I_TIER + 1] as string;
          c.lineWidth = 2.4 * S;
        }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  /** @hot "above" layer: frame shards, glyph fragments with trails and glow. */
  drawAbove(c: CanvasRenderingContext2D, S: number, sprites: GlowSprites, k: number): void {
    const sh = this.shards;
    if (sh.count > 0) {
      const f = sh.f;
      for (let i = 0; i < sh.count; i++) {
        const u = (f[SAGE]?.[i] as number) / ((f[SLIFE]?.[i] as number) || 1);
        const sz = f[SSIZE]?.[i] as number;
        const r = f[SROT]?.[i] as number;
        const x = f[SX]?.[i] as number;
        const y = f[SY]?.[i] as number;
        c.beginPath();
        for (let v = 0; v < 3; v++) {
          const a = r + (v * Math.PI * 2) / 3;
          const px = x + Math.cos(a) * sz * (v === 0 ? 1.2 : 0.8);
          const py = y + Math.sin(a) * sz * (v === 0 ? 1.2 : 0.8);
          if (v === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.globalAlpha = Math.min(1, (1 - u) * 1.6);
        c.fillStyle = FILL[I_SHARD] as string;
        c.fill();
        c.lineWidth = Math.max(1, S);
        c.strokeStyle = FILL[I_TIER + 1] as string;
        c.stroke();
      }
    }
    const p = this.frags;
    if (p.count === 0) {
      c.globalAlpha = 1;
      return;
    }
    const f = p.f;
    const b = p.b;
    for (let i = 0; i < p.count; i++) {
      const t = f[AGE]?.[i] as number;
      const mode = b[FMODE]?.[i] as number;
      const col = b[FCOL]?.[i] as number;
      const vx = f[VX]?.[i] as number;
      const vy = f[VY]?.[i] as number;
      const x0 = f[X0]?.[i] as number;
      const y0 = f[Y0]?.[i] as number;
      let x: number;
      let y: number;
      let scale: number;
      let white = 0;
      let alpha = 1;
      const base = f[SCALE0]?.[i] as number;
      if (mode === 1) {
        x = x0 + vx * 0.5 * t;
        y = y0 + vy * 0.5 * t + 0.5 * 700 * S * t * t;
        scale = base;
        alpha = Math.min(1, (1 - t / 0.7) * 1.8);
      } else {
        const c0 = f[CONV0]?.[i] as number;
        const tau = t <= 0.07 ? t : 0.07 + 0.2 * (t - 0.07);
        const bx = x0 + vx * tau;
        const by = y0 + vy * tau;
        if (t < c0) {
          x = bx;
          y = by;
          const u = Math.min(1, t / 0.07);
          scale = base + 0.15 * u;
        } else {
          const s = Math.min(1, (t - c0) / (WORD.convergeMs / 1000));
          const e = easeInCubic(s);
          x = bx + ((f[TX]?.[i] as number) - bx) * e;
          y = by + ((f[TY]?.[i] as number) - by) * e;
          scale = base + 0.15 + (0.62 - (base + 0.15)) * e;
          white = s > 0.6 ? (s - 0.6) / 0.4 : 0;
          // 5-sample trail (2 px, tapering)
          c.beginPath();
          c.moveTo(x, y);
          for (let j = 1; j <= 5; j++) {
            const tj = Math.max(c0, t - 0.009 * j);
            const sj = Math.min(1, (tj - c0) / (WORD.convergeMs / 1000));
            const ej = easeInCubic(sj);
            const tauj = tj <= 0.07 ? tj : 0.07 + 0.2 * (tj - 0.07);
            const bxj = x0 + vx * tauj;
            const byj = y0 + vy * tauj;
            c.lineTo(
              bxj + ((f[TX]?.[i] as number) - bxj) * ej,
              byj + ((f[TY]?.[i] as number) - byj) * ej,
            );
          }
          c.globalAlpha = 0.6 * k;
          c.strokeStyle = FILL[col] as string;
          c.lineWidth = 4 * S;
          c.stroke();
        }
      }
      const px = (f[FPX]?.[i] as number) * scale;
      // glow
      c.globalCompositeOperation = "lighter";
      drawGlow(c, sprites, col, x, y, px * 1.3, 0.85 * alpha * k);
      c.globalCompositeOperation = "source-over";
      const rot = f[ROT]?.[i] as number;
      const code = f[CODE]?.[i] as number;
      const spr = glyphSprite(code, col);
      if (spr) {
        const d = (px / GLYPH_PX) * GLYPH_CV;
        c.save();
        c.translate(x, y);
        c.rotate(rot * (mode === 1 ? 1 : 0.5));
        c.globalAlpha = alpha;
        c.drawImage(spr, -d / 2, -d / 2, d, d);
        if (white > 0) {
          const ws = glyphSprite(code, I_WHITE);
          if (ws) {
            c.globalAlpha = alpha * white;
            c.drawImage(ws, -d / 2, -d / 2, d, d);
          }
        }
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }
}

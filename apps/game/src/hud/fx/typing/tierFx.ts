/**
 * Streak tiers on the HUD (§3): tint cross-fade, embers and back-glow around the target plate,
 * tier-up timeline (note glints, ring, spark ring) locked to the audio `tierUp` 50 ms note grid,
 * and the soft decay on reset.
 */
import { easeOutCubic, POOL_CAP, STREAK_STYLE, TIER_UP } from "../../../level/typingFxParams";
import type { PlateTint } from "../../fx";
import { bossPlateRect, HERO_PANEL, STATS_PANEL_W } from "../../panels";
import { perimPoint } from "../../plates";
import { drawHalo, type GlowSprites } from "./glowSprites";
import { blendTints, FILL, hueBucket, I_BUCKET, TINT_KINDS, tintFor } from "./palette";
import { HudPool } from "./pool";
import { K_NOTE, K_RING, L_ABOVE, type RectLike, type SparkEnv, type SparkField } from "./sparks";

// ember floats
const EX = 0;
const EY = 1;
const EAGE = 2;
const ELIFE = 3;
const ESIZE = 4;
const EBASE = 5;
const EPHASE = 6;
const EVY = 7;
// ring floats
const RCX = 0;
const RCY = 1;
const RR0 = 2;
const RR1 = 3;
const RAGE = 4;
const RLIFE = 5;
const RLW0 = 6;
const RLW1 = 7;
const RALPHA = 8;

const PT = { x: 0, y: 0 };
/** Ring radius cap, design px (polish #18: the 260 px ring crossed the boss bar and stats panel). */
export const RING_R_MAX = 120;
const DESIGN_W = 1280;
/** Embers 1.5x the spec rate (tuning log). */
const EMBER_BOOST = 1.5;
/** Halo reach (CSS px at scale 1) and alpha gain over the spec's backGlowAlpha (soft falloff needs more). */
const HALO_EXT = 48;
const HALO_ALPHA_GAIN = 3.6;

export class StreakTierFx {
  /** Tier the visuals converge to. */
  tier = 0;
  private fromTier = 0;
  private fadeAge = 1;
  /** Current back-glow alpha (eases toward the tier's target). */
  bgA = 0;
  readonly embers = new HudPool(POOL_CAP.embers, 8, 1, EAGE);
  readonly rings = new HudPool(POOL_CAP.rings, 9, 1, RAGE);
  private emberAcc = 0;
  /** Seconds until the HUD tier flash fires (-1 = none). */
  private flashIn = -1;
  /** Plate the embers / back-glow hug, and its rect (CSS px). */
  readonly rect: RectLike = { x: 0, y: 0, w: 0, h: 0 };
  hasRect = false;
  /** Panel rects (CSS px) the rings are clipped out of. */
  private readonly panels: RectLike[] = [
    { x: 0, y: 0, w: 0, h: 0 },
    { x: 0, y: 0, w: 0, h: 0 },
    { x: 0, y: 0, w: 0, h: 0 },
  ];
  private nPanels = 2;

  /** Refresh the clip-out rects for scale `S` (hero panel, stats panel, boss plate when present). */
  setPanels(S: number, boss: boolean): void {
    const set = (i: number, x: number, y: number, w: number, h: number): void => {
      const r = this.panels[i] as RectLike;
      r.x = x * S;
      r.y = y * S;
      r.w = w * S;
      r.h = h * S;
    };
    const H = HERO_PANEL;
    set(0, H.x, H.y, H.w, H.h);
    set(1, DESIGN_W - 22 - STATS_PANEL_W, 18, STATS_PANEL_W, 104);
    const b = bossPlateRect(DESIGN_W);
    set(2, b.x, b.y, b.w, b.h + 22);
    this.nPanels = boss ? 3 : 2;
  }
  /** The plate the halo hugs still exists (the halo vanishes with a completed plate; embers linger). */
  plateAlive = true;

  get fading(): boolean {
    return this.fadeAge < TIER_UP.fadeMs / 1000;
  }

  /** Begin a cross-fade to `to` (250 ms). */
  setTier(to: number): void {
    if (to === this.tier) return;
    this.fromTier = this.fading ? this.tier : this.tier;
    this.tier = to;
    this.fadeAge = 0;
  }
  /** Jump with no ceremony (attach mid-run). */
  snapTier(to: number): void {
    this.tier = to;
    this.fromTier = to;
    this.fadeAge = 1;
  }

  /** Tint for a plate kind right now (null = the plate's own palette). */
  tintFor(kind: string): PlateTint | null {
    if (this.fading) {
      const t = this.fadeAge / (TIER_UP.fadeMs / 1000);
      if (!TINT_KINDS.has(kind)) return null;
      return blendTints(this.fromTier, this.tier, t);
    }
    return tintFor(this.tier, kind);
  }

  clear(): void {
    this.embers.clear();
    this.rings.clear();
    this.emberAcc = 0;
    this.flashIn = -1;
    this.bgA = 0;
    this.hasRect = false;
  }

  /** @hot */
  update(dt: number, env: SparkEnv, rmotion: boolean, onFlash: () => void): void {
    if (this.fadeAge < 1) this.fadeAge += dt;
    if (this.flashIn >= 0) {
      this.flashIn -= dt;
      if (this.flashIn < 0) onFlash();
    }
    const target = this.hasRect ? (STREAK_STYLE.backGlowAlpha[this.tier] as number) * env.k : 0;
    const rate = target > this.bgA ? 10 : 7; // up fast, down over ~300 ms
    this.bgA += (target - this.bgA) * Math.min(1, dt * rate);
    if (this.bgA < 0.002 && target === 0) this.bgA = 0;

    // ---- embers
    const em = this.embers;
    const eps = (STREAK_STYLE.embersPerSec[this.tier] as number) * EMBER_BOOST * env.k * env.q;
    if (this.hasRect && eps > 0) {
      this.emberAcc += eps * dt;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        this.spawnEmber(env);
      }
    } else this.emberAcc = 0;
    const ex = em.f[EX] as Float32Array;
    const ey = em.f[EY] as Float32Array;
    const eage = em.f[EAGE] as Float32Array;
    const elife = em.f[ELIFE] as Float32Array;
    const ebase = em.f[EBASE] as Float32Array;
    const ephase = em.f[EPHASE] as Float32Array;
    const evy = em.f[EVY] as Float32Array;
    for (let i = em.count - 1; i >= 0; i--) {
      const a = (eage[i] as number) + dt;
      eage[i] = a;
      if (a >= (elife[i] as number)) {
        em.remove(i);
        continue;
      }
      ey[i] = (ey[i] as number) - (evy[i] as number) * dt;
      ex[i] =
        (ebase[i] as number) +
        (rmotion ? 0 : Math.sin(a * Math.PI * 2 * 1.5 + (ephase[i] as number)) * 12 * env.S);
    }
    // ---- rings
    const rg = this.rings;
    const rage = rg.f[RAGE] as Float32Array;
    const rlife = rg.f[RLIFE] as Float32Array;
    for (let i = rg.count - 1; i >= 0; i--) {
      rage[i] = (rage[i] as number) + dt;
      if ((rage[i] as number) >= (rlife[i] as number)) rg.remove(i);
    }
  }

  /** Shockwave ring (behind layer). `delaySec` > 0 starts it later (negative age). */
  addRing(
    cx: number,
    cy: number,
    r0: number,
    r1: number,
    delaySec: number,
    lifeSec: number,
    lw0: number,
    lw1: number,
    alpha: number,
    col: number,
  ): void {
    const rg = this.rings;
    const ri = rg.spawn();
    (rg.f[RCX] as Float32Array)[ri] = cx;
    (rg.f[RCY] as Float32Array)[ri] = cy;
    (rg.f[RR0] as Float32Array)[ri] = r0;
    (rg.f[RR1] as Float32Array)[ri] = r1;
    (rg.f[RAGE] as Float32Array)[ri] = -delaySec;
    (rg.f[RLIFE] as Float32Array)[ri] = lifeSec;
    (rg.f[RLW0] as Float32Array)[ri] = lw0;
    (rg.f[RLW1] as Float32Array)[ri] = lw1;
    (rg.f[RALPHA] as Float32Array)[ri] = alpha;
    (rg.b[0] as Uint8Array)[ri] = col;
  }

  private spawnEmber(env: SparkEnv): void {
    const r = this.rect;
    const rng = env.rng;
    const em = this.embers;
    const i = em.spawn();
    const S = env.S;
    let x: number;
    let y: number;
    if (rng() < 0.5) {
      x = r.x + rng() * r.w;
      y = r.y + r.h - 2 * S;
    } else {
      const left = rng() < 0.5;
      x = left ? r.x - (2 + rng() * 8) * S : r.x + r.w + (2 + rng() * 8) * S;
      y = r.y + rng() * r.h;
    }
    (em.f[EX] as Float32Array)[i] = x;
    (em.f[EY] as Float32Array)[i] = y;
    (em.f[EAGE] as Float32Array)[i] = 0;
    (em.f[ELIFE] as Float32Array)[i] = 0.8 + rng() * 0.5;
    (em.f[ESIZE] as Float32Array)[i] = 1 + Math.floor(rng() * 2);
    (em.f[EBASE] as Float32Array)[i] = x;
    (em.f[EPHASE] as Float32Array)[i] = rng() * 6.283;
    (em.f[EVY] as Float32Array)[i] = (30 + rng() * 40) * S;
    (em.b[0] as Uint8Array)[i] = this.tier >= 4 ? I_BUCKET + Math.floor(rng() * 12) : this.tier;
  }

  /**
   * @hot "behind" layer: back-glow, rings, embers. Drawn source-over (additive light vanishes on the
   * bright forest worlds), with a dark halo under the small pieces so they read on any backdrop.
   */
  draw(
    c: CanvasRenderingContext2D,
    S: number,
    time: number,
    sprites: GlowSprites,
    halos: GlowSprites,
    breathe: boolean,
    rmotion: boolean,
  ): void {
    void sprites;
    c.globalCompositeOperation = "source-over";
    if (this.bgA > 0.002 && this.hasRect && this.plateAlive) {
      // Soft 9-slice halo (pre-rendered sprites, no banding, no shadowBlur). Tier 4 adds a gentle
      // prismatic shimmer: a second halo in a hue 120 degrees away breathes in and out, drifting.
      const r = this.rect;
      const br = breathe ? 1 + 0.2 * Math.sin(time * Math.PI * 2 * 0.8) : 1;
      const al = Math.min(0.92, this.bgA * HALO_ALPHA_GAIN) * br;
      const ext = HALO_EXT * S * (this.tier >= 4 ? 1.15 : 1);
      if (this.tier >= 4 && !rmotion) {
        const b0 = hueBucket(time, 0);
        const b1 = hueBucket(time, 120);
        drawHalo(c, halos, I_BUCKET + b0, r.x, r.y, r.w, r.h, ext, al);
        const sh = 0.5 + 0.5 * Math.sin(time * 2.1);
        const drift = Math.sin(time * 1.3) * 4 * S;
        if (al * (0.35 + 0.5 * sh) > 0.1)
          drawHalo(
            c,
            halos,
            I_BUCKET + b1,
            r.x + drift,
            r.y,
            r.w,
            r.h,
            ext * (0.78 + 0.18 * sh),
            al * (0.35 + 0.5 * sh),
          );
      } else {
        const idx = this.tier >= 4 ? I_BUCKET + 11 : this.tier;
        drawHalo(c, halos, idx, r.x, r.y, r.w, r.h, ext, al);
      }
    }
    // rings
    const rg = this.rings;
    if (rg.count > 0) {
      // rings never cross a panel: clip the panel rects out (even-odd)
      c.save();
      c.beginPath();
      c.rect(-4, -4, 16384, 16384);
      for (let i = 0; i < this.nPanels; i++) {
        const p = this.panels[i] as RectLike;
        c.rect(p.x, p.y, p.w, p.h);
      }
      c.clip("evenodd");
      const cx = rg.f[RCX] as Float32Array;
      const cy = rg.f[RCY] as Float32Array;
      const r0 = rg.f[RR0] as Float32Array;
      const r1 = rg.f[RR1] as Float32Array;
      const age = rg.f[RAGE] as Float32Array;
      const life = rg.f[RLIFE] as Float32Array;
      const lw0 = rg.f[RLW0] as Float32Array;
      const lw1 = rg.f[RLW1] as Float32Array;
      const al = rg.f[RALPHA] as Float32Array;
      const col = rg.b[0] as Uint8Array;
      for (let i = 0; i < rg.count; i++) {
        const a = age[i] as number;
        if (a < 0) continue;
        const u = a / (life[i] as number);
        const e = easeOutCubic(u);
        const lw = ((lw0[i] as number) + ((lw1[i] as number) - (lw0[i] as number)) * u) * S;
        const rad = (r0[i] as number) + ((r1[i] as number) - (r0[i] as number)) * e;
        c.beginPath();
        c.arc(cx[i] as number, cy[i] as number, rad, 0, Math.PI * 2);
        c.globalAlpha = (al[i] as number) * (1 - u) * 0.5;
        c.strokeStyle = "#140a06";
        c.lineWidth = lw + 3 * S;
        c.stroke();
        c.globalAlpha = (al[i] as number) * (1 - u);
        c.strokeStyle = FILL[col[i] as number] as string;
        c.lineWidth = lw;
        c.stroke();
      }
      c.restore();
    }
    // embers: one batched dark halo, then the coloured pixels (alpha in 1/8 steps)
    const em = this.embers;
    if (em.count > 0) {
      const ex = em.f[EX] as Float32Array;
      const ey = em.f[EY] as Float32Array;
      const age = em.f[EAGE] as Float32Array;
      const life = em.f[ELIFE] as Float32Array;
      const size = em.f[ESIZE] as Float32Array;
      const col = em.b[0] as Uint8Array;
      const o = Math.max(1, Math.round(S));
      c.beginPath();
      for (let i = 0; i < em.count; i++) {
        const sz = Math.max(2, Math.round((size[i] as number) * 1.5 * S));
        c.rect(
          Math.round(ex[i] as number) - o,
          Math.round(ey[i] as number) - o,
          sz + 2 * o,
          sz + 2 * o,
        );
      }
      c.globalAlpha = 0.35;
      c.fillStyle = "#140a06";
      c.fill();
      let lastA = -1;
      let lastC = -1;
      for (let i = 0; i < em.count; i++) {
        const u = (age[i] as number) / (life[i] as number);
        const al = Math.round(Math.min(1, u * 6) * (1 - u) * 8) / 8;
        if (al <= 0) continue;
        if (al !== lastA) {
          c.globalAlpha = al;
          lastA = al;
        }
        const ci = col[i] as number;
        if (ci !== lastC) {
          c.fillStyle = FILL[ci] as string;
          lastC = ci;
        }
        const sz = Math.max(2, Math.round((size[i] as number) * 1.5 * S));
        c.fillRect(Math.round(ex[i] as number), Math.round(ey[i] as number), sz, sz);
      }
    }
  }

  // ---------------------------------------------------------------- tier-up

  /**
   * Tier-up timeline (§3.3). Glints at i*50 ms for i = 0..1+tier, ring + spark ring + HUD flash on
   * the downbeat at (1+tier)*50 ms.
   */
  tierUp(to: number, r: RectLike, sp: SparkField, env: SparkEnv, reducedFlash: boolean): void {
    const noteSec = TIER_UP.noteMs / 1000;
    const notes = 2 + to;
    const downbeat = (1 + to) * noteSec;
    const per = 2 * (r.w + r.h);
    const rng = env.rng;
    const S = env.S;
    const k = env.k;
    if (k <= 0) {
      this.flashIn = downbeat;
      return;
    }
    for (let i = 0; i < notes; i++) {
      perimPoint(r.x, r.y, r.w, r.h, (i / notes) * per, PT);
      const col =
        to >= 4 && !env.reducedMotion ? I_BUCKET + ((hueBucket(env.time, 0) + i * 2) % 12) : to;
      sp.add(PT.x, PT.y, 0, 0, -i * noteSec, TIER_UP.glintLifeMs / 1000, 14, K_NOTE, col, L_ABOVE);
    }
    // ring (behind) on the downbeat
    const rg = this.rings;
    const ri = rg.spawn();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    (rg.f[RCX] as Float32Array)[ri] = cx;
    (rg.f[RCY] as Float32Array)[ri] = cy;
    (rg.f[RR0] as Float32Array)[ri] = 0.5 * r.w;
    (rg.f[RR1] as Float32Array)[ri] = Math.min(1.6 * r.w, RING_R_MAX * S);
    (rg.f[RAGE] as Float32Array)[ri] = -downbeat;
    (rg.f[RLIFE] as Float32Array)[ri] = TIER_UP.ringMs / 1000;
    (rg.f[RLW0] as Float32Array)[ri] = 5;
    (rg.f[RLW1] as Float32Array)[ri] = 1;
    (rg.f[RALPHA] as Float32Array)[ri] = k * (reducedFlash ? 0.5 : 1);
    (rg.b[0] as Uint8Array)[ri] =
      to >= 4 && !env.reducedMotion ? I_BUCKET + hueBucket(env.time, 0) : to;
    // spark ring (above) on the downbeat
    const n = Math.round((16 + 4 * to) * k * env.q);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rng() * 0.3;
      const spd = (220 + rng() * 160) * S;
      const ex = cx + Math.cos(ang) * (r.w / 2);
      const ey = cy + Math.sin(ang) * (r.h / 2);
      const col =
        to >= 4 && !env.reducedMotion ? I_BUCKET + ((i * 3 + hueBucket(env.time, 0)) % 12) : to;
      sp.add(
        ex,
        ey,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        -downbeat,
        0.35,
        rng() < 0.7 ? 2 : 3,
        K_RING,
        col,
        L_ABOVE,
      );
    }
    this.flashIn = downbeat;
  }
}

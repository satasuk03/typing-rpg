/**
 * Light streak: letter -> ATB gauge (§2.3). Quadratic Bezier whose end point follows the live ATB
 * fill tip; accelerating progress (t^1.6); 3-stroke trail sampled analytically (nothing buffered).
 */
import { POOL_CAP, QUALITY_TRAIL_SAMPLES, STREAK_STYLE } from "../../../level/typingFxParams";
import { drawGlow, type GlowSprites } from "./glowSprites";
import { FILL, hueBucket, I_BUCKET, I_WHITE } from "./palette";
import { HudPool, hash01 } from "./pool";

const P0X = 0;
const P0Y = 1;
const AGE = 2;
const DUR = 3;
const HV = 4; // fan-out hash -1..1
const FAT = 5;
const TIER = 0;
const ARRIVED = 1;
/** After arrival the tail retracts into the bar over this long (spec: <= 80 ms). */
export const TAIL_FADE_SEC = 0.06;

const PX = new Float32Array(16);
const PY = new Float32Array(16);

export interface StreakEnv {
  S: number;
  time: number;
  k: number;
  q: 0 | 1 | 2;
  reducedMotion: boolean;
}

export class AtbStreaks {
  readonly pool = new HudPool(POOL_CAP.streaks, 6, 2, AGE);
  /** Fired when a streak arrives at the bar: (tier, tipX, tipY, fat). */
  onArrive: (tier: number, x: number, y: number, fat: boolean) => void = () => {};

  get count(): number {
    return this.pool.count;
  }

  /** Launch from (x, y) CSS px. On overflow the oldest completes instantly (fires its arrival). */
  launch(
    x: number,
    y: number,
    tier: number,
    seed: number,
    fat: boolean,
    tipX: number,
    tipY: number,
  ): void {
    const p = this.pool;
    if (p.count >= p.cap) {
      // oldest arrives now, then its slot is reused
      const age = p.f[AGE] as Float32Array;
      let best = 0;
      for (let i = 1; i < p.count; i++) if ((age[i] as number) > (age[best] as number)) best = i;
      if (!(p.b[ARRIVED]?.[best] ?? 0))
        this.onArrive(p.b[TIER]?.[best] ?? 0, tipX, tipY, (p.f[FAT]?.[best] ?? 1) > 1.5);
      p.remove(best);
    }
    const i = p.spawn();
    (p.f[P0X] as Float32Array)[i] = x;
    (p.f[P0Y] as Float32Array)[i] = y;
    (p.f[AGE] as Float32Array)[i] = 0;
    (p.f[DUR] as Float32Array)[i] = (STREAK_STYLE.streakMs[tier] as number) / 1000;
    (p.f[HV] as Float32Array)[i] = hash01(seed, tier) * 2 - 1;
    (p.f[FAT] as Float32Array)[i] = fat ? 2 : 1;
    (p.b[TIER] as Uint8Array)[i] = tier;
    (p.b[ARRIVED] as Uint8Array)[i] = 0;
  }

  clear(): void {
    this.pool.clear();
  }

  /** @hot */
  update(dt: number, tipX: number, tipY: number): void {
    const p = this.pool;
    const age = p.f[AGE] as Float32Array;
    const dur = p.f[DUR] as Float32Array;
    for (let i = p.count - 1; i >= 0; i--) {
      const a = (age[i] as number) + dt;
      age[i] = a;
      if (a >= (dur[i] as number) + TAIL_FADE_SEC) {
        p.remove(i);
        continue;
      }
      const arrived = p.b[ARRIVED] as Uint8Array;
      if (a >= (dur[i] as number) && !arrived[i]) {
        arrived[i] = 1;
        const tier = (p.b[TIER] as Uint8Array)[i] as number;
        const fat = ((p.f[FAT] as Float32Array)[i] as number) > 1.5;
        this.onArrive(tier, tipX, tipY, fat);
      }
    }
  }

  /** @hot Draw all streaks (composite op "lighter" set by the caller). */
  draw(
    c: CanvasRenderingContext2D,
    env: StreakEnv,
    tipX: number,
    tipY: number,
    sprites: GlowSprites,
  ): void {
    const p = this.pool;
    const { S } = env;
    const samples = QUALITY_TRAIL_SAMPLES[env.q] as number;
    const x0s = p.f[P0X] as Float32Array;
    const y0s = p.f[P0Y] as Float32Array;
    const ages = p.f[AGE] as Float32Array;
    const durs = p.f[DUR] as Float32Array;
    const hv = p.f[HV] as Float32Array;
    const fats = p.f[FAT] as Float32Array;
    const tiers = p.b[TIER] as Uint8Array;
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let i = 0; i < p.count; i++) {
      const tier = tiers[i] as number;
      const fat = fats[i] as number;
      const x0 = x0s[i] as number;
      const y0 = y0s[i] as number;
      const dx = tipX - x0;
      const dy = tipY - y0;
      const len = Math.hypot(dx, dy) || 1;
      // up-screen unit normal
      let nx = -dy / len;
      let ny = dx / len;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const bend = (90 + 40 * (hv[i] as number)) * S;
      const cx = (x0 + tipX) / 2 + nx * bend;
      const cy = (y0 + tipY) / 2 + ny * bend;
      const t = Math.min(1, (ages[i] as number) / (durs[i] as number));
      const u = t ** 1.6;
      // after arrival the head stays on the bar and the tail retracts + fades (<= 80 ms)
      const fade = Math.max(
        0,
        Math.min(1, ((ages[i] as number) - (durs[i] as number)) / TAIL_FADE_SEC),
      );
      const k = env.k * (1 - fade);
      let trailPx = (STREAK_STYLE.trailPx[tier] as number) * S * fat * (1 - fade);
      if (env.reducedMotion) trailPx *= 0.5;
      const trailU = Math.max(0.0005, trailPx / (len * 1.15));
      const ua = Math.max(0, u - trailU);
      for (let s = 0; s < samples; s++) {
        const w = ua + ((u - ua) * s) / (samples - 1);
        const m = 1 - w;
        PX[s] = m * m * x0 + 2 * m * w * cx + w * w * tipX;
        PY[s] = m * m * y0 + 2 * m * w * cy + w * w * tipY;
      }
      const accent = tier >= 4 && !env.reducedMotion ? I_BUCKET + hueBucket(env.time, 0) : tier;
      const accent2 = tier >= 4 && !env.reducedMotion ? I_BUCKET + hueBucket(env.time, 90) : tier;
      // dark underlay so the trail reads over bright worlds (additive light alone vanishes there)
      c.globalCompositeOperation = "source-over";
      c.lineWidth = 6.5 * S * fat;
      c.globalAlpha = 0.45 * k;
      c.strokeStyle = "#140a06";
      c.beginPath();
      c.moveTo(PX[0] as number, PY[0] as number);
      for (let s = 1; s < samples; s++) c.lineTo(PX[s] as number, PY[s] as number);
      c.stroke();
      // outer glow stroke (tier 4: two flat halves in different hue buckets)
      c.globalCompositeOperation = "lighter";
      c.lineWidth = 11 * S * fat;
      c.globalAlpha = 0.3 * k;
      const half = tier >= 4 ? Math.floor(samples / 2) : samples - 1;
      c.strokeStyle = FILL[accent2] as string;
      c.beginPath();
      c.moveTo(PX[0] as number, PY[0] as number);
      for (let s = 1; s <= half; s++) c.lineTo(PX[s] as number, PY[s] as number);
      c.stroke();
      if (half < samples - 1) {
        c.strokeStyle = FILL[accent] as string;
        c.beginPath();
        c.moveTo(PX[half] as number, PY[half] as number);
        for (let s = half + 1; s < samples; s++) c.lineTo(PX[s] as number, PY[s] as number);
        c.stroke();
      }
      // mid stroke (opaque colour)
      c.globalCompositeOperation = "source-over";
      c.lineWidth = 5.5 * S * fat;
      c.globalAlpha = 0.9 * k;
      c.strokeStyle = FILL[accent] as string;
      c.beginPath();
      c.moveTo(PX[0] as number, PY[0] as number);
      for (let s = 1; s < samples; s++) c.lineTo(PX[s] as number, PY[s] as number);
      c.stroke();
      // white core over the front 45%
      const s0 = Math.floor((samples - 1) * 0.55);
      c.lineWidth = 2 * S * fat;
      c.globalAlpha = 0.95 * k;
      c.strokeStyle = FILL[I_WHITE] as string;
      c.beginPath();
      c.moveTo(PX[s0] as number, PY[s0] as number);
      for (let s = s0 + 1; s < samples; s++) c.lineTo(PX[s] as number, PY[s] as number);
      c.stroke();
      // head glow
      const headR = (STREAK_STYLE.headPx[tier] as number) * 0.8 * S * (fat > 1.5 ? 1.2 : 1);
      c.globalCompositeOperation = "lighter";
      drawGlow(c, sprites, accent, PX[samples - 1] as number, PY[samples - 1] as number, headR, k);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = k;
      c.fillStyle = FILL[I_WHITE] as string;
      const hs = Math.max(3, Math.round(headR * 0.28));
      c.fillRect(
        Math.round((PX[samples - 1] as number) - hs / 2),
        Math.round((PY[samples - 1] as number) - hs / 2),
        hs,
        hs,
      );
    }
  }
}

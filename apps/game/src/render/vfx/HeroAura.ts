/**
 * HeroAura (spec §3.2, §3.4): what the key streak and the combo do to the hero in the WORLD.
 *
 *  - Combo rune (mechanical, `comboTier`): a rune circle under the hero's feet, bronze / silver / gold /
 *    radiant. Slow and steady; pulses up on a tier gain, fades on a loss. Not touched by a streak reset.
 *  - Streak flare (`keyStreakTier`): a ground pool of light with expanding pulse rings, a pillar of light
 *    with two side shafts, a halo behind the hero, (tier 3+) a slow sunburst, a held point light at the
 *    chest, rising motes (glowing and pixel) and (tier 4) two orbiting stars. It "gutters out" in 600 ms
 *    on a reset, leaving one puff of smoke.
 *
 * Tuned bolder than the spec so it reads at a glance in a 1280x720 still, on a bright world too: the
 * light shapes use a partly-"over" blend (`AuraQuad`) so they keep their hue instead of washing to white.
 */
import { easeOutQuad, STREAK_STYLE } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { AuraKind, AuraQuad } from "./AuraQuad";
import { accentRgb, COMBO_RGB, hueRgb, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { LightSlots } from "./LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_GLOW,
  PK_PIXEL,
  PK_STREAK,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TypingFxSettings } from "./types";

const LIGHT_PEAK = [0, 0.35, 0.6, 0.85, 1.1] as const;
const LIGHT_RADIUS = [0, 2.2, 2.8, 3.2, 3.6] as const;
/** The aura light is multiplied so it visibly lights the hero, the ground and the nearest props. */
const LIGHT_GAIN = 1.0;
const LIGHT_RADIUS_GAIN = 1.15;
const MOTE_RATE = [0, 6, 18, 24, 32] as const;
const MOTE_SIZE = [
  [0, 0],
  [0.05, 0.08],
  [0.06, 0.09],
  [0.08, 0.11],
  [0.08, 0.12],
] as const;
const MOTE_RISE = [
  [0, 0],
  [0.6, 1.0],
  [0.8, 1.2],
  [1.0, 1.4],
  [1.0, 1.5],
] as const;
const MOTE_LIFE = [
  [1, 1],
  [1.0, 1.4],
  [0.9, 1.3],
  [1.0, 1.5],
  [1.0, 1.6],
] as const;
/** Spec says 0.05-0.12 u; at 1280x720 that is 3-8 px, so motes are drawn larger. */
const MOTE_SCALE = 1.9;
const MOTE_BOOST = 1.6;
const RUNE_BASE = [0, 0.35, 0.5, 0.7, 0.95] as const;
/** Rune brightness multiplier (HDR) and diameter (world units). */
const RUNE_GAIN = 3.0;
const RUNE_SIZE = 3.7;
/** Light shapes use accent x this (an "over" blend wants colours near 1, not HDR 2). */
const OVER = 0.78;

const SPEC: ParticleSpec = newSpec();
const RGB: Rgb = [0, 0, 0];
const RGB2: Rgb = [0, 0, 0];

export class HeroAura {
  private readonly rune: FxQuad;
  private readonly pool: AuraQuad;
  private readonly rings: AuraQuad[] = [];
  private readonly pillar: AuraQuad;
  private readonly shafts: AuraQuad[] = [];
  private readonly halo: AuraQuad;
  private readonly burst: AuraQuad;
  private readonly shock: AuraQuad;
  private shockT = -1;
  private shockDur = 0.5;
  private shockSize = 9;
  private readonly shockRgb: Rgb = [1, 1, 1];
  private readonly stars: FxQuad[] = [];
  heroX = 0;
  heroZ = 0.25;

  private streakTier = 0;
  private comboTier = 0;
  /** Displayed level (0..1), eases toward the tier's level. */
  private level = 0;
  private downRate = 1 / 0.6;
  private surgeT = 0;
  private comboShown = 0;
  private comboPulse = 0;
  private forceT4 = false;
  private moteAcc = 0;
  private spin = 0;
  /** False hides the aura (menus). */
  enabled = true;

  constructor(
    world: RenderWorld,
    private readonly poolA: PooledParticles,
    private readonly poolB: PooledParticles,
    private readonly lights: LightSlots,
  ) {
    this.rune = new FxQuad(world, FxKind.Rune, 2);
    this.rune.mesh.rotation.x = -Math.PI / 2;
    this.pool = new AuraQuad(world, AuraKind.Disc, 3, 0, 0.35).flat();
    for (let i = 0; i < 2; i++)
      this.rings.push(new AuraQuad(world, AuraKind.Ring, 3, i, 0.6).flat());
    this.burst = new AuraQuad(world, AuraKind.Burst, 5, 1.3, 0.6);
    this.shock = new AuraQuad(world, AuraKind.Ring, 4, 3, 0.5).flat();
    this.halo = new AuraQuad(world, AuraKind.Disc, 6, 0, 0.5);
    this.pillar = new AuraQuad(world, AuraKind.Column, 7, 0, 0.5);
    for (let i = 0; i < 2; i++)
      this.shafts.push(new AuraQuad(world, AuraKind.Column, 7, i * 2.1 + 1, 0.55));
    for (let i = 0; i < 2; i++) this.stars.push(new FxQuad(world, FxKind.Star, 9));
  }

  get streak(): number {
    return this.streakTier;
  }
  get combo(): number {
    return this.comboTier;
  }
  get displayed(): number {
    return this.level;
  }
  /** Tier whose visuals are showing (the finisher can force 4). */
  get visualTier(): number {
    return this.forceT4 ? 4 : this.streakTier;
  }

  /** Jump (no ramp) to a tier. Tier-up and snap use it. */
  setStreakTier(t: number, instant = true): void {
    this.streakTier = t;
    const target = STREAK_STYLE.auraLevel[t] as number;
    if (instant && target > this.level) this.level = target;
    this.forceT4 = false;
  }
  /** Finisher anticipation: hold the aura at tier-4 visuals regardless of the streak. */
  setForceMax(on: boolean): void {
    this.forceT4 = on;
  }
  setComboTier(t: number): void {
    if (t > this.comboTier) this.comboPulse = 1;
    this.comboTier = t;
  }
  /** Tier-up downbeat: x1.6 decaying over 450 ms. */
  surge(): void {
    this.surgeT = 1;
  }

  /** A ground shockwave ring around the hero (tier-up downbeat, ATB filled): expands over `dur` s. */
  ring(r: number, g: number, b: number, size: number, dur: number): void {
    this.shockT = 0;
    this.shockDur = dur;
    this.shockSize = size;
    this.shockRgb[0] = r;
    this.shockRgb[1] = g;
    this.shockRgb[2] = b;
  }

  /** Streak reset: the flare gutters out over 600 ms and leaves a puff of smoke (4 motes in zen). */
  gutter(puffMotes = 8): void {
    this.streakTier = 0;
    this.downRate = Math.max(0.5, this.level) / 0.6;
    for (let i = 0; i < puffMotes; i++) {
      const a = (i / puffMotes) * Math.PI * 2;
      resetSpec(SPEC);
      SPEC.x = this.heroX + Math.cos(a) * 0.4;
      SPEC.y = 0.5 + (i % 3) * 0.25;
      SPEC.z = this.heroZ + Math.sin(a) * 0.3;
      SPEC.vx = Math.cos(a) * 0.25;
      SPEC.vy = 0.4;
      SPEC.size = 0.28;
      SPEC.size1 = 0.62;
      SPEC.life = 0.9;
      SPEC.r = 0.42;
      SPEC.g = 0.37;
      SPEC.b = 0.34;
      SPEC.a = 0.75;
      SPEC.kind = PK_GLOW;
      this.poolB.emit(SPEC);
    }
  }

  clear(): void {
    this.level = 0;
    this.streakTier = 0;
    this.comboTier = 0;
    this.comboShown = 0;
    this.surgeT = 0;
    this.hide();
  }

  private hidden = false;
  private hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.rune.intensity(0);
    this.pool.alpha(0);
    for (const r of this.rings) r.alpha(0);
    this.pillar.alpha(0);
    for (const s of this.shafts) s.alpha(0);
    this.halo.alpha(0);
    this.burst.alpha(0);
    this.shock.alpha(0);
    this.shockT = -1;
    for (const s of this.stars) s.intensity(0);
    this.lights.setAura(0, 0, 0, 0, 0, 0, 0, 0);
  }

  /** @hot */
  update(dt: number, time: number, set: TypingFxSettings, q: number, qualityTier: number): void {
    const k = set.effectsIntensity;
    if (!this.enabled || k <= 0) {
      this.hide();
      return;
    }
    this.hidden = false;
    const tier = this.forceT4 ? 4 : this.streakTier;
    const target = STREAK_STYLE.auraLevel[tier] as number;
    if (this.level < target) this.level = Math.min(target, this.level + 2.5 * dt);
    else if (this.level > target) this.level = Math.max(target, this.level - this.downRate * dt);
    if (this.surgeT > 0) this.surgeT = Math.max(0, this.surgeT - dt / 0.45);
    if (this.comboPulse > 0) this.comboPulse = Math.max(0, this.comboPulse - dt / 0.3);
    const surge = 1 + 0.6 * easeOutQuad(this.surgeT);
    const a = this.level * k;
    const v = a * surge;
    const rm = set.reducedMotion;
    const dispTier = Math.max(1, tier);
    accentRgb(this.level > 0.001 ? dispTier : 0, time, rm, RGB);
    this.spin += dt * (rm ? 0.1 : 0.35);
    const hx = this.heroX;
    const hz = this.heroZ;

    // ---- combo rune (mechanical, steady)
    const comboTarget = (RUNE_BASE[this.comboTier] as number) * k;
    this.comboShown +=
      (comboTarget - this.comboShown) * Math.min(1, dt * (comboTarget > this.comboShown ? 8 : 4));
    const rI = this.comboShown * (1 + this.comboPulse) * RUNE_GAIN;
    const cc = COMBO_RGB[this.comboTier] as Rgb;
    this.rune
      .color(cc[0] * 2.2, cc[1] * 2.2, cc[2] * 2.2)
      .at(hx, 0.045, hz + 0.05)
      .size(RUNE_SIZE, RUNE_SIZE)
      .intensity(rI);
    this.rune.mesh.rotation.z = this.spin;

    // ---- shockwave ring (tier-up downbeat / ATB filled)
    if (this.shockT >= 0) {
      this.shockT += dt;
      const u = this.shockT / this.shockDur;
      if (u >= 1) {
        this.shockT = -1;
        this.shock.alpha(0);
      } else {
        const e = 1 - (1 - u) * (1 - u);
        this.shock
          .color(this.shockRgb[0], this.shockRgb[1], this.shockRgb[2])
          .at(hx, 0.06, hz + 0.1)
          .size(this.shockSize)
          .progress(0.1 + 0.9 * e)
          .alpha(1.0 * k * (1 - u * 0.5));
      }
    }

    // ---- streak flare
    if (v > 0.003) {
      const r = RGB[0] * OVER;
      const g = RGB[1] * OVER;
      const b = RGB[2] * OVER;
      const m = Math.min(1.1, v);
      // ground pool of light + two expanding pulse rings
      this.pool
        .color(r, g, b)
        .at(hx, 0.05, hz + 0.1)
        .size(3.2 + 2.4 * v)

        .alpha(0.62 * m);
      for (let i = 0; i < 2; i++) {
        const u = rm ? 0.55 : (time * 0.85 + i * 0.5) % 1;
        const ring = this.rings[i] as AuraQuad;
        ring
          .color(r * 1.15, g * 1.15, b * 1.15)
          .at(hx, 0.055, hz + 0.1)
          .size(5.6 + 1.6 * v)
          .progress(0.18 + 0.82 * u)
          .alpha(1.0 * m);
      }
      // pillar of light behind the hero (bright at the feet, fading up) plus two narrow side shafts
      const sway = rm ? 0 : Math.sin(time * 1.3) * 0.08;
      this.pillar
        .color(r, g, b)
        .at(hx, 2.5, hz - 0.08)
        .size(1.1 + 0.6 * v, 5.2)
        .alpha(0.5 * m);
      for (let i = 0; i < 2; i++) {
        const s = this.shafts[i] as AuraQuad;
        const off = (i === 0 ? -1 : 1) * (0.62 + sway);
        if (tier >= 2)
          s.color(r * 1.1, g * 1.1, b * 1.1)
            .at(hx + off, 2.1, hz - 0.1)
            .size(0.42, 3.6 + 0.5 * i)
            .alpha(0.7 * m);
        else s.alpha(0);
      }
      // halo behind the chest
      this.halo
        .color(r, g, b)
        .at(hx, 1.15, hz - 0.06)
        .size(1.6 + 0.8 * v)
        .alpha(0.16 * m);
      // slow sunburst behind the hero (tier 3+)
      if (tier >= 3) {
        this.burst
          .color(r * 1.2, g * 1.2, b * 1.2)
          .at(hx, 1.25, hz - 0.12)
          .size(4.6 + 1.2 * v)
          .alpha(0.8 * m);
        this.burst.mesh.rotation.z = rm ? 0 : time * 0.28;
      } else this.burst.alpha(0);
      // held light
      const ti = Math.max(1, Math.min(4, tier));
      const peak = (LIGHT_PEAK[ti] as number) * LIGHT_GAIN;
      const rad = (LIGHT_RADIUS[ti] as number) * LIGHT_RADIUS_GAIN;
      const ramp = target > 0 ? Math.min(1.25, v / target) : v;
      if (qualityTier >= 2) this.lights.setAura(0, 0, 0, 0, 0, 0, 0, 0);
      else
        this.lights.setAura(
          hx,
          1.1,
          hz + 0.15,
          RGB[0] * 0.6,
          RGB[1] * 0.6,
          RGB[2] * 0.6,
          peak * ramp,
          rad,
        );
    } else {
      this.pool.alpha(0);
      for (const r of this.rings) r.alpha(0);
      this.pillar.alpha(0);
      for (const s of this.shafts) s.alpha(0);
      this.halo.alpha(0);
      this.burst.alpha(0);
      this.lights.setAura(0, 0, 0, 0, 0, 0, 0, 0);
    }

    // ---- orbit stars (T4)
    const orbit = tier >= 4 && v > 0.5;
    for (let i = 0; i < 2; i++) {
      const s = this.stars[i] as FxQuad;
      if (!orbit) {
        s.intensity(0);
        continue;
      }
      const ph = (rm ? 0 : time * ((Math.PI * 2) / 1.8)) + i * Math.PI;
      hueRgb(time * 140 + i * 120, 2.2, RGB2);
      s.color(RGB2[0], RGB2[1], RGB2[2])
        .at(
          hx + Math.cos(ph) * 0.95,
          1.2 + Math.sin(ph * 1.5) * 0.35,
          hz + 0.25 + Math.sin(ph) * 0.2,
        )
        .size(0.7)
        .intensity(Math.min(1, v) * 1.5);
    }

    // ---- motes (pool A glow + pool B pixel)
    if (tier >= 1 && this.level > 0.05) {
      this.moteAcc +=
        (MOTE_RATE[tier] as number) *
        MOTE_BOOST *
        k *
        q *
        dt *
        Math.min(1, this.level / Math.max(0.01, target));
      while (this.moteAcc >= 1) {
        this.moteAcc -= 1;
        this.emitMote(tier, time);
      }
    } else this.moteAcc = 0;
  }

  private emitMote(tier: number, time: number): void {
    // deterministic scatter from the running accumulator + time (no RNG state needed)
    const h = Math.sin(time * 127.1 + this.moteAcc * 311.7 + tier * 17.3) * 43758.5453;
    const r1 = h - Math.floor(h);
    const h2 = Math.sin(time * 269.5 + r1 * 183.3) * 24634.6345;
    const r2 = h2 - Math.floor(h2);
    const h3 = Math.sin(time * 419.2 + r2 * 71.7) * 9631.2331;
    const r3 = h3 - Math.floor(h3);
    const ang = r1 * Math.PI * 2;
    const rise = MOTE_RISE[tier] as readonly [number, number];
    const sz = MOTE_SIZE[tier] as readonly [number, number];
    const life = MOTE_LIFE[tier] as readonly [number, number];
    // colour: tier accent; tier 4 takes a random hue per mote
    if (tier >= 4) hueRgb((r3 * 360) | 0, 1.0, RGB2);
    else accentRgb(tier, time, false, RGB2);
    const pixel = r2 < 0.55;
    resetSpec(SPEC);
    SPEC.x = this.heroX + Math.cos(ang) * 0.55;
    SPEC.z = this.heroZ + Math.sin(ang) * 0.35;
    SPEC.y = 0.08;
    SPEC.vy = rise[0] + (rise[1] - rise[0]) * r2;
    SPEC.vx = (r3 - 0.5) * 0.3;
    SPEC.size = (sz[0] + (sz[1] - sz[0]) * r3) * MOTE_SCALE;
    SPEC.life = life[0] + (life[1] - life[0]) * r1;
    SPEC.sway = tier >= 2 ? 0.4 + (tier - 2) * 0.2 : 0;
    SPEC.ph = r2 * 6.28;
    SPEC.fadeIn = 0.08;
    if (pixel) {
      // crisp pixel square, normal blend: keeps its saturated colour on a bright world
      SPEC.size *= 1.35;
      SPEC.size1 = SPEC.size * 0.7;
      SPEC.r = Math.min(1.1, RGB2[0] * 0.7 + 0.25);
      SPEC.g = Math.min(1.1, RGB2[1] * 0.7 + 0.25);
      SPEC.b = Math.min(1.1, RGB2[2] * 0.7 + 0.25);
      SPEC.a = 1;
      SPEC.kind = PK_PIXEL;
      this.poolB.emit(SPEC);
      return;
    }
    SPEC.size1 = SPEC.size * 0.35;
    SPEC.r = RGB2[0] * 1.2;
    SPEC.g = RGB2[1] * 1.2;
    SPEC.b = RGB2[2] * 1.2;
    SPEC.a = 1;
    if (tier === 2 && r2 > 0.8) {
      SPEC.kind = PK_STREAK;
      SPEC.st = 0.12;
      SPEC.size = 0.07;
    } else SPEC.kind = PK_GLOW;
    this.poolA.emit(SPEC);
  }

  dispose(): void {
    this.rune.dispose();
    this.pool.dispose();
    for (const r of this.rings) r.dispose();
    this.pillar.dispose();
    for (const s of this.shafts) s.dispose();
    this.halo.dispose();
    this.burst.dispose();
    this.shock.dispose();
    for (const s of this.stars) s.dispose();
  }
}

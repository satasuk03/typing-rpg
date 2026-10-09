/**
 * Effect layer API for T2.6 (typing VFX). Everything here is in CSS pixels of the HUD canvas
 * (the same space as `Hud.getLetterRect` / `getAtbAnchor`).
 *
 * Z-order (bottom to top):
 *   panels/bars -> banners -> "behind" layer -> pops -> PLATES -> "above" layer
 * The "above" layer is drawn with a clip that EXCLUDES every plate letter rect, so an effect there
 * can never cover a letter (readability contract). The "behind" layer sits under the plates.
 * Per-letter / per-plate reactions (scale punch, flash, bounce, shake, crack, tint) are applied by
 * the plate renderer itself via `PlateFx`, so they animate the real glyphs.
 */
import type { HudSettings } from "./settings";

export type Ctx = CanvasRenderingContext2D;
export type FxLayerId = "behind" | "above";

export interface FxFrame {
  /** Seconds since the effect was added. */
  age: number;
  /** age / life, 0..1. */
  k: number;
  dt: number;
  /** HUD clock in seconds. */
  time: number;
  /** Design-to-CSS scale (effective px per design px at 1280 wide = 1). */
  scale: number;
  settings: HudSettings;
}

export interface HudEffect {
  layer: FxLayerId;
  /** Lifetime in seconds. */
  life: number;
  /** Composite mode for the draw call (default "source-over"; use "lighter" for glows). */
  blend?: GlobalCompositeOperation;
  /** Draw in CSS px; ctx transform is already set. Do not leave state behind (save/restore is done). */
  draw(c: Ctx, f: FxFrame): void;
}

interface Live {
  fx: HudEffect;
  age: number;
}

export class EffectLayers {
  private live: Live[] = [];
  /** Hard cap so a runaway emitter cannot tank the frame. */
  static readonly MAX = 600;

  add(fx: HudEffect): HudEffect {
    this.live.push({ fx, age: 0 });
    if (this.live.length > EffectLayers.MAX)
      this.live.splice(0, this.live.length - EffectLayers.MAX);
    return fx;
  }
  remove(fx: HudEffect): void {
    const i = this.live.findIndex((l) => l.fx === fx);
    if (i >= 0) this.live.splice(i, 1);
  }
  clear(): void {
    this.live.length = 0;
  }
  get count(): number {
    return this.live.length;
  }
  update(dt: number): void {
    for (const l of this.live) l.age += dt;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      if (l && l.age >= l.fx.life) this.live.splice(i, 1);
    }
  }
  draw(layer: FxLayerId, c: Ctx, base: Omit<FxFrame, "age" | "k">): void {
    for (const l of this.live) {
      if (l.fx.layer !== layer) continue;
      c.save();
      c.globalCompositeOperation = l.fx.blend ?? "source-over";
      l.fx.draw(c, { ...base, age: l.age, k: Math.min(1, l.age / l.fx.life) });
      c.restore();
    }
  }
}

// ---------------------------------------------------------------- per-plate reactions

export interface LetterFxState {
  /** Scale multiplier (1 = none). */
  scale: number;
  /** 0..1 white flash. */
  flash: number;
  /** 0..1 red glitch (typo). */
  glitch: number;
  crack: boolean;
}

export interface PlateTint {
  border?: string;
  /** Overrides the typed-letter colour (keep contrast >= 4.5 on the plate!). */
  typed?: string;
  glow?: string;
}

interface LetterAnim {
  age: number;
  dur: number;
  scale: number;
  flash: number;
  glitch: number;
}
interface PlateAnim {
  letters: Map<number, LetterAnim>;
  bounceAge: number;
  bounceAmp: number;
  shakeAge: number;
  shakeDur: number;
  shakeMag: number;
  cracks: Map<number, number>;
  tint: PlateTint | null;
}

const IDLE: LetterFxState = { scale: 1, flash: 0, glitch: 0, crack: false };

export class PlateFx {
  private plates = new Map<number, PlateAnim>();
  settings: HudSettings = { effectsIntensity: 1, reducedFlash: false, reducedMotion: false };

  private get(id: number): PlateAnim {
    let p = this.plates.get(id);
    if (!p) {
      p = {
        letters: new Map(),
        bounceAge: 99,
        bounceAmp: 0,
        shakeAge: 99,
        shakeDur: 0,
        shakeMag: 0,
        cracks: new Map(),
        tint: null,
      };
      this.plates.set(id, p);
    }
    return p;
  }

  /** Scale punch + white flash on one letter that settles back (T2.6 per-key pop). */
  popLetter(
    plateId: number,
    index: number,
    o: { scale?: number; dur?: number; flash?: number; glitch?: number } = {},
  ): void {
    const s = this.settings;
    const k = s.effectsIntensity;
    const flashCap = s.reducedFlash ? 0.35 : 1;
    this.get(plateId).letters.set(index, {
      age: 0,
      dur: o.dur ?? 0.2,
      scale: s.reducedMotion ? 1 : 1 + ((o.scale ?? 0.4) - 0) * k,
      flash: Math.min(flashCap, (o.flash ?? 1) * k),
      glitch: o.glitch ?? 0,
    });
  }
  /** Whole-plate vertical bounce (px, positive = up). */
  bounce(plateId: number, amp = 5): void {
    if (this.settings.reducedMotion) return;
    const p = this.get(plateId);
    p.bounceAge = 0;
    p.bounceAmp = amp * this.settings.effectsIntensity;
  }
  shake(plateId: number, mag = 4, dur = 0.25): void {
    if (this.settings.reducedMotion) return;
    const p = this.get(plateId);
    p.shakeAge = 0;
    p.shakeDur = dur;
    p.shakeMag = mag * this.settings.effectsIntensity;
  }
  /** Persistent crack line through a letter; fades after `dur` s. */
  crack(plateId: number, index: number, dur = 1.2): void {
    this.get(plateId).cracks.set(index, dur);
  }
  setTint(plateId: number, tint: PlateTint | null): void {
    this.get(plateId).tint = tint;
  }
  tint(plateId: number): PlateTint | null {
    return this.plates.get(plateId)?.tint ?? null;
  }
  letter(plateId: number, index: number): LetterFxState {
    const p = this.plates.get(plateId);
    if (!p) return IDLE;
    const l = p.letters.get(index);
    const crack = p.cracks.has(index);
    if (!l) return crack ? { scale: 1, flash: 0, glitch: 0, crack } : IDLE;
    const k = Math.min(1, l.age / l.dur);
    const ease = (1 - k) ** 2;
    return {
      scale: 1 + (l.scale - 1) * ease,
      flash: l.flash * (1 - k),
      glitch: l.glitch * (1 - k),
      crack,
    };
  }
  /** Plate offset in design px (bounce up + shake sideways). */
  offset(plateId: number, time: number): { dx: number; dy: number } {
    const p = this.plates.get(plateId);
    if (!p) return { dx: 0, dy: 0 };
    let dx = 0;
    let dy = 0;
    if (p.bounceAge < 0.22) dy = -Math.sin((p.bounceAge / 0.22) * Math.PI) * p.bounceAmp;
    if (p.shakeAge < p.shakeDur)
      dx = Math.sin(time * 90) * p.shakeMag * (1 - p.shakeAge / p.shakeDur);
    return { dx, dy };
  }
  update(dt: number): void {
    for (const [id, p] of this.plates) {
      p.bounceAge += dt;
      p.shakeAge += dt;
      for (const [i, l] of p.letters) {
        l.age += dt;
        if (l.age >= l.dur) p.letters.delete(i);
      }
      for (const [i, t] of p.cracks) {
        const left = t - dt;
        if (left <= 0) p.cracks.delete(i);
        else p.cracks.set(i, left);
      }
      if (
        p.letters.size === 0 &&
        p.cracks.size === 0 &&
        p.bounceAge > 1 &&
        p.shakeAge > 1 &&
        !p.tint
      )
        this.plates.delete(id);
    }
  }
  forget(plateId: number): void {
    this.plates.delete(plateId);
  }
  clear(): void {
    this.plates.clear();
  }
}

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
import { easeInOutSine, easeOutQuad, TYPO } from "../level/typingFxParams";
import { letterPopCurve } from "./fx/typing/letterPop";
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
  /** Drops every effect except persistent ones (life = Infinity, e.g. the typing VFX layers). */
  clear(): void {
    this.live = this.live.filter((l) => l.fx.life === Number.POSITIVE_INFINITY);
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
  /** 0..1 white flash (pop). */
  flash: number;
  /** 0..1 how much of the typo colour is mixed in (1 during the hold, then lerps back). */
  glitch: number;
  crack: boolean;
  /** Extra glow radius in px from the pop (0 = use the resting glow). */
  glowPx: number;
  /** Upward lift in design px. */
  liftPx: number;
  /** Discrete typo jitter in design px (3 steps). */
  glitchDx: number;
  /** 0..1 RGB-split strength (first 80 ms of a typo). */
  split: number;
  /** Zen typo: amber instead of red. */
  amber: boolean;
  /** v2.0: the pop belongs to a capital (shifted) letter: the flash mixes gold instead of white. */
  gold: boolean;
}

export interface PlateTint {
  border?: string;
  /** Overrides the typed-letter colour (keep contrast >= 4.5 on the plate!). */
  typed?: string;
  glow?: string;
  /** Tier number, for the tier-aware plate renderer. */
  tier?: number;
  /** Tier 4: per-letter hue and a rotating conic border. */
  prism?: boolean;
  /** Pop glow colour (hex). */
  accent?: string;
  /** Resting typed-letter glow radius (px). */
  typedGlowPx?: number;
  /** Target-plate border glow radius (px). */
  borderGlowPx?: number;
}

const NONE = -1;
const GLITCH_SEC = (TYPO.holdMs + TYPO.fadeMs) / 1000;
const AMBER_SEC = TYPO.amberMs / 1000;

function newLetterState(): LetterFxState {
  return {
    scale: 1,
    flash: 0,
    glitch: 0,
    crack: false,
    glowPx: 0,
    liftPx: 0,
    glitchDx: 0,
    split: 0,
    amber: false,
    gold: false,
  };
}
function resetLetter(o: LetterFxState): LetterFxState {
  o.scale = 1;
  o.flash = 0;
  o.glitch = 0;
  o.crack = false;
  o.glowPx = 0;
  o.liftPx = 0;
  o.glitchDx = 0;
  o.split = 0;
  o.amber = false;
  o.gold = false;
  return o;
}

interface PlateAnim {
  /** Seconds since the pop of each letter; NONE = idle. */
  pop: Float32Array;
  /** Seconds since the typo glitch of each letter; NONE = idle. */
  glitch: Float32Array;
  glitchAmber: Uint8Array;
  /** 1 = the letter's pop is a capital's (gold flash). */
  popGold: Uint8Array;
  pressAge: number;
  pressAmp: number;
  shakeAge: number;
  shakeDur: number;
  shakeMag: number;
  crackIdx: Int16Array;
  crackLeft: Float32Array;
  tint: PlateTint | null;
  /** Border flash: white hold then lerp back. NONE = idle. */
  borderAge: number;
  borderHold: number;
  borderFade: number;
  borderCol: string;
  /** Lock-on sweep age in seconds; NONE = idle. */
  sweepAge: number;
}

const IDLE_OFFSET = { dx: 0, dy: 0 };
const OFFSET = { dx: 0, dy: 0 };
const LETTER = newLetterState();
const SWEEP_SEC = 0.18;
const CRACK = { index: 0, a: 0 };

export class PlateFx {
  private plates = new Map<number, PlateAnim>();
  settings: HudSettings = { effectsIntensity: 1, reducedFlash: false, reducedMotion: false };
  /** When true every typing reaction is suppressed (A/B readability capture). */
  muted = false;

  private get(id: number): PlateAnim {
    let p = this.plates.get(id);
    if (!p) {
      p = {
        pop: new Float32Array(32).fill(NONE),
        glitch: new Float32Array(32).fill(NONE),
        glitchAmber: new Uint8Array(32),
        popGold: new Uint8Array(32),
        pressAge: 99,
        pressAmp: 0,
        shakeAge: 99,
        shakeDur: 0,
        shakeMag: 0,
        crackIdx: new Int16Array(TYPO.maxCracks).fill(-1),
        crackLeft: new Float32Array(TYPO.maxCracks),
        tint: null,
        borderAge: NONE,
        borderHold: 0,
        borderFade: 0,
        borderCol: "#ffffff",
        sweepAge: NONE,
      };
      this.plates.set(id, p);
    }
    return p;
  }
  private ensure(p: PlateAnim, index: number): void {
    if (index < p.pop.length) return;
    let n = p.pop.length;
    while (n <= index) n *= 2;
    const grow = (a: Float32Array): Float32Array => {
      const b = new Float32Array(n).fill(NONE);
      b.set(a);
      return b;
    };
    p.pop = grow(p.pop);
    p.glitch = grow(p.glitch);
    const ga = new Uint8Array(n);
    ga.set(p.glitchAmber);
    p.glitchAmber = ga;
    const pg = new Uint8Array(n);
    pg.set(p.popGold);
    p.popGold = pg;
  }

  /** Letter pop (T2.6 §2.1). The curve itself lives in `letterPopCurve`. */
  pop(plateId: number, index: number, gold = false): void {
    const p = this.get(plateId);
    this.ensure(p, index);
    p.pop[index] = 0;
    p.popGold[index] = gold ? 1 : 0;
  }
  /** Legacy entry point kept for the fallback path and older callers. */
  popLetter(
    plateId: number,
    index: number,
    o: { scale?: number; dur?: number; flash?: number; glitch?: number } = {},
  ): void {
    if (o.glitch) this.glitch(plateId, index, false);
    else this.pop(plateId, index);
  }
  /** Typo glitch on one letter (§6). Amber = zen. */
  glitch(plateId: number, index: number, amber: boolean): void {
    const p = this.get(plateId);
    this.ensure(p, index);
    p.glitch[index] = 0;
    p.glitchAmber[index] = amber ? 1 : 0;
  }
  /** Key-press bounce (§2.4): amplitude in design px, restarts the curve (no accumulation). */
  press(plateId: number, amp: number): void {
    if (this.settings.reducedMotion) return;
    const p = this.get(plateId);
    p.pressAge = 0;
    p.pressAmp = amp;
  }
  /** Legacy: whole-plate bounce, now the press curve. */
  bounce(plateId: number, amp = 3): void {
    this.press(plateId, amp * this.settings.effectsIntensity);
  }
  shake(plateId: number, mag = 4, dur = 0.25): void {
    if (this.settings.reducedMotion) return;
    const p = this.get(plateId);
    p.shakeAge = 0;
    p.shakeDur = dur;
    p.shakeMag = mag * this.settings.effectsIntensity;
  }
  /** Gutter crack at a letter column; fades after `dur` s. At most 3 per plate, the oldest is replaced. */
  crack(plateId: number, index: number, dur: number = TYPO.crackSec): void {
    const p = this.get(plateId);
    let slot = -1;
    let least = Number.POSITIVE_INFINITY;
    for (let i = 0; i < TYPO.maxCracks; i++) {
      if (p.crackIdx[i] === index) {
        slot = i;
        break;
      }
      const left = p.crackIdx[i] === -1 ? -1 : (p.crackLeft[i] as number);
      if (left < least) {
        least = left;
        slot = i;
      }
    }
    p.crackIdx[slot] = index;
    p.crackLeft[slot] = dur;
  }
  /** Border flashes white for `holdMs`, then lerps back over `fadeMs`. */
  flashBorder(plateId: number, holdMs: number, fadeMs: number, color = "#ffffff"): void {
    const p = this.get(plateId);
    p.borderCol = color;
    p.borderAge = 0;
    p.borderHold = holdMs / 1000;
    p.borderFade = fadeMs / 1000;
  }
  /** Colour of the current border flash (white unless the caller picked one, e.g. the typo red). */
  borderFlashColor(plateId: number): string {
    return this.plates.get(plateId)?.borderCol ?? "#ffffff";
  }
  /** 0..1 amount of the border flash. */
  borderFlash(plateId: number): number {
    if (this.muted) return 0;
    const p = this.plates.get(plateId);
    if (!p || p.borderAge === NONE) return 0;
    if (p.borderAge < p.borderHold) return 1;
    return Math.max(0, 1 - (p.borderAge - p.borderHold) / Math.max(1e-3, p.borderFade));
  }
  /** Lock-on sweep (§2.6): returns 0..1 progress around the frame, or -1 when idle. */
  sweepProgress(plateId: number): number {
    if (this.muted) return -1;
    const p = this.plates.get(plateId);
    if (!p || p.sweepAge === NONE) return -1;
    return Math.min(1, p.sweepAge / SWEEP_SEC);
  }
  sweep(plateId: number): void {
    if (this.settings.effectsIntensity <= 0) return;
    this.get(plateId).sweepAge = 0;
  }
  setTint(plateId: number, tint: PlateTint | null): void {
    if (!tint && !this.plates.has(plateId)) return;
    this.get(plateId).tint = tint;
  }
  tint(plateId: number): PlateTint | null {
    if (this.muted) return null;
    return this.plates.get(plateId)?.tint ?? null;
  }
  /**
   * State of one letter. Returns a shared scratch object: read it before the next call.
   * Typed letters only: the plate renderer ignores pop fields for the next letter (R2).
   */
  letter(plateId: number, index: number, isSentence = false): LetterFxState {
    const o = resetLetter(LETTER);
    if (this.muted) return o;
    const p = this.plates.get(plateId);
    if (!p) return o;
    for (let i = 0; i < TYPO.maxCracks; i++) if (p.crackIdx[i] === index) o.crack = true;
    if (index >= p.pop.length) return o;
    const pa = p.pop[index] as number;
    if (pa !== NONE) {
      letterPopCurve(pa * 1000, isSentence, this.settings, o);
      o.gold = p.popGold[index] === 1;
    }
    const ga = p.glitch[index] as number;
    if (ga !== NONE) {
      const ms = ga * 1000;
      const amber = p.glitchAmber[index] === 1;
      o.amber = amber;
      if (amber) {
        o.glitch = ms < TYPO.amberMs - 80 ? 1 : Math.max(0, (TYPO.amberMs - ms) / 80);
      } else {
        o.glitch = ms < TYPO.holdMs ? 1 : Math.max(0, 1 - (ms - TYPO.holdMs) / TYPO.fadeMs);
        const step = Math.floor(ms / TYPO.jitterStepMs);
        o.glitchDx = step < TYPO.jitter.length ? (TYPO.jitter[step] as number) : 0;
        o.split = ms < TYPO.splitMs ? 1 : 0;
      }
    }
    return o;
  }
  /** Plate offset in design px (press bounce down/up + shake sideways). Shared scratch object. */
  offset(plateId: number, time: number): { dx: number; dy: number } {
    if (this.muted) return IDLE_OFFSET;
    const p = this.plates.get(plateId);
    if (!p) return IDLE_OFFSET;
    let dx = 0;
    let dy = 0;
    const a = p.pressAge;
    if (a < 0.15) {
      const m = p.pressAmp;
      if (a < 0.035) dy = m * easeOutQuad(a / 0.035);
      else if (a < 0.09) dy = m + (-0.5 * m - m) * easeInOutSine((a - 0.035) / 0.055);
      else dy = -0.5 * m * (1 - easeOutQuad((a - 0.09) / 0.06));
    }
    if (p.shakeAge < p.shakeDur)
      dx = Math.sin(time * Math.PI * 2 * 16.7) * p.shakeMag * (1 - p.shakeAge / p.shakeDur);
    OFFSET.dx = dx;
    OFFSET.dy = dy;
    return OFFSET;
  }
  /** Crack alpha 0..1 for slot i (index -1 = unused). */
  crackAt(plateId: number, slot: number): { index: number; a: number } | null {
    const p = this.plates.get(plateId);
    if (!p || this.muted) return null;
    const idx = p.crackIdx[slot] as number;
    if (idx < 0) return null;
    CRACK.index = idx;
    CRACK.a = Math.min(1, (p.crackLeft[slot] as number) / 0.4);
    return CRACK;
  }
  update(dt: number): void {
    for (const [id, p] of this.plates) {
      p.pressAge += dt;
      p.shakeAge += dt;
      let busy = false;
      for (let i = 0; i < p.pop.length; i++) {
        const a = p.pop[i] as number;
        if (a !== NONE) {
          const n = a + dt;
          if (n >= 0.2) p.pop[i] = NONE;
          else {
            p.pop[i] = n;
            busy = true;
          }
        }
        const g = p.glitch[i] as number;
        if (g !== NONE) {
          const n = g + dt;
          const dur = p.glitchAmber[i] === 1 ? AMBER_SEC : GLITCH_SEC;
          if (n >= dur) p.glitch[i] = NONE;
          else {
            p.glitch[i] = n;
            busy = true;
          }
        }
      }
      for (let i = 0; i < TYPO.maxCracks; i++) {
        if (p.crackIdx[i] === -1) continue;
        const left = (p.crackLeft[i] as number) - dt;
        if (left <= 0) p.crackIdx[i] = -1;
        else {
          p.crackLeft[i] = left;
          busy = true;
        }
      }
      if (p.borderAge !== NONE) {
        p.borderAge += dt;
        if (p.borderAge >= p.borderHold + p.borderFade) p.borderAge = NONE;
        else busy = true;
      }
      if (p.sweepAge !== NONE) {
        p.sweepAge += dt;
        if (p.sweepAge >= SWEEP_SEC) p.sweepAge = NONE;
        else busy = true;
      }
      if (!busy && p.pressAge > 1 && p.shakeAge > 1 && !p.tint) this.plates.delete(id);
    }
  }
  forget(plateId: number): void {
    this.plates.delete(plateId);
  }
  clear(): void {
    this.plates.clear();
  }
}

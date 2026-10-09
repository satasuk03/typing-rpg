/**
 * TypingWorldFx: the WORLD half of T2.6 (Chunk B). It turns sim events into effects in the diorama:
 * hero aura (combo rune + streak flare), blade glow, word-complete strike, tier-up surge / light flash /
 * camera punch / capped post flash, the ATB-filled sequence (hero flash, light, punch, time-slow, dash
 * hook) and the gutter on a streak reset. Render-only: the sim is never touched.
 *
 * It never allocates per keystroke: `CharCorrect` needs nothing here (the aura emission continues).
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import { Vector3 } from "three";
import type { OrbPayload } from "../../hud/fx/typing/wordOrb";
import {
  elementIndex,
  fragmentArrivalSec,
  WEAPON_ANCHOR_OFFSET,
  WORD,
} from "../../level/typingFxParams";
import type { RenderWorld } from "../RenderWorld";
import { BladeGlow } from "./BladeGlow";
import {
  accentRgb,
  ELEMENT_LIGHT,
  ELEMENT_RGB,
  LIGHT_BEHIND,
  LIGHT_MAX_RADIUS,
  type Rgb,
} from "./colors";
import { FinisherCinematic } from "./FinisherCinematic";
import { GuardBarrier } from "./GuardBarrier";
import { HeroAura } from "./HeroAura";
import { LightSlots } from "./LightSlots";
import { PooledParticles } from "./PooledParticles";
import { BOLT_COLORS, boltScale, SentenceBolts } from "./SentenceBolts";
import { screenToActionPlane } from "./screenToWorld";
import type { TimeDilation } from "./TimeDilation";
import type { TypingFxCallbacks, TypingFxSettings, WorldAnchors } from "./types";

/** 384 for typing + 192 reserved for the T2.3 combat effects (they share the pool and its single draw call). */
const POOL_A_USED = [576, 432, 288] as const;
export const WORLD_Q = [1.0, 0.8, 0.55] as const;
/** Light flashes are multiplied so they actually light the diorama (spec numbers read as torch-weak). */
const FLASH_GAIN = 0.85;
const FLASH_RADIUS_GAIN = 0.8;
/** Typing post flash cap (R6). */
export const POST_FLASH_CAP = 0.12;
/** The ATB-ignite flash of the hero sprite is a tint, not a white-out: it never mixes more than this toward the flash colour (T6.3 #3). */
const HERO_FLASH_MAX = 0.03;
const GOLD: Rgb = [2.4, 1.8, 0.6];
const PINK: Rgb = [1, 0.88, 0.96];
const GOLD_LIGHT: Rgb = [1, 0.7, 0.22];
const MAX_WORDS = 4;

interface WordTl {
  age: number; // seconds, -1 = free
  n: number;
  charged: number;
  perfect: boolean;
  owner: number;
  element: number;
  done: boolean;
}

const POS = { x: 0, z: 0 };
const EN = { x: 0, y: 0, z: 0 };
const V3 = new Vector3();
const RGB: Rgb = [0, 0, 0];

/** An enemy attack ends the held guard barrier unless it was blocked / parried (those play their own exit). */
export function outcomeEndsBarrier(outcome: "hit" | "blocked" | "parried" | "barrier"): boolean {
  return outcome === "hit" || outcome === "barrier";
}

export class TypingWorldFx {
  readonly poolA: PooledParticles;
  readonly poolB: PooledParticles;
  readonly lights: LightSlots;
  readonly aura: HeroAura;
  readonly blade: BladeGlow;
  readonly barrier: GuardBarrier;
  readonly bolts: SentenceBolts;
  readonly finisher: FinisherCinematic;
  /** impactTick of the live guard word, to compress a late snap. */
  private guardImpact = -1;
  private settings: TypingFxSettings = {
    effectsIntensity: 1,
    reducedFlash: false,
    reducedMotion: false,
  };
  private view: LevelView | null = null;
  private time = 0;
  private qTier = 0;
  private q = 1;
  private enabled = true;
  private readonly words: WordTl[] = [];
  // pending tier-up downbeat
  private downIn = -1;
  private downTier = 0;
  // ATB hero flash
  private flashT = -1;
  private postFlashV = 0;
  private postFlashCap = POST_FLASH_CAP;
  private postDecay = 1 / 0.12;
  private postRgb: Rgb = [1, 0.88, 0.96];
  private disposed = false;
  private vig = 0;
  /** Seconds since the queue clock started; used for diagnostics only. */
  stats = { worldMs: 0, keys: 0 };
  /** Time `update` into `stats.worldMs` (bench only). */
  bench = false;

  constructor(
    private readonly world: RenderWorld,
    private readonly anchors: WorldAnchors,
    private readonly td: TimeDilation,
    private readonly cb: TypingFxCallbacks,
  ) {
    this.poolA = new PooledParticles(576, true, world.scene);
    // normal-blend shards draw ABOVE the additive quads (barrier, discs) so parry / break hexes stay crisp solid shapes
    this.poolB = new PooledParticles(192, false, world.scene, 12);
    this.lights = new LightSlots(world.lights);
    this.aura = new HeroAura(world, this.poolA, this.poolB, this.lights);
    this.blade = new BladeGlow(world, this.poolA);
    this.barrier = new GuardBarrier(world, this.poolA, this.poolB, this.lights, td, cb);
    this.bolts = new SentenceBolts(world, this.poolA, this.lights);
    this.bolts.onImpact = (doomFinal) => {
      if (doomFinal) this.punch(0.4, 0.0009, 0.01);
    };
    this.finisher = new FinisherCinematic(world, this.poolA, this.lights, td, cb, {
      postFlash: (a, rgb, ms, cap) => this.postFlash(a, rgb, ms, cap),
      enemy: (id, out) => this.anchors.enemy(id, out),
      hero: (out) => this.anchors.hero(out),
      element: () => ELEMENT_RGB[elementIndex(this.view?.hero.weaponDamageType)] as Rgb,
    });
    for (let i = 0; i < MAX_WORDS; i++)
      this.words.push({
        age: -1,
        n: 0,
        charged: 0,
        perfect: false,
        owner: -1,
        element: 0,
        done: true,
      });
  }

  setSettings(s: TypingFxSettings): void {
    this.settings = s;
    this.lights.gain = s.effectsIntensity * (s.reducedFlash ? 0.5 : 1);
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }
  setView(v: LevelView): void {
    this.view = v;
  }

  clear(): void {
    this.poolA.clear();
    this.poolB.clear();
    this.lights.clear();
    this.aura.clear();
    this.blade.clear();
    this.barrier.clear();
    this.bolts.clear();
    this.finisher.clear();
    this.aura.setForceMax(false);
    this.guardImpact = -1;
    for (const w of this.words) w.age = -1;
    this.downIn = -1;
    if (this.flashT >= 0) this.cb.actorFlash("hero", 0, [1, 1, 1]);
    this.flashT = -1;
    this.postFlashV = 0;
    this.world.postFx.effects.flash = 0;
    this.world.postFx.effects.vignetteBoost = 0;
    this.vig = 0;
  }

  // ---------------------------------------------------------------- events

  onEvent(e: SimEvent): void {
    if (!this.enabled) return;
    switch (e.type) {
      case "KeyStreakTierChanged":
        if (e.to > e.from) {
          this.aura.setStreakTier(e.to);
          this.downIn = ((1 + e.to) * 50) / 1000;
          this.downTier = e.to;
        } else if (e.to === 0) {
          this.aura.gutter(this.view?.comboMode === "zen" ? 4 : 8);
          this.downIn = -1;
        } else if (e.to < e.from) {
          // a one-tier typo drop (0 < to < from): a soft dim, much weaker than the break-to-0 gutter
          this.aura.stepDown(e.to);
          this.downIn = -1;
        } else this.aura.setStreakTier(e.to, false);
        break;
      case "ComboTierChanged":
        this.aura.setComboTier(e.to);
        break;
      case "WordCompleted":
        if (e.kind !== "guard") this.startWord(e);
        break;
      case "AtbFilled":
        this.atbFilled();
        break;
      case "CharCorrect":
        if (e.kind === "guard") this.guardKey(e);
        break;
      case "Typo":
        if (e.kind === "guard") this.barrier.shimmer();
        break;
      case "GuardWordShown":
        this.guardImpact = e.impactTick;
        break;
      case "GuardWordTyped": {
        // late snap: the barrier must be complete >= 40 ms before the impact
        const left =
          this.guardImpact >= 0 ? ((this.guardImpact - (this.view?.tick ?? 0)) / 60) * 1000 : 1e9;
        this.barrier.snap(e.result, left < 280 ? Math.max(0.2, (left - 40) / 240) : 1);
        this.guardImpact = -1;
        break;
      }
      case "GuardBlocked":
        this.barrier.block(this.settings);
        break;
      case "GuardParried":
        this.barrier.parry(this.settings);
        break;
      case "EnemyAttack":
        // a hit AND an Aegis-absorbed attack both end the held barrier (it used to float on after "barrier")
        if (outcomeEndsBarrier(e.outcome)) this.barrier.fade(200);
        break;
      case "WalkStarted":
      case "HeroDowned":
        this.barrier.fade(200);
        break;
      case "PlateRemoved":
        if (e.reason === "expired" || e.reason === "ownerDied" || e.reason === "phaseEnded")
          this.barrier.fade(200);
        break;
      case "FinisherShown":
        this.aura.setForceMax(true);
        break;
      case "FinisherCompleted":
        this.finisher.play(e.enemyId, this.settings);
        break;
      case "EnemyDeath":
        if (e.byKind === "finisher") this.aura.setForceMax(false);
        break;
      case "AutoAttack": {
        const dur = Math.max(60, ((e.impactTick - e.tick) / 60) * 1000 - 160);
        this.cb.dash(160, dur, e.targetId);
        break;
      }
      case "EncounterCleared":
      case "LevelCleared":
      case "LevelFailed":
        this.barrier.fade(200);
        this.aura.setStreakTier(0, false);
        break;
      case "LevelStarted":
        this.clear();
        break;
      default:
        break;
    }
  }

  private guardKey(e: Extract<SimEvent, { type: "CharCorrect" }>): void {
    if (this.settings.effectsIntensity <= 0) return;
    let len = e.index + 1;
    const v = this.view;
    if (v)
      for (const p of v.plates)
        if (p.id === e.plateId) {
          len = p.text.length;
          break;
        }
    this.heroPos();
    this.barrier.preview((e.index + 1) / Math.max(1, len));
  }

  /**
   * A sentence-word orb arrives from the HUD (spec 9.1): convert its screen position to the action plane and
   * launch the bolt at the plate owner (second wind: at the hero). The final word of a finisher launches nothing
   * (the cinematic replaces it).
   */
  launchBolt(sx: number, sy: number, p: OrbPayload, cssW: number, cssH: number): boolean {
    if (!this.enabled || this.settings.effectsIntensity <= 0) return false;
    if (p.kind === "finisher" && p.final) return false;
    if (!screenToActionPlane(this.world.camera.camera, sx, sy, cssW, cssH, V3)) return false;
    const heal = p.kind === "secondWind";
    let owner = -1;
    const v = this.view;
    if (v)
      for (const pl of v.plates)
        if (pl.id === p.plateId) {
          owner = pl.ownerId ?? -1;
          break;
        }
    this.heroPos();
    let tx = this.aura.heroX + 4;
    let ty = 1.4;
    let tz = this.aura.heroZ;
    if (heal) {
      tx = this.aura.heroX;
      ty = 1.1;
    } else if (owner >= 0 && this.anchors.enemy(owner, EN)) {
      tx = EN.x;
      ty = EN.y;
      tz = EN.z;
    }
    const rgb = heal
      ? BOLT_COLORS.secondWind
      : p.kind === "finisher"
        ? BOLT_COLORS.finisher
        : BOLT_COLORS.doom;
    this.bolts.launch(
      V3.x,
      V3.y,
      tx,
      ty,
      tz,
      boltScale(p.wordIndex, p.wordCount),
      rgb,
      p.kind === "doom" && p.final,
      heal,
    );
    return true;
  }

  /** 0 dark (cave) .. 1 bright (forest) from the biome's fog colour; picks the biome-aware aura colours. */
  private biomeBright(): number {
    const f = this.world.currentMood.fogCol;
    const lum = 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    const t = Math.min(1, Math.max(0, (lum - 0.08) / 0.4));
    return t * t * (3 - 2 * t);
  }

  private heroPos(): void {
    this.anchors.hero(POS);
    this.aura.heroX = POS.x;
    this.aura.heroZ = POS.z;
    const arche = this.view?.hero.archetype ?? "sword";
    const off =
      WEAPON_ANCHOR_OFFSET[arche] ?? (WEAPON_ANCHOR_OFFSET.sword as { x: number; y: number });
    this.blade.setAnchor(POS.x + off.x, off.y, POS.z + 0.3);
  }

  private elementLight(): Rgb {
    return ELEMENT_LIGHT[elementIndex(this.view?.hero.weaponDamageType)] as Rgb;
  }

  private startWord(e: Extract<SimEvent, { type: "WordCompleted" }>): void {
    if (this.settings.effectsIntensity <= 0) return;
    let n = 0;
    for (let i = 0; i < e.text.length; i++) if (e.text.charCodeAt(i) !== 32) n++;
    n = Math.max(1, Math.min(WORD.maxFragments, n));
    let w = this.words[0] as WordTl;
    for (const c of this.words)
      if (c.age < 0) {
        w = c;
        break;
      }
    w.age = 0;
    w.n = n;
    w.charged = 0;
    w.perfect = e.perfect;
    w.owner = e.ownerId ?? -1;
    w.element = elementIndex(this.view?.hero.weaponDamageType);
    w.done = false;
  }

  private atbFilled(): void {
    const k = this.settings.effectsIntensity;
    if (k <= 0) return;
    this.heroPos();
    const el = this.elementLight();
    this.lights.flash(
      this.aura.heroX,
      1.3,
      this.aura.heroZ + LIGHT_BEHIND,
      el[0],
      el[1],
      el[2],
      1.2 * FLASH_GAIN,
      Math.min(LIGHT_MAX_RADIUS, 4 * FLASH_RADIUS_GAIN),
      0.3,
    );
    this.flashT = 0;
    this.aura.ring(el[0] * 1.6, el[1] * 1.6, el[2] * 1.6, 5.5, 0.5);
    if (!this.settings.reducedMotion) {
      this.punch(0.25, 0.0008, 0.008);
      this.td.slow(1 + (0.25 - 1) * k, 100, 60);
    }
  }

  private punch(p: number, ca: number, zoom: number): void {
    const k = this.settings.effectsIntensity;
    if (this.settings.reducedMotion || k <= 0) return;
    V3.set(this.aura.heroX, 1.1, this.aura.heroZ);
    this.world.camera.project(V3.x, V3.y, V3.z, V3);
    this.world.camera.punch(
      p * k,
      this.settings.reducedFlash ? 0 : ca * k,
      zoom * k,
      V3.x * 0.5 + 0.5,
      V3.y * 0.5 + 0.5,
    );
  }

  /** Capped full-screen flash (R6: <= 0.12 while typing). */
  postFlash(amount: number, rgb: Rgb, ms = 120, cap = POST_FLASH_CAP): void {
    if (this.settings.reducedFlash || this.settings.effectsIntensity <= 0) return;
    this.postFlashV = Math.max(
      this.postFlashV,
      Math.min(cap, amount * this.settings.effectsIntensity),
    );
    this.postFlashCap = cap;
    this.postDecay = 1000 / ms;
    this.postRgb[0] = rgb[0];
    this.postRgb[1] = rgb[1];
    this.postRgb[2] = rgb[2];
  }

  private downbeat(): void {
    const to = this.downTier;
    const k = this.settings.effectsIntensity;
    if (k <= 0) return;
    this.heroPos();
    this.aura.surge();
    accentRgb(to, this.time, this.settings.reducedMotion, RGB);
    this.aura.ring(RGB[0] * 0.8, RGB[1] * 0.8, RGB[2] * 0.8, 5 + 0.4 * to, 0.55);
    this.lights.flash(
      this.aura.heroX,
      1.3,
      this.aura.heroZ + LIGHT_BEHIND,
      RGB[0] * 0.5,
      RGB[1] * 0.5,
      RGB[2] * 0.5,
      (1.3 + 0.35 * to) * FLASH_GAIN,
      Math.min(LIGHT_MAX_RADIUS, 4.5 * FLASH_RADIUS_GAIN),
      0.45,
    );
    if (to >= 3) this.punch(0.25, 0.0009, 0.009);
    if (to >= 4) this.postFlash(0.07, PINK, 120);
  }

  // ---------------------------------------------------------------- frame

  /** @hot `dt` is the already-dilated world dt (seconds). */
  update(dt: number, realDt: number): void {
    if (this.disposed) return;
    const t0 = this.bench ? performance.now() : 0;
    this.time += dt;
    const tier = this.world.qualityTier;
    if (tier !== this.qTier) {
      this.qTier = tier;
      this.poolA.used = POOL_A_USED[tier] as number;
      this.q = WORLD_Q[tier] as number;
    }
    if (!this.enabled) {
      this.world.postFx.effects.flash = 0;
      this.world.postFx.effects.vignetteBoost = 0;
      return;
    }
    this.heroPos();
    this.aura.bright = this.biomeBright();
    // follow the view upward when events were missed (attach mid-run, a mock that pre-seeds the streak);
    // downward changes always arrive as events (the view may be a frame stale)
    const v = this.view;
    if (v && this.downIn < 0) {
      if (v.keyStreakTier > this.aura.streak) this.aura.setStreakTier(v.keyStreakTier);
      if (v.comboTier > this.aura.combo) this.aura.setComboTier(v.comboTier);
    }
    // tier-up downbeat
    if (this.downIn >= 0) {
      this.downIn -= realDt;
      if (this.downIn < 0) this.downbeat();
    }
    // word timelines
    for (const w of this.words) {
      if (w.age < 0) continue;
      w.age += dt;
      while (w.charged < w.n && w.age >= fragmentArrivalSec(w.charged)) {
        this.blade.charge(1 / w.n);
        w.charged++;
      }
      if (!w.done && w.charged >= w.n) {
        w.done = true;
        this.wordLanded(w);
      }
      if (w.age > 1) w.age = -1;
    }
    // hero flash (ATB)
    if (this.flashT >= 0) {
      this.flashT += realDt;
      const u = this.flashT / 0.12;
      if (u >= 1) {
        this.flashT = -1;
        this.cb.actorFlash("hero", 0, [1, 1, 1]);
      } else this.cb.actorFlash("hero", (1 - u) * HERO_FLASH_MAX, [1.7, 1.6, 1.5]);
    }
    this.barrier.setHero(this.aura.heroX, this.aura.heroZ);
    this.barrier.setAegis(this.view?.hero.barrierCharges ?? 0);
    this.barrier.update(dt, this.time, this.settings);
    this.bolts.update(dt, this.time, this.settings);
    this.finisher.update(realDt, this.settings);
    this.aura.update(dt, this.time, this.settings, this.q, this.qTier);
    this.blade.update(dt, this.time, this.aura, this.settings);
    this.lights.update(dt);
    this.poolA.gain = this.world.additiveGain;
    this.poolA.glowGain = this.world.discGain;
    this.poolA.glowSize = this.world.discSize;
    this.poolA.update(dt);
    this.poolB.update(dt);
    this.poolA.upload();
    this.poolB.upload();
    // capped post flash
    const post = this.world.postFx.effects;
    // tier 3+: a touch more vignette focuses the eye on the hero and lets the light shapes pop on bright worlds
    const vTarget =
      this.settings.effectsIntensity > 0
        ? Math.max(0, this.aura.displayed - 0.4) * 2.4 * this.settings.effectsIntensity
        : 0;
    this.vig += (vTarget - this.vig) * Math.min(1, realDt * 4);
    post.vignetteBoost = this.vig;
    if (this.postFlashV > 0) {
      this.postFlashV = Math.max(0, this.postFlashV - realDt * this.postDecay * this.postFlashCap);
      post.flash = this.postFlashV;
      post.flashColor.set(this.postRgb[0], this.postRgb[1], this.postRgb[2]);
    } else post.flash = 0;
    if (this.bench) this.stats.worldMs += performance.now() - t0;
  }

  private wordLanded(w: WordTl): void {
    const k = this.settings.effectsIntensity;
    const el = ELEMENT_RGB[w.element] as Rgb;
    const col = w.perfect ? GOLD : el;
    this.blade.flare(w.perfect, col, Math.max(1, Math.round(6 * k * this.q)) + (w.perfect ? 4 : 0));
    const lc = w.perfect ? GOLD_LIGHT : (ELEMENT_LIGHT[w.element] as Rgb);
    this.lights.flash(
      this.blade.x,
      this.blade.y,
      this.aura.heroZ - 0.4,
      lc[0],
      lc[1],
      lc[2],
      (w.perfect ? 2.2 : 1.6) * FLASH_GAIN,
      Math.min(LIGHT_MAX_RADIUS, 3 * FLASH_RADIUS_GAIN),
      0.28,
    );
    if (w.owner >= 0 && this.anchors.enemy(w.owner, EN)) {
      let boss = false;
      if (this.view) for (const e of this.view.enemies) if (e.id === w.owner) boss = e.isBoss;
      this.blade.strike(EN.x, EN.y, w.perfect, col, boss ? 0.4 : 1);
    } else if (w.owner < 0) this.blade.strike(this.blade.x + 4, this.blade.y, w.perfect, col);
  }

  /** Counters for tests and the dev overlay. */
  diagnostics(): {
    auraLevel: number;
    auraTier: number;
    auraLight: number;
    poolA: number;
    poolB: number;
    poolAUsed: number;
    postFlash: number;
    vignette: number;
    lightsLive: number;
    boltsLaunched: number;
    boltsLive: number;
    barrier: number;
    finisherClock: number;
  } {
    const e = this.world.postFx.effects;
    return {
      auraLevel: this.aura.displayed,
      auraTier: this.aura.streak,
      auraLight: this.lights.aura.intensity,
      poolA: this.poolA.count,
      poolB: this.poolB.count,
      poolAUsed: this.poolA.used,
      postFlash: e.flash,
      vignette: e.vignetteBoost,
      lightsLive: this.lights.live,
      boltsLaunched: this.bolts.launched,
      boltsLive: this.bolts.count,
      barrier: this.barrier.intensity,
      finisherClock: this.finisher.clock,
    };
  }

  /** Bench hook: reset the timing counters. */
  resetStats(): void {
    this.stats.worldMs = 0;
    this.stats.keys = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lights.dispose();
    this.aura.dispose();
    this.blade.dispose();
    this.barrier.dispose();
    this.bolts.dispose();
    this.finisher.dispose();
    this.poolA.dispose();
    this.poolB.dispose();
    this.world.postFx.effects.flash = 0;
    this.world.postFx.effects.vignetteBoost = 0;
  }
}

/**
 * TypingHudFx: the HUD half of T2.6 "every keystroke is a spell" (Chunk A).
 * Owns the per-key reactions (letter pop, bounce, sparks, ATB streak), the streak tiers (tints,
 * embers, back-glow, tier-up), the typo reaction and the speed feedback. It draws through two
 * persistent HudEffects (one per layer) and the plate renderer (via `hud.plateFx`).
 *
 * Wiring: `const fx = new TypingHudFx(hud); fx.attach();` then forward every SimEvent to
 * `fx.onEvent(e)` (the same stream that goes to `hud.pushEvents`). Per-frame updates run through
 * `hud.onUpdate`, so the caller needs nothing else.
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import {
  elementIndex,
  fragmentArrivalSec,
  QUALITY_Q,
  STREAK_STYLE,
} from "../../../level/typingFxParams";
import type { HudEffect } from "../../fx";
import type { Hud } from "../../hud";
import { HERO_PANEL } from "../../panels";
import { buildGlowSprites, buildHaloSprites, type GlowSprites } from "./glowSprites";
import { GuardGlyphs } from "./guardGlyphs";
import {
  accentIndex,
  I_CYAN,
  I_ELEMENT,
  I_TEAL,
  I_TIER,
  I_WHITE,
  sparkIndex,
  TINT_KINDS,
} from "./palette";
import { mulberry32 } from "./pool";
import { PlateShatter } from "./shatter";
import {
  emitLetterSparks,
  K_EMBER,
  K_FLARE,
  K_GLINT,
  K_NOTE,
  K_SQ2,
  K_SQ3,
  L_ABOVE,
  L_ATB,
  L_BEHIND,
  type RectLike,
  type SparkEnv,
  SparkField,
} from "./sparks";
import { SpeedFx } from "./speedFx";
import { AtbStreaks } from "./streaks";
import { StreakTierFx } from "./tierFx";
import { applyTypo } from "./typoFx";
import { type OrbPayload, WordOrbs } from "./wordOrb";

export interface TypingFxOptions {
  seed?: number;
  quality?: 0 | 1 | 2;
}

export interface TypingFxStats {
  sparks: number;
  streaks: number;
  embers: number;
  rings: number;
  fragments: number;
  tier: number;
  heat: number;
  keys: number;
  handlerMs: number;
  updateMs: number;
  drawMs: number;
  handlerP95Ms: number;
  /** Share of timed handler calls that read >= 0.1 ms (one timer tick; ~5% is pure quantisation). */
  handlerOverTick: number;
  /** Draw time split by part (ms, bench only): edges, tier (glow/rings/embers), sparksBehind, sparksAbove, streaks, plate. */
  parts: Record<string, number>;
}

const R: RectLike = { x: 0, y: 0, w: 0, h: 0 };
const TIP = { x: 0, y: 0 };
const WTIP = { x: 0, y: 0 };
/** Lock-on / finisher ring radius cap (design px; polish #18). */
const RING_MAX = 120;
const ATBR = { x: 0, y: 0, w: 0, h: 0 };
const SAMPLES = 4096;

export class TypingHudFx {
  private readonly sparks = new SparkField();
  private readonly streaks = new AtbStreaks();
  private readonly tierFx = new StreakTierFx();
  private bossPlateOn = false;
  private readonly speed = new SpeedFx();
  readonly shatter = new PlateShatter();
  readonly guard = new GuardGlyphs();
  readonly orbs = new WordOrbs();
  /**
   * Word orb hand-off (spec 9.1, 120 ms): the orb's CSS-px position and what it is for. The world half
   * converts it with `screenToActionPlane` and launches the bolt.
   */
  onBolt: (x: number, y: number, p: OrbPayload) => void = () => {};
  /** impactTick of the live guard word per plate (late-snap compression). */
  private readonly guardImpact = new Map<number, number>();
  private sprites: GlowSprites = [];
  private halos: GlowSprites = [];
  /** ATB-filled white line flash age (s); -1 = idle. */
  private atbFlash = -1;
  private readonly env: SparkEnv;
  /** Finisher panel dim (alpha 1 -> 0.4 over 200 ms, back after `holdMs`). */
  private readonly panelDim = { v: 1, to: 1, holdMs: 0 };
  private view: LevelView | null = null;
  private enabled = true;
  private attached = false;
  private clock = 0;
  private lastTyped = -1;
  private lastTypedAt = -99;
  private quality: 0 | 1 | 2;
  private cleanups: (() => void)[] = [];
  private seed: number;
  // bench instrumentation
  private benching = false;
  private keys = 0;
  private handlerMs = 0;
  private updateMs = 0;
  private drawMs = 0;
  private readonly samples = new Float32Array(SAMPLES);
  private nSamples = 0;
  private parts: Record<string, number> = {};
  private lap(name: string, t0: number): number {
    const t = performance.now();
    this.parts[name] = (this.parts[name] ?? 0) + (t - t0);
    return t;
  }

  constructor(
    private readonly hud: Hud,
    opts: TypingFxOptions = {},
  ) {
    this.seed = opts.seed ?? 1;
    this.quality = opts.quality ?? 0;
    this.env = {
      S: 1,
      time: 0,
      k: 1,
      q: QUALITY_Q[this.quality] as number,
      reducedMotion: false,
      rng: mulberry32(this.seed),
    };
    this.streaks.onArrive = (tier, x, y, fat) => this.arrive(tier, x, y, fat);
    this.guard.onLand = (x, y) => this.guardSparks(x, y, 3, false);
    this.guard.onPop = (x, y) => this.guardSparks(x, y, 4, true);
    this.orbs.onLaunch = (x, y, p) => this.onBolt(x, y, p);
  }

  /** Azure sparks at a guard glyph (landing: 3, wall pop: 4 plus a white flare). */
  private guardSparks(x: number, y: number, n: number, pop: boolean): void {
    const env = this.env;
    if (env.k <= 0) return;
    const S = env.S;
    const m = Math.max(1, Math.round(n * env.k));
    for (let i = 0; i < m; i++) {
      const a = env.rng() * Math.PI * 2;
      const sp = (90 + env.rng() * 120) * S;
      this.sparks.add(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0,
        0.24,
        4,
        K_SQ2,
        I_ELEMENT + 5,
        L_ABOVE,
      );
    }
    if (pop) this.sparks.add(x, y, 0, 0, 0, 0.16, 26, K_FLARE, I_WHITE, L_ABOVE);
  }

  // ---------------------------------------------------------------- lifecycle

  /** Register the two draw layers and the update hook; the HUD stops doing its own pop/bounce/typo. */
  attach(): () => void {
    if (this.attached) return () => {};
    this.attached = true;
    this.sprites = buildGlowSprites();
    this.halos = buildHaloSprites();
    this.hud.setGhostOnComplete(false);
    const behind: HudEffect = {
      layer: "behind",
      life: Number.POSITIVE_INFINITY,
      draw: (c, f) => this.drawBehind(c, f.time),
    };
    const above: HudEffect = {
      layer: "above",
      life: Number.POSITIVE_INFINITY,
      draw: (c, f) => this.drawAbove(c, f.time),
    };
    this.hud.fx.add(behind);
    this.hud.fx.add(above);
    const off = this.hud.onUpdate((dt, view) => this.update(dt, view));
    this.hud.setTypingFxAttached(true);
    this.hud.setQuality(this.quality);
    const detach = (): void => {
      this.hud.fx.remove(behind);
      this.hud.fx.remove(above);
      off();
      this.hud.setTypingFxAttached(false);
      this.hud.setGhostOnComplete(true);
      this.attached = false;
    };
    this.cleanups.push(detach);
    return detach;
  }
  dispose(): void {
    for (const c of this.cleanups.splice(0)) c();
  }

  /** A/B switch for the readability capture: off = no typing VFX and no tints, same sim state. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.hud.plateFx.muted = !on;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  setQuality(q: 0 | 1 | 2): void {
    this.quality = q;
    this.env.q = QUALITY_Q[q] as number;
    this.hud.setQuality(q);
  }
  reseed(seed: number): void {
    this.seed = seed;
    this.env.rng = mulberry32(seed);
  }
  private clearAll(): void {
    this.sparks.clear();
    this.streaks.clear();
    this.tierFx.clear();
    this.speed.clear();
    this.shatter.clear();
    this.guard.clear();
    this.orbs.clear();
    this.guardImpact.clear();
    this.hud.setPanelAlpha(1);
    this.atbFlash = -1;
  }

  // ---------------------------------------------------------------- events

  /** @hot for CharCorrect: no allocation, no string building. */
  onEvent(e: SimEvent): void {
    if (!this.enabled) return;
    switch (e.type) {
      case "CharCorrect": {
        if (this.benching) {
          const t0 = performance.now();
          this.charCorrect(e);
          const dt = performance.now() - t0;
          this.handlerMs += dt;
          this.keys++;
          this.samples[this.nSamples++ % SAMPLES] = dt;
        } else this.charCorrect(e);
        break;
      }
      case "TargetAcquired":
        this.hud.plateFx.sweep(e.plateId);
        break;
      case "Typo":
        applyTypo(this.hud, e, this.view?.comboMode === "zen");
        this.speed.onTypo();
        if (e.kind === "guard" && e.plateId !== null) {
          this.guardTypo(e.plateId);
          this.guard.flicker();
        }
        break;
      case "WordCompleted":
        if (e.kind !== "guard") this.wordCompleted(e);
        break;
      case "AtbFilled":
        this.atbFilledHud();
        break;
      case "GuardWordShown":
        this.guardImpact.set(e.plateId, e.impactTick);
        break;
      case "GuardWordTyped": {
        const impact = this.guardImpact.get(e.plateId);
        const left = impact === undefined ? 1e9 : ((impact - (this.view?.tick ?? 0)) / 60) * 1000;
        // 100 ms snap + pop; compress when the impact is closer than 240 ms (done >= 40 ms before it)
        this.guard.snap(e.plateId, left < 240 ? Math.max(40, (left - 40) * 0.5) : 100);
        this.guardImpact.delete(e.plateId);
        break;
      }
      case "EnemyAttack":
        if (e.outcome === "hit") this.guard.crumbleOwner(e.enemyId);
        break;
      case "PlateRemoved":
        if (e.reason !== "completed") {
          this.guard.crumble(e.plateId);
          this.guardImpact.delete(e.plateId);
        }
        break;
      case "SentenceWordDone":
        this.sentenceWord(e);
        break;
      case "FinisherCompleted":
        this.panelDim.to = 0.4;
        this.panelDim.holdMs = 1600;
        break;
      case "KeyStreakTierChanged":
        this.tierChanged(e.from, e.to);
        break;
      case "BurstWpm":
        this.speed.onBurst(e.band, e.wpm);
        break;
      case "LevelStarted":
      case "LevelCleared":
      case "LevelFailed":
        this.clearAll();
        break;
      default:
        break;
    }
  }

  private charCorrect(e: Extract<SimEvent, { type: "CharCorrect" }>): void {
    const hud = this.hud;
    const env = this.env;
    const k = env.k;
    const v = this.view;
    const tier = e.keyStreakTier;
    let sentence = false;
    if (v)
      for (let i = 0; i < v.plates.length; i++) {
        const p = v.plates[i];
        if (p && p.id === e.plateId) {
          sentence = p.text.indexOf(" ") >= 0;
          break;
        }
      }
    const guard = e.kind === "guard";
    hud.plateFx.pop(e.plateId, e.index);
    if (k > 0)
      hud.plateFx.press(
        e.plateId,
        (STREAK_STYLE.bounceAmp[tier] as number) * k * (sentence ? 0.5 : 1),
      );
    this.lastTyped = e.plateId;
    this.lastTypedAt = this.clock;
    this.speed.onKey();
    if (!hud.getLetterRectInto(e.plateId, e.index, R)) return;
    const element = elementIndex(v?.hero.weaponDamageType);
    emitLetterSparks(this.sparks, env, R, tier, element, e.isLast, guard ? I_ELEMENT + 5 : -1);
    if (guard && k > 0 && v) {
      let len = e.index + 1;
      for (let i = 0; i < v.plates.length; i++) {
        const p = v.plates[i];
        if (p && p.id === e.plateId) {
          len = p.text.length;
          break;
        }
      }
      this.guard.add(e.plateId, e.ownerId ?? -1, e.index, len, R.x + R.w / 2, R.y, env.S);
    }
    if (!e.isLast && k >= 0.15 && !guard) {
      hud.getAtbTipInto(TIP);
      this.streaks.launch(R.x + R.w / 2, R.y, tier, e.plateId * 31 + e.index, false, TIP.x, TIP.y);
    }
  }

  private tierChanged(from: number, to: number): void {
    const hud = this.hud;
    if (to > from) {
      const id =
        this.view?.targetPlateId ?? (this.clock - this.lastTypedAt < 1.5 ? this.lastTyped : -1);
      let have = id >= 0 && hud.getPlateRectInto(id, R);
      if (!have) {
        // no plate (the last letter completed it): anchor to the key-streak bar in COMBO_AREA
        const S = this.env.S;
        R.x = (1280 - 220) * S;
        R.y = 222 * S;
        R.w = 190 * S;
        R.h = 14 * S;
        have = true;
      }
      this.tierFx.setTier(to);
      this.tierFx.tierUp(to, R, this.sparks, this.env, hud.getSettings().reducedFlash);
      if (id >= 0 && !hud.getSettings().reducedFlash && hud.getSettings().effectsIntensity > 0)
        hud.plateFx.flashBorder(id, 60, 200);
    } else this.tierFx.setTier(to);
  }

  /**
   * Word complete (5.1): frame flash, glyph fragments that burst and converge on the weapon, frame
   * shards, ring shockwave(s) (+ rays and glints when PERFECT), the fat ATB streak and the sparks that
   * the arrivals throw off at the weapon. The plate's ghost fade is suppressed (`setGhostOnComplete`).
   */
  private wordCompleted(e: Extract<SimEvent, { type: "WordCompleted" }>): void {
    const hud = this.hud;
    const env = this.env;
    const k = env.k;
    if (k <= 0) return;
    const PR: RectLike = { x: 0, y: 0, w: 0, h: 0 };
    if (!hud.getPlateRectInto(e.plateId, PR)) return;
    const S = env.S;
    const set = hud.getSettings();
    const tier = this.view?.keyStreakTier ?? 0;
    const perfect = e.perfect;
    const sentence = e.text.indexOf(" ") >= 0;
    const cx = PR.x + PR.w / 2;
    const cy = PR.y + PR.h / 2;
    const tinted = TINT_KINDS.has(e.kind);
    const mode = e.kind === "minigame" ? 1 : 0;
    const secondWind = e.kind === "secondWind";
    if (secondWind) hud.getHeroBodyInto(WTIP);
    else hud.getWeaponAnchorInto(WTIP);
    const plateId = e.plateId;
    const n = this.shatter.burst(
      PR,
      e.text,
      (i, out) => hud.getLetterRectInto(plateId, i, out),
      perfect,
      tier,
      tinted,
      { x: WTIP.x, y: WTIP.y, mode },
      sentence,
      env,
      secondWind ? I_TEAL : -1,
    );
    if (!set.reducedFlash) this.shatter.frameFlash(PR);
    const rings = this.tierFx;
    const accent = accentIndex(tier, env.time, 0, env.reducedMotion);
    const ra = k * (set.reducedFlash ? 0.5 : 1);
    if (perfect) {
      for (let i = 0; i < 3; i++)
        rings.addRing(
          cx,
          cy,
          Math.min(0.3 * PR.w, 40 * S),
          Math.min(1.9 * PR.w, RING_MAX * S),
          i * 0.05,
          0.38,
          6,
          1,
          0.9 * ra,
          I_TIER + 1,
        );
      this.shatter.rayBurst(
        PR,
        set.reducedFlash ? 0 : Math.round(16 * Math.max(0.5, k)),
        S,
        env.rng,
      );
    } else {
      rings.addRing(
        cx,
        cy,
        Math.min(0.3 * PR.w, 36 * S),
        Math.min(1.25 * PR.w, 100 * S),
        0,
        0.38,
        6,
        1,
        0.9 * 0.6 * ra,
        secondWind ? I_TEAL : accent,
      );
    }
    if (perfect) {
      const R: RectLike = { x: 0, y: 0, w: 0, h: 0 };
      for (let i = 0; i < e.text.length; i++) {
        if (e.text.charCodeAt(i) === 32 || !hud.getLetterRectInto(plateId, i, R)) continue;
        const a = -Math.PI / 2 + (env.rng() * 2 - 1) * 1.2;
        const sp = (90 + env.rng() * 110) * S;
        this.sparks.add(
          R.x + R.w / 2,
          R.y + R.h / 2,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          0,
          0.4,
          6,
          K_GLINT,
          I_TIER + 1,
          L_ABOVE,
        );
      }
    }
    if (!secondWind) {
      hud.getAtbTipInto(TIP);
      this.streaks.launch(cx, cy, tier, e.plateId * 31 + 977, true, TIP.x, TIP.y);
    }
    if (mode === 0) {
      const col = perfect
        ? I_TIER + 1
        : sparkIndex(tier, elementIndex(this.view?.hero.weaponDamageType));
      for (let i = 0; i < n; i++) {
        const t = fragmentArrivalSec(i);
        for (let j = 0; j < 2; j++) {
          const a = env.rng() * Math.PI * 2;
          const sp = (110 + env.rng() * 150) * S;
          this.sparks.add(
            WTIP.x,
            WTIP.y,
            Math.cos(a) * sp,
            Math.sin(a) * sp - 40 * S,
            -t,
            0.26,
            j === 0 ? 4 : 6,
            j === 0 ? K_SQ2 : K_SQ3,
            col,
            L_ABOVE,
          );
        }
        this.sparks.add(
          WTIP.x,
          WTIP.y,
          0,
          0,
          -t,
          0.14,
          12 * (perfect ? 1.4 : 1),
          K_FLARE,
          perfect ? I_TIER + 1 : I_WHITE,
          L_BEHIND,
        );
      }
      this.sparks.add(
        WTIP.x,
        WTIP.y,
        0,
        0,
        -fragmentArrivalSec(Math.max(0, n - 1)),
        0.26,
        perfect ? 46 : 34,
        K_NOTE,
        perfect ? I_TIER + 1 : accent,
        L_ABOVE,
      );
    }
  }

  /** SentenceWordDone (spec 9.1): the finished word's letters collapse into an orb that goes to the world. */
  private sentenceWord(e: Extract<SimEvent, { type: "SentenceWordDone" }>): void {
    const env = this.env;
    if (env.k <= 0) return;
    const v = this.view;
    let text = "";
    if (v)
      for (let i = 0; i < v.plates.length; i++) {
        const p = v.plates[i];
        if (p && p.id === e.plateId) {
          text = p.text;
          break;
        }
      }
    if (!text) return;
    let from = 0;
    let w = 0;
    for (; w < e.wordIndex; w++) {
      const sp = text.indexOf(" ", from);
      if (sp < 0) break;
      from = sp + 1;
    }
    let to = text.indexOf(" ", from);
    if (to < 0) to = text.length;
    let n = 0;
    for (let i = from; i < to && n < 16; i++) {
      if (!this.hud.getLetterRectInto(e.plateId, i, R)) continue;
      this.letterXY[n * 2] = R.x + R.w / 2;
      this.letterXY[n * 2 + 1] = R.y + R.h / 2;
      n++;
    }
    if (n === 0) return;
    const doom = e.kind === "doom";
    this.orbs.start(
      this.letterXY,
      n,
      e.kind === "secondWind" ? I_TEAL : doom ? I_ELEMENT + 3 : I_TIER + 1,
      {
        plateId: e.plateId,
        kind: e.kind,
        wordIndex: e.wordIndex,
        wordCount: e.wordCount,
        final: e.wordIndex >= e.wordCount - 1,
        exitY: this.hud.getPlateRectInto(e.plateId, R) ? R.y + R.h + 6 * env.S : 0,
      },
    );
  }
  private readonly letterXY = new Float32Array(32);

  /** Guard typo cue (spec 6, art-direction fix): white-cyan sparks and a ring from the plate frame. */
  private guardTypo(plateId: number): void {
    const hud = this.hud;
    const env = this.env;
    const k = env.k;
    if (k <= 0) return;
    const PR: RectLike = { x: 0, y: 0, w: 0, h: 0 };
    if (!hud.getPlateRectInto(plateId, PR)) return;
    const S = env.S;
    const n = Math.round(16 * k * env.q);
    for (let i = 0; i < n; i++) {
      const top = i % 2 === 0;
      const x = PR.x + env.rng() * PR.w;
      const y = top ? PR.y : PR.y + PR.h;
      const a = (top ? -Math.PI / 2 : Math.PI / 2) + (env.rng() * 2 - 1) * 0.9;
      const sp = (140 + env.rng() * 180) * S;
      this.sparks.add(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0,
        0.3,
        6,
        i % 4 === 0 ? K_GLINT : K_SQ3,
        I_CYAN,
        L_ABOVE,
      );
    }
    if (!hud.getSettings().reducedFlash)
      this.tierFx.addRing(
        PR.x + PR.w / 2,
        PR.y + PR.h / 2,
        0.4 * PR.w,
        1.05 * PR.w,
        0,
        0.3,
        5,
        1,
        0.85 * k,
        I_CYAN,
      );
  }

  /** ATB filled (HUD half of spec 7): a white line flash along the bar and 10 rising embers. */
  private atbFilledHud(): void {
    const env = this.env;
    if (env.k <= 0) return;
    this.atbFlash = 0;
    const hud = this.hud;
    hud.getAtbRectInto(ATBR);
    const S = env.S;
    const el = I_ELEMENT + elementIndex(this.view?.hero.weaponDamageType);
    const n = Math.round(10 * env.k);
    for (let i = 0; i < n; i++) {
      const x = ATBR.x + ATBR.w * (0.15 + 0.85 * ((i + env.rng() * 0.8) / n));
      this.sparks.add(
        x,
        ATBR.y,
        (env.rng() - 0.5) * 16 * S,
        -(40 + env.rng() * 50) * S,
        0,
        0.5,
        4,
        K_EMBER,
        el,
        L_BEHIND,
      );
    }
  }

  /** A streak reached the ATB bar: pulse, tip flare and tip sparks (§2.3). */
  private arrive(tier: number, x: number, y: number, fat: boolean): void {
    const env = this.env;
    this.hud.pulseAtb(fat ? 1 : Math.min(0.85, 0.35 + 0.1 * tier));
    const col = accentIndex(tier, env.time, 0, env.reducedMotion);
    this.sparks.add(x, y, 0, 0, 0, 0.12, 16, K_FLARE, col, L_ATB);
    const S = env.S;
    const n = Math.round(4 * env.k);
    for (let i = 0; i < n; i++) {
      const a = env.rng() * Math.PI * 2;
      const sp = (80 + env.rng() * 80) * S;
      this.sparks.add(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0,
        0.15,
        2,
        K_SQ2,
        sparkIndex(tier, 0),
        L_ATB,
      );
    }
  }

  // ---------------------------------------------------------------- frame

  private update(dt: number, view: LevelView): void {
    if (!this.enabled) {
      this.view = view;
      return;
    }
    const t0 = this.benching ? performance.now() : 0;
    const hud = this.hud;
    const set = hud.getSettings();
    const env = this.env;
    this.view = view;
    this.clock += dt;
    env.time = this.clock;
    env.S = hud.getScale();
    env.k = set.effectsIntensity;
    env.reducedMotion = set.reducedMotion;
    if (view.keyStreakTier !== this.tierFx.tier && !this.tierFx.fading)
      this.tierFx.snapTier(view.keyStreakTier);

    // plate the embers / back-glow hug: the target, or the last typed plate for 1.5 s after
    let id = view.targetPlateId ?? -1;
    if (id < 0 && this.clock - this.lastTypedAt < 1.5) id = this.lastTyped;
    let plateKind = "";
    let alive = false;
    for (let i = 0; i < view.plates.length; i++) {
      const p = view.plates[i];
      if (p && p.id === id) {
        plateKind = p.kind;
        alive = true;
      }
    }
    this.tierFx.plateAlive = alive;
    this.bossPlateOn = !!view.boss;
    this.tierFx.hasRect =
      id >= 0 && plateKind !== "guard" && hud.getPlateRectInto(id, this.tierFx.rect);

    // tints for every visible plate of an allowed kind
    for (let i = 0; i < view.plates.length; i++) {
      const p = view.plates[i];
      if (p) hud.plateFx.setTint(p.id, this.tierFx.tintFor(p.kind));
    }

    hud.getAtbTipInto(TIP);
    this.sparks.update(dt, env.S);
    this.streaks.update(dt, TIP.x, TIP.y);
    this.tierFx.update(dt, env, set.reducedMotion, () => hud.triggerTierFlash());
    this.speed.update(dt);
    this.shatter.update(dt, env.S);
    hud.getWeaponAnchorInto(WTIP);
    this.guard.cx = WTIP.x;
    this.guard.cy = WTIP.y;
    this.guard.update(dt, env.S);
    this.orbs.update(dt);
    // finisher panel dim: 200 ms in, back to 1 after the hold
    const pd = this.panelDim;
    if (pd.holdMs > 0) {
      pd.holdMs -= dt * 1000;
      if (pd.holdMs <= 0) pd.to = 1;
    }
    if (pd.v !== pd.to) {
      const step = (dt / 0.2) * 0.6;
      pd.v = pd.v < pd.to ? Math.min(pd.to, pd.v + step) : Math.max(pd.to, pd.v - step);
      hud.setPanelAlpha(pd.v);
    }
    if (this.atbFlash >= 0) {
      this.atbFlash += dt;
      if (this.atbFlash > 0.12) this.atbFlash = -1;
    }
    hud.setGhostOnComplete(env.k <= 0);
    if (this.benching) this.updateMs += performance.now() - t0;
  }

  private drawBehind(c: CanvasRenderingContext2D, time: number): void {
    if (!this.enabled) return;
    const t0 = this.benching ? performance.now() : 0;
    const hud = this.hud;
    const set = hud.getSettings();
    const S = hud.getScale();
    let tp = this.benching ? performance.now() : 0;
    c.globalCompositeOperation = "source-over";
    this.speed.drawEdges(
      c,
      hud.getCssW(),
      hud.getCssH(),
      S,
      time,
      set.effectsIntensity,
      this.env.q,
      set.reducedFlash,
      set.reducedMotion,
    );
    if (this.benching) tp = this.lap("edges", tp);
    this.tierFx.setPanels(S, this.bossPlateOn);
    this.tierFx.draw(c, S, time, this.sprites, this.halos, !set.reducedFlash, set.reducedMotion);
    if (this.benching) tp = this.lap("tier", tp);
    this.sparks.draw(c, L_BEHIND, S, this.sprites);
    if (this.sparks.hasLayer(L_ATB)) {
      // arrival sparks / flare: clipped to the ATB bar rect so nothing lands on the HP bar or its text
      hud.getAtbRectInto(ATBR);
      c.save();
      c.beginPath();
      c.rect(ATBR.x - 6 * S, ATBR.y - 5 * S, ATBR.w + 12 * S, ATBR.h + 9 * S);
      c.clip();
      this.sparks.draw(c, L_ATB, S, this.sprites);
      c.restore();
    }
    if (this.benching) tp = this.lap("sparksBehind", tp);
    c.globalCompositeOperation = "source-over";
    this.shatter.drawBehind(c, S, set.reducedFlash, set.effectsIntensity);
    if (this.benching) tp = this.lap("shatterBehind", tp);
    if (this.atbFlash >= 0 && !set.reducedFlash) {
      const u = this.atbFlash / 0.12;
      hud.getAtbRectInto(ATBR);
      c.globalAlpha = (1 - u) * Math.min(1, set.effectsIntensity + 0.2);
      c.fillStyle = "#ffffff";
      c.fillRect(ATBR.x - 2 * S, ATBR.y - 1 * S, ATBR.w + 4 * S, ATBR.h + 2 * S);
    }
    c.globalAlpha = 1;
    if (this.speed.plateLive) {
      c.save();
      c.scale(S, S);
      this.speed.drawPlate(c, 1280, time, set.reducedFlash, set.reducedMotion, hud.getCssW(), S);
      c.restore();
    }
    if (this.benching) this.drawMs += performance.now() - t0;
  }

  private drawAbove(c: CanvasRenderingContext2D, time: number): void {
    if (!this.enabled) return;
    const t0 = this.benching ? performance.now() : 0;
    const hud = this.hud;
    const set = hud.getSettings();
    const S = hud.getScale();
    let tp = this.benching ? performance.now() : 0;
    c.globalCompositeOperation = "source-over";
    this.sparks.draw(c, L_ABOVE, S, this.sprites);
    if (this.benching) tp = this.lap("sparksAbove", tp);
    if (this.guard.count > 0)
      this.guard.draw(
        c,
        S,
        time,
        set.effectsIntensity,
        set.reducedMotion,
        this.sprites,
        I_ELEMENT + 5,
      );
    if (this.orbs.count > 0) this.orbs.draw(c, S, this.sprites, set.effectsIntensity);
    this.shatter.drawAbove(c, S, this.sprites, set.effectsIntensity);
    c.globalCompositeOperation = "source-over";
    if (this.benching) tp = this.lap("shatter", tp);
    if (this.streaks.count > 0) {
      // never over the HP bar / name / HP text: clip the hero panel above the ATB bar out of the streak layer
      hud.getAtbRectInto(ATBR);
      const hp = HERO_PANEL;
      const cut = (hp.y + 0) * S;
      c.save();
      c.beginPath();
      c.rect(-4, -4, 16384, 16384);
      c.rect(hp.x * S, cut, hp.w * S, ATBR.y - 7 * S - cut);
      c.clip("evenodd");
      this.streaks.draw(
        c,
        { S, time, k: set.effectsIntensity, q: this.quality, reducedMotion: set.reducedMotion },
        TIP.x,
        TIP.y,
        this.sprites,
      );
      c.restore();
    }
    if (this.benching) this.lap("streaks", tp);
    c.globalAlpha = 1;
    if (this.benching) this.drawMs += performance.now() - t0;
  }

  // ---------------------------------------------------------------- diagnostics

  startBench(): void {
    this.benching = true;
    this.keys = 0;
    this.handlerMs = 0;
    this.updateMs = 0;
    this.drawMs = 0;
    this.nSamples = 0;
    this.parts = {};
  }
  stopBench(): void {
    this.benching = false;
  }
  stats(): TypingFxStats {
    const n = Math.min(this.nSamples, SAMPLES);
    const s = Array.from(this.samples.subarray(0, n)).sort((a, b) => a - b);
    return {
      sparks: this.sparks.count,
      streaks: this.streaks.count,
      embers: this.tierFx.embers.count,
      rings: this.tierFx.rings.count,
      fragments: this.shatter.fragments,
      tier: this.tierFx.tier,
      heat: this.speed.heat,
      keys: this.keys,
      handlerMs: this.handlerMs,
      updateMs: this.updateMs,
      drawMs: this.drawMs,
      handlerP95Ms: n ? (s[Math.floor(n * 0.95)] as number) : 0,
      parts: { ...this.parts },
      handlerOverTick: n ? s.filter((v) => v >= 0.0999).length / n : 0,
    };
  }
}

/**
 * HUD: draws on the 2D canvas above WebGL. Consumes ONLY `LevelView` (each frame) and `SimEvent`s
 * (transient effects). Never mutates sim state. All public coordinates are CSS pixels.
 */
import type { EnemyView, LevelView, PlateView, SimEvent } from "@hd2d/sim";
import { BannerSystem, drawBanner } from "./banners";
import type { Ctx } from "./draw";
import { clamp, eOut, txt } from "./draw";
import { EffectLayers, PlateFx } from "./fx";
import type { LayoutBox, Rect } from "./layout";
import { newLayoutState, solveLayout } from "./layout";
import type { EnemyBarState, PanelCtx } from "./panels";
import {
  BOSS_PLATE_W,
  bossPlateRect,
  COMBO_AREA,
  drawBossPlate,
  drawComboDisplay,
  drawEnemyBars,
  drawHeroPanel,
  drawSkill,
  drawStatsPanel,
  drawTopLabel,
  ENEMY_BAR_W,
  enemyBarsRect,
  HERO_PANEL,
  heroAtbRect,
  SKILL_AREA,
  STATS_PANEL_W,
  skillCenter,
  TOP_LABEL_RECT,
} from "./panels";
import type { PlateGeom } from "./plates";
import { drawPlate, measurePlate } from "./plates";
import type { Pop, PopAnchor, PopKind } from "./pops";
import { PopSystem, popAlpha, popScale } from "./pops";
import type { HudSettings } from "./settings";
import { DEFAULT_HUD_SETTINGS, normalizeSettings } from "./settings";
import type { PlatePalette } from "./theme";
import {
  contrastRatio,
  FONT_DISP,
  FONT_UI,
  keyStreakColor,
  PLATE_PALETTES,
  palettePlateContrast,
  relLuminance,
} from "./theme";

// ---------------------------------------------------------------- public types

export type HudAnchorPart = "head" | "body" | "feet";
/** What the HUD asks the renderer to project: an enemy/hero body part. */
export type HudAnchor =
  | { kind: "enemy"; id: number; slot: number; part: HudAnchorPart }
  | { kind: "hero"; part: HudAnchorPart };
/** Returns CSS-pixel screen position (canvas space) or null when off-screen / unknown. */
export type HudProjector = (a: HudAnchor) => { x: number; y: number } | null;

/** Notices for T2.6: fired AFTER the HUD resolved the rects, so effects can anchor to them. */
export type HudNotice =
  | {
      type: "letterTyped";
      plateId: number;
      index: number;
      char: string;
      rect: Rect | null;
      keyStreakTier: number;
      combo: number;
      isLast: boolean;
    }
  | { type: "typo"; plateId: number | null; index: number; rect: Rect | null }
  | {
      type: "plateCompleted";
      plateId: number;
      kind: string;
      rect: Rect | null;
      perfect: boolean;
      text: string;
    }
  | { type: "plateRemoved"; plateId: number; reason: string; rect: Rect | null }
  | { type: "atbFilled"; anchor: { x: number; y: number } }
  | { type: "tierChanged"; which: "combo" | "keyStreak"; to: number };

export interface HudDebugPlate {
  id: number;
  kind: string;
  isTarget: boolean;
  /** Whole box incl. label row, badge and timer strip (CSS px). */
  rect: Rect;
  /** Text frame only. */
  frameRect: Rect;
  /** Effective glyph font px (design px * scale). */
  fontPx: number;
  letters: Rect[];
  /** Worst letter-vs-plate contrast ratio. */
  contrast: number;
}
export interface HudDebugSnapshot {
  viewport: { w: number; h: number; dpr: number; scale: number };
  plates: HudDebugPlate[];
  pops: number;
  fx: number;
  banners: number;
  frame: { avgMs: number; p95Ms: number; maxMs: number; count: number };
}

interface PlateEntry {
  geom: PlateGeom;
  box: Rect; // design px
  letters: Rect[]; // design px
  seenAt: number;
}
interface Ghost {
  geom: PlateGeom;
  box: Rect;
  age: number;
  dur: number;
}

const FRAME_SAMPLES = 240;

export class Hud {
  readonly fx = new EffectLayers();
  readonly plateFx = new PlateFx();
  readonly pops = new PopSystem();
  readonly banners = new BannerSystem();

  private c: Ctx;
  private dpr = 1;
  private cssW = 1280;
  private cssH = 720;
  private s = 1;
  private W = 1280;
  private H = 720;
  private settings: HudSettings = { ...DEFAULT_HUD_SETTINGS };
  private projector: HudProjector | null = null;
  private listeners: ((n: HudNotice) => void)[] = [];

  private time = 0;
  private view: LevelView | null = null;
  private prev: LevelView | null = null;
  private alpha = 1;
  private layoutState = newLayoutState();
  private entries = new Map<number, PlateEntry>();
  private lastRects = new Map<number, { rect: Rect; t: number }>();
  private ghosts: Ghost[] = [];
  private heroTrail = 1;
  private enemyTrail = new Map<number, number>();
  private atbPulse = 0;
  private atbIgnite = 0;
  private comboPulse = 0;
  private tierFlash = 0;
  private typoFlash = 0;
  private hurtFlash = 0;
  private frameMs: number[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("HUD: 2D context unavailable");
    this.c = c;
    this.resize(
      canvas.clientWidth || 1280,
      canvas.clientHeight || 720,
      window.devicePixelRatio || 1,
    );
  }

  // ---------------------------------------------------------------- configuration

  /** CSS size of the canvas and device pixel ratio. Call on window resize. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = Math.min(2, Math.max(1, dpr));
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.s = cssW / 1280;
    this.W = 1280;
    this.H = cssH / this.s;
    this.layoutState = newLayoutState();
  }

  setSettings(s: Partial<HudSettings>): void {
    this.settings = normalizeSettings(s, this.settings);
    this.plateFx.settings = this.settings;
  }
  getSettings(): Readonly<HudSettings> {
    return this.settings;
  }
  /** Renderer-owned: maps enemy/hero anchors to CSS-px screen positions. */
  setProjector(p: HudProjector | null): void {
    this.projector = p;
  }
  onNotice(cb: (n: HudNotice) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
  private emit(n: HudNotice): void {
    for (const l of this.listeners) l(n);
  }

  reset(): void {
    this.pops.clear();
    this.banners.clear();
    this.fx.clear();
    this.plateFx.clear();
    this.entries.clear();
    this.ghosts.length = 0;
    this.lastRects.clear();
    this.enemyTrail.clear();
    this.layoutState = newLayoutState();
    this.heroTrail = 1;
  }

  // ---------------------------------------------------------------- queries (CSS px)

  getPlateRect(plateId: number): Rect | null {
    const e = this.entries.get(plateId);
    if (e) return this.toCss(e.box);
    const l = this.lastRects.get(plateId);
    return l ? l.rect : null;
  }
  /** Rect of glyph cell `index` of a plate (the glyph plus its underline row), CSS px. */
  getLetterRect(plateId: number, index: number): Rect | null {
    const r = this.entries.get(plateId)?.letters[index];
    return r ? this.toCss(r) : null;
  }
  getLetterRects(plateId: number): Rect[] {
    const e = this.entries.get(plateId);
    return e ? e.letters.map((r) => this.toCss(r)) : [];
  }
  /** Screen anchor of the hero ATB gauge: fill tip (for streaks that "arrive" at the bar) + the bar rect. */
  getAtbAnchor(): { x: number; y: number; rect: Rect; frac: number } {
    const r = heroAtbRect();
    const frac = this.view?.hero.atbFrac ?? 0;
    return {
      x: (r.x + r.w * clamp(frac, 0, 1)) * this.s,
      y: (r.y + r.h / 2) * this.s,
      rect: this.toCss(r),
      frac,
    };
  }
  getSkillAnchor(slot: 0 | 1): { x: number; y: number; r: number } {
    const c = skillCenter(slot, this.H);
    return { x: c.x * this.s, y: c.y * this.s, r: 32 * this.s };
  }
  getHeroAnchor(): { x: number; y: number } {
    return this.resolveAnchor({ kind: "hero" }) ?? { x: 360 * this.s, y: 440 * this.s };
  }
  /** Briefly pulse the ATB bar (T2.6: call when a letter streak arrives). */
  pulseAtb(strength = 1): void {
    this.atbPulse = Math.max(this.atbPulse, strength);
  }

  private toCss(r: Rect): Rect {
    return { x: r.x * this.s, y: r.y * this.s, w: r.w * this.s, h: r.h * this.s };
  }

  // ---------------------------------------------------------------- events

  pushEvents(events: readonly SimEvent[]): void {
    for (const e of events) this.pushEvent(e);
  }

  pushEvent(e: SimEvent): void {
    const v = this.view;
    switch (e.type) {
      case "LevelStarted":
        this.reset();
        break;
      case "EncounterStarted":
        if (!e.isBoss) this.banners.show("enc", "ENCOUNTER", e.name, 1.8);
        break;
      case "WaveStarted":
        if (e.waveIndex > 0) this.banners.show("wave", `WAVE ${e.waveIndex + 1}`, "", 1.5);
        break;
      case "BossIntroStarted":
        this.banners.show(
          "boss",
          e.name.toUpperCase(),
          e.title,
          Math.max(1.8, (e.untilTick - e.tick) / 60),
        );
        break;
      case "LevelCleared":
        this.banners.show("victory", "LEVEL CLEAR", `+${e.gold} GOLD`, 3.2);
        break;
      case "LevelFailed":
        this.banners.show("fail", "DEFEATED", e.reason.toUpperCase(), 3.2);
        break;
      case "HeroDowned":
        this.banners.show("down", "DOWN", e.secondWindAvailable ? "TYPE TO RISE AGAIN" : "", 2.0);
        break;
      case "SecondWindStarted":
        this.banners.show("down", "SECOND WIND", "TYPE THE WORD TO RISE", 2.2);
        break;
      case "CharCorrect": {
        this.plateFx.popLetter(e.plateId, e.index, { scale: 0.45, dur: 0.2, flash: 1 });
        this.plateFx.bounce(e.plateId, 3);
        this.comboPulse = 1;
        this.emit({
          type: "letterTyped",
          plateId: e.plateId,
          index: e.index,
          char: e.char,
          rect: this.getLetterRect(e.plateId, e.index),
          keyStreakTier: e.keyStreakTier,
          combo: e.combo,
          isLast: e.isLast,
        });
        break;
      }
      case "Typo": {
        if (e.plateId !== null) {
          this.plateFx.popLetter(e.plateId, e.index, {
            scale: 0.15,
            dur: 0.3,
            flash: 0,
            glitch: 1,
          });
          this.plateFx.shake(e.plateId, 4, 0.25);
          this.plateFx.crack(e.plateId, e.index);
        }
        this.typoFlash = 1;
        this.emit({
          type: "typo",
          plateId: e.plateId,
          index: e.index,
          rect: e.plateId === null ? null : this.getLetterRect(e.plateId, e.index),
        });
        break;
      }
      case "WordCompleted": {
        const rect = this.getPlateRect(e.plateId);
        if (e.perfect && rect)
          this.pops.spawn("perfect", "PERFECT", {
            kind: "screen",
            x: rect.x + rect.w / 2,
            y: rect.y - 6,
          });
        else if (e.swift && rect)
          this.pops.spawn("tag", "SWIFT", {
            kind: "screen",
            x: rect.x + rect.w / 2,
            y: rect.y - 6,
          });
        this.comboPulse = 1;
        this.emit({
          type: "plateCompleted",
          plateId: e.plateId,
          kind: e.kind,
          rect,
          perfect: e.perfect,
          text: e.text,
        });
        break;
      }
      case "PlateRemoved": {
        const entry = this.entries.get(e.plateId);
        const rect = this.getPlateRect(e.plateId);
        if (entry && (e.reason === "completed" || e.reason === "expired"))
          this.ghosts.push({ geom: entry.geom, box: { ...entry.box }, age: 0, dur: 0.32 });
        this.emit({ type: "plateRemoved", plateId: e.plateId, reason: e.reason, rect });
        break;
      }
      case "Hit": {
        const enemy = v?.enemies.find((x) => x.id === e.targetId);
        if (!enemy && e.targetId === 0) break;
        const anchor: PopAnchor = { kind: "enemy", id: e.targetId };
        if (e.kind === "chip" || e.kind === "dot") {
          this.pops.spawn("chip", String(e.damage), anchor, 0.8);
          break;
        }
        this.pops.spawn(
          e.crit ? "crit" : "dmg",
          String(e.damage),
          anchor,
          e.kind === "skill" ? 1.15 : 1,
        );
        if (e.weak) this.pops.spawn("weak", "WEAK", anchor);
        if (e.crit) this.pops.spawn("tag", "CRIT", anchor);
        break;
      }
      case "Break":
        this.pops.spawn("break", "BREAK", { kind: "enemy", id: e.enemyId });
        break;
      case "WeaknessRevealed":
        this.pops.spawn("weak", `${e.damageType.toUpperCase()} WEAK`, {
          kind: "enemy",
          id: e.enemyId,
        });
        break;
      case "GuardBlocked":
        this.pops.spawn("block", "BLOCK", { kind: "hero" });
        break;
      case "GuardParried":
        this.pops.spawn("parry", "PARRY!", { kind: "hero" });
        break;
      case "HeroDamaged":
        if (!e.blocked) {
          this.pops.spawn("hurt", `-${e.damage}`, { kind: "hero" });
          this.hurtFlash = 1;
        }
        break;
      case "HeroHealed":
        this.pops.spawn("heal", `+${e.amount}`, { kind: "hero" });
        break;
      case "SkillCast":
        this.pops.spawn("skill", e.skillId.replace(/([A-Z])/g, " $1").toUpperCase(), {
          kind: "hero",
        });
        break;
      case "GoldGained":
        this.pops.spawn("gold", `+${e.amount} G`, { kind: "hero" });
        break;
      case "AtbFilled":
        this.atbIgnite = 1;
        this.emit({ type: "atbFilled", anchor: this.getAtbAnchor() });
        break;
      case "ComboTierChanged":
        this.tierFlash = 1;
        this.emit({ type: "tierChanged", which: "combo", to: e.to });
        break;
      case "KeyStreakTierChanged":
        this.tierFlash = 1;
        this.emit({ type: "tierChanged", which: "keyStreak", to: e.to });
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- frame

  /** One call per frame. `alpha` interpolates between the previous and current view tick. */
  render(view: LevelView, alpha: number, dt: number): void {
    const t0 = performance.now();
    this.update(view, alpha, dt);
    this.draw();
    const ms = performance.now() - t0;
    this.frameMs.push(ms);
    if (this.frameMs.length > FRAME_SAMPLES) this.frameMs.shift();
  }

  /** State-only step (no drawing); used to fast-forward in tests/mocks. */
  update(view: LevelView, alpha: number, dt: number): void {
    if (this.view !== view) {
      if (!this.view || this.view.tick !== view.tick) this.prev = this.view;
      this.view = view;
    }
    this.alpha = clamp(alpha, 0, 1);
    this.time += dt;
    this.pops.update(dt);
    this.banners.update(dt);
    this.fx.update(dt);
    this.plateFx.update(dt);
    for (const g of this.ghosts) g.age += dt;
    this.ghosts = this.ghosts.filter((g) => g.age < g.dur);
    this.atbPulse = Math.max(0, this.atbPulse - dt * 4);
    this.atbIgnite = Math.max(0, this.atbIgnite - dt * 1.5);
    this.comboPulse = Math.max(0, this.comboPulse - dt * 5);
    this.tierFlash = Math.max(0, this.tierFlash - dt * 2.5);
    this.typoFlash = Math.max(0, this.typoFlash - dt * 3.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    // HP trails: white bar lags behind the real value
    const hp = view.hero.hpFrac;
    this.heroTrail = hp > this.heroTrail ? hp : Math.max(hp, this.heroTrail - dt * 0.4);
    for (const e of view.enemies) {
      const tr = this.enemyTrail.get(e.id) ?? e.hpFrac;
      this.enemyTrail.set(e.id, e.hpFrac > tr ? e.hpFrac : Math.max(e.hpFrac, tr - dt * 0.5));
    }
  }

  private lerpPrev(cur: number, pick: (v: LevelView) => number | undefined): number {
    const p = this.prev ? pick(this.prev) : undefined;
    return p === undefined ? cur : p + (cur - p) * this.alpha;
  }

  private resolveAnchor(a: HudAnchor | { kind: "hero" }): { x: number; y: number } | null {
    const full: HudAnchor = a.kind === "hero" ? { kind: "hero", part: "body" } : a;
    return this.projector ? this.projector(full) : null;
  }

  /** Anchor in design px, with a slot-based fallback when there is no projector. */
  private anchorDesign(e: EnemyView, part: HudAnchorPart): { x: number; y: number } {
    const p = this.resolveAnchor({ kind: "enemy", id: e.id, slot: e.slot, part });
    if (p) return { x: p.x / this.s, y: p.y / this.s };
    const x = 520 + e.slot * 230;
    const y = part === "head" ? this.H * 0.5 : part === "body" ? this.H * 0.6 : this.H * 0.72;
    return { x, y };
  }

  private popAnchorCss(a: PopAnchor): { x: number; y: number } {
    if (a.kind === "screen") return { x: a.x, y: a.y };
    if (a.kind === "hero") {
      const h = this.resolveAnchor({ kind: "hero" });
      return h ?? { x: 300 * this.s, y: this.H * 0.62 * this.s };
    }
    const en = this.view?.enemies.find((x) => x.id === a.id);
    if (en) {
      const p = this.anchorDesign(en, "body");
      return { x: p.x * this.s, y: p.y * this.s };
    }
    return { x: 640 * this.s, y: this.H * 0.55 * this.s };
  }

  private draw(): void {
    const view = this.view;
    const c = this.c;
    const { dpr, s, W, H } = this;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!view) return;
    const set = this.settings;
    const nowTick = view.tick + this.alpha;
    const hudVisible = view.phase !== "cleared" || this.banners.banners.length > 0;

    // ---- plates: measure, layout
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    const geoms = new Map<number, PlateGeom>();
    const boxes: LayoutBox[] = [];
    const avoid: Rect[] = [
      { ...HERO_PANEL },
      { x: W - 22 - STATS_PANEL_W, y: 18, w: STATS_PANEL_W, h: 104 },
      COMBO_AREA(W),
      SKILL_AREA(H),
    ];
    const boss = view.boss
      ? view.enemies.find((e) => e.id === view.boss?.enemyId && e.alive)
      : undefined;
    if (boss) avoid.push({ ...bossPlateRect(W), h: bossPlateRect(W).h + 22 });
    else avoid.push(TOP_LABEL_RECT(W));
    for (const e of view.enemies) {
      if (!e.alive || e.isBoss) continue;
      const f = this.anchorDesign(e, "feet");
      avoid.push(enemyBarsRect(f.x, f.y));
    }
    const minLanes = view.minigame?.lanes ?? 3;
    for (const p of view.plates) {
      const g = measurePlate(c, p);
      geoms.set(p.id, g);
      const owner = p.ownerId === null ? undefined : view.enemies.find((e) => e.id === p.ownerId);
      let ax = W / 2;
      let ay = H * 0.46 + g.h / 2;
      if (owner) {
        const head = this.anchorDesign(owner, "head");
        ax = head.x;
        ay = head.y - 8;
      } else if (p.kind === "minigame" && p.lane !== null) {
        const tl =
          p.expiresAtTick !== null && p.totalTicks
            ? clamp((p.expiresAtTick - nowTick) / p.totalTicks, 0, 1)
            : 0.5;
        ax = W * (0.22 + (0.56 * (p.lane + 0.5)) / Math.max(1, minLanes));
        ay = 150 + (1 - tl) * (H * 0.55);
      }
      const priority = p.kind === "guard" || p.kind === "doom" || p.kind === "secondWind" ? 0 : 1;
      boxes.push({ id: p.id, w: g.w, h: g.h, ax, ay, priority });
    }
    const rects = solveLayout(
      boxes,
      { width: W, height: H, margin: 10, gap: 6, avoid, deadband: 3 },
      this.layoutState,
    );

    // sync entries
    const alive = new Set<number>();
    for (const p of view.plates) {
      const g = geoms.get(p.id);
      const box = rects.get(p.id);
      if (!g || !box) continue;
      alive.add(p.id);
      let en = this.entries.get(p.id);
      if (!en) {
        en = { geom: g, box, letters: [], seenAt: this.time };
        this.entries.set(p.id, en);
      }
      en.geom = g;
      en.box = box;
    }
    for (const [id, en] of this.entries) {
      if (!alive.has(id)) {
        this.lastRects.set(id, { rect: this.toCss(en.box), t: this.time });
        this.entries.delete(id);
        this.plateFx.forget(id);
      }
    }
    for (const [id, l] of this.lastRects) if (this.time - l.t > 1.2) this.lastRects.delete(id);

    // ---- screen-edge vignettes (typo / hurt); off in reduced-flash mode
    if (!set.reducedFlash && set.effectsIntensity > 0) {
      const a = Math.max(this.typoFlash * 0.45, this.hurtFlash * 0.6) * set.effectsIntensity;
      if (a > 0.01) {
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `rgba(255,30,30,${a})`);
        g.addColorStop(0.12, "rgba(255,30,30,0)");
        g.addColorStop(0.88, "rgba(255,30,30,0)");
        g.addColorStop(1, `rgba(255,30,30,${a})`);
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
      }
    }

    // ---- panels / bars
    const pc: PanelCtx = {
      c,
      W,
      H,
      time: this.time,
      settings: set,
      heroHpTrail: this.heroTrail,
      atbPulse: this.atbPulse,
      atbIgnite: this.atbIgnite,
      comboPulse: this.comboPulse,
      tierFlash: this.tierFlash,
    };
    if (hudVisible) {
      const atb = this.lerpPrev(view.hero.atbFrac, (p) => p.hero.atbFrac);
      const hpv = this.lerpPrev(view.hero.hpFrac, (p) => p.hero.hpFrac);
      for (const e of view.enemies) {
        if (!e.alive) continue;
        const st: EnemyBarState = {
          hpFrac: this.lerpPrev(e.hpFrac, (p) => p.enemies.find((x) => x.id === e.id)?.hpFrac),
          hpTrail: this.enemyTrail.get(e.id) ?? e.hpFrac,
          atbFrac: this.lerpPrev(e.atbFrac, (p) => p.enemies.find((x) => x.id === e.id)?.atbFrac),
        };
        if (e.isBoss) {
          if (view.boss && view.boss.enemyId === e.id) drawBossPlate(pc, view, e, st);
        } else {
          const f = this.anchorDesign(e, "feet");
          drawEnemyBars(pc, e, f.x, f.y, st);
        }
      }
      if (!boss) drawTopLabel(pc, view);
      drawHeroPanel(pc, view, atb, hpv);
      drawStatsPanel(pc, view);
      for (const sk of view.skills)
        drawSkill(
          pc,
          sk,
          this.lerpPrev(sk.chargeFrac, (p) => p.skills.find((x) => x.slot === sk.slot)?.chargeFrac),
        );
      drawComboDisplay(pc, view);
    }

    // second wind dim (under plates)
    if (view.secondWind) {
      c.fillStyle = "rgba(4,12,14,0.55)";
      c.fillRect(0, 0, W, H);
      txt(c, "SECOND WIND", W / 2, H * 0.3, 40, "#9ffff0", {
        align: "center",
        f: FONT_DISP,
        w: 900,
        ls: 8,
        glow: "rgba(90,240,224,0.7)",
        gb: 18 * set.effectsIntensity,
      });
      txt(c, "TYPE THE WORD TO RISE AGAIN", W / 2, H * 0.3 + 38, 14, "#e0fffa", {
        align: "center",
        ls: 3,
      });
    }

    // ---- banners
    for (const b of this.banners.banners) drawBanner(c, b, W, H, set);

    // ---- FX behind plates (CSS px space)
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fxBase = { dt: 0, time: this.time, scale: s, settings: set };
    this.fx.draw("behind", c, fxBase);

    // ---- pops (under plates so words always win)
    this.drawPops(c);

    // ---- plates (design space)
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    for (const gh of this.ghosts) {
      const k = gh.age / gh.dur;
      const rr: Rect = { ...gh.box, y: gh.box.y - eOut(k) * 24 };
      drawPlate(c, gh.geom, rr, {
        time: this.time,
        nowTick,
        isTarget: false,
        fx: this.plateFx,
        settings: set,
        alpha: 1 - k,
        letterRects: [],
      });
    }
    const order = [...view.plates].sort(
      (a, b) => Number(a.id === view.targetPlateId) - Number(b.id === view.targetPlateId),
    );
    for (const p of order) {
      const en = this.entries.get(p.id);
      if (!en) continue;
      drawPlate(c, en.geom, en.box, {
        time: this.time,
        nowTick,
        isTarget: p.id === view.targetPlateId || p.isTarget,
        fx: this.plateFx,
        settings: set,
        alpha: 1,
        letterRects: en.letters,
      });
    }

    // ---- FX above plates: clipped so no effect can cover a letter
    if (this.fx.count > 0) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.save();
      const clip = new Path2D();
      clip.rect(0, 0, this.cssW, this.cssH);
      for (const en of this.entries.values())
        for (const r of en.letters) if (r) clip.rect(r.x * s, r.y * s, r.w * s, r.h * s);
      c.clip(clip, "evenodd");
      this.fx.draw("above", c, fxBase);
      c.restore();
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawPops(c: Ctx): void {
    const set = this.settings;
    const s = this.s;
    c.setTransform(this.dpr * s, 0, 0, this.dpr * s, 0, 0);
    for (const p of this.pops.pops) this.drawPop(c, p, set);
    c.globalAlpha = 1;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private drawPop(c: Ctx, p: Pop, set: HudSettings): void {
    const s = this.s;
    const a = this.popAnchorCss(p.anchor);
    const x = a.x / s + p.vx * p.age;
    let y = a.y / s - p.stackY - 12;
    const k = p.age / p.dur;
    c.globalAlpha = popAlpha(p);
    const rm = set.reducedMotion;
    const sc = popScale(p.age, rm);
    const intensity = set.effectsIntensity;
    const punch = 1 + (sc - 1) * Math.max(0.3, intensity);
    switch (p.kind) {
      case "dmg":
      case "crit":
      case "hurt": {
        const bounce = rm ? 0 : Math.max(0, Math.sin(Math.min(1, p.age / 0.32) * Math.PI)) * 22;
        y -= bounce + p.age * 18;
        const base = p.kind === "crit" ? 62 : p.kind === "hurt" ? 40 : 50;
        const sz = base * p.size * punch;
        c.save();
        c.translate(x, y);
        if (p.kind === "crit") c.rotate(-0.08);
        c.font = `900 ${sz}px ${FONT_DISP}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineJoin = "round";
        c.strokeStyle = "#120808";
        c.lineWidth = sz * 0.2;
        c.strokeText(p.text, 0, 0);
        const g = c.createLinearGradient(0, -sz / 2, 0, sz / 2);
        if (p.kind === "crit") {
          g.addColorStop(0, "#fffbe0");
          g.addColorStop(0.5, "#ffd84a");
          g.addColorStop(1, "#ff7a20");
        } else if (p.kind === "hurt") {
          g.addColorStop(0, "#ffd0c8");
          g.addColorStop(1, "#ff5a4a");
        } else {
          g.addColorStop(0, "#ffffff");
          g.addColorStop(0.6, "#f4ecdc");
          g.addColorStop(1, "#b8a890");
        }
        if (p.kind === "crit" && p.age < 0.14 && intensity > 0 && !set.reducedFlash) {
          c.shadowColor = "rgba(255,200,80,1)";
          c.shadowBlur = 24 * intensity;
        }
        c.fillStyle = g;
        c.fillText(p.text, 0, 0);
        c.restore();
        break;
      }
      case "chip": {
        y -= p.age * 30;
        txt(c, p.text, x, y, 18 * p.size * punch, "#d8d0c0", {
          align: "center",
          f: FONT_DISP,
          w: 700,
          sw: 4,
        });
        break;
      }
      case "heal": {
        y -= p.age * 26;
        txt(c, p.text, x, y, 30 * punch, "#a8f290", {
          align: "center",
          f: FONT_DISP,
          w: 900,
          sw: 5,
        });
        break;
      }
      case "break": {
        y -= p.age * 10;
        const sz = 64 * punch * p.size;
        c.save();
        c.translate(x, y);
        c.rotate(-0.06);
        c.font = `900 ${sz}px ${FONT_DISP}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.letterSpacing = "4px";
        c.lineJoin = "round";
        c.strokeStyle = "#06101e";
        c.lineWidth = sz * 0.2;
        c.strokeText("BREAK", 0, 0);
        const g = c.createLinearGradient(0, -sz / 2, 0, sz / 2);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.5, "#bfe4ff");
        g.addColorStop(1, "#4a8aff");
        if (intensity > 0) {
          c.shadowColor = "rgba(100,170,255,1)";
          c.shadowBlur = 20 * intensity;
        }
        c.fillStyle = g;
        c.fillText("BREAK", 0, 0);
        c.shadowBlur = 0;
        c.letterSpacing = "0px";
        if (!rm) {
          c.strokeStyle = "rgba(220,240,255,0.9)";
          c.lineWidth = 2;
          for (let i = 0; i < 6; i++) {
            const an = i * 1.05 + 0.3;
            const r0 = sz * 1.1;
            const r1 = r0 + 20 + p.age * 60;
            c.beginPath();
            c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0 * 0.5);
            c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1 * 0.5);
            c.stroke();
          }
        }
        c.restore();
        break;
      }
      case "weak":
      case "perfect":
      case "block":
      case "parry":
      case "tag": {
        y -= Math.min(1, p.age / 0.2) * 14;
        const col =
          p.kind === "weak"
            ? "#c0287a"
            : p.kind === "perfect"
              ? "#c8820a"
              : p.kind === "block"
                ? "#2a6ac8"
                : p.kind === "parry"
                  ? "#1a8a9a"
                  : "#7a4ab0";
        this.tagPlate(c, x, y, p.text, col, 15 * Math.min(punch, 1.3));
        break;
      }
      case "skill":
        y -= p.age * 40;
        txt(c, p.text, x, y, 18 * punch, "#ffd9a0", {
          align: "center",
          ls: 2,
          w: 700,
          glow: intensity > 0 ? "rgba(255,170,80,0.7)" : null,
          gb: 10 * intensity,
        });
        break;
      case "gold": {
        y -= eOut(Math.min(1, p.age / 0.6)) * 50;
        txt(c, p.text, x, y, 26 * punch, "#ffd860", {
          align: "center",
          f: FONT_DISP,
          w: 900,
          sw: 6,
        });
        break;
      }
    }
    void k;
    void x;
  }

  private tagPlate(c: Ctx, x: number, y: number, text: string, col: string, sz: number): void {
    c.font = `700 ${sz}px ${FONT_UI}`;
    c.letterSpacing = "2px";
    const w = c.measureText(text).width + 20;
    const h = sz + 10;
    c.letterSpacing = "0px";
    c.save();
    c.translate(x, y);
    c.transform(1, 0, -0.25, 1, 0, 0);
    c.fillStyle = "rgba(10,6,14,0.92)";
    c.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    c.fillStyle = col;
    c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.fillRect(-w / 2, -h / 2, w, 3);
    c.restore();
    txt(c, text, x, y + 1, sz, "#ffffff", {
      align: "center",
      w: 700,
      ls: 2,
      out: "rgba(30,8,20,0.95)",
      sw: 4,
    });
  }

  // ---------------------------------------------------------------- debug

  /** Hook data for the readability test (`window.__hudDebug`). */
  debugSnapshot(): HudDebugSnapshot {
    const plates: HudDebugPlate[] = [];
    for (const [id, en] of this.entries) {
      const p = this.view?.plates.find((x) => x.id === id);
      const pal: PlatePalette = en.geom.palette;
      const tint = this.plateFx.tint(id);
      let contrast = palettePlateContrast(pal);
      if (tint?.typed) {
        const lightest = relLuminance(pal.bg0) > relLuminance(pal.bg1) ? pal.bg0 : pal.bg1;
        contrast = Math.min(contrast, contrastRatio(tint.typed, lightest));
      }
      plates.push({
        id,
        kind: en.geom.view.kind,
        isTarget: p?.isTarget ?? false,
        rect: this.toCss(en.box),
        frameRect: this.toCss({
          x: en.box.x + en.geom.fx,
          y: en.box.y + en.geom.fy,
          w: en.geom.fw,
          h: en.geom.fh,
        }),
        fontPx: en.geom.sz * this.s,
        letters: en.letters.filter(Boolean).map((r) => this.toCss(r)),
        contrast,
      });
    }
    const sorted = [...this.frameMs].sort((a, b) => a - b);
    const n = sorted.length;
    return {
      viewport: { w: this.cssW, h: this.cssH, dpr: this.dpr, scale: this.s },
      plates,
      pops: this.pops.pops.length,
      fx: this.fx.count,
      banners: this.banners.banners.length,
      frame: {
        avgMs: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
        p95Ms: n ? (sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0) : 0,
        maxMs: n ? (sorted[n - 1] ?? 0) : 0,
        count: n,
      },
    };
  }
  resetFrameStats(): void {
    this.frameMs.length = 0;
  }
}

export type { PlateView, PopKind };
export { BOSS_PLATE_W, ENEMY_BAR_W, keyStreakColor, PLATE_PALETTES };

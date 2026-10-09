/**
 * The app shell (T3.2): a screen state machine over one GL canvas.
 *
 *   title <-> map -> { loadout, inventory, shop, cache, journal, settings, trial } (Esc = back)
 *   map --Enter on a level--> play (PlaySession owns the canvas) --results--> map | chapter complete
 *
 * Screens are plain DOM (`#app-ui`) above the canvases, themed like the HUD (hud/uiTheme.ts) and driven by the
 * keyboard (`nav.ts`). The menu backdrop is a real level diorama (`backdrop.ts`). The save is owned by `SaveStore`.
 */
import { contentBundle } from "@hd2d/content";
import type { LevelResult } from "@hd2d/sim";
import type { AudioEngine, Sfx } from "../audio";
import { HOW_TO_PLAY_CSS } from "../hud/howToPlay";
import { injectUiTheme } from "../hud/uiTheme";
import type { RunConfig } from "../level/runner";
import type { ResultExtras } from "../level/screens";
import { PlaySession } from "../level/session";
import { isFirstRun, type LevelCommit } from "../meta/ops";
import type { SaveStore } from "../meta/save";
import type { Net } from "../net";
import type { QualityTier } from "../render";
import { Backdrop } from "./backdrop";
import { KeyNav, type NavScope } from "./nav";
import { APP_CSS } from "./style";

export interface Screen {
  root: HTMLElement;
  /** Put keyboard focus on the screen's first control. */
  focus(): void;
  /** Escape. Return false to let the app's default (go to `parent`) not run. */
  back?(): boolean | undefined;
  dispose?(): void;
}

export type ScreenName =
  | "title"
  | "map"
  | "loadout"
  | "inventory"
  | "shop"
  | "cache"
  | "journal"
  | "settings"
  | "complete"
  | "story"
  | "calibrate";

export interface ScreenArg {
  focus?: string;
  [k: string]: unknown;
}

export type ScreenFactory = (app: App, arg: ScreenArg) => Screen;

export interface BotParams {
  wpm: number;
  accuracy?: number;
  seed?: number;
}

export interface AppDeps {
  glCanvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  net: Net;
  store: SaveStore;
  audio: AudioEngine | null;
  factories: Record<ScreenName, ScreenFactory>;
  bot?: BotParams;
  fonts?: boolean;
  tier: QualityTier;
  /** First-run flow (story, calibration, tutorial level) for a fresh profile. Default true; `?onboard=0` turns it off. */
  onboarding?: boolean;
}

export interface LastRun {
  levelId: string;
  result: LevelResult;
  summary: LevelCommit;
}

/** Where Escape goes from each screen. */
const PARENT: Record<ScreenName, ScreenName | null> = {
  title: null,
  map: "title",
  loadout: "map",
  inventory: "map",
  shop: "map",
  cache: "map",
  journal: "map",
  settings: "map",
  complete: "map",
  story: null,
  calibrate: null,
};

declare global {
  interface Window {
    __app?: AppDebug;
  }
}

export interface AppDebug {
  route(): ScreenName | "play";
  store: SaveStore;
  app: App;
  consoleErrors: string[];
  lastRun(): LastRun | null;
}

/** Per-screen hero nudge on the menu backdrop (world dx, dz): title clears the CONTINUE cursor, map keeps the legs above the info panel. */
const HERO_OFFSET: Partial<Record<ScreenName, readonly [number, number]>> = {
  title: [-1.1, 0],
  map: [0, -3.8],
};

export class App {
  readonly root: HTMLDivElement;
  readonly nav = new KeyNav();
  readonly store: SaveStore;
  readonly net: Net;
  readonly audio: AudioEngine | null;
  readonly bundle = contentBundle;
  route: ScreenName | "play" = "title";
  lastRun: LastRun | null = null;
  session: PlaySession | null = null;
  tier: QualityTier;
  /** Where the title screen was entered from (the Settings screen came from the title or the map). */
  from: ScreenName = "title";

  private screen: Screen | null = null;
  private disposers: (() => void)[] = [];
  private backdrop: Backdrop | null = null;
  private toastTimer = 0;
  private readonly deps: AppDeps;
  private modalStack: { el: HTMLElement; scope: NavScope; prevFocus: HTMLElement | null }[] = [];

  constructor(deps: AppDeps) {
    this.deps = deps;
    this.store = deps.store;
    this.net = deps.net;
    this.audio = deps.audio;
    this.tier = deps.tier;
    injectUiTheme();
    const style = document.createElement("style");
    style.id = "hd-app-css";
    style.textContent = APP_CSS + HOW_TO_PLAY_CSS;
    document.head.append(style);
    this.root = document.createElement("div");
    this.root.id = "app-ui";
    this.root.className = "hd-root";
    document.body.append(this.root);
    this.nav.attach();
    this.audio?.unlockOnGesture(window);
    this.applyAudioFromSave();
    window.addEventListener("online", () => this.net.sync.onOnline());
  }

  // ---------------------------------------------------------------------------------------- onboarding

  get onboardingEnabled(): boolean {
    return this.deps.onboarding !== false;
  }

  /**
   * "Start game" on a fresh profile: story card, then the calibration, then straight into L1 (the tutorial level).
   * A profile that is already calibrated (it quit during L1) goes directly to L1. Returns false when the flow does not
   * apply (returning player, or onboarding off): the caller opens the map as usual.
   */
  beginFirstRun(): boolean {
    if (!this.onboardingEnabled || !isFirstRun(this.store.save)) return false;
    if (this.store.save.pace.calibrationWpm !== null) void this.play("ch1-l01");
    else this.go("story", {});
    return true;
  }

  // ---------------------------------------------------------------------------------------- helpers

  get bot(): BotParams | undefined {
    return this.deps.bot;
  }

  sfx(id: Sfx): void {
    try {
      this.audio?.play(id);
    } catch {
      /* audio is best-effort */
    }
  }

  toast(text: string, ms = 1800): void {
    document.querySelector(".hd-toast")?.remove();
    const t = document.createElement("div");
    t.className = "hd-toast hd-root";
    t.setAttribute("role", "status");
    t.textContent = text;
    document.body.append(t);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.remove(), ms);
  }

  get reducedMotion(): boolean {
    return this.store.save.settings.reducedMotion;
  }

  /** Volumes from the save into the engine (the save wins over the engine's localStorage copy). */
  applyAudioFromSave(): void {
    const a = this.audio;
    if (!a) return;
    const v = this.store.save.settings.volumes;
    for (const ch of ["master", "sfx", "ambience", "music", "ui"] as const) a.setVolume(ch, v[ch]);
  }

  // ---------------------------------------------------------------------------------------- backdrop

  private ensureBackdrop(): void {
    if (this.backdrop) return;
    this.backdrop = new Backdrop({
      glCanvas: this.deps.glCanvas,
      tier: this.tier,
      reducedMotion: this.reducedMotion,
    });
    this.backdrop.start();
    this.audio?.setBiome("forest");
    this.audio?.setMusicState("walk");
  }

  setBackdropMotion(reduced: boolean): void {
    if (this.backdrop) this.backdrop.reducedMotion = reduced;
  }

  /** Rebuild the backdrop (quality tier changed). */
  rebuildBackdrop(): void {
    this.backdrop?.dispose();
    this.backdrop = null;
    if (this.route !== "play") this.ensureBackdrop();
  }

  /** PNG data URL of the procedural chest sprite (via the backdrop's RenderWorld), or "" when unavailable. */
  chestUrl(open: boolean): string {
    return this.backdrop?.chestUrl(open) ?? "";
  }

  get backdropFrames(): number {
    return this.backdrop?.frames ?? 0;
  }

  // ---------------------------------------------------------------------------------------- routing

  /** Register a cleanup that runs when the current screen is left. */
  track(off: () => void): void {
    this.disposers.push(off);
  }

  go(name: ScreenName, arg: ScreenArg = {}): void {
    this.closeAllModals();
    for (const d of this.disposers.splice(0)) d();
    this.screen?.dispose?.();
    this.screen?.root.remove();
    this.route = name;
    this.ensureBackdrop();
    const ho = HERO_OFFSET[name];
    this.backdrop?.setHeroOffset(ho ? ho[0] : 0, ho ? ho[1] : 0);
    this.root.style.display = "";
    const factory = this.deps.factories[name];
    const s = factory(this, arg);
    this.screen = s;
    this.root.dataset.screen = name;
    this.root.append(s.root);
    const scope: NavScope = {
      root: s.root,
      onBack: () => {
        const r = s.back?.();
        if (r === false) return true;
        if (r === true) return true;
        const parent = PARENT[name];
        if (parent) {
          this.sfx("uiClick");
          this.go(parent, parent === "map" ? { focus: arg.focus } : {});
        }
        return true;
      },
    };
    this.nav.setBase(scope);
    requestAnimationFrame(() => s.focus());
    s.root.dataset.ready = "1";
  }

  // ---------------------------------------------------------------------------------------- modals

  /** Opens a modal (focus trapped, Escape closes). Returns a close function. */
  openModal(content: HTMLElement, onClose?: () => void): () => void {
    const wrap = document.createElement("div");
    wrap.className = "hd-modal";
    wrap.append(content);
    this.root.append(wrap);
    const prevFocus = document.activeElement as HTMLElement | null;
    const entry = {
      el: wrap,
      prevFocus,
      scope: {
        root: wrap,
        onBack: () => {
          close();
          return true;
        },
      } as NavScope,
    };
    const close = (): void => {
      const i = this.modalStack.indexOf(entry);
      if (i < 0) return;
      this.modalStack.splice(i, 1);
      this.nav.pop(entry.scope);
      wrap.remove();
      onClose?.();
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
    };
    this.modalStack.push(entry);
    this.nav.push(entry.scope);
    requestAnimationFrame(() => this.nav.focusFirst("[data-autofocus]"));
    return close;
  }

  private closeAllModals(): void {
    for (const m of [...this.modalStack].reverse()) {
      this.nav.pop(m.scope);
      m.el.remove();
    }
    this.modalStack = [];
  }

  get modalOpen(): boolean {
    return this.modalStack.length > 0;
  }

  // ---------------------------------------------------------------------------------------- play

  async play(levelId: string): Promise<void> {
    if (this.session) return;
    this.closeAllModals();
    this.nav.setBase(null);
    for (const d of this.disposers.splice(0)) d();
    this.screen?.dispose?.();
    this.screen?.root.remove();
    this.screen = null;
    this.root.style.display = "none";
    this.backdrop?.dispose();
    this.backdrop = null;
    this.route = "play";
    const bot = this.deps.bot;
    const paceOverride = bot?.wpm;
    const build = (): RunConfig => this.store.runConfig(levelId, { pace: paceOverride });
    const s = this.store.save.settings;
    const finish = (res: LevelResult, cfg: RunConfig): ResultExtras => this.onFinished(res, cfg);
    const done = (to: "next" | "exit"): void => {
      const sess = this.session;
      this.session = null;
      // dispose outside the session's own frame callback
      queueMicrotask(() => {
        sess?.dispose();
        this.afterLevel(levelId, to);
      });
    };
    this.session = await PlaySession.create({
      glCanvas: this.deps.glCanvas,
      hudCanvas: this.deps.hudCanvas,
      levelId,
      tier: this.tier,
      audio: this.audio !== null,
      fonts: this.deps.fonts,
      runConfig: build(),
      refreshConfig: build,
      audioEngine: this.audio ?? undefined,
      hudSettings: {
        effectsIntensity: s.effectsIntensity,
        reducedFlash: s.reducedFlash,
        reducedMotion: s.reducedMotion,
      },
      bot: bot ? { wpm: bot.wpm, accuracy: bot.accuracy, seed: bot.seed } : undefined,
      hooks: {
        onFinished: finish,
        next: () => done("next"),
        exit: () => done("exit"),
      },
    });
    const sess = this.session;
    // the tutorial card's rect is an `avoid` rect for the plate layout (plates never sit under a card)
    sess.screens.onTutorialRect = (r) => sess.hud.setReserved(r ? [r] : []);
    window.__play = sess.debugApi(this.consoleErrors);
  }

  consoleErrors: string[] = [];

  private onFinished(result: LevelResult, cfg: RunConfig): ResultExtras {
    const known = new Set(Object.keys(this.store.save.journal.firstSeen));
    const summary = this.store.applyResult(result, cfg);
    this.lastRun = { levelId: result.levelId, result, summary };
    const b = this.bundle;
    const notes: string[] = [];
    if (result.outcome === "cleared") {
      if (summary.firstClear) notes.push("<b>First clear</b>: full gold");
      else notes.push(`Replay: <b>${Math.round(cfg.options.goldMultBp / 100)}%</b> level gold`);
      if (summary.starGold > 0)
        notes.push(
          `+${summary.starGold} gold for ${summary.newStars} new star${summary.newStars === 1 ? "" : "s"}`,
        );
      if (summary.chestGold > 0) notes.push(`+${summary.chestGold} gold from chests`);
      for (const id of summary.unlocked.actives)
        notes.push(`<b>Skill unlocked</b>: ${b.actives.find((a) => a.id === id)?.name ?? id}`);
      for (const id of summary.unlocked.passives)
        notes.push(`<b>Passive unlocked</b>: ${b.passives.find((p) => p.id === id)?.name ?? id}`);
      for (const g of summary.gearGained)
        notes.push(`<b>Found</b>: ${b.gear.find((d) => d.id === g.defId)?.name ?? g.defId}`);
      if (summary.cachesGained > 0)
        notes.push(
          `<b>+${summary.cachesGained} Gear Cache${summary.cachesGained === 1 ? "" : "s"}</b>`,
        );
    } else if (result.gold > 0) {
      notes.push("You keep a share of the gold you collected.");
    }
    return { stars: summary.stars, gold: summary.gold, notes, knownWordKeys: known };
  }

  private afterLevel(levelId: string, to: "next" | "exit"): void {
    this.root.style.display = "";
    const levels = this.bundle.levels;
    const i = levels.findIndex((l) => l.id === levelId);
    const last = this.lastRun;
    if (
      to === "next" &&
      last?.levelId === levelId &&
      last.result.outcome === "cleared" &&
      i === levels.length - 1
    ) {
      this.go("complete", {});
      return;
    }
    const focus = to === "next" ? (levels[i + 1]?.id ?? levelId) : levelId;
    this.go("map", { focus });
  }

  // ---------------------------------------------------------------------------------------- debug

  debug(): AppDebug {
    return {
      route: () => this.route,
      store: this.store,
      app: this,
      consoleErrors: this.consoleErrors,
      lastRun: () => this.lastRun,
    };
  }
}

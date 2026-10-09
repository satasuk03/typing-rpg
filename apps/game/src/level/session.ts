/**
 * PlaySession: the glue that makes a level playable in the browser.
 *
 *   keyboard -> LevelRunner (sim clock) -> events -> EventRouter -> { LevelStage (world), Hud, AudioEngine, Screens }
 *                          \-> LevelView + alpha --> stage.update / hud.render each frame
 *
 * Render, HUD and audio only consume sim events and views (plan §4 hard rule). The only thing that flows back into the
 * sim is player input, through `LevelRunner.handleKey`.
 */
import { contentBundle } from "@hd2d/content";
import { getView, type LevelResult, type LevelView, type SimEvent } from "@hd2d/sim";
import { type AudioApi, AudioEngine, type BiomeName } from "../audio";
import { Hud } from "../hud";
import { loadHudFonts } from "../hud/fonts";
import type { HudSettings } from "../hud/settings";
import { KeyboardCapture, pressKey } from "../input/keyboard";
import { isQualityTier, type QualityTier, RenderWorld } from "../render";
import { buildWorld, loadLevel, toRenderBiome } from "../render/world";
import { WpmBot } from "./bot";
import { freshSeed, makeRunConfig, type PlayParams } from "./config";
import { EventRouter } from "./eventBindings";
import { LevelRunner, type LoggedInput, type PauseReason, type RunConfig } from "./runner";
import { buildResultsModel, type ResultExtras, Screens } from "./screens";
import { LevelStage } from "./stage";
import { attachTypingFx, type SessionTypingFx } from "./typingFx";

export interface SessionOptions extends PlayParams {
  glCanvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  tier?: number;
  audio?: boolean;
  fonts?: boolean;
  bot?: { wpm: number; accuracy?: number; seed?: number };
  /** T2.6 typing VFX (default on). `?fx=0` turns them off (A/B captures). */
  typingFx?: boolean;
  /** Effect settings for the typing VFX (`?intensity=`, `?reducedFlash=1`, `?reducedMotion=1`). */
  fxSettings?: { effectsIntensity?: number; reducedFlash?: boolean; reducedMotion?: boolean };
  /** App mode (T3.2): a prebuilt run config (equipped gear, settings, SRS words, replay pay). */
  runConfig?: RunConfig;
  /** App mode: builds a fresh config for "restart" (the save changed since the last attempt). */
  refreshConfig?: () => RunConfig;
  /** App mode: a shared engine that outlives the level (the session will not dispose it). */
  audioEngine?: AudioEngine;
  hudSettings?: Partial<HudSettings>;
  /** App mode: the meta layer. `onFinished` runs once when the results open (the save writer commits there). */
  hooks?: {
    onFinished?(result: LevelResult, cfg: RunConfig): ResultExtras | undefined;
    next(): void;
    exit(): void;
  };
}

export interface PerfStats {
  frames: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

const pct = (a: readonly number[], p: number): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

declare global {
  interface Window {
    __play?: PlayDebug;
  }
}

/** Test hook (`window.__play`). Everything is read-only inspection except `session`. */
export interface PlayDebug {
  ready: boolean;
  session: PlaySession;
  view(): LevelView;
  phase(): string;
  /** Runner config that Node needs to rebuild the identical level for `replay()`. */
  config(): { levelId: string; seed: number; options: unknown; pace: number };
  log(): LoggedInput[];
  hash(): string;
  result(): LevelResult | null;
  /** Count of each sim event type seen so far. */
  seen(): Record<string, number>;
  /** rAF frame deltas while the sim phase was `phase` (ms). */
  perf(phase: string): PerfStats;
  resultsShown(): boolean;
  stage(): ReturnType<LevelStage["debug"]>;
  consoleErrors: string[];
}

export class PlaySession {
  runner: LevelRunner;
  readonly stage: LevelStage;
  readonly world: RenderWorld;
  readonly hud: Hud;
  readonly router: EventRouter;
  readonly screens: Screens;
  readonly audio: AudioEngine | null;
  bot: WpmBot | null = null;
  /** T2.6 typing VFX (null when disabled). */
  typingFx: SessionTypingFx | null = null;

  private readonly keyboard: KeyboardCapture;
  private lastView: LevelView;
  private lastAlpha = 0;
  private lastNow = 0;
  private resultAt: number | null = null;
  private resultsShown = false;
  private pauseShown = false;
  private raf = 0;
  private disposed = false;
  private readonly seenCounts: Record<string, number> = {};
  private readonly perfByPhase = new Map<string, number[]>();
  private biome: BiomeName | null = null;
  private pace: number;
  private readonly ownsAudio: boolean;

  private constructor(
    private readonly opts: SessionOptions,
    world: RenderWorld,
    stage: LevelStage,
  ) {
    this.world = world;
    this.stage = stage;
    const cfg = opts.runConfig ?? makeRunConfig(opts);
    this.pace = cfg.options.pace;
    this.hud = new Hud(opts.hudCanvas);
    this.hud.setProjector(stage.projector);
    if (opts.hudSettings) this.hud.setSettings(opts.hudSettings);
    this.ownsAudio = opts.audioEngine === undefined;
    this.audio = opts.audio === false ? null : (opts.audioEngine ?? new AudioEngine());
    this.audio?.unlockOnGesture(window);
    this.screens = new Screens({
      resume: () => this.resume(),
      restart: () => this.restart(),
      quit: () => this.quit(),
      next: () => this.next(),
      exit: opts.hooks ? () => opts.hooks?.exit() : undefined,
    });
    this.router = new EventRouter({
      render: stage,
      hud: this.hud,
      audio: this.audio as AudioApi | null,
      ui: this.screens,
    });
    // ---- T2.6 typing VFX: gate every event through the presentation queue, world dt from the handle
    if (opts.typingFx !== false)
      this.typingFx = attachTypingFx({
        stage,
        world,
        hud: this.hud,
        router: this.router,
        audio: this.audio as AudioApi | null,
        seed: cfg.seed,
        settings: opts.fxSettings,
      });
    this.runner = new LevelRunner(cfg, (evs) => this.onEvents(evs));
    this.lastView = getView(this.runner.state);
    this.keyboard = new KeyboardCapture({
      onKey: (key, ts) => this.onKey(key, ts),
      onAutoPause: (reason) => {
        // A bot run (tests) is allowed to lose focus; a human run is not.
        if (reason === "blur" && this.bot) return;
        this.openPause(reason);
      },
    });
    if (opts.bot) {
      this.bot = new WpmBot(
        { wpm: opts.bot.wpm, accuracy: opts.bot.accuracy, seed: opts.bot.seed },
        (k) => pressKey(k),
      );
    }
  }

  static async create(opts: SessionOptions): Promise<PlaySession> {
    if (opts.fonts !== false) await loadHudFonts();
    const layout = loadLevel(opts.levelId);
    const tier: QualityTier = isQualityTier(opts.tier ?? 0) ? ((opts.tier ?? 0) as QualityTier) : 0;
    // GL context loss (T6.4): pause the sim while the context is gone, resume once it is restored.
    const holder: { s: PlaySession | null } = { s: null };
    const world = new RenderWorld({
      biome: toRenderBiome(layout.biome),
      quality: tier,
      autoQuality: false,
      hooks: {
        onContextLost: () => holder.s?.openPause("overlay"),
        onContextRestored: () => {
          if (holder.s?.runner.pauseReason === "overlay") holder.s.resume();
        },
      },
    });
    world.init(opts.glCanvas);
    const handle = buildWorld(layout, world, world.source);
    const enemies = new Map(contentBundle.enemies.map((e) => [e.id, e]));
    const stage = new LevelStage(world, handle, { enemies });
    const s = new PlaySession(opts, world, stage);
    holder.s = s;
    s.attach();
    return s;
  }

  // ------------------------------------------------------------------------------------------- lifecycle

  private attach(): void {
    const resize = (): void => {
      this.hud.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    };
    window.addEventListener("resize", resize);
    this.hud.setQuality(this.world.qualityTier); // caps the HUD backing-store DPR per tier
    resize();
    this.keyboard.attach();
    this.setBiomeFromWorld(true);
    this.runner.start(performance.now());
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.keyboard.detach();
    this.typingFx?.dispose();
    this.screens.dispose();
    if (this.ownsAudio) this.audio?.dispose();
    this.stage.dispose();
    this.stage.handle.dispose();
    this.world.dispose();
  }

  // ------------------------------------------------------------------------------------------- sim output

  private onEvents(events: SimEvent[]): void {
    for (const e of events) this.seenCounts[e.type] = (this.seenCounts[e.type] ?? 0) + 1;
    this.router.dispatch(events);
    for (const e of events) {
      if (e.type === "LevelCleared") this.resultAt = performance.now() + 3600;
      else if (e.type === "LevelFailed") {
        this.resultAt = performance.now() + (e.reason === "abandoned" ? 200 : 3300);
      }
    }
  }

  // ------------------------------------------------------------------------------------------- input

  private onKey(key: string, ts: number): void {
    const r = this.runner;
    if (r.paused) {
      if (key === "Escape" && r.pauseReason === "menu") this.resume();
      return;
    }
    if (r.terminal) return;
    if (key === "Escape") {
      // D6: Escape with a locked target drops it (sent to the sim); with no target it opens the pause menu.
      if (getView(r.state).targetPlateId === null) {
        this.openPause("menu");
        return;
      }
    }
    r.handleKey(key, ts);
  }

  openPause(reason: PauseReason): void {
    if (this.runner.terminal || this.runner.paused) return;
    this.runner.pause(performance.now(), reason);
    this.pauseShown = true;
    this.screens.showPause(reason);
  }

  resume(): void {
    this.runner.resume(performance.now());
    this.pauseShown = false;
    this.screens.closePanel();
  }

  restart(): void {
    const now = performance.now();
    if (this.opts.refreshConfig) {
      // App mode: the save may have changed (first clear -> replay pay, new gear, new SRS words): rebuild the config.
      const cfg = this.opts.refreshConfig();
      this.pace = cfg.options.pace;
      this.runner = new LevelRunner(cfg, (evs) => this.onEvents(evs));
      this.runner.start(now);
    } else {
      this.runner.restart(now, freshSeed());
    }
    this.stage.reset();
    this.hud.reset();
    this.typingFx?.reset();
    this.screens.closePanel();
    this.screens.secondWind(false);
    this.resultAt = null;
    this.resultsShown = false;
    this.pauseShown = false;
    this.lastView = getView(this.runner.state);
  }

  quit(): void {
    this.screens.closePanel();
    this.pauseShown = false;
    if (this.opts.hooks) {
      // App mode: leaving a level goes straight back to the map (an abandoned attempt changes nothing in the save).
      this.opts.hooks.exit();
      return;
    }
    // The abandon command is applied at the paused time; the fail screen follows.
    this.runner.abandon(performance.now());
    this.runner.resume(performance.now());
  }

  next(): void {
    if (this.opts.hooks) {
      this.opts.hooks.next();
      return;
    }
    const ids = contentBundle.levels.map((l) => l.id);
    const i = ids.indexOf(this.opts.levelId);
    const nextId = ids[i + 1] ?? ids[i] ?? this.opts.levelId;
    const q = new URLSearchParams(location.search);
    q.set("level", nextId);
    location.search = q.toString();
  }

  // ------------------------------------------------------------------------------------------- frame

  private setBiomeFromWorld(force = false): void {
    const b = this.stage.handle.biomeAt(this.world.camera.pose.x);
    const name: BiomeName = b === "hollow" ? "boss" : (b as BiomeName);
    if (force || name !== this.biome) {
      this.biome = name;
      this.audio?.setBiome(name);
    }
  }

  private frame(now: number): void {
    if (this.disposed) return;
    const rawDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    const r = this.runner;

    let paused = r.paused;
    if (!paused) {
      const f = r.frame(now);
      this.lastView = f.view;
      this.lastAlpha = f.alpha;
      if (r.paused) paused = true; // a stall pause was raised by the frame
    }
    if (paused && !this.pauseShown && !r.terminal) {
      this.pauseShown = true;
      this.screens.showPause(r.pauseReason ?? "menu");
    }
    const view = this.lastView;
    const alpha = paused ? 0 : this.lastAlpha;
    const animDt = paused ? 0 : dt;

    const worldDt = this.typingFx ? this.typingFx.update(animDt, view) : animDt;
    this.stage.update(view, alpha, worldDt);
    this.setBiomeFromWorld();
    this.world.render();
    this.hud.render(view, alpha, animDt);
    this.screens.updateView(view);
    this.audio?.update();

    if (!paused) this.bot?.update(() => getView(this.runner.state), now);

    if (this.resultAt !== null && now >= this.resultAt && !this.resultsShown) {
      const res = r.result;
      if (res) {
        this.resultsShown = true;
        this.hud.banners.clear(); // the LEVEL CLEAR / DEFEATED banner must not ghost behind the panel
        const extras = this.opts.hooks?.onFinished?.(res, r.config);
        this.screens.showResults(
          buildResultsModel(res, r.config.def, this.pace, extras?.knownWordKeys, extras),
        );
      }
    }

    if (rawDt > 0 && rawDt < 1) {
      const arr = this.perfByPhase.get(view.phase) ?? [];
      arr.push(rawDt * 1000);
      this.perfByPhase.set(view.phase, arr);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------------------------------- debug

  perf(phase: string): PerfStats {
    const a = this.perfByPhase.get(phase) ?? [];
    const sum = a.reduce((x, y) => x + y, 0);
    return {
      frames: a.length,
      avgMs: a.length ? sum / a.length : 0,
      p95Ms: pct(a, 0.95),
      maxMs: a.length ? Math.max(...a) : 0,
    };
  }

  debugApi(consoleErrors: string[]): PlayDebug {
    return {
      ready: true,
      session: this,
      view: () => getView(this.runner.state),
      phase: () => this.runner.state.phase,
      config: () => ({
        levelId: this.opts.levelId,
        seed: this.runner.seedOfAttempt(),
        options: this.runner.config.options,
        pace: this.pace,
      }),
      log: () => [...this.runner.log],
      hash: () => this.runner.hash(),
      result: () => this.runner.result,
      seen: () => ({ ...this.seenCounts }),
      perf: (p) => this.perf(p),
      resultsShown: () => this.resultsShown,
      stage: () => this.stage.debug(),
      consoleErrors,
    };
  }
}

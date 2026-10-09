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
import { KeyboardCapture, pressKey } from "../input/keyboard";
import { isQualityTier, type QualityTier, RenderWorld } from "../render";
import { buildWorld, loadLevel, toRenderBiome } from "../render/world";
import { WpmBot } from "./bot";
import { freshSeed, makeRunConfig, type PlayParams } from "./config";
import { EventRouter } from "./eventBindings";
import { LevelRunner, type LoggedInput, type PauseReason } from "./runner";
import { buildResultsModel, Screens } from "./screens";
import { LevelStage } from "./stage";

export interface SessionOptions extends PlayParams {
  glCanvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  tier?: number;
  audio?: boolean;
  fonts?: boolean;
  bot?: { wpm: number; accuracy?: number; seed?: number };
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
  readonly runner: LevelRunner;
  readonly stage: LevelStage;
  readonly world: RenderWorld;
  readonly hud: Hud;
  readonly router: EventRouter;
  readonly screens: Screens;
  readonly audio: AudioEngine | null;
  bot: WpmBot | null = null;

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
  private readonly pace: number;

  private constructor(
    private readonly opts: SessionOptions,
    world: RenderWorld,
    stage: LevelStage,
  ) {
    this.world = world;
    this.stage = stage;
    const cfg = makeRunConfig(opts);
    this.pace = cfg.options.pace;
    this.hud = new Hud(opts.hudCanvas);
    this.hud.setProjector(stage.projector);
    this.audio = opts.audio === false ? null : new AudioEngine();
    this.audio?.unlockOnGesture(window);
    this.screens = new Screens({
      resume: () => this.resume(),
      restart: () => this.restart(),
      quit: () => this.quit(),
      next: () => this.next(),
    });
    this.router = new EventRouter({
      render: stage,
      hud: this.hud,
      audio: this.audio as AudioApi | null,
      ui: this.screens,
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
    const world = new RenderWorld({
      biome: toRenderBiome(layout.biome),
      quality: tier,
      autoQuality: false,
    });
    world.init(opts.glCanvas);
    const handle = buildWorld(layout, world, world.source);
    const enemies = new Map(contentBundle.enemies.map((e) => [e.id, e]));
    const stage = new LevelStage(world, handle, { enemies });
    const s = new PlaySession(opts, world, stage);
    s.attach();
    return s;
  }

  // ------------------------------------------------------------------------------------------- lifecycle

  private attach(): void {
    const resize = (): void => {
      this.hud.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    };
    window.addEventListener("resize", resize);
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
    this.screens.dispose();
    this.audio?.dispose();
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
    this.runner.restart(now, freshSeed());
    this.stage.reset();
    this.hud.reset();
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
    // The abandon command is applied at the paused time; the fail screen follows.
    this.runner.abandon(performance.now());
    this.runner.resume(performance.now());
  }

  next(): void {
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

    this.stage.update(view, alpha, animDt);
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
        this.screens.showResults(buildResultsModel(res, r.config.def, this.pace));
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

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
import {
  getView,
  type LevelResult,
  type LevelView,
  prologueRunConfig,
  type SimEvent,
} from "@hd2d/sim";
import { PrologueOverlay } from "../app/prologueOverlay";
import { type AudioApi, AudioEngine, type BiomeName } from "../audio";
import { CutscenePlayer } from "../cutscene/player";
import type { Cue, Timeline } from "../cutscene/types";
import { Hud } from "../hud";
import { loadHudFonts } from "../hud/fonts";
import type { HudSettings } from "../hud/settings";
import { KeyboardCapture, pressKey } from "../input/keyboard";
import { isQualityTier, type QualityTier, RenderWorld } from "../render";
import { type BiomeMood, blendMood } from "../render/biomes";
import type { CameraPose } from "../render/camera";
import { buildWorld, levelIds, loadLevel, toRenderBiome } from "../render/world";
import { WpmBot } from "./bot";
import { attachCombatFx, type SessionCombatFx } from "./combatFx";
import { freshSeed, makeRunConfig, type PlayParams } from "./config";
import { EventRouter } from "./eventBindings";
import { LevelRunner, type LoggedInput, type PauseReason, type RunConfig } from "./runner";
import { buildResultsModel, type ResultExtras, Screens, sumLeakDamage } from "./screens";
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
  /** T2.3 combat VFX (default on). `?combat=0` turns them off (A/B captures). */
  combatFx?: boolean;
  /** Effect settings for the typing VFX (`?intensity=`, `?reducedFlash=1`, `?reducedMotion=1`). */
  fxSettings?: { effectsIntensity?: number; reducedFlash?: boolean; reducedMotion?: boolean };
  /** App mode (T3.2): a prebuilt run config (equipped gear, settings, SRS words, replay pay). */
  runConfig?: RunConfig;
  /** App mode: builds a fresh config for "restart" (the save changed since the last attempt). */
  refreshConfig?: () => RunConfig;
  /** App mode: a shared engine that outlives the level (the session will not dispose it). */
  audioEngine?: AudioEngine;
  hudSettings?: Partial<HudSettings>;
  /**
   * Prologue mode (P3.5). The run is `prologueRunConfig(contentBundle)` and nothing else (`runConfig`/`hooks` are ignored),
   * the sim starts at the cutscene's `startPlay` cue, no results screen / save commit / run ticket ever happens.
   * Pass `levelId: prologueLayoutId()`.
   */
  prologue?: PrologueModeOptions;
  /** App mode: the meta layer. `onFinished` runs once when the results open (the save writer commits there). */
  hooks?: {
    onFinished?(result: LevelResult, cfg: RunConfig, leakDamage: number): ResultExtras | undefined;
    next(): void;
    exit(): void;
  };
}

/** Prologue session mode (interfaces v2.2 §14.3): Part A cutscene -> Part B real sim -> Part C cutscene, one world. */
export interface PrologueModeOptions {
  /** Replay mode (title "Prologue" button): the caller never writes the flag. The session itself never writes anything. */
  replay: boolean;
  timelines: { open: Timeline; unwriting: Timeline };
  /** Test-only: multiplies the idle thresholds (nudge 9 s, ring hint 20 s, auto-advance 75 s). Default 1. */
  idleScale?: number;
  /** Test-only: how long Esc must be held to skip (default `SKIP_HOLD_MS` = 1000), so a still can be taken mid-hold. */
  holdMs?: number;
  /** The prologue is over (finished or skipped), after the 400 ms fade. The caller disposes the session and routes. */
  onDone(how: "end" | "skip"): void;
}

/** Hold Esc this long to skip the whole prologue; the ring shows after `RING_SHOW_MS`. */
export const SKIP_HOLD_MS = 1000;
const RING_SHOW_MS = 250;
export const PROLOGUE_NUDGE_S = 9;
export const PROLOGUE_RING_HINT_S = 20;
export const PROLOGUE_AUTO_ADVANCE_S = 75;
const PROLOGUE_FADE_MS = 400;

interface ProState {
  readonly o: PrologueModeOptions;
  phase: "A" | "B" | "C" | "done";
  player: CutscenePlayer | null;
  overlay: PrologueOverlay;
  idleMs: number;
  escDownAt: number | null;
  escTimer: number;
  climaxed: boolean;
  finishing: boolean;
  /** Why Part C started: the sim's climax, or the idle auto-advance. */
  cReason: "climax" | "idle" | null;
  offs: (() => void)[];
}

/** The layout the prologue plays on: `assets/levels/prologue.json` once it exists, else a Ch1 boss level (fallback). */
export function prologueLayoutId(): string {
  const want = contentBundle.prologue?.layoutId ?? "prologue";
  return levelIds().includes(want) ? want : "ch1-l10";
}

/** Placeholder UNWRITTEN grade for the cutscene's mood blend (the real constant is P2.x's); P3.6 swaps this. */
function drain(base: BiomeMood): BiomeMood {
  return {
    ...base,
    sat: base.sat * 0.18,
    exposure: base.exposure * 0.92,
    fogCol: [0.2, 0.21, 0.24],
    vig: base.vig * 1.2,
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
  /** Prologue mode only: the flow state (test hook). */
  prologue?(): {
    phase: string;
    idleMs: number;
    nudge: boolean;
    ringHint: boolean;
    cReason: string | null;
    simStarted: boolean;
  };
  /** Dev (`&demo=1`): play a combat VFX on the first living enemy (see dev/combatFxDemo.ts). */
  demo?: (name: string) => boolean;
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
  /** T2.3 combat VFX (null when disabled). */
  combat: SessionCombatFx | null = null;

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
  /** v1.9: HP lost through guarded hits this run (results-screen hint). */
  private leakDamage = 0;
  private readonly perfByPhase = new Map<string, number[]>();
  private biome: BiomeName | null = null;
  private pace: number;
  private readonly ownsAudio: boolean;
  /** Prologue mode state (null for every story level). */
  private pro: ProState | null = null;

  private constructor(
    private readonly opts: SessionOptions,
    world: RenderWorld,
    stage: LevelStage,
  ) {
    this.world = world;
    this.stage = stage;
    const cfg = opts.prologue
      ? prologueRunConfig(contentBundle)
      : (opts.runConfig ?? makeRunConfig(opts));
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
      skip: opts.prologue ? () => this.skipPrologue() : undefined,
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
    if (opts.combatFx !== false)
      this.combat = attachCombatFx({
        stage,
        world,
        hud: this.hud,
        router: this.router,
        typing: this.typingFx,
        seed: cfg.seed,
      });
    this.runner = new LevelRunner(cfg, (evs) => this.onEvents(evs));
    this.lastView = getView(this.runner.state);
    this.keyboard = new KeyboardCapture({
      onKey: (key, ts) => this.onKey(key, ts),
      onAutoPause: (reason) => {
        // A bot run (tests) is allowed to lose focus; a human run is not.
        if (reason === "blur" && this.bot) return;
        this.pro?.player?.pause(); // a cutscene part freezes its clock instead (resumed on focus)
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
    if (this.opts.prologue) this.attachPrologue(this.opts.prologue);
    this.keyboard.attach();
    this.setBiomeFromWorld(true);
    if (!this.pro) this.runner.start(performance.now());
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.keyboard.detach();
    this.detachPrologue();
    this.combat?.dispose();
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
    this.leakDamage += sumLeakDamage(events);
    const pro = this.pro;
    if (pro) {
      // Prologue: the climax hands the stage to Part C; the sim's LevelCleared (gold 0) is never presented (no banner,
      // no fanfare, no results screen, no save commit).
      if (events.some((e) => e.type === "PrologueClimax")) pro.climaxed = true;
      this.router.dispatch(events.filter((e) => e.type !== "LevelCleared"));
      return;
    }
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
    const pro = this.pro;
    if (pro) {
      if (pro.finishing) return;
      // Parts A and C: only Space/Enter (a cutscene line); letters never advance anything.
      if (pro.phase !== "B") {
        if (pro.phase !== "done") pro.player?.key(key);
        return;
      }
      if (key === "Escape") return; // owned by the hold/tap handler (keyup), see attachPrologue
      this.noteInput();
    }
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
    if (this.pro && this.pro.phase !== "B") return; // cutscene parts have no pause menu (blur freezes the cutscene clock)
    this.runner.pause(performance.now(), reason);
    this.pauseShown = true;
    this.screens.showPause(reason, this.pro !== null);
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
    this.combat?.reset();
    this.screens.closePanel();
    this.screens.secondWind(false);
    this.resultAt = null;
    this.resultsShown = false;
    this.leakDamage = 0;
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

    const pro = this.pro;
    let paused = r.paused;
    if (!paused && pro?.phase !== "C" && pro?.phase !== "done") {
      const f = r.frame(now);
      this.lastView = f.view;
      this.lastAlpha = f.alpha;
      if (r.paused) paused = true; // a stall pause was raised by the frame
    }
    if (paused && !this.pauseShown && !r.terminal) {
      this.pauseShown = true;
      this.screens.showPause(r.pauseReason ?? "menu", pro !== null);
    }
    if (pro) this.proFrame(now, Math.min(1, Math.max(0, rawDt)), paused);
    // Part C: the HUD shows no plates (the cinematic HUD is P3.3's); the sim is not stepped any more.
    const view: LevelView =
      this.pro?.phase === "C"
        ? { ...this.lastView, plates: [], targetPlateId: null }
        : this.lastView;
    const alpha = paused ? 0 : this.lastAlpha;
    const animDt = paused ? 0 : dt;

    const worldDt = this.typingFx ? this.typingFx.update(animDt, view) : animDt;
    this.stage.setFxSettings(this.hud.getSettings());
    this.stage.update(view, alpha, worldDt);
    this.combat?.update(view);
    this.setBiomeFromWorld();
    this.world.render();
    this.hud.render(view, alpha, animDt);
    this.screens.updateView(view);
    this.audio?.update();

    if (!paused && (!pro || pro.phase === "B"))
      this.bot?.update(() => getView(this.runner.state), now);

    if (this.resultAt !== null && now >= this.resultAt && !this.resultsShown) {
      const res = r.result;
      if (res) {
        this.resultsShown = true;
        this.hud.banners.clear(); // the LEVEL CLEAR / DEFEATED banner must not ghost behind the panel
        const extras = this.opts.hooks?.onFinished?.(res, r.config, this.leakDamage);
        this.screens.showResults(
          buildResultsModel(
            res,
            r.config.def,
            this.pace,
            extras?.knownWordKeys,
            extras,
            this.leakDamage,
          ),
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

  // ------------------------------------------------------------------------------------------- prologue (P3.5)

  private attachPrologue(o: PrologueModeOptions): void {
    const overlay = new PrologueOverlay();
    const pro: ProState = {
      o,
      phase: "A",
      player: null,
      overlay,
      idleMs: 0,
      escDownAt: null,
      escTimer: 0,
      climaxed: false,
      finishing: false,
      cReason: null,
      offs: [],
    };
    this.pro = pro;
    const holdMs = o.holdMs ?? SKIP_HOLD_MS;
    this.hud.setPanelAlpha(0); // Part A is a cutscene: no panels until the sim starts
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      fn: (e: WindowEventMap[K]) => void,
      capture = false,
    ): void => {
      window.addEventListener(type, fn, { capture });
      pro.offs.push(() => window.removeEventListener(type, fn, { capture }));
    };
    // Esc is owned here for the whole prologue (registered before the KeyboardCapture, so it never sees Esc): its keydown
    // keeps its normal meaning in Part B (drop the target / pause menu / resume), and holding it for `holdMs` skips
    // everything. Synthetic Escapes (the wpm-bot drops targets with a bare keydown) never start a hold.
    listen(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (pro.finishing) return;
        if (!e.isTrusted) {
          this.escTap(e.timeStamp);
          return;
        }
        if (e.repeat || pro.escDownAt !== null) return;
        pro.escDownAt = e.timeStamp;
        this.escTap(e.timeStamp);
        // a timer, not the frame loop, completes the hold: a slow frame must not turn a 1 s hold into a miss
        window.clearTimeout(pro.escTimer);
        pro.escTimer = window.setTimeout(() => {
          if (pro.escDownAt !== null) this.skipPrologue();
        }, holdMs);
        const downAt = pro.escDownAt;
        window.setTimeout(() => {
          if (pro.escDownAt === downAt && !pro.finishing)
            overlay.setProgress(RING_SHOW_MS / holdMs);
        }, RING_SHOW_MS);
      },
      true,
    );
    listen(
      "keyup",
      (e) => {
        if (e.key !== "Escape") return;
        const at = pro.escDownAt;
        pro.escDownAt = null;
        window.clearTimeout(pro.escTimer);
        overlay.setProgress(null);
        if (at !== null && !pro.finishing && e.timeStamp - at >= holdMs) this.skipPrologue();
      },
      true,
    );
    listen("blur", () => {
      pro.escDownAt = null;
      window.clearTimeout(pro.escTimer);
      overlay.setProgress(null);
    });
    listen("focus", () => pro.player?.resume());
    const vis = (): void => {
      if (document.visibilityState === "visible") pro.player?.resume();
    };
    document.addEventListener("visibilitychange", vis);
    pro.offs.push(() => document.removeEventListener("visibilitychange", vis));
    // Part A opens with the "Hold Esc to skip" hint for 3 s
    overlay.setRingHint(true);
    const hintTimer = window.setTimeout(() => {
      if (pro.phase === "A") overlay.setRingHint(false);
    }, 3000);
    pro.offs.push(() => window.clearTimeout(hintTimer));
    pro.player = this.makePlayer(o.timelines.open);
    pro.player.start();
  }

  private detachPrologue(): void {
    const pro = this.pro;
    if (!pro) return;
    for (const off of pro.offs.splice(0)) off();
    window.clearTimeout(pro.escTimer);
    pro.player?.release();
    pro.player = null;
    pro.overlay.dispose();
  }

  private makePlayer(tl: Timeline): CutscenePlayer {
    const h = this.stage.handle;
    const pose = (n: string): CameraPose | undefined => {
      try {
        return h.cameraPose(n as never);
      } catch {
        return undefined;
      }
    };
    const walk = h.cameraPose("walk");
    const home = { ...walk, x: h.getAnchor("start").x + 3.2 };
    const hs = this.hud.getSettings();
    return new CutscenePlayer(tl, {
      env: {
        basePose: tl.setup === "continue" ? { ...this.world.camera.pose } : home,
        anchors: {
          walk: home,
          battle: pose("battle:1"),
          bossIntro: pose("boss"),
          boss: pose("boss"),
        },
        reducedMotion: hs.reducedMotion,
        effectsIntensity: hs.effectsIntensity,
      },
      director: this.stage.director(),
      moodAt: (k) => {
        const base: BiomeMood = h.moodAt(this.world.camera.pose.x);
        return blendMood(base, drain(base), k);
      },
      sink: { onCue: (c) => this.onCue(c) },
    });
  }

  private onCue(c: Cue): void {
    const pro = this.pro;
    if (!pro || pro.finishing) return;
    if (c.kind === "startPlay") {
      if (pro.phase !== "A") return;
      pro.phase = "B";
      pro.idleMs = 0;
      pro.overlay.setRingHint(false);
      this.hud.setPanelAlpha(1);
      this.runner.start(performance.now());
    } else if (c.kind === "sfx") {
      try {
        this.audio?.play(c.id);
      } catch {
        /* audio is best-effort */
      }
    }
  }

  /** Any real input in Part B: the idle clock restarts and the nudge / ring hint go away. */
  private noteInput(): void {
    const pro = this.pro;
    if (!pro) return;
    pro.idleMs = 0;
    pro.overlay.setNudge(false);
    pro.overlay.setRingHint(false);
  }

  /** A quick tap of Esc (released before the ring shows). Only Part B uses it: pause menu / resume / drop the target. */
  private escTap(ts: number): void {
    const r = this.runner;
    if (this.pro?.phase !== "B") return;
    this.noteInput();
    if (r.paused) {
      if (r.pauseReason === "menu") this.resume();
      return;
    }
    if (r.terminal) return;
    if (getView(r.state).targetPlateId === null) {
      this.openPause("menu");
      return;
    }
    r.handleKey("Escape", ts);
  }

  private beginPartC(reason: "climax" | "idle"): void {
    const pro = this.pro;
    if (!pro || pro.phase === "C" || pro.finishing) return;
    pro.phase = "C";
    pro.cReason = reason;
    pro.overlay.setNudge(false);
    pro.overlay.setRingHint(false);
    this.hud.setPanelAlpha(0);
    this.hud.banners.clear();
    this.screens.closePanel();
    pro.player?.release();
    pro.player = this.makePlayer(pro.o.timelines.unwriting);
    pro.player.start();
    pro.player.climax(); // input is ignored for 1.5 s after the climax
  }

  /** Per frame: the hold-Esc ring, the cutscene clock, the idle ladder, the climax handover. */
  private proFrame(now: number, dtSec: number, paused: boolean): void {
    const pro = this.pro;
    if (!pro || pro.finishing || pro.phase === "done") return;
    if (pro.escDownAt !== null) {
      const held = now - pro.escDownAt;
      const holdMs = pro.o.holdMs ?? SKIP_HOLD_MS;
      pro.overlay.setProgress(held >= RING_SHOW_MS ? held / holdMs : null);
      if (held >= holdMs) {
        this.skipPrologue();
        return;
      }
    }
    if (pro.player) {
      pro.player.tick(dtSec * 1000);
      if (pro.player.isFinished) {
        if (pro.phase === "C") {
          this.finish("end");
          return;
        }
        pro.player.release(); // Part A is over: the stage takes its camera back
        pro.player = null;
      }
    }
    if (pro.phase !== "B") return;
    if (pro.climaxed) {
      this.beginPartC("climax");
      return;
    }
    // idle only counts while there is something to type: not in the boss intro or between encounters (keys are ignored there)
    if (paused || this.runner.terminal || this.lastView.phase !== "combat") return;
    pro.idleMs += dtSec * 1000;
    const k = (pro.o.idleScale ?? 1) * 1000;
    if (pro.idleMs >= PROLOGUE_NUDGE_S * k) pro.overlay.setNudge(true);
    if (pro.idleMs >= PROLOGUE_RING_HINT_S * k) pro.overlay.setRingHint(true);
    if (pro.idleMs >= PROLOGUE_AUTO_ADVANCE_S * k) this.beginPartC("idle");
  }

  /** Skip the whole prologue (hold Esc, or the pause menu): 400 ms fade, then `onDone("skip")`. */
  skipPrologue(): void {
    this.finish("skip");
  }

  private finish(how: "end" | "skip"): void {
    const pro = this.pro;
    if (!pro || pro.finishing) return;
    pro.finishing = true;
    pro.escDownAt = null;
    pro.overlay.setProgress(null);
    pro.overlay.setNudge(false);
    pro.overlay.setRingHint(false);
    this.screens.closePanel();
    void pro.overlay.fadeOut(PROLOGUE_FADE_MS).then(() => {
      pro.phase = "done";
      if (!this.disposed) pro.o.onDone(how);
    });
  }

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
      prologue: () => {
        const p = this.pro;
        return {
          phase: p?.phase ?? "none",
          idleMs: p?.idleMs ?? 0,
          nudge: p?.overlay.nudgeOn ?? false,
          ringHint: p?.overlay.ringHintOn ?? false,
          cReason: p?.cReason ?? null,
          simStarted: this.runner.gameMs(performance.now()) > 0,
        };
      },
      consoleErrors,
    };
  }
}

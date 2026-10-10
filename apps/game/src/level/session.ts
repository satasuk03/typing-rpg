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
  type EnemyView,
  getView,
  type LevelResult,
  type LevelView,
  prologueRunConfig,
  type SimEvent,
} from "@hd2d/sim";
import type { Mesh } from "three";
import { type AudioApi, AudioEngine, type BiomeName } from "../audio";
import type { Sfx, SfxParams } from "../audio/types";
import { CutscenePlayer } from "../cutscene/player";
import type { ActorRef, Cue, CutsceneState, Timeline } from "../cutscene/types";
import { Hud } from "../hud";
import { loadHudFonts } from "../hud/fonts";
import type { PrologueHud } from "../hud/prologue";
import type { HudSettings } from "../hud/settings";
import { KeyboardCapture, pressKey } from "../input/keyboard";
import { isQualityTier, type QualityTier, RenderWorld } from "../render";
import { type BiomeMood, blendMood, UNWRITTEN } from "../render/biomes";
import type { CameraPose } from "../render/camera";
import { attachPrologueFx, type SessionPrologueFx } from "../render/vfx/prologue";
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
const NUDGE_TEXT = "Type any word to fight!";
/** The last Fireball's catch freezes the world for this long (art direction §3 `catchFireball`). */
const CATCH_HIT_STOP_MS = 160;
/** The combat library's Fireball (cast just before the climax) is swept for this long after Part C starts. */
const CLIMAX_SWEEP_MS = 1500;
/** The id of the Nul the stage raises when Part C starts without the boss on stage (the idle auto-advance). */
const NUL_STAND_IN_ID = 9001;
const SWORD_KEY = "prop.prologue.sword";
/** The sword prop is authored at the world scale of the gate; stuck in the ground beside the kneeling knight it reads about his height. */
const SWORD_SCALE = 0.45;

interface ProState {
  readonly o: PrologueModeOptions;
  phase: "A" | "B" | "C" | "done";
  player: CutscenePlayer | null;
  /** The P3.3 cinematic HUD (Grimoire, dialogue, ink line, skip ring, nudge): mounted by `Hud.attachPrologue()`. */
  hudPro: PrologueHud;
  idleMs: number;
  escDownAt: number | null;
  escTimer: number;
  climaxed: boolean;
  finishing: boolean;
  /** Why Part C started: the sim's climax, or the idle auto-advance. */
  cReason: "climax" | "idle" | null;
  offs: (() => void)[];
  /** The standing hints / ring state (mirrors what the HUD shows; the flow tests read it). */
  nudgeOn: boolean;
  ringHint: boolean;
  ringHeld: boolean;
  /** performance.now() when the skip fade started, or null. */
  skipFadeAt: number | null;
  /** Hit-stop: the cutscene clock waits this long (ms). */
  holdMs: number;
  /** Part C: ms since it began (the climax sweep of the combat Fireball). */
  cAgeMs: number;
  /** The knight's sword prop (Part C, `prop:prop.prologue.sword`), created when first shown. */
  swordMesh: Mesh | null;
  /** The last evaluated cutscene state of the playing part (stills / debug). */
  cState: CutsceneState | null;
  /** Test hook (`proSeek`): the cutscene clock is parked on the sought frame. */
  frozen: boolean;
  /** Part C began before the boss appeared (idle auto-advance): the stage stands Nul up for the cutscene. */
  nulStandIn: boolean;
}

/** The layout the prologue plays on: `assets/levels/prologue.json` once it exists, else a Ch1 boss level (fallback). */
export function prologueLayoutId(): string {
  const want = contentBundle.prologue?.layoutId ?? "prologue";
  return levelIds().includes(want) ? want : "ch1-l10";
}

/** The starter kit (actives and passives with no `unlockLevel`: Fireball + Clean Cut): the shards that fall back in Part C. */
function starterKitIds(): string[] {
  return [
    ...contentBundle.actives.filter((a) => a.unlockLevel === undefined).map((a) => a.id),
    ...contentBundle.passives.filter((p) => p.unlockLevel === undefined).map((p) => p.id),
  ];
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
  /** Prologue mode only: park Part A / C on timeline time `t` ms (stills). */
  proSeek?(t: number, lineClockMs?: number, jumped?: boolean): boolean;
  /** Prologue mode only: the flow state (test hook). */
  prologue?(): {
    phase: string;
    idleMs: number;
    nudge: boolean;
    ringHint: boolean;
    /** Esc is held and the ring shows its progress. */
    ringHeld: boolean;
    /** The timeline's black fade (0 clear .. 1 black) and the playing part's clock (ms). */
    fade: number;
    t: number;
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
  /** P3.6 prologue world VFX (null for every story level). */
  proFx: SessionPrologueFx | null = null;

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
    // ---- P3.6 prologue world VFX (PrologueFx): built ONLY in prologue mode, so story levels never see it
    if (opts.prologue) {
      stage.setPrologue(true);
      this.proFx = attachPrologueFx({
        stage,
        world,
        hud: this.hud,
        router: this.router,
        typing: this.typingFx,
        extraKeepOut: (out, off) => this.cutsceneKeepOuts(out, off),
      });
      this.router.register(["EnemySpawned", "BossIntroStarted", "EnemyAttack"], (e) =>
        this.prologueSfx(e),
      );
    }
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
    this.proFx?.dispose();
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
    // the prologue has its own ambience + music rows ("prologue": heroic D major -> the theft drone -> silence)
    const name: BiomeName = this.pro ? "prologue" : b === "hollow" ? "boss" : (b as BiomeName);
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
    // Part C: the sim is not stepped any more (the last view is held): no plates, no ward, not "cleared" (that would
    // make the hero hop in his win pose), and the HUD is the cinematic one.
    const view: LevelView =
      this.pro?.phase === "C" ? this.cutsceneView(this.lastView) : this.lastView;
    const alpha = paused ? 0 : this.lastAlpha;
    const animDt = paused ? 0 : dt;

    const worldDt = this.typingFx ? this.typingFx.update(animDt, view) : animDt;
    this.stage.setFxSettings(this.hud.getSettings());
    this.stage.update(view, alpha, worldDt);
    this.combat?.update(view);
    if (pro) this.proWorld(view);
    this.setBiomeFromWorld();
    this.applyFade();
    this.world.render();
    // Part A has no view yet (the sim has not started): only the cinematic overlay (caption, dialogue, skip ring)
    if (pro?.phase === "A") this.hud.renderOverlay(animDt);
    else this.hud.render(view, alpha, animDt);
    this.drawSkipFade(now);
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
    const hudPro = this.hud.attachPrologue();
    const pro: ProState = {
      o,
      phase: "A",
      player: null,
      hudPro,
      idleMs: 0,
      escDownAt: null,
      escTimer: 0,
      climaxed: false,
      finishing: false,
      cReason: null,
      offs: [],
      nudgeOn: false,
      ringHint: false,
      ringHeld: false,
      skipFadeAt: null,
      holdMs: 0,
      cAgeMs: 0,
      swordMesh: null,
      cState: null,
      frozen: false,
      nulStandIn: false,
    };
    this.pro = pro;
    const holdMs = o.holdMs ?? SKIP_HOLD_MS;
    // the cinematic HUD takes its anchors from the stage's real projection (CSS px) and the bundle's starter kit
    const tear = this.stage.handle.getAnchor("tear");
    hudPro.setStarterKit(starterKitIds());
    hudPro.setAnchors({
      hand: () => {
        const hp = { x: 0, z: 0 };
        this.stage.heroPos(hp);
        return this.stage.project(hp.x + 0.5, 0.75, hp.z);
      },
      tear: () => this.stage.project(tear.x, tear.y ?? 7, tear.z),
    });
    this.hud.setPanelAlpha(1);
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
            this.setRingProgress(RING_SHOW_MS / holdMs);
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
        this.setRingProgress(null);
        if (at !== null && !pro.finishing && e.timeStamp - at >= holdMs) this.skipPrologue();
      },
      true,
    );
    listen("blur", () => {
      pro.escDownAt = null;
      window.clearTimeout(pro.escTimer);
      this.setRingProgress(null);
    });
    listen("focus", () => pro.player?.resume());
    const vis = (): void => {
      if (document.visibilityState === "visible") pro.player?.resume();
    };
    document.addEventListener("visibilitychange", vis);
    pro.offs.push(() => document.removeEventListener("visibilitychange", vis));
    // Part A opens with the "Hold Esc to skip" hint for 3 s
    this.setRingHint(true);
    const hintTimer = window.setTimeout(() => {
      if (pro.phase === "A") this.setRingHint(false);
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
    this.stage.setBossCutscene(null);
    this.stage.setFogDensity(null);
    if (pro.swordMesh) this.world.remove(pro.swordMesh);
    pro.swordMesh = null;
    pro.hudPro.setCutscene(null);
    pro.hudPro.showGrimoire(false);
    pro.hudPro.showSkipRing(null);
    pro.hudPro.hideNudge();
    this.hud.detachPrologue();
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
      // the theft ramp blends the level's storm-gold mood toward UNWRITTEN (`mood` cues carry THEFT_RAMP)
      moodAt: (k) => {
        const base: BiomeMood = h.moodAt(this.world.camera.pose.x);
        return blendMood(base, UNWRITTEN, k);
      },
      sink: { onCue: (c) => this.onCue(c) },
    });
  }

  private onCue(c: Cue): void {
    const pro = this.pro;
    if (!pro || pro.finishing) return;
    switch (c.kind) {
      case "startPlay":
        if (pro.phase !== "A") return;
        pro.phase = "B";
        pro.idleMs = 0;
        this.setRingHint(false);
        pro.hudPro.setCutscene(null); // Part B: the plates, bars and the Grimoire bar are the sim's
        // the stage places the hero at the encounter stop on the first sim frame; do it now so the cutscene's walk offset
        // (released this same frame) cannot show the hero back at the start for a frame
        this.stage.encounterStarted(0);
        this.runner.start(performance.now());
        break;
      case "sfx":
        this.play(c.id, { count: c.count, boss: c.boss });
        break;
      case "line":
        this.play("lineBlip", { boss: c.speaker === "nul" });
        break;
      case "music":
        this.musicCue(c);
        break;
      case "vfx":
        if (c.id === "catchFireball") {
          // the catch is a 160 ms hit-stop: the world and the cutscene clock wait together
          pro.holdMs = CATCH_HIT_STOP_MS;
          this.stage.hitStop(CATCH_HIT_STOP_MS / 1000);
        }
        break;
      default:
        break;
    }
  }

  private play(id: Sfx, p: SfxParams = {}): void {
    try {
      this.audio?.play(id, p);
    } catch {
      /* audio is best-effort */
    }
  }

  /** A cutscene `music` cue: state / spark motif / silence ramp (`applyMusicCue`) plus the drone and swell (P3.4). */
  private musicCue(c: Extract<Cue, { kind: "music" }>): void {
    const a = this.audio;
    if (!a) return;
    try {
      if (c.drone !== undefined) a.musicDrone(c.drone);
      if (c.swell) a.musicSwell();
      if (c.motif === "sparkEnd") a.musicMotif("sparkEnd");
      const rest: { state?: typeof c.state; motif?: "spark"; silence?: number } = {};
      if (c.state) rest.state = c.state;
      if (c.motif === "spark") rest.motif = "spark";
      if (c.silence !== undefined) rest.silence = c.silence;
      a.applyMusicCue(rest, c.dur !== undefined && c.dur > 0 ? c.dur / 1000 : undefined);
    } catch {
      /* audio is best-effort */
    }
  }

  /** Part B world sounds the sim events imply (the audio bindings do not know the prologue cues): ink pool, sky tear, ink lance. */
  private prologueSfx(e: SimEvent): void {
    const phase = this.pro?.phase;
    if (phase !== "B") return;
    if (e.type === "EnemySpawned") {
      if (!e.isBoss) this.play("inkPool");
    } else if (e.type === "BossIntroStarted") this.play("skyTear");
    else if (e.type === "EnemyAttack") {
      const nul = this.lastView.enemies.find((x) => x.id === e.enemyId)?.defId === "nul";
      if (nul) this.play("hushBolt");
    }
  }

  /** The skip ring on the P3.3 HUD: `p` = hold progress, null = released (a standing hint stays as the idle ring). */
  private setRingProgress(p: number | null): void {
    const pro = this.pro;
    if (!pro) return;
    pro.ringHeld = p !== null;
    pro.hudPro.showSkipRing(p !== null ? p : pro.ringHint ? 0 : null);
  }

  private setRingHint(on: boolean): void {
    const pro = this.pro;
    if (!pro) return;
    pro.ringHint = on;
    if (!pro.ringHeld) pro.hudPro.showSkipRing(on ? 0 : null);
  }

  private setNudge(on: boolean): void {
    const pro = this.pro;
    if (!pro) return;
    pro.nudgeOn = on;
    pro.hudPro.showNudge(on ? NUDGE_TEXT : null);
  }

  /** World effects keep clear of the dialogue box (inflated 24 design px) and the ink line in the cutscene parts (P2). */
  private cutsceneKeepOuts(out: Float32Array, off: number): number {
    const pro = this.pro;
    if (!pro || pro.phase === "B") return 0;
    const s = this.hud.getScale();
    let n = 0;
    for (const r of pro.hudPro.worldKeepOuts()) {
      const i = off + n * 4;
      if (i + 4 > out.length) break;
      out[i] = r.x * s;
      out[i + 1] = r.y * s;
      out[i + 2] = r.w * s;
      out[i + 3] = r.h * s;
      n++;
    }
    return n;
  }

  /**
   * Part C after the idle auto-advance: the sim never reached the boss, so Nul is not on stage. The stage raises him at his
   * slot (encounter 2 has the same hero stop) so the cutscene is about someone.
   */
  private standUpNul(): void {
    const pro = this.pro;
    if (!pro || this.lastView.enemies.some((e) => e.isBoss && e.alive)) return;
    pro.nulStandIn = true;
    this.stage.encounterStarted(1);
    this.stage.spawnEnemy(NUL_STAND_IN_ID, "nul", 0, true);
  }

  /** The view the stage and HUD see in Part C: the sim is over, so no plates / ward and not "cleared". */
  private cutsceneView(v: LevelView): LevelView {
    const out: LevelView = { ...v, phase: "combat", plates: [], targetPlateId: null };
    if (v.prologue) out.prologue = { ...v.prologue, bossClamped: false };
    // the Aegis barrier (the dome around the knight) goes when Aegis is stolen (kit slot 1); statuses end with the fight
    if (this.pro?.nulStandIn) {
      const nul: EnemyView = {
        id: NUL_STAND_IN_ID,
        defId: "nul",
        slot: 0,
        isBoss: true,
        alive: true,
        hp: 1,
        maxHp: 1,
        hpFrac: 0.35,
        atbFrac: 0,
        plateId: null,
        isGuard: false,
        guardTicksLeft: 0,
        guardTotalTicks: 0,
        guardResult: null,
        shield: 0,
        shieldMax: 0,
        weaknesses: [],
        brokenTicksLeft: 0,
        statuses: [],
        isFocus: false,
        pose: "idle",
        poseSinceTick: v.tick,
      };
      out.enemies = [...v.enemies, nul];
      out.boss = {
        enemyId: NUL_STAND_IN_ID,
        name: "Nul",
        title: "The Silent King",
        phase: 1,
        gateHpFrac: null,
      };
    }
    const aegisGone = this.pro?.cState?.hud.kitShattered.includes(1) === true;
    out.hero = {
      ...v.hero,
      barrierCharges: aegisGone ? 0 : v.hero.barrierCharges,
      statuses: [],
    };
    return out;
  }

  /** Any real input in Part B: the idle clock restarts and the nudge / ring hint go away. */
  private noteInput(): void {
    const pro = this.pro;
    if (!pro) return;
    pro.idleMs = 0;
    this.setNudge(false);
    this.setRingHint(false);
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
    pro.cAgeMs = 0;
    this.setNudge(false);
    this.setRingHint(false);
    this.hud.banners.clear();
    this.screens.closePanel();
    // the combat library's Fireball (the cast that ended Part B) and every servant still standing go: the catch is the
    // cutscene's own (`catchFireball` draws a frozen Fireball in Nul's palm); the plates / bars fade out over 300 ms
    this.combat?.fx.clear();
    this.stage.dissolveAdds();
    this.standUpNul();
    pro.hudPro.showGrimoire(true);
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
      this.setRingProgress(held >= RING_SHOW_MS ? held / holdMs : null);
      if (held >= holdMs) {
        this.skipPrologue();
        return;
      }
    }
    if (pro.player) {
      // the catch's hit-stop holds the cutscene clock too (the world is frozen by the stage's own clock)
      if (pro.holdMs > 0) pro.holdMs = Math.max(0, pro.holdMs - dtSec * 1000);
      else if (!pro.frozen) pro.player.tick(dtSec * 1000);
      if (pro.phase === "C") pro.cAgeMs += dtSec * 1000;
      if (pro.player.isFinished) {
        if (pro.phase === "C") {
          this.finish("end");
          return;
        }
        pro.player.release(); // Part A is over: the stage takes its camera back
        pro.player = null;
        pro.cState = null;
      } else {
        pro.cState = pro.player.state;
        pro.hudPro.setCutscene(pro.cState);
      }
    }
    if (pro.phase === "C" && pro.cAgeMs < CLIMAX_SWEEP_MS) this.combat?.fx.clear();
    if (pro.phase !== "B") return;
    if (pro.climaxed) {
      this.beginPartC("climax");
      return;
    }
    // idle only counts while there is something to type: not in the boss intro or between encounters (keys are ignored there)
    if (paused || this.runner.terminal || this.lastView.phase !== "combat") return;
    pro.idleMs += dtSec * 1000;
    const k = (pro.o.idleScale ?? 1) * 1000;
    if (pro.idleMs >= PROLOGUE_NUDGE_S * k) this.setNudge(true);
    if (pro.idleMs >= PROLOGUE_RING_HINT_S * k) this.setRingHint(true);
    if (pro.idleMs >= PROLOGUE_AUTO_ADVANCE_S * k) this.beginPartC("idle");
  }

  /** Per frame, after the stage: the prologue world VFX (live Part B cues + the cutscene's), Nul's pose, the sword, the fog. */
  private proWorld(view: LevelView): void {
    const pro = this.pro;
    const fx = this.proFx;
    if (!pro || !fx) return;
    const cs = pro.phase === "B" || pro.phase === "done" ? null : pro.cState;
    fx.update(this.stage.dt, view, cs?.vfx, cs?.moodBlend);
    // Part C: Nul is posed by the timeline's `boss` actor (anim by the cue's age, the rise into the tear, hidden after)
    const b = pro.phase === "C" ? cs?.actors.boss : undefined;
    this.stage.setBossCutscene(
      b ? { anim: b.anim, ageMs: b.animAgeMs, dx: b.dx, dz: b.dz, visible: b.visible } : null,
    );
    this.stage.setFogDensity(cs ? fx.fx.out.fogDensity : null);
    // the knight's sword, stuck in the ground at the `sword` marker for the fall (a `prop:` actor of the timeline)
    const sw = cs?.actors[`prop:${SWORD_KEY}` as ActorRef];
    if (sw?.visible && !pro.swordMesh) {
      const a = this.stage.handle.getAnchor("sword");
      pro.swordMesh = this.world.addProp(SWORD_KEY, a.x, 0, a.z, { rim: 1.2, scale: SWORD_SCALE });
    }
    if (pro.swordMesh) pro.swordMesh.visible = sw?.visible === true;
  }

  /**
   * TEST HOOK (stills): park the playing cutscene part on timeline time `tMs` (a pure seek: no edge cues fire, so no
   * sound) and keep it there; `lineClockMs >= 0` shows the line that starts exactly at `tMs`. The world settles over the
   * next frames. Returns false when no cutscene part is playing.
   */
  proSeek(tMs: number, lineClockMs = -1, jumped = true): boolean {
    const pro = this.pro;
    if (!pro?.player || (pro.phase !== "A" && pro.phase !== "C")) return false;
    if (tMs < 0) {
      pro.frozen = false; // let the part play on from where it was parked
      return true;
    }
    pro.frozen = true;
    pro.holdMs = 0;
    pro.cState = pro.player.seek(tMs, lineClockMs);
    pro.hudPro.setCutscene(pro.cState, jumped);
    pro.hudPro.settle();
    return true;
  }

  /** The timeline's black fade (Part A opens on black, Part C ends on it): a full-screen black flash in the grade. */
  private applyFade(): void {
    const pro = this.pro;
    const f = pro?.phase === "A" || pro?.phase === "C" ? (pro.cState?.hud.fade ?? 0) : 0;
    if (f <= 0) return;
    const e = this.world.postFx.effects;
    e.flash = Math.max(e.flash, f);
    e.flashColor.set(0, 0, 0);
  }

  /** The skip's 400 ms fade to black over everything (the HUD canvas is the top layer). */
  private drawSkipFade(now: number): void {
    const pro = this.pro;
    if (!pro || pro.skipFadeAt === null) return;
    const a = Math.min(1, Math.max(0, (now - pro.skipFadeAt) / PROLOGUE_FADE_MS));
    const c = this.opts.hudCanvas.getContext("2d");
    if (!c || a <= 0) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = `rgba(0,0,0,${a})`;
    c.fillRect(0, 0, this.opts.hudCanvas.width, this.opts.hudCanvas.height);
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
    pro.ringHeld = false;
    pro.ringHint = false;
    pro.hudPro.showSkipRing(null);
    this.setNudge(false);
    this.screens.closePanel();
    pro.skipFadeAt = performance.now();
    window.setTimeout(() => {
      pro.phase = "done";
      if (!this.disposed) pro.o.onDone(how);
    }, PROLOGUE_FADE_MS);
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
      proSeek: (t, lc, j) => this.proSeek(t, lc, j),
      prologue: () => {
        const p = this.pro;
        return {
          phase: p?.phase ?? "none",
          idleMs: p?.idleMs ?? 0,
          nudge: p?.nudgeOn ?? false,
          ringHint: p?.ringHint ?? false,
          ringHeld: p?.ringHeld ?? false,
          fade: p?.cState?.hud.fade ?? 0,
          t: p?.player?.time ?? 0,
          cReason: p?.cReason ?? null,
          simStarted: this.runner.gameMs(performance.now()) > 0,
        };
      },
      consoleErrors,
    };
  }
}

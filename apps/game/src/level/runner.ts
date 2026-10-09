/**
 * LevelRunner: owns the sim state and implements the client clock protocol of docs/interfaces.md §2.
 *
 * DOM-free and three-free on purpose: every time source is passed in (`nowMs` = performance.now() timebase,
 * `timeStamp` = KeyboardEvent.timeStamp), so the same class runs in Node tests and in the browser.
 *
 *  - keydown  -> ms (game time, pauses excluded) -> tick; the sim is stepped up to that tick and the key applied NOW.
 *  - frame    -> steps to `msToTick(now) - CLIENT_LAG_TICKS` (keys already applied may have gone further).
 *  - pause    -> the sim simply is not stepped; paused time is excluded from the log's ms.
 *  - stall    -> a frame needing more than MAX_CATCHUP_TICKS of catch-up converts the gap into paused time.
 *  - The log (`{ms, input}`) is what the anti-cheat Worker would re-simulate; `replay()` of it reproduces the hash.
 *
 * Hit-stop, slow-mo and camera punches are render-only (see `RenderClock` in stage.ts): they never reach this class.
 */
import {
  applyInput,
  CLIENT_LAG_TICKS,
  createLevel,
  getResult,
  getView,
  hash,
  type LevelOptions,
  type LevelResult,
  type LevelState,
  type LevelView,
  type Loadout,
  MAX_CATCHUP_TICKS,
  msToTick,
  type ResolvedLevel,
  type SimEvent,
  type SimInput,
  type SimKey,
  step,
  type Tick,
  tickStartMs,
} from "@hd2d/sim";

export interface RunConfig {
  def: ResolvedLevel;
  loadout: Loadout;
  seed: number;
  options: LevelOptions;
}

export interface LoggedInput {
  /** Integer game-time ms since level start (pauses excluded). The tick is `msToTick(ms)`. */
  ms: number;
  input: SimInput;
}

export type PauseReason = "menu" | "blur" | "hidden" | "stall" | "overlay";

export type EventSink = (events: SimEvent[]) => void;

export interface FrameResult {
  view: LevelView;
  /** Interpolation factor between the last two sim ticks for render/HUD, 0..1. */
  alpha: number;
}

export class LevelRunner {
  state: LevelState;
  readonly log: LoggedInput[] = [];
  /** Number of the current attempt (restart increments it). */
  attempt = 0;
  paused = false;
  pauseReason: PauseReason | null = null;

  private originMs = 0;
  private pausedTotalMs = 0;
  private pausedAt = 0;
  private lastLoggedMs = 0;
  private started = false;
  private seed: number;

  constructor(
    private readonly cfg: RunConfig,
    private readonly sink: EventSink,
  ) {
    this.seed = cfg.seed;
    this.state = createLevel(cfg.def, cfg.loadout, cfg.seed, cfg.options);
  }

  // ---------------------------------------------------------------- lifecycle

  /** Start the clock: `clockOriginMs = performance.now()` at createLevel (story levels). */
  start(nowMs: number): void {
    this.originMs = nowMs;
    this.pausedTotalMs = 0;
    this.lastLoggedMs = 0;
    this.started = true;
    this.paused = false;
    this.pauseReason = null;
  }

  /** New attempt with a fresh sim state. Pass a fresh random seed: loot derives from (seed, encounterIndex), so a reused seed repeats it. */
  restart(nowMs: number, freshSeed?: number): void {
    this.attempt++;
    this.seed = (freshSeed ?? this.seed + 7919) >>> 0;
    this.log.length = 0;
    this.state = createLevel(this.cfg.def, this.cfg.loadout, this.seed, this.cfg.options);
    this.start(nowMs);
  }

  seedOfAttempt(): number {
    return this.seed;
  }

  get config(): Readonly<RunConfig> {
    return this.cfg;
  }

  get terminal(): boolean {
    return this.state.phase === "cleared" || this.state.phase === "failed";
  }

  get result(): LevelResult | null {
    return getResult(this.state);
  }

  /** State hash (same function the Worker re-sim compares against). */
  hash(): string {
    return hash(this.state);
  }

  /** The logged inputs in the form `replay()` consumes. */
  inputs(): SimInput[] {
    return this.log.map((l) => l.input);
  }

  // ---------------------------------------------------------------- pause

  pause(nowMs: number, reason: PauseReason): void {
    if (this.paused || this.terminal || !this.started) return;
    this.paused = true;
    this.pauseReason = reason;
    this.pausedAt = nowMs;
  }

  resume(nowMs: number): void {
    if (!this.paused) return;
    this.pausedTotalMs += Math.max(0, nowMs - this.pausedAt);
    this.paused = false;
    this.pauseReason = null;
  }

  // ---------------------------------------------------------------- input

  /**
   * A keydown. `key` is already normalized (`normalizeKey`). Returns the events it caused (also sent to the sink).
   * Ignored while paused or terminal.
   */
  handleKey(key: SimKey, timeStamp: number): SimEvent[] {
    if (this.paused || this.terminal || !this.started) return [];
    return this.applyAt(Math.round(timeStamp - this.originMs - this.pausedTotalMs), (tick) => ({
      tick,
      key,
    }));
  }

  /** "Quit" from the pause menu: LevelFailed{abandoned}. Works while paused (the time of the pause is excluded). */
  abandon(nowMs: number): SimEvent[] {
    if (this.terminal || !this.started) return [];
    const at = this.paused ? this.pausedAt : nowMs;
    return this.applyAt(Math.round(at - this.originMs - this.pausedTotalMs), (tick) => ({
      tick,
      cmd: "abandon",
    }));
  }

  private applyAt(rawMs: number, mk: (tick: Tick) => SimInput): SimEvent[] {
    // Never earlier than what is already simulated or logged (frames may have run ahead of an old timestamp).
    const ms = Math.max(rawMs, tickStartMs(this.state.tick), this.lastLoggedMs);
    const tick = msToTick(ms);
    const out: SimEvent[] = [];
    const stepped = step(this.state, tick - this.state.tick);
    if (stepped.length > 0) out.push(...stepped);
    if (!this.terminal) {
      const input = mk(tick);
      const evs = applyInput(this.state, input);
      out.push(...evs);
      this.log.push({ ms, input });
      this.lastLoggedMs = ms;
    }
    if (out.length > 0) this.sink(out);
    return out;
  }

  // ---------------------------------------------------------------- frame

  /** One call per animation frame. Steps the sim to the lagged tick and returns the view and alpha. */
  frame(nowMs: number): FrameResult {
    if (!this.started) return { view: getView(this.state), alpha: 0 };
    if (this.paused || this.terminal) return { view: getView(this.state), alpha: 0 };
    const ms = nowMs - this.originMs - this.pausedTotalMs;
    const target = msToTick(Math.max(0, Math.floor(ms))) - CLIENT_LAG_TICKS;
    if (target - this.state.tick > MAX_CATCHUP_TICKS) {
      // tab stall / debugger / sleep: the gap becomes paused time and the player resumes manually
      this.pausedTotalMs += ms - tickStartMs(this.state.tick + CLIENT_LAG_TICKS);
      this.pause(nowMs, "stall");
      return { view: getView(this.state), alpha: 0 };
    }
    if (target > this.state.tick) {
      const evs = step(this.state, target - this.state.tick);
      if (evs.length > 0) this.sink(evs);
    }
    const alpha = this.terminal
      ? 0
      : Math.min(1, Math.max(0, ms * 0.06 - CLIENT_LAG_TICKS - this.state.tick));
    return { view: getView(this.state), alpha };
  }

  /** Game-time ms since the level started (pauses excluded); 0 before `start`. */
  gameMs(nowMs: number): number {
    if (!this.started) return 0;
    const at = this.paused ? this.pausedAt : nowMs;
    return Math.max(0, at - this.originMs - this.pausedTotalMs);
  }
}

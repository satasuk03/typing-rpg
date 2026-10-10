/**
 * CutscenePlayer: runs a `Timeline` on a presentation clock and drives the world only through `StageDirector`.
 *
 * - The clock only moves when `tick(dtMs)` is called, and not while `pause()`d (blur / hidden / pause menu).
 * - A `line` cue holds the clock at its `at` until `lineHoldMs` has passed or Space/Enter is pressed. Letter keys
 *   never advance a line (the player is often still typing when the climax hits). An `overlay` line (v2.2.3) never holds
 *   the clock: Space/Enter only fades it out early.
 * - All input is ignored for `INPUT_GUARD_MS` after `start()` and after `climax()`.
 * - `seek(t)` is a pure re-evaluation: it fires no edge cues (sfx/music) and gives identical state every time.
 * - `skip()` lands on `endState`.
 */
import { endState, evaluate, isOverlay, lineHoldMs } from "./timeline";
import type {
  ActorRef,
  Cue,
  CutsceneState,
  EvalEnv,
  HeroCutsceneAnim,
  Ms,
  StageDirector,
  Timeline,
} from "./types";

export const INPUT_GUARD_MS = 1500;

export interface CueSink {
  /** An edge-triggered cue was reached (sfx, music, hud, vfx, line, startPlay, end, ...). */
  onCue?(cue: Cue): void;
  /** `skip()` ran (after the end-state cues were emitted). */
  onSkip?(): void;
  /** The timeline finished (naturally or skipped). */
  onEnd?(): void;
}

export interface PlayerOptions {
  env: EvalEnv;
  director?: StageDirector | null;
  /** Builds the blended mood for `k` in (0, 1]. `k === 0` hands `null` back to the stage (its own mood). */
  moodAt?: (k: number) => unknown;
  sink?: CueSink;
  guardMs?: Ms;
}

const isAdvanceKey = (key: string): boolean =>
  key === " " || key === "Space" || key === "Spacebar" || key === "Enter";

export class CutscenePlayer {
  private t = 0;
  private lineClock = -1;
  private cursor = 0; // index into `lines`: the next line not yet released
  private held = false;
  private finished = false;
  private started = false;
  private paused = false;
  private guardLeft = 0;
  private readonly lines: readonly Extract<Cue, { kind: "line" }>[];
  private readonly overlays: readonly Extract<Cue, { kind: "line" }>[];
  /** `at` of the overlay line the reader dismissed with Space/Enter (null = none). */
  private dismissedAt: Ms | null = null;
  private readonly guardMs: Ms;
  private lastMood = -1;

  constructor(
    readonly timeline: Timeline,
    private readonly opts: PlayerOptions,
  ) {
    const all = timeline.cues.filter((c): c is Extract<Cue, { kind: "line" }> => c.kind === "line");
    this.lines = all.filter((c) => !isOverlay(c));
    this.overlays = all.filter(isOverlay);
    this.guardMs = opts.guardMs ?? INPUT_GUARD_MS;
  }

  // ------------------------------------------------------------------------------------------- state

  get time(): Ms {
    return this.t;
  }
  get isFinished(): boolean {
    return this.finished;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  /** True while the clock is held on a line. */
  get isHeldOnLine(): boolean {
    return this.held;
  }
  /** Remaining input-guard time, ms. */
  get guardRemainingMs(): Ms {
    return this.guardLeft;
  }
  get state(): CutsceneState {
    return this.finished
      ? endState(this.timeline, this.opts.env)
      : evaluate(
          this.timeline,
          this.t,
          this.held ? this.lineClock : -1,
          this.opts.env,
          this.dismissedAt,
        );
  }

  // ------------------------------------------------------------------------------------------- control

  /** Begin at t = 0: arms the input guard, fires the cues at 0 and applies the first frame. */
  start(): void {
    this.t = 0;
    this.finished = false;
    this.started = true;
    this.held = false;
    this.lineClock = -1;
    this.cursor = 0;
    this.dismissedAt = null;
    this.guardLeft = this.guardMs;
    this.fire(-1, 0);
    this.enterLineIfDue();
    this.apply();
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }

  /** The sim reported the climax (`PrologueClimax`): ignore input for the guard time again. */
  climax(): void {
    this.guardLeft = this.guardMs;
  }

  /** Advance the presentation clock by `dtMs` (ignored while paused / finished / not started). */
  tick(dtMs: Ms): void {
    if (!this.started || this.paused || this.finished || !(dtMs > 0)) return;
    this.guardLeft = Math.max(0, this.guardLeft - dtMs);
    let rem = dtMs;
    // each pass either spends time or changes the line state; bounded by the cue count
    for (let guard = 0; rem > 0 && !this.finished && guard < 10000; guard++) {
      if (this.held) {
        const line = this.lines[this.cursor];
        const left = (line ? lineHoldMs(line.text) : 0) - this.lineClock;
        if (rem < left) {
          this.lineClock += rem;
          rem = 0;
          break;
        }
        rem -= Math.max(0, left);
        this.releaseLine();
        continue;
      }
      const next = this.lines[this.cursor];
      const dur = this.timeline.durationMs;
      const target = Math.min(this.t + rem, next ? next.at : Infinity, dur);
      const spent = target - this.t;
      const from = this.t;
      this.t = target;
      this.fire(from, target);
      rem -= spent;
      if (this.enterLineIfDue()) continue;
      if (this.t >= dur) this.finish();
    }
    this.apply();
  }

  /**
   * Keyboard input (`KeyboardEvent.key`). Space/Enter release a held line; everything else (letters included) is
   * ignored. Returns true when the key was consumed. Always false inside the input guard.
   */
  key(key: string): boolean {
    if (!this.started || this.finished || this.paused) return false;
    if (this.guardLeft > 0) return false;
    if (!isAdvanceKey(key)) return false;
    if (!this.held) {
      // an overlay line on screen: Space/Enter fades it out early (nothing is skipped, the clock never stopped)
      const on = this.overlays.find(
        (c) => c.at !== this.dismissedAt && this.t >= c.at && this.t < c.at + lineHoldMs(c.text),
      );
      if (!on) return false;
      this.dismissedAt = on.at;
      this.apply();
      return true;
    }
    this.releaseLine();
    this.apply();
    return true;
  }

  /** Jump to the end state (a skip). State-bearing one-shots (startPlay, end) are still emitted. */
  skip(): void {
    if (this.finished) return;
    const from = this.t;
    this.held = false;
    this.lineClock = -1;
    this.cursor = this.lines.length;
    this.t = this.timeline.durationMs;
    for (const c of this.timeline.cues) {
      if (c.at > from && (c.kind === "startPlay" || c.kind === "end")) this.opts.sink?.onCue?.(c);
    }
    this.finished = true;
    this.apply();
    this.opts.sink?.onSkip?.();
    this.opts.sink?.onEnd?.();
  }

  /**
   * Re-position the playhead without firing edge cues (stills, replay jumps, tests). `lineClock >= 0` shows the line
   * that starts exactly at `tMs` (held); otherwise that line counts as released.
   */
  seek(tMs: Ms, lineClock = -1): CutsceneState {
    const dur = this.timeline.durationMs;
    this.t = Math.min(Math.max(tMs, 0), dur);
    this.started = true;
    this.finished = false;
    this.held = false;
    this.lineClock = -1;
    this.dismissedAt = null;
    this.cursor = this.lines.filter((l) => l.at < this.t).length;
    const here = this.lines[this.cursor];
    if (lineClock >= 0 && here && here.at === this.t) {
      this.held = true;
      this.lineClock = lineClock;
    } else if (here && here.at === this.t) {
      this.cursor++;
    }
    this.apply();
    return this.state;
  }

  // ------------------------------------------------------------------------------------------- internals

  private enterLineIfDue(): boolean {
    const next = this.lines[this.cursor];
    if (next && next.at <= this.t) {
      this.t = next.at;
      this.held = true;
      this.lineClock = 0;
      return true;
    }
    return false;
  }

  private releaseLine(): void {
    this.held = false;
    this.lineClock = -1;
    this.cursor++;
  }

  private finish(): void {
    this.finished = true;
    this.opts.sink?.onEnd?.();
  }

  private fire(t0: Ms, t1: Ms): void {
    const sink = this.opts.sink;
    if (!sink?.onCue) return;
    for (const c of this.timeline.cues) {
      if ((c.at > t0 || (t0 < 0 && c.at === 0)) && c.at <= t1) sink.onCue(c);
    }
  }

  /** Push the evaluated state to the world through the seam. */
  private apply(): void {
    const d = this.opts.director;
    if (!d) return;
    const s = this.state;
    d.setCameraOverride(s.camera);
    const k = s.moodBlend;
    if (k !== this.lastMood) {
      this.lastMood = k;
      d.setMood(k <= 0 || !this.opts.moodAt ? null : this.opts.moodAt(k));
    }
    for (const [who, a] of Object.entries(s.actors)) {
      d.setActorState(who as ActorRef, { dx: a.dx, dz: a.dz, visible: a.visible, tint: a.tint });
    }
    const hero = s.actors.hero;
    if (hero?.anim) d.setHeroAnim(hero.anim as HeroCutsceneAnim, hero.animAgeMs);
  }

  /** Hand the world back (cutscene over, or the player is being discarded). */
  release(): void {
    const d = this.opts.director;
    if (!d) return;
    d.setCameraOverride(null);
    d.setMood(null);
    d.setHeroAnim(null);
    for (const who of Object.keys(this.state.actors)) d.setActorState(who as ActorRef, null);
    this.lastMood = -1;
  }
}

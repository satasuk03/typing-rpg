// Runs the Typing Trial sim on the client and records the hdk1 keystroke log (docs/interfaces.md §2 clock protocol).
//   - The clock origin is the browser timestamp of the FIRST accepted keydown (createTrial happens then; Trial tick 0 = first key).
//   - ms = round(timeStamp - origin), clamped so it never precedes what is already simulated or logged; tick = msToTick(ms).
//   - Keys step the sim immediately; frames trail the clock by CLIENT_LAG_TICKS.
//   - Auto-repeat, IME, shortcuts etc. are dropped by normalizeKey. Escape/Tab are reported to the caller, not logged.
//   - Keys at or after the 60 s mark are ignored (the log may not exceed TRIAL_LOG_LIMITS.maxTotalMs).

import { CONTENT_VERSION } from "@hd2d/content";
import { encodeLogWire } from "@hd2d/shared";
import {
  applyTrialInput,
  CLIENT_LAG_TICKS,
  createTrial,
  encodeLog,
  getTrialResult,
  getTrialView,
  hash,
  type LoggedInput,
  msToTick,
  normalizeKey,
  type ResolvedTrial,
  SIM_VERSION,
  stepTrial,
  type TrialResult,
  type TrialState,
  type TrialView,
  tickStartMs,
} from "@hd2d/sim";
import type { RunSubmitBody, RunTicketT } from "./apiClient.ts";

export interface KeyLike {
  key: string;
  repeat: boolean;
  isComposing: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** DOMHighResTimeStamp of the event (same clock as performance.now()). */
  timeStamp: number;
}

export type KeyOutcome =
  | "ignored" // not a typable key / repeat / after the end
  | "escape" // Escape or Tab: caller decides (abandon prompt); never logged
  | "typed"; // applied to the sim and logged

export class TrialRecorder {
  private state: TrialState | null = null;
  private originMs = 0;
  private lastLoggedMs = 0;
  private lastStamp: number | null = null;
  private minDelta = Number.POSITIVE_INFINITY;
  readonly log: LoggedInput[] = [];
  private readonly durationMs: number;

  constructor(
    private readonly def: ResolvedTrial,
    private readonly seed: number,
  ) {
    this.durationMs = Math.ceil((def.durationTicks * 50) / 3);
  }

  get started(): boolean {
    return this.state !== null;
  }
  get done(): boolean {
    return this.state !== null && this.state.tick >= this.state.durationTicks;
  }
  /** The passage is known before the first key (same derivation as the sim). */
  get passage(): string {
    return (this.state ?? createTrial(this.def, this.seed)).passage;
  }
  view(): TrialView {
    return getTrialView(this.state ?? createTrial(this.def, this.seed));
  }
  /** Context only (never trusted by the server): the smallest positive gap between key timestamps, capped at 1000. */
  get timerResolutionMs(): number {
    return Number.isFinite(this.minDelta)
      ? Math.min(1000, Math.round(this.minDelta * 1000) / 1000)
      : 0;
  }
  /** ms of game time at `now` (browser clock); 0 before the first key. */
  elapsedMs(now: number): number {
    return this.state ? Math.max(0, Math.floor(now - this.originMs)) : 0;
  }

  onKeyDown(e: KeyLike): KeyOutcome {
    const key = normalizeKey(e);
    if (key === null) return "ignored";
    if (key === "Escape") return "escape";
    if (this.done) return "ignored";
    if (this.lastStamp !== null) {
      const d = e.timeStamp - this.lastStamp;
      if (d > 0 && d < this.minDelta) this.minDelta = d;
    }
    this.lastStamp = e.timeStamp;
    if (this.state === null) {
      this.state = createTrial(this.def, this.seed);
      this.originMs = e.timeStamp;
    }
    const st = this.state;
    let ms = Math.round(e.timeStamp - this.originMs);
    ms = Math.max(ms, tickStartMs(st.tick), this.lastLoggedMs, 0);
    if (ms >= this.durationMs) return "ignored"; // the Trial is over; late keys neither count nor get logged
    const tick = msToTick(ms);
    if (tick > st.tick) stepTrial(st, tick - st.tick);
    applyTrialInput(st, { tick, key });
    this.log.push({ ms, input: { tick, key } });
    this.lastLoggedMs = ms;
    return "typed";
  }

  /** Frame update: advance toward `now`, trailing by CLIENT_LAG_TICKS. Returns true once the run is over. */
  onFrame(now: number): boolean {
    const st = this.state;
    if (!st) return false;
    const ms = Math.max(0, Math.floor(now - this.originMs));
    const target = msToTick(ms) - CLIENT_LAG_TICKS;
    if (target > st.tick) stepTrial(st, Math.min(target, st.durationTicks) - st.tick);
    return this.done;
  }

  result(): (TrialResult & { hash: string }) | null {
    if (!this.state) return null;
    const r = getTrialResult(this.state);
    return r ? { ...r, hash: hash(this.state) } : null;
  }

  /** The exact submit payload for `ticket` (log -> encodeLog -> deflate-raw -> base64). Only valid once done. */
  async buildSubmission(
    ticket: RunTicketT,
    clientVersion: string,
    timerResolutionMs: number,
  ): Promise<RunSubmitBody> {
    const r = this.result();
    if (!r) throw new Error("trial is not finished");
    return {
      runId: ticket.runId,
      sig: ticket.sig,
      logFormat: "hdk1",
      log: await encodeLogWire(encodeLog(this.log)),
      eventCount: this.log.length,
      claimed: {
        correctChars: r.correctChars,
        typos: r.typos,
        wpmX100: r.wpmX100,
        accuracyBp: r.accuracyBp,
        finalHash: r.hash,
      },
      simVersion: SIM_VERSION,
      contentVersion: CONTENT_VERSION,
      clientVersion,
      timerResolutionMs,
    };
  }
}

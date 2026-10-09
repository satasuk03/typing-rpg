import {
  applyInput,
  applyTrialInput,
  createLevel,
  createTrial,
  getResult,
  getTrialResult,
  step,
  stepTrial,
} from "./api.ts";
import { SimError } from "./errors.ts";
import type { SimEvent } from "./events.ts";
import { hashPlain } from "./hash.ts";
import type { SimInput } from "./input.ts";
import { TICK_HZ, type Tick } from "./time.ts";
import type {
  LevelOptions,
  LevelResult,
  LevelState,
  Loadout,
  ReplayResult,
  ResolvedLevel,
  ResolvedTrial,
  TrialResult,
  TrialState,
} from "./types.ts";

/** BALANCE.MAX_LEVEL_S (1200 s) in ticks; the level step itself produces LevelFailed{timeout} at this point. */
export const MAX_LEVEL_TICKS = 1200 * TICK_HZ;

/** The operations the replay runner needs from a sim (level, trial, or a test toy). */
export interface ReplayDriver<S, R> {
  create(): S;
  applyInput(state: S, input: SimInput): SimEvent[];
  /** Advance n >= 0 ticks; must be a no-op on a terminal state. */
  step(state: S, n: number): SimEvent[];
  tickOf(state: S): Tick;
  isTerminal(state: S): boolean;
  result(state: S): R | null;
  /** The runner never steps past this tick (level: MAX_LEVEL_S in ticks; trial: durationTicks). */
  maxTick: Tick;
}

/**
 * Steps to each input's tick and applies it; STOPS consuming inputs once the state is terminal (later inputs are
 * ignored, not errors). After the last input keeps stepping until terminal, `untilTick`, or `driver.maxTick`.
 * Throws on non-monotonic ticks (checked up front, over every input, so a bad tail is never silently skipped).
 */
export function runReplay<S, R>(
  driver: ReplayDriver<S, R>,
  inputs: readonly SimInput[],
  opts: { untilTick?: Tick; collectEvents?: boolean } = {},
): ReplayResult<S, R> {
  let prev = 0;
  for (const input of inputs) {
    if (!Number.isSafeInteger(input.tick) || input.tick < prev) {
      throw new SimError(`non-monotonic input tick ${input.tick} after ${prev}`);
    }
    prev = input.tick;
  }
  const collect = opts.collectEvents !== false;
  const events: SimEvent[] = [];
  const push = (evs: SimEvent[]): void => {
    if (collect) for (const e of evs) events.push(e);
  };
  const limit = Math.min(opts.untilTick ?? driver.maxTick, driver.maxTick);
  const state = driver.create();

  for (const input of inputs) {
    if (driver.isTerminal(state)) break; // terminal-safe: ignore the rest
    if (input.tick > limit) break;
    const now = driver.tickOf(state);
    if (input.tick > now) {
      push(driver.step(state, input.tick - now));
      if (driver.isTerminal(state)) break;
    }
    push(driver.applyInput(state, input));
  }
  const now = driver.tickOf(state);
  if (!driver.isTerminal(state) && now < limit) push(driver.step(state, limit - now));

  return {
    finalState: state,
    events,
    hash: hashPlain(state),
    result: driver.result(state),
  };
}

/** Level replay (docs/interfaces.md §3). Bodies of createLevel/step arrive in T1.2+. */
export function replay(
  def: ResolvedLevel,
  loadout: Loadout,
  seed: number,
  options: LevelOptions,
  inputs: readonly SimInput[],
  opts?: { untilTick?: Tick; collectEvents?: boolean },
): ReplayResult<LevelState, LevelResult> {
  return runReplay<LevelState, LevelResult>(
    {
      create: () => createLevel(def, loadout, seed, options),
      applyInput,
      step,
      tickOf: (s) => s.tick,
      isTerminal: (s) => s.phase === "cleared" || s.phase === "failed",
      result: getResult,
      maxTick: MAX_LEVEL_TICKS,
    },
    inputs,
    opts,
  );
}

/** Same terminal rule as replay(); always steps to durationTicks. */
export function replayTrial(
  def: ResolvedTrial,
  seed: number,
  inputs: readonly SimInput[],
  opts?: { collectEvents?: boolean },
): ReplayResult<TrialState, TrialResult> {
  return runReplay<TrialState, TrialResult>(
    {
      create: () => createTrial(def, seed),
      applyInput: applyTrialInput,
      step: stepTrial,
      tickOf: (s) => s.tick,
      isTerminal: (s) => s.tick >= def.durationTicks,
      result: getTrialResult,
      maxTick: def.durationTicks,
    },
    inputs,
    opts,
  );
}

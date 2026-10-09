// Typing Trial (T5.1): the 60 s seeded passage behind the only leaderboard. Rules: docs/interfaces.md §3 (Trial), §10, D25.
//   - Tick 0 = the first key (the client creates the clock at the first accepted keydown); the run is terminal at
//     tick === durationTicks and a key at tick >= durationTicks never counts.
//   - Stop-on-error: a wrong key is a typo and does NOT advance the cursor; the same char must then be typed.
//   - Spaces are typed characters. Comparison is exact (case-sensitive): passages are typed as written.
//   - Escape and commands (abandon) are no-ops here; the client aborts the run by not submitting.
//   - The passage is passages[below(deriveRng(seed, "trial"), passages.length)].
import { CONTENT_VERSION, type ContentBundle } from "@hd2d/content";
import { SimError } from "./errors.ts";
import type { KeyStreakTier, SimEvent } from "./events.ts";
import { BP, mulDiv } from "./fixed.ts";
import type { SimInput } from "./input.ts";
import { below, deriveRng } from "./rng.ts";
import { TICK_HZ } from "./time.ts";
import type { ResolvedTrial, TrialResult, TrialState } from "./types.ts";
import type { TrialView } from "./view.ts";

/** Key-streak colour tiers (docs/interfaces.md §3.3): gold 10, ember 25, azure 50, prismatic 100. Copied from typing.ts. */
const STREAK_TIERS = [10, 25, 50, 100] as const;
const streakTier = (streak: number): KeyStreakTier => {
  let t = 0;
  for (const th of STREAK_TIERS) if (streak >= th) t++;
  return t as KeyStreakTier;
};
/** Live WPM smoothing: the first second counts as a full second so one early key does not spike the readout. */
const MIN_WPM_TICKS = TICK_HZ;
/** Trial plates reuse the level event shapes with this pseudo plate id. */
const TRIAL_PLATE_ID = 0;

export function resolveTrial(bundle: ContentBundle, trialId: string): ResolvedTrial {
  const def = bundle.trials.find((t) => t.id === trialId);
  if (def === undefined) throw new SimError(`resolveTrial: unknown trial ${trialId}`);
  return {
    trialId: def.id,
    durationTicks: def.durationS * TICK_HZ,
    passages: [...def.passages],
    contentVersion: CONTENT_VERSION,
  };
}

export function createTrial(def: ResolvedTrial, seed: number): TrialState {
  if (def.passages.length < 1) throw new SimError("createTrial: no passages");
  if (!Number.isSafeInteger(def.durationTicks) || def.durationTicks < 1) {
    throw new SimError(`createTrial: bad durationTicks ${def.durationTicks}`);
  }
  const passage = def.passages[below(deriveRng(seed, "trial"), def.passages.length)] as string;
  return {
    kind: "trial",
    simVersion: 1,
    tick: 0,
    seed,
    trialId: def.trialId,
    durationTicks: def.durationTicks,
    passage,
    started: false,
    typedIndex: 0,
    correctChars: 0,
    typos: 0,
    keyStreak: 0,
    keyStreakTier: 0,
    lastTypoTick: -1,
  };
}

const isTerminal = (s: Readonly<TrialState>): boolean => s.tick >= s.durationTicks;

function resultOf(s: Readonly<TrialState>): TrialResult {
  const total = s.correctChars + s.typos;
  return {
    correctChars: s.correctChars,
    typos: s.typos,
    wpmX100: mulDiv(s.correctChars, 6000 * TICK_HZ, 5 * s.durationTicks),
    accuracyBp: total === 0 ? BP : mulDiv(s.correctChars, BP, total),
    durationTicks: s.durationTicks,
  };
}

/** Advances n >= 0 ticks, clamped at durationTicks; emits TrialEnded when the end is reached. No-op once terminal. */
export function stepTrial(state: TrialState, n = 1): SimEvent[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new SimError(`stepTrial: bad n ${n}`);
  if (isTerminal(state) || n === 0) return [];
  state.tick = Math.min(state.tick + n, state.durationTicks);
  if (!isTerminal(state)) return [];
  return [{ type: "TrialEnded", tick: state.tick, result: resultOf(state) }];
}

/** Requires input.tick === state.tick (like applyInput). Keys at/after durationTicks and anything on a terminal state are ignored. */
export function applyTrialInput(state: TrialState, input: SimInput): SimEvent[] {
  if (isTerminal(state) || input.tick >= state.durationTicks) return [];
  if (input.tick !== state.tick) {
    throw new SimError(`applyTrialInput: input.tick ${input.tick} !== state.tick ${state.tick}`);
  }
  if (!("key" in input) || input.key === "Escape") return [];
  if (state.typedIndex >= state.passage.length) return []; // passage exhausted: nothing left to type
  const events: SimEvent[] = [];
  const tick = state.tick;
  if (!state.started) {
    state.started = true;
    events.push({
      type: "TrialStarted",
      tick,
      trialId: state.trialId,
      durationTicks: state.durationTicks,
      passageLength: state.passage.length,
    });
  }
  const index = state.typedIndex;
  const expected = state.passage.charAt(index);
  if (input.key === expected) {
    state.typedIndex = index + 1;
    state.correctChars++;
    state.keyStreak++;
    const from = state.keyStreakTier;
    const to = streakTier(state.keyStreak);
    state.keyStreakTier = to;
    events.push({
      type: "CharCorrect",
      tick,
      plateId: TRIAL_PLATE_ID,
      ownerId: null,
      kind: "trial",
      index,
      char: expected,
      isLast: state.typedIndex === state.passage.length,
      combo: 0,
      comboTier: 0,
      keyStreak: state.keyStreak,
      keyStreakTier: to,
      atbGainM: 0,
    });
    if (to !== from) {
      events.push({ type: "KeyStreakTierChanged", tick, from, to, keyStreak: state.keyStreak });
    }
  } else {
    const before = state.keyStreak;
    const from = state.keyStreakTier;
    state.typos++;
    state.keyStreak = 0;
    state.keyStreakTier = 0;
    state.lastTypoTick = tick;
    events.push({
      type: "Typo",
      tick,
      plateId: TRIAL_PLATE_ID,
      ownerId: null,
      kind: "trial",
      index,
      expected,
      got: input.key,
      comboBefore: 0,
      combo: 0,
      keyStreakBefore: before,
      penalty: "none",
    });
    if (from !== 0) events.push({ type: "KeyStreakTierChanged", tick, from, to: 0, keyStreak: 0 });
  }
  return events;
}

export function getTrialView(state: Readonly<TrialState>): TrialView {
  const total = state.correctChars + state.typos;
  return {
    tick: state.tick,
    started: state.started,
    ticksLeft: state.durationTicks - state.tick,
    passage: state.passage,
    typedIndex: state.typedIndex,
    keyStreak: state.keyStreak,
    keyStreakTier: state.keyStreakTier,
    lastTypoTick: state.lastTypoTick < 0 ? null : state.lastTypoTick,
    netWpm: Math.floor((state.correctChars * 12 * TICK_HZ) / Math.max(state.tick, MIN_WPM_TICKS)),
    accuracy: total === 0 ? BP : mulDiv(state.correctChars, BP, total),
    done: isTerminal(state),
  };
}

/** The final result once the run is terminal, else null. */
export function getTrialResult(state: Readonly<TrialState>): TrialResult | null {
  return isTerminal(state) ? resultOf(state) : null;
}

/** Leaderboard score (D25): wpmX100 * 10000 + accuracyBp. */
export const trialScore = (r: Pick<TrialResult, "wpmX100" | "accuracyBp">): number =>
  r.wpmX100 * 10_000 + r.accuracyBp;

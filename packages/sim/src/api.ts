// Public level/trial API (docs/interfaces.md §3). T1.1 publishes the signatures as throwing stubs so that
// consumers can import and mock them; T1.2+ (typing, combat, boss, trial) replace the bodies.
import type { ContentBundle } from "@hd2d/content";
import { SimError } from "./errors.ts";
import type { SimEvent } from "./events.ts";
import type { Milli } from "./fixed.ts";
import type { SimInput } from "./input.ts";
import type {
  LevelOptions,
  LevelResult,
  LevelState,
  Loadout,
  ResolvedLevel,
  ResolvedTrial,
  TrialResult,
  TrialState,
} from "./types.ts";
import type { LevelView, TrialView } from "./view.ts";

const notImplemented = (name: string, task: string): never => {
  throw new SimError(`${name}: not implemented yet (${task})`);
};

/** Deterministic given (bundle contents, levelId, ctx). Fixtures are keyed on (contentVersion, levelId, ctx). */
export function resolveLevel(
  _bundle: ContentBundle,
  _levelId: string,
  _ctx: { dueWeakWords: string[] },
): ResolvedLevel {
  return notImplemented("resolveLevel", "T1.5");
}

export function resolveTrial(_bundle: ContentBundle, _trialId: string): ResolvedTrial {
  return notImplemented("resolveTrial", "T5.1");
}

// T1.2: the typing-only level runtime lives in level.ts (createLevel, applyInput, step, getView, getResult).
export { applyInput, createLevel, getResult, getView, step } from "./level.ts";

export function computeHeroStats(_loadout: Loadout): { atk: Milli; maxHp: Milli } {
  return notImplemented("computeHeroStats", "T1.3");
}

/** passage = passages[below(deriveRng(seed, "trial"), passages.length)]. Tick 0 = the first key. */
export function createTrial(_def: ResolvedTrial, _seed: number): TrialState {
  return notImplemented("createTrial", "T5.1");
}

/** Inputs with tick >= durationTicks never count: the trial is terminal once state.tick === durationTicks. */
export function applyTrialInput(_state: TrialState, _input: SimInput): SimEvent[] {
  return notImplemented("applyTrialInput", "T5.1");
}

export function stepTrial(_state: TrialState, _n?: number): SimEvent[] {
  return notImplemented("stepTrial", "T5.1");
}

export function getTrialView(_state: Readonly<TrialState>): TrialView {
  return notImplemented("getTrialView", "T5.1");
}

export function getTrialResult(_state: Readonly<TrialState>): TrialResult | null {
  return notImplemented("getTrialResult", "T5.1");
}

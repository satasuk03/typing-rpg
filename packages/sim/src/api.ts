// Public level/trial API (docs/interfaces.md §3). T1.1 publishes the signatures as throwing stubs so that
// consumers can import and mock them; T1.2+ (typing, combat, boss, trial) replace the bodies.
import type { ContentBundle } from "@hd2d/content";
import { SimError } from "./errors.ts";
import type { Milli } from "./fixed.ts";
import type { LevelOptions, LevelResult, LevelState, Loadout, ResolvedLevel } from "./types.ts";
import type { LevelView } from "./view.ts";

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

// T1.2: the typing-only level runtime lives in level.ts (createLevel, applyInput, step, getView, getResult).
export { applyInput, createLevel, getResult, getView, step } from "./level.ts";
// T5.1: the Typing Trial runtime lives in trial.ts.
export { resolveTrial } from "./trial.ts";

export function computeHeroStats(_loadout: Loadout): { atk: Milli; maxHp: Milli } {
  return notImplemented("computeHeroStats", "T1.3");
}

export { applyTrialInput, createTrial, getTrialResult, getTrialView, stepTrial } from "./trial.ts";

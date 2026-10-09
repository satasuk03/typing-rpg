// Public level/trial API (docs/interfaces.md §3). T1.1 publishes the signatures as throwing stubs so that
// consumers can import and mock them; T1.2+ (typing, combat, boss, trial) replace the bodies.

// T1.2: the typing-only level runtime lives in level.ts (createLevel, applyInput, step, getView, getResult).
export { applyInput, createLevel, getResult, getView, step } from "./level.ts";
// T1.5: resolveLevel lives in resolve.ts.
export { resolveLevel } from "./resolve.ts";
// T5.1: the Typing Trial runtime lives in trial.ts.
export {
  applyTrialInput,
  createTrial,
  getTrialResult,
  getTrialView,
  resolveTrial,
  stepTrial,
} from "./trial.ts";

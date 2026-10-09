// Level phase helpers shared by the level runtime (level.ts), combat (combat.ts) and encounter code (encounter.ts).

import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { mulBp } from "./fixed.ts";
import type { LevelPhase, LevelState } from "./types.ts";

export const isTerminal = (s: Readonly<LevelState>): boolean =>
  s.phase === "cleared" || s.phase === "failed";

export function setPhase(state: LevelState, phase: LevelPhase, until: number | null): void {
  state.phase = phase;
  state.phaseUntil = until;
  state.run.phaseStart = state.tick;
}

/** Ends the level as failed. `goldKept` = floor(goldCollected x FAIL_GOLD_KEEP) (interfaces §3.3 "Fail"). */
export function failLevel(
  state: LevelState,
  reason: "abandoned" | "timeout" | "defeated",
  emit: Emit,
): void {
  const run = state.run;
  run.failReason = reason;
  run.endTick = state.tick;
  setPhase(state, "failed", null);
  emit({
    type: "LevelFailed",
    tick: state.tick,
    reason,
    goldKept: mulBp(run.goldCollected, K.FAIL_GOLD_KEEP_BP),
  });
}

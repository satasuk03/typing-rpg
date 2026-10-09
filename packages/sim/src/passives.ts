// Passive helpers (T1.4): equipped check, the PassiveTriggered event, Last Stand, and the TutorialCue one-shots.
// Depends only on state and the event bus, so typing.ts, combat.ts, attack.ts and guard.ts can all import it.
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import type { EntityId } from "./events.ts";
import { BP, mulBp } from "./fixed.ts";
import type { RunState } from "./state.ts";
import type { LevelState, PassiveId } from "./types.ts";

export const hasPassive = (run: Readonly<RunState>, id: PassiveId): boolean =>
  (run.loadout.passives as readonly (string | null)[]).includes(id);

export function emitPassive(
  state: LevelState,
  id: PassiveId,
  targetId: EntityId | null,
  emit: Emit,
): void {
  emit({ type: "PassiveTriggered", tick: state.tick, passiveId: id, targetId });
}

/**
 * Last Stand: ATB charge x LAST_STAND_ATB_MULT while HP is below LAST_STAND_HP_BELOW of max. Returns the multiplier in
 * bp (BP when not equipped or HP is healthy) and emits PassiveTriggered on the edge into the low-HP state.
 */
export function lastStandMultBp(state: LevelState, emit: Emit): number {
  const run = state.run;
  if (!hasPassive(run, "lastStand")) return BP;
  const low = run.heroHpM > 0 && run.heroHpM < mulBp(run.heroMaxHpM, K.LAST_STAND_HP_BELOW_BP);
  if (low && !run.lastStandOn) emitPassive(state, "lastStand", null, emit);
  run.lastStandOn = low;
  return low ? K.LAST_STAND_ATB_MULT_BP : BP;
}

export type TutorialCueId = "target" | "atb" | "guard" | "skill" | "combo";

/**
 * L1-1 onboarding (options.tutorial only): each cue fires once per level.
 *  target: typing goes live in the first encounter. atb: the first correct char that charges the gauge.
 *  guard: the first guard word is shown. skill: the first plate that charges an equipped skill.
 *  combo: the combo first reaches Bronze (5).
 */
export function tutorialCue(state: LevelState, cue: TutorialCueId, emit: Emit): void {
  const run = state.run;
  if (!run.options.tutorial || run.cues.includes(cue)) return;
  run.cues.push(cue);
  emit({ type: "TutorialCue", tick: state.tick, cue });
}

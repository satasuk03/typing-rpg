// Healers (v2.0, interfaces §3.5). Integer and RNG-free: heal timing and targets are pure functions of the state.
// A healer keeps its grunt attack timer; this is a second, independent timer (EnemyState.nextHealTick).

import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { mulBp, toDisplay } from "./fixed.ts";
import { enemyDef, paceFactorBp } from "./guard.ts";
import type { EncounterState, EnemyState } from "./state.ts";
import type { LevelState } from "./types.ts";

/** healTicks = everyTicks x PACE_FACTOR_BP[pace] x PRESET_INTERVAL_MULT_BP[difficulty], at least 1. */
export function healIntervalTicks(state: LevelState, defId: string): number {
  const run = state.run;
  const heal = enemyDef(state, defId).heal;
  if (heal === undefined) return 0;
  const preset = K.PRESET_INTERVAL_MULT_BP[run.options.difficulty] as number;
  return Math.max(1, mulBp(mulBp(heal.everyTicks, paceFactorBp(run.options.pace)), preset));
}

/** At spawn: the first heal is due at max(spawnTick, typingFromTick) + healTicks. No-op for non-healers (keys stay absent). */
export function initHeal(state: LevelState, enemy: EnemyState): void {
  const heal = enemyDef(state, enemy.defId).heal;
  if (heal === undefined) return;
  const enc = state.enc as EncounterState;
  enemy.nextHealTick =
    Math.max(enemy.spawnTick, enc.typingFromTick) + healIntervalTicks(state, enemy.defId);
  enemy.healsDone = 0;
}

/** Step 3b: per healer in slot order, a due heal (not Broken / Frost-Locked) restores the lowest-fraction allies. */
export function stepHeals(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  if (enc.finisherShown) return;
  for (const healer of enc.enemies) {
    if (state.phase !== "combat") return;
    if (!healer.alive || healer.nextHealTick === undefined) continue;
    const heal = enemyDef(state, healer.defId).heal;
    if (heal === undefined) continue;
    if (heal.maxHeals > 0 && (healer.healsDone ?? 0) >= heal.maxHeals) continue;
    if (t < healer.nextHealTick) continue;
    if (healer.brokenUntil !== null || healer.frozenUntil !== null) continue; // deferred to the tick the status ends
    healer.nextHealTick = t + healIntervalTicks(state, healer.defId);
    const targets = enc.enemies
      .filter((e) => e !== healer && e.alive && !e.isBoss && e.hpM < e.maxHpM)
      .sort((a, b) => {
        const c = a.hpM * b.maxHpM - b.hpM * a.maxHpM;
        return c !== 0 ? c : a.slot - b.slot;
      })
      .slice(0, heal.maxTargets);
    let effective = false;
    for (const target of targets) {
      const amountM = Math.min(mulBp(target.maxHpM, heal.fracBp), target.maxHpM - target.hpM);
      if (amountM <= 0) continue;
      target.hpM += amountM;
      effective = true;
      emit({
        type: "EnemyHealed",
        tick: t,
        sourceId: healer.id,
        targetId: target.id,
        amount: toDisplay(amountM),
        amountM,
        hpAfter: toDisplay(target.hpM),
        maxHp: toDisplay(target.maxHpM),
      });
    }
    if (effective) healer.healsDone = (healer.healsDone ?? 0) + 1;
  }
}

/** Encounter freeze (Second Wind, boss breather): the heal timer shifts like every other enemy timer. */
export function shiftHealTimer(enemy: EnemyState, delta: number): void {
  if (enemy.nextHealTick !== undefined) enemy.nextHealTick += delta;
}

/** EnemyView.healer (✚ badge + charge ring); undefined for non-healers. */
export function healerView(
  state: LevelState,
  e: EnemyState,
  t: number,
): { ticksLeft: number | null; totalTicks: number; healsLeft: number | null } | undefined {
  const heal = enemyDef(state, e.defId).heal;
  if (heal === undefined || e.nextHealTick === undefined) return undefined;
  const healsLeft = heal.maxHeals > 0 ? Math.max(0, heal.maxHeals - (e.healsDone ?? 0)) : null;
  const paused = e.brokenUntil !== null || e.frozenUntil !== null || healsLeft === 0;
  return {
    ticksLeft: paused ? null : Math.max(0, e.nextHealTick - t),
    totalTicks: healIntervalTicks(state, e.defId),
    healsLeft,
  };
}

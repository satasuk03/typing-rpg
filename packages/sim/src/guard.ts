// Enemy attack timers + guard words (T1.2). The timer is a minimal stub so typing is testable end to end; T1.3 combat
// owns the real thing and plugs in through two seams:
//   scheduleAttack(state, enemy, impactTick)  -- (re)schedules an enemy's next impact (stagger-aware), arms its guard word
//   ImpactResolver                           -- called at impact; applies damage/parry/block and reschedules
// Rules: doc 01 §1.7, interfaces §3.3 "Guard (D13)" and §3.2 step 3.

import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { SimError } from "./errors.ts";
import { mulBp } from "./fixed.ts";
import type { EncounterState, EnemyState, PlateState } from "./state.ts";
import { PACE_FACTOR_BP } from "./tables.generated.ts";
import type { LevelState, ResolvedEnemy } from "./types.ts";
import { addPlate, dropTarget, findPlate, removePlate, visibleFirstLetters } from "./typing.ts";
import { pickGuardWord } from "./words.ts";

export type ImpactResolver = (state: LevelState, enemy: EnemyState, emit: Emit) => void;

/** PACE_FACTOR_BP lookup: integer pace 15..120 (clamped). */
export const paceFactorBp = (pace: number): number =>
  PACE_FACTOR_BP[Math.min(K.PACE_MAX, Math.max(K.PACE_MIN, pace)) - K.PACE_MIN] as number;

export function enemyDef(state: LevelState, defId: string): ResolvedEnemy {
  const d = state.run.def.enemies[defId];
  if (d === undefined) throw new SimError(`unknown enemy def ${defId}`);
  return d;
}

/** interval = baseInterval x PACE_FACTOR x PRESET_INTERVAL_MULT (interfaces §3.3 "Enemy timers"). */
export function attackIntervalTicks(state: LevelState, defId: string): number {
  const run = state.run;
  const preset = K.PRESET_INTERVAL_MULT_BP[run.options.difficulty] as number;
  return Math.max(
    1,
    mulBp(mulBp(enemyDef(state, defId).baseIntervalTicks, paceFactorBp(run.options.pace)), preset),
  );
}

/** guardTicks = max(1.5 s, 2.5 s x paceFactor) (+1 s on the story preset; x2 for the tutorial's first guard). */
export function guardSpanTicks(state: LevelState): number {
  const run = state.run;
  let g = Math.max(K.GUARD_MIN_T, mulBp(K.GUARD_T, paceFactorBp(run.options.pace)));
  if (run.options.difficulty === "story") g += K.STORY_GUARD_BONUS_T;
  if (run.options.tutorial && run.guardsShown === 0) g = mulBp(g, K.TUTORIAL_FIRST_GUARD_MULT_BP);
  return g;
}

/**
 * (Re)schedules an enemy's next impact. Impacts of different enemies are kept >= TELEGRAPH_STAGGER_T apart by pushing
 * this one later (doc 01 §1.7). Resets the guard state for the new cycle. T1.3: call this for any attack you start.
 */
export function scheduleAttack(state: LevelState, enemy: EnemyState, desiredImpact: number): void {
  const enc = state.enc as EncounterState;
  let d = desiredImpact;
  for (let guard = 0; guard < 64; guard++) {
    let moved = false;
    for (const o of enc.enemies) {
      if (o === enemy || !o.alive || o.nextImpact === null) continue;
      if (Math.abs(d - o.nextImpact) < K.TELEGRAPH_STAGGER_T) {
        d = o.nextImpact + K.TELEGRAPH_STAGGER_T;
        moved = true;
      }
    }
    if (!moved) break;
  }
  enemy.nextImpact = d;
  enemy.guardTicks = guardSpanTicks(state);
  enemy.windupShown = false;
  enemy.guardResult = null;
}

/** Cancels an enemy's scheduled attack (zen, boss phases, break). A shown guard word stays until the caller replaces it. */
export function cancelAttack(enemy: EnemyState): void {
  enemy.nextImpact = null;
  enemy.windupShown = false;
  enemy.guardResult = null;
}

/** Initial timer of a freshly spawned enemy: random 0-30% progress (enemyAi stream), counted from when typing is live. */
export function initAttack(state: LevelState, enemy: EnemyState, progressBp: number): void {
  const enc = state.enc as EncounterState;
  const start = Math.max(state.tick, enc.typingFromTick);
  enemy.intervalTicks = attackIntervalTicks(state, enemy.defId);
  enemy.cycleStart = start;
  if (state.run.options.difficulty === "zen") {
    cancelAttack(enemy);
    return;
  }
  scheduleAttack(
    state,
    enemy,
    start + enemy.intervalTicks - mulBp(enemy.intervalTicks, progressBp),
  );
}

/** Starts a fresh attack cycle from now (after a Break or a revive): a full interval, no head start; zen never attacks. */
export function restartAttackCycle(state: LevelState, enemy: EnemyState): void {
  const t = state.tick;
  enemy.cycleStart = t;
  cancelAttack(enemy);
  if (state.run.options.difficulty === "zen") return;
  scheduleAttack(state, enemy, t + enemy.intervalTicks);
}

/** Tutorial hold (BALANCE.TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS): pushes every not-yet-telegraphed attack back by one tick. */
export function holdAttacks(state: LevelState): void {
  const enc = state.enc as EncounterState;
  for (const e of enc.enemies) {
    if (!e.alive || e.nextImpact === null || e.windupShown) continue;
    e.nextImpact++;
    e.cycleStart++;
  }
}

/** Swaps the enemy's plate for a guard word and emits EnemyAttackWindup + GuardWordShown (step 3). */
export function startGuard(state: LevelState, enemy: EnemyState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const t = state.tick;
  const impact = enemy.nextImpact as number;
  const old: PlateState | null = findPlate(enc, enemy.plateId);
  const word = pickGuardWord(
    run.def,
    enc.wordsRng,
    visibleFirstLetters(enc, old === null ? null : old.id),
  );
  const span = Math.max(1, impact - t);
  emit({
    type: "EnemyAttackWindup",
    tick: t,
    enemyId: enemy.id,
    impactTick: impact,
    heavy: enemyDef(state, enemy.defId).heavy,
  });
  if (old !== null) {
    if (enc.targetPlateId === old.id) dropTarget(state, "plateChanged", emit);
    removePlate(state, old, "replaced", emit);
  }
  const plate = addPlate(
    state,
    {
      ownerId: enemy.id,
      kind: "guard",
      text: word,
      replacesPlateId: old === null ? null : old.id,
      expiresAt: impact,
      totalTicks: span,
    },
    emit,
  );
  enemy.plateId = plate.id;
  enemy.windupShown = true;
  run.guardsShown++;
  emit({
    type: "GuardWordShown",
    tick: t,
    enemyId: enemy.id,
    plateId: plate.id,
    text: word,
    impactTick: impact,
    spanTicks: span,
  });
}

/** Step 3 of the tick: per enemy in slot order, windup/guard swap at impact - guardTicks, then the impact. */
export function stepEnemyAttacks(state: LevelState, resolve: ImpactResolver, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  for (const enemy of enc.enemies) {
    if (state.phase !== "combat") return; // the hero went down mid-tick: the encounter is frozen
    if (!enemy.alive || enemy.nextImpact === null) continue;
    if (!enemy.windupShown && t >= enemy.nextImpact - enemy.guardTicks)
      startGuard(state, enemy, emit);
    if (enemy.nextImpact !== null && t >= enemy.nextImpact) resolve(state, enemy, emit);
  }
}

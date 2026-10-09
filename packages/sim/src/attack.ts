// Hero auto-attack launch (T1.3). Called by typing.addAtb the moment the ATB gauge fills (after AtbFilled):
// picks the focus target, rolls the crit (D10) and schedules the impact ATTACK_IMPACT_T ticks later.
// The impact itself (damage chain, shields, Break) is resolved in combat.ts, tick step 2.

import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { mulDiv } from "./fixed.ts";
import { emitPassive, hasPassive } from "./passives.ts";
import { chance } from "./rng.ts";
import type { EncounterState, EnemyState, RunState } from "./state.ts";
import type { LevelState } from "./types.ts";

/** A phase-gated enemy that already sits at its gate: damage cannot hurt it (T1.5: the 66% gate waits for the adds). */
export const gatedAtFloor = (e: Readonly<EnemyState>): boolean =>
  e.gateHpM !== null && e.hpM <= e.gateHpM;

/**
 * The Focus if alive, else the lowest-slot living enemy, else null. A boss waiting at its phase gate is skipped while
 * another enemy (its adds) can still take damage, so attacks and skills are not wasted on a clamped target.
 */
export function heroImpactTarget(enc: EncounterState): EnemyState | null {
  const focus = enc.enemies.find((e) => e.id === enc.focusEnemyId && e.alive);
  const pick = focus !== undefined ? focus : (enc.enemies.find((e) => e.alive) ?? null);
  if (pick !== null && gatedAtFloor(pick)) {
    const other = enc.enemies.find((e) => e.alive && !gatedAtFloor(e));
    if (other !== undefined) return other;
  }
  return pick;
}

/**
 * Auto-attack crit chance in basis points (D10): BASE_CRIT + PERFECT_CRIT_BONUS x perfectWords / wordsCompleted, counted
 * since the previous auto-attack. With no completed words the share is 0 and the chance is BASE_CRIT.
 * Clean Cut (passed via `run`) adds CLEAN_CUT_CRIT when the last completed word was perfect.
 */
export function critChanceBp(enc: Readonly<EncounterState>, run?: Readonly<RunState>): number {
  const share =
    enc.critWords > 0 ? mulDiv(K.PERFECT_CRIT_BONUS_BP, enc.critPerfect, enc.critWords) : 0;
  return (
    K.BASE_CRIT_BP + share + (run !== undefined && cleanCutActive(run) ? K.CLEAN_CUT_CRIT_BP : 0)
  );
}

const cleanCutActive = (run: Readonly<RunState>): boolean =>
  run.lastWordPerfect && hasPassive(run, "cleanCut");

/** ATB just filled: emit AutoAttack and schedule the impact. The crit roll ALWAYS draws from the `combat` stream. */
export function launchAutoAttack(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const crit = chance(enc.combatRng, critChanceBp(enc, run));
  enc.critWords = 0;
  enc.critPerfect = 0;
  const target = heroImpactTarget(enc);
  if (target === null) return; // nothing alive to hit (the gauge fired into the void)
  const w = K.WEAPONS[run.loadout.weapon.archetype];
  const impactTick = state.tick + K.ATTACK_IMPACT_T;
  run.stats.autoAttacks++;
  enc.pending.push({ tick: impactTick, kind: "auto", targetId: target.id, crit });
  emit({
    type: "AutoAttack",
    tick: state.tick,
    targetId: target.id,
    archetype: run.loadout.weapon.archetype,
    hits: w.hits,
    impactTick,
    crit,
  });
  if (cleanCutActive(run)) emitPassive(state, "cleanCut", target.id, emit);
}

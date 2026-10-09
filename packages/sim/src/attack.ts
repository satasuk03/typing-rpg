// Hero auto-attack launch (T1.3). Called by typing.addAtb the moment the ATB gauge fills (after AtbFilled):
// picks the focus target, rolls the crit (D10) and schedules the impact ATTACK_IMPACT_T ticks later.
// The impact itself (damage chain, shields, Break) is resolved in combat.ts, tick step 2.

import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { mulDiv } from "./fixed.ts";
import { chance } from "./rng.ts";
import type { EncounterState, EnemyState } from "./state.ts";
import type { LevelState } from "./types.ts";

/** The Focus if alive, else the lowest-slot living enemy, else null. */
export function heroImpactTarget(enc: EncounterState): EnemyState | null {
  const focus = enc.enemies.find((e) => e.id === enc.focusEnemyId && e.alive);
  if (focus !== undefined) return focus;
  return enc.enemies.find((e) => e.alive) ?? null;
}

/**
 * Auto-attack crit chance in basis points (D10): BASE_CRIT + PERFECT_CRIT_BONUS x perfectWords / wordsCompleted, counted
 * since the previous auto-attack. With no completed words the share is 0 and the chance is BASE_CRIT.
 * T1.4 adds Clean Cut (+10% if the last word was perfect) here.
 */
export function critChanceBp(enc: Readonly<EncounterState>): number {
  const share =
    enc.critWords > 0 ? mulDiv(K.PERFECT_CRIT_BONUS_BP, enc.critPerfect, enc.critWords) : 0;
  return K.BASE_CRIT_BP + share;
}

/** ATB just filled: emit AutoAttack and schedule the impact. The crit roll ALWAYS draws from the `combat` stream. */
export function launchAutoAttack(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const crit = chance(enc.combatRng, critChanceBp(enc));
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
}

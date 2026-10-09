// Combat (T1.3): the normative damage chain, hits, weakness/shield/BREAK, phase-gate clamp, enemy impacts with
// block/parry/counter, hero HP, walk heal, Second Wind and the revive hook.
// Rules: docs/interfaces.md §3.3 (damage chain D31, weakness D11, guard D13, Second Wind D17) and doc 01 §1.3, §1.6-1.8.
// Every damage step is mulBp with floor, in this order: source mult -> crit -> weak -> broken -> staggered -> passives.
import type { DamageType } from "@hd2d/content";
import { heroImpactTarget } from "./attack.ts";
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import {
  assignWordPlate,
  enemyById,
  killEnemy,
  revertGuardPlate,
  showFinisher,
} from "./encounter.ts";
import type { EntityId, HitKind, HitOrigin } from "./events.ts";
import { type Milli, mulBp, toDisplay } from "./fixed.ts";
import { failLevel, setPhase } from "./flow.ts";
import { enemyDef, restartAttackCycle, scheduleAttack } from "./guard.ts";
import { below } from "./rng.ts";
import type { EncounterState, EnemyState, RunState } from "./state.ts";
import type { ActiveSkillId, LevelState } from "./types.ts";
import { addAtb, addPlate, dropTarget, removePlate } from "./typing.ts";

/** The last phase gate: a boss never drops below this HP from damage; reaching it shows the Finisher. */
export const FINAL_GATE_M = 1;

// ---------------------------------------------------------------- seams for T1.4 (passives)

const hasPassive = (run: RunState, id: string): boolean =>
  (run.loadout.passives as readonly (string | null)[]).includes(id);

/** BLOCK_MULT, or IRON_WILL_BLOCK_MULT with the Iron Will passive. */
export const blockMultBp = (run: RunState): number =>
  hasPassive(run, "ironWill") ? K.IRON_WILL_BLOCK_MULT_BP : K.BLOCK_MULT_BP;

/** PARRY_COUNTER, or RIPOSTE_COUNTER with the Riposte passive. */
export const counterMultBp = (run: RunState): number =>
  hasPassive(run, "riposte") ? K.RIPOSTE_COUNTER_BP : K.PARRY_COUNTER_BP;

/** Passive damage modifiers in loadout slot order 0..2 (none implemented yet: T1.4 fills this in). */
const passiveDamageModsBp = (_run: RunState): readonly number[] => [];

// ---------------------------------------------------------------- damage chain

export interface DamageSpec {
  kind: HitKind;
  origin: HitOrigin;
  skillId: ActiveSkillId | null;
  /** null = untyped (chips): never weak and never touches shields. */
  damageType: DamageType | null;
  /** atk x source multiplier (weapon atk_mult per hit | skill mult | chip 15/25% | counter 50/150% | minigame clear). */
  baseM: Milli;
  crit: boolean;
  hitIndex: number;
  hitCount: number;
}

export interface ResolvedDamage {
  dmgM: Milli;
  weak: boolean;
  broken: boolean;
}

/** The floor damage cannot take an enemy's HP below (phase gate), 0 when ungated. */
export const gateFloorM = (enemy: EnemyState): number => enemy.gateHpM ?? 0;

/**
 * The normative damage chain. Pure: reads state, mutates nothing. `max(dmg, 1)` first, then the phase-gate clamp
 * (so a hit on a gated enemy that is already at its gate deals 0).
 */
export function resolveDamage(
  state: Readonly<LevelState>,
  enemy: Readonly<EnemyState>,
  spec: DamageSpec,
): ResolvedDamage {
  const run = state.run;
  const def = enemyDef(state as LevelState, enemy.defId);
  let d = spec.baseM;
  if (spec.crit) d = mulBp(d, K.CRIT_MULT_BP);
  const weak = spec.damageType !== null && def.weaknesses.includes(spec.damageType);
  if (weak) d = mulBp(d, K.WEAK_MULT_BP);
  const broken = enemy.brokenUntil !== null;
  if (broken) d = mulBp(d, K.BREAK_DMG_MULT_BP);
  if (enemy.staggerUntil !== null) d = mulBp(d, K.DOOM_STAGGER_DMG_MULT_BP);
  for (const m of passiveDamageModsBp(run)) d = mulBp(d, m);
  d = Math.max(d, 1);
  d = Math.max(0, Math.min(d, enemy.hpM - gateFloorM(enemy)));
  return { dmgM: d, weak, broken };
}

/** Applies one hero hit to an enemy and emits Hit (+ WeaknessRevealed / ShieldDamaged / Break / EnemyDeath). Returns killed. */
export function dealDamage(
  state: LevelState,
  enemy: EnemyState,
  spec: DamageSpec,
  emit: Emit,
): boolean {
  const run = state.run;
  const { dmgM, weak, broken } = resolveDamage(state, enemy, spec);
  const hpBefore = enemy.hpM;
  const floor = gateFloorM(enemy);
  enemy.hpM -= dmgM;
  run.stats.damageByOriginM[spec.origin] += dmgM;
  const killed = enemy.hpM === 0;
  emit({
    type: "Hit",
    tick: state.tick,
    sourceId: 0,
    targetId: enemy.id,
    kind: spec.kind,
    origin: spec.origin,
    skillId: spec.skillId,
    damageType: spec.damageType,
    damage: toDisplay(dmgM),
    damageM: dmgM,
    hpAfter: toDisplay(enemy.hpM),
    maxHp: toDisplay(enemy.maxHpM),
    crit: spec.crit,
    weak,
    broken,
    atbKnockback: false, // hammer knockback is a T1.4 signature
    hitIndex: spec.hitIndex,
    hitCount: spec.hitCount,
    killed,
  });
  if (killed) {
    killEnemy(state, enemy, spec.kind, emit);
    return true;
  }
  if (weak && spec.damageType !== null && countsForShield(spec.kind)) {
    revealWeakness(state, enemy, spec.damageType, emit);
    shieldHit(state, enemy, spec.crit ? 2 : 1, emit);
  }
  if (floor > 0 && enemy.hpM === floor && hpBefore > floor) onGateReached(state, enemy, emit);
  return false;
}

/** Only auto, skill and counter hits can chip a shield (chips, DoTs and minigame hits never do). */
const countsForShield = (kind: HitKind): boolean =>
  kind === "auto" || kind === "skill" || kind === "counter";

function revealWeakness(state: LevelState, enemy: EnemyState, type: DamageType, emit: Emit): void {
  if (enemy.revealed.includes(type)) return;
  enemy.revealed.push(type);
  emit({ type: "WeaknessRevealed", tick: state.tick, enemyId: enemy.id, damageType: type });
}

/** A weak hit removes `points` shield points (1, +1 on a crit). At 0 the enemy is Broken (D11). */
function shieldHit(state: LevelState, enemy: EnemyState, points: number, emit: Emit): void {
  if (enemy.shieldMax <= 0 || enemy.brokenUntil !== null) return;
  enemy.shield = Math.max(0, enemy.shield - points);
  emit({
    type: "ShieldDamaged",
    tick: state.tick,
    enemyId: enemy.id,
    shield: enemy.shield,
    shieldMax: enemy.shieldMax,
  });
  if (enemy.shield === 0) startBreak(state, enemy, emit);
}

/**
 * BREAK: the enemy's attack timer resets and pauses, a windup/guard is cancelled (its plate becomes a normal word
 * again), and it takes x BREAK_DMG_MULT damage for BREAK_S. The shield refills when the Break ends (expireBreaks).
 */
function startBreak(state: LevelState, enemy: EnemyState, emit: Emit): void {
  const until = state.tick + K.BREAK_T;
  enemy.brokenUntil = until;
  revertGuardPlate(state, enemy, "replaced", emit);
  enemy.nextImpact = null;
  enemy.windupShown = false;
  enemy.guardResult = null;
  emit({ type: "Break", tick: state.tick, enemyId: enemy.id, untilTick: until });
}

/** Step 1 of the tick: end Breaks that ran out; the shield refills and the attack timer restarts from a full interval. */
export function expireBreaks(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  for (const e of enc.enemies) {
    if (!e.alive || e.brokenUntil === null || t < e.brokenUntil) continue;
    e.brokenUntil = null;
    e.shield = e.shieldMax;
    emit({ type: "BreakEnded", tick: t, enemyId: e.id });
    restartAttackCycle(state, e);
  }
}

/** Damage reached an enemy's phase gate. Generic seam: T1.5 adds the 66% / 33% gates and phase scripts here. */
function onGateReached(state: LevelState, enemy: EnemyState, emit: Emit): void {
  if (enemy.isBoss && enemy.gateHpM === FINAL_GATE_M) showFinisher(state, enemy, emit);
}

// ---------------------------------------------------------------- hero offense: chips and impacts

/** Word Strike (doc 01 §1.3): CHIP_NORMAL / CHIP_PERFECT x ATK to the plate's owner. Untyped: no weakness, no shield. */
export function chipHit(state: LevelState, enemy: EnemyState, perfect: boolean, emit: Emit): void {
  const bp = perfect ? K.CHIP_PERFECT_BP : K.CHIP_NORMAL_BP;
  dealDamage(
    state,
    enemy,
    {
      kind: "chip",
      origin: "chip",
      skillId: null,
      damageType: null,
      baseM: mulBp(state.run.heroAtkM, bp),
      crit: false,
      hitIndex: 0,
      hitCount: 1,
    },
    emit,
  );
}

/** Step 2 of the tick: resolve hero attacks whose impact tick has arrived (auto-attack hits per the weapon). */
export function resolveHeroImpacts(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  if (enc.pending.length === 0) return;
  const t = state.tick;
  const due = enc.pending.filter((p) => p.tick <= t);
  if (due.length === 0) return;
  enc.pending = enc.pending.filter((p) => p.tick > t);
  const run = state.run;
  const w = K.WEAPONS[run.loadout.weapon.archetype];
  for (const p of due) {
    // the aimed enemy may have died on the way: re-aim at the focus (no living enemy: the attack whiffs)
    let target = enemyById(enc, p.targetId);
    if (target === null || !target.alive) target = heroImpactTarget(enc);
    if (target === null) continue;
    const baseM = mulBp(run.heroAtkM, w.atkMultBp);
    for (let h = 0; h < w.hits && target.alive; h++) {
      dealDamage(
        state,
        target,
        {
          kind: "auto",
          origin: "weapon",
          skillId: null,
          damageType: w.damageType,
          baseM,
          crit: p.crit,
          hitIndex: h,
          hitCount: w.hits,
        },
        emit,
      );
    }
  }
}

// ---------------------------------------------------------------- hero HP

/** Heals the hero (capped at max HP). Emits HeroHealed only when something was restored. Returns the amount healed. */
export function healHero(
  state: LevelState,
  cause: "walk" | "skill" | "phase" | "secondWind" | "revive" | "passive",
  amountM: Milli,
  emit: Emit,
): Milli {
  const run = state.run;
  const amt = Math.min(amountM, run.heroMaxHpM - run.heroHpM);
  if (amt <= 0) return 0;
  run.heroHpM += amt;
  emit({
    type: "HeroHealed",
    tick: state.tick,
    cause,
    amount: toDisplay(amt),
    hpAfter: toDisplay(run.heroHpM),
    maxHp: toDisplay(run.heroMaxHpM),
  });
  return amt;
}

/**
 * Applies damage to the hero and emits HeroDamaged (when > 0). Returns true when HP hit 0 (the caller then runs
 * heroDown). `nonLethal` clamps at 1 milli (Doom Spell, D14).
 */
export function damageHero(
  state: LevelState,
  dmgM: Milli,
  info: { sourceId: EntityId | null; cause: "attack" | "doom" | "minigame"; blocked: boolean },
  emit: Emit,
  nonLethal = false,
): boolean {
  const run = state.run;
  const dealt = Math.max(0, Math.min(dmgM, nonLethal ? run.heroHpM - 1 : run.heroHpM));
  if (dealt <= 0) return false;
  run.heroHpM -= dealt;
  emit({
    type: "HeroDamaged",
    tick: state.tick,
    sourceId: info.sourceId,
    cause: info.cause,
    damage: toDisplay(dealt),
    hpAfter: toDisplay(run.heroHpM),
    maxHp: toDisplay(run.heroMaxHpM),
    blocked: info.blocked,
  });
  return run.heroHpM === 0;
}

// ---------------------------------------------------------------- enemy impact

/**
 * An enemy attack lands (step 3). Outcome is decided by the guard word: Parry = 0 damage + a counter Hit (50% ATK, 150%
 * with Riposte) + PARRY_ATB; Block = BLOCK_MULT; ignored = full damage. A barrier absorbs an otherwise unparried hit.
 * Event order: EnemyAttack, [GuardParried, counter Hit | GuardBlocked], HeroDamaged. Then the next cycle is scheduled.
 */
export function resolveImpact(state: LevelState, enemy: EnemyState, emit: Emit): void {
  const run = state.run;
  const t = state.tick;
  const parried = enemy.guardResult === "parry";
  const blocked = enemy.guardResult === "block";
  const absorbed = !parried && run.barrier > 0;
  let dmgM = enemy.hitM;
  let outcome: "hit" | "blocked" | "parried" | "barrier" = "hit";
  if (parried) {
    outcome = "parried";
    dmgM = 0;
  } else if (absorbed) {
    outcome = "barrier";
    dmgM = 0;
    run.barrier--;
  } else if (blocked) {
    outcome = "blocked";
    dmgM = mulBp(dmgM, blockMultBp(run));
  }
  emit({ type: "EnemyAttack", tick: t, enemyId: enemy.id, outcome, damage: toDisplay(dmgM) });
  if (outcome === "parried") {
    run.stats.perfectParries++;
    const w = K.WEAPONS[run.loadout.weapon.archetype];
    const counter: DamageSpec = {
      kind: "counter",
      origin: "counter",
      skillId: null,
      damageType: w.damageType,
      baseM: mulBp(run.heroAtkM, counterMultBp(run)),
      crit: false,
      hitIndex: 0,
      hitCount: 1,
    };
    emit({
      type: "GuardParried",
      tick: t,
      enemyId: enemy.id,
      counterDamage: toDisplay(resolveDamage(state, enemy, counter).dmgM),
    });
    dealDamage(state, enemy, counter, emit);
    addAtb(state, K.PARRY_ATB_M, emit);
  } else if (outcome === "blocked") {
    run.stats.blocks++;
    emit({ type: "GuardBlocked", tick: t, enemyId: enemy.id, damage: toDisplay(dmgM) });
  } else if (outcome === "hit") {
    run.stats.hitsTaken++;
  }
  const died = damageHero(
    state,
    dmgM,
    { sourceId: enemy.id, cause: "attack", blocked: outcome === "blocked" },
    emit,
  );
  if (died) {
    heroDown(state, emit);
    return;
  }
  // next cycle: an ignored guard plate reverts to a normal word after the hit
  if (enemy.alive) {
    if (outcome === "hit" || outcome === "barrier") revertGuardPlate(state, enemy, "expired", emit);
    enemy.cycleStart = t;
    enemy.windupShown = false;
    enemy.guardResult = null;
    enemy.nextImpact = null;
    if (enemy.brokenUntil === null && run.options.difficulty !== "zen")
      scheduleAttack(state, enemy, t + enemy.intervalTicks);
  }
}

// ---------------------------------------------------------------- hero down: Second Wind (D17) and the revive hook

/** HP reached 0. First time: Second Wind. Otherwise the level is lost. HeroDowned always fires first. */
export function heroDown(state: LevelState, emit: Emit): void {
  const run = state.run;
  emit({ type: "HeroDowned", tick: state.tick, secondWindAvailable: !run.secondWindUsed });
  if (run.secondWindUsed) {
    failLevel(state, "defeated", emit);
    return;
  }
  startSecondWind(state, emit);
}

function startSecondWind(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const t = state.tick;
  run.secondWindUsed = true;
  enc.frozenAt = t;
  if (enc.targetPlateId !== null) dropTarget(state, "phaseChanged", emit);
  for (const p of [...enc.plates]) removePlate(state, p, "phaseEnded", emit);
  for (const e of enc.enemies) e.plateId = null;
  const pool = run.def.words.secondWind.filter((w) => w.length > 0);
  const text =
    pool.length > 0
      ? (pool[below(enc.wordsRng, pool.length)] as string)
      : K.SECOND_WIND_FALLBACK_TEXT;
  const deadline = t + K.SECOND_WIND_T;
  setPhase(state, "secondWind", deadline);
  const plate = addPlate(
    state,
    { ownerId: null, kind: "secondWind", text, expiresAt: deadline, totalTicks: K.SECOND_WIND_T },
    emit,
  );
  emit({ type: "SecondWindStarted", tick: t, plateId: plate.id, text, deadlineTick: deadline });
}

/** The Second Wind sentence was typed: revive at SECOND_WIND_HP and resume the frozen encounter. */
export function secondWindSucceeded(state: LevelState, emit: Emit): void {
  const run = state.run;
  healHero(state, "secondWind", mulBp(run.heroMaxHpM, K.SECOND_WIND_HP_BP), emit);
  emit({
    type: "SecondWindSucceeded",
    tick: state.tick,
    hpAfter: toDisplay(run.heroHpM),
    maxHp: toDisplay(run.heroMaxHpM),
  });
  resumeEncounter(state, emit);
}

/** The Second Wind deadline passed: the level is lost, or waits for an external revive when the hook is enabled. */
export function secondWindFailed(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  for (const p of [...enc.plates]) removePlate(state, p, "expired", emit);
  emit({ type: "SecondWindFailed", tick: state.tick });
  if (state.run.options.allowExternalRevive) setPhase(state, "downed", null);
  else failLevel(state, "defeated", emit);
}

/**
 * Gem / feather revive hook (not used in the slice): only honoured when LevelOptions.allowExternalRevive is set and the
 * hero is "downed" after a failed Second Wind. Restores PREMIUM_REVIVE_HP and resumes the encounter.
 */
export function externalRevive(state: LevelState, source: "gem" | "feather", emit: Emit): void {
  const run = state.run;
  if (!run.options.allowExternalRevive || state.phase !== "downed") return;
  healHero(state, "revive", mulBp(run.heroMaxHpM, K.PREMIUM_REVIVE_HP_BP), emit);
  emit({ type: "Revived", tick: state.tick, source, hpAfter: toDisplay(run.heroHpM) });
  resumeEncounter(state, emit);
}

/**
 * Unfreezes the encounter after a revive: absolute-tick timers shift by the freeze length, every living enemy gets a
 * fresh word plate, and enemy attack timers restart from a full interval.
 */
function resumeEncounter(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  const delta = enc.frozenAt === null ? 0 : t - enc.frozenAt;
  enc.frozenAt = null;
  for (const p of enc.pending) p.tick += delta;
  setPhase(state, "combat", null);
  for (const e of enc.enemies) {
    if (!e.alive) continue;
    if (e.brokenUntil !== null) e.brokenUntil += delta;
    if (e.staggerUntil !== null) e.staggerUntil += delta;
    if (!enc.finisherShown) assignWordPlate(state, e, emit);
    e.guardResult = null;
    e.windupShown = false;
    e.nextImpact = null;
    if (e.brokenUntil === null && !enc.finisherShown) restartAttackCycle(state, e);
  }
}

/** Walk heal: +WALK_HEAL of max HP at WalkStarted (doc 01 §1.8). */
export function walkHeal(state: LevelState, emit: Emit): void {
  healHero(state, "walk", mulBp(state.run.heroMaxHpM, K.WALK_HEAL_BP), emit);
}

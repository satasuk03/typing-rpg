// Active skills (T1.4): per-word charge, auto-cast rules, impacts, burn ticks.
// Rules: doc 01 §2.3 / §3.1 with the C3 damage cut (numbers in BALANCE.SKILLS), C17 (per 5 chars from word tier T4),
// interfaces §3.2 steps 2 and 6, §4 (SkillCharged / SkillCast / Hit{origin:"skill", skillId}).
import { heroImpactTarget } from "./attack.ts";
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { type DamageSpec, dealDamage, healHero, resolveDamage } from "./combat.ts";
import { enemyById } from "./encounter.ts";
import { mulBp } from "./fixed.ts";
import { tutorialCue } from "./passives.ts";
import type { EncounterState, EnemyState, PlateState } from "./state.ts";
import { applyDot, freezeEnemy, grantBarrier } from "./statuses.ts";
import type { ActiveSkillId, CastMode, LevelState } from "./types.ts";

const SLOTS = [0, 1] as const;

const needM = (id: ActiveSkillId): number => K.SKILL_CHARGE_M[id];

/** Skill charge a completed plate is worth, in milli-words: 1 word (1.5 perfect), or len/5 words from tier T4 (C17). */
export function plateSkillChargeM(state: LevelState, plate: Readonly<PlateState>): number {
  const run = state.run;
  const per5 = run.def.chapter >= K.SKILL_PER5_FROM_CHAPTER;
  const base = per5 ? plate.text.length * 200 : 1000;
  let gain = plate.perfect ? mulBp(base, K.PERFECT_SKILL_CHARGE_BP) : base;
  gain = mulBp(gain, K.WEAPONS[run.loadout.weapon.archetype].skillChargeMultBp); // Staff x1.5
  return gain;
}

/** A word or guard plate was completed: both equipped skills charge (SkillCharged on the edge into "ready"). */
export function chargeSkills(state: LevelState, plate: Readonly<PlateState>, emit: Emit): void {
  if (plate.kind !== "word" && plate.kind !== "guard") return;
  const run = state.run;
  const gain = plateSkillChargeM(state, plate);
  for (const slot of SLOTS) {
    const id = run.loadout.actives[slot];
    if (id === null) continue;
    tutorialCue(state, "skill", emit);
    run.skillChargeM[slot] = Math.min(run.skillChargeM[slot] + gain, 2 * needM(id));
    markReady(state, slot, emit);
  }
}

function markReady(state: LevelState, slot: 0 | 1, emit: Emit): void {
  const run = state.run;
  const id = run.loadout.actives[slot];
  if (id === null) return;
  const ready = run.skillChargeM[slot] >= needM(id);
  if (ready && !run.skillReady[slot])
    emit({ type: "SkillCharged", tick: state.tick, slot, skillId: id });
  run.skillReady[slot] = ready;
}

const aliveEnemies = (enc: EncounterState): EnemyState[] => enc.enemies.filter((e) => e.alive);

/** The smart / ASAP cast conditions (doc 01 §2.3). ASAP drops the situational wait but never casts a pointless skill. */
function canCast(state: LevelState, id: ActiveSkillId, mode: CastMode): boolean {
  const run = state.run;
  const enc = state.enc as EncounterState;
  const alive = aliveEnemies(enc);
  if (alive.length === 0) return false;
  const smart = mode === "smart";
  switch (id) {
    case "fireball":
    case "piercingThrust":
      return true;
    case "slashWave":
      return !smart || alive.length >= K.SLASH_WAVE_MIN_ENEMIES;
    case "mendingLight":
      return smart
        ? run.heroHpM < mulBp(run.heroMaxHpM, K.MENDING_HP_BELOW_BP)
        : run.heroHpM < run.heroMaxHpM;
    case "frostLock":
      return smart
        ? alive.some((e) => e.windupShown && e.frozenUntil === null)
        : alive.some((e) => e.frozenUntil === null);
    case "aegis":
      return smart
        ? run.barrier === 0 && alive.some((e) => e.windupShown)
        : run.barrier < K.BARRIER_CAP;
  }
}

/** Step 6 of the tick: charged skills cast when their condition holds. Only in live combat. */
export function checkSkillCasts(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  if (state.phase !== "combat" || enc.finisherShown) return;
  const run = state.run;
  for (const slot of SLOTS) {
    const id = run.loadout.actives[slot];
    if (id === null || !run.skillReady[slot]) continue;
    if (!canCast(state, id, run.loadout.activeModes[slot])) continue;
    castSkill(state, slot, id, emit);
  }
}

function castSkill(state: LevelState, slot: 0 | 1, id: ActiveSkillId, emit: Emit): void {
  const run = state.run;
  const enc = state.enc as EncounterState;
  run.skillChargeM[slot] -= needM(id);
  run.skillReady[slot] = false;
  run.stats.skillsCast++;
  const impactTick = state.tick + K.SKILL_IMPACT_T;
  let targetIds: number[] = [];
  let aimed: number | null = null;
  if (id === "fireball" || id === "piercingThrust") {
    const t = heroImpactTarget(enc);
    if (t !== null) {
      targetIds = [t.id];
      aimed = t.id;
    }
  } else if (id === "slashWave" || id === "frostLock") {
    targetIds = aliveEnemies(enc).map((e) => e.id);
  }
  emit({ type: "SkillCast", tick: state.tick, slot, skillId: id, targetIds, impactTick });
  enc.pending.push({
    tick: impactTick,
    kind: "skill",
    slot,
    skillId: id,
    targetId: aimed,
    crit: false,
  });
  markReady(state, slot, emit); // overflow charge may already fill the next cast
}

// ---------------------------------------------------------------- impacts and DoT ticks

const skillSpec = (
  id: ActiveSkillId,
  type: DamageSpec["damageType"],
  baseM: number,
  hitIndex: number,
  hitCount: number,
): DamageSpec => ({
  kind: "skill",
  origin: "skill",
  skillId: id,
  damageType: type,
  baseM,
  crit: false,
  hitIndex,
  hitCount,
});

/** Step 2 of the tick (after auto-attacks): skills whose impact tick has arrived take effect. */
export function resolveSkillImpacts(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  if (enc.pending.length === 0) return;
  const t = state.tick;
  const due = enc.pending.filter((p) => p.kind === "skill" && p.tick <= t);
  if (due.length === 0) return;
  enc.pending = enc.pending.filter((p) => p.kind !== "skill" || p.tick > t);
  const run = state.run;
  for (const p of due) {
    if (p.kind !== "skill") continue;
    const id = p.skillId;
    switch (id) {
      case "fireball":
      case "piercingThrust": {
        let target = enemyById(enc, p.targetId);
        if (target === null || !target.alive) target = heroImpactTarget(enc);
        if (target === null) break;
        if (id === "fireball") {
          dealDamage(
            state,
            target,
            skillSpec(id, "fire", mulBp(run.heroAtkM, K.FIREBALL_ATK_BP), 0, 1),
            emit,
          );
          if (target.alive)
            applyDot(
              state,
              target,
              {
                status: "burn",
                origin: "skill",
                skillId: id,
                durationT: K.FIREBALL_BURN_T,
                perTickM: Math.max(1, mulBp(run.heroAtkM, K.FIREBALL_BURN_PER_TICK_BP)),
              },
              emit,
            );
        } else {
          dealDamage(
            state,
            target,
            {
              ...skillSpec(id, "pierce", mulBp(run.heroAtkM, K.PIERCING_ATK_BP), 0, 1),
              shieldPoints: K.PIERCING_SHIELD_HITS,
            },
            emit,
          );
        }
        break;
      }
      case "slashWave": {
        const targets = aliveEnemies(enc);
        const baseM = mulBp(run.heroAtkM, K.SLASH_WAVE_ATK_BP);
        targets.forEach((e, i) => {
          if (e.alive) dealDamage(state, e, skillSpec(id, "slash", baseM, i, targets.length), emit);
        });
        break;
      }
      case "frostLock":
        for (const e of aliveEnemies(enc)) freezeEnemy(state, e, K.FROST_FREEZE_T, id, emit);
        break;
      case "mendingLight":
        healHero(state, "skill", mulBp(run.heroMaxHpM, K.MENDING_HEAL_BP), emit);
        break;
      case "aegis":
        grantBarrier(state, K.AEGIS_BARRIER_HITS, "skill", id, emit);
        break;
    }
  }
}

/** Step 2 (last): burn and bleed ticks. Damage is attributed to the applier's origin (burn: skill, bleed: weapon). */
export function tickDots(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  for (const e of enc.enemies) {
    if (!e.alive || e.dots.length === 0) continue;
    for (const d of [...e.dots]) {
      if (t < d.nextTick) continue;
      const spec: DamageSpec = {
        kind: "dot",
        origin: d.origin,
        skillId: d.skillId,
        damageType: null,
        baseM: d.perTickM,
        crit: false,
        hitIndex: 0,
        hitCount: 1,
      };
      // a boss held at its phase gate takes no DoT damage: skip the empty Hit
      if (resolveDamage(state, e, spec).dmgM > 0 && dealDamage(state, e, spec, emit)) break;
      d.nextTick += K.DOT_TICK_T;
      if (d.nextTick > d.untilTick) {
        e.dots.splice(e.dots.indexOf(d), 1);
        emit({ type: "StatusEnded", tick: t, targetId: e.id, status: d.status });
      }
    }
  }
}

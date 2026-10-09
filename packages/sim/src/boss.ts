// Ruin Golem script (T1.5): the 3-phase boss template of doc 01 §4.2 / interfaces §3.4 on top of the generic phase-gate
// clamp from combat.ts (EnemyState.gateHpM).
//
//  Phase 1 (100-66%)  normal word plates plus the adds (EnemyRefs, scrambled/fading gimmicks). The 66% gate holds until the
//                     adds are dead (ruling: the adds' HP is part of the economy_sim boss model, so they cannot be skipped).
//  Phase 2 (66-33%)   "Incantation": a Doom Spell every `doomEveryTicks`, measured from the RESOLUTION (success or failure)
//                     of the previous one; the first starts `doomEveryTicks` after the phase's breather ends (typing live).
//                     (T6.1: x max(1, pace factor) with BALANCE.BOSS_SCRIPT_PACE_SCALE, see bossPlates.ts.)
//                     Timer = ceil(chars x 900 / pace) + 120 ticks. Success: the boss is staggered DOOM_STAGGER_T (damage x1.5
//                     through the normal chain). Failure: mulBp(parHpM, DOOM_DMG_BP) to the hero, NON-LETHAL (clamped at 1 HP,
//                     D14). The 33% gate holds until `minDoomSpells` have resolved and no Doom Spell is active (D16).
//  Phase 3 (<33%)     Falling Rubble: words fall in lanes; a clear hits the boss for clearAtkMult x ATK (untyped "minigame" hit),
//                     a miss costs the hero `missHitM` (barrier does not absorb it). The boss's own attacks are suspended, word
//                     plates, auto-attacks and skills carry on. The HP clamps at 1 milli (FINAL_GATE_M); once it is there the
//                     spawning stops, and when the words in flight have landed the minigame ends and the Finisher is shown
//                     (exclusive, auto-targeted, no timer). Completing it kills the boss.
//  Between phases     BossPhaseChanged, every plate goes, attacks are cancelled, PHASE_HEAL, a breather of `breatherTicks`
//                     (phase "bossBreather", keys ignored, all timers shifted by its length when it ends).
//  Second Wind        freezes the script: doom deadline, spawn timer and falling words shift by the freeze (combat.ts calls
//                     detachBossPlates / shiftBossTimers / restoreBossPlates).
//  Frost Lock         delays enemy attack impacts only; none of the script's timers look at it.
//  Zen                the script's damage to the hero (Doom failure, rubble miss) is 0: "enemies never attack".
import { K } from "./balance.ts";
import {
  bossAttacksSuspended,
  doomEveryTicks,
  rubbleFallTicks,
  rubbleFirstSpawnTicks,
  rubbleSpawnTicks,
} from "./bossPlates.ts";
import type { Emit } from "./bus.ts";
import {
  type DamageSpec,
  damageHero,
  dealDamage,
  FINAL_GATE_M,
  healHero,
  heroDown,
  resumeEncounter,
} from "./combat.ts";
import { enemyById, showFinisher } from "./encounter.ts";
import { SimError } from "./errors.ts";
import { type Milli, mulBp, toDisplay } from "./fixed.ts";
import { setPhase } from "./flow.ts";
import { cancelAttack } from "./guard.ts";
import { isTypable } from "./input.ts";
import { below, deriveRng } from "./rng.ts";
import type { BossState, EncounterState, EnemyState, PlateState } from "./state.ts";
import type { LevelState, ResolvedBoss } from "./types.ts";
import { addPlate, dropTarget, findPlate, removePlate, visibleFirstLetters } from "./typing.ts";
import { FALLBACK_WORDS, firstLetter } from "./words.ts";

const bossDef = (state: Readonly<LevelState>): ResolvedBoss => {
  const b = state.run.def.boss;
  if (b === null) throw new SimError("boss script without def.boss");
  return b;
};

/** The HP floor of phase `phase`: 66%, 33%, then the final gate (1 milli: only the Finisher kills). */
export const gateFor = (boss: ResolvedBoss, maxHpM: Milli, phase: 1 | 2 | 3): Milli =>
  phase === 1
    ? Math.max(FINAL_GATE_M, mulBp(maxHpM, boss.phase1.endAtHpBp))
    : phase === 2
      ? Math.max(FINAL_GATE_M, mulBp(maxHpM, boss.phase2.endAtHpBp))
      : FINAL_GATE_M;

/** Called when the boss encounter's enemies exist: `enemies[0]` is the boss, the rest are its adds. */
export function initBossState(state: LevelState, enemies: readonly EnemyState[]): BossState {
  const enc = state.enc as EncounterState;
  const boss = enemies[0] as EnemyState;
  return {
    enemyId: boss.id,
    phase: 1,
    addIds: enemies.slice(1).map((e) => e.id),
    nextDoomTick: null,
    doom: null,
    doomsResolved: 0,
    doomsStarted: 0,
    nextSpawnTick: null,
    rubble: [],
    cleared: 0,
    missed: 0,
    minigameActive: false,
    lastDoomText: null,
    rng: deriveRng(state.seed, "boss", enc.index),
  };
}

const bossEnemy = (enc: EncounterState, bs: BossState): EnemyState =>
  enemyById(enc, bs.enemyId) as EnemyState;

/** What keeps the boss at its gate although its HP is there (for the view and the script): null = nothing. */
export function bossHold(enc: Readonly<EncounterState>, def: ResolvedBoss): "adds" | "doom" | null {
  const bs = enc.boss;
  if (bs === null) return null;
  if (bs.phase === 1 && enc.enemies.some((e) => e.alive && !e.isBoss)) return "adds";
  if (bs.phase === 2 && (bs.doomsResolved < def.phase2.minDoomSpells || bs.doom !== null))
    return "doom";
  return null;
}

const atGate = (boss: Readonly<EnemyState>): boolean => boss.hpM <= (boss.gateHpM ?? 0);

// ---------------------------------------------------------------- the script (tick step 5)

/** Step 5: doom deadline, rubble landings, phase gates, then the spawns of Doom Spells and falling words. */
export function stepBoss(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const bs = enc.boss;
  if (bs === null || state.phase !== "combat" || enc.finisherShown) return;
  const boss = bossEnemy(enc, bs);
  if (!boss.alive) return;
  const def = bossDef(state);
  const t = state.tick;

  if (bs.doom !== null && t >= bs.doom.deadline) failDoom(state, bs, boss, def, emit);
  for (const w of [...bs.rubble]) {
    if (t < w.landTick) continue;
    if (missRubble(state, bs, boss, w, def, emit)) return; // the hero went down: the encounter froze
  }

  if (atGate(boss)) {
    if ((bs.phase === 1 || bs.phase === 2) && bossHold(enc, def) === null) {
      beginBreather(state, bs, boss, bs.phase === 1 ? 2 : 3, emit);
      return;
    }
    if (bs.phase === 3 && bs.rubble.length === 0) {
      finishMinigame(state, bs, boss, emit);
      return;
    }
  }

  if (bs.phase === 2 && bs.doom === null && bs.nextDoomTick !== null && t >= bs.nextDoomTick)
    startDoom(state, bs, boss, def, emit);
  if (
    bs.phase === 3 &&
    bs.minigameActive &&
    bs.nextSpawnTick !== null &&
    t >= bs.nextSpawnTick &&
    boss.hpM > FINAL_GATE_M
  ) {
    bs.nextSpawnTick += rubbleSpawnTicks(state, def);
    spawnRubble(state, bs, boss, def, emit);
  }
}

// ---------------------------------------------------------------- phase transitions

function beginBreather(
  state: LevelState,
  bs: BossState,
  boss: EnemyState,
  to: 2 | 3,
  emit: Emit,
): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const def = bossDef(state);
  const t = state.tick;
  const until = t + def.breatherTicks;
  emit({
    type: "BossPhaseChanged",
    tick: t,
    enemyId: boss.id,
    from: bs.phase,
    to,
    breatherUntilTick: until,
  });
  if (enc.targetPlateId !== null) dropTarget(state, "phaseChanged", emit);
  for (const p of [...enc.plates]) removePlate(state, p, "phaseEnded", emit);
  for (const e of enc.enemies) {
    e.plateId = null;
    cancelAttack(e);
  }
  bs.phase = to;
  bs.doom = null;
  bs.rubble = [];
  bs.nextDoomTick = null;
  bs.nextSpawnTick = null;
  boss.gateHpM = gateFor(def, boss.maxHpM, to);
  enc.frozenAt = t; // the breather is a freeze: hero impacts, statuses and Break shift by its length (resumeEncounter)
  setPhase(state, "bossBreather", until);
  healHero(state, "phase", mulBp(run.heroMaxHpM, K.PHASE_HEAL_BP), emit);
}

/** The breather ran out: the encounter resumes in the new phase and the phase's timers start. */
export function endBreather(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const bs = enc.boss as BossState;
  const def = bossDef(state);
  const t = state.tick;
  resumeEncounter(state, emit);
  if (bs.phase === 2) {
    bs.nextDoomTick = t + doomEveryTicks(state, def);
  } else if (bs.phase === 3) {
    bs.minigameActive = true;
    bs.nextSpawnTick = t + rubbleFirstSpawnTicks(state);
    emit({
      type: "MinigameStarted",
      tick: t,
      enemyId: bs.enemyId,
      kind: def.phase3.minigame.kind,
      lanes: def.phase3.minigame.lanes,
    });
  }
}

/** The minigame wave is over and the boss sits at the final gate: MinigameEnded, then the Finisher. */
function finishMinigame(state: LevelState, bs: BossState, boss: EnemyState, emit: Emit): void {
  if (bs.minigameActive) {
    bs.minigameActive = false;
    bs.nextSpawnTick = null;
    emit({ type: "MinigameEnded", tick: state.tick, cleared: bs.cleared, missed: bs.missed });
  }
  showFinisher(state, boss, emit);
}

// ---------------------------------------------------------------- Doom Spell

const freeWord = (forbidden: readonly string[], w: string): boolean =>
  w.length > 0 &&
  w.charAt(0) !== " " &&
  isTypable(w.charAt(0)) &&
  !forbidden.includes(firstLetter(w));

function pickDoomText(state: LevelState, bs: BossState): string | null {
  const enc = state.enc as EncounterState;
  const forbidden = visibleFirstLetters(enc);
  const pool = state.run.def.words.doom.filter((w) => freeWord(forbidden, w));
  const fresh = pool.filter((w) => w !== bs.lastDoomText);
  const cands = fresh.length > 0 ? fresh : pool;
  if (cands.length > 0) return cands[below(bs.rng, cands.length)] as string;
  // empty or fully blocked pool: "<word with a free first letter><tail>" (never used with real content)
  const letters = FALLBACK_WORDS.filter((w) => !forbidden.includes(firstLetter(w)));
  if (letters.length === 0) return null;
  return (letters[below(bs.rng, letters.length)] as string) + K.DOOM_FALLBACK_TAIL;
}

/** chars / (pace_cps x DOOM_TIMER_PACE_EFF) + DOOM_TIMER_BONUS, in ticks: ceil(chars x 720 x BP / (pace x EFF_BP)) + 120. */
export function doomTicks(chars: number, pace: number): number {
  const num = chars * 720 * 10_000;
  const den = pace * K.DOOM_TIMER_PACE_EFF_BP;
  return Math.floor((num + den - 1) / den) + K.DOOM_TIMER_BONUS_T;
}

function startDoom(
  state: LevelState,
  bs: BossState,
  boss: EnemyState,
  def: ResolvedBoss,
  emit: Emit,
): void {
  const text = pickDoomText(state, bs);
  if (text === null) return; // every letter is taken: retry next tick
  const t = state.tick;
  const total = doomTicks(text.length, state.run.options.pace);
  const plate = addPlate(
    state,
    { ownerId: boss.id, kind: "doom", text, expiresAt: t + total, totalTicks: total },
    emit,
  );
  bs.doom = { plateId: plate.id, text, deadline: t + total, totalTicks: total };
  bs.nextDoomTick = null;
  bs.doomsStarted++;
  bs.lastDoomText = text;
  void def;
  emit({
    type: "DoomSpellStarted",
    tick: t,
    enemyId: boss.id,
    plateId: plate.id,
    text,
    deadlineTick: t + total,
  });
}

/** The Doom Spell was typed in time: the boss is staggered (x DOOM_STAGGER_DMG_MULT damage) for DOOM_STAGGER_T. */
export function completeDoom(state: LevelState, plate: PlateState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const bs = enc.boss as BossState;
  const boss = bossEnemy(enc, bs);
  const def = bossDef(state);
  const t = state.tick;
  const until = t + K.DOOM_STAGGER_T;
  boss.staggerUntil = until;
  bs.doom = null;
  bs.doomsResolved++;
  bs.nextDoomTick = t + doomEveryTicks(state, def);
  emit({
    type: "DoomSpellCompleted",
    tick: t,
    enemyId: boss.id,
    plateId: plate.id,
    staggerUntilTick: until,
  });
  emit({
    type: "StatusApplied",
    tick: t,
    targetId: boss.id,
    status: "stagger",
    untilTick: until,
    stacks: 1,
    origin: null,
    skillId: null,
  });
}

/** The deadline passed: 15% of PAR HP, non-lethal (clamped at 1 HP). Counts as resolved for `minDoomSpells`. */
function failDoom(
  state: LevelState,
  bs: BossState,
  boss: EnemyState,
  def: ResolvedBoss,
  emit: Emit,
): void {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const d = bs.doom as NonNullable<BossState["doom"]>;
  const plate = findPlate(enc, d.plateId);
  if (plate !== null) {
    if (enc.targetPlateId === plate.id) dropTarget(state, "plateChanged", emit);
    removePlate(state, plate, "expired", emit);
  }
  const want = run.options.difficulty === "zen" ? 0 : mulBp(run.def.parHpM, K.DOOM_DMG_BP);
  const dealt = Math.max(0, Math.min(want, run.heroHpM - 1)); // D14: never lethal
  emit({
    type: "DoomSpellFailed",
    tick: state.tick,
    enemyId: boss.id,
    plateId: d.plateId ?? 0,
    damage: toDisplay(dealt),
  });
  if (dealt > 0) {
    run.stats.hitsTaken++;
    damageHero(state, want, { sourceId: boss.id, cause: "doom", blocked: false }, emit, true);
  }
  bs.doom = null;
  bs.doomsResolved++;
  bs.nextDoomTick = state.tick + doomEveryTicks(state, def);
}

// ---------------------------------------------------------------- Falling Rubble

function pickRubble(state: LevelState, bs: BossState): string | null {
  const enc = state.enc as EncounterState;
  const forbidden = visibleFirstLetters(enc);
  const inFlight = bs.rubble.map((w) => w.text);
  const pool = state.run.def.words.minigame.filter(
    (w) => freeWord(forbidden, w) && !inFlight.includes(w),
  );
  if (pool.length > 0) return pool[below(bs.rng, pool.length)] as string;
  const letters = FALLBACK_WORDS.filter((w) => !forbidden.includes(firstLetter(w)));
  if (letters.length === 0) return null;
  return letters[below(bs.rng, letters.length)] as string;
}

function spawnRubble(
  state: LevelState,
  bs: BossState,
  boss: EnemyState,
  def: ResolvedBoss,
  emit: Emit,
): void {
  const mg = def.phase3.minigame;
  const taken = bs.rubble.map((w) => w.lane);
  const free: number[] = [];
  for (let l = 0; l < mg.lanes; l++) if (!taken.includes(l)) free.push(l);
  if (free.length === 0) return; // every lane is busy: this spawn is skipped
  const text = pickRubble(state, bs);
  if (text === null) return;
  const lane = free[below(bs.rng, free.length)] as number;
  const fall = rubbleFallTicks(state, def);
  const landTick = state.tick + fall;
  const plate = addPlate(
    state,
    {
      ownerId: boss.id,
      kind: "minigame",
      text,
      lane,
      expiresAt: landTick,
      totalTicks: fall,
    },
    emit,
  );
  bs.rubble.push({ plateId: plate.id, text, lane, landTick });
  emit({
    type: "MinigameWordSpawned",
    tick: state.tick,
    plateId: plate.id,
    text,
    lane,
    landTick,
  });
}

/** A falling word was typed: it hits the boss for clearAtkMult x ATK (an untyped "minigame" hit). */
export function clearRubble(state: LevelState, plate: PlateState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const bs = enc.boss as BossState;
  const boss = bossEnemy(enc, bs);
  const def = bossDef(state);
  const i = bs.rubble.findIndex((w) => w.plateId === plate.id);
  if (i < 0) return;
  const [w] = bs.rubble.splice(i, 1);
  bs.cleared++;
  emit({
    type: "MinigameWordCleared",
    tick: state.tick,
    plateId: plate.id,
    lane: (w as { lane: number }).lane,
  });
  if (!boss.alive) return;
  const spec: DamageSpec = {
    kind: "minigame",
    origin: "minigame",
    skillId: null,
    damageType: null,
    baseM: mulBp(state.run.heroAtkM, def.phase3.minigame.clearAtkMultBp),
    crit: false,
    hitIndex: 0,
    hitCount: 1,
  };
  dealDamage(state, boss, spec, emit);
}

/** A falling word reached the ground: the hero takes missHitM. Returns true when that downed the hero. */
function missRubble(
  state: LevelState,
  bs: BossState,
  boss: EnemyState,
  w: BossState["rubble"][number],
  def: ResolvedBoss,
  emit: Emit,
): boolean {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const plate = findPlate(enc, w.plateId);
  if (plate !== null) {
    if (enc.targetPlateId === plate.id) dropTarget(state, "plateChanged", emit);
    removePlate(state, plate, "expired", emit);
  }
  bs.rubble.splice(bs.rubble.indexOf(w), 1);
  bs.missed++;
  const want = run.options.difficulty === "zen" ? 0 : def.phase3.minigame.missHitM;
  const dealt = Math.min(want, run.heroHpM);
  emit({
    type: "MinigameWordMissed",
    tick: state.tick,
    plateId: w.plateId ?? 0,
    lane: w.lane,
    damage: toDisplay(dealt),
  });
  if (dealt <= 0) return false;
  run.stats.hitsTaken++;
  const died = damageHero(
    state,
    want,
    { sourceId: boss.id, cause: "minigame", blocked: false },
    emit,
  );
  if (!died) return false;
  heroDown(state, emit);
  return true;
}

export { bossAttacksSuspended };

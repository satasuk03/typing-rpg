// Boss plates across a freeze (T1.5). A Second Wind removes every plate and later resumes the encounter; the boss script's
// Doom Spell and Falling Rubble words must come back with their remaining time ("freeze the phase timers during Second
// Wind"). Kept free of combat.ts imports so combat.ts (which owns the freeze) can use it without an import cycle.
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { BP, mulBp } from "./fixed.ts";
import type { BossState, EncounterState } from "./state.ts";
import { PACE_FACTOR_BP } from "./tables.generated.ts";
import type { LevelState, ResolvedBoss } from "./types.ts";
import { addPlate } from "./typing.ts";

// ---- T6.1 knob BALANCE.BOSS_SCRIPT_PACE_SCALE: the boss script's own timers follow the enemy-interval pace factor ----
// (35/pace)^0.7 in 0.6..1.8 (PACE_FACTOR_BP, doc 01 §1.6), like every enemy attack interval and the guard window:
//  - Falling Rubble spawn period, first-spawn delay and fall time: x pace factor (both ways);
//  - Doom Spell cadence (doomEvery, from the previous spell's resolution): x max(1, pace factor), i.e. only lengthened for
//    typists slower than the reference. A slow typist spends far longer typing each spell (which pays no ATB), so the
//    authored 16 s damage window between spells would otherwise shrink to a sliver of phase 2; a fast typist keeps the
//    authored window (their phase 2 is already at the minDoomSpells floor).
// Off (false) = the T1.5 behaviour: authored ticks at every pace.
const scriptPaceBp = (state: Readonly<LevelState>): number =>
  K.BOSS_SCRIPT_PACE_SCALE
    ? (PACE_FACTOR_BP[
        Math.min(K.PACE_MAX, Math.max(K.PACE_MIN, state.run.options.pace)) - K.PACE_MIN
      ] as number)
    : BP;
/** Ticks from a Doom Spell's resolution (or the breather's end) to the next spell. */
export const doomEveryTicks = (state: Readonly<LevelState>, boss: ResolvedBoss): number =>
  mulBp(boss.phase2.doomEveryTicks, Math.max(BP, scriptPaceBp(state)));
/** Ticks between two Falling Rubble spawns. */
export const rubbleSpawnTicks = (state: Readonly<LevelState>, boss: ResolvedBoss): number =>
  Math.max(1, mulBp(boss.phase3.minigame.spawnEveryTicks, scriptPaceBp(state)));
/** Ticks from the minigame's start to the first Falling Rubble word. */
export const rubbleFirstSpawnTicks = (state: Readonly<LevelState>): number =>
  Math.max(1, mulBp(K.MINIGAME_FIRST_SPAWN_T, scriptPaceBp(state)));
/** Ticks a Falling Rubble word takes to land. */
export const rubbleFallTicks = (state: Readonly<LevelState>, boss: ResolvedBoss): number =>
  Math.max(1, mulBp(boss.phase3.minigame.fallTicks, scriptPaceBp(state)));

/** The boss's own attacks are suspended in phase 3 (the Falling Rubble minigame replaces them, interfaces §3.4). */
export const bossAttacksSuspended = (
  enc: Readonly<EncounterState>,
  enemy: { isBoss: boolean },
): boolean => enemy.isBoss && enc.boss !== null && enc.boss.phase === 3;

/** The encounter's plates were all removed: the script entries stay (they own the timing) but lose their plate ids. */
export function detachBossPlates(bs: BossState): void {
  if (bs.doom !== null) bs.doom.plateId = null;
  for (const w of bs.rubble) w.plateId = null;
}

/** After a freeze of `delta` ticks: every absolute boss-script tick moves later by `delta`. */
export function shiftBossTimers(bs: BossState, delta: number): void {
  if (delta === 0) return;
  if (bs.nextDoomTick !== null) bs.nextDoomTick += delta;
  if (bs.nextSpawnTick !== null) bs.nextSpawnTick += delta;
  if (bs.doom !== null) bs.doom.deadline += delta;
  for (const w of bs.rubble) w.landTick += delta;
}

/**
 * Re-shows the active Doom Spell and the falling words after a freeze (a fresh PlateShown each, with the same text, lane
 * and shifted deadline; no DoomSpellStarted / MinigameWordSpawned again). Run BEFORE the enemies get their fresh word plates so the
 * restored plates keep their first letters. Typed progress restarts (a plate is a fresh attempt after a freeze).
 */
export function restoreBossPlates(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const bs = enc.boss;
  const boss = state.run.def.boss as ResolvedBoss | null;
  if (bs === null || boss === null) return;
  if (bs.doom !== null && bs.doom.plateId === null) {
    const plate = addPlate(
      state,
      {
        ownerId: bs.enemyId,
        kind: "doom",
        text: bs.doom.text,
        expiresAt: bs.doom.deadline,
        totalTicks: bs.doom.totalTicks,
      },
      emit,
    );
    bs.doom.plateId = plate.id;
  }
  for (const w of bs.rubble) {
    if (w.plateId !== null) continue;
    const plate = addPlate(
      state,
      {
        ownerId: bs.enemyId,
        kind: "minigame",
        text: w.text,
        lane: w.lane,
        expiresAt: w.landTick,
        totalTicks: rubbleFallTicks(state, boss),
      },
      emit,
    );
    w.plateId = plate.id;
  }
}

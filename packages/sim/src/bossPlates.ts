// Boss plates across a freeze (T1.5). A Second Wind removes every plate and later resumes the encounter; the boss script's
// Doom Spell and Falling Rubble words must come back with their remaining time ("freeze the phase timers during Second
// Wind"). Kept free of combat.ts imports so combat.ts (which owns the freeze) can use it without an import cycle.
import type { Emit } from "./bus.ts";
import type { BossState, EncounterState } from "./state.ts";
import type { LevelState, ResolvedBoss } from "./types.ts";
import { addPlate } from "./typing.ts";

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
        totalTicks: boss.phase3.minigame.fallTicks,
      },
      emit,
    );
    w.plateId = plate.id;
  }
}

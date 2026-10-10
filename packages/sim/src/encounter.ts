// Enemy plate lifecycle inside an encounter: word-plate assignment, guard-plate reversion, death, boss finisher.
// Shared by the level runtime (level.ts) and combat (combat.ts).
import type { Emit } from "./bus.ts";
import type { HitKind, PlateId } from "./events.ts";
import { fadeTick, scrambleWord } from "./gimmick.ts";
import { cancelAttack, enemyDef } from "./guard.ts";
import { revealActive } from "./passives.ts";
import type { EncounterState, EnemyState, PlateState } from "./state.ts";
import { clearEnemyStatuses } from "./statuses.ts";
import type { LevelState, ResolvedLevel } from "./types.ts";
import { addPlate, dropTarget, findPlate, removePlate, visibleFirstLetters } from "./typing.ts";
import { pickPlateWord, RECENT_LIMIT } from "./words.ts";

export const enemyById = (enc: EncounterState, id: number | null): EnemyState | null =>
  id === null ? null : (enc.enemies.find((e) => e.id === id) ?? null);

/** Assigns a fresh word plate (distinct first letter among visible plates) to an enemy. */
export function assignWordPlate(
  state: LevelState,
  enemy: EnemyState,
  emit: Emit,
  replacesPlateId: PlateId | null = null,
): PlateState {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const boss = run.def.boss;
  const lengthRange =
    enemy.isBoss && boss !== null ? boss.plateLength : enemyDef(state, enemy.defId).plateLength;
  const word = pickPlateWord(run.def, enc.wordsRng, {
    forbidden: visibleFirstLetters(enc),
    recent: enc.recent,
    lengthRange,
  });
  enc.recent.push(word);
  while (enc.recent.length > RECENT_LIMIT) enc.recent.shift();
  // typing gimmicks (T1.5): a scrambled plate shows shuffled letters; a fading plate fades FADE_DELAY after it is shown
  let display: string | undefined;
  // Reveal (v2.0.3): while it runs, a new plate is plain (no scramble, no fade)
  const gimmick = revealActive(state.run, state.tick) ? null : enemy.gimmick;
  if (gimmick === "scrambled") {
    // the replaced plate (guard swap, break) is leaving, so its letters are free again
    const scrambled = scrambleWord(enc.gimmickRng, word, visibleFirstLetters(enc, replacesPlateId));
    if (scrambled !== null) display = scrambled;
  }
  const plate = addPlate(
    state,
    {
      ownerId: enemy.id,
      kind: "word",
      text: word,
      replacesPlateId,
      display,
      gimmick,
      // the clock starts when typing is live (a plate spawned during the intro does not fade before the fight)
      fadeAt: gimmick === "fading" ? fadeTick(Math.max(state.tick, enc.typingFromTick)) : null,
    },
    emit,
  );
  enemy.plateId = plate.id;
  if (plate.scrambled)
    emit({
      type: "WordScrambled",
      tick: state.tick,
      plateId: plate.id,
      enemyId: enemy.id,
      display: plate.display,
    });
  return plate;
}

/**
 * If the enemy currently shows a guard plate, removes it and shows a normal word again. `reason` "expired" is the
 * ignored-attack revert after the hit; "replaced" is a guard cancelled by a Break (the new plate then replaces it).
 */
export function revertGuardPlate(
  state: LevelState,
  enemy: EnemyState,
  reason: "expired" | "replaced",
  emit: Emit,
): void {
  const enc = state.enc as EncounterState;
  const guard = findPlate(enc, enemy.plateId);
  if (guard === null || guard.kind !== "guard") return;
  if (enc.targetPlateId === guard.id) dropTarget(state, "plateChanged", emit);
  removePlate(state, guard, reason, emit);
  assignWordPlate(state, enemy, emit, reason === "replaced" ? guard.id : null);
}

/** Marks the enemy dead, removes its plate, and moves the focus to the lowest-slot living enemy. */
export function killEnemy(state: LevelState, enemy: EnemyState, byKind: HitKind, emit: Emit): void {
  const enc = state.enc as EncounterState;
  enemy.alive = false;
  enemy.hpM = 0;
  enemy.brokenUntil = null;
  cancelAttack(enemy);
  enc.finisherShown = false;
  clearEnemyStatuses(state, enemy, emit);
  emit({
    type: "EnemyDeath",
    tick: state.tick,
    enemyId: enemy.id,
    defId: enemy.defId,
    isBoss: enemy.isBoss,
    byKind,
  });
  const own = findPlate(enc, enemy.plateId);
  if (own !== null) {
    if (enc.targetPlateId === own.id) dropTarget(state, "ownerDied", emit);
    removePlate(state, own, "ownerDied", emit);
  }
  enemy.plateId = null;
  if (enc.focusEnemyId === enemy.id) {
    const next = enc.enemies.find((e) => e.alive);
    enc.focusEnemyId = next === undefined ? null : next.id;
    emit({ type: "FocusChanged", tick: state.tick, enemyId: enc.focusEnemyId });
  }
}

/** Boss finisher: every other plate goes, the exclusive sentence plate is shown and auto-targeted. */
export function showFinisher(state: LevelState, boss: EnemyState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const def = state.run.def.boss as NonNullable<ResolvedLevel["boss"]>;
  enc.finisherShown = true;
  cancelAttack(boss);
  if (enc.targetPlateId !== null) dropTarget(state, "phaseChanged", emit);
  for (const p of [...enc.plates]) removePlate(state, p, "phaseEnded", emit);
  boss.plateId = null;
  const plate = addPlate(
    state,
    { ownerId: boss.id, kind: "finisher", text: def.phase3.finisherText },
    emit,
  );
  boss.plateId = plate.id;
  emit({
    type: "FinisherShown",
    tick: state.tick,
    enemyId: boss.id,
    plateId: plate.id,
    text: plate.text,
  });
}

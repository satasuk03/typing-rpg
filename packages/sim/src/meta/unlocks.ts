// unlockLevel semantics (content ActiveSkillDef / PassiveDef): the FIRST clear of a level unlocks the skills and passives
// that list it as their `unlockLevel`. Replays and failed attempts unlock nothing.
import type { ContentBundle } from "@hd2d/content";

/** Active skills and passives unlocked by clearing `levelId` for the first time (bundle order). */
export function levelUnlocks(
  bundle: ContentBundle,
  levelId: string,
): { actives: string[]; passives: string[] } {
  return {
    actives: bundle.actives.filter((a) => a.unlockLevel === levelId).map((a) => a.id),
    passives: bundle.passives.filter((p) => p.unlockLevel === levelId).map((p) => p.id),
  };
}

/**
 * The unlock lists after a result: `firstClear` is true when this attempt cleared a level that had no cleared flag.
 * Returns the merged (deduplicated, order kept) lists and what is newly added.
 */
export function applyLevelUnlocks(
  bundle: ContentBundle,
  levelId: string,
  firstClear: boolean,
  unlocks: { actives: readonly string[]; passives: readonly string[] },
): {
  unlocks: { actives: string[]; passives: string[] };
  added: { actives: string[]; passives: string[] };
} {
  const add = firstClear ? levelUnlocks(bundle, levelId) : { actives: [], passives: [] };
  const added = {
    actives: add.actives.filter((a) => !unlocks.actives.includes(a)),
    passives: add.passives.filter((p) => !unlocks.passives.includes(p)),
  };
  return {
    unlocks: {
      actives: [...unlocks.actives, ...added.actives],
      passives: [...unlocks.passives, ...added.passives],
    },
    added,
  };
}

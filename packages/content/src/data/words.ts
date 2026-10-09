import type { WordEntry } from "../schemas.ts";
import { CAVE } from "./biome-cave.ts";
import { FOREST } from "./biome-forest.ts";
import { RUINS } from "./biome-ruins.ts";
import { DOOM_SPELLS, FINISHERS, RUBBLE_WORDS, SECOND_WIND } from "./boss.ts";
import { TIER1 } from "./tier1.ts";
import { TIER2 } from "./tier2.ts";

export { RUIN_GOLEM_FINISHER_TEXT } from "./boss.ts";
export { GUARD_KEYS } from "./guard.ts";
export { CAVE, DOOM_SPELLS, FINISHERS, FOREST, RUBBLE_WORDS, RUINS, SECOND_WIND, TIER1, TIER2 };

/** Every authored word entry (plates, guards, boss text), validated by tools/content. */
export const WORDS: WordEntry[] = [
  ...TIER1,
  ...TIER2,
  ...FOREST,
  ...RUINS,
  ...CAVE,
  ...DOOM_SPELLS,
  ...FINISHERS,
  ...SECOND_WIND,
  ...RUBBLE_WORDS,
];

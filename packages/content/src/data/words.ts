import type { WordEntry } from "../schemas.ts";
import { CAVE } from "./biome-cave.ts";
import { FEN } from "./biome-fen.ts";
import { FOREST } from "./biome-forest.ts";
import { GROVE, HUSH_SPELLS, WILLOW_FINISHERS, WILLOW_SECOND_WIND } from "./biome-grove.ts";
import { HOLLOW } from "./biome-hollow.ts";
import { HUSHWOOD, HUSHWOOD_INTRO } from "./biome-hushwood.ts";
import { RUINS } from "./biome-ruins.ts";
import { DOOM_SPELLS, FINISHERS, RUBBLE_WORDS, SECOND_WIND } from "./boss.ts";
import { TIER1 } from "./tier1.ts";
import { TIER2 } from "./tier2.ts";

export { WILLOW_FINISHER_TEXT } from "./biome-grove.ts";
export { RUIN_GOLEM_FINISHER_TEXT } from "./boss.ts";
export { GUARD_KEYS } from "./guard.ts";
export {
  CAVE,
  DOOM_SPELLS,
  FEN,
  FINISHERS,
  FOREST,
  GROVE,
  HOLLOW,
  HUSH_SPELLS,
  HUSHWOOD,
  HUSHWOOD_INTRO,
  RUBBLE_WORDS,
  RUINS,
  SECOND_WIND,
  TIER1,
  TIER2,
  WILLOW_FINISHERS,
  WILLOW_SECOND_WIND,
};

/** Every authored word entry (plates, guards, boss text), validated by tools/content. */
export const WORDS: WordEntry[] = [
  ...TIER1,
  ...TIER2,
  ...FOREST,
  ...RUINS,
  ...CAVE,
  ...HOLLOW,
  ...DOOM_SPELLS,
  ...FINISHERS,
  ...SECOND_WIND,
  ...RUBBLE_WORDS,
  // Chapter 2 (chapter: 2), appended last so the Ch1 pools keep their order
  ...HUSHWOOD,
  ...FEN,
  ...GROVE,
  ...HUSH_SPELLS,
  ...WILLOW_FINISHERS,
  ...WILLOW_SECOND_WIND,
  ...HUSHWOOD_INTRO,
];

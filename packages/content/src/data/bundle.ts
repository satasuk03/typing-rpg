import type { ContentBundle } from "../schemas.ts";
import { BOSSES } from "./bosses.ts";
import { ENEMIES } from "./enemies.ts";
import { GEAR } from "./gear.ts";
import { LEVELS } from "./levels.ts";
import { ACTIVES, PASSIVES } from "./skills.ts";
import { TYPING_TRIAL } from "./trials.ts";
import { WORDS } from "./words.ts";

/** The full Chapter 1 content bundle (T4.1 words + trial, T4.2 enemies, boss, levels, gear, skills). */
export const contentBundle: ContentBundle = {
  words: WORDS,
  enemies: ENEMIES,
  bosses: BOSSES,
  levels: LEVELS,
  gear: GEAR,
  actives: ACTIVES,
  passives: PASSIVES,
  trials: [TYPING_TRIAL],
};

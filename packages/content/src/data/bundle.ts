import type { ContentBundle } from "../schemas.ts";
import { BOSSES } from "./bosses.ts";
import { ENEMIES } from "./enemies.ts";
import { GEAR } from "./gear.ts";
import { CH2_STUB_LEVELS, LEVELS } from "./levels.ts";
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

/**
 * Tools only (T1.1): the shipped bundle plus the placeholder Ch2 levels (levels-ch2.ts CH2_STUB_LEVELS), so
 * `pnpm balance --chapter 2` / `pnpm bot --chapter 2` can run before T4.3 lands. A no-op once the bundle has real
 * Ch2 levels. Delete with the stubs.
 */
export const withCh2Stubs = (b: ContentBundle): ContentBundle =>
  b.levels.some((l) => l.chapter === 2) ? b : { ...b, levels: [...b.levels, ...CH2_STUB_LEVELS] };

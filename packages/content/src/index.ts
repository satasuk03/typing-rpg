export { BOSSES, RUIN_GOLEM } from "./data/bosses.ts";
export { contentBundle } from "./data/bundle.ts";
// The explicit export below shadows the placeholder CONTENT_VERSION that schemas.ts re-exports above.
export { CONTENT_VERSION } from "./data/content-version.generated.ts";
export { ENEMIES } from "./data/enemies.ts";
export { GEAR, RARITY_INFO, type RarityInfo } from "./data/gear.ts";
export { CHAPTER_KNOBS, type ChapterKnobs, knobsFor } from "./data/knobs.ts";
export { CH1_REF_WPM, LEVELS, LEVELS_CH1, LEVELS_CH2 } from "./data/levels.ts";
export { ACTIVES, PASSIVES } from "./data/skills.ts";
export { TYPING_TRIAL, TYPING_TRIAL_PASSAGES } from "./data/trials.ts";
export * from "./data/words.ts";
export * from "./schemas.ts";
export const PACKAGE = "@hd2d/content";

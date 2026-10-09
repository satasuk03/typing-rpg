import type { ContentBundle } from "../schemas.ts";
import { TYPING_TRIAL } from "./trials.ts";
import { WORDS } from "./words.ts";

/**
 * The T4.1 slice of the content bundle (words + trial). T4.2 fills enemies, bosses, levels and gear;
 * until then those arrays are empty, and CONTENT_VERSION covers only what exists.
 */
export const contentBundle: ContentBundle = {
  words: WORDS,
  enemies: [],
  bosses: [],
  levels: [],
  gear: [],
  actives: [],
  passives: [],
  trials: [TYPING_TRIAL],
};

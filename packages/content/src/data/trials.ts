import type { ContentBundle } from "../schemas.ts";
import { PASSAGES_A } from "./trials-a.ts";
import { PASSAGES_B } from "./trials-b.ts";
import { PASSAGES_C } from "./trials-c.ts";

/** Standardized Typing Trial pool (interfaces D25): >= 30 passages of >= 1600 chars. */
export const TYPING_TRIAL_PASSAGES: string[] = [...PASSAGES_A, ...PASSAGES_B, ...PASSAGES_C];

export const TYPING_TRIAL: ContentBundle["trials"][number] = {
  id: "typing-trial",
  name: "Typing Trial",
  durationS: 60,
  passages: TYPING_TRIAL_PASSAGES,
};

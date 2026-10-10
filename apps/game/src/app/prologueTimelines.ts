/**
 * The two cutscene timelines the prologue flow plays (P3.5 flow, P3.6 content): Part A "cold open" and Part C "The
 * Unwriting" live in `cutscene/timelines/prologue.ts`. Part B is the real sim.
 */
import { OPEN_TIMELINE, UNWRITING_TIMELINE } from "../cutscene/timelines/prologue";
import type { Timeline } from "../cutscene/types";

export interface PrologueTimelines {
  open: Timeline;
  unwriting: Timeline;
}

export const PROLOGUE_TIMELINES: PrologueTimelines = {
  open: OPEN_TIMELINE,
  unwriting: UNWRITING_TIMELINE,
};

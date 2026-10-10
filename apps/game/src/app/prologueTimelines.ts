/**
 * The two cutscene timelines the prologue flow plays (P3.5). PLACEHOLDERS: a short camera move + mood blend + one line,
 * enough to exercise the flow (startPlay, line gate, end, skip). P3.6 replaces the bodies with the real Parts A and C
 * (`cutscene/timelines/prologue.ts`): change only the import in `PROLOGUE_TIMELINES` below, the flow code is unchanged.
 */
import type { Timeline } from "../cutscene/types";

/** Part A: cold open. The `startPlay` cue starts the sim (Part B). */
export const OPEN_PLACEHOLDER: Timeline = {
  id: "prologue.open",
  durationMs: 3400,
  setup: "standalone",
  cues: [
    { at: 0, kind: "camera", pose: { anchor: "walk", offset: { dist: 6, pitch: 6 } }, ease: "cut" },
    { at: 0, kind: "actor", who: "hero", anim: "idle" },
    { at: 400, dur: 2400, kind: "camera", pose: { anchor: "battle" }, ease: "inOut" },
    { at: 3000, kind: "startPlay" },
    { at: 3400, kind: "end" },
  ],
};

/** Part C: "The Unwriting". Continues on the live stage after `PrologueClimax`. */
export const UNWRITING_PLACEHOLDER: Timeline = {
  id: "prologue.unwriting",
  durationMs: 5200,
  setup: "continue",
  cues: [
    { at: 0, dur: 3200, kind: "mood", to: "unwritten" },
    { at: 0, dur: 3600, kind: "camera", pose: { anchor: "boss" }, ease: "inOut" },
    { at: 600, kind: "line", speaker: "nul", text: "Enough." },
    { at: 3400, kind: "actor", who: "hero", anim: "kneel" },
    { at: 5200, kind: "end" },
  ],
};

export interface PrologueTimelines {
  open: Timeline;
  unwriting: Timeline;
}

export const PROLOGUE_TIMELINES: PrologueTimelines = {
  open: OPEN_PLACEHOLDER,
  unwriting: UNWRITING_PLACEHOLDER,
};

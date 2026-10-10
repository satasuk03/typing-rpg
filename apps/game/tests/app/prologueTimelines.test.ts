import { describe, expect, it } from "vitest";
import { PROLOGUE_TIMELINES } from "../../src/app/prologueTimelines";
import { validate } from "../../src/cutscene/timeline";

// The flow (app/prologueTimelines.ts) plays whatever timelines are plugged in there; P3.6 swaps in the real ones.
describe("prologue flow timelines", () => {
  it("are valid", () => {
    expect(validate(PROLOGUE_TIMELINES.open)).toEqual([]);
    expect(validate(PROLOGUE_TIMELINES.unwriting)).toEqual([]);
  });

  it("Part A starts the sim exactly once and Part C continues the live stage", () => {
    expect(PROLOGUE_TIMELINES.open.cues.filter((c) => c.kind === "startPlay")).toHaveLength(1);
    expect(PROLOGUE_TIMELINES.unwriting.cues.filter((c) => c.kind === "startPlay")).toHaveLength(0);
    expect(PROLOGUE_TIMELINES.unwriting.setup).toBe("continue");
  });
});

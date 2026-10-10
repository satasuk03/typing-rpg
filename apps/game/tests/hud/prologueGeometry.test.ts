import { describe, expect, it } from "vitest";
import { dialogueGeom, grimoireGeom, rectsHit, wrapLines } from "../../src/hud/prologue/geometry";
import { dialogueContrast, speakerContrast } from "../../src/hud/prologue/palette";

describe("prologue HUD geometry", () => {
  it("dialogue and speaker contrast are >= 7:1", () => {
    expect(dialogueContrast()).toBeGreaterThanOrEqual(7);
    expect(speakerContrast("nul")).toBeGreaterThanOrEqual(7);
    expect(speakerContrast("knight")).toBeGreaterThanOrEqual(7);
  });
  it("the Part C Grimoire never overlaps the dialogue at any viewport", () => {
    for (const H of [600, 720, 800]) {
      const d = dialogueGeom(1280, H).rect;
      const g = grimoireGeom(1280, H, 6, 1).rect;
      expect(rectsHit(d, g)).toBe(false);
      expect(g.y).toBeGreaterThan(0);
    }
  });
  it("wraps 8 words into at most 2 lines at the box width", () => {
    const d = dialogueGeom(1280, 720);
    const lines = wrapLines(
      (s) => s.length * 17,
      "Your words are bright, little knight, truly.",
      d.inner.w,
    );
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

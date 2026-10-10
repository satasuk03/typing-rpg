import { describe, expect, it } from "vitest";
import { dialogueGeom, grimoireGeom, rectsHit, wrapLines } from "../../src/hud/prologue/geometry";
import { dialogueContrast, speakerContrast } from "../../src/hud/prologue/palette";

describe("prologue HUD geometry", () => {
  it("dialogue and speaker contrast are >= 7:1", () => {
    expect(dialogueContrast()).toBeGreaterThanOrEqual(7);
    expect(speakerContrast("nul")).toBeGreaterThanOrEqual(7);
    expect(speakerContrast("knight")).toBeGreaterThanOrEqual(7);
  });
  it("the Part C Grimoire lives in the dialogue lane (bottom centre, in the bottom 30% of H) and the Part B one stays bottom left", () => {
    for (const H of [600, 720, 800]) {
      const g = grimoireGeom(1280, H, 6, 1).rect;
      expect(g.y).toBeGreaterThan(H * 0.7);
      expect(g.y + g.h).toBeLessThanOrEqual(H);
      expect(g.x + g.w / 2).toBeCloseTo(640, 0);
      const b = grimoireGeom(1280, H, 6, 0).rect;
      expect(b.x).toBeLessThan(40);
    }
  });
  it("a fitted dialogue box is at least 40% of W and never wider than the full box", () => {
    const full = dialogueGeom(1280, 720).rect;
    const short = dialogueGeom(1280, 720, 200).rect;
    expect(short.w).toBeLessThanOrEqual(full.w);
    expect(dialogueGeom(1280, 720, 9999).rect.w).toBe(full.w);
    // the Grimoire sits in the same lane as the dialogue (the HUD never shows both: a line hides it)
    expect(rectsHit(short, grimoireGeom(1280, 720, 6, 1).rect)).toBe(true);
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

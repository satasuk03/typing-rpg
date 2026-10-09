/** Unit tests for the T3.3 pure pieces: tutorial queue, calibration maths and storage, skill text numbers. */
import { contentBundle } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { calibrationStats, calibrationWords } from "../../src/app/screens/calibrate";
import { fillSkillText } from "../../src/app/skillText";
import { CUE_COPY, TutorialQueue } from "../../src/hud/tutorial";
import { buildResultsModel, levelTitle } from "../../src/level/screens";
import { isFirstRun, newSave, setCalibration } from "../../src/meta/ops";

describe("TutorialQueue", () => {
  it("shows one card at a time, in emission order", () => {
    const q = new TutorialQueue();
    q.push("target", 0);
    q.push("atb", 10);
    q.push("combo", 20);
    expect(q.active?.cue).toBe("target");
    expect(q.pending).toBe(2);
    // typing before minMs does not dismiss
    expect(q.key(1000)).toBe(false);
    expect(q.key(CUE_COPY.target.minMs + 1)).toBe(true);
    expect(q.active).toBeNull();
    // the next one waits out the gap
    expect(q.tick(CUE_COPY.target.minMs + 100)).toBe(false);
    expect(q.tick(CUE_COPY.target.minMs + 1 + q.gapMs)).toBe(true);
    expect(q.active?.cue).toBe("atb");
  });

  it("the guard card jumps the queue; a cue never shows twice; cards expire", () => {
    const q = new TutorialQueue();
    q.push("target", 0);
    q.push("atb", 1);
    q.push("guard", 2);
    q.dismiss(5000);
    q.tick(6000);
    expect(q.active?.cue).toBe("guard");
    q.push("target", 7000); // already shown
    q.tick(6000 + CUE_COPY.guard.maxMs);
    expect(q.active).toBeNull();
    q.tick(6000 + CUE_COPY.guard.maxMs + q.gapMs);
    expect(q.active?.cue).toBe("atb");
  });

  it("a stuck player is never blocked: max time clears the card with no key at all", () => {
    const q = new TutorialQueue();
    q.push("skill", 0);
    expect(q.tick(CUE_COPY.skill.maxMs)).toBe(true);
    expect(q.active).toBeNull();
  });
});

describe("calibration", () => {
  it("uses standard WPM and accuracy", () => {
    // 100 correct chars + 20 words (the spaces) in 25 s = 120/5 chars per 25 s = 57.6 WPM
    expect(calibrationStats(100, 5, 20, 25)).toEqual({ wpm: 58, accuracyPct: 95, words: 20 });
    expect(calibrationStats(0, 0, 0, 25).accuracyPct).toBe(100);
  });

  it("has enough short lowercase words", () => {
    const w = calibrationWords();
    expect(w.length).toBe(120);
    expect(w.every((x) => /^[a-z]{3,6}$/.test(x))).toBe(true);
  });

  it("stores the calibration clamped to the pace range, and marks the profile as no longer fresh", () => {
    const s0 = newSave(0, 1);
    expect(isFirstRun(s0)).toBe(true);
    expect(setCalibration(s0, 6, 1).pace.calibrationWpm).toBe(15);
    expect(setCalibration(s0, 400, 1).pace.calibrationWpm).toBe(120);
    const s1 = setCalibration(s0, 31.4, 1);
    expect(s1.pace.calibrationWpm).toBe(31);
    expect(isFirstRun(s1)).toBe(false);
  });
});

describe("skill text", () => {
  it("fills every placeholder of every skill and passive from BALANCE", () => {
    for (const d of [...contentBundle.actives, ...contentBundle.passives]) {
      const t = fillSkillText(d.description, d.id);
      expect(t, d.id).not.toMatch(/\{\w+\}/);
    }
    const fire = contentBundle.actives.find((a) => a.id === "fireball");
    expect(fillSkillText(fire?.description ?? "", "fireball")).toBe(
      "Hurls a fireball for 130% of your ATK and sets the target ablaze for 6 s.",
    );
  });
});

describe("results subtitle", () => {
  it("names the level", () => {
    const def = { levelId: "ch1-l01", index: 1 } as never;
    expect(levelTitle(def)).toBe("Level 1 · Sunlit Glade");
    const m = buildResultsModel(
      {
        outcome: "cleared",
        words: [],
        chests: [],
        stats: { netWpmX100: 0, accuracyBp: 0 },
      } as never,
      def,
      35,
      new Set(),
      { stars: [true, false, false] },
    );
    expect(m.subtitle).toBe("Level 1 · Sunlit Glade");
  });
});

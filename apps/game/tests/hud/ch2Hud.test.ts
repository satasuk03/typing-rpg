import type { LevelView } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import { checkSnapshot } from "../../src/hud/invariants";
import { solveLayout } from "../../src/hud/layout";
import { enemyHasTags, healerCharge } from "../../src/hud/panels";
import { fadedLetterAlpha, NEXT_LETTER_MIN_ALPHA } from "../../src/hud/plates";
import { activeRiddle, lastLine, riddlePanelRect, riddleSlide } from "../../src/hud/riddlePanel";

const rv = {
  riddleIndex: 1,
  riddleCount: 5,
  clue: "c",
  leafPlateIds: [1, 2, 3] as [number, number, number],
  ticksLeft: 10,
  totalTicks: 100,
  last: null,
};
const view = (m: unknown): LevelView => ({ minigame: m }) as unknown as LevelView;

describe("riddle panel visibility", () => {
  it("shows only for a live riddle", () => {
    expect(activeRiddle(view({ lanes: 3, kind: "riddle", riddle: rv }))).toBe(rv);
    expect(activeRiddle(view({ lanes: 3, kind: "riddle", riddle: null }))).toBeNull(); // gap / Second Wind
    expect(activeRiddle(view({ lanes: 3, kind: "riddle" }))).toBeNull();
    expect(activeRiddle(view({ lanes: 3, kind: "fallingRubble" }))).toBeNull();
    expect(activeRiddle(view({ lanes: 3 }))).toBeNull(); // absent kind = falling rubble
    expect(activeRiddle(view(null))).toBeNull();
  });
  it("feedback text and colour per outcome", () => {
    expect(lastLine({ outcome: "right", answerText: "moon" }).text).toContain("RIGHT");
    expect(lastLine({ outcome: "wrong", answerText: "moon" }).text).toContain("WRONG");
    expect(lastLine({ outcome: "timeout", answerText: "moon" }).text).toContain("TIME UP");
    expect(lastLine({ outcome: "right", answerText: "m" }).col).not.toBe(
      lastLine({ outcome: "wrong", answerText: "m" }).col,
    );
  });
  it("the layout solver keeps plates out of the panel rect", () => {
    const panel = riddlePanelRect(1280, true);
    const boxes = [0, 1, 2].map((i) => ({
      id: i,
      w: 200,
      h: 60,
      ax: 400 + i * 240,
      ay: panel.y + 40, // desired spot is inside the panel
    }));
    const out = solveLayout(boxes, {
      width: 1280,
      height: 720,
      margin: 10,
      gap: 6,
      avoid: [panel],
      deadband: 3,
    });
    for (const r of out.values()) {
      const hit =
        r.x < panel.x + panel.w &&
        r.x + r.w > panel.x &&
        r.y < panel.y + panel.h &&
        r.y + r.h > panel.y;
      expect(hit).toBe(false);
    }
  });
});

describe("healer ring", () => {
  it("fills as ticksLeft counts down and hides when paused", () => {
    expect(healerCharge({ ticksLeft: 900, totalTicks: 900, healsLeft: null })).toBe(0);
    expect(healerCharge({ ticksLeft: 450, totalTicks: 900, healsLeft: 2 })).toBeCloseTo(0.5);
    expect(healerCharge({ ticksLeft: 0, totalTicks: 900, healsLeft: 1 })).toBe(1);
    expect(healerCharge({ ticksLeft: null, totalTicks: 900, healsLeft: 0 })).toBeNull();
  });
  it("tags only for healers and elites", () => {
    expect(enemyHasTags({})).toBe(false);
    expect(enemyHasTags({ elite: true })).toBe(true);
    expect(enemyHasTags({ healer: { ticksLeft: null, totalTicks: 1, healsLeft: null } })).toBe(
      true,
    );
  });
});

describe("fading words (brief 5.3)", () => {
  it("typed letters stay normal, untyped lerp to the floor, the next never drops below 0.85", () => {
    expect(fadedLetterAlpha(1, false, true)).toBe(1);
    expect(fadedLetterAlpha(0, false, false)).toBe(1);
    expect(fadedLetterAlpha(1, false, false)).toBeLessThan(0.5);
    for (let k = 0; k <= 10; k++)
      expect(fadedLetterAlpha(k / 10, true, false)).toBeGreaterThanOrEqual(NEXT_LETTER_MIN_ALPHA);
  });
  it("the invariant flags a dim next letter on a faded plate", () => {
    const snap = (a: number) =>
      ({
        viewport: { w: 1280, h: 720, dpr: 1, scale: 1 },
        plates: [
          {
            id: 1,
            kind: "word",
            isTarget: true,
            rect: { x: 100, y: 100, w: 200, h: 60 },
            frameRect: { x: 100, y: 100, w: 200, h: 60 },
            fontPx: 22,
            letters: [],
            contrast: 9,
            faded: true,
            nextAlpha: a,
          },
        ],
        popRects: [],
        popTexts: [],
        bannerRects: [],
        panelTextRects: [],
        heroRect: null,
        bossPlateRect: null,
      }) as unknown as Parameters<typeof checkSnapshot>[0];
    expect(checkSnapshot(snap(0.92))).toEqual([]);
    expect(checkSnapshot(snap(0.5)).join()).toContain("next letter alpha");
  });
});

describe("riddle slide-in (brief 5.4)", () => {
  it("250 ms, instant in reduced motion", () => {
    expect(riddleSlide(0, false).a).toBe(0);
    expect(riddleSlide(0.25, false)).toEqual({ dy: 0, a: 1 });
    expect(riddleSlide(0.05, true)).toEqual({ dy: 0, a: 1 });
    expect(riddleSlide(0.1, false).dy).toBeLessThan(0);
  });
});

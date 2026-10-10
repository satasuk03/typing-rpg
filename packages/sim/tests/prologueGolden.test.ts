import { describe, expect, test } from "vitest";
import prologueFixture from "./fixtures/golden-prologue.json" with { type: "json" };
import { PROLOGUE_GOLDEN_SCENARIOS, prologueGoldens } from "./prologueGolden.ts";

describe("prologue golden replays (P1.1)", () => {
  test("the scripted-typist replays match the committed golden-prologue.json (the Chromium parity test checks the same file)", () => {
    expect(prologueGoldens()).toEqual(prologueFixture.goldens);
    expect(Object.keys(prologueFixture.goldens).sort()).toEqual(
      [...PROLOGUE_GOLDEN_SCENARIOS].sort(),
    );
  });

  test("the scenarios exercise the rules: two clear through the climax, two never end (no timeout, no fail), the hard one rides the floor", () => {
    const g = prologueFixture.goldens;
    for (const n of ["perfect-clear", "random-clear"] as const) {
      expect(g[n].outcome).toBe("cleared");
      expect(g[n].climaxTick).toBeGreaterThan(0);
      expect(g[n].climaxTick).toBe(g[n].endTick - 1); // PrologueClimax and LevelCleared share the final tick
      expect(g[n].skillsCast).toBeGreaterThan(3);
    }
    for (const n of ["idle-3000", "typos-hard-floor"] as const) {
      expect(g[n].outcome).toBe("none");
      expect(g[n].climaxTick).toBe(-1);
    }
    expect(g["typos-hard-floor"].heroHpM).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "vitest";
import willowFixture from "./fixtures/golden-willow.json" with { type: "json" };
import { WILLOW_GOLDEN_SCENARIOS, willowGoldens } from "./willowGolden.ts";

describe("Willow golden replays (T1.3)", () => {
  test("the reference-bot replays match the committed golden-willow.json (the Chromium parity test checks the same file)", () => {
    expect(willowGoldens()).toEqual(willowFixture.goldens);
    expect(Object.keys(willowFixture.goldens).sort()).toEqual([...WILLOW_GOLDEN_SCENARIOS].sort());
  });

  test("the scenarios exercise the riddle: all five resolve, one scenario has a wrong answer, both clear", () => {
    for (const g of Object.values(willowFixture.goldens)) {
      expect(g.riddlesRight + g.riddlesWrong + g.riddlesTimeout).toBe(5);
      expect(g.outcome).toBe("cleared");
    }
    expect(willowFixture.goldens["willow-25wpm-wrong"]?.riddlesWrong).toBeGreaterThan(0);
  });
});

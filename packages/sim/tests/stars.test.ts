// T1.6 stars: clear, accuracy vs own 7-day median, and every third-star challenge kind with its edges.
import type { StarChallenge } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  addDays,
  computePace,
  evaluateStars,
  type LevelResult,
  median7dAccuracyBp,
  parTimeTicks,
  star2ThresholdBp,
} from "../src/index.ts";

function result(
  over: Partial<LevelResult["stats"]> = {},
  top: Partial<LevelResult> = {},
): LevelResult {
  return {
    levelId: "ch1-l01",
    outcome: "cleared",
    failReason: null,
    durationTicks: 9000,
    activeTicks: 6000,
    gold: 100,
    chests: [],
    stats: {
      correctChars: 500,
      typos: 10,
      wordsCompleted: 100,
      perfectWords: 90,
      maxCombo: 20,
      maxKeyStreak: 60,
      netWpmX100: 4000,
      accuracyBp: 9400,
      hitsTaken: 2,
      blocks: 4,
      perfectParries: 4,
      autoAttacks: 12,
      skillsCast: 3,
      secondWindUsed: false,
      damageByOriginM: { weapon: 0, chip: 0, skill: 0, counter: 0, minigame: 0, finisher: 0 },
      ...over,
    },
    words: [],
    ...top,
  };
}
const stars = (
  r: LevelResult,
  star3: StarChallenge,
  median: number | null = null,
  pace = 35,
  parRefTicks = 6000,
) => evaluateStars({ result: r, star3, parRefTicks, pace, median7dAccuracyBp: median });

describe("star 1 and star 2", () => {
  test("a failed level earns nothing; a clear earns star 1", () => {
    const f = result({}, { outcome: "failed", failReason: "defeated" });
    expect(stars(f, { kind: "noSkills" })).toEqual([false, false, false]);
    expect(stars(result({ skillsCast: 9 }), { kind: "noSkills" })[0]).toBe(true);
  });

  test("star 2 = accuracy >= clamp(median, 88%, 97%); no history -> 88%", () => {
    expect(star2ThresholdBp(null)).toBe(8800);
    expect(star2ThresholdBp(8000)).toBe(8800); // clamped up
    expect(star2ThresholdBp(9500)).toBe(9500);
    expect(star2ThresholdBp(9900)).toBe(9700); // clamped down
    const c: StarChallenge = { kind: "noSkills" };
    expect(stars(result({ accuracyBp: 8800 }), c, null)[1]).toBe(true);
    expect(stars(result({ accuracyBp: 8799 }), c, null)[1]).toBe(false);
    expect(stars(result({ accuracyBp: 9500 }), c, 9500)[1]).toBe(true);
    expect(stars(result({ accuracyBp: 9499 }), c, 9500)[1]).toBe(false);
    expect(stars(result({ accuracyBp: 9700 }), c, 9900)[1]).toBe(true);
    expect(stars(result({ accuracyBp: 9699 }), c, 9900)[1]).toBe(false);
  });

  test("zen difficulty earns no stars beyond the first", () => {
    const e = evaluateStars({
      result: result({ skillsCast: 0 }),
      star3: { kind: "noSkills" },
      parRefTicks: 6000,
      pace: 35,
      median7dAccuracyBp: null,
      difficulty: "zen",
    });
    expect(e).toEqual([true, false, false]);
  });
});

describe("star 3 challenges", () => {
  test("untouched: hitsTaken <= maxHits (hits that dealt HP damage)", () => {
    const c: StarChallenge = { kind: "untouched", maxHits: 3 };
    expect(stars(result({ hitsTaken: 3 }), c)[2]).toBe(true);
    expect(stars(result({ hitsTaken: 4 }), c)[2]).toBe(false);
    expect(stars(result({ hitsTaken: 0 }), { kind: "untouched", maxHits: 0 })[2]).toBe(true);
    expect(stars(result({ hitsTaken: 1 }), { kind: "untouched", maxHits: 0 })[2]).toBe(false);
  });

  test("streak: maxCombo >= N", () => {
    const c: StarChallenge = { kind: "streak", combo: 15 };
    expect(stars(result({ maxCombo: 15 }), c)[2]).toBe(true);
    expect(stars(result({ maxCombo: 14 }), c)[2]).toBe(false);
  });

  test("guardian: perfectParries >= N", () => {
    const c: StarChallenge = { kind: "guardian", parries: 5 };
    expect(stars(result({ perfectParries: 5 }), c)[2]).toBe(true);
    expect(stars(result({ perfectParries: 4 }), c)[2]).toBe(false);
  });

  test("noSkills: zero casts", () => {
    expect(stars(result({ skillsCast: 0 }), { kind: "noSkills" })[2]).toBe(true);
    expect(stars(result({ skillsCast: 1 }), { kind: "noSkills" })[2]).toBe(false);
  });

  test("parTime: activeTicks <= ceil(parRef x 35 / pace x slack), scaled by the player's own pace", () => {
    const c: StarChallenge = { kind: "parTime", slack: 1.2 };
    // pace 35: 6000 x 1.2 = 7200
    expect(parTimeTicks(6000, 35, 1.2)).toBe(7200);
    expect(stars(result({}, { activeTicks: 7200 }), c, null, 35)[2]).toBe(true);
    expect(stars(result({}, { activeTicks: 7201 }), c, null, 35)[2]).toBe(false);
    // pace 70: half the time
    expect(parTimeTicks(6000, 70, 1.2)).toBe(3600);
    expect(stars(result({}, { activeTicks: 3600 }), c, null, 70)[2]).toBe(true);
    expect(stars(result({}, { activeTicks: 3601 }), c, null, 70)[2]).toBe(false);
    // ceil on a non-integer: 6001 x 35 / 36 x 1.15
    expect(parTimeTicks(6001, 36, 1.15)).toBe(Math.ceil((6001 * 35 * 11500) / (36 * 10000)));
  });

  test("a failed attempt never meets a challenge, even a trivially true one", () => {
    const f = result({ skillsCast: 0 }, { outcome: "failed", failReason: "abandoned" });
    expect(stars(f, { kind: "noSkills" })[2]).toBe(false);
  });

  test("stars are independent: star 3 without star 2", () => {
    expect(stars(result({ accuracyBp: 8000, skillsCast: 0 }), { kind: "noSkills" })).toEqual([
      true,
      false,
      true,
    ]);
  });
});

describe("7-day median accuracy and pace", () => {
  test("median of the days in [today-6, today]; even count floors the mean; no history -> null", () => {
    const d = (day: string, accuracyBp: number) => ({ day, accuracyBp });
    const daily = [
      d("2026-10-01", 5000),
      d("2026-10-03", 9000),
      d("2026-10-05", 9200),
      d("2026-10-09", 9400),
    ];
    // window 2026-10-03 .. 2026-10-09 -> 9000, 9200, 9400 -> 9200
    expect(median7dAccuracyBp(daily, "2026-10-09")).toBe(9200);
    expect(median7dAccuracyBp(daily, "2026-10-10")).toBe(9300); // 10-04..10-10: 9200, 9400 -> floor mean
    expect(median7dAccuracyBp(daily, "2026-12-01")).toBeNull();
    expect(median7dAccuracyBp([], "2026-10-09")).toBeNull();
  });

  test("calendar arithmetic across month and year boundaries and leap years", () => {
    expect(addDays("2026-03-02", -6)).toBe("2026-02-24");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-01-03", -6)).toBe("2025-12-28");
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  test("computePace: median of the last 10, else calibration, else 35; clamped 15..120", () => {
    expect(computePace([], null)).toBe(35);
    expect(computePace([], 52)).toBe(52);
    expect(computePace([40, 50, 30], 99)).toBe(40);
    expect(computePace([10, 20, 30, 40], null)).toBe(25);
    expect(computePace([1, 2, 3], null)).toBe(15);
    expect(computePace([200], null)).toBe(120);
    expect(
      computePace([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60], null),
    ).toBe(60); // last 10 only
  });
});

import { describe, expect, test } from "vitest";
import {
  drawAttempt,
  KNOWN_MISSES,
  PERSONAS,
  type PersonaSummary,
  pyEncounterHp,
  runJob,
  typingCombat,
  verdicts,
} from "../src/index.ts";

describe("Python model port (economy_sim typing_combat, level_spec)", () => {
  test("reproduces the Python reference dump (tests/fixtures/economy-reference.json of @hd2d/sim)", () => {
    // ref.typing_combat["35_92"] / ["35_94"]
    expect(typingCombat(35, 0.92).dpsPerAtk).toBeCloseTo(0.5538397732448966, 6);
    expect(typingCombat(35, 0.92).skillShare).toBeCloseTo(0.1662454545220405, 6);
    expect(typingCombat(35, 0.94).dpsPerAtk).toBeCloseTo(0.5759198759351524, 6);
    expect(typingCombat(35, 0.94).attacksPs).toBeCloseTo(0.32579291383228365, 6);
  });
  test("chapter 1 encounter HP is the Python's 199.4 at L1 rising 2% per level (231.3 at L9)", () => {
    expect(pyEncounterHp(1)).toBeCloseTo(199.38, 1);
    expect(pyEncounterHp(9)).toBeCloseTo(231.28, 1);
  });
});

describe("personas", () => {
  test("economy_sim's Chapter 1 starting skill", () => {
    expect(PERSONAS.map((p) => [p.id, p.wpm, p.acc, p.guard])).toEqual([
      ["beginner", 20, 0.88, 0.4],
      ["average", 40, 0.94, 0.6],
      ["fast", 75, 0.97, 0.75],
      ["ref", 35, 0.92, 0.6],
    ]);
  });
  test("noise: perf ~ N(1, 0.10) on WPM, accuracy +-0.012, deterministic per seed", () => {
    const p = PERSONAS[1] as (typeof PERSONAS)[number];
    expect(drawAttempt(p, 7, false)).toMatchObject({ wpm: 40, acc: 0.94, pace: 40 });
    expect(drawAttempt(p, 7)).toEqual(drawAttempt(p, 7));
    const w = Array.from({ length: 4000 }, (_, i) => drawAttempt(p, i).wpm / 40);
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
    expect(m).toBeCloseTo(1, 1);
    expect(sd).toBeGreaterThan(0.09);
    expect(sd).toBeLessThan(0.11);
  });
});

describe("runner", () => {
  test("a job is deterministic and the average persona clears L5", () => {
    const job = { persona: "average" as const, levelId: "ch1-l05", seeds: 3, noise: true };
    const a = runJob(job);
    expect(runJob(job)).toEqual(a);
    expect(a.every((r) => r.cleared)).toBe(true);
    for (const r of a) {
      expect(r.activeS).toBeCloseTo(r.simS + 10, 6); // LEVEL_END_S
      expect(r.encounters).toBe(3);
      expect(r.dmgByOrigin.skill).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe("verdicts", () => {
  const base: PersonaSummary = {
    persona: "beginner",
    normalActiveMin: 3.5,
    normalActiveMin3Enc: 3.6,
    normalClear: 0.9,
    normalClearMin: 0.85,
    bossActiveMin: 5.4,
    bossClear: 0.6,
    skillShare: 0.16,
    skillShareNormal: 0.16,
    autoPerEnc: 11,
    pyNormalActiveMin: 3.5,
    pyBossActiveMin: 5.4,
    chapterGold: 2000,
  };
  const v = (s: Partial<PersonaSummary>) =>
    Object.fromEntries(verdicts([{ ...base, ...s }]).map((c) => [c.metric, c.verdict]));
  test("ranges pass inside, pass(±15%) within 15% of a bound, fail beyond; clear rates are floors", () => {
    expect(v({})["normal active min (L1-L9 mean)"]).toBe("PASS");
    expect(v({ normalActiveMin: 2.6 })["normal active min (L1-L9 mean)"]).toBe("PASS(±15%)");
    expect(v({ normalActiveMin: 2.5 })["normal active min (L1-L9 mean)"]).toBe("FAIL");
    expect(v({ normalClear: 0.79 })["first-try clear normal (mean)"]).toBe("FAIL");
    expect(v({ bossActiveMin: 6.2 })["boss active min"]).toBe("PASS(±15%)");
  });
  test("a documented structural miss is FAIL*, not FAIL", () => {
    expect(KNOWN_MISSES).toContain("beginner:boss active min");
    expect(v({ bossActiveMin: 9 })["boss active min"]).toBe("FAIL*");
    expect(
      verdicts([{ ...base, persona: "average", bossActiveMin: 9 }]).find(
        (c) => c.metric === "boss active min",
      )?.verdict,
    ).toBe("FAIL");
  });
});

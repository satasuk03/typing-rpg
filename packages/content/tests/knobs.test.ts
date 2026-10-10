// T1.1 CHAPTER_KNOBS (docs/interfaces.md §13.6): Ch1 is pinned to the pre-v2.0 constants (byte-identity, §13.1).
import { describe, expect, test } from "vitest";
import {
  BOSS_ATTACK_POWER,
  BOSS_LEVEL_HIT_MULT,
  ENC_HP_MULT,
  HIT_MULT,
} from "../src/data/levels.ts";
import {
  CHAPTER_KNOBS,
  contentBundle,
  knobsFor,
  LEVELS,
  LEVELS_CH2,
  RUIN_GOLEM,
} from "../src/index.ts";

describe("CHAPTER_KNOBS", () => {
  test("Ch1 is pinned to today's values", () => {
    expect(CHAPTER_KNOBS[1]).toEqual({
      encHpMult: 1.2,
      hitMult: 1.34,
      bossLevelHitMult: 1.15,
      gruntAttackPower: 1,
      eliteAttackPower: null,
      bossAttackPower: 1.25,
      bossAddsAttackPower: 1.25,
    });
  });
  test("the levels-ch1 named exports alias CHAPTER_KNOBS[1]", () => {
    expect(ENC_HP_MULT).toBe(1.2);
    expect(HIT_MULT).toBe(1.34);
    expect(BOSS_LEVEL_HIT_MULT).toBe(1.15);
    expect(BOSS_ATTACK_POWER).toBe(1.25);
    expect(RUIN_GOLEM.attackPower).toBe(1.25);
    expect(RUIN_GOLEM.phase1.addsAttackPower).toBe(1.25);
  });
  test("Ch2: plan P values; the multipliers are placeholders equal to Ch1 until T5.1", () => {
    const k = knobsFor(2);
    expect(k.gruntAttackPower).toBe(1.07);
    expect(k.eliteAttackPower).toBe(1.25);
    expect(k.bossAttackPower).toBe(1.3);
    expect(k.bossAddsAttackPower).toBe(1.25);
    expect([k.encHpMult, k.hitMult, k.bossLevelHitMult]).toEqual([1.2, 1.25, 0.9]);
  });
  test("knobsFor throws on a chapter with no row (no silent fallback)", () => {
    expect(() => knobsFor(3)).toThrow(/chapter 3/);
    expect(() => knobsFor(0)).toThrow();
  });
});

describe("Ch2 levels", () => {
  test("ch2-l01..l10, chapter 2, contiguous, layoutId = id, the boss is last", () => {
    expect(LEVELS_CH2.map((l) => l.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `ch2-l${String(i + 1).padStart(2, "0")}`),
    );
    for (const l of LEVELS_CH2) {
      expect(l.chapter).toBe(2);
      expect(l.layoutId).toBe(l.id);
      expect(l.kind).toBe(l.index === 10 ? "boss" : "normal");
      expect(l.segments.some((s) => s.kind === "boss")).toBe(l.index === 10);
    }
  });
  test("the shipped bundle holds Ch1 then Ch2", () => {
    expect(LEVELS.filter((l) => l.chapter === 1)).toHaveLength(10);
    expect(contentBundle.levels).toHaveLength(20);
    expect(contentBundle.levels.map((l) => l.chapter)).toEqual(
      [...contentBundle.levels.map((l) => l.chapter)].sort(),
    );
  });
});

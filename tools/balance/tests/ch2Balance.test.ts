// T5.1 Chapter 2 balance tooling: per-chapter targets, "the Ch2 player" kit, the Python model at the Ch2 par ATK, the
// per-slot gear offsets, and the bot's Shift cost and riddle reading (docs/balance-ch2.md).
import { describe, expect, test } from "vitest";
import {
  defaultKit,
  drawAttempt,
  gearLabel,
  PERSONAS,
  type PersonaSummary,
  PLAN_TARGETS,
  parAtk,
  parseGear,
  planTargetsFor,
  pyEncounterHp,
  RIDDLE_READ,
  runJob,
  SHIFT_MODEL,
  starterLoadout,
  unlockedBefore,
  verdicts,
} from "../src/index.ts";

describe("per-chapter targets", () => {
  test("Ch1 keeps PLAN_TARGETS; Ch2 has the §4.2 numbers and the PO windows", () => {
    expect(planTargetsFor(1)).toBe(PLAN_TARGETS);
    const t = planTargetsFor(2);
    expect(t.beginner.clearBossWindow).toEqual([0.75, 0.9]);
    expect(t.beginner.clearBossWindowByGear?.["par-2"]).toEqual([0.55, 0.7]);
    expect(t.beginner.clearNormal).toBe(0.9);
    expect(t.beginner.clearNormalWorst).toBe(0.85);
    expect([t.average.clearBoss, t.fast.clearBoss]).toEqual([0.9, 0.95]);
    expect([t.beginner.bossMin, t.average.bossMin, t.fast.bossMin]).toEqual([8.1, 4.4, 2.8]);
    expect(() => planTargetsFor(3)).toThrow(/chapter 3/);
  });
  test("verdicts: the Ch2 boss window follows the gear; the worst-level cell is Ch2 only", () => {
    const s = {
      persona: "beginner",
      normalActiveMin: 4,
      normalActiveMin3Enc: 4.5,
      normalClear: 0.95,
      normalClearMin: 0.8,
      bossActiveMin: 8,
      bossClear: 0.6,
      skillShare: 0.17,
      skillShareNormal: 0.17,
      autoPerEnc: 11,
      pyNormalActiveMin: 4,
      pyBossActiveMin: 8,
      chapterGold: 2000,
    } satisfies PersonaSummary;
    const atPar = verdicts([s], 2);
    expect(atPar.find((c) => c.metric === "first-try clear boss (PO window)")?.verdict).toBe(
      "FAIL",
    );
    expect(atPar.find((c) => c.metric === "first-try clear normal (worst level)")?.verdict).toBe(
      "FAIL",
    );
    const noUpg = verdicts([s], 2, "par-2");
    expect(noUpg.find((c) => c.metric === "first-try clear boss (PO window, par-2)")?.verdict).toBe(
      "PASS",
    );
    // Ch1 has neither a per-gear window nor a worst-level cell (byte-identical Ch1 report)
    const ch1 = verdicts([s], 1, "par-2");
    expect(ch1.some((c) => c.metric === "first-try clear boss (PO window)")).toBe(true);
    expect(ch1.some((c) => c.metric.includes("worst level"))).toBe(false);
  });
});

describe("the Ch2 player kit", () => {
  test("default kit: starter in Ch1, ch2 from Ch2", () => {
    expect(defaultKit(1)).toBe("starter");
    expect(defaultKit(2)).toBe("ch2");
  });
  test("unlocks are in play from the level AFTER their unlocking first clear", () => {
    expect(unlockedBefore("fireball", "ch1-l01")).toBe(true); // starter kit
    expect(unlockedBefore("calmMind", "ch2-l05")).toBe(false); // ch2-l05 unlocks it on its first clear
    expect(unlockedBefore("calmMind", "ch2-l06")).toBe(true);
    expect(unlockedBefore("reveal", "ch2-l03")).toBe(false);
    expect(unlockedBefore("reveal", "ch2-l04")).toBe(true);
    expect(unlockedBefore("reveal", undefined)).toBe(true);
  });
  test("ch2 keeps Aegis and swaps Calm Mind for Steady Hands from L6; ch2-reveal also swaps Reveal for Aegis from L4", () => {
    expect(starterLoadout("ch2", 2, undefined, "ch2-l05").passives).toEqual([
      "cleanCut",
      "steadyHands",
      "ironWill",
    ]);
    const l10 = starterLoadout("ch2", 2, undefined, "ch2-l10");
    expect(l10.actives).toEqual(["fireball", "aegis"]);
    expect(l10.passives).toEqual(["cleanCut", "calmMind", "ironWill"]);
    expect(starterLoadout("ch2-reveal", 2, undefined, "ch2-l03").actives).toEqual([
      "fireball",
      "aegis",
    ]);
    expect(starterLoadout("ch2-reveal", 2, undefined, "ch2-l04").actives).toEqual([
      "fireball",
      "reveal",
    ]);
    // Ch1's starter kit is untouched
    expect(starterLoadout("starter", 1)).toEqual(starterLoadout());
  });
});

describe("the Python model at the Ch2 par build", () => {
  test("par ATK: 10 in Ch1 (literal), 12.2 in Ch2 (T1 Common +2)", () => {
    expect(parAtk(1)).toBe(10);
    expect(parAtk(2)).toBeCloseTo(12.2, 1);
  });
  test("Ch2 encounter HP is ~243 at L1 (the authored 244, CH2_PLAN §4.1); Ch1 unchanged", () => {
    expect(pyEncounterHp(1, 2)).toBeCloseTo(243, 0);
    expect(pyEncounterHp(1)).toBeCloseTo(199.38, 1);
  });
});

describe("per-slot gear offsets", () => {
  test("weapon-2,armor+1,charm-2 is the Ch1 hint-path arrival in Ch2 (armor C+3, the rest C+0)", () => {
    const g = parseGear("weapon-2,armor+1,charm-2");
    expect(gearLabel(g)).toBe("weapon-2,armor+1,charm-2");
    const l = starterLoadout("ch2", 2, "weapon-2,armor+1,charm-2");
    expect([l.weapon.upgrade, l.armor.upgrade, l.charm.upgrade]).toEqual([0, 3, 0]);
  });
  test("a single slot offset is still rejected (use armor+N / par-N)", () => {
    expect(() => parseGear("armor-1")).toThrow(/--gear/);
  });
});

describe("bot: Shift cost and riddle reading (T5.1)", () => {
  test("model constants (documented guesses)", () => {
    expect(SHIFT_MODEL).toEqual({ intervalMult: 2, errMult: 2 });
    expect(RIDDLE_READ.wpm).toBe(150);
    expect(PERSONAS.map((p) => p.readWpm)).toEqual([120, 170, 220, 150]);
    expect(drawAttempt(PERSONAS[2] as (typeof PERSONAS)[number], 1).readWpm).toBe(220);
  });
  test("the Willow at 75 WPM: no riddle times out and the Hush Spells are typed exactly", () => {
    const rs = runJob({ persona: "fast", levelId: "ch2-l10", seeds: 3, noise: true });
    for (const r of rs) {
      expect(r.cleared).toBe(true);
      expect(r.riddles.timeout).toBe(0);
      expect(r.riddles.right + r.riddles.wrong).toBe(5);
      expect(r.doomStarted).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);
});

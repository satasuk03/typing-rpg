import { guardRatingBp, itemScoreBp, parArmorBp, parLoadout } from "@hd2d/sim";
import { describe, expect, test } from "vitest";
import {
  applyGear,
  describeGear,
  guardLeakBp,
  parseGear,
  starterLoadout,
  upgradeSteps,
} from "../src/index.ts";

describe("--gear parsing", () => {
  test("par is the default", () => {
    expect(parseGear(undefined)).toMatchObject({ kind: "par" });
    expect(parseGear("par")).toMatchObject({ kind: "par" });
  });
  test("par-N, armor+N, weapon+N, all+N", () => {
    expect(parseGear("par-2")).toEqual({ kind: "below", target: "all", steps: 2 });
    expect(parseGear("armor+3")).toEqual({ kind: "above", target: "armor", steps: 3 });
    expect(parseGear("weapon+1")).toEqual({ kind: "above", target: "weapon", steps: 1 });
    expect(parseGear("all+4")).toEqual({ kind: "above", target: "all", steps: 4 });
  });
  test("garbage throws", () => {
    for (const s of ["par+2", "armor", "armor-1", "charm+1", "par-", "x"])
      expect(() => parseGear(s)).toThrow(/--gear/);
  });
});

describe("gear loadouts", () => {
  test("par (and no argument) is exactly today's starter loadout", () => {
    expect(starterLoadout("starter", 1)).toEqual(starterLoadout("starter", 1, "par"));
    expect(starterLoadout("starter", 1).armor).toEqual(parLoadout(1).armor);
  });
  test("Ch1: par is C+0, so par-N is floored to par", () => {
    expect(starterLoadout("starter", 1, "par-3").armor.upgrade).toBe(0);
    expect(guardRatingBp(starterLoadout("starter", 1, "par-3"))).toBe(parArmorBp(1));
  });
  test("Ch2: par is C+2; par-2 is C+0 and par-5 is floored at +0 (real item scores)", () => {
    expect(parLoadout(2).armor.upgrade).toBe(2);
    const l = applyGear(parLoadout(2), parseGear("par-2"));
    for (const s of [l.weapon, l.armor, l.charm]) expect(s.upgrade).toBe(0);
    expect(guardRatingBp(l)).toBe(itemScoreBp(1, "C", 0));
    expect(applyGear(parLoadout(2), parseGear("par-5")).armor.upgrade).toBe(0);
  });
  test("armor+N moves only the armor; Common caps at +5", () => {
    const l = starterLoadout("starter", 1, "armor+3");
    expect(l.armor.upgrade).toBe(3);
    expect(l.weapon.upgrade).toBe(0);
    expect(l.charm.upgrade).toBe(0);
    expect(guardRatingBp(l)).toBe(itemScoreBp(1, "C", 3));
    expect(starterLoadout("starter", 1, "armor+9").armor.upgrade).toBe(5);
    expect(upgradeSteps(parLoadout(2).armor, 99).upgrade).toBe(5);
  });
  test("weapon+N and all+N", () => {
    const w = applyGear(parLoadout(1), parseGear("weapon+2"));
    expect([w.weapon.upgrade, w.armor.upgrade]).toEqual([2, 0]);
    expect(w.weapon.archetype).toBe("sword");
    const a = applyGear(parLoadout(1), parseGear("all+1"));
    expect([a.weapon.upgrade, a.armor.upgrade, a.charm.upgrade]).toEqual([1, 1, 1]);
  });
  test("skills and passives are untouched by gear", () => {
    const l = starterLoadout("starter", 1, "armor+2");
    expect(l.actives).toEqual(["fireball", "aegis"]);
    expect(l.passives).toEqual(["cleanCut", "steadyHands", "ironWill"]);
  });
});

describe("guard leak", () => {
  test("Ch1 par vs a P=1.25 boss leaks 20%; armor+3 drops it to about 3%", () => {
    expect(guardLeakBp(starterLoadout("starter", 1), 1, 12_500)).toBe(2000);
    const leak3 = guardLeakBp(starterLoadout("starter", 1, "armor+3"), 1, 12_500);
    expect(leak3).toBeGreaterThan(300);
    expect(leak3).toBeLessThan(340);
  });
  test("never negative, capped at 50%", () => {
    expect(guardLeakBp(starterLoadout("starter", 1, "armor+5"), 1, 5_000)).toBe(0);
    expect(guardLeakBp(starterLoadout("starter", 1), 1, 100_000)).toBe(5000);
  });
  test("describeGear notes the clamp", () => {
    const l = starterLoadout("starter", 1, "par-2");
    expect(describeGear(l, parseGear("par-2"), 1).notes.length).toBe(3);
    expect(
      describeGear(starterLoadout("starter", 1, "armor+2"), parseGear("armor+2"), 1).notes,
    ).toEqual([]);
  });
});

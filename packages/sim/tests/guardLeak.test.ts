// v1.9 guard leak (docs/qa/block-chance-analysis.md option G): a typed guard always works, but
// leak = clamp(1 - G/P, 0, GUARD_LEAK_CAP) of the hit gets through. Pure integer maths, no RNG.
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { guardLeakBpFor } from "../src/combat.ts";
import { scheduleAttack } from "../src/guard.ts";
import { guardRatingBp, parArmorBp, parLoadout } from "../src/meta/loadout.ts";
import type { EnemyState } from "../src/state.ts";
import { Driver, ENEMIES, mkLoadout, mkSimpleDef } from "./typingHarness.ts";

const PAR = 10_000;

describe("guardLeakBpFor (formula edges)", () => {
  test("G >= P gives 0", () => {
    expect(guardLeakBpFor(10_000, PAR, 10_000)).toBe(0);
    expect(guardLeakBpFor(20_000, PAR, 10_000)).toBe(0);
    expect(guardLeakBpFor(12_500, PAR, 12_500)).toBe(0);
  });
  test("G = 0.8 P gives 20%", () => {
    expect(guardLeakBpFor(10_000, PAR, 12_500)).toBe(2000);
  });
  test("the leak is capped at 50%", () => {
    expect(guardLeakBpFor(1000, PAR, 12_500)).toBe(K.GUARD_LEAK_CAP_BP);
    expect(guardLeakBpFor(0, PAR, 12_500)).toBe(5000);
    expect(K.GUARD_LEAK_CAP_BP).toBe(5000);
  });
  test("golem P = 1.25 x par: leak at par / +3 / +5 armor is about 20% / 3% / 0", () => {
    const par = parLoadout(1);
    const withUpg = (upgrade: number) => ({ ...par, armor: { ...par.armor, upgrade } });
    const leak = (upg: number) =>
      guardLeakBpFor(guardRatingBp(withUpg(upg)), parArmorBp(1), 12_500);
    expect(leak(0)).toBe(2000);
    expect(leak(3)).toBe(320); // 1 - 1.21 / 1.25
    expect(leak(5)).toBe(0);
  });
  test("is deterministic (pure)", () => {
    const a = Array.from({ length: 50 }, (_, i) => guardLeakBpFor(1000 + i * 200, PAR, 12_500));
    const b = Array.from({ length: 50 }, (_, i) => guardLeakBpFor(1000 + i * 200, PAR, 12_500));
    expect(a).toEqual(b);
  });
});

describe("resolveImpact with leak", () => {
  const lvl = () =>
    mkSimpleDef(["slime"], { current: ["apple", "bird", "cat", "door"] }, { enemies: ENEMIES }, 1, {
      poolM: 300_000,
      hitM: 5000,
    });
  const setup = (attackPowerBp: number) => {
    const d = new Driver(lvl(), 11, {}, mkLoadout()).toCombat();
    const e = d.state.enc?.enemies[0] as EnemyState;
    e.attackPowerBp = attackPowerBp;
    e.cycleStart = d.state.tick;
    scheduleAttack(d.state, e, d.state.tick + 300);
    return { d, e };
  };
  const impact = (d: Driver, e: EnemyState) => {
    const at = e.nextImpact ?? 0;
    while (d.state.tick <= at) d.step();
  };

  test("a Parry with leak still counters, grants ATB, and takes the leak", () => {
    const { d, e } = setup(12_500);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    const atb = d.state.enc?.atbM ?? 0;
    const hp = e.hpM;
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    expect(d.ofType("EnemyAttack", ev)[0]).toMatchObject({ outcome: "parried", damage: 1 });
    expect(d.ofType("GuardParried", ev)[0]).toMatchObject({
      counterDamage: 7, // slime weakness x1.3 on a 50% ATK counter
      leakBp: 2000,
      leakDamage: 1,
    });
    expect(e.hpM).toBe(hp - 6500);
    expect((d.state.enc?.atbM ?? 0) - atb).toBe(K.PARRY_ATB_M);
    expect(d.state.run.heroHpM).toBe(100_000 - 1000);
  });

  test("a Block takes leak + (1 - leak) x BLOCK_MULT", () => {
    const { d, e } = setup(12_500);
    const g = d.until("GuardWordShown");
    d.key(g.text.charAt(0));
    d.key("1");
    d.step();
    d.type(g.text.slice(1));
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    // 5000 x 20% = 1000 leaks; the remaining 4000 takes x0.2 = 800
    expect(d.ofType("GuardBlocked", ev)[0]).toMatchObject({
      damage: 2, // toDisplay rounds; the exact 1800 milli is checked below
      leakBp: 2000,
      leakDamage: 1,
    });
    expect(d.state.run.heroHpM).toBe(100_000 - 1800);
  });

  test("no leak at par (P = par armor): unchanged Parry takes 0", () => {
    const { d, e } = setup(10_000);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    expect(d.ofType("GuardParried", ev)[0]).toMatchObject({ leakBp: 0, leakDamage: 0 });
    expect(d.state.run.heroHpM).toBe(100_000);
  });

  test("a barrier absorbs the leaked damage of a Parry", () => {
    const { d, e } = setup(12_500);
    d.state.run.barrier = 1;
    const g = d.until("GuardWordShown");
    d.type(g.text);
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    expect(d.ofType("GuardParried", ev)[0]).toMatchObject({ leakBp: 2000, leakDamage: 0 });
    expect(d.state.run.barrier).toBe(0);
    expect(d.state.run.heroHpM).toBe(100_000);
  });

  test("replaying the same scenario gives the same event stream", () => {
    const run = () => {
      const { d, e } = setup(12_500);
      const g = d.until("GuardWordShown");
      d.type(g.text);
      impact(d, e);
      return JSON.stringify(d.all);
    };
    expect(run()).toBe(run());
  });
});

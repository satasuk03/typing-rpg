// BALANCE / K / gear formulas against economy_sim.py. Expected values come from tests/fixtures/economy-reference.json,
// a dump of the Python module (regenerate: python3 -I packages/sim/scripts/dump-economy-reference.py). Hand-checked
// reference points are also written inline.

import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { BALANCE, K } from "../src/balance.ts";
import {
  buildLoadout,
  computeHeroStats,
  goldUnit,
  itemScoreBp,
  type Loadout,
  levelGold,
  parHpM,
  parLoadout,
  slotTier,
  tierPrice,
  upgradeCap,
  upgradeCost,
} from "../src/index.ts";
import { PACE_FACTOR_BP } from "../src/tables.generated.ts";
import reference from "./fixtures/economy-reference.json" with { type: "json" };
import { mkLoadout } from "./typingHarness.ts";

const PY = reference.constants as Record<string, unknown>;
const REF = reference.ref;
const near = (got: number, want: number, rel = 2e-4, abs = 1): void => {
  expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(abs, Math.abs(want) * rel));
};

describe("BALANCE keeps the economy_sim names and values", () => {
  // keys whose shape was deliberately changed in interfaces §7
  const SPECIAL = new Set(["PRESET_INTERVAL_MULT", "CHEST"]);
  test("every BALANCE key that exists in the Python module has the same value", () => {
    const shared = Object.keys(BALANCE).filter((k) => k in PY && !SPECIAL.has(k));
    expect(shared.length).toBeGreaterThan(100);
    for (const k of shared)
      expect([k, (BALANCE as Record<string, unknown>)[k]]).toEqual([k, PY[k]]);
  });
  test("deliberate differences: PRESET_INTERVAL_MULT (py scalar = Standard) and CHEST (v2: gear -> caches)", () => {
    expect(BALANCE.PRESET_INTERVAL_MULT.standard).toBe(PY.PRESET_INTERVAL_MULT);
    for (const t of ["Wooden", "Iron", "Gold", "Mythic"] as const) {
      const py = (
        PY.CHEST as Record<string, { gold: number; gear: number; gems: number; rar: object }>
      )[t];
      const ts = BALANCE.CHEST[t];
      expect([ts.gold, ts.gear, ts.gems]).toEqual([py?.gold, py?.gear, py?.gems]);
    }
  });
  test("the economy_sim WEAPON (Sword) equals WEAPONS.sword", () => {
    const { name: _n, ...w } = BALANCE.WEAPON;
    expect(w).toMatchObject({
      char_charge: BALANCE.WEAPONS.sword.char_charge,
      word_bonus: BALANCE.WEAPONS.sword.word_bonus,
      atk_mult: BALANCE.WEAPONS.sword.atk_mult,
    });
  });
  test("module-init conversions to integer units", () => {
    expect(K.ATB_FULL_M).toBe(100_000);
    expect(K.PERFECT_ATB_MULT_BP).toBe(12_500);
    expect(K.PERFECT_CHAR_BONUS_BP).toBe(2500);
    expect(K.CHIP_NORMAL_BP).toBe(1500);
    expect(K.CHIP_PERFECT_BP).toBe(2500);
    expect(K.CRIT_MULT_BP).toBe(15_000);
    expect(K.WEAK_MULT_BP).toBe(13_000);
    expect(K.BREAK_DMG_MULT_BP).toBe(18_000);
    expect(K.BLOCK_MULT_BP).toBe(2000);
    expect(K.ATTACK_IMPACT_T).toBe(18);
    expect(K.BREAK_T).toBe(270);
    expect(K.SECOND_WIND_T).toBe(480);
    expect(K.GUARD_T).toBe(150);
    expect(K.WALK_HEAL_BP).toBe(2500);
    expect(K.SECOND_WIND_HP_BP).toBe(3000);
    expect(K.PREMIUM_REVIVE_HP_BP).toBe(5000);
    expect(K.WEAPONS.dagger).toMatchObject({
      charChargeM: 11_000,
      wordBonusM: 6000,
      atkMultBp: 4500,
      hits: 2,
    });
    expect(K.WEAPONS.hammer).toMatchObject({ atkMultBp: 22_000, damageType: "blunt" });
    expect(K.HERO_ATK0_M).toBe(10_000);
    expect(K.HERO_HP0_M).toBe(100_000);
  });
});

describe("generated tables vs the Python functions", () => {
  test("PACE_FACTOR_BP = clamp((35/pace)^0.7, 0.6, 1.8) for pace 15..120 (python: pace_factor)", () => {
    for (let p = 15; p <= 120; p++) {
      const py = REF.pace_factor[String(p) as keyof typeof REF.pace_factor] as number;
      expect(PACE_FACTOR_BP[p - 15]).toBe(Math.round(py * 10_000));
    }
    // hand check: pace 70 -> (0.5)^0.7 = 0.6156
    expect(PACE_FACTOR_BP[70 - 15]).toBe(6156);
  });
  test("tier price, upgrade cost, Gold Unit and level gold match the Python (rounded to whole gold)", () => {
    for (let t = 1; t <= 10; t++) {
      expect(tierPrice(t)).toBe(Math.round(REF.tier_price[t - 1] as number));
      for (let u = 0; u < 15; u++)
        expect(upgradeCost(t, u)).toBe(Math.round((REF.upg_cost[t - 1] as number[])[u] as number));
    }
    for (let c = 1; c <= 30; c++) {
      expect(goldUnit(c)).toBe(Math.round(REF.gold_unit[c - 1] as number));
      for (let i = 1; i <= 10; i++)
        expect(levelGold(c, i)).toBe(
          Math.round((REF.level_gold[c - 1] as number[])[i - 1] as number),
        );
    }
    expect([tierPrice(4), tierPrice(5), goldUnit(1), levelGold(1, 10)]).toEqual([
      3190, 4481, 100, 381,
    ]);
  });
});

describe("gear formulas vs economy_sim", () => {
  test("slotTier matches python slot_tier for every slot and chapter 1..30", () => {
    for (const slot of ["weapon", "armor", "charm"] as const)
      for (let c = 1; c <= 30; c++)
        expect([slot, c, slotTier(slot, c)]).toEqual([
          slot,
          c,
          (REF.slot_tier[slot] as number[])[c - 1],
        ]);
    expect([
      slotTier("weapon", 4),
      slotTier("armor", 4),
      slotTier("armor", 5),
      slotTier("charm", 6),
    ]).toEqual([2, 1, 2, 2]);
  });
  test("itemScoreBp matches python item_score to 3 bp", () => {
    for (const r of REF.item_score) {
      const got = itemScoreBp(r.tier, r.rarity as never, r.upg);
      near(got, r.score * 10_000, 1e-4, 3);
    }
    // hand: 1.4 x 1.12 x (1 + 0.07 x 5) = 2.1168
    expect(itemScoreBp(2, "U", 5)).toBe(21_168);
    expect(itemScoreBp(1, "C", 0)).toBe(10_000);
  });
  test("computeHeroStats equals python hero_stats(par_scores(c)) for every chapter (milli; <= 0.02% or 1 milli)", () => {
    for (const r of REF.hero_stats_par) {
      const s = computeHeroStats(parLoadout(r.chapter));
      near(s.atk, r.atk * 1000);
      near(s.maxHp, r.hp * 1000);
      expect(parHpM(r.chapter)).toBe(s.maxHp);
    }
    expect(computeHeroStats(parLoadout(1))).toEqual({ atk: 10_000, maxHp: 100_000 });
  });
  test("computeHeroStats on mixed loadouts (charm contributes its square root to both)", () => {
    for (const r of REF.hero_stats_mixed) {
      const lo: Loadout = {
        ...mkLoadout(),
        weapon: {
          tier: r.weapon[0] as number,
          rarity: r.weapon[1] as never,
          upgrade: r.weapon[2] as number,
          archetype: "sword",
        },
        armor: {
          tier: r.armor[0] as number,
          rarity: r.armor[1] as never,
          upgrade: r.armor[2] as number,
        },
        charm: {
          tier: r.charm[0] as number,
          rarity: r.charm[1] as never,
          upgrade: r.charm[2] as number,
        },
      };
      const s = computeHeroStats(lo);
      near(s.atk, r.atk * 1000);
      near(s.maxHp, r.hp * 1000);
    }
  });
  test("par loadouts: ch1 C+0, ch2 C+2, ch3 U+3, ch4+ U+5; sword; no skills", () => {
    expect(parLoadout(2).weapon).toMatchObject({
      rarity: "C",
      upgrade: 2,
      tier: 1,
      archetype: "sword",
    });
    expect(parLoadout(3).armor).toMatchObject({ rarity: "U", upgrade: 3 });
    expect(parLoadout(4)).toMatchObject({ actives: [null, null], passives: [null, null, null] });
    expect(parLoadout(4).weapon.tier).toBe(2);
    expect(parLoadout(4).armor.tier).toBe(1);
    // python par_scores for ch1..4 hero HP: 100, 121.7, 157.8, 185.9
    near(parHpM(2), 121_718.69);
    near(parHpM(4), 185_920.67);
  });
  test("upgradeCap and the upgrade table range", () => {
    expect([
      upgradeCap("C"),
      upgradeCap("U"),
      upgradeCap("R"),
      upgradeCap("E"),
      upgradeCap("L"),
    ]).toEqual([5, 7, 11, 13, 15]);
  });
});

describe("buildLoadout", () => {
  const gear = (id: string, uid: number, rarity = "C", upgrade = 0) =>
    ({ uid, defId: id, rarity, upgrade }) as never;
  const src = (
    over: Partial<Parameters<typeof buildLoadout>[0]> = {},
  ): Parameters<typeof buildLoadout>[0] => ({
    inventory: {
      gear: [gear("dagger-t1", 1, "R", 3), gear("armor-t1", 2), gear("charm-t1", 3, "U", 1)],
    },
    equipped: { weapon: 1, armor: 2, charm: 3 },
    loadout: {
      actives: ["fireball", null],
      activeModes: ["smart", "asap"],
      passives: ["ironWill", null, null],
    },
    ...over,
  });
  test("flattens equipped gear defs + instances into a Loadout", () => {
    const lo = buildLoadout(src(), contentBundle);
    expect(lo.weapon).toEqual({ tier: 1, rarity: "R", upgrade: 3, archetype: "dagger" });
    expect(lo.charm).toEqual({ tier: 1, rarity: "U", upgrade: 1 });
    expect(lo.actives).toEqual(["fireball", null]);
    expect(lo.activeModes).toEqual(["smart", "asap"]);
    expect(lo.passives).toEqual(["ironWill", null, null]);
  });
  test("throws on a missing uid, a slot mismatch, an unknown def or an unknown skill/passive id", () => {
    expect(() =>
      buildLoadout(src({ equipped: { weapon: 9, armor: 2, charm: 3 } }), contentBundle),
    ).toThrow();
    expect(() =>
      buildLoadout(src({ equipped: { weapon: 2, armor: 2, charm: 3 } }), contentBundle),
    ).toThrow();
    expect(() =>
      buildLoadout(src({ inventory: { gear: [gear("nope", 1)] } }), contentBundle),
    ).toThrow();
    expect(() =>
      buildLoadout(
        src({
          loadout: {
            actives: ["zap", null],
            activeModes: ["smart", "smart"],
            passives: [null, null, null],
          },
        }),
        contentBundle,
      ),
    ).toThrow();
    expect(() =>
      buildLoadout(
        src({
          loadout: {
            actives: [null, null],
            activeModes: ["smart", "smart"],
            passives: ["zap", null, null],
          },
        }),
        contentBundle,
      ),
    ).toThrow();
  });
});

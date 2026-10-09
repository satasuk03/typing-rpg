// T1.6 rewards: chest tiers, Gear Cache odds + pity (statistical AC), published odds, and the Python cross-check
// (tests/fixtures/economy-reference.json, regenerate with scripts/dump-economy-reference.py).
import { describe, expect, test } from "vitest";
import { BALANCE, K } from "../src/balance.ts";
import {
  type CachePity,
  cacheGoldPrice,
  deriveRng,
  goldUnit,
  NEW_PITY,
  openChest,
  publishedCacheOdds,
  recordReplay,
  replayGoldMultBp,
  replaysToday,
  rollCache,
  rollEncounterChest,
  salvageValue,
  shopOffer,
  shopPrice,
  slotTier,
  starGold,
  transferUpgrade,
} from "../src/index.ts";
import reference from "./fixtures/economy-reference.json" with { type: "json" };

const REF = reference.ref;
const near = (got: number, want: number, abs = 1): void => {
  // integer tables are rounded once per factor, so allow the rounding error to scale (3e-4 relative or `abs` gold)
  expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(abs, Math.abs(want) * 3e-4));
};
const RARITIES = ["C", "U", "R", "E", "L"] as const;

describe("Gear Cache rarity, pity and slot / archetype odds (200k deterministic rolls)", () => {
  const N = 200_000;
  const rng = deriveRng(20261009, "meta");
  let pity: CachePity = { ...NEW_PITY };
  const count: Record<string, number> = { C: 0, U: 0, R: 0, E: 0, L: 0 };
  const slots: Record<string, number> = { weapon: 0, armor: 0, charm: 0 };
  const arch: Record<string, number> = { sword: 0, dagger: 0, staff: 0, hammer: 0 };
  const gap = { R: 0, E: 0, L: 0 };
  const maxGap = { R: 0, E: 0, L: 0 };
  let weapons = 0;
  let badTier = 0;
  const guaranteed: Record<string, number> = { none: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < N; i++) {
    const r = rollCache(rng, pity, { frontierChapter: 4, equippedArchetype: "staff" });
    pity = r.pity;
    count[r.roll.rarity] = (count[r.roll.rarity] as number) + 1;
    slots[r.roll.slot] = (slots[r.roll.slot] as number) + 1;
    if (r.roll.tier !== slotTier(r.roll.slot, 4)) badTier++;
    if (r.roll.slot === "weapon") {
      weapons++;
      arch[r.roll.archetype as string] = (arch[r.roll.archetype as string] as number) + 1;
    } else if (r.roll.archetype !== null) badTier++;
    const g = r.event.type === "CacheRolled" ? r.event.guaranteed : "none";
    guaranteed[g] = (guaranteed[g] as number) + 1;
    gap.R++;
    gap.E++;
    gap.L++;
    if (r.roll.rarity !== "C" && r.roll.rarity !== "U") {
      maxGap.R = Math.max(maxGap.R, gap.R);
      gap.R = 0;
    }
    if (r.roll.rarity === "E" || r.roll.rarity === "L") {
      maxGap.E = Math.max(maxGap.E, gap.E);
      gap.E = 0;
    }
    if (r.roll.rarity === "L") {
      maxGap.L = Math.max(maxGap.L, gap.L);
      gap.L = 0;
    }
    expect(pity.sinceRare).toBeLessThan(K.CACHE_PITY_RARE);
    expect(pity.sinceEpic).toBeLessThan(K.CACHE_PITY_EPIC);
    expect(pity.sinceLegendary).toBeLessThan(K.CACHE_PITY_LEG);
  }

  test("rarity frequencies match the published effective odds within 1 percentage point", () => {
    const eff = publishedCacheOdds().effectiveRarityBp;
    for (const r of RARITIES) {
      const got = ((count[r] as number) / N) * 10_000;
      expect(Math.abs(got - eff[r])).toBeLessThan(100);
    }
    // tighter for the rare end: relative 10% on Legendary (1.54% +- 0.15 pp at 200k)
    const l = (count.L as number) / N;
    expect(Math.abs(l - eff.L / 10_000) / (eff.L / 10_000)).toBeLessThan(0.1);
  });

  test("pity is never exceeded: R+ within 8, E+ within 30, L within 120", () => {
    expect(maxGap.R).toBeLessThanOrEqual(K.CACHE_PITY_RARE);
    expect(maxGap.E).toBeLessThanOrEqual(K.CACHE_PITY_EPIC);
    expect(maxGap.L).toBeLessThanOrEqual(K.CACHE_PITY_LEG);
    expect(maxGap.R).toBe(K.CACHE_PITY_RARE); // the guarantee is reached in 200k rolls
    expect(maxGap.E).toBe(K.CACHE_PITY_EPIC);
    expect(guaranteed.rare).toBeGreaterThan(0);
    expect(guaranteed.epic).toBeGreaterThan(0);
  });

  test("slots are uniform and weapon archetypes are 40 / 20 / 20 / 20 (equipped staff) within 1 pp", () => {
    for (const s of ["weapon", "armor", "charm"]) {
      expect(Math.abs((slots[s] as number) / N - 1 / 3)).toBeLessThan(0.01);
    }
    for (const a of ["sword", "dagger", "hammer"]) {
      expect(Math.abs((arch[a] as number) / weapons - 0.2)).toBeLessThan(0.01);
    }
    expect(Math.abs((arch.staff as number) / weapons - 0.4)).toBeLessThan(0.01);
    expect(badTier).toBe(0); // tier = slotTier(slot, frontier); only weapons carry an archetype
  });

  test("the sampled rates agree with the exact Markov-chain table and with the Python's exact chain", () => {
    // the TS chain equals the Python chain in node-tests/cacheOdds.test.ts; here the published bp table and the samples
    const py = REF.cache_effective as Record<string, number>;
    const eff = publishedCacheOdds().effectiveRarityBp;
    for (const r of RARITIES) {
      near(eff[r], Math.round((py[r] as number) * 10_000), 1); // C absorbs the rounding remainder
      expect(Math.abs((count[r] as number) / N - (py[r] as number))).toBeLessThan(0.006);
    }
    expect(Object.values(eff).reduce((a, b) => a + b, 0)).toBe(10_000);
  });
});

describe("cache decision table (pity branches)", () => {
  test("legendary pity forces L without a draw; epic pity draws from {E, L}; rare pity from {R, E, L}", () => {
    const a = deriveRng(1, "meta");
    const r1 = rollCache(a, { sinceRare: 3, sinceEpic: 3, sinceLegendary: 119 }, ctx());
    expect(r1.roll.rarity).toBe("L");
    expect(r1.pity).toEqual(NEW_PITY);
    for (let i = 0; i < 500; i++) {
      const e = rollCache(
        deriveRng(i, "meta"),
        { sinceRare: 2, sinceEpic: 29, sinceLegendary: 50 },
        ctx(),
      );
      expect(["E", "L"]).toContain(e.roll.rarity);
      const r = rollCache(
        deriveRng(i, "meta"),
        { sinceRare: 7, sinceEpic: 3, sinceLegendary: 50 },
        ctx(),
      );
      expect(["R", "E", "L"]).toContain(r.roll.rarity);
    }
    // counters: an Epic resets R and E but not L
    const ep = rollCache(
      deriveRng(3, "meta"),
      { sinceRare: 2, sinceEpic: 29, sinceLegendary: 50 },
      ctx(),
    );
    if (ep.roll.rarity === "E")
      expect(ep.pity).toEqual({ sinceRare: 0, sinceEpic: 0, sinceLegendary: 51 });
  });

  test("the event mirrors the roll and the new pity; the input pity is not mutated", () => {
    const p: CachePity = { sinceRare: 1, sinceEpic: 2, sinceLegendary: 3 };
    const r = rollCache(deriveRng(9, "meta"), p, ctx());
    expect(p).toEqual({ sinceRare: 1, sinceEpic: 2, sinceLegendary: 3 });
    expect(r.event).toMatchObject({
      type: "CacheRolled",
      rarity: r.roll.rarity,
      slot: r.roll.slot,
      tier: r.roll.tier,
      archetype: r.roll.archetype,
      pity: r.pity,
    });
  });

  test("the draw order is rarity, slot, archetype: a fixed seed gives a fixed sequence", () => {
    const rng = deriveRng(77, "meta");
    const seq = Array.from({ length: 6 }, () => rollCache(rng, NEW_PITY, ctx()).roll).map(
      (r) => `${r.rarity}${r.slot}${r.archetype ?? ""}`,
    );
    const rng2 = deriveRng(77, "meta");
    const seq2 = Array.from({ length: 6 }, () => rollCache(rng2, NEW_PITY, ctx()).roll).map(
      (r) => `${r.rarity}${r.slot}${r.archetype ?? ""}`,
    );
    expect(seq2).toEqual(seq);
  });
});

function ctx() {
  return { frontierChapter: 1, equippedArchetype: "sword" as const };
}

describe("published odds", () => {
  test("rarity, pity, slot and archetype tables", () => {
    const p = publishedCacheOdds();
    expect(p.rarityBp).toEqual({ C: 4000, U: 3300, R: 2000, E: 600, L: 100 });
    expect(p.pity).toEqual({ rare: 8, epic: 30, legendary: 120 });
    expect(p.slotBp).toEqual({ weapon: 3334, armor: 3333, charm: 3333 });
    expect(p.weaponArchetypeBp).toEqual({ equipped: 4000, otherEach: 2000 });
    expect(p.effectiveRarityBp.L).toBe(154); // doc 02 C8's 3.16% is the cosmetic Scribe's Chest, not the Gear Cache
    expect(BALANCE.CACHE_ARCHETYPE_ODDS).toEqual({ equipped: 0.4, other_each: 0.2 });
  });
});

describe("chests (100k deterministic rolls)", () => {
  test("normal encounters: 30% drop (15% replay); tiers 72 / 24 / 3.5 / 0.5 within 1 pp", () => {
    const rng = deriveRng(5, "loot");
    const N = 100_000;
    const tiers: Record<string, number> = { Wooden: 0, Iron: 0, Gold: 0, Mythic: 0 };
    let drops = 0;
    for (let i = 0; i < N; i++) {
      const t = rollEncounterChest(rng, { boss: false, firstClear: true });
      if (t !== null) {
        drops++;
        tiers[t] = (tiers[t] as number) + 1;
      }
    }
    expect(Math.abs(drops / N - 0.3)).toBeLessThan(0.01);
    const want = { Wooden: 0.72, Iron: 0.24, Gold: 0.035, Mythic: 0.005 };
    for (const k of Object.keys(want) as (keyof typeof want)[])
      expect(Math.abs((tiers[k] as number) / drops - want[k])).toBeLessThan(0.01);
    let replay = 0;
    for (let i = 0; i < N; i++)
      if (rollEncounterChest(rng, { boss: false, firstClear: false }) !== null) replay++;
    expect(Math.abs(replay / N - 0.15)).toBeLessThan(0.01);
  });

  test("boss: always on first clear, 50% on replay; tiers Iron 55 / Gold 38 / Mythic 7, never Wooden", () => {
    const rng = deriveRng(6, "loot");
    const N = 100_000;
    const tiers: Record<string, number> = { Wooden: 0, Iron: 0, Gold: 0, Mythic: 0 };
    for (let i = 0; i < N; i++) {
      const t = rollEncounterChest(rng, { boss: true, firstClear: true });
      expect(t).not.toBeNull();
      tiers[t as string] = (tiers[t as string] as number) + 1;
    }
    expect(tiers.Wooden).toBe(0);
    for (const [k, w] of [
      ["Iron", 0.55],
      ["Gold", 0.38],
      ["Mythic", 0.07],
    ] as const)
      expect(Math.abs((tiers[k] as number) / N - w)).toBeLessThan(0.01);
    let replay = 0;
    for (let i = 0; i < N; i++)
      if (rollEncounterChest(rng, { boss: true, firstClear: false }) !== null) replay++;
    expect(Math.abs(replay / N - 0.5)).toBeLessThan(0.01);
  });

  test("contents: Gold / Mythic hold caches and no gear; Wooden / Iron hold gear 10% / 35%; gems on first clear only", () => {
    const rng = deriveRng(7, "loot");
    const N = 40_000;
    for (const [tier, gear, caches] of [
      ["Wooden", 0.1, 0],
      ["Iron", 0.35, 0],
      ["Gold", 0, 1],
      ["Mythic", 0, 2],
    ] as const) {
      let withGear = 0;
      let down = 0;
      for (let i = 0; i < N; i++) {
        const c = openChest(rng, tier, {
          chapter: 4,
          frontierChapter: 7,
          equippedArchetype: "dagger",
        });
        expect(c.caches).toBe(caches);
        expect(c.tier).toBe(tier);
        if (c.gear !== null) {
          withGear++;
          const full = slotTier(c.gear.slot, 7);
          if (c.gear.tier === full - 1) down++;
          expect([full, Math.max(1, full - 1)]).toContain(c.gear.tier);
          expect((c.gear.archetype !== null) === (c.gear.slot === "weapon")).toBe(true);
          expect(["C", "U", "R"]).toContain(c.gear.rarity);
          if (tier === "Wooden") expect(c.gear.rarity === "C" || c.gear.rarity === "U").toBe(true);
        }
      }
      expect(Math.abs(withGear / N - gear)).toBeLessThan(0.01);
      if (gear > 0) expect(down / withGear).toBeGreaterThan(0.1); // some tier-down (slot tier 1 has no lower tier)
    }
    const g = openChest(rng, "Gold", { chapter: 1, frontierChapter: 1 });
    expect(g.gemsUncredited).toBe(5);
    expect(
      openChest(rng, "Gold", { chapter: 1, frontierChapter: 1, firstClear: false }).gemsUncredited,
    ).toBe(0);
    expect(openChest(rng, "Mythic", { chapter: 1, frontierChapter: 1 }).gemsUncredited).toBe(20);
  });
});

describe("Python cross-check (gold, prices, upgrade transfer, salvage, replay pay)", () => {
  test("chest gold = chest gold units x Gold Unit (whole gold, within 1)", () => {
    const py = REF.chest_gold as Record<string, number[]>;
    for (const tier of ["Wooden", "Iron", "Gold", "Mythic"] as const)
      for (let c = 1; c <= 30; c++) {
        const got = openChest(deriveRng(c, "loot"), tier, { chapter: c, frontierChapter: c }).gold;
        near(got, (py[tier] as number[])[c - 1] as number, 3); // GU is rounded once; Mythic multiplies that by 6;
      }
  });

  test("shop prices (tier price x 1 / 2.2 / 5) and cache gold price (14 GU)", () => {
    for (const row of REF.shop_price)
      near(shopPrice(row.tier, row.rarity as "C" | "U" | "R"), row.price, 2);
    for (let c = 1; c <= 30; c++)
      near(cacheGoldPrice(c), REF.cache_gold_price[c - 1] as number, 14);
    expect(cacheGoldPrice(1)).toBe(1400);
    expect(shopPrice(1, "R")).toBe(5750);
  });

  test("Upgrade Transfer: floor(half) capped by the new rarity", () => {
    for (const row of REF.transfer)
      expect(transferUpgrade(row.old, row.rarity as "C")).toBe(row.new);
    expect(transferUpgrade(5, "C")).toBe(2);
    expect(transferUpgrade(15, "C")).toBe(5); // capped
    expect(transferUpgrade(1, "L")).toBe(0);
  });

  test("salvage value and unwanted-drop value", () => {
    for (const row of REF.salvage) {
      const item = {
        tier: row.tier,
        rarity: row.rarity as "C",
        upgrade: 0,
        slot: "weapon" as const,
      };
      near(
        salvageValue(item, {
          fromChestUnwanted: false,
          nonTransferredUpgradeGold: row.invested * 0.5,
        }),
        row.value,
        2,
      );
      near(
        salvageValue(item, { fromChestUnwanted: true, nonTransferredUpgradeGold: 0 }),
        row.drop,
        2,
      );
    }
  });

  test("replay gold multiplier: 40%, x50% when stale, x25% past the daily cap", () => {
    for (const row of REF.replay_mult) {
      const got = replayGoldMultBp({
        firstClear: false,
        chapter: row.chapter,
        frontierChapter: row.frontier,
        replaysToday: row.today,
      });
      near(got, Math.round(row.mult * 10_000), 1);
    }
    expect(
      replayGoldMultBp({ firstClear: true, chapter: 1, frontierChapter: 9, replaysToday: 99 }),
    ).toBe(10_000);
    expect(
      replayGoldMultBp({ firstClear: false, chapter: 3, frontierChapter: 3, replaysToday: 0 }),
    ).toBe(4000);
    expect(
      replayGoldMultBp({ firstClear: false, chapter: 3, frontierChapter: 3, replaysToday: 40 }),
    ).toBe(1000);
  });

  test("the daily replay counter resets on a new day key (no clock in the sim)", () => {
    let r = { day: "2026-10-08", count: 39 };
    expect(replaysToday(r, "2026-10-09")).toBe(0);
    r = recordReplay(r, "2026-10-09");
    expect(r).toEqual({ day: "2026-10-09", count: 1 });
    r = recordReplay(r, "2026-10-09");
    expect(r.count).toBe(2);
    expect(replaysToday(r, "2026-10-09")).toBe(2);
  });

  test("star gold and the deterministic shop", () => {
    expect(starGold(2, 100)).toBe(40);
    expect(starGold(0, 100)).toBe(0);
    const o = shopOffer("armor", "R", { frontierChapter: 5, currentUpgrade: 7 });
    expect(o).toEqual({
      slot: "armor",
      tier: slotTier("armor", 5),
      rarity: "R",
      price: shopPrice(slotTier("armor", 5), "R"),
      startUpgrade: 3,
    });
    expect(() => shopOffer("armor", "E", { frontierChapter: 5, currentUpgrade: 0 })).toThrow(
      /not sold/,
    );
    expect(goldUnit(1)).toBe(100);
  });
});

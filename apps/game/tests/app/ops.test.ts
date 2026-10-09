import { contentBundle } from "@hd2d/content";
import { migrateSave } from "@hd2d/shared";
import { createLevel, getResult, resolveLevel, step, upgradeCap } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import { makeRunConfig } from "../../src/level/config";
import * as ops from "../../src/meta/ops";

const fresh = (): ops.Save => ops.newSave(1_000, 42);

describe("newSave", () => {
  it("is a valid v1 blob that feeds buildLoadout", () => {
    const s = migrateSave(fresh());
    expect(s.equipped).toEqual({ weapon: 1, armor: 2, charm: 3 });
    expect(ops.loadoutOf(s).weapon.archetype).toBe("sword");
    expect(s.unlocks.actives.length).toBe(2);
    expect(s.cachePity).toEqual({ sinceRare: 0, sinceEpic: 0, sinceLegendary: 0 });
  });
});

describe("dayKey", () => {
  it("formats the local calendar day", () => {
    expect(ops.dayKey(new Date(2026, 9, 9, 23, 59))).toBe("2026-10-09");
  });
});

describe("caches", () => {
  it("opens with the save's rng + pity, adds the piece, and the pity moves", () => {
    let s = fresh();
    s = ops.buyCache({ ...s, wallet: { gold: 99_999 } }, 5) as ops.Save;
    expect(s.inventory.unopenedCaches).toBe(1);
    const r = ops.openCache(s, 6) as NonNullable<ReturnType<typeof ops.openCache>>;
    expect(r.save.inventory.unopenedCaches).toBe(0);
    expect(r.save.inventory.gear.length).toBe(4);
    expect(r.save.metaRng).not.toEqual(s.metaRng);
    const p = r.save.cachePity;
    expect(p.sinceLegendary === 1 || r.open.roll.rarity === "L").toBe(true);
    // same save + same rng state => same roll (deterministic)
    const r2 = ops.openCache(s, 6) as NonNullable<ReturnType<typeof ops.openCache>>;
    expect(r2.open.roll).toEqual(r.open.roll);
  });

  it("cannot open without a cache or buy without gold", () => {
    expect(ops.openCache(fresh(), 1)).toBeNull();
    expect(ops.buyCache(fresh(), 1)).toBeNull();
  });
});

describe("gear", () => {
  it("shop buy replaces the equipped piece with Upgrade Transfer + salvage", () => {
    let s = fresh();
    s.inventory.gear[0] = { uid: 1, defId: "sword-t1", rarity: "C", upgrade: 4 };
    s.wallet.gold = 100_000;
    const offer = ops.offerFor(s, "weapon", "U");
    expect(offer.startUpgrade).toBe(2); // half of +4
    const before = s.wallet.gold;
    s = ops.buyShopGear(s, "weapon", "U", "sword", 9) as ops.Save;
    expect(s.wallet.gold).toBeLessThan(before);
    const w = ops.instanceOf(s, s.equipped.weapon);
    expect(w?.rarity).toBe("U");
    expect(w?.upgrade).toBe(2);
    expect(s.inventory.gear.find((g) => g.uid === 1)).toBeUndefined();
  });

  it("upgrade charges the sim cost and respects the rarity cap", () => {
    let s = fresh();
    s.wallet.gold = 1_000_000;
    s = ops.upgradeGear(s, 1, 2) as ops.Save;
    expect(ops.instanceOf(s, 1)?.upgrade).toBe(1);
    expect(s.wallet.gold).toBeLessThan(1_000_000);
    s.inventory.gear[0] = { uid: 1, defId: "sword-t1", rarity: "C", upgrade: upgradeCap("C") };
    expect(ops.upgradeGear(s, 1, 3)).toBeNull();
  });

  it("replaceWithTransfer moves half the levels and salvages the old piece", () => {
    const s = fresh();
    s.inventory.gear[0] = { uid: 1, defId: "sword-t1", rarity: "R", upgrade: 6 };
    s.inventory.gear.push({ uid: 9, defId: "sword-t1", rarity: "E", upgrade: 0 });
    s.inventory.nextGearUid = 10;
    const pv = ops.previewTransfer(s, 9, 1);
    expect(pv?.newUpgrade).toBe(3);
    const n = ops.replaceWithTransfer(s, 9, 4) as ops.Save;
    expect(n.equipped.weapon).toBe(9);
    expect(ops.instanceOf(n, 9)?.upgrade).toBe(3);
    expect(ops.instanceOf(n, 1)).toBeUndefined();
    expect(n.wallet.gold).toBeGreaterThan(s.wallet.gold);
  });
});

describe("loadout", () => {
  it("only accepts unlocked skills and keeps them unique", () => {
    const s = fresh();
    expect(ops.setActive(s, 0, "slashWave", 1)).toBeNull();
    const t = ops.setActive(s, 1, s.loadout.actives[0], 2) as ops.Save;
    expect(t.loadout.actives[0]).toBe(s.loadout.actives[1]); // swapped, no duplicate
  });
});

describe("applyLevelResult", () => {
  const play = (levelId: string): ReturnType<typeof getResult> => {
    // a clean abandon is the cheapest terminal; use a synthetic cleared result instead
    const cfg = makeRunConfig({ levelId, seed: 1, pace: 35 });
    const st = createLevel(cfg.def, cfg.loadout, cfg.seed, cfg.options);
    step(st, 1);
    return getResult(st);
  };

  it("a failed attempt keeps only gold, counts the attempt and does not unlock", () => {
    const s = fresh();
    const def = resolveLevel(contentBundle, "ch1-l03", { dueWeakWords: [] });
    const res = {
      levelId: "ch1-l03",
      outcome: "failed",
      failReason: "defeated",
      durationTicks: 600,
      activeTicks: 600,
      gold: 12,
      chests: [],
      stats: {
        correctChars: 20,
        typos: 2,
        wordsCompleted: 3,
        perfectWords: 1,
        maxCombo: 2,
        maxKeyStreak: 8,
        netWpmX100: 3000,
        accuracyBp: 9000,
        hitsTaken: 3,
        blocks: 0,
        perfectParries: 0,
        autoAttacks: 1,
        skillsCast: 0,
        secondWindUsed: false,
        damageByOriginM: { weapon: 0, chip: 0, skill: 0, counter: 0, minigame: 0, finisher: 0 },
      },
      words: [{ wordKey: "about", text: "about", kind: "word", perfect: false, typos: 1, wpm: 30 }],
    } as unknown as NonNullable<ReturnType<typeof play>>;
    const { save, summary } = ops.applyLevelResult(s, res, {
      def,
      pace: 35,
      today: "2026-10-09",
      nowMs: 5,
    });
    expect(save.wallet.gold).toBe(12);
    expect(save.progress.levels["ch1-l03"]).toMatchObject({ cleared: false, attempts: 1 });
    expect(save.unlocks.actives).toEqual(s.unlocks.actives);
    expect(summary.newWordKeys).toEqual(["about"]);
    expect(save.srs.entries.about?.box).toBe(1);
    expect(save.srs.levelsPlayed).toBe(1);
    expect(save.replays.count).toBe(0);
  });

  it("a first clear unlocks the level's skill and pays star gold; a replay uses the replay rules", () => {
    const s = fresh();
    const def = resolveLevel(contentBundle, "ch1-l03", { dueWeakWords: [] });
    const base = {
      levelId: "ch1-l03",
      outcome: "cleared",
      failReason: null,
      durationTicks: 6000,
      activeTicks: 5000,
      gold: 100,
      chests: [
        {
          tier: "Gold",
          gold: 50,
          gear: { slot: "armor", tier: 1, rarity: "R", archetype: null },
          caches: 1,
          gemsUncredited: 0,
        },
      ],
      stats: {
        correctChars: 300,
        typos: 3,
        wordsCompleted: 30,
        perfectWords: 25,
        maxCombo: 20,
        maxKeyStreak: 50,
        netWpmX100: 4200,
        accuracyBp: 9900,
        hitsTaken: 0,
        blocks: 2,
        perfectParries: 1,
        autoAttacks: 11,
        skillsCast: 3,
        secondWindUsed: false,
        damageByOriginM: { weapon: 0, chip: 0, skill: 0, counter: 0, minigame: 0, finisher: 0 },
      },
      words: [],
    } as unknown as NonNullable<ReturnType<typeof play>>;
    const a = ops.applyLevelResult(s, base, { def, pace: 35, today: "2026-10-09", nowMs: 5 });
    expect(a.summary.firstClear).toBe(true);
    expect(a.summary.unlocked.actives).toContain("slashWave");
    expect(a.save.inventory.unopenedCaches).toBe(1);
    expect(a.save.inventory.gear.length).toBe(4);
    expect(a.summary.stars[0]).toBe(true);
    expect(a.save.wallet.gold).toBe(a.summary.gold);
    expect(a.summary.gold).toBeGreaterThanOrEqual(150);
    // replay: no unlocks, replay counter ticks, stars never lost
    const b = ops.applyLevelResult(a.save, base, { def, pace: 35, today: "2026-10-09", nowMs: 6 });
    expect(b.summary.firstClear).toBe(false);
    expect(b.summary.unlocked.actives).toEqual([]);
    expect(b.save.replays).toEqual({ day: "2026-10-09", count: 1 });
    expect(ops.goldMultFor(a.save, "ch1-l03", "2026-10-09").goldMultBp).toBe(4000);
    // the result is a valid save
    expect(() => migrateSave(b.save)).not.toThrow();
  });
});

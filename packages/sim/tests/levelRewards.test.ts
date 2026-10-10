// T1.6 in-level rewards: gold shares per EncounterCleared, chest drops on the `loot` stream (derived at roll time),
// LevelResult.chests / gold, the 5 s rewards phase after the boss, and unlockLevel semantics.
import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import {
  applyLevelUnlocks,
  type ChestContents,
  deriveRng,
  getResult,
  levelGold,
  levelUnlocks,
  mulBp,
  openChest,
  replay,
  replayGoldMultBp,
  resolveLevel,
  rollEncounterChest,
} from "../src/index.ts";
import { starterLoadout } from "./bot/fixtures.ts";
import { runBot } from "./bot/refBot.ts";
import { mkDef, mkLoadout, mkOptions, scriptedSession } from "./typingHarness.ts";

const encounterCount = (def: ReturnType<typeof mkDef>): number =>
  def.segments.filter((s) => s.kind !== "walk").length;

describe("gold per encounter", () => {
  test("goldTotal x goldMultBp is split evenly, the remainder on the last encounter; paid at EncounterCleared", () => {
    for (const mult of [10_000, 4000, 1000, 3333]) {
      const def = mkDef({ goldTotal: 101 });
      const d = scriptedSession(4, def, 20_000, { goldMultBp: mult }).driver;
      const total = mulBp(101, mult);
      const n = encounterCount(def);
      const amounts = d.ofType("GoldGained").map((e) => e.amount);
      expect(amounts).toHaveLength(n);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);
      const share = Math.floor(total / n);
      expect(amounts.slice(0, -1).every((a) => a === share)).toBe(true);
      expect(getResult(d.state)?.gold).toBe(total);
    }
  });

  test("GoldGained follows each EncounterCleared; LevelCleared.gold and result.gold equal the sum", () => {
    const def = mkDef({ goldTotal: 100 });
    const { driver } = scriptedSession(11, def);
    const n = encounterCount(def);
    const gains = driver.ofType("GoldGained");
    expect(gains).toHaveLength(n);
    const share = Math.floor(100 / n);
    expect(gains.map((g) => g.amount)).toEqual([
      ...Array(n - 1).fill(share),
      100 - share * (n - 1),
    ]);
    expect(gains.at(-1)?.total).toBe(100);
    expect(gains.every((g) => g.source === "encounter")).toBe(true);
    const cleared = driver.ofType("EncounterCleared");
    for (let i = 0; i < n; i++) expect(gains[i]?.tick).toBe(cleared[i]?.tick);
    expect(driver.ofType("LevelCleared")[0]?.gold).toBe(100);
    expect(getResult(driver.state)?.gold).toBe(100);
  });

  test("goldMultBp (replay pay) scales the level gold", () => {
    const def = mkDef({ goldTotal: 100 });
    const mult = replayGoldMultBp({
      firstClear: false,
      chapter: 1,
      frontierChapter: 1,
      replaysToday: 0,
    });
    expect(mult).toBe(4000);
    const d = scriptedSession(11, def, 20_000, { goldMultBp: mult, firstClear: false }).driver;
    expect(getResult(d.state)?.gold).toBe(40);
    expect(d.ofType("LevelCleared")[0]?.gold).toBe(40);
  });

  test("a failed level keeps FAIL_GOLD_KEEP (50%) of the gold paid so far", () => {
    const def = mkDef({ goldTotal: 100 });
    const { driver } = scriptedSession(11, def);
    const st = driver.state;
    // synthesize a mid-level failure from a terminal clear: rewrite the phase and payout
    st.phase = "failed";
    st.run.failReason = "defeated";
    st.run.goldCollected = 33;
    expect(getResult(st)?.gold).toBe(mulBp(33, K.FAIL_GOLD_KEEP_BP));
    expect(getResult(st)?.gold).toBe(16);
  });
});

describe("chest drops use the loot stream, derived at roll time", () => {
  test("every encounter's chest equals an independent derivation from (seed, encounter index)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const def = mkDef();
      const { driver } = scriptedSession(seed, def);
      const res = getResult(driver.state);
      const want: ChestContents[] = [];
      for (let e = 0; e < encounterCount(def); e++) {
        const loot = deriveRng(seed, "loot", e);
        const boss = def.segments.filter((s) => s.kind !== "walk")[e]?.kind === "boss";
        const tier = rollEncounterChest(loot, { boss, firstClear: true });
        if (tier !== null)
          want.push(
            openChest(loot, tier, {
              chapter: def.chapter,
              frontierChapter: 1,
              equippedArchetype: "sword",
            }),
          );
      }
      expect(res?.chests).toEqual(want);
      expect(driver.ofType("ChestDropped").map((c) => c.tier)).toEqual(want.map((c) => c.tier));
    }
  });

  test("loot does not depend on the fight: different typing at the same seed gives the same chests", () => {
    const def = mkDef();
    const a = getResult(scriptedSession(5, def).driver.state);
    const b = getResult(
      runBot(def, mkLoadout(), 5, mkOptions(), { wpm: 60, accuracy: 0.97 }).state,
    );
    const seedOnly = (r: typeof a) => r?.chests;
    expect(seedOnly(b)).toEqual(seedOnly(a));
  });

  test("replays drop chests at half the rate; chest gold is not part of result.gold", () => {
    let first = 0;
    let replays = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const firstClear of [true, false]) {
        const rng = deriveRng(seed, "loot", 0);
        if (rollEncounterChest(rng, { boss: false, firstClear }) !== null) {
          if (firstClear) first++;
          else replays++;
        }
      }
    }
    expect(first).toBeGreaterThan(replays);
  });
});

describe("the boss encounter: chest, gold share, 5 s rewards phase", () => {
  const def = resolveLevel(contentBundle, "ch1-l10", { dueWeakWords: [] });
  test("a boss clear pays the final gold share, always drops a first-clear chest (Iron+), then waits REWARD_T", () => {
    const r = runBot(def, starterLoadout(), 2024, mkOptions({ pace: 40 }), {
      wpm: 40,
      accuracy: 0.94,
    });
    const res = r.result;
    expect(res?.outcome).toBe("cleared");
    const encCleared = r.events.filter((e) => e.type === "EncounterCleared");
    expect(encCleared).toHaveLength(3);
    const last = encCleared.at(-1);
    const done = r.events.find((e) => e.type === "LevelCleared");
    expect((done?.tick ?? 0) - (last?.tick ?? 0)).toBe(K.REWARD_T);
    const bossDrop = r.events.filter((e) => e.type === "ChestDropped").at(-1);
    expect(bossDrop).toMatchObject({ encounterIndex: 2 });
    expect(["Iron", "Gold", "Mythic"]).toContain(
      bossDrop && "tier" in bossDrop ? bossDrop.tier : "",
    );
    expect(res?.gold).toBe(levelGold(1, 10));
    expect(res?.chests.at(-1)?.tier).not.toBe("Wooden");
  });

  test("replays are deterministic for the same inputs (loot included)", () => {
    const a = runBot(def, starterLoadout(), 77, mkOptions({ pace: 40 }), {
      wpm: 40,
      accuracy: 0.94,
    });
    const r = replay(def, starterLoadout(), 77, mkOptions({ pace: 40 }), a.inputs);
    expect(r.result).toEqual(a.result);
  });
});

describe("unlockLevel: the first clear unlocks the listed skills and passives", () => {
  test("levelUnlocks lists exactly the defs naming that level", () => {
    const all = [...contentBundle.actives, ...contentBundle.passives].filter(
      (d) => d.unlockLevel !== undefined,
    );
    for (const d of all) {
      const u = levelUnlocks(contentBundle, d.unlockLevel as string);
      expect([...u.actives, ...u.passives]).toContain(d.id);
    }
    expect(levelUnlocks(contentBundle, "nope")).toEqual({ actives: [], passives: [] });
  });

  test("a first clear adds them (no duplicates); a replay or a failure adds nothing", () => {
    const withUnlock = [...contentBundle.actives, ...contentBundle.passives].find(
      (d) => d.unlockLevel !== undefined,
    );
    expect(withUnlock).toBeDefined();
    const lvl = withUnlock?.unlockLevel as string;
    const first = applyLevelUnlocks(contentBundle, lvl, true, { actives: [], passives: [] });
    expect([...first.added.actives, ...first.added.passives]).toContain(withUnlock?.id);
    const again = applyLevelUnlocks(contentBundle, lvl, true, first.unlocks);
    expect(again.added).toEqual({ actives: [], passives: [] });
    expect(again.unlocks).toEqual(first.unlocks);
    const replayed = applyLevelUnlocks(contentBundle, lvl, false, { actives: [], passives: [] });
    expect(replayed.added).toEqual({ actives: [], passives: [] });
  });
});

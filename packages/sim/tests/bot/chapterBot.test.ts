// T1.6 acceptance: the reference bot plays Chapter 1 (L1-L10, real content via resolveLevel) at 40 WPM / 94% accuracy,
// 40 seeds per level, first clears, and the gold / chest / star totals are compared with economy_sim's expectation for
// Chapter 1 (level gold + chest gold + star gold; the Python's "Gold in" 3,592 also contains daily missions and salvage).
// Numbers are printed (run with --silent=false).
import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  type ChestContents,
  evaluateStars,
  goldUnit,
  type LevelResult,
  levelGold,
  resolveLevel,
  starGold,
} from "../../src/index.ts";
import { mkOptions } from "../typingHarness.ts";
import { starterLoadout } from "./fixtures.ts";
import { runBot } from "./refBot.ts";

const say = (s: string): void =>
  (globalThis as unknown as { console: { log: (x: string) => void } }).console.log(s);

const SEEDS = Array.from({ length: 40 }, (_, i) => 4000 + i * 104729);
const WPM = 40;
const ACC = 0.94;
const TIER_GOLD = { Wooden: 0.5, Iron: 1.0, Gold: 2.5, Mythic: 6.0 } as const;
const NORMAL_P = { Wooden: 0.72, Iron: 0.24, Gold: 0.035, Mythic: 0.005 } as const;
const BOSS_P = { Wooden: 0, Iron: 0.55, Gold: 0.38, Mythic: 0.07 } as const;
const tiers = ["Wooden", "Iron", "Gold", "Mythic"] as const;
const ev = (p: Record<(typeof tiers)[number], number>): number =>
  tiers.reduce((a, t) => a + p[t] * TIER_GOLD[t], 0);

describe("Chapter 1 reward totals (bot, 40 WPM, 94%)", () => {
  test("level gold, chest gold, caches and stars vs economy_sim's Chapter 1 expectation", () => {
    let levelGoldSum = 0;
    let chestGoldSum = 0;
    let starGoldSum = 0;
    let caches = 0;
    let chestCount = 0;
    let gems = 0;
    let gearDrops = 0;
    let starsSum = 0;
    const byTier: Record<string, number> = { Wooden: 0, Iron: 0, Gold: 0, Mythic: 0 };
    let expectedChest = 0;
    let expectedBossChest = 0;
    let runs = 0;
    for (let index = 1; index <= 10; index++) {
      const id = `ch1-l${String(index).padStart(2, "0")}`;
      const def = resolveLevel(contentBundle, id, { dueWeakWords: [] });
      const nEnc = def.segments.filter((s) => s.kind === "encounter").length;
      const gu = goldUnit(1);
      expectedChest += nEnc * 0.3 * ev(NORMAL_P) * gu;
      if (def.isBoss) expectedBossChest += ev(BOSS_P) * gu;
      for (const seed of SEEDS) {
        const r = runBot(
          def,
          starterLoadout(),
          seed + index * 1_000_003, // a different seed per level: same seed + encounter index would repeat the loot draw
          mkOptions({ pace: WPM }),
          {
            wpm: WPM,
            accuracy: ACC,
          },
        );
        const res = r.result as LevelResult;
        expect(res.outcome).toBe("cleared");
        runs++;
        levelGoldSum += res.gold;
        for (const c of res.chests as ChestContents[]) {
          chestGoldSum += c.gold;
          caches += c.caches;
          gems += c.gemsUncredited;
          chestCount++;
          if (c.gear !== null) gearDrops++;
          byTier[c.tier] = (byTier[c.tier] as number) + 1;
        }
        const st = evaluateStars({
          result: res,
          star3: def.star3,
          parRefTicks: def.parRefTicks,
          pace: WPM,
          median7dAccuracyBp: null,
        });
        const n = st.filter(Boolean).length;
        starsSum += n;
        starGoldSum += starGold(n, levelGold(1, index));
      }
    }
    const per = (x: number): number => x / SEEDS.length;
    const chapterLevelGold = Array.from({ length: 10 }, (_, i) => levelGold(1, i + 1)).reduce(
      (a, b) => a + b,
      0,
    );
    say(`Ch1 bot x${SEEDS.length} (first clears, 40 WPM / 94%): per-chapter means`);
    say(`  level gold       ${per(levelGoldSum).toFixed(0)}  (table sum ${chapterLevelGold})`);
    say(
      `  chest gold       ${per(chestGoldSum).toFixed(0)}  (analytic EV ${(expectedChest + expectedBossChest).toFixed(0)})`,
    );
    say(
      `  star gold        ${per(starGoldSum).toFixed(0)}  (avg ${(starsSum / runs).toFixed(2)} stars/level)`,
    );
    say(
      `  total            ${per(levelGoldSum + chestGoldSum + starGoldSum).toFixed(0)}  vs economy_sim Ch1 "Gold in" 3,592 (incl. missions + salvage)`,
    );
    say(
      `  chests           ${per(chestCount).toFixed(2)} (Wooden ${per(byTier.Wooden as number).toFixed(2)}, Iron ${per(byTier.Iron as number).toFixed(2)}, Gold ${per(byTier.Gold as number).toFixed(2)}, Mythic ${per(byTier.Mythic as number).toFixed(2)})`,
    );
    say(
      `  caches from chests ${per(caches).toFixed(2)}, gems (uncredited) ${per(gems).toFixed(1)}, gear drops ${per(gearDrops).toFixed(2)}`,
    );
    // level gold is exactly the table
    expect(levelGoldSum).toBe(chapterLevelGold * SEEDS.length);
    // chest gold within 25% of the Python expectation (random draws; 40 seeds)
    const evTotal = expectedChest + expectedBossChest;
    expect(Math.abs(per(chestGoldSum) - evTotal) / evTotal).toBeLessThan(0.25);
    // the boss level always drops a chest on first clear
    expect(
      per(byTier.Iron as number) + per(byTier.Gold as number) + per(byTier.Mythic as number),
    ).toBeGreaterThan(1);
  }, 120_000);
});

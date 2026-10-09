// T1.5 acceptance: the reference bot plays the real content (resolveLevel on the content bundle) end to end at 20 / 40 / 75
// WPM (accuracy 88 / 94 / 97 %), 30 seeds each, with the Chapter 1 starter kit. Boss level ch1-l10 and normal levels L1, L5, L9
// are compared with plan §9. The numbers are printed (run with --silent=false); the assertions pin the measured bands.
// This bot guards every guard word and has no WPM noise: the economy_sim personas (noise, calibrated guard rates, every
// level, the §9 verdicts) live in tools/balance (`pnpm balance`, docs/balance-ch1.md).
//
// Bot model notes (see refBot.ts): gimmick words cost the bot nothing extra (it reads the answer and types it; a human has
// to decode a scramble or remember a faded word), every Doom Spell / falling word is attempted after a 0.25 s reaction.
import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { type LevelResult, resolveLevel } from "../../src/index.ts";
import { mkOptions } from "../typingHarness.ts";
import { starterLoadout } from "./fixtures.ts";
import { runBot } from "./refBot.ts";

const say = (s: string): void =>
  (globalThis as unknown as { console: { log: (x: string) => void } }).console.log(s);

const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);
const TIERS = [
  { name: "20 WPM", wpm: 20, acc: 0.88 },
  { name: "40 WPM", wpm: 40, acc: 0.94 },
  { name: "75 WPM", wpm: 75, acc: 0.97 },
] as const;

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

interface Measured {
  cleared: number;
  n: number;
  /** Level time of cleared runs, minutes: total (LevelCleared tick) and active (typing live). */
  totalMin: number;
  activeMin: number;
  secondWind: number;
  doomsFailed: number;
  doomsStarted: number;
  rubbleMissed: number;
  rubbleSpawned: number;
  hits: number;
  timeouts: number;
}

function measure(
  levelId: string,
  tier: (typeof TIERS)[number],
  guardAttempt = 1,
  seeds: readonly number[] = SEEDS,
): Measured {
  const def = resolveLevel(contentBundle, levelId, { dueWeakWords: [] });
  const out: Measured = {
    cleared: 0,
    n: seeds.length,
    totalMin: 0,
    activeMin: 0,
    secondWind: 0,
    doomsFailed: 0,
    doomsStarted: 0,
    rubbleMissed: 0,
    rubbleSpawned: 0,
    hits: 0,
    timeouts: 0,
  };
  const totals: number[] = [];
  const actives: number[] = [];
  for (const seed of seeds) {
    const r = runBot(def, starterLoadout(), seed, mkOptions({ pace: tier.wpm }), {
      wpm: tier.wpm,
      accuracy: tier.acc,
      guardAttempt,
    });
    const res = r.result as LevelResult;
    if (res.outcome === "cleared") {
      out.cleared++;
      totals.push(res.durationTicks / 3600);
      actives.push(res.activeTicks / 3600);
    }
    if (res.failReason === "timeout") out.timeouts++;
    if (res.stats.secondWindUsed) out.secondWind++;
    out.hits += res.stats.hitsTaken;
    for (const e of r.events) {
      if (e.type === "DoomSpellStarted") out.doomsStarted++;
      if (e.type === "DoomSpellFailed") out.doomsFailed++;
      if (e.type === "MinigameWordSpawned") out.rubbleSpawned++;
      if (e.type === "MinigameWordMissed") out.rubbleMissed++;
    }
  }
  out.totalMin = mean(totals);
  out.activeMin = mean(actives);
  return out;
}

const row = (name: string, m: Measured): string =>
  `${name.padEnd(34)} clear ${m.cleared}/${m.n} (${Math.round((100 * m.cleared) / m.n)}%)  total ${m.totalMin.toFixed(2)} min  active ${m.activeMin.toFixed(2)} min  SW ${m.secondWind}/${m.n}  hits/run ${(m.hits / m.n).toFixed(1)}  doom fail ${m.doomsFailed}/${m.doomsStarted}  rubble miss ${m.rubbleMissed}/${m.rubbleSpawned}`;

describe("boss level ch1-l10 (starter kit, 30 seeds per tier) vs plan §9", () => {
  // Boss times: PO 2026-10-09, economy_sim's own Chapter 1 model on this content (8.1 / 4.4 / 2.8 min +-15%, active time
  // incl. the 10 s level-end screen); clears: plan §9 floors.
  const TARGET = {
    "20 WPM": { min: 8.1, clear: 50 },
    "40 WPM": { min: 4.4, clear: 85 },
    "75 WPM": { min: 2.8, clear: 90 },
  };
  for (const tier of TIERS) {
    test(`${tier.name}: ${tier.acc * 100}% accuracy`, () => {
      const m = measure("ch1-l10", tier);
      const p = measure("ch1-l10", tier, 0.6); // economy_sim REF_GUARD: 60% of guard words attempted
      const t = TARGET[tier.name];
      say(`BOSS ${row(tier.name, m)}   [target ${t.min} min, >= ${t.clear}%]`);
      say(`BOSS ${row(`${tier.name} guard 60%`, p)}`);
      expect(m.cleared / m.n).toBeGreaterThanOrEqual(t.clear / 100);
      // T6.1 BOSS_SCRIPT_PACE_SCALE: rubble timing follows the pace, so even 20 WPM misses (almost) no falling word
      // (T1.5 without it: 43% missed, 63% clears). Before: 458/1056 missed at 20 WPM.
      expect(m.rubbleMissed / Math.max(1, m.rubbleSpawned)).toBeLessThan(0.05);
      // level time (+ the 10 s level-end screen) within +-15% of the Chapter 1 target at every tier
      const active = m.totalMin + 10 / 60;
      expect(active).toBeGreaterThan(t.min * 0.85);
      expect(active).toBeLessThan(t.min * 1.15);
      // T6.1 "add some risk" (weaker Aegis / Iron Will, BOSS_LEVEL_HIT_MULT): guarding only 60% of the attacks, a 20 WPM
      // typist now fails some boss runs (the persona runner, 200 seeds, puts the Beginner at ~85-87%)
      if (tier.wpm === 20) expect(p.cleared / p.n).toBeLessThan(1);
      // a stuck script would show up as a timeout (T1.5 found one: a Break ending after the Finisher resumed boss attacks)
      expect(m.timeouts + p.timeouts).toBe(0);
    }, 120_000);
  }
});

describe("normal levels L1, L5, L9 (starter kit, 30 seeds per tier) vs plan §9", () => {
  for (const id of ["ch1-l01", "ch1-l05", "ch1-l09"]) {
    for (const tier of TIERS) {
      test(`${id} at ${tier.name}`, () => {
        const m = measure(id, tier);
        say(`NORMAL ${row(`${id} ${tier.name}`, m)}`);
        expect(m.cleared / m.n).toBeGreaterThanOrEqual(tier.wpm === 20 ? 0.8 : 0.97);
      }, 120_000);
    }
  }
});

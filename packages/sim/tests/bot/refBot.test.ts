// T1.3 acceptance: a 35 WPM / 94% reference bot over >= 20 seeds. The primary fixture is economy_sim's own Chapter 1
// composition (so the numbers are comparable with the Python); the real content levels are measured too.
// Measured numbers and the delta analysis are in the T1.3 report; the bounds below pin them.
import { describe, expect, test } from "vitest";
import reference from "../fixtures/economy-reference.json" with { type: "json" };
import { mkLoadout, mkOptions } from "../typingHarness.ts";
import { contentLevel, economyFixtureLevel } from "./fixtures.ts";
import { runBot } from "./refBot.ts";

const say = (s: string): void =>
  (globalThis as unknown as { console: { log: (x: string) => void } }).console.log(s);

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
const WPM = 35;
const ACC = 0.94;

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

function measure(def: ReturnType<typeof economyFixtureLevel>, guardAttempt = 1) {
  const attacks: number[] = [];
  const perEnc: number[] = [];
  const duration: number[] = [];
  const active: number[] = [];
  const encSeconds: number[] = [];
  let cleared = 0;
  for (const seed of SEEDS) {
    const r = runBot(def, mkLoadout(), seed, mkOptions({ pace: 35 }), {
      wpm: WPM,
      accuracy: ACC,
      guardAttempt,
    });
    if (r.result?.outcome === "cleared") cleared++;
    attacks.push(mean(r.attacksPerEncounter));
    perEnc.push(...r.attacksPerEncounter);
    duration.push((r.result?.durationTicks ?? 0) / 60);
    active.push((r.result?.activeTicks ?? 0) / 60);
    encSeconds.push(...r.combatTicksPerEncounter.map((t) => t / 60));
  }
  return { cleared, attacks, perEnc, duration, active, encSeconds };
}

const line = (name: string, m: ReturnType<typeof measure>): string =>
  `${name}: cleared ${m.cleared}/${SEEDS.length}; attacks/enc ${mean(m.attacks).toFixed(2)} +-${sd(m.attacks).toFixed(2)}; ` +
  `enc time ${mean(m.encSeconds).toFixed(1)} s; active ${mean(m.active).toFixed(1)} s; level ${mean(m.duration).toFixed(1)} s +-${sd(m.duration).toFixed(1)}`;

describe("reference bot (35 WPM, 94% accuracy, 24 seeds)", () => {
  test("economy_sim Ch1 L1 composition: clears every seed, ~11-13 auto-attacks per encounter (no skills yet)", () => {
    const m = measure(economyFixtureLevel(1));
    say(line("py ch1 L1 (no skills)", m));
    expect(m.cleared).toBe(SEEDS.length);
    expect(mean(m.attacks)).toBeGreaterThan(11);
    expect(mean(m.attacks)).toBeLessThan(13.5);
    // the attack RATE matches economy_sim.typing_combat attacks_ps (0.3258/s at 35 WPM, 94%) within 10%
    const py = reference.ref.typing_combat["35_94"].attacks_ps;
    const rate = mean(m.perEnc) / mean(m.encSeconds);
    say(`attack rate ${rate.toFixed(4)}/s vs python attacks_ps ${py.toFixed(4)}/s`);
    expect(Math.abs(rate / py - 1)).toBeLessThan(0.1);
  });

  test("with the Python's skill damage share (16.4%) removed from encounter HP, the result is ~11 attacks", () => {
    const share = reference.ref.typing_combat["35_94"].skill_share;
    const m = measure(economyFixtureLevel(1, Math.round((1 - share) * 10_000)));
    say(line("py ch1 L1 (HP x (1 - skill share))", m));
    expect(mean(m.attacks)).toBeGreaterThan(9.5);
    expect(mean(m.attacks)).toBeLessThan(11.7);
  });

  test("Python guard model (60% of guard words attempted) costs HP but still clears", () => {
    const m = measure(economyFixtureLevel(1), 0.6);
    say(line("py ch1 L1 (guard attempt 0.6)", m));
    expect(m.cleared).toBe(SEEDS.length);
  });

  test.each(["ch1-l01", "ch1-l05", "ch1-l09"])("real content level %s", (id) => {
    const m = measure(contentLevel(id));
    say(line(id, m));
    expect(m.cleared).toBe(SEEDS.length);
    expect(mean(m.attacks)).toBeGreaterThan(10.5);
    expect(mean(m.attacks)).toBeLessThan(14);
    if (id !== "ch1-l01") {
      // a normal 3-encounter level lasts about 2:45 +- 15% (140.25..189.75 s)
      expect(mean(m.duration)).toBeGreaterThan(165 * 0.85);
      expect(mean(m.duration)).toBeLessThan(165 * 1.15);
    }
  });

  test("the bot is deterministic: the same seed gives the same inputs, events and state", () => {
    const def = economyFixtureLevel(2);
    const a = runBot(def, mkLoadout(), 5, mkOptions(), { wpm: WPM, accuracy: ACC });
    const b = runBot(def, mkLoadout(), 5, mkOptions(), { wpm: WPM, accuracy: ACC });
    expect(a.inputs).toEqual(b.inputs);
    expect(a.events).toEqual(b.events);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

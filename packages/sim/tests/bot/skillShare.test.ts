// T1.4 acceptance: skill damage share and auto-attacks per encounter with the starter kit (Fireball + Aegis, Clean Cut +
// Steady Hands + Iron Will), reference bot 35 WPM / 94%, 24 seeds. Share = skill / sum over every origin of
// LevelResult.stats.damageByOriginM (burn counts as skill, bleed as weapon).
import { describe, expect, test } from "vitest";
import reference from "../fixtures/economy-reference.json" with { type: "json" };
import { mkOptions } from "../typingHarness.ts";
import { contentLevel, economyFixtureLevel, starterLoadout } from "./fixtures.ts";
import { runBot } from "./refBot.ts";

const say = (s: string): void =>
  (globalThis as unknown as { console: { log: (x: string) => void } }).console.log(s);

const SEEDS = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

function measure(def: ReturnType<typeof economyFixtureLevel>, withSkills = true) {
  const attacks: number[] = [];
  const shares: number[] = [];
  const sharesNoCounter: number[] = [];
  const perSkill: Record<string, number> = {};
  const origin: Record<string, number> = {};
  let cleared = 0;
  let casts = 0;
  for (const seed of SEEDS) {
    const loadout = starterLoadout();
    if (!withSkills) {
      loadout.actives = [null, null];
      loadout.passives = [null, null, null];
    }
    const r = runBot(def, loadout, seed, mkOptions({ pace: 35 }), { wpm: 35, accuracy: 0.94 });
    if (r.result?.outcome === "cleared") cleared++;
    attacks.push(mean(r.attacksPerEncounter));
    const o = r.result?.stats.damageByOriginM;
    if (o === undefined) continue;
    const total = Object.values(o).reduce((a, b) => a + b, 0);
    shares.push(o.skill / total);
    sharesNoCounter.push(o.skill / (total - o.counter));
    for (const [k, v] of Object.entries(o)) origin[k] = (origin[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.result?.stats.damageBySkillM ?? {}))
      perSkill[k] = (perSkill[k] ?? 0) + v;
    // invariant: the per-skill breakdown (burn included) adds up to the skill origin
    const bySkill = Object.values(r.result?.stats.damageBySkillM ?? {}).reduce((a, b) => a + b, 0);
    expect(bySkill).toBe(o.skill);
    casts += r.result?.stats.skillsCast ?? 0;
  }
  const sum = Object.values(origin).reduce((a, b) => a + b, 0);
  const pct = (v: number): string => `${((100 * v) / sum).toFixed(1)}%`;
  return { cleared, attacks, shares, sharesNoCounter, perSkill, origin, sum, casts, pct };
}

const report = (name: string, m: ReturnType<typeof measure>): void =>
  say(
    `${name}: cleared ${m.cleared}/${SEEDS.length}; auto/enc ${mean(m.attacks).toFixed(2)}; skill share ${(100 * mean(m.shares)).toFixed(1)}% (excl. counters ${(100 * mean(m.sharesNoCounter)).toFixed(1)}%); casts/run ${(m.casts / SEEDS.length).toFixed(1)}; by origin ${Object.entries(
      m.origin,
    )
      .map(([k, v]) => `${k} ${m.pct(v)}`)
      .join(", ")}; by skill ${Object.entries(m.perSkill)
      .map(([k, v]) => `${k} ${m.pct(v)}`)
      .join(", ")}`,
  );

describe("skill share with the starter kit (reference bot, 35 WPM / 94%, 24 seeds)", () => {
  test("economy_sim Ch1 L1: skill share 15-20% and ~11 auto-attacks per encounter", () => {
    const m = measure(economyFixtureLevel(1));
    report("py ch1 L1 (starter kit)", m);
    report("py ch1 L1 (no kit)     ", measure(economyFixtureLevel(1), false));
    say(`python skill_share ${reference.ref.typing_combat["35_94"].skill_share}`);
    expect(m.cleared).toBe(SEEDS.length);
    expect(mean(m.shares)).toBeGreaterThan(0.15);
    expect(mean(m.shares)).toBeLessThan(0.2);
    expect(mean(m.attacks)).toBeGreaterThan(11 * 0.85);
    expect(mean(m.attacks)).toBeLessThan(11 * 1.15);
  });

  test.each(["ch1-l05", "ch1-l09"])("real content level %s: skill share 15-20%%", (id) => {
    const m = measure(contentLevel(id));
    report(id, m);
    expect(m.cleared).toBe(SEEDS.length);
    expect(mean(m.shares)).toBeGreaterThan(0.15);
    expect(mean(m.shares)).toBeLessThan(0.2);
  });
});

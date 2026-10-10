// Can't-lose fuzz (P1.1 AC): 1000 seeded input logs (idle, all typos, random, perfect typing; half of them against enemies that
// hit absurdly hard) never reach LevelFailed, never emit HeroDowned / SecondWindStarted, and keep the hero at or above the floor.
import { describe, expect, test } from "vitest";
import { mulBp, type SimEvent } from "../src/index.ts";
import { playPrologue, prologueRun, type Typist } from "./prologueFixture.ts";

const TYPISTS: Typist[] = ["idle", "typos", "random", "perfect"];
const RUNS = 1000;
const HARD_SEGMENTS = [
  { kind: "walk", seconds: 2, heal: false },
  {
    kind: "encounter",
    encounter: {
      name: "Doom",
      hp: 200,
      gruntHit: 3000,
      waves: [[{ enemy: "pgrunt" }], [{ enemy: "pgrunt" }, { enemy: "pwisp" }]],
    },
  },
  { kind: "walk", seconds: 2, heal: false },
  { kind: "boss", bossId: "nul" },
];

describe("can't-lose fuzz (1000 seeded logs)", () => {
  test("idle / all-typos / random / perfect never fail and never drop below the HP floor", () => {
    let minFrac = 1;
    let minHpM = Number.POSITIVE_INFINITY;
    let floorOfMin = 0;
    const byTypist: Record<string, { runs: number; cleared: number; hitsAtFloor: number }> = {};
    for (let i = 0; i < RUNS; i++) {
      const typist = TYPISTS[i % 4] as Typist;
      const hard = i % 8 >= 4; // every typist plays against both the normal and the absurd damage tables
      const run = hard ? prologueRun({ segments: HARD_SEGMENTS }, 3000) : prologueRun();
      run.seed = 1 + i * 7919;
      let floor = 1;
      const rec = byTypist[typist] ?? { runs: 0, cleared: 0, hitsAtFloor: 0 };
      byTypist[typist] = rec;
      const r = playPrologue(run, typist, {
        everyTicks: 3 + ((i * 7) % 28),
        maxTicks: 60 * 50,
        seed: run.seed,
        onTick: (s) => {
          floor = Math.max(1, mulBp(s.run.heroMaxHpM, 2500));
          const hp = s.run.heroHpM;
          if (hp < minHpM) {
            minHpM = hp;
            floorOfMin = floor;
          }
          minFrac = Math.min(minFrac, hp / s.run.heroMaxHpM);
          if (hp < floor) throw new Error(`run ${i} (${typist}): hero HP ${hp} < floor ${floor}`);
        },
      });
      const bad = r.events.filter(
        (e: SimEvent) =>
          e.type === "LevelFailed" || e.type === "HeroDowned" || e.type === "SecondWindStarted",
      );
      expect(bad, `run ${i} (${typist}, ${hard ? "hard" : "normal"})`).toEqual([]);
      expect(r.state.phase).not.toBe("failed");
      rec.runs++;
      if (r.state.phase === "cleared") rec.cleared++;
      if (r.state.run.heroHpM === floor) rec.hitsAtFloor++;
    }
    expect(minHpM).toBeGreaterThanOrEqual(floorOfMin);
    // the harsh half must actually press the hero onto the floor, or the test proves nothing
    expect(byTypist.idle?.hitsAtFloor).toBeGreaterThan(0);
    // the lowest HP seen in 1000 runs sits exactly on the floor (25% of max), and every typist class was exercised
    expect(minHpM).toBe(floorOfMin);
    expect(minFrac).toBeCloseTo(0.25, 3);
    expect(Object.values(byTypist).map((r) => r.runs)).toEqual([250, 250, 250, 250]);
  });
});

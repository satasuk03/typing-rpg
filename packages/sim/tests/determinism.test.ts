import { describe, expect, test } from "vitest";
import {
  applyInput,
  getResult,
  replay,
  restore,
  snapshot,
  hash as stateHash,
  step,
} from "../src/index.ts";
import golden from "./fixtures/golden-replay.json" with { type: "json" };
import typingFixture from "./fixtures/golden-typing.json" with { type: "json" };
import { GOLDEN_SEEDS, goldenHashes, toyReplayHash } from "./toy.ts";
import {
  COMBAT_GOLDEN_SCENARIOS,
  combatGoldens,
  TYPING_GOLDEN_SEEDS,
  typingGolden,
  typingGoldens,
} from "./typingGolden.ts";
import { mkDef, mkLoadout, mkOptions, scriptedSession } from "./typingHarness.ts";

const RUNS = 1_000;

describe("sim determinism (toy sim through the replay runner)", () => {
  test(`same seed + inputs give an identical state hash across ${RUNS} runs`, () => {
    const first = toyReplayHash(12345);
    for (let i = 1; i < RUNS; i++) expect(toyReplayHash(12345)).toBe(first);
  });

  test("different seeds give different hashes", () => {
    expect(toyReplayHash(1)).not.toBe(toyReplayHash(2));
  });

  test("hashes match the committed golden fixture (shared with the browser parity test)", () => {
    expect(goldenHashes()).toEqual(golden.hashes);
    expect(Object.keys(golden.hashes).sort()).toEqual(GOLDEN_SEEDS.map(String).sort());
  });
});

describe("typing-only level determinism (T1.2)", () => {
  test("scripted typing sessions replay to the committed golden hashes (state + event stream)", () => {
    expect(typingGoldens()).toEqual(typingFixture.goldens);
    expect(Object.keys(typingFixture.goldens).sort()).toEqual(
      TYPING_GOLDEN_SEEDS.map(String).sort(),
    );
  });

  test("combat replays (reference bot) match the committed golden hashes: boss, shields/dagger, Second Wind", () => {
    expect(combatGoldens()).toEqual(typingFixture.combatGoldens);
    expect(Object.keys(typingFixture.combatGoldens).sort()).toEqual(
      [...COMBAT_GOLDEN_SCENARIOS].sort(),
    );
    expect(typingFixture.combatGoldens["glass-hero"]?.secondWindUsed).toBe(true);
    expect(typingFixture.combatGoldens["boss-sword"]?.outcome).toBe("cleared");
  });

  test("T1.5 boss replays: the real Ruin Golem level clears at 40 WPM; at 20 WPM a Second Wind mid-boss is replayed exactly", () => {
    const golem = typingFixture.combatGoldens["golem-40wpm"];
    expect(golem?.outcome).toBe("cleared");
    expect(golem?.skillsCast).toBeGreaterThan(5);
    const sw = typingFixture.combatGoldens["golem-20wpm-sw"];
    expect(sw?.secondWindUsed).toBe(true);
    expect(sw?.outcome).toBe("cleared");
  });

  test("the sessions actually clear the level (the golden covers walk, encounters, guards and the boss finisher)", () => {
    for (const g of Object.values(typingFixture.goldens)) expect(g.outcome).toBe("cleared");
  });

  test("same seed + inputs give an identical state hash across 200 replays", () => {
    const def = mkDef();
    const { inputs } = scriptedSession(7, def);
    const first = replay(def, mkLoadout(), 7, mkOptions(), inputs, { collectEvents: false }).hash;
    for (let i = 1; i < 200; i++) {
      expect(replay(def, mkLoadout(), 7, mkOptions(), inputs, { collectEvents: false }).hash).toBe(
        first,
      );
    }
  });

  test("a live tick-by-tick run and the replay runner end in the same state", () => {
    const def = mkDef();
    const { inputs, driver } = scriptedSession(11, def);
    const res = replay(def, mkLoadout(), 11, mkOptions(), inputs);
    expect(res.hash).toBe(stateHash(driver.state));
    expect(res.events).toEqual(driver.all);
    expect(res.result).toEqual(getResult(driver.state));
  });

  test("different seeds give different hashes", () => {
    expect(typingGolden(1).state).not.toBe(typingGolden(42).state);
  });

  test("snapshot/restore mid-level continues exactly like the original (state is plain data)", () => {
    const def = mkDef();
    const { inputs } = scriptedSession(5, def);
    const cut = inputs[Math.floor(inputs.length / 2)]?.tick ?? 0;
    const a = replay(
      def,
      mkLoadout(),
      5,
      mkOptions(),
      inputs.filter((i) => i.tick < cut),
      { untilTick: cut },
    );
    const snap = snapshot(a.finalState);
    const b = restore(snap);
    expect(stateHash(b)).toBe(stateHash(a.finalState));
    for (const i of inputs.filter((x) => x.tick >= cut)) {
      for (const s of [a.finalState, b]) {
        if (i.tick > s.tick) step(s, i.tick - s.tick);
        applyInput(s, i);
      }
    }
    step(a.finalState, 3000);
    step(b, 3000);
    expect(stateHash(b)).toBe(stateHash(a.finalState));
  });
});

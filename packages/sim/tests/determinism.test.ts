import { describe, expect, test } from "vitest";
import golden from "./fixtures/golden-replay.json" with { type: "json" };
import { GOLDEN_SEEDS, goldenHashes, toyReplayHash } from "./toy.ts";

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

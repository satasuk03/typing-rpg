import { describe, expect, test } from "vitest";
import { sfc32 } from "../src/rng.ts";

const TICKS = 10_000;
const RUNS = 1_000;

/** Toy fixed-tick loop: consumes the RNG each tick and folds it into a 32-bit FNV-1a hash. */
function runToySim(seed: number): number {
  const rng = sfc32(seed);
  let h = 0x811c9dc5;
  for (let tick = 0; tick < TICKS; tick++) {
    const v = rng.nextU32() ^ tick;
    for (let i = 0; i < 4; i++) {
      h ^= (v >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

describe("sim determinism (toy loop)", () => {
  test(`same seed gives identical hash across ${RUNS} runs`, () => {
    const first = runToySim(12345);
    for (let i = 1; i < RUNS; i++) {
      expect(runToySim(12345)).toBe(first);
    }
  });

  test("different seeds give different hashes", () => {
    expect(runToySim(1)).not.toBe(runToySim(2));
  });
});

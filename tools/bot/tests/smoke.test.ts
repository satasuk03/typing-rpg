import { expect, test } from "vitest";
import { runGate, wilson } from "../src/index.ts";

test("wilson interval brackets the observed rate", () => {
  const [lo, hi] = wilson(17, 20);
  expect(lo).toBeLessThan(0.85);
  expect(hi).toBeGreaterThan(0.85);
  expect(wilson(0, 0)).toEqual([0, 1]);
});

test("gate on one level is deterministic and clean (inline, 2 seeds)", async () => {
  const g = await runGate({
    seeds: 2,
    workers: 1,
    gimmicks: "realistic",
    personas: ["average"],
    levels: ["ch1-l04"],
  });
  expect(g.failures).toEqual([]);
  expect(g.runs).toBe(2);
});

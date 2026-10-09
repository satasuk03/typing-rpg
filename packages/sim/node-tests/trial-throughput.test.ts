// Throughput of the Worker's anti-cheat re-sim (T5.2). Lives in node-tests/ because it reads the wall clock, which
// the sim's src and tests directories must never do (the purity grep).
import { performance } from "node:perf_hooks";
import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  createTrial,
  encodeLog,
  type LoggedInput,
  msToTick,
  type ResolvedTrial,
  resimTrialLog,
  resolveTrial,
  tickStartMs,
} from "../src/index.ts";

const passageOf = (d: ResolvedTrial, seed: number): string => createTrial(d, seed).passage;

describe("Trial re-sim throughput", () => {
  test("throughput: decode + re-sim of a 3,000-event log (real content pool) takes < 20 ms in Node", () => {
    const pool = resolveTrial(contentBundle, (contentBundle.trials[0] as { id: string }).id);
    // real passage text, doubled so that 3,000 keys never run off the end (real passages are 1,600+ chars)
    const real = { ...pool, passages: [passageOf(pool, 99).repeat(2)] };
    const p = passageOf(real, 99);
    // 3,000 keys, one per tick for 3,000 ticks (< 3,600), with ~5% typos
    const log: LoggedInput[] = [];
    let ci = 0;
    for (let i = 0; i < 3000; i++) {
      const ms = i === 0 ? 0 : tickStartMs(i);
      const key = i % 20 === 19 ? "#" : p.charAt(ci++);
      log.push({ ms, input: { tick: msToTick(ms), key } });
    }
    const big = encodeLog(log);
    resimTrialLog(real, 99, big); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const t0 = performance.now();
      const r = resimTrialLog(real, 99, big);
      times.push(performance.now() - t0);
      expect(r.result.correctChars + r.result.typos).toBeGreaterThan(2900);
    }
    times.sort((a, b) => a - b);
    const median = times[12] as number;
    console.log(
      `trial re-sim, 3000 events: median ${median.toFixed(2)} ms, min ${(times[0] as number).toFixed(2)} ms, max ${(times[24] as number).toFixed(2)} ms`,
    );
    expect(median).toBeLessThan(20);
  });
});

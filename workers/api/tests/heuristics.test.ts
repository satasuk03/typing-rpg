import { describe, expect, test } from "vitest";
import { readAcConfig } from "../src/lib/env.ts";
import { analyzeTiming, type KeyRec, maxWindowWpm } from "../src/lib/heuristics.ts";
import { mulberry32 } from "./kit.ts";

const cfg = readAcConfig({});
const res = { accuracyBp: 9700, wpmX100: 6000 };
const codes = (k: KeyRec[], r = res) => analyzeTiming(k, r, cfg).hits.map((h) => h.code);

function humanish(n: number, seed = 1, grain = 1): KeyRec[] {
  const rnd = mulberry32(seed);
  const out: KeyRec[] = [];
  let ms = 0;
  for (let i = 0; i < n; i++) {
    out.push({ ms, correct: true });
    const raw = 200 * Math.exp(0.4 * (rnd() + rnd() + rnd() - 1.5));
    ms += Math.max(grain, Math.round(raw / grain) * grain);
  }
  return out;
}

describe("analyzeTiming", () => {
  test("human-like jitter passes", () => {
    const r = analyzeTiming(humanish(300), res, cfg);
    expect(r.hits).toEqual([]);
    expect(r.metrics.grainMs).toBe(1);
    expect(r.metrics.ikiCv).toBeGreaterThan(0.15);
  });

  test("constant IKI -> iki_cv; 5 ms IKIs -> fast_share + wpm rules", () => {
    const constant = Array.from({ length: 200 }, (_, i) => ({ ms: i * 200, correct: true }));
    expect(codes(constant)).toContain("iki_cv");
    const fast = Array.from({ length: 800 }, (_, i) => ({ ms: i * 5, correct: true }));
    expect(codes(fast)).toEqual(expect.arrayContaining(["iki_cv", "fast_share", "burst_wpm"]));
  });

  test("coarse timer (100 ms grain) records the grain and skips quantization", () => {
    const r = analyzeTiming(humanish(300, 2, 100), res, cfg);
    expect(r.metrics.grainMs).toBe(100);
    expect(r.metrics.quantShare).toBeNull();
    expect(r.hits.map((h) => h.code)).not.toContain("quantized");
  });

  test("fine timer: IKIs that are multiples of one 16 ms period -> quantized", () => {
    const rnd = mulberry32(5);
    const k: KeyRec[] = [];
    let ms = 0;
    for (let i = 0; i < 300; i++) {
      k.push({ ms, correct: true });
      ms += 16 * (6 + Math.floor(rnd() * 14)) + (i % 40 === 0 ? 1 : 0); // grain stays 1, most multiples of 16
    }
    const r = analyzeTiming(k, res, cfg);
    expect(r.metrics.grainMs).toBe(1);
    expect(r.hits.map((h) => h.code)).toContain("quantized");
  });

  test("jank clusters (dtMs = 0) are coalesced and excluded from the statistics", () => {
    const base = humanish(300, 3);
    // duplicate 4% of timestamps (a browser delivering keys in one batch)
    const jank: KeyRec[] = [];
    base.forEach((k, i) => {
      jank.push(k);
      if (i % 25 === 0) jank.push({ ms: k.ms, correct: true });
    });
    const r = analyzeTiming(jank, res, cfg);
    expect(r.metrics.jankShare).toBeGreaterThan(0.05);
    expect(r.metrics.fastShare).toBe(0); // no 0 ms "IKIs" counted
    expect(r.hits.map((h) => h.code)).toEqual([]);
    // ...but a run that is mostly jank is itself suspicious
    const mostly = base.flatMap((k) => [k, { ms: k.ms, correct: true }]);
    expect(analyzeTiming(mostly, res, cfg).hits.map((h) => h.code)).toContain("jank");
  });

  test("perfect accuracy over many keys at high WPM", () => {
    const k = humanish(450, 4);
    expect(codes(k, { accuracyBp: 10_000, wpmX100: 16_000 })).toContain("perfect");
    expect(codes(k, { accuracyBp: 10_000, wpmX100: 9_000 })).not.toContain("perfect");
  });

  test("maxWindowWpm", () => {
    const ms = Array.from({ length: 100 }, (_, i) => i * 100); // 10 keys/s = 120 WPM
    expect(Math.round(maxWindowWpm(ms, 5000))).toBe(120);
  });
});

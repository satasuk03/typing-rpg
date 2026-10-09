import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  assertRealGpu,
  drainFrames,
  type FrameSample,
  installProbe,
  openLevel,
  playUrl,
  row,
  summarize,
  watchErrors,
} from "./helpers";

/**
 * T6.4 frame budget on real Metal. Bot at 60 WPM plays ch1-l05 (forest/ruins battle) and ch1-l10 (boss), typing VFX on.
 * Frame time = rAF delta while the sim phase is "combat" (the first WARM frames are dropped: shader compile).
 *  - tier 0 @ 1080p DPR 1: assert p95 < 16.7 ms (DoD)
 *  - tier 1 / 2: reported
 *  - tier 2 with CDP 4x CPU throttling: assert p95 < 22.2 ms (>= 45 fps) (DoD)
 * DPR comes from PERF_DPR (see the config). Numbers land in tests/perf/out/frame-budget-dpr<N>.json (gitignored).
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const DPR = Number(process.env.PERF_DPR ?? 1);
const WARM = 120;
const TARGET = Number(process.env.PERF_FRAMES ?? 900);
const LEVELS = (process.env.PERF_LEVELS ?? "ch1-l05,ch1-l10").split(",");
const UNCAPPED = process.env.PERF_UNCAPPED === "1";
// Display-locked rAF deltas quantize to 16.67 ms (+- ~0.2 ms timer jitter), so the p95 < 16.7 ms line gets 0.5 ms of slack.
// A frame that misses vsync lands at 33.3 ms, far above any slack, so the tolerance cannot hide a real miss.
const SLACK = 0.5;
const BUDGET_T0 = 16.7 + SLACK;
const BUDGET_T2_THROTTLED = 22.2 + SLACK;

interface Case {
  level: string;
  tier: number;
  throttle: number;
}

const CASES: Case[] = [];
for (const level of LEVELS) {
  for (const tier of [0, 1, 2]) CASES.push({ level, tier, throttle: 1 });
  CASES.push({ level, tier: 2, throttle: 4 });
}

const results: Record<string, unknown>[] = [];
let gpuString = "";

test.afterAll(() => {
  const out = path.join(dir, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, `frame-budget-dpr${DPR}${UNCAPPED ? "-uncapped" : ""}.json`),
    JSON.stringify({ gpu: gpuString, dpr: DPR, results }, null, 2),
  );
});

for (const c of CASES) {
  const name = `${c.level} tier ${c.tier}${c.throttle > 1 ? ` throttle ${c.throttle}x` : ""} dpr ${DPR}`;
  test(`frame budget: ${name}`, async ({ page }) => {
    const errors = watchErrors(page);
    await openLevel(page, playUrl(c.level, { tier: c.tier, wpm: 60, seed: 3, acc: 0.97 }));
    gpuString = await assertRealGpu(page);
    await installProbe(page);
    if (c.throttle > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.throttle });
    }
    const combat: FrameSample[] = [];
    const deadline = Date.now() + 6 * 60_000;
    while (combat.length < TARGET + WARM && Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const got = await drainFrames(page);
      combat.push(...got.filter((f) => f.phase === "combat"));
      const done = await page.evaluate(() => window.__play?.result() !== null);
      if (done) break;
    }
    const sample = combat.slice(WARM);
    const s = summarize(sample);
    console.log(`PERF ${row(name, s)}`);
    results.push({ ...c, dpr: DPR, ...s });
    expect(sample.length, "not enough combat frames sampled").toBeGreaterThan(300);
    if (!UNCAPPED && c.tier === 0 && c.throttle === 1 && DPR === 1) expect(s.p95).toBeLessThan(BUDGET_T0);
    if (!UNCAPPED && c.tier === 2 && c.throttle === 4 && DPR === 1) {
      expect(s.p95).toBeLessThan(BUDGET_T2_THROTTLED);
    }
    expect(errors.list, errors.list.join("\n")).toEqual([]);
  });
}

/**
 * P4.1 prologue frame budget + full flow on real Metal (1920x1080, DPR 1, new headless, perf config).
 *  - tier 0: fresh profile -> New Game -> Part A -> Part B (wpm-bot 40) -> Part C -> story -> calibrate -> L1 with 0 console errors;
 *    p95 frame time <= 16.8 ms in Part B and in Part C.
 *  - tier 2 with CDP 4x CPU throttle: p95 <= 22.2 ms (>= 45 fps) in Part B and Part C.
 * The heaviest moments are reported separately: Part B at the maximum surge reached, Part C theft beats and the vortex + fog,
 * plus the 5 worst single frames of the run. Frame time = rAF delta; the first WARM frames after a part starts are dropped
 * from the p95 (shader compile / first-use cost) but they still show in the worst-frames list and `max`.
 *
 *   PERF_PORT=5481 ./node_modules/.bin/playwright test -c tests/perf/playwright.config.ts prologue.spec
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import {
  expect,
  openApp,
  pressStart,
  prologueFlag,
  proState,
  typeCalibration,
  waitProPhase,
  waitRoute,
} from "../app/helpers";
import { assertRealGpu, fmt } from "./helpers";

test.setTimeout(25 * 60_000);

const dir = path.dirname(fileURLToPath(import.meta.url));
const WARM = 90;
const BUDGET_T0 = 16.8;
const BUDGET_T2_THROTTLED = 22.2;
// Part C timeline windows (ms, from the P3.6 keyframes): thefts 14.0 .. 22.0, vortex + fog 30.0 .. 43.0
const THEFT: [number, number] = [14_000, 22_000];
const VORTEX: [number, number] = [30_000, 43_000];

interface Frame {
  dt: number;
  phase: string;
  t: number;
  surge: number;
}

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __pf: Frame[] };
    w.__pf = [];
    const raf = window.requestAnimationFrame.bind(window);
    let last = 0;
    let n = 0;
    let surge = 1;
    const tick = (t: number): void => {
      const pr = window.__play?.prologue?.();
      if (last > 0 && pr) {
        if (pr.phase === "B" && n++ % 10 === 0)
          surge = window.__play?.view().prologue?.surgeMult ?? surge;
        w.__pf.push({
          dt: t - last,
          phase: pr.phase,
          t: pr.t,
          surge: pr.phase === "B" ? surge : 1,
        });
      }
      last = t;
      raf(tick);
    };
    raf(tick);
  });
}
const drain = (page: Page): Promise<Frame[]> =>
  page.evaluate(() => (window as unknown as { __pf: Frame[] }).__pf.splice(0));

interface Stat {
  n: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}
function stat(fr: Frame[]): Stat {
  const d = fr.map((f) => f.dt).sort((a, b) => a - b);
  const q = (p: number): number => d[Math.min(d.length - 1, Math.floor(p * d.length))] ?? 0;
  return {
    n: d.length,
    avg: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: d[d.length - 1] ?? 0,
  };
}
const line = (label: string, s: Stat): string =>
  `${label}: n ${s.n} avg ${fmt(s.avg)} p50 ${fmt(s.p50)} p95 ${fmt(s.p95)} p99 ${fmt(s.p99)} max ${fmt(s.max)} ms`;

function analyse(all: Frame[]): { text: string[]; B: Stat; C: Stat; A: Stat; json: unknown } {
  const part = (p: string): Frame[] => all.filter((f) => f.phase === p);
  const warm = (fr: Frame[]): Frame[] => fr.slice(WARM);
  const A = stat(warm(part("A")));
  const Bf = warm(part("B"));
  const Cf = warm(part("C"));
  const B = stat(Bf);
  const C = stat(Cf);
  const maxSurge = Math.max(1, ...Bf.map((f) => f.surge));
  const surgeS = stat(Bf.filter((f) => f.surge === maxSurge));
  const theft = stat(Cf.filter((f) => f.t >= THEFT[0] && f.t < THEFT[1]));
  const vortex = stat(Cf.filter((f) => f.t >= VORTEX[0] && f.t < VORTEX[1]));
  const worst = [...all]
    .sort((a, b) => b.dt - a.dt)
    .slice(0, 5)
    .map((f) => `${f.phase} t=${Math.round(f.t)} dt=${fmt(f.dt)}`);
  const text = [
    line("Part A", A),
    line("Part B", B),
    line(`Part B at max surge x${maxSurge}`, surgeS),
    line("Part C", C),
    line("Part C theft beats (14-22 s)", theft),
    line("Part C vortex + fog (30-43 s)", vortex),
    `worst frames: ${worst.join(" | ")}`,
  ];
  return {
    text,
    A,
    B,
    C,
    json: { A, B, C, maxSurge, surge: surgeS, theft, vortex, worst },
  };
}

function save(name: string, gpu: string, text: string[], json: unknown): void {
  const out = path.join(dir, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, `prologue-${name}.json`), JSON.stringify({ gpu, json }, null, 2));
  console.log(`PROLOGUE-PERF ${name}\n${text.join("\n")}`);
}

async function collect(page: Page): Promise<Frame[]> {
  const all: Frame[] = [];
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(1000);
    all.push(...(await drain(page)));
    const ps = await proState(page);
    if (!ps) break;
    if (await page.evaluate(() => window.__app?.route() === "story")) break;
    if (Date.now() - t0 > 12 * 60_000) break;
  }
  all.push(...(await drain(page)));
  return all;
}

const Q = "api=off&dev=1&onboard=1&wpm-bot=40&bot-seed=3&bot-acc=0.97";

test("tier 0: New Game -> A -> B (bot 40) -> C -> story -> calibrate -> L1, 0 console errors, p95 <= 16.8 ms in B and C", async ({
  page,
}) => {
  const run = await openApp(page, `${Q}&tier=0`);
  const gpu = await assertRealGpu(page);
  expect(await prologueFlag(page)).toBe(false);
  await pressStart(page);
  await waitProPhase(page, "A");
  await installProbe(page);
  const all = await collect(page);
  const r = analyse(all);
  save("tier0", gpu, r.text, r.json);
  await waitRoute(page, "story", 240_000);
  expect(await prologueFlag(page)).toBe(true);
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await waitRoute(page, "calibrate");
  await typeCalibration(page, 50);
  await page.waitForSelector(".calibrate[data-state=done]");
  await page.waitForTimeout(1600);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l01", undefined, {
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);
  const appErrs = await page.evaluate(() => window.__app?.consoleErrors ?? []);
  console.log(`PROLOGUE-PERF tier0 console errors ${run.errors.length}, in-app ${appErrs.length}`);
  expect(r.B.n, "Part B frames").toBeGreaterThan(600);
  expect(r.C.n, "Part C frames").toBeGreaterThan(600);
  expect(r.B.p95, "Part B p95").toBeLessThanOrEqual(BUDGET_T0);
  expect(r.C.p95, "Part C p95").toBeLessThanOrEqual(BUDGET_T0);
  expect(run.errors, run.errors.join("\n")).toEqual([]);
  expect(appErrs).toEqual([]);
});

test("tier 2 with 4x CPU throttle: p95 <= 22.2 ms (>= 45 fps) in B and C", async ({ page }) => {
  const run = await openApp(page, `${Q}&tier=2`);
  const gpu = await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "A");
  await installProbe(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const all = await collect(page);
  const r = analyse(all);
  save("tier2-4x", gpu, r.text, r.json);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect(r.B.n, "Part B frames").toBeGreaterThan(300);
  expect(r.C.n, "Part C frames").toBeGreaterThan(300);
  expect(r.B.p95, "Part B p95").toBeLessThanOrEqual(BUDGET_T2_THROTTLED);
  expect(r.C.p95, "Part C p95").toBeLessThanOrEqual(BUDGET_T2_THROTTLED);
  expect(run.errors, run.errors.join("\n")).toEqual([]);
});

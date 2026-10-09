import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

/**
 * T6.2 browser bot playtest: the real-time WPM bot plays ch1-l01 at 40 WPM (Average) and ch1-l05 at 20 WPM (Beginner).
 * Screenshots at key moments go to the gitignored __bot_shots__ folder. Asserts zero console errors and the outcome.
 *
 * Frame-time hook: the session records rAF-to-rAF deltas per sim phase; this spec reads the "combat" phase and asserts
 * p95 < FRAME_P95_MS when that env var is set. Unset (default) it only reports: headless SwiftShader numbers are not
 * meaningful, so set it on a GPU runner (e.g. FRAME_P95_MS=20).
 *   pnpm exec playwright test -c tests/level/playwright.config.ts botplaytest
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__bot_shots__", `${name}.png`);
const budget = process.env.FRAME_P95_MS === undefined ? null : Number(process.env.FRAME_P95_MS);

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=play&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 30_000 });
  return errors;
}

async function until(
  page: Page,
  cond: (p: PlayDebug) => boolean,
  timeout: number,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (src) => {
        const p = window.__play;
        // biome-ignore lint/security/noGlobalEval: test-only predicate shipped as source
        return p ? (0, eval)(`(${src})`)(p) : false;
      },
      cond.toString(),
      { timeout, polling: "raf" },
    );
    return true;
  } catch {
    return false;
  }
}

interface Case {
  name: string;
  level: string;
  wpm: number;
  acc: number;
  seed: number;
  minutes: number;
}

const CASES: Case[] = [
  { name: "l01-40wpm", level: "ch1-l01", wpm: 40, acc: 0.94, seed: 5, minutes: 6 },
  { name: "l05-20wpm", level: "ch1-l05", wpm: 20, acc: 0.88, seed: 7, minutes: 12 },
];

for (const c of CASES) {
  test(`bot playtest: ${c.level} at ${c.wpm} WPM clears with zero console errors`, async ({
    page,
  }) => {
    test.setTimeout(c.minutes * 60_000 + 60_000);
    const errors = await open(
      page,
      `level=${c.level}&wpm-bot=${c.wpm}&bot-acc=${c.acc}&bot-seed=${c.seed}`,
    );
    const shots: string[] = [];
    const snap = async (name: string): Promise<void> => {
      await page.screenshot({ path: shot(`${c.name}-${name}`) });
      shots.push(name);
    };

    if (await until(page, (p) => p.view().phase === "walk" && p.view().tick > 90, 30_000))
      await snap("walk");
    expect(
      await until(page, (p) => p.view().phase === "combat" && p.view().plates.length >= 1, 120_000),
    ).toBe(true);
    await snap("battle");
    if (await until(page, (p) => p.view().plates.some((pl) => pl.kind === "guard"), 180_000))
      await snap("guard");
    if (await until(page, (p) => (p.seen().AutoAttack ?? 0) > 0, 180_000)) await snap("autoattack");
    if (await until(page, (p) => (p.seen().Break ?? 0) > 0, 240_000)) await snap("break");

    // combat frame times, sampled before the level ends
    const frames = await page.evaluate(() => (window.__play as PlayDebug).perf("combat"));

    await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
      timeout: c.minutes * 60_000,
      polling: 1000,
    });
    await snap("results");

    const end = await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      return {
        outcome: p.result()?.outcome ?? null,
        reason: p.result()?.failReason ?? null,
        title: document.querySelector("#r-title")?.textContent ?? null,
        time: document.querySelector("#r-time")?.textContent ?? null,
        perf: p.perf("combat"),
        errors: p.consoleErrors,
      };
    });
    console.log(
      `BOTPLAY ${c.level} @${c.wpm}WPM: outcome=${end.outcome} (${end.title}, ${end.time}); shots=${shots.join(",")}; ` +
        `combat frames=${end.perf.frames} avg=${end.perf.avgMs.toFixed(1)}ms p95=${end.perf.p95Ms.toFixed(1)}ms ` +
        `max=${end.perf.maxMs.toFixed(1)}ms (mid-run sample: ${frames.frames} frames, p95=${frames.p95Ms.toFixed(1)}ms); ` +
        `budget=${budget === null ? "report-only" : `${budget}ms`}`,
    );

    expect(errors, errors.join("\n")).toEqual([]);
    expect(end.errors).toEqual([]);
    expect(end.outcome, `fail reason: ${end.reason}`).toBe("cleared");
    expect(end.perf.frames).toBeGreaterThan(30);
    if (budget !== null) expect(end.perf.p95Ms).toBeLessThan(budget);
  });
}

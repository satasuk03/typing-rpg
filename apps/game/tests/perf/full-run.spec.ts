import { expect, test } from "@playwright/test";
import { assertRealGpu, openLevel, playUrl, watchErrors } from "./helpers";

/**
 * T6.4 zero console errors over a full Chapter 1 run: ch1-l01 .. ch1-l10 with the 75 WPM bot in ONE browser page
 * (PlaySession.next() loads each next level, as the results screen does). Asserts 0 console errors, 0 page errors,
 * 0 unhandled rejections (the in-page `__play.consoleErrors` too) and that every level reached a result.
 * Outcomes (cleared/failed) are reported; the bot is a model, not a guarantee of a clear.
 */
const LEVELS = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

test("full Ch1 run L1-L10 at 75 WPM: zero console errors", async ({ page }) => {
  test.setTimeout(75 * 60_000);
  const errors = watchErrors(page);
  const outcomes: string[] = [];
  const first = LEVELS[0] ?? "ch1-l01";
  await openLevel(page, playUrl(first, { tier: 0, wpm: 75, seed: 21, acc: 0.97 }));
  await assertRealGpu(page);

  for (let i = 0; i < LEVELS.length; i++) {
    const id = LEVELS[i];
    const cfg = await page.evaluate(() => window.__play?.config().levelId);
    expect(cfg).toBe(id);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__play?.result() !== null, undefined, {
      timeout: 15 * 60_000,
      polling: 1000,
    });
    const res = await page.evaluate(() => {
      const r = window.__play?.result();
      return { outcome: r?.outcome, reason: r?.failReason, ticks: r?.durationTicks };
    });
    const inPage = await page.evaluate(() => window.__play?.consoleErrors ?? []);
    outcomes.push(`${id}: ${res.outcome}${res.reason ? `(${res.reason})` : ""} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(`FULLRUN ${outcomes.at(-1)}`);
    expect(inPage, `in-page errors on ${id}`).toEqual([]);
    const next = LEVELS[i + 1];
    if (!next) break;
    // Wait for the results screen, then load the next level the way the UI does (the bot keeps its WPM/seed in the URL).
    await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
      timeout: 30_000,
    });
    await page.goto(playUrl(next, { tier: 0, wpm: 75, seed: 21 + i + 1, acc: 0.97 }));
    await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 60_000 });
  }
  console.log(`FULLRUN SUMMARY\n${outcomes.join("\n")}`);
  expect(errors.list, errors.list.join("\n")).toEqual([]);
  expect(outcomes.length).toBe(LEVELS.length);
});

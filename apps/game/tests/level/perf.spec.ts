import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

/**
 * Indicative frame times during the L5 battle (bot at 60 WPM) at quality tier 0 and tier 2.
 * Headless Chromium uses SwiftShader (software GL), so absolute numbers are far worse than a GPU.
 * rAF-to-rAF deltas are recorded per sim phase by the play session.
 */
for (const tier of [0, 2]) {
  test(`perf: L5 battle frame times at tier ${tier}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`/?scene=play&level=ch1-l05&wpm-bot=60&tier=${tier}&bot-seed=3`);
    await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 30_000 });
    await page.waitForFunction(
      () => (window.__play as PlayDebug).perf("combat").frames >= 150,
      undefined,
      {
        timeout: 180_000,
        polling: 1000,
      },
    );
    const stats = await page.evaluate(() => (window.__play as PlayDebug).perf("combat"));
    console.log(
      `PERF tier ${tier}: frames=${stats.frames} avg=${stats.avgMs.toFixed(1)}ms p95=${stats.p95Ms.toFixed(1)}ms max=${stats.maxMs.toFixed(1)}ms`,
    );
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

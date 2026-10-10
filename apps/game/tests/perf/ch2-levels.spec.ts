import { expect, test } from "@playwright/test";
import { assertRealGpu, openLevel, playUrl, watchErrors } from "./helpers";

/**
 * T5.2 browser bot over Ch2 levels (real app route `?scene=play&wpm-bot=`): ch2-l01, ch2-l05 and ch2-l10 (the Whispering
 * Willow: all three phases, the Hush Spells, the riddles and the finisher). The wpm-bot sends capitals directly (the
 * sim reads `event.key`, so "H" needs no Shift event), so exact-case sentence plates are typeable. Asserts 0 console
 * errors, 0 page errors, 0 in-page errors and that the level reached its results screen. The outcome (cleared/failed) is
 * reported, not asserted: the bot is a model of a typist, not a guarantee of a clear.
 */
for (const id of ["ch2-l01", "ch2-l05", "ch2-l10"]) {
  test(`${id} at 75 WPM: reaches results, zero console errors`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const errors = watchErrors(page);
    await openLevel(page, playUrl(id, { tier: 0, wpm: 75, seed: 21, acc: 0.97 }));
    await assertRealGpu(page);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
      timeout: 15 * 60_000,
      polling: 500,
    });
    const res = await page.evaluate(() => {
      const r = window.__play?.result();
      return { outcome: r?.outcome, reason: r?.failReason, ticks: r?.durationTicks };
    });
    const inPage = await page.evaluate(() => window.__play?.consoleErrors ?? []);
    console.log(
      `CH2BOT ${id}: ${res.outcome}${res.reason ? `(${res.reason})` : ""} ${((Date.now() - t0) / 1000).toFixed(0)}s, console errors ${errors.list.length}, in-page ${inPage.length}`,
    );
    expect(inPage, `in-page errors on ${id}`).toEqual([]);
    expect(errors.list, errors.list.join("\n")).toEqual([]);
  });
}

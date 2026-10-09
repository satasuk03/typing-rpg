/**
 * AC (d): play L1 and L2 with the bot (real time), reload, and progress, gold and stars persist (IndexedDB through
 * `net.sync.setLocal`). Also checks the writer on a real result: gold, SRS, journal, levelsPlayed, lifetime.
 */
import { test } from "@playwright/test";
import { expect, openApp, save, waitRoute } from "./helpers";

test.setTimeout(20 * 60_000);

test("save survives a reload after L2", async ({ page }) => {
  const run = await openApp(page, "api=off&audio=0&dev=1&wpm-bot=75&bot-seed=3&bot-acc=0.97");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  for (const id of ["ch1-l01", "ch1-l02"]) {
    await page.waitForFunction((w) => document.activeElement?.getAttribute("data-id") === w, id);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (lv) => window.__play?.config().levelId === lv && window.__play.resultsShown(),
      id,
      { timeout: 600_000, polling: 500 },
    );
    expect(await page.locator("#r-title").textContent()).toBe("LEVEL CLEAR");
    await page.keyboard.press("Enter");
    await waitRoute(page, "map");
  }
  const before = await save(page);
  expect(before.progress.levels["ch1-l01"]?.cleared).toBe(true);
  expect(before.progress.levels["ch1-l02"]?.cleared).toBe(true);
  expect(before.wallet.gold).toBeGreaterThan(0);
  expect(before.srs.levelsPlayed).toBe(2);
  expect(Object.keys(before.journal.firstSeen).length).toBeGreaterThan(5);
  expect(before.lifetime.words).toBeGreaterThan(10);
  await page.waitForTimeout(500);

  await page.reload();
  await waitRoute(page, "title");
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=continue]").textContent()).toBe("Continue");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  const after = await save(page);
  expect(after.wallet.gold).toBe(before.wallet.gold);
  expect(after.progress.levels).toEqual(before.progress.levels);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.cachePity).toEqual(before.cachePity);
  const starsOnMap = await page
    .locator('.node[data-id="ch1-l01"] .nstars')
    .getAttribute("data-stars");
  expect(Number(starsOnMap)).toBe(before.progress.levels["ch1-l01"]?.stars.filter(Boolean).length);
  expect(await page.locator('.node[data-id="ch1-l02"]').getAttribute("class")).toContain("cleared");
  expect(await page.locator('.node[data-id="ch1-l03"]').getAttribute("class")).toContain("new");
  expect(run.errors).toEqual([]);
});

/**
 * New Game: a seeded mid-game profile is erased from the title screen and does not come back after a reload
 * (the local IndexedDB save is reset, not just the in-memory copy). Offline (`api=off`); the cloud tombstone path is
 * covered by the net e2e and `tests/net/saveSync.test.ts`.
 */
import { test } from "@playwright/test";
import { expect, openApp, save, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

const Q = "api=off&audio=0&dev=1";

test("New Game erases progress and it stays gone after a reload", async ({ page }) => {
  const run = await openApp(page, Q);
  await seedProgress(page, { cleared: 3, caches: 2, gold: 4321 });
  await page.waitForTimeout(600); // let the debounced IndexedDB write land

  // reload: the seeded profile survives, so the title offers Continue + New game
  await page.reload();
  await waitRoute(page, "title");
  const seeded = await save(page);
  expect(seeded.wallet.gold).toBe(4321);
  expect(Object.keys(seeded.progress.levels)).toHaveLength(3);

  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=continue]").textContent()).toBe("Continue");
  await page.locator("[data-act=new]").focus();
  await page.keyboard.press("Enter");
  await page.locator("[data-act=erase]").focus();
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");

  const fresh = await save(page);
  expect(fresh.wallet.gold).not.toBe(4321);
  expect(Object.keys(fresh.progress.levels)).toHaveLength(0);
  expect(fresh.inventory.unopenedCaches).toBe(0);
  await page.waitForTimeout(600);

  // reload: the old progress must not resurrect
  await page.reload();
  await waitRoute(page, "title");
  const after = await save(page);
  expect(after.wallet.gold).toBe(fresh.wallet.gold);
  expect(after.wallet.gold).not.toBe(4321);
  expect(Object.keys(after.progress.levels)).toHaveLength(0);
  expect(after.inventory.unopenedCaches).toBe(0);
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=continue]").textContent()).toBe("Start game");
  expect(await page.locator("[data-act=new]").count()).toBe(0);
  expect(run.errors).toEqual([]);
});

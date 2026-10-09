/**
 * AC (c): open a cache, the odds dialog shows the published odds (effective Legendary 1.54%) and the pity rules, and the
 * pity counters update after an open.
 */
import { test } from "@playwright/test";
import { expect, openApp, save, shot, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

const left = (page: import("@playwright/test").Page, k: string): Promise<number> =>
  page.evaluate(
    (key) => Number(document.querySelector(`#pity-${key}`)?.getAttribute("data-left")),
    k,
  );

test("cache opening: odds dialog, pity counters, reveal", async ({ page }) => {
  const run = await openApp(page);
  await seedProgress(page, { cleared: 2, caches: 2, gold: 5000 });
  await page.goto("/?api=off&audio=0&dev=1&screen=cache");
  await waitRoute(page, "cache");

  // the odds dialog, rendered from publishedCacheOdds()
  await page.locator("[data-key=odds]").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#odds-dialog");
  const eff = await page.locator('#odds-dialog tr[data-r="L"] td.eff').textContent();
  expect(eff?.trim()).toBe("1.54%");
  const rows = await page.locator("#odds-dialog .odds-t tbody tr").count();
  expect(rows).toBe(5);
  expect(await page.locator("#odds-slot").textContent()).toContain("33.34%");
  const arch = await page.locator("#odds-arch").textContent();
  expect(arch).toContain("40.00%");
  expect(arch).toContain("20.00%");
  const pity = (await page.locator("#odds-pity").textContent()) ?? "";
  expect(pity).toContain("8");
  expect(pity).toContain("30");
  expect(pity).toContain("120");
  await page.screenshot({ path: shot("07b-cache-odds") });
  await page.keyboard.press("Escape");

  // pity counters: the seeded profile has 3 / 11 / 47 opens since -> within 5 / 19 / 73
  expect(await left(page, "rare")).toBe(5);
  expect(await left(page, "epic")).toBe(19);
  expect(await left(page, "legendary")).toBe(73);

  // open one
  await page.locator("[data-key=open]").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#rv-card", { timeout: 10_000 });
  const rarity = (await page.locator("#rv-card").getAttribute("data-rarity")) as string;
  const want = {
    C: [4, 18, 72],
    U: [4, 18, 72],
    R: [8, 18, 72],
    E: [8, 30, 72],
    L: [8, 30, 120],
  }[rarity] as number[];
  expect([
    await left(page, "rare"),
    await left(page, "epic"),
    await left(page, "legendary"),
  ]).toEqual(want);
  const s = await save(page);
  expect(s.inventory.unopenedCaches).toBe(1);
  expect(s.cachePity.sinceLegendary).toBe(rarity === "L" ? 0 : 48);
  expect(s.inventory.gear.length).toBe(10); // 3 starters + 6 seeded + the new piece
  await page.screenshot({ path: shot("07d-cache-reveal") });

  // open the second one; the counters advance again
  await page.keyboard.press("ArrowRight");
  await page.locator("[data-key=rv-again]").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector("#count")?.textContent === "0",
    undefined,
    {
      timeout: 10_000,
    },
  );
  await page.waitForSelector("#rv-card");
  const s2 = await save(page);
  expect(s2.inventory.unopenedCaches).toBe(0);
  expect(s2.cachePity.sinceLegendary === 49 || s2.cachePity.sinceLegendary <= 1).toBe(true);
  expect(run.errors).toEqual([]);
});

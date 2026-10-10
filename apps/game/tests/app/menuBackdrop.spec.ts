/**
 * Menu backdrop is chapter-aware: Ch2 contexts show the Hushwood, Ch1 contexts the Ch1 forest.
 * Asserts the backdrop level per screen and measures the swap time. With STILLS_DIR set it also writes stills
 * (JPEG) of the Ch2 map, intro card, unlock moment, loadout hint and the Ch1 map (run on Metal with
 * playwright.metal.config.ts; the default SwiftShader run only asserts).
 * BEFORE=1 skips the chapter assertions (to capture the old behaviour for before/after stills).
 */
import fs from "node:fs";
import path from "node:path";
import { type Page, test } from "@playwright/test";
import type { AppDebug } from "../../src/app/app";
import type { DevHooks } from "../../src/app/boot";
import { expect, openApp, toMap, waitRoute } from "./helpers";

const OUT = process.env.STILLS_DIR;
const BEFORE = process.env.BEFORE === "1";
const still = async (page: Page, name: string): Promise<void> => {
  if (!OUT) return;
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 72 });
};
const ch1 = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);
type Priv = { backdrop: { levelId: string } | null; lastBackdropSwapMs: number };
const bgLevel = (page: Page) =>
  page.evaluate(() => ((window.__app as AppDebug).app as unknown as Priv).backdrop?.levelId);
const swapMs = (page: Page) =>
  page.evaluate(() => ((window.__app as AppDebug).app as unknown as Priv).lastBackdropSwapMs);
const expectBg = async (page: Page, id: string): Promise<void> => {
  if (!BEFORE) expect(await bgLevel(page)).toBe(id);
};

test("menu backdrop follows the chapter", async ({ page }) => {
  const run = await openApp(page, "api=off&audio=0&dev=1");
  await page.evaluate((ids) => {
    (window as unknown as { __dev: DevHooks }).__dev.mutate((s) => {
      for (const id of ids)
        s.progress.levels[id] = {
          cleared: true,
          stars: [true, true, false],
          bestTicks: 9,
          attempts: 1,
        };
      s.progress.frontierChapter = 2;
      s.unlocks.actives.push("aegis");
    });
  }, ch1);
  await expectBg(page, "ch1-l01"); // title
  await toMap(page);
  await page.evaluate(() => window.__app?.app.go("map", { chapter: 1, focus: "tab" }));
  await waitRoute(page, "map");
  await expectBg(page, "ch1-l01");
  await still(page, "ch1-map");

  // tab to Chapter II, with the real keys
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await expectBg(page, "ch2-l01");
  const swaps = [await swapMs(page)];
  await still(page, "ch2-map");
  // hub screens inherit the chapter
  await page.evaluate(() => window.__app?.app.go("loadout", {}));
  await waitRoute(page, "loadout");
  await expectBg(page, "ch2-l01");
  await still(page, "ch2-loadout");
  await page.evaluate(() => window.__app?.app.go("inventory", {}));
  await waitRoute(page, "inventory");
  await expectBg(page, "ch2-l01");
  // back and forth between the tabs
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__app?.app.go("map", { chapter: 1, focus: "tab" }));
    await waitRoute(page, "map");
    await expectBg(page, "ch1-l01");
    swaps.push(await swapMs(page));
    await page.evaluate(() => window.__app?.app.go("map", { chapter: 2, focus: "tab" }));
    await waitRoute(page, "map");
    await expectBg(page, "ch2-l01");
    swaps.push(await swapMs(page));
  }
  console.log("BACKDROP_SWAP_MS", JSON.stringify(swaps.map((x) => Math.round(x))));
  if (OUT) fs.writeFileSync(path.join(OUT, "swap-ms.json"), JSON.stringify(swaps));

  // the unlock moment: Ch1 complete stays Ch1, "Enter Chapter II" lands on the Hushwood
  await page.evaluate(() => window.__app?.app.go("complete", { chapter: 1 }));
  await waitRoute(page, "complete");
  await expectBg(page, "ch1-l01");
  await still(page, "ch1-complete-unlock");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await expectBg(page, "ch2-l01");
  await still(page, "ch2-unlock-after-click");

  // intro card
  await page.keyboard.press("Enter");
  await waitRoute(page, "intro");
  await expectBg(page, "ch2-l01");
  await still(page, "ch2-intro-card");

  // the L10 loadout hint, from the Ch2 map
  await page.evaluate(() => window.__app?.app.go("map", { chapter: 2, focus: "ch2-l10" }));
  await waitRoute(page, "map");
  await page.evaluate(() => {
    void window.__app?.app.play("ch2-l10");
  });
  await page.waitForSelector(".willow-hint");
  await expectBg(page, "ch2-l01");
  await still(page, "ch2-l10-loadout-hint");

  // title goes back to the Ch1 forest
  await page.evaluate(() => window.__app?.app.go("title", {}));
  await waitRoute(page, "title");
  await expectBg(page, "ch1-l01");
  expect(run.errors.filter((e) => !/WebGL/i.test(e))).toEqual([]);
});

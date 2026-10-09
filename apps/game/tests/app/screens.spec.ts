/**
 * One 1280x720 still per screen (apps/game/tests/app/__shots__), taken by driving the screens with the keyboard.
 * Also asserts the basics each screen must show. No console errors anywhere.
 */
import { devices, test } from "@playwright/test";
import { expect, openApp, settle, shot, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

test("a still of every screen", async ({ page }) => {
  const run = await openApp(page);
  await settle(page, 900);
  await page.screenshot({ path: shot("01-title-press") });

  await seedProgress(page, { cleared: 4 });
  await page.waitForTimeout(300);
  await page.reload();
  await waitRoute(page, "title");
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await settle(page, 700);
  await page.screenshot({ path: shot("02-title-menu") });

  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await settle(page, 900);
  await page.screenshot({ path: shot("03-map") });
  // a locked node + the boss node detail
  await page.locator('.node[data-id="ch1-l10"]').focus();
  await settle(page, 250);
  await page.screenshot({ path: shot("03b-map-boss-locked") });
  await page.locator('.node[data-id="ch1-l05"]').focus();

  const hub = async (act: string): Promise<void> => {
    await page.locator(`#menu [data-act=${act}]`).focus();
    await page.keyboard.press("Enter");
  };
  const back = async (): Promise<void> => {
    await page.keyboard.press("Escape");
    await waitRoute(page, "map");
  };

  await hub("loadout");
  await waitRoute(page, "loadout");
  await settle(page, 700);
  await page.screenshot({ path: shot("04-loadout") });
  await page.locator('[data-key="a-0"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".app-pick");
  await settle(page, 300);
  await page.screenshot({ path: shot("04b-loadout-picker") });
  await page.keyboard.press("Escape");
  await back();

  await hub("inventory");
  await waitRoute(page, "inventory");
  await settle(page, 600);
  await page.locator('#items .hd-item[data-uid="4"]').focus();
  await settle(page, 300);
  await page.screenshot({ path: shot("05-inventory") });
  await back();

  await hub("shop");
  await waitRoute(page, "shop");
  await settle(page, 600);
  await page.screenshot({ path: shot("06-shop") });
  await back();

  await hub("cache");
  await waitRoute(page, "cache");
  await settle(page, 700);
  await page.screenshot({ path: shot("07-cache-idle") });
  await page.locator("[data-key=odds]").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#odds-dialog");
  await settle(page, 300);
  await page.screenshot({ path: shot("07b-cache-odds") });
  await page.keyboard.press("Escape");
  await page.locator("[data-key=open]").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(950);
  await page.screenshot({ path: shot("07c-cache-opening") });
  await page.waitForSelector("#rv-card", { timeout: 8000 });
  await settle(page, 700);
  await page.screenshot({ path: shot("07d-cache-reveal") });
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  await hub("journal");
  await waitRoute(page, "journal");
  await settle(page, 600);
  await page.screenshot({ path: shot("08-journal") });
  await back();

  await page.goto("/?api=off&dev=1&screen=settings");
  await waitRoute(page, "settings");
  await settle(page, 600);
  await page.screenshot({ path: shot("09-settings") });

  expect(run.errors).toEqual([]);
});

test("chapter complete screen", async ({ page }) => {
  const run = await openApp(page);
  await seedProgress(page, { cleared: 10, gold: 5200, caches: 0, words: 60 });
  await page.waitForTimeout(300);
  await page.goto("/?api=off&audio=0&dev=1&screen=complete");
  await waitRoute(page, "complete");
  await settle(page, 900);
  await page.screenshot({ path: shot("10-chapter-complete") });
  expect(run.errors).toEqual([]);
});

test("touch-device block screen", async ({ browser }) => {
  const ctx = await browser.newContext({
    ...devices["iPad Pro 11 landscape"],
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForSelector("#touch-block");
  await expect(page.locator("#touch-block h1")).toHaveText("KEYBOARD REQUIRED");
  // no game behind it
  expect(await page.locator("#app-ui").count()).toBe(0);
  await page.waitForTimeout(900);
  await page.screenshot({ path: shot("11-touch-block") });
  await ctx.close();
});

/**
 * @capture T6.3 polish round 2 (H2) screen stills: title, map, and a Rare-or-better cache reveal (beam colour).
 * Output dir: H2_OUT (default tests/app/__shots__).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { openApp, settle, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.H2_OUT ?? path.join(dir, "__shots__");
const shot = (name: string): string => path.join(out, `${name}.png`);
test.setTimeout(240_000);

test("@capture title, map, rare cache reveal", async ({ page }) => {
  await openApp(page);
  await seedProgress(page, { cleared: 4, caches: 2, gold: 5000 });
  await page.waitForTimeout(300);
  await page.reload();
  await waitRoute(page, "title");
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await settle(page, 700);
  await page.screenshot({ path: shot("h2-title") });
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await settle(page, 900);
  await page.screenshot({ path: shot("h2-map") });

  // Rare is one open away (pity), so the beam is blue
  await page.evaluate(() => {
    const dev = (window as unknown as { __dev: { mutate(fn: (s: never) => void): void } }).__dev;
    dev.mutate(((s: { cachePity: { sinceRare: number } }) => {
      s.cachePity.sinceRare = 99;
    }) as never);
  });
  await page.goto("/?api=off&audio=0&dev=1&screen=cache");
  await waitRoute(page, "cache");
  await page.locator("[data-key=open]").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#rv-card", { timeout: 10_000 });
  await settle(page, 900);
  await page.screenshot({ path: shot("h2-cache-reveal-rare") });
});

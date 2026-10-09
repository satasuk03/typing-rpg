/**
 * AC (a): a fresh profile plays all of Chapter 1 from the title screen to the chapter-complete screen, with the browser
 * bot (the same synthetic-key path a human uses) at 75 WPM. Every level runs in REAL time (no accelerated mode).
 */
import { contentBundle } from "@hd2d/content";
import { test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { expect, openApp, save, shot, waitRoute } from "./helpers";

test.setTimeout(60 * 60_000);

test("Chapter 1 from the title screen to chapter complete (bot, 75 WPM, real time)", async ({
  page,
}) => {
  const run = await openApp(page, "api=off&audio=0&dev=1&wpm-bot=75&bot-seed=7&bot-acc=0.97");
  await page.keyboard.press("Space"); // title: any key
  await page.waitForSelector("#menu:not([hidden])");
  await page.screenshot({ path: shot("20-fresh-title-menu") });
  await page.keyboard.press("Enter"); // Start game
  await waitRoute(page, "map");
  const ids = contentBundle.levels.map((l) => l.id);
  const log: string[] = [];

  for (const [i, id] of ids.entries()) {
    // the map focuses the next open level; Enter starts it
    await page.waitForFunction(
      (want) => document.activeElement?.getAttribute("data-id") === want,
      id,
      { timeout: 20_000 },
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
      timeout: 60_000,
    });
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      if (id === "ch1-l10" && attempt === 0) {
        const intro = await page
          .waitForFunction(
            (lv) => {
              const p = window.__play;
              return p?.config().levelId === lv && p.view().phase === "bossIntro";
            },
            id,
            { timeout: 600_000, polling: 100 },
          )
          .then(() => true)
          .catch(() => false);
        if (intro) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: shot("21-boss-intro-card") });
        }
      }
      await page.waitForFunction(
        (lv) => {
          const p = window.__play;
          return p?.config().levelId === lv && p.resultsShown();
        },
        id,
        { timeout: 900_000, polling: 500 },
      );
      const info = await page.evaluate(() => {
        const p = window.__play as PlayDebug;
        return {
          outcome: p.result()?.outcome,
          title: document.querySelector("#r-title")?.textContent,
          stars: document.querySelectorAll("#r-stars .on").length,
          banners: p.session.hud.banners.banners.length,
        };
      });
      log.push(`${id}: ${info.outcome} stars=${info.stars}`);
      // the LEVEL CLEAR banner must be gone while the results panel is open
      expect(info.banners).toBe(0);
      if (id === "ch1-l01" && attempt === 0) await page.screenshot({ path: shot("22-results-l1") });
      if (info.outcome === "cleared") {
        cleared = true;
        await page.keyboard.press("Enter"); // Continue
      } else {
        await page.keyboard.press("Enter"); // Try again (restart: a fresh config from the save)
        await page.waitForFunction(() => window.__play?.resultsShown() === false, undefined, {
          timeout: 20_000,
        });
      }
    }
    expect(cleared, `${id} cleared`).toBe(true);
    if (i < ids.length - 1) await waitRoute(page, "map");
  }

  await waitRoute(page, "complete");
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot("23-chapter-complete-after-run") });
  const s = await save(page);
  console.log(log.join("\n"));
  for (const id of ids) expect(s.progress.levels[id]?.cleared, id).toBe(true);
  expect(s.wallet.gold).toBeGreaterThan(0);
  expect(s.srs.levelsPlayed).toBeGreaterThanOrEqual(ids.length);
  expect(Object.keys(s.journal.firstSeen).length).toBeGreaterThan(20);
  expect(await page.locator("#comp-title").textContent()).toBe("CHAPTER COMPLETE");
  const consoleErrors = await page.evaluate(() => window.__app?.consoleErrors ?? []);
  expect(consoleErrors).toEqual([]);
  expect(run.errors).toEqual([]);
});

/**
 * T5.2 opt-in (NOT in check.sh, long): a fresh profile plays Ch1 L1-L10 -> the Chapter II unlock moment -> the Ch2 intro
 * card (typed with real Shift presses) -> Ch2 L1-L10 in ONE browser session on the real save, with the 75 WPM bot, in
 * real time, on the real GPU (perf config). Asserts every level was cleared (retrying a failed attempt like a player,
 * at most 3 tries), the save holds all 20 clears, 0 console errors, 0 page errors, 0 unhandled rejections.
 *
 *   cd apps/game && PERF_PORT=5473 ./node_modules/.bin/playwright test -c tests/perf/playwright.config.ts full-ch1-ch2
 */
import { contentBundle } from "@hd2d/content";
import { expect, test } from "@playwright/test";
import { openApp, save, waitRoute } from "../app/helpers";
import { assertRealGpu } from "./helpers";

test("full Ch1 -> Ch2 run (bot 75 WPM, fresh profile, real save): zero console errors", async ({
  page,
}) => {
  test.setTimeout(150 * 60_000);
  const wall0 = Date.now();
  const run = await openApp(page, "api=off&audio=0&dev=1&wpm-bot=75&bot-seed=7&bot-acc=0.97");
  await assertRealGpu(page);
  await page.keyboard.press("Space"); // title: any key
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter"); // Start game
  await waitRoute(page, "map");

  const ch1 = contentBundle.levels.filter((l) => l.chapter === 1).map((l) => l.id);
  const ch2 = contentBundle.levels.filter((l) => l.chapter === 2).map((l) => l.id);
  expect(ch1).toHaveLength(10);
  expect(ch2).toHaveLength(10);
  const log: string[] = [];

  /** The Ch2 intro card: type every line, capitals with Shift held (what a player does). */
  const typeIntro = async (): Promise<void> => {
    await waitRoute(page, "intro");
    for (let line = 0; line < 3; line++) {
      const text = ((await page.locator("#intro-line").getAttribute("aria-label")) ?? "").slice(6);
      expect(text.length).toBeGreaterThan(0);
      for (const ch of text) {
        if (ch >= "A" && ch <= "Z") {
          await page.keyboard.down("Shift");
          await page.keyboard.press(ch);
          await page.keyboard.up("Shift");
        } else await page.keyboard.press(ch);
      }
    }
    await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
      timeout: 15_000,
    });
  };

  const playLevel = async (id: string): Promise<void> => {
    const t0 = Date.now();
    await page.waitForFunction(
      (want) => document.activeElement?.getAttribute("data-id") === want,
      id,
      { timeout: 30_000 },
    );
    await page.keyboard.press("Enter");
    if (id === "ch2-l01") {
      await typeIntro();
      log.push("ch2 intro card typed (first visit)");
    }
    await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
      timeout: 60_000,
    });
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      await page.waitForFunction(
        (lv) => window.__play?.config().levelId === lv && window.__play.resultsShown(),
        id,
        { timeout: 900_000, polling: 500 },
      );
      const outcome = await page.evaluate(() => window.__play?.result()?.outcome);
      log.push(`${id}: ${outcome} (try ${attempt + 1}) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      console.log(`FULLRUN2 ${log.at(-1)}`);
      await page.keyboard.press("Enter"); // Continue, or Try again
      if (outcome === "cleared") cleared = true;
      else
        await page.waitForFunction(() => window.__play?.resultsShown() === false, undefined, {
          timeout: 20_000,
        });
    }
    expect(cleared, `${id} cleared`).toBe(true);
  };

  for (const id of ch1) {
    await playLevel(id);
    if (id !== "ch1-l10") await waitRoute(page, "map");
  }

  // the unlock moment
  await waitRoute(page, "complete");
  await expect(page.locator("#comp-title")).toHaveText("CHAPTER COMPLETE");
  await expect(page.locator("#comp-unlock")).toContainText("Chapter II");
  log.push("ch1 complete: Chapter II unlock shown");
  await page.keyboard.press("Enter"); // Next chapter
  await waitRoute(page, "map");
  expect(await page.locator('.ch-tab[data-n="2"]').getAttribute("aria-selected")).toBe("true");

  for (const id of ch2) {
    await playLevel(id);
    if (id !== "ch2-l10") await waitRoute(page, "map");
  }

  await waitRoute(page, "complete");
  await page.waitForTimeout(800); // IndexedDB write
  const s = await save(page);
  for (const id of [...ch1, ...ch2]) expect(s.progress.levels[id]?.cleared, id).toBe(true);
  expect(s.journal.firstSeen["#intro:ch2"]).toBeDefined();
  const wall = ((Date.now() - wall0) / 60_000).toFixed(1);
  console.log(`FULLRUN2 SUMMARY (wall ${wall} min)\n${log.join("\n")}`);
  const consoleErrors = await page.evaluate(() => window.__app?.consoleErrors ?? []);
  expect(consoleErrors).toEqual([]);
  expect(run.errors).toEqual([]);
});

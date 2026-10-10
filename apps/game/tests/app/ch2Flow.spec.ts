/**
 * T3.4, keyboard only: map chapter tabs (locked then unlocked, via the dev `ch2stub=1` bundle), the Ch1-complete unlock
 * moment, the "Ignore capitals" setting, and the Ch2 intro card (typed on the first visit, skipped on the second).
 * Stills go to docs/qa/ch2-t3.4/ (JPEG). Setup that is not the feature under test (clearing Ch1 in the save) uses the
 * dev hooks; every interaction under test is a key press.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import type { DevHooks } from "../../src/app/boot";
import { expect, focused, openApp, route, save, toMap, waitRoute } from "./helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(dir, "../../../../docs/qa/ch2-t3.4");
const still = async (page: Page, name: string): Promise<void> => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 80 });
};
const ch1 = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

const clearCh1 = (page: Page) =>
  page.evaluate((ids) => {
    (window as unknown as { __dev: DevHooks }).__dev.mutate((s) => {
      for (const id of ids)
        s.progress.levels[id] = {
          cleared: true,
          stars: [true, true, false],
          bestTicks: 9,
          attempts: 1,
        };
      s.progress.frontierChapter = 2; // what a real L10 result does (frontierChapterOf)
    });
  }, ch1);

/** Re-draw the map from the current save (test setup only). */
const redrawMap = (page: Page, arg: Record<string, unknown>) =>
  page.evaluate((a) => window.__app?.app.go("map", a), arg);

const pressUntil = async (page: Page, key: string, key2: string, max = 14): Promise<void> => {
  for (let i = 0; i < max; i++) {
    if ((await focused(page)) === key2) return;
    await page.keyboard.press(key);
  }
  expect(await focused(page)).toBe(key2);
};

test("Ch2 flow, keyboard only", async ({ page }) => {
  const run = await openApp(page, "api=off&audio=0&dev=1&ch2stub=1");
  await toMap(page);

  // ---- map tabs: locked
  await expect(page.locator(".ch-tab")).toHaveCount(2);
  expect(await page.locator('.ch-tab[data-n="1"]').getAttribute("aria-selected")).toBe("true");
  await page.keyboard.press("ArrowUp"); // node -> tab strip
  await expect.poll(() => focused(page)).toBe("tab-1");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toBe("tab-2");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  expect(await page.locator('.ch-tab[data-n="2"]').getAttribute("aria-selected")).toBe("true");
  await expect.poll(() => focused(page)).toBe("tab-2");
  await expect(page.locator("#ch-notice")).toContainText("Clear Level 10");
  expect(await page.locator(".node.locked").count()).toBe(10);
  await still(page, "01-map-ch2-locked");
  // Enter on a locked level only toasts
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  expect(await route(page)).toBe("map");

  // ---- Ch1 cleared: Ch2 opens
  await clearCh1(page);
  await redrawMap(page, { chapter: 1, focus: "tab" });
  await waitRoute(page, "map");
  await expect.poll(() => focused(page)).toBe("tab-1");
  await still(page, "02-map-ch1-tabs-ch2-unlocked");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  expect(await page.locator("#ch-notice").count()).toBe(0);
  expect(await page.locator('.node[data-id="ch2-l01"]').getAttribute("class")).toContain("new");
  await still(page, "03-map-ch2-open");
  // Left goes back to Chapter I
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  expect(await page.locator('.ch-tab[data-n="1"]').getAttribute("aria-selected")).toBe("true");

  // ---- the unlock moment on the chapter-complete screen
  await page.evaluate(() => window.__app?.app.go("complete", { chapter: 1 }));
  await waitRoute(page, "complete");
  await expect(page.locator("#comp-unlock")).toContainText("Chapter II");
  await expect.poll(() => focused(page)).toBe("next-chapter");
  await still(page, "04-chapter-complete-unlock");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  expect(await page.locator('.ch-tab[data-n="2"]').getAttribute("aria-selected")).toBe("true");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-id")))
    .toBe("ch2-l01");

  // ---- settings: Ignore capitals
  await page.keyboard.press("ArrowDown"); // to the hub menu
  await pressUntil(page, "ArrowRight", "settings");
  await page.keyboard.press("Enter");
  await waitRoute(page, "settings");
  await expect.poll(() => focused(page)).toBe("fx"); // the screen's own initial focus has landed
  await pressUntil(page, "Tab", "sw-caseAssist", 40);
  expect((await save(page)).settings.caseAssist).toBe(false);
  await page.keyboard.press("Space");
  await expect.poll(() => focused(page)).toBe("sw-caseAssist");
  expect(await page.locator('[data-key="sw-caseAssist"]').getAttribute("aria-checked")).toBe(
    "true",
  );
  expect((await save(page)).settings.caseAssist).toBe(true);
  await still(page, "05-settings-ignore-capitals");
  await expect.poll(() => focused(page)).toBe("sw-caseAssist");
  await page.keyboard.press("Space"); // back off: the intro card below is exact case
  expect((await save(page)).settings.caseAssist).toBe(false);
  // it changes nothing about rewards: the run config only differs by the option
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  // ---- intro card, first visit: type it (no fail), Shift cue, then the level starts
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-id")))
    .toBe("ch2-l01");
  await page.keyboard.press("Enter");
  await waitRoute(page, "intro");
  expect((await save(page)).journal.firstSeen["#intro:ch2"]).toBeUndefined();
  await expect(page.locator("#intro-hint")).toContainText("Shift");
  await still(page, "06-ch2-intro-card");
  const first = await page.locator("#intro-line").getAttribute("aria-label");
  expect(first).toBe("Type: Welcome to the Hushwood, Ember Knight.");
  // a wrong key never advances or fails
  await page.keyboard.press("z");
  expect(await page.locator("#intro-line .ok").textContent()).toBe("");
  for (let line = 0; line < 3; line++) {
    const text = ((await page.locator("#intro-line").getAttribute("aria-label")) ?? "").slice(6);
    for (const [i, ch] of [...text].entries()) {
      if (ch >= "A" && ch <= "Z") {
        await page.keyboard.down("Shift");
        await page.keyboard.press(ch); // with Shift held the browser reports the capital
        await page.keyboard.up("Shift");
      } else await page.keyboard.press(ch);
      if (line === 1 && text.slice(0, i + 1).endsWith("type a "))
        await still(page, "07-ch2-intro-card-typing").catch(() => undefined);
    }
  }
  await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
    timeout: 15_000,
  });
  const s1 = await save(page);
  expect(s1.journal.firstSeen["#intro:ch2"]).toBeDefined();
  await page.waitForTimeout(600); // IndexedDB write

  // ---- second visit: Enter/Esc skips it
  await page.reload();
  await waitRoute(page, "title");
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  expect(await page.locator('.ch-tab[data-n="2"]').getAttribute("aria-selected")).toBe("true");
  expect((await save(page)).progress.frontierChapter).toBe(2);
  expect((await save(page)).journal.firstSeen["#intro:ch2"]).toBeDefined();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-id")))
    .toBe("ch2-l01");
  await page.keyboard.press("Enter");
  await waitRoute(page, "intro");
  await expect(page.locator(".intro-card .story-keys")).toContainText("skip");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
    timeout: 15_000,
  });
  expect(run.errors.filter((e) => !/ch2|stub|WebGL/i.test(e))).toEqual([]);
});

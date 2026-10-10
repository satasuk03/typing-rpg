/**
 * P4.1 skip / replay / idle sanity on real Metal (perf config, 1920x1080): hold-Esc skip from Part A, B and C, the title
 * "Prologue" replay, and the idle auto-advance ladder (shortened with the test-only `pidle` scale). Every test: 0 console errors.
 *   PERF_PORT=5481 ./node_modules/.bin/playwright test -c tests/perf/playwright.config.ts prologue-flow
 */
import { type Page, test } from "@playwright/test";
import {
  expect,
  holdEsc,
  openApp,
  pressStart,
  prologueFlag,
  proState,
  waitProPhase,
  waitRoute,
} from "../app/helpers";
import { seedProgress } from "../app/seed";
import { assertRealGpu } from "./helpers";

test.setTimeout(8 * 60_000);
const Q = "api=off&dev=1&onboard=1";
const appErrors = (p: Page): Promise<string[]> =>
  p.evaluate(() => window.__app?.consoleErrors ?? []);

test("hold Esc skips from Part A", async ({ page }) => {
  const run = await openApp(page, Q);
  await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "A");
  await page.waitForTimeout(1500);
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("hold Esc skips from Part B (bot 40)", async ({ page }) => {
  const run = await openApp(page, `${Q}&wpm-bot=40&bot-seed=3&bot-acc=0.97`);
  await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "B");
  await page.waitForTimeout(6000);
  expect((await proState(page))?.simStarted).toBe(true);
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("hold Esc skips from Part C (reached by idle auto-advance)", async ({ page }) => {
  const run = await openApp(page, `${Q}&pidle=0.05`);
  await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "C", 120_000);
  expect((await proState(page))?.cReason).toBe("idle");
  await page.waitForTimeout(3000);
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("idle ladder in Part B: nudge, ring hint, auto-advance to C, then story", async ({ page }) => {
  const run = await openApp(page, `${Q}&pidle=0.2`);
  await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "B");
  await page.waitForFunction(() => window.__play?.prologue?.().nudge === true, undefined, {
    timeout: 30_000,
  });
  await page.waitForFunction(() => window.__play?.prologue?.().ringHint === true, undefined, {
    timeout: 30_000,
  });
  await waitProPhase(page, "C", 60_000);
  expect((await proState(page))?.cReason).toBe("idle");
  await waitRoute(page, "story", 240_000);
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("title Prologue replay plays A, B, C and returns to the title without writing the save", async ({
  page,
}) => {
  const run = await openApp(page, `${Q}&pidle=0.05`);
  await assertRealGpu(page);
  await seedProgress(page, { cleared: 2 });
  await page.waitForTimeout(600);
  await page.reload();
  await waitRoute(page, "title");
  const snap = (): Promise<string> =>
    page.evaluate(() =>
      JSON.stringify((window.__app as unknown as { store: { save: unknown } }).store.save),
    );
  const before = await snap();
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.locator("[data-act=prologue]").click();
  await waitProPhase(page, "A");
  await waitProPhase(page, "B", 60_000);
  await waitProPhase(page, "C", 120_000);
  await waitRoute(page, "title", 240_000);
  expect(await snap()).toBe(before);
  expect(await prologueFlag(page)).toBe(false);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

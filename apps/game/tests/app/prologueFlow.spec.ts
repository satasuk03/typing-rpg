/**
 * P3.5 prologue flow + session prologue mode (docs/PROLOGUE_PLAN.md §3.4, interfaces v2.2 §14.3).
 *   fresh Start -> prologue (A cutscene, B real sim with the wpm-bot, C cutscene) -> story -> calibration -> L1;
 *   a profile with progress is never forced; hold-Esc skip from A / B / C; the pause menu (Resume / Skip prologue);
 *   the title "Prologue" replay (no save write); reload mid-prologue; idle nudge / ring hint / 75 s auto-advance
 *   (shortened with the test-only `?pidle=<scale>`); no save write from the run (the save is diffed); 0 console errors.
 * Stills go to docs/qa/prologue-p3.5/ (JPEG).
 *
 * Run from apps/game: APP_PORT=5431 ./node_modules/.bin/playwright test -c tests/app/playwright.config.ts prologueFlow
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import {
  expect,
  holdEsc,
  openApp,
  pressStart,
  prologueFlag,
  proState,
  route,
  typeCalibration,
  waitProPhase,
  waitRoute,
} from "./helpers";
import { seedProgress } from "./seed";

test.setTimeout(8 * 60_000);

const dir = path.dirname(fileURLToPath(import.meta.url));
const stillPath = (name: string): string =>
  path.resolve(dir, "../../../../docs/qa/prologue-p3.5", `${name}.jpg`);
const still = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: stillPath(name), type: "jpeg", quality: 72 });

const Q = "api=off&audio=0&dev=1&onboard=1";
/** The whole save as JSON (the snapshot we diff). */
const snap = (page: Page): Promise<string> =>
  page.evaluate(() =>
    JSON.stringify((window.__app as unknown as { store: { save: unknown } }).store.save),
  );
/** A snapshot with the only two fields a first-run prologue may change (the flag and its timestamp) removed. */
const withoutFlag = (json: string): Record<string, unknown> => {
  const s = JSON.parse(json) as {
    journal: { firstSeen: Record<string, number> };
    updatedAtMs?: number;
  };
  delete s.journal.firstSeen["#prologue"];
  s.updatedAtMs = 0;
  return s as unknown as Record<string, unknown>;
};
const appErrors = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__app?.consoleErrors ?? []);

test("fresh Start: prologue A, B (wpm-bot), C, then story, calibration and L1", async ({
  page,
}) => {
  const run = await openApp(page, `${Q}&wpm-bot=60&bot-seed=3&bot-acc=0.97`);
  const before = await snap(page);
  expect(await prologueFlag(page)).toBe(false);
  await pressStart(page);
  await waitProPhase(page, "A");
  expect(await route(page)).toBe("prologue");
  expect((await proState(page))?.simStarted).toBe(false); // Part A: the sim has not started
  await waitProPhase(page, "B");
  await page.waitForTimeout(1500);
  expect((await proState(page))?.simStarted).toBe(true);
  const levelId = await page.evaluate(() => window.__play?.view().levelId);
  expect(levelId).toBe("prologue"); // the real prologue def (prologueRunConfig), not a story level
  // (no screenshot here: a long frame stalls the runner and the stall pause would stop the bot)
  // Part B ends on the sim's PrologueClimax, which hands the same stage to Part C
  await waitProPhase(page, "C", 300_000);
  const c = await page.evaluate(() => ({
    seen: window.__play?.seen() ?? {},
    results: window.__play?.resultsShown(),
  }));
  expect(c.seen.PrologueClimax).toBe(1);
  expect(c.results).toBe(false); // no results screen
  expect((await proState(page))?.cReason).toBe("climax");
  expect(await snap(page)).toBe(before); // nothing was written by Parts A and B
  expect(await prologueFlag(page)).toBe(false); // the flag is written at the end of Part C, never at the start
  // Part C ends by itself (its line holds 2.2 s unless Space/Enter), then the story card
  await waitRoute(page, "story", 90_000);
  expect(await prologueFlag(page)).toBe(true);
  expect(withoutFlag(await snap(page))).toEqual(withoutFlag(before)); // the flag is the only difference
  await page.waitForTimeout(400);
  const card = (await page.locator(".story-card").textContent()) ?? "";
  expect(card).toContain("Nul, the Silent King");
  await still(page, "story-card-1");
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await page.keyboard.press("x");
  await waitRoute(page, "calibrate");
  await typeCalibration(page, 50);
  await page.waitForSelector(".calibrate[data-state=done]");
  await page.waitForTimeout(1600);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l01", undefined, {
    timeout: 60_000,
  });
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("a profile with progress is not forced through the prologue", async ({ page }) => {
  const run = await openApp(page, Q);
  await seedProgress(page, { cleared: 2 });
  await page.waitForTimeout(500);
  await page.reload();
  await waitRoute(page, "title");
  const before = await snap(page);
  await pressStart(page);
  await waitRoute(page, "map");
  expect(await prologueFlag(page)).toBe(false);
  expect(await snap(page)).toBe(before);
  expect(run.errors).toEqual([]);
});

test("hold Esc skips from Part A to the story card and sets the flag", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "A");
  expect((await proState(page))?.simStarted).toBe(false);
  await holdEsc(page, 600); // shorter than 1 s: the ring shows, nothing is skipped
  expect(await route(page)).toBe("prologue");
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("the skip ring shows while Esc is held; releasing early is not a skip", async ({ page }) => {
  // ?phold=8000 lengthens the hold so a still can be taken mid-hold (a SwiftShader screenshot takes a while)
  const run = await openApp(page, `${Q}&phold=8000`);
  await pressStart(page);
  await waitProPhase(page, "A");
  await page.keyboard.down("Escape");
  await page.waitForTimeout(700);
  expect(await page.locator("#pro-ring[data-held='1']").count()).toBe(1);
  expect(await route(page)).toBe("prologue");
  await still(page, "skip-ring");
  await page.keyboard.up("Escape");
  expect(await route(page)).toBe("prologue");
  await page.waitForTimeout(400);
  expect(await page.locator("#pro-ring[data-held='1']").count()).toBe(0); // (Part A's own 3 s hint may still show it)
  expect(await prologueFlag(page)).toBe(false);
  // Part B: an Esc keydown is a tap (the pause menu); it does not need to be held
  await waitProPhase(page, "B");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]");
  expect(await route(page)).toBe("prologue");
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("hold Esc skips from Part B to the story card and sets the flag", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "B");
  await page.waitForTimeout(1500);
  expect((await proState(page))?.simStarted).toBe(true);
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("hold Esc skips from Part C", async ({ page }) => {
  const run = await openApp(page, `${Q}&pidle=0.02`); // idle auto-advance after 1.5 s
  await pressStart(page);
  await waitProPhase(page, "C");
  expect((await proState(page))?.cReason).toBe("idle");
  expect(await prologueFlag(page)).toBe(false);
  await holdEsc(page, 1500);
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("pause menu in Part B: Resume / Skip prologue", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "B");
  const before = await snap(page);
  await page.keyboard.press("Escape"); // a tap
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]");
  const labels = await page.locator("#play-ui .hd-panel[data-kind=pause] button").allTextContents();
  expect(labels).toEqual(["Resume (Esc)", "Skip prologue"]);
  expect(await page.evaluate(() => window.__play?.session.runner.paused)).toBe(true);
  await page.waitForTimeout(300);
  await still(page, "pause-menu");
  await page.keyboard.press("Escape"); // tap again resumes
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]", { state: "detached" });
  expect(await page.evaluate(() => window.__play?.session.runner.paused)).toBe(false);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]");
  await page.locator("[data-act=resume]").click(); // the Resume button
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]", { state: "detached" });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]");
  expect(await snap(page)).toBe(before);
  await page.locator("[data-act=skip]").click();
  await waitRoute(page, "story");
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("title Prologue button replays it and returns to the title, writing nothing", async ({
  page,
}) => {
  const run = await openApp(page, `${Q}&pidle=0.02`);
  await seedProgress(page, { cleared: 2 });
  await page.waitForTimeout(600);
  await page.reload();
  await waitRoute(page, "title");
  const before = await snap(page);
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=prologue]").textContent()).toBe("Prologue");
  await page.locator("[data-act=prologue]").click();
  await waitProPhase(page, "A");
  await waitProPhase(page, "B");
  await waitProPhase(page, "C"); // idle auto-advance (the title replay is never forced through a fight)
  await waitRoute(page, "title", 90_000);
  expect(await snap(page)).toBe(before); // not a single field of the save changed
  expect(await prologueFlag(page)).toBe(false); // replay never writes the flag
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

test("replay with the flag already set stays a no-op for the save", async ({ page }) => {
  const run = await openApp(page, `${Q}&pidle=0.02`);
  await page.evaluate(() =>
    (window.__app as never as { store: { markPrologueSeen(): void } }).store.markPrologueSeen(),
  );
  const before = await snap(page);
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.locator("[data-act=prologue]").click();
  await waitProPhase(page, "A");
  await holdEsc(page, 1500); // skipping a replay returns to the title and writes nothing either
  await waitRoute(page, "title");
  expect(await snap(page)).toBe(before);
  expect(run.errors).toEqual([]);
});

test("reload mid-prologue replays it from the start", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "B");
  await page.waitForTimeout(800);
  await page.reload();
  await waitRoute(page, "title");
  expect(await prologueFlag(page)).toBe(false); // closing the tab mid-prologue marks nothing
  expect(await page.locator("[data-act=continue]").count()).toBe(1);
  await pressStart(page);
  await waitProPhase(page, "A"); // from the very start again
  expect((await proState(page))?.simStarted).toBe(false);
  expect(run.errors).toEqual([]);
});

test("idle in Part B: nudge, ring hint, then auto-advance to Part C", async ({ page }) => {
  // ?pidle=0.2 scales the ladder 9 s / 20 s / 75 s to 1.8 s / 4 s / 15 s
  const run = await openApp(page, `${Q}&pidle=0.2`);
  await pressStart(page);
  await waitProPhase(page, "B");
  await page.waitForFunction(() => window.__play?.prologue?.().nudge === true, undefined, {
    timeout: 20_000,
  });
  expect((await proState(page))?.ringHint).toBe(false);
  await page.waitForTimeout(350);
  await still(page, "idle-nudge");
  // any key is input: the nudge goes away and the idle clock restarts
  await page.keyboard.press("x");
  await page.waitForFunction(() => window.__play?.prologue?.().nudge === false);
  expect((await proState(page))?.idleMs ?? 99_999).toBeLessThan(1500);
  // idle again: nudge, then the ring hint
  await page.waitForFunction(() => window.__play?.prologue?.().ringHint === true, undefined, {
    timeout: 20_000,
  });
  expect((await proState(page))?.nudge).toBe(true);
  await page.waitForTimeout(350);
  await still(page, "idle-ring-hint");
  // 75 s (15 s here) idle: auto-advance to Part C
  await waitProPhase(page, "C", 40_000);
  expect((await proState(page))?.cReason).toBe("idle");
  expect(await page.evaluate(() => window.__play?.resultsShown())).toBe(false);
  await waitRoute(page, "story", 90_000);
  expect(await prologueFlag(page)).toBe(true);
  expect(run.errors).toEqual([]);
  expect(await appErrors(page)).toEqual([]);
});

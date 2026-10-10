/**
 * P3.6 full real run on Metal (1280x720, audio ON): fresh profile -> Start -> Part A -> Part B (wpm-bot 40) -> Part C ->
 * story card -> calibration -> L1, with 0 console errors (page console + page errors + the app's own error list + external
 * requests). Part C plays in real time with its lines timing out by themselves (the minimum reading time).
 *
 *   APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueFullRun
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
  expect,
  openApp,
  pressStart,
  prologueFlag,
  proState,
  route,
  typeCalibration,
  waitProPhase,
  waitRoute,
} from "./helpers";

test.setTimeout(20 * 60_000);

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.PRO_OUT ?? path.resolve(dir, "../../../../docs/qa/prologue-p3.6");

test("fresh profile: Start -> A -> B (wpm-bot 40) -> C -> story -> calibrate -> L1, 0 console errors", async ({
  page,
}) => {
  // audio ON (no `audio=0`): the cue routing (sfx / drone / swell / silence / motifs) runs for real
  const run = await openApp(page, "api=off&dev=1&onboard=1&wpm-bot=40&bot-seed=3&bot-acc=0.97");
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    return g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
  });
  expect(gpu).toMatch(/Apple|Metal/i);
  expect(await prologueFlag(page)).toBe(false);
  const t0 = Date.now();
  await pressStart(page);
  await waitProPhase(page, "A");
  const tA = Date.now();
  await waitProPhase(page, "B", 60_000);
  const tB = Date.now();
  expect((await proState(page))?.simStarted).toBe(true);
  await waitProPhase(page, "C", 300_000);
  const tC = Date.now();
  expect((await proState(page))?.cReason).toBe("climax");
  await waitRoute(page, "story", 180_000);
  const tS = Date.now();
  expect(await prologueFlag(page)).toBe(true);
  await page.waitForTimeout(400);
  expect((await page.locator(".story-card").textContent()) ?? "").toContain("Nul, the Silent King");
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
  // a few seconds of L1 (the story level the prologue hands over to)
  await page.waitForTimeout(6000);
  const secs = (a: number, b: number): string => ((b - a) / 1000).toFixed(1);
  const errs = await page.evaluate(() => window.__app?.consoleErrors ?? []);
  const summary = `A ${secs(tA, tB)} s, B ${secs(tB, tC)} s, C ${secs(tC, tS)} s (real time, min line holds), total to story ${secs(t0, tS)} s; console errors ${run.errors.length}, in-app errors ${errs.length}; route ${await route(page)}, level ch1-l01 up`;
  console.log(`FULLRUN ${summary}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "full-run-metal.txt"),
    `Metal (${gpu}) 1280x720, audio on, wpm-bot 40 acc 0.97 seed 3, fresh profile\n${summary}\n`,
  );
  expect(run.errors).toEqual([]);
  expect(errs).toEqual([]);
});

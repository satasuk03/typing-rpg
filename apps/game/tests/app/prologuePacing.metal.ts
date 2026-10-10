/**
 * P4.2 WP-B pacing evidence (docs/qa/prologue-review-1.md §4, P1-10) on real Metal, REAL time, UN-parked: a fresh profile -> Start ->
 * Part A -> Part B (wpm-bot, default 75) -> Part C, with the part wall times, the Part C timeline clock sampled against the wall clock
 * (a held line shows as a flat span), and a film strip of Part C (one frame per second, 640x360 JPEG) into $PACING_OUT so a script
 * can measure the frame difference between consecutive frames (a static shot differs by < 3%).
 *
 *   PACING_OUT=/tmp/pacing APP_PORT=5469 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologuePacing
 */
import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { expect, openApp, pressStart, proState, waitProPhase, waitRoute } from "./helpers";

test.setTimeout(20 * 60_000);
test.use({ viewport: { width: 1280, height: 720 } });

const OUT = process.env.PACING_OUT ?? "/tmp/pacing";
const WPM = Number(process.env.PACING_WPM ?? 75);

test("part wall times and the Part C film strip (real time, un-parked)", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const run = await openApp(page, `api=off&dev=1&onboard=1&wpm-bot=${WPM}&bot-seed=3&bot-acc=0.97`);
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    return g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
  });
  expect(gpu).toMatch(/Apple|Metal/i);
  await pressStart(page);
  await waitProPhase(page, "A");
  const tA = Date.now();
  await waitProPhase(page, "B", 60_000);
  const tB = Date.now();
  await waitProPhase(page, "C", 300_000);
  const tC = Date.now();
  // Part C: one 640x360 frame per second plus the timeline clock, until the story card
  const clock: [number, number][] = [];
  let n = 0;
  for (;;) {
    const ps = await proState(page);
    if (ps?.phase !== "C") break;
    const t = Date.now() - tC;
    clock.push([t, ps.t]);
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 70,
      clip: { x: 0, y: 0, width: 1280, height: 720 },
    });
    fs.writeFileSync(path.join(OUT, `f${String(n).padStart(3, "0")}.jpg`), buf);
    n++;
    const wait = 1000 - (Date.now() - tC - t);
    if (wait > 0) await page.waitForTimeout(wait);
  }
  await waitRoute(page, "story", 60_000);
  const tS = Date.now();
  const secs = (a: number, b: number): number => Math.round((b - a) / 100) / 10;
  const summary = { A: secs(tA, tB), B: secs(tB, tC), C: secs(tC, tS), frames: n, wpm: WPM, clock };
  fs.writeFileSync(path.join(OUT, "pacing.json"), JSON.stringify(summary));
  console.log(
    `PACING A ${summary.A} s, B ${summary.B} s, C ${summary.C} s (wpm-bot ${WPM}), ${n} frames`,
  );
  expect(run.errors).toEqual([]);
  expect(await page.evaluate(() => window.__app?.consoleErrors ?? [])).toEqual([]);
});

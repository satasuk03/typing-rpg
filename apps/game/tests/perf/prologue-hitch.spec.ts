/**
 * P4.2 WP-A: the P4.1 first-frame hitch of Part B. Real Metal, 1920x1080: fresh profile -> Start -> Part A -> the first frames of
 * Part B. Reports the first 12 frame times after the phase flips to "B" and the worst frame of the first 45 (tier 0, and tier 2
 * with CDP 4x CPU throttle). The prewarm (VFX + HUD before `startPlay`) can be switched off with `&prewarm=0` for the "before".
 *
 *   PERF_PORT=5465 HITCH_PREWARM=0 ./node_modules/.bin/playwright test -c tests/perf/playwright.config.ts prologue-hitch
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import { openApp, pressStart, proState, waitProPhase } from "../app/helpers";
import { assertRealGpu, fmt } from "./helpers";

test.setTimeout(10 * 60_000);
const dir = path.dirname(fileURLToPath(import.meta.url));
const PREWARM = process.env.HITCH_PREWARM === "0" ? "&prewarm=0" : "";
const Q = `api=off&dev=1&onboard=1&wpm-bot=40&bot-seed=3&bot-acc=0.97${PREWARM}`;

interface Frame {
  dt: number;
  phase: string;
}

async function probe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __hf: Frame[] };
    w.__hf = [];
    let last = 0;
    const tick = (t: number): void => {
      const pr = window.__play?.prologue?.();
      if (last > 0 && pr) w.__hf.push({ dt: t - last, phase: pr.phase });
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function run(page: Page, tier: number, throttle: boolean): Promise<void> {
  await openApp(page, `${Q}&tier=${tier}`);
  const gpu = await assertRealGpu(page);
  await pressStart(page);
  await waitProPhase(page, "A");
  await probe(page);
  if (throttle) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await waitProPhase(page, "B", 60_000);
  await page.waitForTimeout(2500);
  const all = await page.evaluate(() => (window as unknown as { __hf: Frame[] }).__hf);
  const firstB = all.findIndex((f) => f.phase === "B");
  const b = all.slice(firstB, firstB + 45).map((f) => f.dt);
  const a = all.filter((f) => f.phase === "A").map((f) => f.dt);
  const aMax = Math.max(...a.slice(5));
  const worst = Math.max(...b);
  const first12 = b.slice(0, 12).map(fmt).join(" ");
  const text = `HITCH tier ${tier}${throttle ? " 4x throttle" : ""} prewarm=${PREWARM ? "off" : "on"}: first B frames [${first12}] worst of first 45 = ${fmt(worst)} ms (Part A frames after the first 5: max ${fmt(aMax)} ms) on ${gpu}`;
  console.log(text);
  const out = path.join(dir, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(
      out,
      `prologue-hitch-t${tier}${throttle ? "-throttled" : ""}${PREWARM ? "-noprewarm" : ""}.txt`,
    ),
    `${text}\n`,
  );
  await proState(page);
}

test("hitch tier 0", async ({ page }) => {
  await run(page, 0, false);
});
test("hitch tier 2 throttled 4x", async ({ page }) => {
  await run(page, 2, true);
});

/**
 * T6.3 W3 P1-2: L05 at 110 WPM (Aegis + guards in the starter kit). The held guard barrier must be gone outside combat:
 * its displayed intensity is sampled every frame; the max outside the `combat` phase must be 0.
 *   PW_PORT=5321 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w3-barrier
 */
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

test.setTimeout(600_000);

test("L05 110 WPM: no guard barrier outside combat", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?scene=play&level=ch1-l05&wpm-bot=110&onboard=0&audio=0&seed=4");
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 90_000 });
  await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const rec = {
      maxOutside: 0,
      outsideFrames: 0,
      maxInCombat: 0,
      guards: 0,
      modes: {} as Record<string, number>,
      seen: {} as Record<string, number>,
    };
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__w3b = rec;
    let lastPh = "";
    let phSince = 0;
    const f = (): void => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only access
      const w = (p.session.typingFx as any)?.handle?.worldFx;
      const v = (w?.barrier?.intensity as number | undefined) ?? 0;
      const ph = p.phase();
      rec.guards = p.seen().GuardWordTyped ?? 0;
      const nowMs = performance.now();
      if (ph !== lastPh) {
        lastPh = ph;
        phSince = nowMs;
      }
      if (ph === "combat") rec.maxInCombat = Math.max(rec.maxInCombat, v);
      // the 200 ms fade tail right after a phase change is allowed; anything later is an orphan
      else if ((ph === "rewards" || ph === "walk") && nowMs - phSince > 500) {
        rec.outsideFrames++;
        rec.maxOutside = Math.max(rec.maxOutside, v);
        if (v > 0) {
          const key = `${ph}:mode${w?.barrier?.currentMode}`;
          rec.modes[key] = (rec.modes[key] ?? 0) + 1;
          rec.seen = p.seen();
        }
      }
      requestAnimationFrame(f);
    };
    f();
  });
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout: 500_000,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only global
  const rec = await page.evaluate(() => (window as any).__w3b);
  console.log("W3 barrier", JSON.stringify(rec));
  expect(rec.maxOutside).toBe(0);
  expect(errors).toEqual([]);
});

/**
 * Visual nits capture (real Metal): a crowded BREAK pop still from a bot run.
 *   LEVEL=ch1-l10 TAG=before|after STILL_DIR=/path PW_PORT=5294 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-nits
 * Logs the max distance (design px) of any enemy BREAK pop centre from its head, and screenshots the first frame where
 * a pop sits beyond 150 px (before) or was shrunk by the crowded-fit (after).
 */
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, waitPhase } from "./playHelpers";

test.setTimeout(900_000);
const level = process.env.LEVEL ?? "ch1-l10";
const outDir = process.env.STILL_DIR ?? "/tmp";
const tag = process.env.TAG ?? "x";
const THRESH = Number(process.env.THRESH ?? 150);

test(`nits ${level}`, async ({ page }) => {
  const errors = await openPlay(page, `level=${level}&difficulty=story&seed=5&wpm-bot=90`);
  await waitPhase(page, "combat");
  await page.evaluate((THRESH) => {
    const p = window.__play as PlayDebug;
    // biome-ignore lint/suspicious/noExplicitAny: test-only private access
    const hud = p.session.hud as any;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const w = window as any;
    w.__nit = { max: 0, n: 0, shrunk: 0, hit: null as null | number };
    const f = (): void => {
      const s = hud.s as number;
      for (const pop of hud.pops.pops) {
        if (pop.kind !== "break" || pop.anchor.kind !== "enemy") continue;
        const i = hud.popTexts.indexOf(pop.text);
        const r = hud.popRects[i];
        const head = hud.popAnchorCss(pop.anchor);
        if (!r || !head) continue;
        const d = Math.hypot(r.x + r.w / 2 - head.x, r.y + r.h / 2 - head.y) / s;
        w.__nit.n++;
        w.__nit.max = Math.max(w.__nit.max, d);

        if (w.__nit.hit === null && d > THRESH) w.__nit.hit = d;
      }
      requestAnimationFrame(f);
    };
    f();
  }, THRESH);
  let shot = false;
  for (let i = 0; i < 6000 && !shot; i++) {
    const st = await page.evaluate(() => ({
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      hit: (window as any).__nit.hit as number | null,
      done: window.__play?.resultsShown() === true,
    }));
    if (st.hit !== null) {
      await freeze(page);
      await page.screenshot({ path: path.join(outDir, `${tag}-${level}-break-crowded.png`) });
      shot = true;
    }
    if (st.done) break;
    await page.waitForTimeout(100);
  }
  console.log(
    "NITS",
    tag,
    level,
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    JSON.stringify(await page.evaluate(() => (window as any).__nit)),
    "shot",
    shot,
  );
  expect(errors, errors.join("\n")).toEqual([]);
});

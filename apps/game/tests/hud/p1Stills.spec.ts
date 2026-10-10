/**
 * Ch2 review P1 HUD stills (HP display, elite tag + leak badge, fading plates in Ch1/Ch2).
 * P1_SHOTS_DIR=<dir> P1_TAG=before|after writes JPEGs; skipped otherwise.
 */
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { HudDebugSnapshot } from "../../src/hud";
import { checkSnapshot } from "../../src/hud/invariants";

test.skip(!process.env.P1_SHOTS_DIR, "P1_SHOTS_DIR not set");
test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

type Page = import("@playwright/test").Page;
type R = { x: number; y: number; w: number; h: number };
const tag = process.env.P1_TAG ?? "after";

async function open(page: Page, query: string, at: number): Promise<void> {
  await page.goto(`/?scene=hud-test&${query}&at=${at}&pause=1&intensity=1`);
  await page.waitForFunction(() => window.__hudDebug?.ready === true, undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(150);
}
const snap = (page: Page): Promise<HudDebugSnapshot> =>
  page.evaluate(() => {
    const d = window.__hudDebug;
    if (!d) throw new Error("no hook");
    return d.snapshot();
  });
const jpeg = (page: Page, name: string, clip: R): Promise<Buffer> =>
  page.screenshot({
    path: path.join(process.env.P1_SHOTS_DIR as string, `${name}-${tag}.jpg`),
    type: "jpeg",
    quality: 78,
    clip: {
      x: Math.max(0, clip.x),
      y: Math.max(0, clip.y),
      width: Math.min(1280 - Math.max(0, clip.x), clip.w),
      height: Math.min(720 - Math.max(0, clip.y), clip.h),
    },
  });
const pad = (r: R, n: number): R => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });

test("hero HP with a fractional max", async ({ page }) => {
  await open(page, "scenario=forest&wpm=40", 1);
  await page.evaluate(() => {
    const dr = window.__hudDebug?.driver() as unknown as { heroMax: number; heroHp: number };
    dr.heroMax = 121.717;
    dr.heroHp = 122;
    window.__hudDebug?.sweep(0.05, 0.05);
  });
  await jpeg(page, "hp", { x: 0, y: 0, w: 380, h: 150 });
});

test("elite tag + leak badge side by side", async ({ page }) => {
  await open(page, "healer=1&elite=1&leak=20&scenario=forest&wpm=40", 6);
  const s = await snap(page);
  const tr = s.tagRects?.[0];
  expect(tr).toBeTruthy();
  await jpeg(page, "elite-badge", pad(tr as R, 70));
  if (tag === "after") {
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.chipRects?.some((c) => c.id === "leak")).toBe(true);
  }
});

for (const chapter of [1, 2]) {
  test(`fading plate chapter ${chapter}`, async ({ page }) => {
    await open(page, "fading=1&scenario=forest&wpm=40", 1);
    await page.evaluate((ch) => {
      const d = window.__hudDebug;
      if (!d) throw new Error("no hook");
      (d.driver() as unknown as { opts: { chapter: number } }).opts.chapter = ch;
    }, chapter);
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.__hudDebug?.sweep(0.25, 0.25));
      const s = await snap(page);
      const p = s.plates.find((x) => x.faded && x.isTarget && x.letters.length > 4);
      const calm = await page.evaluate((id) => {
        const d = window.__hudDebug;
        const pl = d?.driver().view.plates.find((x) => x.id === id);
        if (!d || !pl || pl.typedIndex !== 2) return false;
        return (
          d.hud.plateFx.letter(id, pl.typedIndex, false).glitch === 0 &&
          d.hud.plateFx.letter(id, pl.typedIndex - 1, false).flash < 0.05
        );
      }, p?.id ?? -1);
      if (p && calm) {
        await page.waitForTimeout(100);
        await jpeg(page, `fading-ch${chapter}`, pad(p.rect, 140));
        return;
      }
    }
    throw new Error("no faded target plate");
  });
}

/**
 * P3.3 prologue HUD readability sweep (Part B at max FX, mock driver, N = 6 kit skills + 9 passives + `view.prologue`).
 *   PW_PORT=5447 ./node_modules/.bin/playwright test tests/hud/prologueHud.spec.ts
 * `?scene=prologue&part=hud` (hud/prologue/devScene.ts): the real Hud, the real typing VFX, the Word Gate world, a wpm-90 bot at the
 * pinned tier-4 streak, guard words on. 0 violations against the existing invariants (`checkSnapshot`: next letter legible, no pop or
 * tag over a letter, no letter outside its plate, fxKeepOut) plus the prologue ones (`checkPrologueSnapshot`: dialogue contrast >= 7,
 * <= 2 lines, nothing over the dialogue, no pop on Nul's mask, the Grimoire / hint / ring rects clear), plus the next-letter ring /
 * cell contrast measured on the HUD canvas (ring >= 3, cell >= 4.5).
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(240_000);

async function open(page: import("@playwright/test").Page, extra = ""): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=prologue&part=hud&wpm=90&quality=0&render=0${extra}`);
  await page.waitForFunction(() => window.__prologueHud?.ready === true, undefined, {
    timeout: 120_000,
  });
  return errors;
}

test("Part B at max FX: 0 violations (existing invariants + dialogue / mask / reserved rects), 0 errors", async ({
  page,
}) => {
  const errors = await open(page);
  const r = await page.evaluate(() => window.__prologueHud?.sweep(24, 0.5));
  expect(r).toBeTruthy();
  if (!r) return;
  console.log(
    `prologue HUD sweep: samples=${r.samples} (partB ${r.partB}, overlap ${r.overlap}) contrast checked=${r.contrastChecked} ` +
      `minRing=${r.minRing.toFixed(2)} minCell=${r.minCell.toFixed(2)} maxPops=${r.maxPops} popsNearMask=${r.popsNearMask} ` +
      `fxKeepOut max=${JSON.stringify(r.keepOutMax)} events=${JSON.stringify(r.events)}`,
  );
  expect(r.violations).toEqual([]);
  expect(r.partB).toBeGreaterThan(20);
  expect(r.overlap).toBeGreaterThan(8);
  expect(r.contrastChecked).toBeGreaterThan(10);
  expect(r.minRing).toBeGreaterThanOrEqual(3);
  expect(r.minCell).toBeGreaterThanOrEqual(4.5);
  expect(r.keepOutMax).toEqual({ panel: 0, label: 0, next: 0 });
  expect(errors).toEqual([]);
});

test("every plan line: <= 2 lines at 1280, contrast >= 7:1, nothing over it, speaker plate contrast >= 7", async ({
  page,
}) => {
  const errors = await open(page);
  const lines = await page.evaluate(() => window.__prologueHud?.lines());
  expect(lines?.length).toBe(7);
  for (const l of lines ?? []) {
    expect(l.lines.length, `"${l.text}" wraps to ${l.lines.length}`).toBeGreaterThanOrEqual(1);
    expect(l.lines.length, `"${l.text}"`).toBeLessThanOrEqual(2);
    expect(l.contrast, `"${l.text}" contrast`).toBeGreaterThanOrEqual(7);
    expect(l.speakerContrast, `${l.speaker} plate`).toBeGreaterThanOrEqual(7);
    expect(l.violations, `"${l.text}"`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("reduced motion / reduced flash / zero intensity: the sweep is clean", async ({ page }) => {
  const errors = await open(page, "&reducedMotion=1&reducedFlash=1&intensity=0");
  const r = await page.evaluate(() => window.__prologueHud?.sweep(8, 0.5));
  expect(r?.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("the story HUD is unchanged: no prologue strip, no prologue snapshot", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?scene=hud-test&scenario=boss&wpm=40&at=6&pause=1");
  await page.waitForFunction(() => window.__hudDebug?.ready === true, undefined, {
    timeout: 30_000,
  });
  const snap = await page.evaluate(() => window.__hudDebug?.snapshot());
  expect(snap?.prologue).toBeUndefined();
  expect(errors).toEqual([]);
});

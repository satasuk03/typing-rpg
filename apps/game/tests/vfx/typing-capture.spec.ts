/**
 * @capture T2.6 stills (Chunk A: HUD; Chunk B: world + word payoff) (1280x720, real world backdrop). Frame-exact: the scene steps the
 * mock, HUD and world in fixed 1/60 s substeps, so every still is reproducible.
 * Run: PW_PORT=5199 pnpm --filter game exec playwright test vfx/typing-capture
 * Committed stills live in __shots__/ (everything else under tests/vfx is gitignored).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(120_000);

for (const tier of [0, 1, 2, 3, 4]) {
  test(`@capture typing tier ${tier} mid-keystroke (90 wpm)`, async ({ page }) => {
    const errors = await openTyping(page, `wpm=90&tier=${tier}&at=2.4`);
    const ok = await page.evaluate(() =>
      window.__typingVfx?.stepToKey(95, { minIndex: 2, notLast: true }),
    );
    expect(ok).toBe(true);
    const st = await page.evaluate(() => window.__typingVfx?.stats());
    expect(st?.sparks).toBeGreaterThan(0);
    expect(st?.streaks).toBeGreaterThan(0);
    await page.screenshot({ path: shot(`typing-t${tier}-90wpm`) });
    expect(errors).toEqual([]);
  });
}

test("@capture typo (normal, +40 ms)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=4");
  await page.evaluate(() => {
    const a = window.__typingVfx;
    a?.stepToKey(30, { minIndex: 1, notLast: true });
    a?.queueTypo();
  });
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("Typo", 40));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-typo") });
  expect(errors).toEqual([]);
});

test("@capture typo on a guard plate (+40 ms)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=3");
  const ok = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("GuardWordShown", 700)) return false;
    a.queueTypo();
    return a.stepToEvent("Typo", 40);
  });
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-typo-guard") });
  expect(errors).toEqual([]);
});

test("@capture typo, zen (+40 ms)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=4&mode=zen");
  await page.evaluate(() => {
    const a = window.__typingVfx;
    a?.stepToKey(30, { minIndex: 1, notLast: true });
    a?.queueTypo();
  });
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("Typo", 40));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-typo-zen") });
  expect(errors).toEqual([]);
});

test("@capture BLAZING plate (+450 ms after BurstWpm)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=3");
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("BurstWpm", 450));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-blazing") });
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- Chunk B

test("@capture PERFECT shatter (+120 ms): letters burst out of the plate, rings and rays, aura on", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=2.4&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToWord(120, { perfect: true, minLen: 5 }),
  );
  expect(ok).toBe(true);
  const st = await page.evaluate(() => window.__typingVfx?.stats());
  expect(st?.fragments).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: shot("typing-perfect-shatter") });
  expect(errors).toEqual([]);
});

test("@capture converge (+230 ms): the fragments stream into the weapon, the strike beam lands", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=2.4&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToWord(230, { perfect: true, minLen: 5 }),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-converge") });
  expect(errors).toEqual([]);
});

test("@capture ATB ignite (+50 ms, during the time-slow)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=0&seed=2&biome=cave");
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("AtbFilled", 50));
  expect(ok).toBe(true);
  const w = await page.evaluate(() => window.__typingVfx?.worldStats());
  expect(w?.timeScale).toBeLessThan(0.5);
  await page.screenshot({ path: shot("typing-atb-ignite") });
  expect(errors).toEqual([]);
});

test("@capture tier-up to tier 4 (on the downbeat, 250 ms)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=30&tier=cycle&at=0&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToEvent("KeyStreakTierChanged", 250, 4, 60000),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-tierup-t4") });
  expect(errors).toEqual([]);
});

test("@capture tier 4 mid-keystroke in the cave (the aura over a dark world)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=3&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToKey(60, { minIndex: 1, notLast: true }),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-t4-cave") });
  expect(errors).toEqual([]);
});

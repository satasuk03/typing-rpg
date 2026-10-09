/**
 * @capture T6.3 polish round 2 (H2) stills: tier ring + ATB streak at tier 4, a boss ring near the boss bar, skill callouts.
 * 1280x720, frame-exact. Output dir: H2_OUT (default tests/hud/__shots__).
 * Run: LEVEL_PORT=5741 PW_PORT=5741 pnpm exec playwright test -c tests/level/playwright.config.ts h2Stills
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "../vfx/helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.H2_OUT ?? path.join(dir, "__shots__");
const shot = (name: string): string => path.join(out, `${name}.png`);
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(180_000);

test("@capture typing-t4: ring + streak", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=4&at=2.4&biome=forest");
  const ok = await page.evaluate(() => window.__typingVfx?.stepToWord(70, { perfect: true }));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("h2-typing-t4-ring") });
  expect(errors).toEqual([]);
});

test("@capture boss ring near the boss bar", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=4&boss=1&at=0&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToEvent("SentenceWordDone", 60, 2, 60000),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("h2-boss-ring") });
  expect(errors).toEqual([]);
});

test("@capture skill callout", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=3&at=0&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToEvent("SkillCast", 260, 1, 120000),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("h2-skill-callout") });
  expect(errors).toEqual([]);
});

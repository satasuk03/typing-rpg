/**
 * @capture T2.6 Chunk C stills: guard (build, snap, block, parry), sentence bolts, finisher, intensity 0 and
 * reduced motion/flash. 1280x720, real world backdrop, frame-exact.
 * Run: PW_PORT=5199 pnpm --filter game exec playwright test vfx/typing-capture-c
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(180_000);

const GUARD = "wpm=40&tier=3&guard=1&at=0&biome=cave";

test("@capture guard build (3 letters typed): glyph rune arc, barrier preview", async ({
  page,
}) => {
  const errors = await openTyping(page, GUARD);
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToKey(30, { minIndex: 2, guard: true }),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-guard-build") });
  expect(errors).toEqual([]);
});

test("@capture guard snap (+150 ms after the word is typed): wall of hexes, barrier scales in", async ({
  page,
}) => {
  const errors = await openTyping(page, GUARD);
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("GuardWordTyped", 150));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-guard-snap") });
  expect(errors).toEqual([]);
});

test("@capture guard block (+60 ms after impact)", async ({ page }) => {
  const errors = await openTyping(page, GUARD);
  const ok = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("GuardWordShown", 500)) return false;
    a.queueTypo();
    return a.stepToEvent("GuardBlocked", 60);
  });
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-guard-block") });
  expect(errors).toEqual([]);
});

test("@capture guard parry (+70 ms after impact): gold barrier bursts, hit-stop", async ({
  page,
}) => {
  const errors = await openTyping(page, GUARD);
  const ok = await page.evaluate(() => window.__typingVfx?.stepToEvent("GuardParried", 70));
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-guard-parry") });
  expect(errors).toEqual([]);
});

test("@capture sentence bolts (+230 ms after a word): the orb has left the plate, the bolt flies to the boss", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=90&tier=3&boss=1&at=0&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToEvent("SentenceWordDone", 230, 2, 60000),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-sentence-bolts") });
  expect(errors).toEqual([]);
});

test("@capture finisher: the X (+900 ms)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=3&boss=1&at=0&biome=cave");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToEvent("FinisherCompleted", 900, 1, 90000),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-finisher") });
  expect(errors).toEqual([]);
});

test("@capture intensity 0: the information layer only (tier colours, tags, no spectacle)", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=90&tier=4&at=2.4&intensity=0");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToKey(95, { minIndex: 2, notLast: true }),
  );
  expect(ok).toBe(true);
  const st = await page.evaluate(() => window.__typingVfx?.stats());
  expect(st?.sparks).toBe(0);
  await page.screenshot({ path: shot("typing-t4-intensity0") });
  expect(errors).toEqual([]);
});

test("@capture reduced motion + reduced flash at tier 4", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=4&at=2.4&reducedFlash=1&reducedMotion=1");
  const ok = await page.evaluate(() =>
    window.__typingVfx?.stepToKey(95, { minIndex: 2, notLast: true }),
  );
  expect(ok).toBe(true);
  await page.screenshot({ path: shot("typing-t4-reduced") });
  expect(errors).toEqual([]);
});

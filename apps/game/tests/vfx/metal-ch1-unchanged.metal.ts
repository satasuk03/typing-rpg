/**
 * T3.2: Chapter 1 must not change. Real Metal stills of (a) the deterministic typing VFX scene (frame-exact stepping) and
 * (b) an L05 combat frame (auto-attack + crit, frozen on the stage clock). Run from the branch (`TAG=after`) and from a
 * checkout of the base commit (`TAG=before`), then compare the PNGs (`scripts` in the QA notes: the typing scene must be
 * byte-identical; the real-runner frame is compared against the run-to-run noise floor of two `before` runs).
 *
 *   TAG=after RUN=1 PW_PORT=5395 STILL_DIR=/abs/dir pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-ch1-unchanged
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";
import { freeze, openPlay, playTo, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
const TAG = process.env.TAG ?? "after";
const RUN = process.env.RUN ?? "1";
test.setTimeout(300_000);

test("typing VFX scene (deterministic)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=90&tier=4&quality=0&intensity=1&at=1.5");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${TAG}-ch1-typing-vfx-${RUN}.png`) });
  expect(errors, errors.join("\n")).toEqual([]);
});

for (const s of [
  { name: "slash", demo: "slash", at: 0.5 },
  { name: "crit", demo: "crit", at: 0.55 },
]) {
  test(`L05 combat frame ${s.name}`, async ({ page }) => {
    const errors = await openPlay(page, "level=ch1-l05&difficulty=story&seed=4");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    await playTo(page, s.demo, s.at);
    await freeze(page);
    await page.screenshot({ path: path.join(outDir, `${TAG}-ch1-l05-${s.name}-${RUN}.png`) });
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

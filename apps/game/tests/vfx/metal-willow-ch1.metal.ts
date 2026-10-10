/**
 * Willow fix: Chapter 1 must not change. Real Metal stills of Ch1 L2 and L9 (a combat frame) and the L10 Golem boss (a combat
 * frame, plus a frame while it is `broken` when the bot gets there). Run on the base commit (`TAG=before`, twice, for the
 * run-to-run noise floor) and on the branch (`TAG=after`), then compare with `tools`-free PIL (see docs/qa/ch2-willow-fix).
 *
 *   TAG=after RUN=1 PW_PORT=5451 STILL_DIR=/abs/dir pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-willow-ch1
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
const TAG = process.env.TAG ?? "after";
const RUN = process.env.RUN ?? "1";
test.setTimeout(600_000);

for (const id of ["ch1-l02", "ch1-l09"]) {
  test(`${id} combat frame`, async ({ page }) => {
    const errors = await openPlay(page, `level=${id}&difficulty=story&seed=4`);
    await waitPhase(page, "combat");
    await page.waitForTimeout(1500);
    await freeze(page);
    await page.screenshot({ path: path.join(outDir, `${TAG}-${id}-${RUN}.png`) });
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("ch1-l10 Golem boss", async ({ page }) => {
  const errors = await openPlay(page, "level=ch1-l10&difficulty=story&seed=4&wpm-bot=60");
  const got = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 400_000 && got.size < 2) {
    const st = await page.evaluate(() => {
      const v = (window.__play as PlayDebug).view();
      const b = v.enemies.find((e) => e.isBoss && e.alive);
      return { phase: v.phase, boss: !!b, pose: b?.pose ?? "" };
    });
    const which =
      st.boss && st.phase === "combat" ? (st.pose === "broken" ? "broken" : "combat") : "";
    if (which && !got.has(which)) {
      got.add(which);
      await page.waitForTimeout(300);
      await freeze(page);
      await page.screenshot({
        path: path.join(outDir, `${TAG}-ch1-l10-golem-${which}-${RUN}.png`),
      });
      await thaw(page);
    }
    await page.waitForTimeout(100);
  }
  console.log(`GOLEM captured: ${[...got].join(",")}`);
  expect(got.has("combat")).toBe(true);
  expect(errors, errors.join("\n")).toEqual([]);
});

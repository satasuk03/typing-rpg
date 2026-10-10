/**
 * @capture Guard-leak HUD stills (docs/qa/guard-leak-hud/*.jpg), real GPU (metal config), 1280x720.
 *   PERF_PORT=5295 pnpm exec playwright test -c tests/perf/playwright.config.ts guardLeakStills
 * L10 Ruin Golem (leak badge on the boss plate, leak pop on a guard, results hint) and L05 (no badge).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.LEAK_OUT ?? path.resolve(dir, "../../../../docs/qa/guard-leak-hud");
const shot = (name: string): string => path.join(out, `${name}.jpg`);
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(900_000);

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=play&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 30_000 });
  return errors;
}

const jpg = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: shot(name), type: "jpeg", quality: 82 });
};

test("@capture L05 has no leak badge", async ({ page }) => {
  const errors = await open(page, "level=ch1-l05&wpm-bot=40&bot-seed=3");
  await page.waitForFunction(
    () => (window.__play?.view().enemies ?? []).some((e) => e.alive && !e.isBoss),
    undefined,
    { timeout: 120_000, polling: 100 },
  );
  await page.waitForTimeout(1500);
  const leaks = await page.evaluate(() =>
    (window.__play?.view().enemies ?? []).map((e) => e.leakBp ?? 0),
  );
  expect(Math.max(0, ...leaks)).toBe(0);
  await jpg(page, "l05-no-badge");
  expect(errors).toEqual([]);
});

test("@capture L10 Golem badge, leak pop, results hint", async ({ page }) => {
  const errors = await open(page, "level=ch1-l10&wpm-bot=40&bot-seed=5");
  // 1. the badge: boss alive with leakBp > 0 (the preview is on the view from the first frame of the fight)
  await page.waitForFunction(
    () =>
      (window.__play?.view().enemies ?? []).some((e) => e.alive && e.isBoss && (e.leakBp ?? 0) > 0),
    undefined,
    { timeout: 600_000, polling: 100 },
  );
  // 2. a leak pop on a Block/Parry
  await page.waitForFunction(
    () => {
      const play = window.__play as unknown as
        | { session: { hud: { pops: { pops: { kind: string; age: number }[] } } } }
        | undefined;
      const hud = play?.session.hud;
      if (!hud) return false;
      return hud.pops.pops.some((p) => p.kind === "leak" && p.age > 0.2 && p.age < 0.5);
    },
    undefined,
    { timeout: 600_000, polling: 16 },
  );
  await jpg(page, "l10-leak-pop");
  // the badge in a calm in-fight frame (the pop has faded; the fight banner is long gone)
  await page.waitForTimeout(2600);
  await jpg(page, "l10-golem-badge");
  await page.screenshot({
    path: shot("l10-golem-badge-zoom"),
    type: "jpeg",
    quality: 85,
    clip: { x: 380, y: 10, width: 520, height: 100 },
  });
  // 3. results screen (clear or defeat) with the hint line
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout: 800_000,
    polling: 250,
  });
  await page.waitForTimeout(1500);
  await jpg(page, "l10-results-hint");
  const notes = await page.evaluate(() => document.getElementById("r-notes")?.textContent ?? "");
  console.log("RESULT NOTES:", notes);
  expect(errors).toEqual([]);
});

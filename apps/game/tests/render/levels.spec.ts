import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "__shots__", "levels");
mkdirSync(SHOTS, { recursive: true });

const IDS = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function settle(page: Page): Promise<void> {
  // 20 fixed 60 Hz steps: lets flicker/ambient settle, then renders the final one.
  await page.evaluate(() => window.__renderTest?.step(20, 1 / 60));
}

async function openLevel(page: Page, query: string): Promise<void> {
  await page.goto(`/?scene=level&${query}&tier=0&freeze=1`);
  await page.waitForFunction(() => window.__levelScene?.ready === true, undefined, {
    timeout: 120_000,
  });
  await settle(page);
}

for (const id of IDS) {
  test(`level ${id}: walk + battle poses`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openLevel(page, `id=${id}&pose=walk`);
    const walk = await page.screenshot({ path: join(SHOTS, `${id}-walk.png`) });
    expect(walk.length, "walk screenshot should not be blank").toBeGreaterThan(60_000);

    await page.evaluate(() => window.__levelScene?.setPose("battle:1"));
    await settle(page);
    const battle = await page.screenshot({ path: join(SHOTS, `${id}-battle1.png`) });
    expect(battle.length, "battle screenshot should not be blank").toBeGreaterThan(60_000);

    if (id === "ch1-l10") {
      await page.evaluate(() => window.__levelScene?.setPose("boss"));
      await settle(page);
      await page.screenshot({ path: join(SHOTS, `${id}-boss.png`) });
    }
    expect(errors).toEqual([]);
  });
}

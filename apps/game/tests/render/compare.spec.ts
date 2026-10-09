import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "__shots__");
mkdirSync(SHOTS, { recursive: true });

const BIOMES = ["forest", "ruins", "cave", "boss"] as const;
const SIZES = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
] as const;

/** Collects console errors / page errors so every test can assert there are none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function openScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?scene=render-test&${query}`);
  await page.waitForFunction(() => window.__renderTest?.ready === true, undefined, {
    timeout: 120_000,
  });
}

for (const biome of BIOMES) {
  for (const { w, h } of SIZES) {
    test(`render-test ${biome} ${w}x${h}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await openScene(page, `biome=${biome}&tier=0&freeze=1`);
      // 20 fixed 60 Hz steps: lets flicker/ambient settle, then renders the final one.
      await page.evaluate(() => window.__renderTest?.step(20, 1 / 60));
      const buf = await page.screenshot({ path: join(SHOTS, `${biome}-${w}x${h}.png`) });
      expect(buf.length, "screenshot should not be blank").toBeGreaterThan(60_000);
      expect(errors).toEqual([]);
    });
  }
}

test("render-test raw mode (HD-2D off) forest", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openScene(page, "biome=forest&tier=0&freeze=1&raw=1");
  await page.evaluate(() => window.__renderTest?.step(5, 1 / 60));
  await page.screenshot({ path: join(SHOTS, "forest-raw-1280x720.png") });
  expect(errors).toEqual([]);
});

test("quality tiers render without errors and report frame times", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const perf: Record<string, Record<string, { avgMs: number; p95Ms: number; maxMs: number }>> = {};
  for (const biome of ["forest", "cave"] as const) {
    await openScene(page, `biome=${biome}&tier=0&freeze=1`);
    perf[biome] = {};
    for (const tier of [0, 1, 2] as const) {
      const r = await page.evaluate((t) => window.__renderTest?.bench(t, 40), tier);
      expect(r).toBeTruthy();
      perf[biome][`tier${tier}`] = r as { avgMs: number; p95Ms: number; maxMs: number };
      await page.evaluate(() => window.__renderTest?.step(2, 1 / 60));
      await page.screenshot({ path: join(SHOTS, `${biome}-tier${tier}-1280x720.png`) });
    }
  }
  writeFileSync(join(SHOTS, "perf-1280x720.json"), JSON.stringify(perf, null, 2));
  console.log("PERF (headless SwiftShader, ms/frame incl. readPixels sync):", JSON.stringify(perf));
  expect(errors).toEqual([]);
});

test("live loop exposes window.__renderStats and auto-quality does not error", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openScene(page, "biome=cave&tier=0&auto=1");
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => window.__renderStats);
  expect(s?.frames ?? 0).toBeGreaterThan(5);
  console.log("LIVE __renderStats:", JSON.stringify(s));
  expect(errors).toEqual([]);
});

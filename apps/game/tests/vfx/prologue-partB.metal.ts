/**
 * P3.2 Part B at max FX on real Metal: the keep-out / readability probe and the perf measure.
 *   PW_PORT=5441 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts prologue-partB
 *
 * `?scene=prologue&part=vfx&cue=partB` (render/vfx/prologue/devPartB.ts): the real Hud + a wpm-90 bot typing the plates at the
 * pinned tier-4 streak, the real typing VFX, the Word Gate world, and every Part B prologue cue at once (ink pools, the sky tear,
 * Nul's ink lances, the ward, the surge x16 aura). Writes docs/qa/prologue-p3.2/partB-*.{txt,jpg}.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.STILL_DIR ?? join(here, "..", "..", "..", "..", "docs", "qa", "prologue-p3.2");
mkdirSync(OUT, { recursive: true });
const SECONDS = Number(process.env.SECONDS ?? 24);

test.setTimeout(600_000);

test("Part B at max FX: HUD invariants + the cues add no light next to a plate, 0 console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?scene=prologue&part=vfx&cue=partB&wpm=90&quality=0");
  await page.waitForFunction(() => window.__partB?.ready === true, undefined, { timeout: 120_000 });
  const r = await page.evaluate((s) => window.__partB?.sweep(s, 0.5), SECONDS);
  expect(r).toBeTruthy();
  if (!r) return;
  const lines = [
    `part B at max FX, wpm 90, ${SECONDS} s, sample every 0.5 s, quality tier 0`,
    `samples=${r.samples.length}  HUD invariant violations=${r.violations.length}`,
    `world light the cues add inside every plate rect inflated by 40 px (luma 0..1): max=${r.maxDelta.toFixed(4)}  worst sample mean=${r.maxMeanDelta.toFixed(5)}`,
    `keep-out gate: checked=${r.keepOut.checked} dimmed=${r.keepOut.dimmed}`,
    `events=${JSON.stringify(r.events)}`,
    `diag=${JSON.stringify(r.diag)}  aura visual tier=${r.tier}`,
    ...r.violations.slice(0, 20),
  ];
  writeFileSync(join(OUT, "partB-keepout.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  const jpg = await page.screenshot({ type: "jpeg", quality: 80 });
  writeFileSync(join(OUT, "partB-maxfx.jpg"), jpg);
  expect(r.violations).toEqual([]);
  expect(r.maxDelta, "the prologue cues must not light a word plate's surround").toBeLessThan(0.35);
  expect(errors).toEqual([]);
});

test("Part B perf: p95 frame time at tier 0 during the heaviest cue cluster", async ({ page }) => {
  await page.goto("/?scene=prologue&part=vfx&cue=partB&wpm=90&quality=0");
  await page.waitForFunction(() => window.__partB?.ready === true, undefined, { timeout: 120_000 });
  const b = await page.evaluate(() => window.__partB?.bench(900));
  expect(b).toBeTruthy();
  if (!b) return;
  const line = `part B cluster @ tier 0 (1280x720 Metal, hud + wpm-90 bot + typing VFX + every part B cue): avg=${b.avgMs.toFixed(2)} ms p95=${b.p95Ms.toFixed(2)} ms max=${b.maxMs.toFixed(2)} ms over ${b.frames} frames`;
  writeFileSync(join(OUT, "partB-perf.txt"), `${line}\n`);
  console.log(line);
  expect(b.p95Ms).toBeLessThan(18);
});

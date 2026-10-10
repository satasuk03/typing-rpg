/**
 * T2.6 Chunk C: the typing VFX in the REAL level runner (stage + HUD + router gate + presentation queue), at
 * maximum intensity, with the browser bot playing L1 (guard words) and L10 (boss: doom sentences, rubble, finisher).
 * About every second the page is sampled:
 *   1. the HUD invariants (`checkSnapshot`, run here in Node on the page's snapshot) must hold;
 *   2. the next letter of the target plate must stay legible in the real composite: its HUD cell is read from the
 *      HUD canvas (the layer above WebGL) and the glyph core must keep contrast >= 4.5 against the cell and
 *      >= 3 against the ring around it (same adapted metric as tests/hud/typingReadability.spec.ts).
 * The run must also end with zero console errors, the effects must really have been running (sparks, guard
 * barrier, bolts, finisher), and the presentation queue must not have lost an event.
 *
 * Run: pnpm exec playwright test -c tests/level/playwright.config.ts typing-fx
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { open, playAndProbe } from "./fxProbe";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);

test.use({ viewport: { width: 1280, height: 720 } });

test.describe("typing VFX in the real level runner", () => {
  test("L1 at 60 WPM, intensity 1: readability holds through guard words, zero console errors", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = await open(page, "level=ch1-l01&wpm-bot=60&bot-seed=11&intensity=1");
    let shotGuard = false;
    const rep = await playAndProbe(
      page,
      (p) => p.resultsShown(),
      700_000,
      async (s) => {
        if (!shotGuard && s.barrier > 0.3) {
          shotGuard = true;
          await page.screenshot({ path: shot("fx-l1-guard") });
        }
      },
    );
    const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
    await page.screenshot({ path: shot("fx-l1-end") });
    console.log(
      `L1 fx: ${JSON.stringify({ ...rep, kinds: [...rep.kinds], violations: rep.violations.length })} seen guards=${seen.GuardWordTyped ?? 0}`,
    );
    expect(rep.violations, rep.violations.slice(0, 8).join("\n")).toEqual([]);
    expect(rep.checked).toBeGreaterThan(20);
    expect(rep.maxSparks, "the typing FX must be running").toBeGreaterThan(5);
    expect(seen.GuardWordTyped ?? 0, "the bot defended at least once").toBeGreaterThan(0);
    expect(rep.maxBarrier, "the guard barrier appeared").toBeGreaterThan(0.2);
    expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
    expect(rep.minRing).toBeGreaterThanOrEqual(3);
    expect(errors, errors.join("\n")).toEqual([]);
    const pe = await page.evaluate(() => (window.__play as PlayDebug).consoleErrors);
    expect(pe).toEqual([]);
  });

  test("L10 at 75 WPM, intensity 1: boss sentences, bolts, finisher, readability holds", async ({
    page,
  }) => {
    test.setTimeout(1_200_000);
    const errors = await open(
      page,
      "level=ch1-l10&wpm-bot=75&bot-acc=0.97&bot-seed=21&intensity=1",
    );
    let shotBolt = false;
    let shotFin = false;
    const rep = await playAndProbe(
      page,
      (p) => p.resultsShown() || p.phase() === "failed",
      1_000_000,
      async (s) => {
        if (!shotBolt && s.boltsLaunched > 2) {
          shotBolt = true;
          await page.screenshot({ path: shot("fx-l10-bolts") });
        }
        if (!shotFin && s.kind === "finisher") {
          shotFin = true;
          await page.screenshot({ path: shot("fx-l10-finisher-plate") });
        }
      },
    );
    const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
    const outcome = await page.evaluate(
      () => (window.__play as PlayDebug).result()?.outcome ?? null,
    );
    await page.screenshot({ path: shot("fx-l10-end") });
    console.log(
      `L10 fx: ${JSON.stringify({ ...rep, kinds: [...rep.kinds], violations: rep.violations.length })} outcome=${outcome} sentence=${seen.SentenceWordDone ?? 0} finisher=${seen.FinisherCompleted ?? 0}`,
    );
    expect(rep.violations, rep.violations.slice(0, 8).join("\n")).toEqual([]);
    expect(rep.checked).toBeGreaterThan(20);
    expect(rep.maxSparks).toBeGreaterThan(5);
    expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
    expect(rep.minRing).toBeGreaterThanOrEqual(3);
    expect(errors, errors.join("\n")).toEqual([]);
    const pe = await page.evaluate(() => (window.__play as PlayDebug).consoleErrors);
    expect(pe).toEqual([]);
  });
});

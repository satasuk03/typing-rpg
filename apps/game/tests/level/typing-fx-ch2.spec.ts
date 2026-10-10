/**
 * Ch2 real-runner readability sweep (CH2_PLAN DoD 6): the same invariants as `typing-fx.spec.ts` (HUD snapshot
 * invariants incl. "letter outside its plate" and "pop/tag covers a letter", next-letter contrast >= 4.5 against the
 * cell and >= 3 against the ring in the real composite) while the browser bot plays ch2-l01 (exact-case Shift
 * lesson), ch2-l05 and ch2-l10 (Whispering Willow: Hush Spells, riddle phase, finisher). Zero console errors.
 *
 * Run (from apps/game): LEVEL_PORT=5522 ./node_modules/.bin/playwright test -c tests/level/playwright.config.ts typing-fx-ch2
 * Real GPU (recommended, much faster): add LEVEL_GL=metal.
 */
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { open, playAndProbe } from "./fxProbe";

test.use({ viewport: { width: 1280, height: 720 } });

const LEVELS: { id: string; seed: number; sentences: boolean }[] = [
  { id: "ch2-l01", seed: 11, sentences: false },
  { id: "ch2-l05", seed: 13, sentences: false },
  { id: "ch2-l10", seed: 21, sentences: true },
];

test.describe("Ch2 typing readability in the real level runner", () => {
  for (const lv of LEVELS) {
    test(`${lv.id} at 75 WPM: readability invariants hold, zero console errors`, async ({
      page,
    }) => {
      test.setTimeout(1_200_000);
      const errors = await open(
        page,
        `level=${lv.id}&wpm-bot=75&bot-acc=0.97&bot-seed=${lv.seed}&intensity=1`,
      );
      const rep = await playAndProbe(
        page,
        (p) => p.resultsShown() || p.phase() === "failed",
        1_000_000,
      );
      const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
      const outcome = await page.evaluate(
        () => (window.__play as PlayDebug).result()?.outcome ?? null,
      );
      console.log(
        `${lv.id} fx: ${JSON.stringify({ ...rep, kinds: [...rep.kinds], violations: rep.violations.length })} outcome=${outcome} sentence=${seen.SentenceWordDone ?? 0}`,
      );
      expect(rep.violations, rep.violations.slice(0, 8).join("\n")).toEqual([]);
      expect(rep.checked).toBeGreaterThan(20);
      expect(rep.maxSparks, "the typing FX must be running").toBeGreaterThan(5);
      if (lv.sentences)
        expect(seen.SentenceWordDone ?? 0, "the Hush Spells were played").toBeGreaterThan(0);
      expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
      expect(rep.minRing).toBeGreaterThanOrEqual(3);
      expect(errors, errors.join("\n")).toEqual([]);
      const pe = await page.evaluate(() => (window.__play as PlayDebug).consoleErrors);
      expect(pe).toEqual([]);
    });
  }
});

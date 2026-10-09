/**
 * @capture T2.6 spec 12.2: the 10 s captures at 40 and 90 WPM as contact sheets (5 x 6 grid, every 10th frame of
 * 30 fps). Two sequences per pace:
 *   tiers : tier=cycle with guard words, so all five tiers, the tier-ups, the typo reset and the guard play on camera
 *   boss  : the window is centred on the finisher of the boss sentences (doom words, bolts, the cinematic)
 * Sheets go to __shots__/sheets/. Run: PW_PORT=5199 pnpm --filter game exec playwright test vfx/typing-sheets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = (name: string): string => path.join(dir, "__shots__", "sheets", `${name}.png`);
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(600_000);

const OPTS = { seconds: 10, fps: 30, every: 10, cols: 5, rows: 6, cw: 448, ch: 252 };

function write(file: string, dataUrl: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1] as string, "base64"));
}

for (const wpm of [40, 90]) {
  test(`@capture 10 s sheet, ${wpm} WPM: all tiers, tier-ups, typo reset, guard`, async ({
    page,
  }) => {
    const errors = await openTyping(page, `wpm=${wpm}&tier=cycle&guard=1&at=0&seed=3&biome=cave`);
    const url = await page.evaluate(
      (o) => window.__typingVfx?.sheet({ ...o, title: `${o.title}` }) ?? "",
      { ...OPTS, title: `T2.6 typing VFX, ${wpm} WPM, 10 s, tier cycle + guard words (cave)` },
    );
    expect(url.length).toBeGreaterThan(1000);
    write(out(`typing-${wpm}wpm-tiers-guard`), url);
    const seen = await page.evaluate(() => window.__typingVfx?.eventCounts());
    expect(seen?.KeyStreakTierChanged ?? 0).toBeGreaterThanOrEqual(4);
    expect(seen?.GuardWordTyped ?? 0).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test(`@capture 10 s sheet, ${wpm} WPM: boss sentences, bolts, finisher`, async ({ page }) => {
    // 1. find when the finisher lands (a fast probe run)
    await openTyping(page, `wpm=${wpm}&tier=4&boss=1&at=0&seed=3`);
    const tFin = await page.evaluate(() => {
      const a = window.__typingVfx;
      return a?.stepToEvent("FinisherCompleted", 0, 1, 120000) ? a.time() : -1;
    });
    expect(tFin).toBeGreaterThan(0);
    // 2. the same run again, starting 6 s before it, so the window holds sentence words, the finisher plate and the X
    const start = Math.max(0, tFin - 6);
    const errors = await openTyping(page, `wpm=${wpm}&tier=4&boss=1&at=${start.toFixed(2)}&seed=3`);
    const url = await page.evaluate((o) => window.__typingVfx?.sheet(o) ?? "", {
      ...OPTS,
      title: `T2.6 typing VFX, ${wpm} WPM, 10 s, boss: doom sentence bolts and the finisher (cave)`,
    });
    write(out(`typing-${wpm}wpm-boss-finisher`), url);
    const seen = await page.evaluate(() => window.__typingVfx?.eventCounts());
    expect(seen?.FinisherCompleted ?? 0).toBeGreaterThanOrEqual(1);
    expect(seen?.SentenceWordDone ?? 0).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

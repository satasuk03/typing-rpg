/**
 * Hero silhouette pixel test (Chunk B art-direction fix): at the peaks of the ATB ignite and the tier-4
 * tier-up the hero must stay readable. Per scenario the page composites WebGL + HUD with the hero shown and
 * hidden at the same frame, with the FX on and then off, and measures:
 *   area  = hero pixels that differ from the hero-less frame (a washed-out hero loses area)
 *   edge  = Sobel edge energy over those pixels (a white-out loses edges)
 * Requirement: on/off ratio >= 0.75 for both (T6.3 #3; was 0.6). The combat library (skill cast, crit, chest + slash)
 * is covered in the real runner by `heroSilhouettePlay.spec.ts`; the guard parry and the tier-4 sentence/finisher
 * moments are covered here.
 */
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(120_000);

const MIN_RATIO = 0.75;

interface Probe {
  area: number;
  edge: number;
}
const ratios = (on: Probe, off: Probe): { area: number; edge: number } => ({
  area: on.area / Math.max(1, off.area),
  edge: on.edge / Math.max(1, off.edge),
});

const CASES: { name: string; params: string; reach: string; afterMs: number; nth?: number }[] = [
  {
    name: "ATB ignite +20, cave",
    params: "wpm=40&tier=4&at=0&seed=2&biome=cave",
    reach: "AtbFilled",
    afterMs: 20,
  },
  {
    name: "ATB ignite +60, cave",
    params: "wpm=40&tier=4&at=0&seed=2&biome=cave",
    reach: "AtbFilled",
    afterMs: 60,
  },
  {
    name: "ATB ignite +40, forest",
    params: "wpm=40&tier=4&at=0&seed=2&biome=forest",
    reach: "AtbFilled",
    afterMs: 40,
  },
  {
    name: "guard parry +70, cave",
    params: "wpm=40&tier=3&guard=1&at=0&biome=cave",
    reach: "GuardParried",
    afterMs: 70,
  },
  {
    name: "guard parry +20, cave tier 4",
    params: "wpm=40&tier=4&guard=1&at=0&biome=cave",
    reach: "GuardParried",
    afterMs: 20,
  },
  {
    name: "tier-4 word payoff +120 (PERFECT, strike beam), forest",
    params: "wpm=40&tier=4&at=2.4&biome=forest",
    reach: "WordCompleted",
    afterMs: 120,
  },
  {
    name: "tier-up to T4, cave",
    params: "wpm=30&tier=cycle&at=0&biome=cave",
    reach: "KeyStreakTierChanged",
    afterMs: 250,
    nth: 4,
  },
  {
    name: "tier-up to T4, forest",
    params: "wpm=30&tier=cycle&at=0&biome=forest",
    reach: "KeyStreakTierChanged",
    afterMs: 250,
    nth: 4,
  },
];

for (const c of CASES) {
  test(`hero silhouette stays distinguishable: ${c.name}`, async ({ page }, info) => {
    const errors = await openTyping(page, c.params);
    const ok = await page.evaluate(
      ([type, ms, nth]) =>
        window.__typingVfx?.stepToEvent(type as string, ms as number, nth as number, 60000),
      [c.reach, c.afterMs, c.nth ?? 1],
    );
    expect(ok).toBe(true);
    const on = await page.evaluate(() => window.__typingVfx?.heroProbe());
    if (on) {
      const r = on.rect;
      await page.screenshot({
        path: info.outputPath(`hero-on.png`),
        clip: {
          x: Math.max(0, r.x - 120),
          y: Math.max(0, r.y - 60),
          width: r.w + 240,
          height: r.h + 120,
        },
      });
    }
    await page.evaluate(() => window.__typingVfx?.setEnabled(false));
    const off = await page.evaluate(() => window.__typingVfx?.heroProbe());
    expect(on && off).toBeTruthy();
    if (!on || !off) return;
    const r = ratios(on, off);
    console.log(
      `${c.name}: area ${r.area.toFixed(2)} edge ${r.edge.toFixed(2)} (off area ${off.area})`,
    );
    expect(off.area).toBeGreaterThan(400);
    expect(r.area).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(r.edge).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(errors).toEqual([]);
  });
}

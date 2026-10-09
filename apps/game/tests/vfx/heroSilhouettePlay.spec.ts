/**
 * T6.3 #3 / #4: the hero stays readable in the REAL runner (`?scene=play&demo=1`), where the combat library plays.
 *
 * Silhouette: for each effect the world is frozen on the stage clock at the peak, the page renders the frame with
 * the hero shown and hidden and counts the hero's pixels (area) and edge energy; the baseline is the same
 * demo with `effectsIntensity` 0 (no spectacle, same hero pose). ratio on/off >= 0.75.
 *
 * Contrast (caves): the hero's mean luminance against its 64 px surround in the real L9 and L10 caves >= 2.0
 * (WCAG form, see render/vfx/heroProbe.ts).
 */
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import {
  freeze,
  openPlay,
  type PlayProbe,
  playTo,
  probeHero,
  thaw,
  waitPhase,
} from "./playHelpers";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(300_000);

const MIN_RATIO = 0.75;
const MIN_CONTRAST = 2.0;

async function intensity(page: Page, k: number): Promise<void> {
  await page.evaluate((v) => {
    (window.__play as PlayDebug).session.hud.setSettings({ effectsIntensity: v });
  }, k);
}

async function aura4(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only
    ((window.__play as any).session.typingFx.handle.worldFx.aura as any).setForceMax(v);
  }, on);
}

interface Case {
  name: string;
  demos: string[];
  /** Stage seconds after the LAST demo starts. */
  at: number;
  /** Seconds between the first and the last demo (chest + slash). */
  gap?: number;
  aura4?: boolean;
}

const CASES: Case[] = [
  { name: "skill cast (fireball)", demos: ["fireball"], at: 0.2 },
  { name: "skill cast (fireball), tier-4 aura", demos: ["fireball"], at: 0.2, aura4: true },
  { name: "crit (3-hit sword)", demos: ["crit"], at: 0.6 },
  { name: "sword slash", demos: ["slash"], at: 0.45 },
  { name: "chest + slash", demos: ["chest:Gold", "slash"], at: 0.45, gap: 1.0 },
  { name: "aegis bubble", demos: ["aegis"], at: 0.75 },
];

async function run(page: Page, c: Case): Promise<PlayProbe> {
  if (c.aura4) await aura4(page, true);
  for (let i = 0; i < c.demos.length; i++) {
    const last = i === c.demos.length - 1;
    await playTo(page, c.demos[i] as string, last ? c.at : (c.gap ?? 0.3));
  }
  await freeze(page);
  const m = await probeHero(page);
  await thaw(page);
  await page.evaluate(() => (window.__play as PlayDebug).demo?.("off"));
  if (c.aura4) await aura4(page, false);
  return m;
}

for (const c of CASES) {
  test(`hero silhouette in the runner: ${c.name}`, async ({ page }) => {
    const errors = await openPlay(page, "level=ch1-l08&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    await intensity(page, 0);
    const off = await run(page, c);
    await page.waitForTimeout(2500);
    await intensity(page, 1);
    const on = await run(page, c);
    const area = on.area / Math.max(1, off.area);
    const edge = on.edge / Math.max(1, off.edge);
    console.log(
      `${c.name}: area ${area.toFixed(2)} edge ${edge.toFixed(2)} (off area ${off.area}, contrast ${on.contrast.toFixed(2)})`,
    );
    expect(off.area).toBeGreaterThan(400);
    expect(area).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(edge).toBeGreaterThanOrEqual(MIN_RATIO);
    expect(errors).toEqual([]);
  });
}

for (const level of ["ch1-l09", "ch1-l10"]) {
  test(`hero contrast against a 64 px surround in the cave: ${level}`, async ({ page }) => {
    const errors = await openPlay(page, `level=${level}&difficulty=story&seed=11`);
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    await freeze(page);
    const m = await probeHero(page);
    console.log(
      `${level}: contrast ${m.contrast.toFixed(2)} (hero ${m.heroLum.toFixed(3)}, surround ${m.surroundLum.toFixed(3)}, area ${m.area})`,
    );
    expect(m.area).toBeGreaterThan(400);
    expect(m.contrast).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(errors).toEqual([]);
  });
}

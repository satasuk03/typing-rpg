/**
 * T3.1 Chapter 2 HUD elements: riddle panel + leaf plates, the shift cue, the healer badge/ring and the elite tag.
 * Every sweep runs at max FX (effects intensity 1) and requires 0 violations from `checkSnapshot`
 * (plates never overlap, the riddle panel never overlaps a plate, no cue/tag/pop covers a letter).
 * Set CH2_SHOTS_DIR to also write review stills.
 */
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { HudDebugSnapshot } from "../../src/hud";
import { checkSnapshot } from "../../src/hud/invariants";

test.use({ viewport: { width: 1280, height: 720 } });

async function open(
  page: import("@playwright/test").Page,
  query: string,
  at: number,
): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=hud-test&${query}&at=${at}&pause=1&intensity=1`);
  await page.waitForFunction(() => window.__hudDebug?.ready === true, undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(150);
  return errors;
}

const snap = (page: import("@playwright/test").Page): Promise<HudDebugSnapshot> =>
  page.evaluate(() => {
    const d = window.__hudDebug;
    if (!d) throw new Error("no hook");
    return d.snapshot();
  });

async function shot(page: import("@playwright/test").Page, name: string): Promise<void> {
  const dir = process.env.CH2_SHOTS_DIR;
  if (dir) await page.screenshot({ path: path.join(dir, name) });
}

test("riddle: panel with 3 leaf plates, never overlapping, 0 violations over 3 riddles at 40/90 wpm", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const wpm of [40, 90]) {
    const errors = await open(page, `riddle=1&scenario=boss&wpm=${wpm}`, 4);
    const s = await snap(page);
    expect(s.riddlePanelRect, "panel is visible").not.toBeNull();
    expect(s.plates.filter((p) => p.kind === "minigame")).toHaveLength(3);
    expect(s.cues?.leaves).toBe(3);
    expect(checkSnapshot(s)).toEqual([]);
    if (wpm === 40) await shot(page, "riddle-panel.jpg");
    const res = await page.evaluate(() => window.__hudDebug?.sweep(60, 0.1));
    expect(res?.violations, `riddle@${wpm}`).toEqual([]);
    expect(errors).toEqual([]);
  }
});

test("riddle: previous-riddle feedback line appears from riddle 2 on", async ({ page }) => {
  await open(page, "riddle=1&scenario=boss&wpm=40", 4);
  await page.evaluate(() => window.__hudDebug?.sweep(30, 0.5)); // crosses into riddle 2 (25 s riddles)
  const s = await snap(page);
  expect(s.riddlePanelRect).not.toBeNull();
  await shot(page, "riddle-feedback.jpg");
  expect(checkSnapshot(s)).toEqual([]);
});

for (const scenario of ["forest", "boss", "cave"]) {
  test(`shift cue: ${scenario} exact-case plates, 0 violations at 40/90 wpm`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const wpm of [40, 90]) {
      const errors = await open(page, `shift=1&scenario=${scenario}&wpm=${wpm}`, 0);
      let cued = 0;
      for (let i = 0; i < 12; i++) {
        const res = await page.evaluate(() => window.__hudDebug?.sweep(3, 0.1));
        expect(res?.violations, `${scenario}@${wpm}`).toEqual([]);
        const s = await snap(page);
        if (s.cues?.shiftCue.length) {
          cued++;
          expect(s.cueRects?.length).toBeGreaterThan(0);
          // the next letter stays fully visible: the cue is outside every letter rect
          expect(checkSnapshot(s)).toEqual([]);
          if (scenario === "boss" && wpm === 40) await shot(page, "shift-cue.jpg");
        }
      }
      expect(cued, "the shift cue was exercised").toBeGreaterThan(0);
      expect(errors).toEqual([]);
    }
  });
}

test("healer + elite: badge, ring and tag render, 0 violations over a sweep", async ({ page }) => {
  test.setTimeout(120_000);
  for (const scenario of ["forest", "cave"]) {
    for (const wpm of [40, 90]) {
      const errors = await open(page, `healer=1&elite=1&scenario=${scenario}&wpm=${wpm}`, 6);
      const s = await snap(page);
      expect(s.cues?.healers).toBeGreaterThanOrEqual(1);
      expect(s.cues?.elites).toBeGreaterThanOrEqual(1);
      expect(s.tagRects?.length).toBeGreaterThanOrEqual(1);
      expect(checkSnapshot(s)).toEqual([]);
      if (scenario === "forest" && wpm === 40) await shot(page, "healer-elite.jpg");
      const res = await page.evaluate(() => window.__hudDebug?.sweep(40, 0.1));
      expect(res?.violations, `${scenario}@${wpm}`).toEqual([]);
      expect(errors).toEqual([]);
    }
  }
});

test("fading words: faded plates dim, the next letter stays >= 0.85, 0 violations at 40/90 wpm", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const scenario of ["forest", "boss"]) {
    for (const wpm of [40, 90]) {
      const errors = await open(page, `fading=1&scenario=${scenario}&wpm=${wpm}`, 1);
      let seen = 0;
      for (let i = 0; i < 24; i++) {
        const res = await page.evaluate(() => window.__hudDebug?.sweep(2, 0.1));
        expect(res?.violations, `${scenario}@${wpm}`).toEqual([]);
        const s = await snap(page);
        const faded = s.plates.filter((p) => p.faded);
        for (const p of faded) {
          seen++;
          expect(p.nextAlpha ?? 1).toBeGreaterThanOrEqual(0.85);
        }
        expect(checkSnapshot(s)).toEqual([]);
        if (faded.length && scenario === "forest" && wpm === 40) await shot(page, "fading.jpg");
      }
      expect(seen, "a faded plate was exercised").toBeGreaterThan(0);
      expect(errors).toEqual([]);
    }
  }
});

test("heals: a green +N pop and HP flash, 0 violations at 40/90 wpm", async ({ page }) => {
  test.setTimeout(120_000);
  for (const wpm of [40, 90]) {
    const errors = await open(
      page,
      `healer=1&elite=1&heals=1&fading=1&scenario=forest&wpm=${wpm}`,
      1,
    );
    let pops = 0;
    for (let i = 0; i < 60; i++) {
      const res = await page.evaluate(() => window.__hudDebug?.sweep(1, 0.1));
      expect(res?.violations, `heal@${wpm}`).toEqual([]);
      const s = await snap(page);
      if (s.popTexts.some((x) => /^\+\d+$/.test(x))) {
        pops++;
        if (wpm === 40 && pops === 1) await shot(page, "heal-pop.jpg");
      }
      expect(checkSnapshot(s)).toEqual([]);
    }
    expect(pops, "a heal pop was shown").toBeGreaterThan(0);
    expect(errors).toEqual([]);
  }
});

test("everything at once at max FX with reduced settings variants renders without errors", async ({
  page,
}) => {
  const errors = await open(
    page,
    "healer=1&elite=1&shift=1&scenario=forest&wpm=90&reducedFlash=1&reducedMotion=1",
    5,
  );
  const res = await page.evaluate(() => window.__hudDebug?.sweep(20, 0.1));
  expect(res?.violations).toEqual([]);
  expect(errors).toEqual([]);
});

// Ch1 regression stills (before/after the T3.1 HUD change): CH1_SHOTS_DIR=<dir> writes PNGs of the default scenarios.
for (const c of [
  { name: "forest-40wpm", scenario: "forest", wpm: 40, at: 6.9 },
  { name: "cave-crit-break", scenario: "cave", wpm: 90, at: 1.75 },
  { name: "boss-sentence", scenario: "boss", wpm: 40, at: 11.9 },
  { name: "stress-6-plates", scenario: "stress", wpm: 40, at: 4 },
]) {
  test(`ch1 default scenario still: ${c.name}`, async ({ page }) => {
    const dir = process.env.CH1_SHOTS_DIR;
    test.skip(!dir, "CH1_SHOTS_DIR not set");
    await open(page, `scenario=${c.scenario}&wpm=${c.wpm}`, c.at);
    await page.screenshot({ path: path.join(dir as string, `${c.name}.png`) });
  });
}

// Review stills for the Ch2 HUD follow-ups (fading, heal pop + bar flash, gold capital pop, elite trim):
// CH2_SHOTS_DIR=<dir> writes JPEGs.
test.describe("ch2 follow-up stills", () => {
  test.skip(!process.env.CH2_SHOTS_DIR, "CH2_SHOTS_DIR not set");
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

  const jpeg = async (
    page: import("@playwright/test").Page,
    name: string,
    clip?: { x: number; y: number; width: number; height: number },
  ): Promise<void> => {
    await page.screenshot({
      path: path.join(process.env.CH2_SHOTS_DIR as string, name),
      type: "jpeg",
      quality: 80,
      clip,
    });
  };
  type R = { x: number; y: number; w: number; h: number };
  const clipOf = (r: R, pad: number) => ({
    x: Math.max(0, r.x - pad),
    y: Math.max(0, r.y - pad),
    width: Math.min(1280, r.w + 2 * pad),
    height: Math.min(720, r.h + 2 * pad),
  });

  test("fading plate, next letter readable", async ({ page }) => {
    await open(page, "fading=1&scenario=forest&wpm=40", 1);
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.__hudDebug?.sweep(0.25, 0.25));
      const s = await snap(page);
      const p = s.plates.find((x) => x.faded && x.isTarget && x.letters.length > 4);
      // wait for a calm frame: the next letter not in a typo glitch, the last typed letter's pop settled
      const calm = await page.evaluate((id) => {
        const d = window.__hudDebug;
        const pl = d?.driver().view.plates.find((x) => x.id === id);
        if (!d || !pl || pl.typedIndex !== 2) return false;
        return (
          d.hud.plateFx.letter(id, pl.typedIndex, false).glitch === 0 &&
          d.hud.plateFx.letter(id, pl.typedIndex - 1, false).flash < 0.05
        );
      }, p?.id ?? -1);
      if (p && calm && p.nextAlpha != null) {
        await jpeg(page, "fading-plate.jpg", clipOf(p.rect, 140));
        return;
      }
    }
    throw new Error("no faded target plate");
  });

  test("heal +N pop with the bar flash, and the elite plate trim", async ({ page }) => {
    await open(page, "healer=1&elite=1&heals=1&scenario=forest&wpm=40", 1);
    let heal = false;
    for (let i = 0; i < 400 && !heal; i++) {
      await page.evaluate(() => window.__hudDebug?.sweep(0.05, 0.05));
      const s = await snap(page);
      const k = s.popTexts.findIndex((x) => /^\+\d+$/.test(x));
      if (k >= 0) {
        await jpeg(page, "heal-pop.jpg", clipOf(s.popRects[k] as R, 130));
        heal = true;
      }
    }
    expect(heal).toBe(true);
    const elite = await page.evaluate(() => {
      const v = window.__hudDebug?.driver().view;
      const e = v?.enemies.find((x) => x.elite);
      return e ? (v?.plates.find((p) => p.ownerId === e.id)?.id ?? null) : null;
    });
    expect(elite).not.toBeNull();
    const s = await snap(page);
    const ep = s.plates.find((p) => p.id === elite);
    expect(ep).toBeTruthy();
    await jpeg(page, "elite-trim.jpg", clipOf((ep as { rect: R }).rect, 40));
  });

  test("capital letter pop mixes gold", async ({ page }) => {
    await open(page, "shift=1&scenario=forest&wpm=40", 0);
    for (let i = 0; i < 600; i++) {
      await page.evaluate(() => window.__hudDebug?.sweep(0.03, 0.03));
      const hit = await page.evaluate(() => {
        const d = window.__hudDebug;
        if (!d) return null;
        for (const p of d.driver().view.plates) {
          const idx = p.typedIndex - 1;
          if (idx < 0 || !/^[A-Z]$/.test(p.text[idx] ?? "")) continue;
          const lf = d.hud.plateFx.letter(p.id, idx, false);
          if (lf.gold && lf.flash > 0.4) return p.id;
        }
        return null;
      });
      if (hit !== null) {
        const s = await snap(page);
        const pl = s.plates.find((p) => p.id === hit);
        await jpeg(page, "capital-gold-pop.jpg", clipOf((pl as { rect: R }).rect, 60));
        return;
      }
    }
    throw new Error("no gold capital pop caught");
  });
});

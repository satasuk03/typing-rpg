/**
 * T2.6 Chunk B: the world half over the real RenderWorld (dev scene ?scene=typing-vfx).
 * Aura, intensity / quality / accessibility scaling, the ATB-filled time-slow, and the presentation
 * queue hand-off (chip deferral, causal order). All frame-exact via `__typingVfx.step`.
 */
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(120_000);

test("tier 4: the hero aura is on (level, held light, motes) and the sim is untouched", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=2");
  const st = await page.evaluate(() => {
    window.__typingVfx?.step(800);
    return window.__typingVfx?.worldStats();
  });
  expect(st?.auraLevel).toBeGreaterThan(0.95);
  expect(st?.auraTier).toBe(4);
  expect(st?.auraLight).toBeGreaterThan(0.5);
  expect((st?.poolA ?? 0) + (st?.poolB ?? 0)).toBeGreaterThan(10);
  expect(st?.lightsLive).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("intensity 0 keeps only the information layer: no aura, no particles, no light", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=2&intensity=0");
  const st = await page.evaluate(() => {
    window.__typingVfx?.step(800);
    return window.__typingVfx?.worldStats();
  });
  expect(st?.auraLight).toBe(0);
  expect(st?.poolA).toBe(0);
  expect(st?.poolB).toBe(0);
  expect(st?.postFlash).toBe(0);
  expect(st?.vignette).toBe(0);
  expect(errors).toEqual([]);
});

test("quality tier 2 drops the held aura light and caps world pool A", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=4&at=2");
  const hi = await page.evaluate(() => window.__typingVfx?.worldStats());
  expect(hi?.poolAUsed).toBe(576); // T2.3 raised pool A (384 in the spec)
  // the real world quality tier drives the scaling (auto fallback included)
  await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a) return;
    // the dev scene owns the world: lower its tier through the typing handle's world
    (a.fx.worldFx as unknown as { world: { setQuality(t: number): void } }).world.setQuality(2);
    a.step(300);
  });
  const lo = await page.evaluate(() => window.__typingVfx?.worldStats());
  expect(lo?.poolAUsed).toBe(288);
  expect(lo?.auraLight).toBe(0);
  expect(lo?.auraLevel).toBeGreaterThan(0.9); // the shapes and motes still carry the read
  expect(errors).toEqual([]);
});

test("ATB filled: render time-slow (0.25x for ~100 ms, then back to 1)", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=2&at=0");
  const scales = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("AtbFilled", 0)) return null;
    const out: number[] = [];
    for (let i = 0; i < 16; i++) {
      out.push(a.worldStats().timeScale);
      a.step(1000 / 60);
    }
    return out;
  });
  expect(scales).not.toBeNull();
  expect(Math.min(...(scales ?? [1]))).toBeCloseTo(0.25, 1);
  expect(scales?.[scales.length - 1]).toBe(1);
  expect(errors).toEqual([]);
});

test("ATB filled with reduced motion: no time-slow", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=2&at=0&reducedMotion=1");
  const scales = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("AtbFilled", 0)) return null;
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      out.push(a.worldStats().timeScale);
      a.step(1000 / 60);
    }
    return out;
  });
  expect(scales).not.toBeNull();
  expect(Math.min(...(scales ?? [0]))).toBe(1);
  expect(errors).toEqual([]);
});

test("reduced flash: the post flash stays 0 through a tier-4 tier-up", async ({ page }) => {
  const errors = await openTyping(page, "wpm=30&tier=cycle&at=0&reducedFlash=1");
  const peak = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("KeyStreakTierChanged", 0, 4, 60000)) return -1;
    let m = 0;
    for (let i = 0; i < 40; i++) {
      m = Math.max(m, a.worldStats().postFlash);
      a.step(1000 / 60);
    }
    return m;
  });
  expect(peak).toBe(0);
  expect(errors).toEqual([]);
});

test("tier-4 tier-up: the post flash is capped at 0.12 (R6) and decays", async ({ page }) => {
  const errors = await openTyping(page, "wpm=30&tier=cycle&at=0");
  const r = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a?.stepToEvent("KeyStreakTierChanged", 0, 4, 60000)) return null;
    let m = 0;
    let after = 1;
    for (let i = 0; i < 40; i++) {
      m = Math.max(m, a.worldStats().postFlash);
      a.step(1000 / 60);
      if (i === 39) after = a.worldStats().postFlash;
    }
    return { m, after };
  });
  expect(r).not.toBeNull();
  expect(r?.m).toBeGreaterThan(0.02);
  expect(r?.m).toBeLessThanOrEqual(0.1201);
  expect(r?.after).toBe(0);
  expect(errors).toEqual([]);
});

test("a streak reset gutters the aura out over ~600 ms and puffs smoke", async ({ page }) => {
  const errors = await openTyping(page, "wpm=40&tier=cycle&at=9.2");
  const r = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a) return null;
    a.step(100);
    const before = a.worldStats();
    if (!a.stepToEvent("KeyStreakTierChanged", 100)) return null;
    const mid = a.worldStats();
    a.step(700);
    const late = a.worldStats();
    return { before, mid, late };
  });
  expect(r).not.toBeNull();
  expect(r?.before.auraTier).toBe(4);
  expect(r?.before.auraLevel).toBeGreaterThan(0.9);
  expect(r?.mid.auraTier).toBe(0);
  expect(r?.mid.auraLevel).toBeGreaterThan(0.1); // still fading, not cut
  expect(r?.mid.auraLevel).toBeLessThan(r?.before.auraLevel ?? 0);
  expect(r?.late.auraLevel).toBe(0);
  expect(errors).toEqual([]);
});

test("chip hand-off: the chip hit is held back ~380 ms and presents before the same enemy's later events", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=40&tier=1&at=2");
  const r = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a) return null;
    const seen: { type: string; ms: number }[] = [];
    let now = 0;
    const prev = a.fx.onPresent;
    a.fx.onPresent = (e) => {
      seen.push({ type: `${e.type}${e.type === "Hit" ? `:${e.kind}` : ""}`, ms: now });
      prev(e);
    };
    if (!a.stepToWord(0)) return null;
    const q0 = a.worldStats().queued;
    const t: number[] = [];
    for (let i = 0; i < 30; i++) {
      a.step(1000 / 60);
      now += 1000 / 60;
      t.push(a.worldStats().queued);
    }
    return { q0, queuedOverTime: t, seen };
  });
  expect(r).not.toBeNull();
  // the chip was deferred (a boss sentence or a word both end in a chip / finisher hit)
  expect(r?.q0).toBeGreaterThanOrEqual(1);
  // 380 ms = 23 frames: still queued at frame 15, released by frame 26
  expect(r?.queuedOverTime[14]).toBeGreaterThanOrEqual(1);
  expect(r?.queuedOverTime[26]).toBe(0);
  const chip = r?.seen.find((s) => s.type === "Hit:chip");
  expect(chip, "the deferred chip came out of onPresent").toBeDefined();
  expect(chip?.ms).toBeGreaterThan(300);
  expect(chip?.ms).toBeLessThan(460);
  expect(errors).toEqual([]);
});

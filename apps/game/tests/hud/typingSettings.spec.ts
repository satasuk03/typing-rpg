/** T2.6 spec 10.5: accessibility and intensity settings keep the information layer and never break. */
import { expect, test } from "@playwright/test";
import { openTyping } from "../vfx/helpers";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(120_000);

test("intensity 0 keeps the information layer (tier tint, next letter) and spawns no spectacle", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=90&tier=4&intensity=0&at=2");
  const res = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a) throw new Error("no hook");
    let maxSparks = 0;
    let maxStreaks = 0;
    let tinted = 0;
    let frames = 0;
    for (let i = 0; i < 60; i++) {
      a.step(100);
      const st = a.stats();
      maxSparks = Math.max(maxSparks, st.sparks);
      maxStreaks = Math.max(maxStreaks, st.streaks);
      const id = a.driver().view.targetPlateId;
      if (id !== null) {
        frames++;
        if (a.hud.plateFx.tint(id)?.prism) tinted++;
      }
    }
    return { maxSparks, maxStreaks, tinted, frames, violations: a.readability() };
  });
  expect(res.maxSparks).toBe(0);
  expect(res.maxStreaks).toBe(0);
  expect(res.tinted, "tier colours are information: always on").toBeGreaterThan(res.frames * 0.8);
  expect(res.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("reduced flash + reduced motion: no errors, no bounce, fixed prismatic pink", async ({
  page,
}) => {
  const errors = await openTyping(page, "wpm=90&tier=4&reducedFlash=1&reducedMotion=1&at=2");
  const res = await page.evaluate(() => {
    const a = window.__typingVfx;
    if (!a) throw new Error("no hook");
    let maxOffset = 0;
    for (let i = 0; i < 60; i++) {
      a.step(100);
      const id = a.driver().view.targetPlateId;
      if (id !== null) {
        const o = a.hud.plateFx.offset(id, 1.23);
        maxOffset = Math.max(maxOffset, Math.abs(o.dx), Math.abs(o.dy));
      }
    }
    return { maxOffset, violations: a.readability(), events: a.eventCounts() };
  });
  expect(res.maxOffset).toBe(0);
  expect(res.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("quality tiers 0/1/2 and zen mode run clean", async ({ page }) => {
  for (const q of ["quality=1", "quality=2", "mode=zen&quality=0"]) {
    const errors = await openTyping(page, `wpm=90&tier=cycle&${q}&at=3&typoAt=4,5`);
    const res = await page.evaluate(() => {
      const a = window.__typingVfx;
      if (!a) throw new Error("no hook");
      for (let i = 0; i < 60; i++) a.step(100);
      return { stats: a.stats(), violations: a.readability() };
    });
    expect(res.violations, q).toEqual([]);
    expect(errors, q).toEqual([]);
  }
});

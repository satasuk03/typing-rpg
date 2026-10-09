import { describe, expect, it } from "vitest";
import type { LetterFxState } from "../../src/hud/fx";
import { PlateFx } from "../../src/hud/fx";
import { letterPopCurve } from "../../src/hud/fx/typing/letterPop";
import { DEFAULT_HUD_SETTINGS, type HudSettings } from "../../src/hud/settings";

const S = (o: Partial<HudSettings> = {}): HudSettings => ({ ...DEFAULT_HUD_SETTINGS, ...o });
const blank = (): LetterFxState => ({
  scale: 1,
  flash: 0,
  glitch: 0,
  crack: false,
  glowPx: 0,
  liftPx: 0,
  glitchDx: 0,
  split: 0,
  amber: false,
});

describe("letterPopCurve (spec 2.1)", () => {
  it("hits the keyframes: 1.35 / white at t0, white until 40 ms, settles at 200 ms", () => {
    const o = blank();
    letterPopCurve(0, false, S(), o);
    expect(o.scale).toBeCloseTo(1.35);
    expect(o.flash).toBeCloseTo(1);
    expect(o.glowPx).toBeCloseTo(16);
    expect(o.liftPx).toBeCloseTo(3);
    letterPopCurve(40, false, S(), o);
    expect(o.scale).toBeCloseTo(1.18);
    expect(o.flash).toBeCloseTo(1);
    letterPopCurve(90, false, S(), o);
    expect(o.scale).toBeCloseTo(0.97);
    expect(o.flash).toBeCloseTo(0.45);
    letterPopCurve(140, false, S(), o);
    expect(o.scale).toBeCloseTo(1.02);
    expect(o.flash).toBeCloseTo(0.15);
    letterPopCurve(200, false, S(), o);
    expect(o.scale).toBe(1);
    expect(o.flash).toBe(0);
    expect(o.glowPx).toBe(0);
  });
  it("peak scale is capped at 1.35 (word) and 1.245 (sentence), R4", () => {
    const o = blank();
    let max = 0;
    for (let ms = 0; ms < 200; ms += 2) {
      letterPopCurve(ms, false, S(), o);
      max = Math.max(max, o.scale);
    }
    expect(max).toBeLessThanOrEqual(1.35 + 1e-9);
    letterPopCurve(0, true, S(), o);
    expect(o.scale).toBeCloseTo(1.245);
  });
  it("settings: intensity scales the excess, reducedMotion is colour only, reducedFlash caps the white", () => {
    const o = blank();
    letterPopCurve(0, false, S({ effectsIntensity: 0.5 }), o);
    expect(o.scale).toBeCloseTo(1.175);
    expect(o.flash).toBeCloseTo(0.5);
    letterPopCurve(0, false, S({ reducedMotion: true }), o);
    expect(o.scale).toBe(1);
    expect(o.liftPx).toBe(0);
    expect(o.flash).toBe(1);
    letterPopCurve(0, false, S({ reducedFlash: true }), o);
    expect(o.flash).toBeCloseTo(0.35);
    letterPopCurve(0, false, S({ effectsIntensity: 0 }), o);
    expect(o.scale).toBe(1);
    expect(o.flash).toBe(0);
  });
});

describe("PlateFx reactions", () => {
  it("pop then settle: letter() reports the curve and goes idle after 200 ms", () => {
    const fx = new PlateFx();
    fx.pop(1, 2);
    expect(fx.letter(1, 2).scale).toBeCloseTo(1.35);
    expect(fx.letter(1, 3).scale).toBe(1);
    for (let i = 0; i < 13; i++) fx.update(1 / 60);
    expect(fx.letter(1, 2).scale).toBe(1);
  });
  it("press bounce (spec 2.4): down, overshoot up by half, back to 0 within 150 ms; restarts per key", () => {
    const fx = new PlateFx();
    fx.press(1, 4);
    expect(fx.offset(1, 0).dy).toBeCloseTo(0);
    fx.update(0.035);
    expect(fx.offset(1, 0).dy).toBeCloseTo(4, 1);
    fx.update(0.055);
    expect(fx.offset(1, 0).dy).toBeCloseTo(-2, 1);
    fx.update(0.07);
    expect(fx.offset(1, 0).dy).toBeCloseTo(0);
    fx.press(1, 4); // a new key restarts the curve instead of accumulating
    fx.update(0.035);
    expect(fx.offset(1, 0).dy).toBeLessThanOrEqual(4.0001);
  });
  it("reducedMotion removes bounce and shake", () => {
    const fx = new PlateFx();
    fx.settings = S({ reducedMotion: true });
    fx.press(1, 4);
    fx.shake(1, 3, 0.2);
    expect(fx.offset(1, 0.01)).toEqual({ dx: 0, dy: 0 });
  });
  it("typo glitch (spec 6): red hold 120 ms, lerp back by 300 ms, 3 discrete jitter steps, split 80 ms", () => {
    const fx = new PlateFx();
    fx.glitch(1, 4, false);
    let l = fx.letter(1, 4);
    expect(l.glitch).toBe(1);
    expect(l.glitchDx).toBe(2);
    expect(l.split).toBe(1);
    expect(l.scale).toBe(1); // never shrunk or enlarged
    fx.update(0.045);
    l = fx.letter(1, 4);
    expect(l.glitchDx).toBe(-2);
    fx.update(0.04);
    l = fx.letter(1, 4);
    expect(l.glitchDx).toBe(1);
    expect(l.split).toBe(0); // split ended at 80 ms
    fx.update(0.04);
    l = fx.letter(1, 4);
    expect(l.glitchDx).toBe(0);
    expect(l.glitch).toBeLessThan(1);
    expect(l.glitch).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) fx.update(1 / 60);
    expect(fx.letter(1, 4).glitch).toBe(0);
  });
  it("zen glitch is amber and lasts 200 ms with no split", () => {
    const fx = new PlateFx();
    fx.glitch(1, 0, true);
    const l = fx.letter(1, 0);
    expect(l.amber).toBe(true);
    expect(l.split).toBe(0);
    expect(l.glitchDx).toBe(0);
    for (let i = 0; i < 13; i++) fx.update(1 / 60);
    expect(fx.letter(1, 0).glitch).toBe(0);
  });
  it("cracks: at most 3 per plate, the oldest is replaced, and they fade out", () => {
    const fx = new PlateFx();
    for (const i of [1, 2, 3]) {
      fx.crack(1, i);
      fx.update(0.1);
    }
    fx.crack(1, 9);
    const shown = [0, 1, 2].map((s) => fx.crackAt(1, s)?.index).filter((x) => x !== undefined);
    expect(shown).toHaveLength(3);
    expect(shown).toContain(9);
    expect(shown).not.toContain(1);
    for (let i = 0; i < 80; i++) fx.update(1 / 60);
    expect([0, 1, 2].map((s) => fx.crackAt(1, s))).toEqual([null, null, null]);
  });
  it("the sentence plates letters grow beyond 32 cells without trouble", () => {
    const fx = new PlateFx();
    fx.pop(1, 70);
    fx.glitch(1, 100, false);
    expect(fx.letter(1, 70).scale).toBeGreaterThan(1);
    expect(fx.letter(1, 100).glitch).toBe(1);
  });
  it("muted (A/B readability capture): no pop, tint, offset or sweep", () => {
    const fx = new PlateFx();
    fx.pop(1, 0);
    fx.press(1, 4);
    fx.setTint(1, { typed: "#fff" });
    fx.sweep(1);
    fx.muted = true;
    expect(fx.letter(1, 0).scale).toBe(1);
    expect(fx.tint(1)).toBeNull();
    expect(fx.offset(1, 0)).toEqual({ dx: 0, dy: 0 });
    expect(fx.sweepProgress(1)).toBe(-1);
  });
  it("border flash is white for the hold, then lerps back; sweep runs once in 180 ms", () => {
    const fx = new PlateFx();
    fx.flashBorder(1, 60, 200);
    expect(fx.borderFlash(1)).toBe(1);
    fx.update(0.07);
    expect(fx.borderFlash(1)).toBeLessThan(1);
    fx.update(0.3);
    expect(fx.borderFlash(1)).toBe(0);
    fx.sweep(2);
    expect(fx.sweepProgress(2)).toBe(0);
    fx.update(0.09);
    expect(fx.sweepProgress(2)).toBeCloseTo(0.5, 1);
    fx.update(0.2);
    expect(fx.sweepProgress(2)).toBe(-1);
  });
});

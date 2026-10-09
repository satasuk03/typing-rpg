import { describe, expect, it } from "vitest";
import {
  MAX_POPS,
  POP_LIFETIME,
  POP_STACK_STEP,
  PopSystem,
  popAlpha,
  popScale,
} from "../../src/hud/pops";
import { DEFAULT_HUD_SETTINGS, normalizeSettings } from "../../src/hud/settings";
import { layoutText } from "../../src/hud/textLayout";
import {
  contrastRatio,
  KEY_STREAK_COLORS,
  keyStreakColor,
  keyStreakProgress,
  PLATE_PALETTES,
  palettePlateContrast,
} from "../../src/hud/theme";
import { guardPulseSpeed, timerStrip } from "../../src/hud/timer";

describe("guard timer strip math", () => {
  it("is full at the start, empty at impact, clamped outside", () => {
    expect(timerStrip(180, 120, 60)?.remaining).toBeCloseTo(1);
    expect(timerStrip(180, 120, 120)?.remaining).toBeCloseTo(0.5);
    expect(timerStrip(180, 120, 180)?.remaining).toBe(0);
    expect(timerStrip(180, 120, 400)?.remaining).toBe(0);
    expect(timerStrip(180, 120, 0)?.remaining).toBe(1);
  });
  it("urgency starts in the last 30% and turns critical past 60% of that", () => {
    expect(timerStrip(200, 100, 100)?.urgency).toBe(0); // 100% left
    expect(timerStrip(200, 100, 170)?.urgency).toBe(0); // 30% left
    const mid = timerStrip(200, 100, 185); // 15% left
    expect(mid?.urgency).toBeCloseTo(0.5);
    expect(mid?.critical).toBe(false);
    expect(timerStrip(200, 100, 190)?.critical).toBe(true); // 10% left
    expect(timerStrip(200, 100, 200)?.urgency).toBe(1);
  });
  it("supports fractional interpolation ticks and reports seconds", () => {
    const t = timerStrip(120, 120, 90.5);
    expect(t?.secondsLeft).toBeCloseTo(29.5 / 60, 5);
  });
  it("returns null for plates without a timer", () => {
    expect(timerStrip(null, null, 5)).toBeNull();
    expect(timerStrip(10, 0, 5)).toBeNull();
  });
  it("pulse speeds up with urgency", () => {
    expect(guardPulseSpeed(1)).toBeGreaterThan(guardPulseSpeed(0));
  });
});

describe("damage pops: lifetime and stacking", () => {
  it("expires every kind after its lifetime", () => {
    for (const kind of Object.keys(POP_LIFETIME) as (keyof typeof POP_LIFETIME)[]) {
      const ps = new PopSystem();
      ps.spawn(kind, "1", { kind: "hero" });
      ps.update(POP_LIFETIME[kind] - 0.01);
      expect(ps.pops.length).toBe(1);
      ps.update(0.02);
      expect(ps.pops.length).toBe(0);
    }
  });
  it("stacks pops on the same anchor without overlapping", () => {
    const ps = new PopSystem();
    const a = ps.spawn("dmg", "40", { kind: "enemy", id: 3 });
    const b = ps.spawn("weak", "WEAK", { kind: "enemy", id: 3 });
    const c = ps.spawn("tag", "CRIT", { kind: "enemy", id: 3 });
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 2]);
    expect(a.stackY).toBe(0);
    expect(b.stackY).toBe(POP_STACK_STEP.dmg);
    expect(c.stackY).toBe(POP_STACK_STEP.dmg + POP_STACK_STEP.weak);
  });
  it("does not stack across different anchors or after the stack window", () => {
    const ps = new PopSystem();
    ps.spawn("dmg", "1", { kind: "enemy", id: 1 });
    expect(ps.spawn("dmg", "2", { kind: "enemy", id: 2 }).slot).toBe(0);
    ps.update(0.5);
    expect(ps.spawn("dmg", "3", { kind: "enemy", id: 1 }).slot).toBe(0);
  });
  it("caps the live pop count, dropping chips first", () => {
    const ps = new PopSystem();
    ps.spawn("crit", "BIG", { kind: "hero" });
    for (let i = 0; i < MAX_POPS + 10; i++) ps.spawn("chip", "1", { kind: "enemy", id: i });
    expect(ps.pops.length).toBe(MAX_POPS);
    expect(ps.pops.some((p) => p.kind === "crit")).toBe(true);
  });
  it("fades out over the last 22% and punches in", () => {
    expect(popAlpha({ age: 0.5, dur: 1 })).toBe(1);
    expect(popAlpha({ age: 0.89, dur: 1 })).toBeCloseTo(0.5, 1);
    expect(popAlpha({ age: 1, dur: 1 })).toBe(0);
    expect(popScale(0)).toBeCloseTo(2.1);
    expect(popScale(0.14)).toBe(1);
    expect(popScale(0, true)).toBe(1);
  });
  it("is deterministic for the same spawn sequence", () => {
    const run = () => {
      const ps = new PopSystem();
      for (let i = 0; i < 8; i++) ps.spawn("dmg", String(i), { kind: "enemy", id: i % 2 });
      return ps.pops.map((p) => [p.vx, p.stackY]);
    };
    expect(run()).toEqual(run());
  });
});

describe("theme: contrast and key-streak tiers", () => {
  it("every plate palette keeps letter contrast >= 4.5 on its lightest background", () => {
    for (const [k, p] of Object.entries(PLATE_PALETTES)) {
      expect(palettePlateContrast(p), k).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("contrast maths matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
  it("key-streak tiers switch at 10/25/50/100 with the specified colours", () => {
    expect(keyStreakProgress(0).tier).toBe(0);
    expect(keyStreakProgress(9).tier).toBe(0);
    expect(keyStreakProgress(10).tier).toBe(1);
    expect(keyStreakProgress(25).tier).toBe(2);
    expect(keyStreakProgress(50).tier).toBe(3);
    expect(keyStreakProgress(99).tier).toBe(3);
    expect(keyStreakProgress(100).tier).toBe(4);
    expect(keyStreakProgress(100).next).toBeNull();
    expect(keyStreakProgress(17).frac).toBeCloseTo(7 / 15);
    expect(KEY_STREAK_COLORS[0]).toBe("#ffffff");
    expect(keyStreakColor(1, 0)).toBe(KEY_STREAK_COLORS[1]);
    expect(keyStreakColor(4, 0.5)).toMatch(/^hsl/);
    expect(keyStreakColor(4, 0.5, true)).toBe(KEY_STREAK_COLORS[4]);
  });
});

describe("text layout and settings", () => {
  it("assigns every character index exactly one cell, in order", () => {
    const t = "the old stone wakes and the ground shakes";
    const l = layoutText(t, 14);
    expect(l.cells.map((c) => c.index)).toEqual([...t].map((_, i) => i));
    expect(l.lineCount).toBeGreaterThan(1);
    expect(l.cols).toBeLessThanOrEqual(14);
    for (const c of l.cells) if (!c.isSpace) expect(t[c.index]).not.toBe(" ");
  });
  it("keeps a single word on one line", () => {
    const l = layoutText("dance", 99);
    expect(l.lineCount).toBe(1);
    expect(l.cols).toBe(5);
  });
  it("clamps accessibility settings", () => {
    const s = normalizeSettings({ effectsIntensity: 3, reducedFlash: true }, DEFAULT_HUD_SETTINGS);
    expect(s.effectsIntensity).toBe(1);
    expect(s.reducedFlash).toBe(true);
    expect(normalizeSettings({ effectsIntensity: -1 }, s).effectsIntensity).toBe(0);
  });
});

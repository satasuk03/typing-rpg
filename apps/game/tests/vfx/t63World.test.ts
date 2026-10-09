/**
 * T6.3 world polish units (pure, no GPU): hero probe maths, tier-4 hue drift, parry flash, sentence bolts, finisher
 * caps, flame / rune colours from the layout, boss-add fade, the coin fountain size.
 */
import { describe, expect, it } from "vitest";
import { ADDS_FADE_SEC } from "../../src/level/stage";
import { HERO_ALPHA_CAP } from "../../src/render/materials/heroGuard";
import { accentRgb, hexLinear, T4_HUE_DEG_PER_SEC } from "../../src/render/vfx/colors";
import { coinCount } from "../../src/render/vfx/combat/params";
import {
  CA_MAX,
  FLASH_MS,
  FLASH_PEAK,
  FLASH_RGB,
  ZOOM_MAX,
} from "../../src/render/vfx/FinisherCinematic";
import { PARRY_FLASH } from "../../src/render/vfx/GuardBarrier";
import { analyseHero } from "../../src/render/vfx/heroProbe";
import {
  BOLT_APEX,
  BOLT_CORE,
  BOLT_FLIGHT_S,
  BOLT_HALO,
  BOLT_TRAIL_SAMPLES,
} from "../../src/render/vfx/SentenceBolts";
import { loadLevel } from "../../src/render/world/registry";

function rgba(
  w: number,
  h: number,
  f: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  return d;
}

describe("hero probe (analyseHero)", () => {
  const W = 200;
  const H = 200;
  const bg = (): [number, number, number] => [20, 24, 40];
  const inHero = (x: number, y: number): boolean => x >= 80 && x < 120 && y >= 60 && y < 140;
  const hidden = rgba(W, H, bg);

  it("counts the hero's pixels and measures contrast against the surround", () => {
    const shown = rgba(W, H, (x, y) => (inHero(x, y) ? [200, 190, 180] : bg()));
    const m = analyseHero(shown, hidden, W, H, 24, 64);
    expect(m.area).toBe(40 * 80);
    expect(m.contrast).toBeGreaterThan(2);
    expect(m.heroLum).toBeGreaterThan(m.surroundLum);
  });

  it("a dark hero on a dark ground reads as low contrast (the L9 cave before the rim light)", () => {
    const shown = rgba(W, H, (x, y) => (inHero(x, y) ? [70, 72, 90] : bg()));
    const m = analyseHero(shown, hidden, W, H, 24, 64);
    expect(m.contrast).toBeLessThan(2);
  });

  it("an effect that covers the hero removes its area and edges", () => {
    const covered = rgba(W, H, () => [255, 255, 255]);
    const hiddenCovered = rgba(W, H, () => [255, 255, 255]);
    const m = analyseHero(covered, hiddenCovered, W, H);
    expect(m.area).toBe(0);
    expect(m.edge).toBe(0);
  });
});

describe("tier-4 prismatic drift (T6.3 #17)", () => {
  it("is 0.25 Hz: one full hue cycle in 4 s", () => {
    expect(T4_HUE_DEG_PER_SEC).toBeCloseTo(90, 6);
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    accentRgb(4, 1.3, false, a);
    accentRgb(4, 1.3 + 4, false, b);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i] as number, 6);
  });

  it("never jumps between frames: at most 1.5 degrees of hue per 60 Hz frame (no strobe)", () => {
    expect(T4_HUE_DEG_PER_SEC / 60).toBeLessThanOrEqual(1.5);
  });
});

describe("parry flash (T6.3 #14)", () => {
  it("core #7fe8ff, rim #3ab8ff, 140 ms, r 0.9 u, 6 hex shards", () => {
    expect(PARRY_FLASH.coreHex).toBe("#7fe8ff");
    expect(PARRY_FLASH.rimHex).toBe("#3ab8ff");
    expect(PARRY_FLASH.ms).toBe(140);
    expect(PARRY_FLASH.radius).toBe(0.9);
    expect(PARRY_FLASH.shards).toBe(6);
    // cyan, not near-white: the red channel stays well under green and blue
    const core = hexLinear(PARRY_FLASH.coreHex);
    expect(core[0]).toBeLessThan(core[1] * 0.45);
  });
});

describe("sentence bolts (T6.3 #15)", () => {
  it("core 0.35 u, halo 1.2 u, 6-sample trail, 250 ms flight, 1.2 u arc", () => {
    expect(BOLT_CORE).toBe(0.35);
    expect(BOLT_HALO).toBe(1.2);
    expect(BOLT_TRAIL_SAMPLES).toBe(6);
    expect(BOLT_FLIGHT_S).toBe(0.25);
    expect(BOLT_APEX).toBe(1.2);
  });
});

describe("finisher (T6.3 #16)", () => {
  it("CA <= 0.006, zoom <= 0.04", () => {
    expect(CA_MAX).toBeLessThanOrEqual(0.006);
    expect(ZOOM_MAX).toBeLessThanOrEqual(0.04);
  });
  it("the flash is warm [1, 0.92, 0.75] and below 0.1 by 120 ms", () => {
    expect([...FLASH_RGB]).toEqual([1, 0.92, 0.75]);
    // TypingWorldFx.update: v -= dt * (1000 / ms) * cap
    const v = (tMs: number): number =>
      Math.max(0, FLASH_PEAK - (tMs / 1000) * (1000 / FLASH_MS) * FLASH_PEAK);
    expect(v(120)).toBeLessThan(0.1);
    expect(FLASH_PEAK).toBeLessThanOrEqual(0.35);
  });
});

describe("hero guard (T6.3 #3)", () => {
  it("aura alpha over the hero body is capped at 0.35", () => {
    expect(HERO_ALPHA_CAP).toBeLessThanOrEqual(0.35);
  });
});

describe("layout colours (T6.3 #9)", () => {
  const l10 = loadLevel("ch1-l10");
  it("L10: two of three torches are violet, the rune decals are violet", () => {
    const torches = l10.props.filter((p) => p.flame > 0);
    expect(torches.length).toBe(3);
    const violet = torches.filter((p) => p.flameColor !== undefined);
    expect(violet.length).toBe(2);
    for (const t of violet) {
      const c = t.flameColor as readonly [number, number, number];
      expect(c[2]).toBeGreaterThan(c[1]); // blue above green: violet, not orange
    }
    expect(l10.runes.length).toBeGreaterThan(0);
    for (const r of l10.runes) {
      expect(r.color).toBeDefined();
      const c = r.color as readonly [number, number, number];
      expect(c[0]).toBeGreaterThan(c[1]);
      expect(c[2]).toBeGreaterThan(c[1]);
    }
  });
  it("every other level keeps the default flame and rune colours (field absent)", () => {
    for (const id of ["ch1-l01", "ch1-l05", "ch1-l09"]) {
      const l = loadLevel(id);
      expect(l.props.every((p) => p.flameColor === undefined)).toBe(true);
      expect(l.scatters.every((s) => s.flameColor === undefined)).toBe(true);
      expect(l.runes.every((r) => r.color === undefined)).toBe(true);
    }
  });
});

describe("boss adds (T6.3 #7) and the coin fountain (T2.3 weak spot)", () => {
  it("adds fade in over 300 ms", () => {
    expect(ADDS_FADE_SEC).toBe(0.3);
  });
  it("the fountain is more generous than before (was 6 + amount / 12, cap 40)", () => {
    expect(coinCount(240, "encounter")).toBeGreaterThan(6 + Math.floor(240 / 12));
    expect(coinCount(240, "encounter")).toBeGreaterThanOrEqual(40);
  });
});

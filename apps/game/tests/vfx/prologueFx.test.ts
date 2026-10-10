/**
 * P3.2 prologue VFX (Node): every cutscene vfx id has a renderer, the cue numbers are pinned, the cues are pure functions of
 * (seed, age), and the event bindings reach the sink only on a prologue (story levels have no sink).
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REGISTRIES } from "../../src/cutscene/timeline";
import { PROLOGUE_VFX_IDS } from "../../src/cutscene/types";
import { BINDINGS, type BindingCtx } from "../../src/level/eventBindings";
import { surgeSteps } from "../../src/render/vfx/HeroAura";
import { CUE_RENDERERS, GATE_GLYPH_COUNT } from "../../src/render/vfx/prologue/cues";
import { FONT_3X5, glyphIndex } from "../../src/render/vfx/prologue/GlyphBatch";
import {
  AURA_COLLAPSE,
  bezier3,
  EMBER,
  emberLevel,
  gateDarkenTotalMs,
  glyphLit,
  INK_RISE,
  inkPoolRadius,
  inkRiseOffsetY,
  LETTER_VORTEX,
  nulLift,
  rnd,
  SILENCE_FOG,
  silenceFogDensity,
  skyTearWidth,
  sunDim,
  THEFT,
  THEFT_RGB,
} from "../../src/render/vfx/prologue/params";

describe("every prologue vfx id has a renderer (enumeration)", () => {
  it("DEFAULT_REGISTRIES.vfx (the cutscene's own registry) resolves to a renderer, and nothing extra", () => {
    for (const id of DEFAULT_REGISTRIES.vfx) {
      expect(typeof (CUE_RENDERERS as Record<string, unknown>)[id], `renderer for ${id}`).toBe(
        "function",
      );
    }
    expect(Object.keys(CUE_RENDERERS).sort()).toEqual([...DEFAULT_REGISTRIES.vfx].sort());
    expect(Object.keys(CUE_RENDERERS).sort()).toEqual([...PROLOGUE_VFX_IDS].sort());
  });
  it("the 13 ids of interfaces §14.4 are all there", () => {
    expect(PROLOGUE_VFX_IDS.length).toBe(13);
    for (const id of [
      "letterVortex",
      "silenceFog",
      "inkRise",
      "skyTear",
      "hushBolt",
      "ward",
      "surgeAura",
      "catchFireball",
      "inkWrite",
      "theftStream",
      "auraCollapse",
      "gateDarken",
      "ember",
    ])
      expect((PROLOGUE_VFX_IDS as readonly string[]).includes(id), id).toBe(true);
  });
});

describe("the cue numbers (art direction §3)", () => {
  it("rnd is a deterministic hash in [0, 1)", () => {
    for (let i = 0; i < 200; i++) {
      const v = rnd(123, i, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(rnd(123, i, 4)).toBe(v);
    }
    expect(rnd(1, 2, 3)).not.toBe(rnd(2, 2, 3));
  });
  it("inkRise: the pool opens 0-250, holds, closes 850-1250; the sprite rises -1.2 m -> 0 (250-850 ms)", () => {
    expect(inkPoolRadius(0)).toBe(0);
    expect(inkPoolRadius(INK_RISE.open)).toBeCloseTo(0.9, 6);
    expect(inkPoolRadius(600)).toBeCloseTo(0.9, 6);
    expect(inkPoolRadius(INK_RISE.total)).toBe(0);
    expect(inkRiseOffsetY(0)).toBe(-1.2);
    expect(inkRiseOffsetY(250)).toBe(-1.2);
    expect(Math.abs(inkRiseOffsetY(850))).toBeLessThan(1e-9);
    expect(Math.abs(inkRiseOffsetY(2000))).toBeLessThan(1e-9);
  });
  it("skyTear: 0.25 -> 3.0 m in 400 ms, held; the close narrows over 600 ms, a 160 ms line, then gone", () => {
    expect(skyTearWidth(0, null)).toBeCloseTo(0.25, 2);
    expect(skyTearWidth(400, null)).toBeGreaterThan(2.9);
    expect(skyTearWidth(5000, null)).toBeLessThanOrEqual(3.0 + 1e-9);
    expect(skyTearWidth(4000, 4000)).toBeGreaterThan(2);
    expect(skyTearWidth(4300, 4000)).toBeLessThan(skyTearWidth(4000, 4000));
    expect(skyTearWidth(4650, 4000)).toBeCloseTo(0.06, 6);
    expect(skyTearWidth(4800, 4000)).toBe(0);
  });
  it("theftStream: six hues, one per skill; 36 motes a strand, 2 strands; the stream lands at 820 ms", () => {
    expect(THEFT_RGB.length).toBe(6);
    expect(THEFT.motes).toBe(36);
    expect(THEFT.strands).toBe(2);
    expect(THEFT.flyEnd).toBe(820);
    // six hues spread around the wheel: no two adjacent thefts match
    for (let i = 1; i < 6; i++) {
      const a = THEFT_RGB[i - 1] as readonly number[];
      const b = THEFT_RGB[i] as readonly number[];
      const d = Math.hypot(
        (a[0] ?? 0) - (b[0] ?? 0),
        (a[1] ?? 0) - (b[1] ?? 0),
        (a[2] ?? 0) - (b[2] ?? 0),
      );
      expect(d, `thefts ${i} and ${i + 1} must differ`).toBeGreaterThan(1);
    }
    const o: [number, number, number] = [0, 0, 0];
    expect(bezier3(o, 0, [0, 0, 0], [1, 2, 0], [2, 2, 0], [3, 0, 0])).toEqual([0, 0, 0]);
    expect(bezier3(o, 1, [0, 0, 0], [1, 2, 0], [2, 2, 0], [3, 0, 0])).toEqual([3, 0, 0]);
  });
  it("gateDarken: 120 ms per glyph, left to right, each fading over 160 ms", () => {
    expect(GATE_GLYPH_COUNT).toBeGreaterThanOrEqual(40);
    expect(glyphLit(0, 0)).toBe(1);
    expect(glyphLit(0, 160)).toBe(0);
    expect(glyphLit(3, 360)).toBe(1);
    expect(glyphLit(3, 360 + 160)).toBe(0);
    expect(glyphLit(10, 500)).toBe(1);
    expect(gateDarkenTotalMs(GATE_GLYPH_COUNT)).toBe((GATE_GLYPH_COUNT - 1) * 120 + 160);
  });
  it("letterVortex: at most 120 live at tier 0 (60 /s for 1.6 s = 96); Nul lifts 0 -> 9 m", () => {
    expect(LETTER_VORTEX.ratePerS * LETTER_VORTEX.lifeS).toBeLessThanOrEqual(LETTER_VORTEX.maxLive);
    expect(nulLift(0)).toBe(0);
    expect(nulLift(LETTER_VORTEX.riseMs)).toBeCloseTo(9, 6);
  });
  it("silenceFog: fog 0.012 -> 0.03 by 3.2 s (the wide), back to 0.016 by 5 s (the close-up cut)", () => {
    expect(silenceFogDensity(0)).toBeCloseTo(0.012, 6);
    expect(silenceFogDensity(SILENCE_FOG.peakMs)).toBeCloseTo(0.03, 6);
    expect(silenceFogDensity(SILENCE_FOG.backMs)).toBeCloseTo(0.016, 6);
    expect(silenceFogDensity(20000)).toBeCloseTo(0.016, 6);
  });
  it("ember: ramps in over 600 ms and breathes within +-12%", () => {
    expect(emberLevel(0)).toBe(0);
    for (let t = 600; t < 5000; t += 37) {
      expect(emberLevel(t)).toBeGreaterThan(1 - 0.121);
      expect(emberLevel(t)).toBeLessThan(1 + 0.121);
    }
    expect(EMBER.radius).toBe(3.0);
  });
  it("the sun glows dim with the theft ramp (rays / 1.5): 1 -> 0.2/1.5", () => {
    expect(sunDim(0)).toBe(1);
    expect(sunDim(1)).toBeCloseTo(0.2 / 1.5, 9);
    expect(sunDim(0.5)).toBeLessThan(sunDim(0.24));
  });
  it("auraCollapse timings and the HeroAura surge steps", () => {
    expect(AURA_COLLAPSE.smokeFrom).toBe(760);
    expect([1, 2, 4, 8, 16, 32].map(surgeSteps)).toEqual([0, 1, 2, 3, 4, 4]);
  });
  it("the pixel font covers A-Z with 3x5 bitmaps", () => {
    expect(Object.keys(FONT_3X5).length).toBe(26);
    for (const rows of Object.values(FONT_3X5)) {
      expect(rows.length).toBe(5);
      for (const r of rows) expect(r).toMatch(/^[01]{3}$/);
    }
    expect(glyphIndex("a")).toBe(0);
    expect(glyphIndex("Z")).toBe(25);
  });
});

describe("event bindings reach the prologue sink only on a prologue", () => {
  const ev = (type: string, extra: Record<string, unknown> = {}) =>
    ({ type, tick: 1, ...extra }) as never;
  const sink = () => ({
    enemySpawned: vi.fn(),
    bossIntro: vi.fn(),
    enemyAttack: vi.fn(),
    hit: vi.fn(),
    climax: vi.fn(),
  });
  const run = (type: keyof typeof BINDINGS, ctx: BindingCtx, e: never) => {
    // biome-ignore lint/suspicious/noExplicitAny: table lookup by name
    (BINDINGS[type] as any).prologue?.(e, ctx);
  };
  it("PrologueClimax, EnemyAttack, EnemySpawned, BossIntroStarted and Hit have a prologue column", () => {
    for (const t of [
      "PrologueClimax",
      "EnemyAttack",
      "EnemySpawned",
      "BossIntroStarted",
      "Hit",
    ] as const)
      expect(BINDINGS[t].prologue, t).toBeDefined();
  });
  it("calls the sink once per event", () => {
    const s = sink();
    const ctx = { prologue: s } as unknown as BindingCtx;
    run("PrologueClimax", ctx, ev("PrologueClimax"));
    run("EnemyAttack", ctx, ev("EnemyAttack", { enemyId: 3 }));
    run("EnemySpawned", ctx, ev("EnemySpawned", { enemyId: 4, isBoss: false }));
    run("BossIntroStarted", ctx, ev("BossIntroStarted"));
    run("Hit", ctx, ev("Hit", { kind: "auto" }));
    expect(s.climax).toHaveBeenCalledTimes(1);
    expect(s.enemyAttack).toHaveBeenCalledTimes(1);
    expect(s.enemySpawned).toHaveBeenCalledTimes(1);
    expect(s.bossIntro).toHaveBeenCalledTimes(1);
    expect(s.hit).toHaveBeenCalledTimes(1);
  });
  it("without a sink (every story level, tests, effects off) every prologue column is a safe no-op", () => {
    const ctx = {} as BindingCtx;
    for (const t of [
      "PrologueClimax",
      "EnemyAttack",
      "EnemySpawned",
      "BossIntroStarted",
      "Hit",
    ] as const)
      expect(
        () => run(t, ctx, ev(t, { enemyId: 1, isBoss: false, kind: "auto" })),
        t,
      ).not.toThrow();
  });
});

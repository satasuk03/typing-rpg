import { describe, expect, it } from "vitest";
import { HudPool, hash01, mulberry32 } from "../../src/hud/fx/typing/pool";
import { emitLetterSparks, type SparkEnv, SparkField } from "../../src/hud/fx/typing/sparks";
import { AtbStreaks } from "../../src/hud/fx/typing/streaks";
import { StreakTierFx } from "../../src/hud/fx/typing/tierFx";
import { POOL_CAP } from "../../src/level/typingFxParams";

const env = (): SparkEnv => ({
  S: 1,
  time: 0,
  k: 1,
  q: 1,
  reducedMotion: false,
  rng: mulberry32(3),
});

describe("HudPool", () => {
  it("never grows: 10,000 spawns keep the same backing arrays and count <= cap", () => {
    const p = new HudPool(64, 5, 2, 0);
    const fRefs = [...p.f];
    const bRefs = [...p.b];
    for (let i = 0; i < 10_000; i++) {
      const s = p.spawn();
      (p.f[0] as Float32Array)[s] = i % 7; // age
      expect(s).toBeLessThan(p.cap);
      expect(p.count).toBeLessThanOrEqual(p.cap);
    }
    expect(p.count).toBe(64);
    for (const [i, a] of p.f.entries()) expect(a).toBe(fRefs[i]);
    for (const [i, a] of p.b.entries()) expect(a).toBe(bRefs[i]);
  });

  it("steals the oldest entry when full and swap-removes", () => {
    const p = new HudPool(3, 1, 0, 0);
    for (const age of [0.1, 0.9, 0.3]) (p.f[0] as Float32Array)[p.spawn()] = age;
    const slot = p.spawn(); // full: steals the oldest (age 0.9 at slot 1)
    expect(slot).toBe(1);
    p.remove(0);
    expect(p.count).toBe(2);
    expect((p.f[0] as Float32Array)[0]).toBeCloseTo(0.3);
  });
});

describe("typing VFX pools stay fixed-size", () => {
  it("spark field: 10,000 adds, arrays unchanged, count <= cap", () => {
    const sf = new SparkField();
    const refs = [...sf.pool.f, ...sf.pool.b];
    for (let i = 0; i < 10_000; i++) sf.add(i, i, 1, 1, 0, 0.3, 3, 0, 0, 1);
    expect(sf.count).toBeLessThanOrEqual(POOL_CAP.sparks);
    expect([...sf.pool.f, ...sf.pool.b]).toEqual(refs);
    for (const [i, a] of refs.entries()) expect([...sf.pool.f, ...sf.pool.b][i]).toBe(a);
  });

  it("letter sparks: 10,000 bursts at tier 4, last letter, never exceed the cap", () => {
    const sf = new SparkField();
    const e = env();
    for (let i = 0; i < 10_000; i++)
      emitLetterSparks(sf, e, { x: 100, y: 100, w: 24, h: 30 }, 4, 0, i % 5 === 0);
    expect(sf.count).toBeLessThanOrEqual(POOL_CAP.sparks);
    expect(sf.count).toBeGreaterThan(0);
  });

  it("sparks expire and the pool drains", () => {
    const sf = new SparkField();
    emitLetterSparks(sf, env(), { x: 0, y: 0, w: 24, h: 30 }, 2, 1, false);
    expect(sf.count).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) sf.update(1 / 60, 1);
    expect(sf.count).toBe(0);
  });

  it("ATB streaks: 10,000 launches, count <= cap, overflow fires the oldest arrival", () => {
    const st = new AtbStreaks();
    const refs = [...st.pool.f, ...st.pool.b];
    let arrivals = 0;
    st.onArrive = () => arrivals++;
    for (let i = 0; i < 10_000; i++) st.launch(500, 200, i % 5, i, false, 200, 100);
    expect(st.count).toBeLessThanOrEqual(POOL_CAP.streaks);
    expect(arrivals).toBe(10_000 - POOL_CAP.streaks);
    for (const [i, a] of [...st.pool.f, ...st.pool.b].entries()) expect(a).toBe(refs[i]);
    // a launched streak arrives after its duration and removes itself
    const one = new AtbStreaks();
    let got = 0;
    one.onArrive = () => got++;
    one.launch(500, 200, 4, 1, false, 200, 100);
    for (let i = 0; i < 20; i++) one.update(1 / 60, 200, 100);
    expect(got).toBe(1);
    expect(one.count).toBe(0);
  });

  it("tier fx: 10,000 tier-ups keep rings/embers/sparks inside their caps", () => {
    const fx = new StreakTierFx();
    const sf = new SparkField();
    const e = env();
    fx.hasRect = true;
    Object.assign(fx.rect, { x: 400, y: 200, w: 160, h: 50 });
    fx.setTier(4);
    for (let i = 0; i < 10_000; i++) {
      fx.tierUp(1 + (i % 4), fx.rect, sf, e, false);
      if (i % 50 === 0) fx.update(1 / 60, e, false, () => {});
    }
    expect(fx.rings.count).toBeLessThanOrEqual(POOL_CAP.rings);
    expect(fx.embers.count).toBeLessThanOrEqual(POOL_CAP.embers);
    expect(sf.count).toBeLessThanOrEqual(POOL_CAP.sparks);
    for (let i = 0; i < 600; i++) fx.update(1 / 60, e, false, () => {});
    expect(fx.embers.count).toBeGreaterThan(0); // tier 4 keeps emitting while the plate exists
    expect(fx.rings.count).toBe(0);
  });
});

describe("presentation randomness is deterministic", () => {
  it("mulberry32 repeats per seed and hash01 is stateless", () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
    expect(hash01(3, 4)).toBe(hash01(3, 4));
    expect(hash01(3, 4)).not.toBe(hash01(4, 3));
    for (let i = 0; i < 200; i++) {
      const v = hash01(i, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

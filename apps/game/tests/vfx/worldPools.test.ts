import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/hud/fx/typing/pool";
import { PlateShatter } from "../../src/hud/fx/typing/shatter";
import { fragmentArrivalSec, WORD } from "../../src/level/typingFxParams";
import { createLightingUniforms, LightRig } from "../../src/render/lighting";
import { LightSlots } from "../../src/render/vfx/LightSlots";
import { newSpec, PooledParticles, resetSpec } from "../../src/render/vfx/PooledParticles";
import { TimeDilation } from "../../src/render/vfx/TimeDilation";

describe("TimeDilation (render-only time scale)", () => {
  it("slows to the factor for the hold, then eases back to 1 over the ramp", () => {
    const td = new TimeDilation();
    expect(td.slow(0.25, 100, 60)).toBe(true);
    expect(td.scale(1 / 60)).toBeCloseTo(0.25);
    for (let i = 0; i < 6; i++) td.scale(1 / 60); // ~100 ms hold
    const ramp = td.scale(1 / 60);
    expect(ramp).toBeGreaterThan(0.25);
    expect(ramp).toBeLessThanOrEqual(1);
    for (let i = 0; i < 10; i++) td.scale(1 / 60);
    expect(td.scale(1 / 60)).toBe(1);
  });

  it("skips a second slow inside the 1.2 s cooldown", () => {
    const td = new TimeDilation();
    expect(td.slow(0.25, 100, 60)).toBe(true);
    for (let i = 0; i < 30; i++) td.scale(1 / 60);
    expect(td.slow(0.25, 100, 60)).toBe(false);
    for (let i = 0; i < 60; i++) td.scale(1 / 60);
    expect(td.slow(0.25, 100, 60)).toBe(true);
  });

  it("hit-stop freezes the world, then resumes", () => {
    const td = new TimeDilation();
    td.hitStop(70);
    for (let i = 0; i < 5; i++) expect(td.scale(1 / 60)).toBe(0); // 70 ms = 4.2 frames
    expect(td.scale(1 / 60)).toBe(1);
  });

  it("a factor of 1 (intensity 0) is a no-op", () => {
    const td = new TimeDilation();
    expect(td.slow(1, 100, 60)).toBe(false);
    expect(td.scale(1 / 60)).toBe(1);
  });
});

describe("PooledParticles (allocation-free world pool)", () => {
  it("10,000 emits keep the pool fixed-size and the count <= cap", () => {
    const scene = new Scene();
    const p = new PooledParticles(64, true, scene);
    const spec = newSpec();
    for (let i = 0; i < 10_000; i++) {
      resetSpec(spec);
      spec.x = i;
      spec.life = 0.5 + (i % 7) * 0.1;
      p.emit(spec);
      if (i % 3 === 0) p.update(1 / 60);
      expect(p.count).toBeLessThanOrEqual(64);
    }
    p.upload();
    const geo = p.mesh.geometry as unknown as { instanceCount: number };
    expect(geo.instanceCount).toBe(p.count);
    p.dispose();
  });

  it("swap-removes the dead and respects the quality-tier cap", () => {
    const scene = new Scene();
    const p = new PooledParticles(100, true, scene);
    p.used = 20;
    const spec = newSpec();
    for (let i = 0; i < 50; i++) {
      resetSpec(spec);
      spec.life = 0.1 * (1 + (i % 3));
      p.emit(spec);
    }
    expect(p.count).toBe(20);
    for (let i = 0; i < 30; i++) p.update(0.01);
    expect(p.count).toBeLessThan(20);
    for (let i = 0; i < 60; i++) p.update(0.01);
    expect(p.count).toBe(0);
    p.dispose();
  });
});

describe("LightSlots (at most 3 typing lights, reused)", () => {
  it("creates one aura and two flash slots once; flashes reuse them and fade", () => {
    const rig = new LightRig(createLightingUniforms());
    const before = (rig as unknown as { dynamics: unknown[] }).dynamics.length;
    const slots = new LightSlots(rig);
    const created = (rig as unknown as { dynamics: unknown[] }).dynamics.length - before;
    expect(created).toBe(3);
    for (let i = 0; i < 100; i++) slots.flash(0, 1, 0, 1, 1, 1, 2, 4, 0.3);
    expect((rig as unknown as { dynamics: unknown[] }).dynamics.length - before).toBe(3);
    slots.update(0.15);
    expect(slots.aura.intensity).toBe(0);
    slots.update(0.2);
    slots.update(0.2);
    // fully faded: radius 0 turns the slot off
    expect(
      (rig as unknown as { dynamics: { radius: number }[] }).dynamics
        .slice(-2)
        .every((d) => d.radius === 0),
    ).toBe(true);
  });
});

describe("word shatter pools and timeline", () => {
  it("10,000 word bursts never grow the pools; fragments <= 96, shards <= 48", () => {
    const sh = new PlateShatter();
    const refs = [...sh.frags.f, ...sh.shards.f, ...sh.rays.f, ...sh.frames.f];
    const env = { S: 1, time: 0, k: 1, q: 1, reducedMotion: false, rng: mulberry32(1) };
    const rect = { x: 100, y: 100, w: 200, h: 50 };
    for (let i = 0; i < 10_000; i++) {
      sh.burst(
        rect,
        i % 3 === 0 ? "a very long sentence plate with many letters in it" : "river",
        (j, out) => {
          out.x = 100 + j * 10;
          out.y = 100;
          out.w = 10;
          out.h = 30;
          return true;
        },
        i % 2 === 0,
        4,
        true,
        { x: 40, y: 400, mode: 0 },
        i % 3 === 0,
        env,
      );
      sh.rayBurst(rect, 16, 1, env.rng);
      sh.frameFlash(rect);
      if (i % 5 === 0) sh.update(1 / 60, 1);
    }
    expect(sh.frags.count).toBeLessThanOrEqual(96);
    expect(sh.shards.count).toBeLessThanOrEqual(48);
    expect(sh.rays.count).toBeLessThanOrEqual(48);
    const after = [...sh.frags.f, ...sh.shards.f, ...sh.rays.f, ...sh.frames.f];
    for (const [i, a] of refs.entries()) expect(after[i]).toBe(a);
  });

  it("caps sentence plates at 24 fragments and the last arrival matches the shared timeline", () => {
    const sh = new PlateShatter();
    const env = { S: 1, time: 0, k: 1, q: 1, reducedMotion: false, rng: mulberry32(2) };
    const n = sh.burst(
      { x: 0, y: 0, w: 500, h: 60 },
      "the quick brown fox jumps over the lazy dog again and again",
      (j, out) => {
        out.x = j * 8;
        out.y = 0;
        out.w = 8;
        out.h = 20;
        return true;
      },
      false,
      2,
      false,
      { x: 10, y: 300, mode: 0 },
      true,
      env,
    );
    expect(n).toBe(WORD.maxFragments);
    expect(sh.lastArrivalSec).toBeCloseTo(fragmentArrivalSec(n - 1));
    // 5-letter word: first arrival 210 ms, last 242 ms
    expect(fragmentArrivalSec(0)).toBeCloseTo(0.21);
    expect(fragmentArrivalSec(4)).toBeCloseTo(0.242);
  });
});

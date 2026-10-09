/**
 * Streak step-down: a typo drops the streak ONE tier (interfaces v1.7 §3.3). The aura dims to the lower tier in
 * ~150 ms with no smoke puff; a break to 0 still gutters out over 600 ms with its puff.
 */
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { createLightingUniforms, LightRig } from "../../src/render/lighting";
import type { RenderWorld } from "../../src/render/RenderWorld";
import { HeroAura, STEP_DOWN_SEC } from "../../src/render/vfx/HeroAura";
import { LightSlots } from "../../src/render/vfx/LightSlots";
import { PooledParticles } from "../../src/render/vfx/PooledParticles";

const SET = { effectsIntensity: 1, reducedFlash: false, reducedMotion: false };

function make(): { aura: HeroAura; poolB: PooledParticles } {
  const scene = new Scene();
  const lighting = createLightingUniforms();
  const world = {
    scene,
    lighting,
    camera: { shake() {}, punch() {}, project() {} },
  } as unknown as RenderWorld;
  const poolB = new PooledParticles(64, false, scene);
  const aura = new HeroAura(
    world,
    new PooledParticles(64, true, scene),
    poolB,
    new LightSlots(new LightRig(lighting)),
  );
  return { aura, poolB };
}

function run(a: HeroAura, sec: number): void {
  for (let t = 0; t < sec; t += 1 / 60) a.update(1 / 60, t, SET, 1, 0);
}

describe("streak step-down", () => {
  it("dims to the lower tier within ~150 ms and keeps that tier, with no smoke puff", () => {
    const { aura, poolB } = make();
    aura.setStreakTier(4);
    run(aura, 0.3);
    expect(aura.displayed).toBeCloseTo(1, 2);
    const live = poolB.count;
    aura.stepDown(3);
    expect(poolB.count).toBe(live); // gutter() would add puff motes right away
    expect(aura.streak).toBe(3);
    run(aura, STEP_DOWN_SEC + 0.05);
    expect(aura.displayed).toBeCloseTo(0.75, 2);
  });

  it("a break to 0 still guts out slower and leaves smoke", () => {
    const { aura, poolB } = make();
    aura.setStreakTier(4);
    run(aura, 0.3);
    const live = poolB.count;
    aura.gutter(8);
    expect(poolB.count).toBe(live + 8);
    run(aura, STEP_DOWN_SEC + 0.05);
    expect(aura.displayed).toBeGreaterThan(0.2); // still guttering
  });
});

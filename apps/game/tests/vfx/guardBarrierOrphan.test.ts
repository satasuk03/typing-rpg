/**
 * T6.3 W3 P1-2: the held guard barrier must not outlive its attack. An Aegis-absorbed attack (`outcome: "barrier"`)
 * ends it like a hit; with no impact event at all, a fail-safe fades it after HELD_MAX_SEC.
 */
import { Scene } from "three";
import { describe, expect, it } from "vitest";
import { createLightingUniforms, LightRig } from "../../src/render/lighting";
import type { RenderWorld } from "../../src/render/RenderWorld";
import { GuardBarrier, HELD_MAX_SEC } from "../../src/render/vfx/GuardBarrier";
import { LightSlots } from "../../src/render/vfx/LightSlots";
import { PooledParticles } from "../../src/render/vfx/PooledParticles";
import { TimeDilation } from "../../src/render/vfx/TimeDilation";
import { outcomeEndsBarrier } from "../../src/render/vfx/TypingWorldFx";
import { NOOP_CALLBACKS } from "../../src/render/vfx/types";

const SET = { effectsIntensity: 1, reducedFlash: false, reducedMotion: false };

function make(): GuardBarrier {
  const scene = new Scene();
  const lighting = createLightingUniforms();
  const world = {
    scene,
    lighting,
    camera: { shake() {}, punch() {} },
  } as unknown as RenderWorld;
  return new GuardBarrier(
    world,
    new PooledParticles(64, true, scene),
    new PooledParticles(64, false, scene),
    new LightSlots(new LightRig(lighting)),
    new TimeDilation(),
    NOOP_CALLBACKS,
  );
}

function run(b: GuardBarrier, sec: number): void {
  for (let t = 0; t < sec; t += 1 / 60) b.update(1 / 60, t, SET);
}

describe("orphaned guard barrier", () => {
  it("an Aegis-absorbed attack ends the barrier like a hit", () => {
    expect(outcomeEndsBarrier("hit")).toBe(true);
    expect(outcomeEndsBarrier("barrier")).toBe(true);
    expect(outcomeEndsBarrier("blocked")).toBe(false);
    expect(outcomeEndsBarrier("parried")).toBe(false);
  });

  it("GuardWordTyped, then the barrier outcome: intensity reaches 0 within 300 ms", () => {
    const b = make();
    b.snap("block");
    run(b, 0.6);
    expect(b.intensity).toBeGreaterThan(0.5);
    // what TypingWorldFx does on EnemyAttack{barrier}
    if (outcomeEndsBarrier("barrier")) b.fade(200);
    run(b, 0.3);
    expect(b.intensity).toBe(0);
    expect(b.active).toBe(false);
  });

  it("with no impact event at all, a held barrier fades itself", () => {
    const b = make();
    b.snap("block");
    run(b, HELD_MAX_SEC + 0.6);
    expect(b.intensity).toBe(0);
    expect(b.active).toBe(false);
  });
});

/**
 * Hero guard (T6.3 #3): the hero's body box in NDC, shared by every VFX shader that can draw OVER the hero sprite
 * (aura shapes, fx quads, slash arcs). Inside the box (soft edge) those shaders cap their alpha / damp their light,
 * so an effect reads as a glow around and beside the hero and never as a veil that white-washes the sprite.
 *
 * One cell for the whole page (there is one hero): `setHeroGuard` writes it, shaders reference `HERO_NDC` as the
 * `uHero` uniform (xMin, yMin, xMax, yMax in NDC; off-screen = no guard).
 */
import { Vector3, Vector4 } from "three";
import type { RenderWorld } from "../RenderWorld";

/** Highest alpha an aura shape may have over the hero body. */
export const HERO_ALPHA_CAP = 0.35;
/** Light multiplier of fx quads and slash arcs over the hero body. */
export const HERO_DAMP = 0.5;

export const HERO_NDC = { value: new Vector4(9, 9, 9, 9) };
export const HERO_CAP = { value: HERO_ALPHA_CAP };

/** GLSL: soft membership of the hero box (1 inside, 0 outside) from a varying NDC position. */
export const GLSL_HERO_INSIDE = /* glsl */ `
uniform vec4 uHero;
float heroInside(vec2 ndc){
  vec2 dh = max(max(uHero.xy - ndc, ndc - uHero.zw), vec2(0.0));
  return 1.0 - smoothstep(0.0, 0.04, max(dh.x, dh.y));
}`;

const TMP = new Vector3();

/** Project the hero's body box (x +- 0.6, y 0..2.3 at depth z) into the shared guard rect. @hot */
export function setHeroGuard(
  world: RenderWorld,
  x: number,
  z: number,
  on: boolean,
  cap = HERO_ALPHA_CAP,
): void {
  HERO_CAP.value = cap;
  if (!on) {
    HERO_NDC.value.set(9, 9, 9, 9);
    return;
  }
  let x0 = 9;
  let y0 = 9;
  let x1 = -9;
  let y1 = -9;
  for (let i = 0; i < 4; i++) {
    world.camera.project(x + (i & 1 ? 0.6 : -0.6), i & 2 ? 2.3 : 0, z, TMP);
    if (TMP.x < x0) x0 = TMP.x;
    if (TMP.x > x1) x1 = TMP.x;
    if (TMP.y < y0) y0 = TMP.y;
    if (TMP.y > y1) y1 = TMP.y;
  }
  HERO_NDC.value.set(x0, y0, x1, y1);
}

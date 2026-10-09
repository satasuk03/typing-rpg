import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  OneFactor,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
} from "three";
import type { LightingUniforms } from "../lighting";
import { GLSL_COMMON, VS_WORLD } from "./glsl";

/**
 * One additive "fx quad" shader with many looks. The render core uses the flame, glow, god-ray and
 * rune kinds for scene dressing; the VFX library (T2.3) builds spell/hit effects on the same material.
 */
export const FxKind = {
  Glow: 0,
  Star: 1,
  Ring: 2,
  Beam: 3,
  Guard: 4,
  Fireball: 5,
  GodRay: 6,
  Flame: 7,
  Rune: 8,
} as const;
export type FxKindId = (typeof FxKind)[keyof typeof FxKind];

/** Additive blending that leaves alpha alone (HDR-friendly). */
export const ADDITIVE = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

const FS_FX = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor, uColor2; uniform float uI, uP, uSeed; uniform int uKind;
varying vec2 vUv; varying vec3 vWP;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; vec3 col = vec3(0.0); float a = 0.0;
  if (uKind == 0) {
    a = exp(-r * r * 4.0) * smoothstep(1.0, 0.6, r); col = uColor * a;
  } else if (uKind == 1) {
    float c = exp(-r * 7.0) * 1.4;
    float sx = exp(-abs(p.y) * 70.0) * smoothstep(0.5, 0.0, abs(p.x));
    float sy = exp(-abs(p.x) * 70.0) * smoothstep(0.5, 0.0, abs(p.y));
    col = mix(uColor, vec3(1.0), c * 0.5) * (c + (sx + sy) * 0.9);
  } else if (uKind == 2) {
    vec2 q = floor(vUv * 64.0) / 64.0 - 0.5; float rq = length(q) * 2.0;
    float w = 0.06 + 0.12 * (1.0 - uP);
    a = smoothstep(uP - w, uP, rq) * smoothstep(uP + 0.02, uP - 0.01, rq);
    col = mix(uColor, uColor2, rq) * a * (1.0 - uP * 0.8);
  } else if (uKind == 3) {
    float x = abs(p.x) * 2.0;
    float core = pow(max(1.0 - x, 0.0), 3.0); float hal = pow(max(1.0 - x, 0.0), 1.2) * 0.35;
    float streak = 0.75 + 0.25 * vnoise(vec2(p.x * 30.0, vUv.y * 6.0 - uTime * 3.0));
    float v = smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 0.7);
    col = (uColor2 * core * 1.8 + uColor * hal) * v * streak;
  } else if (uKind == 4) {
    float rim = smoothstep(0.62, 0.97, r) * step(r, 1.0);
    float hexes = step(0.82, fract((p.x + p.y * 0.577) * 9.0 + uTime * 0.2)) + step(0.82, fract((p.x - p.y * 0.577) * 9.0 - uTime * 0.2));
    float body = step(r, 1.0) * (0.06 + 0.10 * hexes * smoothstep(0.3, 1.0, r));
    col = uColor * (rim * 1.3 + body) * (1.0 + uP * 2.5);
  } else if (uKind == 5) {
    vec2 q = (floor(vUv * 18.0) + 0.5) / 18.0 - 0.5; float rq = length(q) * 2.0; float an = atan(q.y, q.x);
    float n = vnoise(vec2(an * 2.5 + uTime * 7.0 + uSeed, rq * 3.5 - uTime * 9.0));
    float f = smoothstep(1.0, 0.25, rq + (n - 0.5) * 0.55);
    col = mix(vec3(1.8, 0.4, 0.07), vec3(3.6, 2.5, 1.2), smoothstep(0.55, 0.0, rq)) * f;
  } else if (uKind == 6) {
    float x = abs(p.x) * 2.0;
    float n = 0.6 + 0.4 * vnoise(vec2(p.x * 12.0 + uSeed, uTime * 0.25));
    float v = pow(vUv.y, 1.6) * smoothstep(0.0, 0.25, vUv.y);
    col = uColor * smoothstep(1.0, 0.1, x) * v * n;
  } else if (uKind == 7) {
    vec2 q = (floor(vUv * vec2(7.0, 11.0)) + 0.5) / vec2(7.0, 11.0);
    float t = uTime * 4.0 + uSeed;
    float n = vnoise(vec2(q.x * 3.5, q.y * 2.6 - t));
    float wdt = mix(0.48, 0.06, q.y);
    float sh = 1.0 - abs(q.x - 0.5 + (n - 0.5) * 0.25 * q.y) / wdt;
    sh = sh * smoothstep(1.0, 0.55, q.y + (n - 0.5) * 0.35) * smoothstep(0.0, 0.12, q.y);
    float f = clamp(sh, 0.0, 1.0);
    float hot = smoothstep(0.35, 0.9, f) * smoothstep(0.75, 0.2, q.y);
    col = (step(0.05, f) * mix(vec3(1.6, 0.28, 0.05), vec3(3.6, 1.6, 0.35), smoothstep(0.05, 0.5, f)) + hot * vec3(2.5, 2.2, 1.4));
  } else if (uKind == 8) {
    vec2 q = floor(vUv * 96.0) / 96.0 - 0.5; float rq = length(q) * 2.0; float an = atan(q.y, q.x);
    float ring = smoothstep(0.03, 0.0, abs(rq - 0.92)) + smoothstep(0.02, 0.0, abs(rq - 0.78));
    float glyph = step(0.55, fract(an * 3.8197 + uTime * 0.15)) * step(0.80, rq) * step(rq, 0.9) * step(0.5, hash12(floor(vec2(an * 12.0, 1.0))));
    col = uColor * (ring + glyph * 0.8) * (0.7 + 0.3 * sin(uTime * 2.0));
  }
  gl_FragColor = vec4(col * uI, 1.0);
}`;

export function fxMaterial(
  uniforms: LightingUniforms,
  kind: FxKindId,
  color: readonly [number, number, number] = [1, 1, 1],
  color2: readonly [number, number, number] = [1, 1, 1],
  intensity = 1,
  seed = 0,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...uniforms,
      uColor: { value: new Vector3(...color) },
      uColor2: { value: new Vector3(...color2) },
      uI: { value: intensity },
      uP: { value: 0 },
      uSeed: { value: seed },
      uKind: { value: kind },
    },
    vertexShader: VS_WORLD,
    fragmentShader: FS_FX,
    transparent: true,
    depthWrite: false,
    ...ADDITIVE,
    side: DoubleSide,
  });
}

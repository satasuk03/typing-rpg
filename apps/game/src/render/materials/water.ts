/**
 * Fen still water (T2.2, C0.2 brief section 4). Three pieces:
 *  - `WATER_GLSL`: the shared water mask (pools off the boardwalk lane + a few broken-plank holes) used by BOTH the `fen`
 *    ground (which `discard`s there) and the surface (which draws only there), so the two never overlap or leave a seam;
 *  - `waterSurfaceMaterial`: the transparent surface (ripple normal, fresnel, posterised light glints, lily pads, fog). It has
 *    NO broad specular lobe (the mock's `pow(.., 12)` term made white blotches): only tight `pow(.., 260)` glints per light;
 *  - `reflectionMaterial` / `skyCardMaterial`: the mirrored-billboard material and the unlit under-water sky card.
 * `uWaterTier` 2 turns the surface into an opaque matte bog (no mirrored twins are drawn at that tier).
 */
import { NormalBlending, ShaderMaterial, Vector3 } from "three";
import type { LightingUniforms } from "../lighting";
import { GLSL_COMMON, VS_WORLD } from "./glsl";

/**
 * GLSL chunk (include AFTER `GLSL_COMMON`): `pathC` (the lane centre line shared with the leaf ground), `plankHole`,
 * `waterMask` (1 = open pool) and `waterAt` (pool OR a broken boardwalk plank: both are water to the eye).
 */
export const WATER_GLSL = /* glsl */ `
float pathC(float x){ return 0.15 + sin(x * 0.13) * 0.25 + sin(x * 0.047) * 0.35; }
const float BOARD_HALF = 2.3;
// a broken plank end: ~6% of the planks, only on the outer half of the boardwalk, so the hero lane stays solid
float plankHole(vec2 tc){
  float lane = abs(tc.y - pathC(tc.x));
  if (lane < 1.3 || lane > 2.0) return 0.0;
  float id = floor(tc.x / 0.375);
  return step(0.94, hash12(vec2(id, 3.0))) * step(0.09, fract(tc.x / 0.375));
}
float waterMask(vec2 tc){
  float lane = abs(tc.y - pathC(tc.x));
  float n = vnoise(tc * 0.32) * 0.65 + vnoise(tc * 1.1) * 0.35;
  float far = smoothstep(2.7, 3.3, lane);
  return step(0.5, far * (0.25 + n) + step(tc.y, -9.0) * 0.3);
}
float waterAt(vec2 tc){ return max(waterMask(tc), plankHole(tc)); }
`;

/** CPU twin of the shader's `pathC`: the boardwalk's centre z at world x (dev scenes and layouts place posts with it). */
export function pathCenter(x: number): number {
  return 0.15 + Math.sin(x * 0.13) * 0.25 + Math.sin(x * 0.047) * 0.35;
}

/** The transparent water surface (tier 0/1) / opaque matte bog (tier 2, `uWaterTier` 2). */
export function waterSurfaceMaterial(u: LightingUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u, uWaterTier: { value: 0 } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
${WATER_GLSL}
uniform float uWaterTier;
varying vec2 vUv; varying vec3 vWP;
void main(){
  vec2 tp = floor(vWP.xz * 16.0); vec2 tc = (tp + 0.5) / 16.0; float by = bayer4(tp);
  if (waterAt(tc) < 0.5) discard;
  // lily pads: a notched disc per sparse cell (a decal on the surface, opaque, lit by the scene lights)
  vec2 cell = floor(tc / 1.3); vec2 cf = tc - (cell + 0.5) * 1.3; float hc = hash12(cell);
  vec2 o = (hash22(cell) - 0.5) * 0.6; vec2 pd = cf - o; float pr = 0.2 + hc * 0.22;
  float ang = atan(pd.y, pd.x);
  if (hc > 0.66 && length(pd) < pr && abs(ang - hc * 6.0 + 3.0) > 0.25) {
    vec3 a = mix(vec3(0.03, 0.08, 0.03), vec3(0.08, 0.17, 0.06), step(0.5, by) * 0.5 + step(length(pd), pr * 0.7) * 0.5);
    if (hc > 0.95 && length(pd - vec2(0.05)) < 0.06) a = vec3(0.9, 0.75, 0.82);
    vec3 Lt = lightAt(vWP, vec3(0.0, 1.0, 0.0), 0.0, 0.0);
    gl_FragColor = vec4(applyFog(a * Lt, vWP), 1.0); return;
  }
  // ripple normal: two drifting texel-snapped noise octaves (pixel-art ripples). Larger amplitudes smear streaks into blobs.
  float t = uTime;
  vec2 rp = tc * vec2(1.2, 3.0);
  float r1 = vnoise(rp * 2.0 + vec2(t * 0.25, t * 0.1)), r2 = vnoise(rp * 5.0 - vec2(t * 0.4, -t * 0.15));
  vec3 N = normalize(vec3((r1 - 0.5) * 0.06 + (r2 - 0.5) * 0.04, 1.0, (r2 - 0.5) * 0.14 + (r1 - 0.5) * 0.08));
  vec3 V = normalize(vWP - uCam);
  vec3 R = reflect(V, N);
  float fres = pow(1.0 - max(dot(-V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
  vec3 deep = vec3(0.004, 0.012, 0.01);
  // glints: each point light reflected through the rippled normal = a narrow vertical streak. NO broad lobe.
  vec3 spec = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec4 p = uLP[i]; if (p.w <= 0.0) continue;
    vec3 Ld = p.xyz - vWP; float dist = length(Ld); Ld /= dist;
    float s = pow(max(dot(R, Ld), 0.0), 260.0) * 3.2;
    spec += uLC[i].rgb * s * clamp(1.0 - dist / (p.w * 2.2), 0.0, 1.0);
  }
  spec += uSunCol * pow(max(dot(R, normalize(uSunDir)), 0.0), 600.0) * 0.8;
  spec = min(floor(spec * 4.0 + 0.5) / 4.0, vec3(3.0)); // posterised quarter steps, capped at 3 HDR
  if (uWaterTier > 1.5) {
    // tier 2: opaque matte bog (no mirrored twins). A cheap sky sheen plus the glints keep it reading as water.
    vec3 col = mix(deep, uFogCol * 0.55, fres * 0.8) + spec;
    gl_FragColor = vec4(applyFog(col, vWP), 1.0); return;
  }
  float a = mix(0.74, 0.46, fres); // dark looking down, more mirror-like at grazing
  vec3 fogged = applyFog(deep + spec, vWP);
  gl_FragColor = vec4(fogged, a + min(dot(spec, vec3(0.33)), 0.6));
}`,
    transparent: true,
    depthWrite: true,
  });
}

/**
 * Mirrored-billboard material: shares every uniform CELL of the source sprite material (lights, flash and frame swaps stay
 * live), overrides `uTint` with `tint` (a darkened copy), and adds a row-wise ripple wobble in the vertex shader. The
 * mesh itself is flipped (`scale.y = -1`, `position.y = -y`) by the owner.
 */
export function reflectionMaterial(
  src: ShaderMaterial,
  tint: readonly [number, number, number],
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...src.uniforms, uTint: { value: new Vector3(...tint) } },
    vertexShader: /* glsl */ `
uniform float uTime; varying vec2 vUv; varying vec3 vWP;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0);
  float depth = max(-w.y, 0.0);
  w.x += sin(floor(w.y * 16.0) * 0.9 + uTime * 2.2) * 0.018 * (0.4 + depth * 0.35);
  vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: src.fragmentShader,
    side: src.side,
  });
}

/** Big unlit quad material for the under-water sky card: `fogCol x [0.5, 0.55, 0.6]` (without it the clear colour shows). */
export function skyCardMaterial(fogCol: readonly [number, number, number]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uC: { value: new Vector3(fogCol[0] * 0.5, fogCol[1] * 0.55, fogCol[2] * 0.6) } },
    vertexShader:
      "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }",
    blending: NormalBlending,
  });
}

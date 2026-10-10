/**
 * Ground-hugging fog cards (C0.2 brief 1.6): horizontal bands of drifting value noise, normal blend, posterised to 6 alpha
 * steps with a 2 px Bayer dither so the fog reads as pixel art, not a gradient. Noise is sampled in WORLD x, so a card that
 * follows the camera does not "swim" with it. A card never rises above y 1.5 in the action band (it would veil actors).
 */
import { NormalBlending, ShaderMaterial, Vector3 } from "three";
import type { BiomeId } from "../biomes";
import type { LightingUniforms } from "../lighting";
import { GLSL_COMMON, VS_WORLD } from "../materials/glsl";

export interface FogCardDef {
  /** x span (m). */
  w: number;
  /** height (m). */
  h: number;
  /** centre y. */
  y: number;
  z: number;
  alpha: number;
  /** Linear colour: a lighter `fogCol`. */
  color: readonly [number, number, number];
  /** Blurred foreground layer. */
  foreground?: boolean;
}

/** Cards per mood (brief 1.6). Moods without an entry get none. */
export const FOG_CARDS: Readonly<Partial<Record<BiomeId, readonly FogCardDef[]>>> = {
  hushwood: [
    { w: 46, h: 1.3, y: 0.45, z: -1.8, alpha: 0.3, color: [0.09, 0.12, 0.22] },
    { w: 60, h: 2.6, y: 0.9, z: -9.5, alpha: 0.5, color: [0.08, 0.11, 0.21] },
    { w: 40, h: 1.2, y: 0.35, z: 4.6, alpha: 0.28, color: [0.08, 0.11, 0.21], foreground: true },
  ],
  fen: [
    { w: 50, h: 1.4, y: 0.45, z: -1.6, alpha: 0.4, color: [0.42, 0.44, 0.28] },
    { w: 70, h: 2.8, y: 0.8, z: -6.5, alpha: 0.6, color: [0.38, 0.4, 0.26] },
    { w: 80, h: 4, y: 1.2, z: -13, alpha: 0.65, color: [0.36, 0.38, 0.25] },
    { w: 44, h: 1.2, y: 0.35, z: 4.8, alpha: 0.32, color: [0.36, 0.38, 0.24], foreground: true },
  ],
  grove: [
    { w: 50, h: 1.4, y: 0.5, z: -1, alpha: 0.34, color: [0.07, 0.11, 0.2] },
    { w: 70, h: 3, y: 1, z: -8, alpha: 0.5, color: [0.06, 0.1, 0.19] },
    { w: 44, h: 1.2, y: 0.35, z: 4.8, alpha: 0.28, color: [0.06, 0.1, 0.19], foreground: true },
  ],
};

export function fogCardMaterial(
  u: LightingUniforms,
  color: readonly [number, number, number],
  alpha: number,
  seed: number,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...u,
      uColor: { value: new Vector3(...color) },
      uA: { value: alpha },
      uSeed: { value: seed },
    },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor; uniform float uA, uSeed; varying vec2 vUv; varying vec3 vWP;
void main(){
  float t = uTime * 0.035;
  float n = vnoise(vec2(vWP.x * 0.22 + t * 3.0 + uSeed, vUv.y * 2.0)) * 0.6 + vnoise(vec2(vWP.x * 0.55 - t * 5.0, vUv.y * 4.0 + uSeed)) * 0.4;
  float band = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float a = clamp((n - 0.28) * 1.6, 0.0, 1.0) * band * edge * uA;
  vec2 tp = floor(gl_FragCoord.xy / 2.0); a = floor(a * 6.0 + bayer4(tp)) / 6.0;
  vec3 col = uColor + inscatter(vWP) * uScatter * 0.6;
  gl_FragColor = vec4(col, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}

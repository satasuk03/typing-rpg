import { ShaderMaterial, type Texture, Vector3 } from "three";
import type { LightingUniforms } from "../lighting";
import { GLSL_COMMON, VS_WORLD } from "./glsl";

/** Far backdrop (sky / mountains / tree line): unlit, fogged toward the biome fog colour. */
export function backdropMaterial(
  uniforms: LightingUniforms,
  tex: Texture,
  tint: readonly [number, number, number],
  fogK: number,
  rep = 1,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...uniforms,
      map: { value: tex },
      uTint: { value: new Vector3(...tint) },
      uFogK: { value: fogK },
      uRep: { value: rep },
    },
    vertexShader: VS_WORLD,
    fragmentShader: `${GLSL_COMMON} uniform sampler2D map; uniform vec3 uTint; uniform float uFogK, uRep; varying vec2 vUv; varying vec3 vWP;
    void main(){ vec4 c = texture2D(map, vec2(vUv.x * uRep, vUv.y)); if (c.a < 0.5) discard; vec3 col = c.rgb * uTint;
      if (uFlat < 0.5) col = mix(col, uFogCol, uFogK); gl_FragColor = vec4(col, 1.0); }`,
  });
}

/**
 * Procedural ground: texel-snapped (16 texels/unit, same density as the sprites) forest grass + dirt
 * path that dithers into cave stone slabs across `uBiome` (x range), with a normal derived from
 * value noise so torches rake across individual "pixels", lightly posterised + Bayer dithered.
 */
export function groundMaterial(uniforms: LightingUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
varying vec2 vUv; varying vec3 vWP;
const vec3 G0 = vec3(0.075,0.16,0.085), G1 = vec3(0.11,0.24,0.11), G2 = vec3(0.19,0.37,0.15), G3 = vec3(0.33,0.53,0.2), G4 = vec3(0.56,0.74,0.3);
const vec3 D0 = vec3(0.2,0.14,0.09), D1 = vec3(0.3,0.21,0.13), D2 = vec3(0.42,0.31,0.2), D3 = vec3(0.56,0.43,0.28), D4 = vec3(0.7,0.58,0.4);
const vec3 C0 = vec3(0.06,0.05,0.055), C1 = vec3(0.11,0.09,0.09), C2 = vec3(0.17,0.14,0.13), C3 = vec3(0.25,0.2,0.17), C4 = vec3(0.36,0.29,0.23);
vec3 pick5(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, float l){ l = clamp(floor(l), 0.0, 4.0); return l < 0.5 ? a : l < 1.5 ? b : l < 2.5 ? c : l < 3.5 ? d : e; }
float pathC(float x){ return -0.25 + sin(x * 0.17) * 0.45 + sin(x * 0.051) * 0.6; }
float hN(vec2 tc, float cave){ vec2 tp = floor(tc * 16.0); return vnoise(tc * 3.0) * 0.5 + hash12(tp) * (0.35 + cave * 0.25) + vnoise(tc * 0.9) * 0.4; }
void main(){
  vec2 tp = floor(vWP.xz * 16.0); vec2 tc = (tp + 0.5) / 16.0;
  float by = bayer4(tp);
  float caveT = clamp((tc.x - uBiome.x) / (uBiome.y - uBiome.x), 0.0, 1.0);
  float cave = step(0.5, caveT + (by - 0.5) * 0.45 + (vnoise(tc * 0.7) - 0.5) * 0.45);
  float n1 = vnoise(tc * 1.1), n2 = vnoise(tc * 3.7), n3 = hash12(tp);
  float pw = 1.55 + (vnoise(vec2(tc.x * 0.33, 7.0)) - 0.5) * 0.9;
  float pd = abs(tc.y - pathC(tc.x)) - pw + (n2 - 0.5) * 0.55 + (by - 0.5) * 0.25;
  vec3 alb; float bump = 1.0;
  if (cave < 0.5) {
    if (pd < 0.0) {
      float l = 2.3 + (n1 - 0.5) * 1.3 + (n3 - 0.5) * 0.7 + by * 0.6 + clamp(pd * 1.2, -0.8, 0.0) * 0.0;
      if (pd > -0.18) l -= 1.0;
      alb = pick5(D0, D1, D2, D3, D4, l);
      if (n3 > 0.975) alb = D4 * 1.1;
      if (hash12(tp + 17.0) > 0.985) alb = D0;
      float rz = abs(abs(tc.y - pathC(tc.x)) - 0.75);
      if (rz < 0.06 && n2 > 0.35) alb *= 0.78;
    } else {
      float l = 2.0 + (n1 - 0.5) * 1.8 + (n3 - 0.5) * 1.0 + by * 0.7 - smoothstep(0.0, 0.35, 0.35 - pd) * 0.6;
      alb = pick5(G0, G1, G2, G3, G4, l);
      float fl = hash12(floor(tc * 4.0) + 3.0);
      if (fl > 0.93 && n3 > 0.92) alb = (fl > 0.965) ? vec3(0.95, 0.85, 0.35) : vec3(0.9, 0.5, 0.62);
    }
  } else {
    vec2 g = tc * vec2(0.75, 1.1); vec2 gi = floor(g), gf = fract(g); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(i, j); vec2 pnt = o + hash22(gi + o) * 0.85; float d = length(gf - pnt); if (d < d1) { d2 = d1; d1 = d; id = gi + o; } else if (d < d2) d2 = d; }
    float crack = d2 - d1;
    float l = 2.0 + (hash12(id) - 0.5) * 1.4 + (n2 - 0.5) * 0.8 + by * 0.35 + (n3 - 0.5) * 0.3 - d1 * 0.6;
    alb = pick5(C0, C1, C2, C3, C4, l);
    if (crack < 0.07) alb = C0 * 0.8;
    if (pd < 0.0) { float l2 = 1.7 + (n1 - 0.5) * 1.2 + (n3 - 0.5) * 0.4 + by * 0.35; alb = mix(alb, pick5(C0, C1, C2, vec3(0.3,0.22,0.16), vec3(0.4,0.3,0.21), l2), 0.85); }
    if (n3 > 0.993) alb = C4 * 1.1;
    bump = 1.0;
  }
  vec2 e = vec2(1.0 / 16.0, 0.0);
  float h0 = hN(tc, cave), hx = hN(tc + e.xy, cave), hz = hN(tc + e.yx, cave);
  vec3 N = normalize(vec3((h0 - hx) * 2.2 * bump, 1.0, (h0 - hz) * 2.2 * bump));
  vec3 L = lightAt(vWP, N, 0.0, 0.0);
  if (uFlat < 0.5) { float lum = dot(L, vec3(0.3, 0.55, 0.15)); float q = (floor(lum * 7.0 + by) / 7.0); L *= q / max(lum, 1e-3) * 0.5 + 0.5; }
  vec3 col = alb * L;
  gl_FragColor = vec4(applyFog(col, vWP), 1.0);
}`,
  });
}

/** Cave back wall / cliff: irregular stone slabs with cracks and strata, lit per texel. */
export function wallMaterial(uniforms: LightingUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...uniforms, uEdgeX: { value: 97 } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
uniform float uEdgeX;
varying vec2 vUv; varying vec3 vWP;
void main(){
  vec2 tp = floor(vWP.xy * 16.0); vec2 tc = (tp + 0.5) / 16.0;
  float by = bayer4(tp);
  float prof = uEdgeX + 7.5 - tc.y * 0.9 + (vnoise(vec2(tc.y * 0.7, 3.0)) - 0.5) * 3.0 + (hash12(floor(tc * 2.0)) - 0.5) * 0.6;
  if (tc.x < prof) discard;
  vec2 g = tc * vec2(0.85, 1.05); vec2 gi = floor(g), gf = fract(g); float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0), fp = vec2(0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(i, j); vec2 pnt = o + hash22(gi + o) * 0.9; float d = length(gf - pnt); if (d < d1) { d2 = d1; d1 = d; id = gi + o; fp = pnt; } else if (d < d2) d2 = d; }
  float crack = d2 - d1;
  vec2 dv = (gf - fp);
  float fine = vnoise(tc * 6.0) - 0.5;
  vec3 N = normalize(vec3(dv.x * 1.7 + fine * 0.5, dv.y * 1.7 + fine * 0.5, 1.0));
  float hc = hash12(id);
  vec3 base = mix(vec3(0.19, 0.15, 0.13), vec3(0.3, 0.24, 0.19), hc);
  float outside = 1.0 - smoothstep(uEdgeX + 6.0, uEdgeX + 20.0, tc.x);
  base = mix(base, vec3(0.32, 0.31, 0.27), outside * 0.6);
  float l = 0.82 + (vnoise(tc * 2.3) - 0.5) * 0.4 + (by - 0.5) * 0.18;
  vec3 alb = base * l;
  if (crack < 0.06) alb *= 0.35;
  if (outside > 0.2 && N.y > 0.35 && hash12(tp) < 0.7 * outside) alb = mix(alb, vec3(0.2, 0.36, 0.14), 0.8);
  if (abs(fract(tc.y * 0.45 + vnoise(vec2(tc.x * 0.2, 1.0)) * 0.6) - 0.5) < 0.03) alb *= 0.6;
  vec3 L = lightAt(vWP, N, 0.15, 0.0);
  if (uFlat < 0.5) { float lum = dot(L, vec3(0.3, 0.55, 0.15)); float q = (floor(lum * 6.0 + by) / 6.0); L *= q / max(lum, 1e-3) * 0.6 + 0.4; }
  vec3 col = alb * L;
  col *= mix(1.0, smoothstep(13.0, 4.0, tc.y), 1.0 - outside * 0.7) * 0.85 + 0.15;
  gl_FragColor = vec4(applyFog(col, vWP), 1.0);
}`,
  });
}

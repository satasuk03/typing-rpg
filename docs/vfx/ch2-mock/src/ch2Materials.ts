/**
 * C0.2 SCRATCH: Ch2 ground variants, the fen still-water surface, mirrored-reflection sprites and fog cards.
 * Direction code for T2.1 / T2.2, built on the game's shared lighting GLSL so the lighting and fog match exactly.
 */
import { NormalBlending, ShaderMaterial, Vector3, Vector4 } from "three";
import type { LightingUniforms } from "../../../../apps/game/src/render/lighting";
import { GLSL_COMMON, VS_WORLD } from "../../../../apps/game/src/render/materials/glsl";

/** Shared GLSL: the fen water mask (1 = open water). Pools avoid the boardwalk lane |z - path| < 1.7. */
const WATER_FN = /* glsl */ `
uniform float uVariant; uniform vec4 uArena; uniform float uWaterTier;
float pathC(float x){ return 0.15 + sin(x * 0.13) * 0.25 + sin(x * 0.047) * 0.35; }
float waterMask(vec2 tc){
  if (uVariant < 0.5 || uVariant > 1.5) return 0.0;
  float lane = abs(tc.y - pathC(tc.x));
  float n = vnoise(tc * 0.32) * 0.65 + vnoise(tc * 1.1) * 0.35;
  float far = smoothstep(2.7, 3.3, lane);
  return step(0.5, far * (0.25 + n) + step(tc.y, -9.0) * 0.3);
}`;

export function ch2GroundMaterial(u: LightingUniforms, variant: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u, uVariant: { value: variant }, uArena: { value: new Vector4(0, 0, 6, 0) }, uWaterTier: { value: 0 } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
${WATER_FN}
varying vec2 vUv; varying vec3 vWP;
vec3 pick5(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, float l){ l = clamp(floor(l), 0.0, 4.0); return l < 0.5 ? a : l < 1.5 ? b : l < 2.5 ? c : l < 3.5 ? d : e; }
// hushwood leaf litter (umber/violet) + russet leaves; moss; packed-earth path
const vec3 L0 = vec3(0.028,0.022,0.03), L1 = vec3(0.05,0.038,0.045), L2 = vec3(0.08,0.058,0.058), L3 = vec3(0.13,0.08,0.062), L4 = vec3(0.22,0.12,0.07);
const vec3 M0 = vec3(0.016,0.045,0.038), M1 = vec3(0.03,0.075,0.055), M2 = vec3(0.05,0.12,0.08), M3 = vec3(0.09,0.19,0.11), M4 = vec3(0.15,0.27,0.15);
const vec3 P0 = vec3(0.045,0.04,0.048), P1 = vec3(0.07,0.06,0.066), P2 = vec3(0.1,0.085,0.088), P3 = vec3(0.14,0.12,0.115), P4 = vec3(0.19,0.165,0.15);
// fen mud + boardwalk wood
const vec3 F0 = vec3(0.022,0.026,0.016), F1 = vec3(0.036,0.042,0.024), F2 = vec3(0.055,0.06,0.032), F3 = vec3(0.08,0.085,0.042), F4 = vec3(0.12,0.12,0.06);
const vec3 W0 = vec3(0.05,0.032,0.02), W1 = vec3(0.09,0.06,0.036), W2 = vec3(0.14,0.095,0.056), W3 = vec3(0.2,0.14,0.085), W4 = vec3(0.28,0.2,0.125);
// grove: violet moss-dirt; willow roots
const vec3 G0 = vec3(0.02,0.02,0.035), G1 = vec3(0.035,0.035,0.055), G2 = vec3(0.05,0.06,0.075), G3 = vec3(0.07,0.1,0.09), G4 = vec3(0.11,0.16,0.12);
const vec3 R0 = vec3(0.025,0.016,0.03), R1 = vec3(0.045,0.03,0.055), R2 = vec3(0.075,0.05,0.085), R3 = vec3(0.11,0.08,0.12), R4 = vec3(0.16,0.12,0.17);
float hN(vec2 tc){ vec2 tp = floor(tc * 16.0); return vnoise(tc * 3.0) * 0.5 + hash12(tp) * 0.35 + vnoise(tc * 0.9) * 0.4; }
void main(){
  vec2 tp = floor(vWP.xz * 16.0); vec2 tc = (tp + 0.5) / 16.0;
  float by = bayer4(tp);
  float n1 = vnoise(tc * 1.1), n2 = vnoise(tc * 3.7), n3 = hash12(tp);
  vec3 alb; vec3 emis = vec3(0.0); float bump = 1.0; vec3 N0 = vec3(0.0, 1.0, 0.0); float rootN = 0.0;
  if (uVariant < 0.5) {
    float pw = 1.35 + (vnoise(vec2(tc.x * 0.33, 7.0)) - 0.5) * 0.7;
    float pd = abs(tc.y - pathC(tc.x)) - pw + (n2 - 0.5) * 0.5 + (by - 0.5) * 0.25;
    float moss = smoothstep(0.52, 0.6, vnoise(tc * 0.45) * 0.7 + n2 * 0.3);
    if (pd < 0.0) { float l = 2.2 + (n1 - 0.5) * 1.2 + (n3 - 0.5) * 0.7 + by * 0.6; if (pd > -0.2) l -= 1.0; alb = pick5(P0, P1, P2, P3, P4, l); }
    else if (moss > 0.5) { float l = 2.0 + (n1 - 0.5) * 1.6 + (n3 - 0.5) * 0.9 + by * 0.7; alb = pick5(M0, M1, M2, M3, M4, l); }
    else { float l = 1.8 + (n1 - 0.5) * 1.5 + (n3 - 0.5) * 1.1 + by * 0.7; alb = pick5(L0, L1, L2, L3, L4, l);
      // fallen leaves: 2x1 texel slivers in russet / old gold
      float lc = hash12(floor(tc * vec2(8.0, 16.0)) + 3.0); if (lc > 0.86) alb = lc > 0.95 ? vec3(0.32, 0.17, 0.06) : vec3(0.2, 0.09, 0.05); }
    // root veins crossing the forest floor (and the path)
    vec2 q = vec2(tc.x * 0.55 + vnoise(tc * 0.4) * 2.2, tc.y * 1.6 + vnoise(tc * 0.7 + 9.0) * 1.4);
    float rv = abs(fract(q.x + q.y * 0.18) - 0.5);
    float rw = 0.03 + 0.03 * vnoise(tc * 0.8);
    if (rv < rw && vnoise(tc * 0.5 + 4.0) > 0.45) { float k = (rv / rw); alb = mix(vec3(0.1, 0.075, 0.11), vec3(0.035, 0.026, 0.04), k); rootN = (fract(q.x + q.y * 0.18) - 0.5) / rw; }
    // glowing ground speck mushrooms (sparse, emissive teal)
    if (n3 > 0.9985 && pd > 0.3) emis = vec3(0.15, 0.9, 0.85) * 0.9;
  } else if (uVariant < 1.5) {
    float lane = tc.y - pathC(tc.x);
    float bw = 2.3;
    if (abs(lane) < bw) {
      // boardwalk: planks across the lane, 0.375 m wide, with gaps, nails and a few broken planks
      float px = tc.x / 0.375; float id = floor(px); float f = fract(px);
      float h = hash12(vec2(id, 3.0));
      float grain = vnoise(vec2(tc.x * 40.0, tc.y * 3.0 + id * 7.0));
      float l = 2.0 + (h - 0.5) * 1.6 + (grain - 0.5) * 1.1 + by * 0.5 - abs(lane) * 0.4;
      alb = pick5(W0, W1, W2, W3, W4, l);
      if (f < 0.09) alb = vec3(0.01, 0.01, 0.008);
      if ((abs(abs(lane) - 2.0) < 0.04 || abs(abs(lane) - 0.7) < 0.04) && f > 0.4 && f < 0.6) alb = vec3(0.3, 0.28, 0.24); // nails on the joists
      if (abs(lane) > bw - 0.12) alb = pick5(W0, W1, W2, W3, W4, l - 0.8); // side beams
      if (h > 0.94 && abs(lane) > 1.3 && abs(lane) < 2.0) discard; // a broken plank end: water shows through
      bump = 0.5;
    } else {
      float l = 2.0 + (n1 - 0.5) * 1.6 + (n3 - 0.5) * 1.0 + by * 0.7;
      alb = pick5(F0, F1, F2, F3, F4, l);
      if (hash12(floor(tc * 6.0)) > 0.8 && n3 > 0.6) alb = vec3(0.1, 0.14, 0.05) * (0.8 + by * 0.4); // sedge tufts
    }
    if (waterMask(tc) > 0.5 && abs(lane) >= bw) discard;
    // wet mud rim toward the water
    vec2 e1 = vec2(0.19, 0.0);
    float nearW = max(max(waterMask(tc + e1), waterMask(tc - e1)), max(waterMask(tc + e1.yx), waterMask(tc - e1.yx)));
    if (nearW > 0.5 && abs(lane) >= bw) alb *= 0.6;
  } else {
    vec2 d = tc - uArena.xy; d.y *= 1.6; float r = length(d); float an = atan(d.y, d.x);
    float l = 2.0 + (n1 - 0.5) * 1.6 + (n3 - 0.5) * 1.0 + by * 0.7;
    alb = pick5(G0, G1, G2, G3, G4, l);
    float moss = smoothstep(0.5, 0.58, vnoise(tc * 0.5) * 0.7 + n2 * 0.3);
    if (moss > 0.5) alb = pick5(M0, M1, M2, M3, M4, l - 0.3);
    // great roots radiating from the willow, thinning with distance
    float a = an * 7.0 / 6.2832 + vnoise(vec2(r * 0.35, an * 2.0)) * 0.8 + r * 0.04;
    float rv = abs(fract(a) - 0.5);
    float rw = 0.16 * exp(-r * 0.09) + 0.015;
    if (rv < rw && r > 2.0) { float k = rv / rw; float ll = 3.4 - k * 2.4 + (n3 - 0.5) * 0.6 + by * 0.5; alb = pick5(R0, R1, R2, R3, R4, ll); rootN = (fract(a) - 0.5) / rw; bump = 1.2; }
    // fallen silver-teal leaves + a few gold riddle leaves
    float lc = hash12(floor(tc * vec2(8.0, 16.0)) + 11.0); if (lc > 0.9) alb = lc > 0.985 ? vec3(0.42, 0.3, 0.08) : vec3(0.1, 0.2, 0.18);
  }
  vec2 e = vec2(1.0 / 16.0, 0.0);
  float h0 = hN(tc), hx = hN(tc + e.xy), hz = hN(tc + e.yx);
  vec3 N = normalize(vec3((h0 - hx) * 2.2 * bump + rootN * 0.35, 1.0, (h0 - hz) * 2.2 * bump));
  vec3 Lt = lightAt(vWP, N, 0.0, 0.0);
  if (uFlat < 0.5) { float lum = dot(Lt, vec3(0.3, 0.55, 0.15)); float qq = (floor(lum * 7.0 + by) / 7.0); Lt *= qq / max(lum, 1e-3) * 0.5 + 0.5; }
  vec3 col = alb * Lt + emis;
  gl_FragColor = vec4(applyFog(col, vWP), 1.0);
}`,
  });
}

/**
 * Fen still-water surface (tier 0/1): drawn over the mirrored billboards, alpha-blended. Ripple normals, a fresnel
 * fade from dark water (looking down) to clear reflection (grazing), point-light glints reflected through the rippled
 * normal (a vertical streak under every lantern), lily pads, and fog. Tier 2 = `uWaterTier 2`: opaque matte bog
 * (no reflection pass), the light glints kept.
 */
export function ch2WaterMaterial(u: LightingUniforms): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u, uVariant: { value: 1 }, uArena: { value: new Vector4(0, 0, 6, 0) }, uWaterTier: { value: 0 } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
${WATER_FN}
varying vec2 vUv; varying vec3 vWP;
void main(){
  vec2 tp = floor(vWP.xz * 16.0); vec2 tc = (tp + 0.5) / 16.0; float by = bayer4(tp);
  if (waterMask(tc) < 0.5) discard;
  // lily pads: a notched disc per sparse cell
  vec2 cell = floor(tc / 1.3); vec2 cf = tc - (cell + 0.5) * 1.3; float hc = hash12(cell);
  vec2 o = (hash22(cell) - 0.5) * 0.6; vec2 pd = cf - o; float pr = 0.2 + hc * 0.22;
  float ang = atan(pd.y, pd.x);
  if (hc > 0.66 && length(pd * vec2(1.0, 1.0)) < pr && abs(ang - hc * 6.0 + 3.0) > 0.25) {
    vec3 a = mix(vec3(0.03, 0.08, 0.03), vec3(0.08, 0.17, 0.06), step(0.5, by) * 0.5 + step(length(pd), pr * 0.7) * 0.5);
    if (hc > 0.95 && length(pd - vec2(0.05)) < 0.06) a = vec3(0.9, 0.75, 0.82);
    vec3 Lt = lightAt(vWP, vec3(0.0, 1.0, 0.0), 0.0, 0.0);
    gl_FragColor = vec4(applyFog(a * Lt, vWP), 1.0); return;
  }
  // ripple normal: two drifting texel-snapped noise octaves (pixel-art ripples, not smooth)
  float t = uTime;
  vec2 rp = tc * vec2(1.2, 3.0);
  float r1 = vnoise(rp * 2.0 + vec2(t * 0.25, t * 0.1)), r2 = vnoise(rp * 5.0 - vec2(t * 0.4, -t * 0.15));
  vec3 N = normalize(vec3((r1 - 0.5) * 0.06 + (r2 - 0.5) * 0.04, 1.0, (r2 - 0.5) * 0.14 + (r1 - 0.5) * 0.08));
  vec3 V = normalize(vWP - uCam);
  vec3 R = reflect(V, N);
  float fres = pow(1.0 - max(dot(-V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
  vec3 deep = vec3(0.004, 0.012, 0.01);
  // glints: every point light reflected through the rippled normal (vertical streak at grazing angles)
  vec3 spec = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec4 p = uLP[i]; if (p.w <= 0.0) continue;
    vec3 Ld = p.xyz - vWP; float dist = length(Ld); Ld /= dist;
    float s = pow(max(dot(R, Ld), 0.0), 260.0) * 3.2;
    spec += uLC[i].rgb * s * clamp(1.0 - dist / (p.w * 2.2), 0.0, 1.0);
  }
  spec += uSunCol * pow(max(dot(R, normalize(uSunDir)), 0.0), 600.0) * 0.8;
  // posterise the glints into 3 steps so they read as pixel art
  spec = floor(spec * 4.0 + 0.5) / 4.0;
  if (uWaterTier > 1.5) {
    // tier 2: matte bog, no reflection pass. A cheap sky sheen + the glints keep "water" readable.
    vec3 col = mix(deep, uFogCol * 0.55, fres * 0.8) + spec;
    gl_FragColor = vec4(applyFog(col, vWP), 1.0); return;
  }
  float a = mix(0.74, 0.46, fres);              // dark looking down, more mirror-like at grazing
  vec3 col = deep + spec;
  vec3 fogged = applyFog(col, vWP);
  gl_FragColor = vec4(fogged, a + min(dot(spec, vec3(0.33)), 0.6));
}`,
    transparent: true,
    depthWrite: true,
  });
}

/**
 * Mirrored-billboard material: shares every uniform cell of the source sprite material (so lights stay live), mirrors
 * nothing itself (the mesh is flipped with scale.y = -1 about y = 0), and adds a row-wise ripple wobble + darkening.
 */
export function reflectionMaterial(src: ShaderMaterial, darken: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...src.uniforms, uTint: { value: new Vector3(darken, darken * 1.04, darken * 1.06) } },
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

/** Ground-hugging fog card: soft drifting noise band, normal blend, tinted to the mood's fog colour (lighter). */
export function fogCardMaterial(
  u: LightingUniforms,
  color: readonly [number, number, number],
  alpha: number,
  seed: number,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...u, uColor: { value: new Vector3(...color) }, uA: { value: alpha }, uSeed: { value: seed } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor; uniform float uA, uSeed; varying vec2 vUv; varying vec3 vWP;
void main(){
  vec2 p = vUv; float t = uTime * 0.035;
  float n = vnoise(vec2(p.x * 5.0 + t * 3.0 + uSeed, p.y * 2.0)) * 0.6 + vnoise(vec2(p.x * 13.0 - t * 5.0, p.y * 4.0 + uSeed)) * 0.4;
  float band = smoothstep(0.0, 0.45, p.y) * smoothstep(1.0, 0.35, p.y);
  float edge = smoothstep(0.0, 0.12, p.x) * smoothstep(1.0, 0.88, p.x);
  float a = clamp((n - 0.28) * 1.6, 0.0, 1.0) * band * edge * uA;
  // posterise the alpha a little + Bayer dither so the fog reads as pixel art, not a smooth gradient
  vec2 tp = floor(gl_FragCoord.xy / 2.0); a = floor(a * 6.0 + bayer4(tp)) / 6.0;
  vec3 col = uColor + inscatter(vWP) * uScatter * 0.6;
  gl_FragColor = vec4(col, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}

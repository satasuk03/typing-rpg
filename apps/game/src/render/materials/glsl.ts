import { MAX_LIGHTS } from "../lighting";

/**
 * GLSL shared by every lit material: the lighting uniform block, hash/noise helpers, the point-light
 * loop (smooth-squared falloff, wrap lighting, rim), analytic volumetric in-scatter and fog.
 * Ported from the POC v2 `GLSL_COMMON`.
 */
export const GLSL_COMMON = /* glsl */ `
#define NL ${MAX_LIGHTS}
uniform vec4 uLP[NL]; uniform vec4 uLC[NL];
uniform vec3 uAmb, uGAmb, uSunDir, uSunCol, uFogCol, uFog, uCam;
uniform float uScatter, uTime, uFlat;
uniform vec2 uBiome;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
vec3 lightAt(vec3 wp, vec3 N, float wrap, float rim){
  if (uFlat > 0.5) return vec3(1.0);
  vec3 L = mix(uGAmb, uAmb, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  L += uSunCol * max((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0);
  for (int i = 0; i < NL; i++) {
    vec4 p = uLP[i]; if (p.w <= 0.0) continue;
    vec3 d = p.xyz - wp; float dist = length(d);
    float a = clamp(1.0 - dist / p.w, 0.0, 1.0); a *= a;
    if (a <= 0.0) continue;
    vec3 ld = d / max(dist, 1e-3);
    float nd = max((dot(N, ld) + wrap) / (1.0 + wrap), 0.0);
    float r = rim * pow(1.0 - clamp(N.z, 0.0, 1.0), 1.4) * clamp(0.55 - ld.z * 0.8, 0.0, 1.5);
    L += uLC[i].rgb * a * (nd + r);
  }
  return L;
}
vec3 inscatter(vec3 wp){
  vec3 v = wp - uCam; float t = length(v); v /= t; vec3 s = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    float k = uLC[i].w; if (k <= 0.0 || uLP[i].w <= 0.0) continue;
    vec3 cp = uLP[i].xyz - uCam; float s0 = dot(cp, v);
    float h = sqrt(max(dot(cp, cp) - s0 * s0, 0.09));
    float I = (atan((t - s0) / h) - atan(-s0 / h)) / h;
    s += uLC[i].rgb * k * I;
  }
  return min(s, vec3(0.6));
}
vec3 applyFog(vec3 col, vec3 wp){
  if (uFlat > 0.5) return col;
  float d = length(wp - uCam);
  float f = 1.0 - exp(-uFog.x * max(d - uFog.y, 0.0));
  float hf = exp(-max(wp.y, 0.0) * uFog.z);
  f = clamp(f * (0.55 + 0.45 * hf), 0.0, 1.0);
  return mix(col, uFogCol, f) + inscatter(wp) * uScatter;
}
`;

export const VS_WORLD = /* glsl */ `
varying vec2 vUv; varying vec3 vWP;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

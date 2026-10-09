/**
 * GLSL for the post pipeline (ported from POC v2): depth-based + tilt-shift DOF, foreground blur,
 * bloom (threshold / down / up), and the final ACES + grade + CA / zoom punch / heat haze / letterbox pass.
 */
export const VS_POST = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DEPTH_FN = /* glsl */ `uniform float uNear, uFar; float linZ(float d){ return (uNear * uFar) / ((uFar - uNear) * d - uFar) * -1.0; }`;

const COC_FN = /* glsl */ `uniform float uFocus, uRangeFar, uRangeNear, uTilt, uFocusY; uniform sampler2D tDep;
  float cocAt(vec2 uv){ float z = linZ(texture2D(tDep, uv).x); float c = z > uFocus ? (z - uFocus) / uRangeFar : (uFocus - z) / uRangeNear;
    float tilt = smoothstep(0.2, 0.62, abs(uv.y - uFocusY)) * uTilt; return clamp(max(c, tilt), 0.0, 1.0); }`;

/** Golden-angle gather DOF; `samples` is baked in (changing quality tier recompiles this one shader). */
export const dofFragment = (
  samples: number,
): string => /* glsl */ `${DEPTH_FN} ${COC_FN} uniform sampler2D tCol; uniform vec2 uTexel; uniform float uMaxR; varying vec2 vUv;
  float hj(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){ float c0 = cocAt(vUv); vec3 acc = texture2D(tCol, vUv).rgb; float ws = 1.0; float rot = hj(gl_FragCoord.xy) * 6.2832;
    for (int i = 0; i < ${samples}; i++) { float fi = float(i) + 0.5; float r = sqrt(fi / float(${samples})); float th = fi * 2.39996 + rot;
      vec2 uv = vUv + vec2(cos(th), sin(th)) * r * uMaxR * uTexel; float cs = cocAt(uv);
      float w = smoothstep(r - 0.14, r, min(cs, c0 + 0.2)); vec3 s = texture2D(tCol, uv).rgb;
      float lum = dot(s, vec3(0.3, 0.55, 0.15)); w *= 1.0 + max(lum - 1.5, 0.0) * 0.35;
      acc += s * w; ws += w; }
    gl_FragColor = vec4(acc / ws, c0); }`;

export const COPY_DOWN_FS = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
  void main(){ vec4 a = texture2D(tSrc, vUv + uTexel * vec2(-1, -1)) + texture2D(tSrc, vUv + uTexel * vec2(1, -1)) + texture2D(tSrc, vUv + uTexel * vec2(-1, 1)) + texture2D(tSrc, vUv + uTexel * vec2(1, 1)); gl_FragColor = a * 0.25; }`;

export const BLUR_FS = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
  void main(){ vec4 s = texture2D(tSrc, vUv) * 0.1964; s += (texture2D(tSrc, vUv + uDir * 1.4118) + texture2D(tSrc, vUv - uDir * 1.4118)) * 0.2969;
    s += (texture2D(tSrc, vUv + uDir * 3.2941) + texture2D(tSrc, vUv - uDir * 3.2941)) * 0.0945; s += (texture2D(tSrc, vUv + uDir * 5.1765) + texture2D(tSrc, vUv - uDir * 5.1765)) * 0.0104; gl_FragColor = s; }`;

/** Composite: scene, DOF-blurred scene (by circle of confusion) and the blurred foreground layer. */
export const COMBINE_FS = /* glsl */ `${DEPTH_FN} ${COC_FN} uniform sampler2D tScene, tDof, tFg; uniform float uDofOn; varying vec2 vUv;
  void main(){ vec3 col = texture2D(tScene, vUv).rgb;
    if (uDofOn > 0.5) { float c = cocAt(vUv); col = mix(col, texture2D(tDof, vUv).rgb, smoothstep(0.04, 0.3, c)); }
    vec4 f = texture2D(tFg, vUv); col = col * (1.0 - f.a) + f.rgb; gl_FragColor = vec4(col, 1.0); }`;

export const BLOOM_PRE_FS = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr, uKnee; varying vec2 vUv;
  void main(){ vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb) * 0.25;
    float br = max(c.r, max(c.g, c.b)); float rq = clamp(br - uThr + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);
    float w = max(rq, br - uThr) / max(br, 1e-4); gl_FragColor = vec4(min(c * w, vec3(40.0)), 1.0); }`;

export const BLOOM_UP_FS = /* glsl */ `uniform sampler2D tLow, tHigh; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
  void main(){ vec3 s = vec3(0.0); vec2 t = uTexel;
    s += texture2D(tLow, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tLow, vUv + vec2(t.x, -t.y)).rgb + texture2D(tLow, vUv + vec2(-t.x, t.y)).rgb + texture2D(tLow, vUv + vec2(t.x, t.y)).rgb;
    s += (texture2D(tLow, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(t.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(0.0, -t.y)).rgb + texture2D(tLow, vUv + vec2(0.0, t.y)).rgb) * 2.0;
    s += texture2D(tLow, vUv).rgb * 4.0; s /= 16.0;
    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s * uMix, 1.0); }`;

/**
 * Final pass: heat haze, chromatic aberration + radial zoom punch, bloom add, exposure, ACES filmic
 * tone map, colour grade (sat/contrast/lift-gain-gamma + shadow/highlight tint), vignette, flash,
 * film grain, letterbox bars, then linear -> sRGB.
 */
export const FINAL_FS = /* glsl */ `uniform sampler2D tComb, tBloom; uniform vec2 uRes, uZoomC; uniform float uBloom, uExposure, uCA, uZoom, uVig, uGrain, uTime, uSat, uContrast, uFlash, uRaw, uBars;
  uniform vec3 uLift, uGamma, uGain, uShadowTint, uHighTint, uFlashCol; uniform vec4 uHeat[4]; varying vec2 vUv;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec3 samp(vec2 uv){ if (uCA <= 0.0) return texture2D(tComb, uv).rgb; vec2 d = (uv - 0.5) * uCA; return vec3(texture2D(tComb, uv + d).r, texture2D(tComb, uv).g, texture2D(tComb, uv - d).b); }
  void main(){
    vec2 uv = vUv;
    if (uRaw > 0.5) { vec3 c = texture2D(tComb, uv).rgb; gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); return; }
    for (int i = 0; i < 4; i++) { vec4 hh = uHeat[i]; if (hh.w <= 0.0) continue; vec2 d = uv - hh.xy; d.x *= uRes.x / uRes.y; float k = hh.w * smoothstep(hh.z, 0.0, length(d));
      uv += vec2(sin(uv.y * 140.0 + uTime * 22.0), cos(uv.x * 120.0 + uTime * 19.0)) * 0.004 * k; }
    vec3 col;
    if (uZoom > 0.001) { col = vec3(0.0); vec2 dir = uv - uZoomC; for (int i = 0; i < 12; i++) col += samp(uv - dir * uZoom * float(i) / 12.0); col /= 12.0; }
    else col = samp(uv);
    col += texture2D(tBloom, uv).rgb * uBloom;
    col *= uExposure;
    col = aces(col);
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSat);
    col = (col - 0.45) * uContrast + 0.45;
    col = col * uGain + uLift * (1.0 - col);
    col = pow(max(col, 0.0), 1.0 / uGamma);
    col += uShadowTint * (1.0 - smoothstep(0.0, 0.5, l)) + uHighTint * smoothstep(0.45, 1.0, l);
    vec2 vq = (vUv - 0.5) * vec2(1.0, 0.82); float v = smoothstep(0.78, 0.18, length(vq));
    col *= mix(1.0 - uVig, 1.0, v);
    col = mix(col, uFlashCol, uFlash);
    col += (h12(vUv * uRes + fract(uTime * 7.13) * 917.0) - 0.5) * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.5, l));
    if (vUv.y < uBars || vUv.y > 1.0 - uBars) col = vec3(0.0);
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
  }`;

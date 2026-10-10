// @ts-nocheck
// biome-ignore-all lint: dense procedural pixel-art code (same convention as proceduralArt.ts / ch2Props.ts).
// biome-ignore-all format: see above.
/**
 * Chapter II enemies + the Whispering Willow (T2.3), at production quality.
 * Direction: docs/vfx/ch2-art-direction.md section 3; the C0.2 mock sprites were direction only and are exceeded here:
 *   - the Gloom Wolf and the Mire Toad are built from SDF unions (ellipses + tapered capsules) shaded from the SDF gradient
 *     (form shading with a real light direction, wet speculars, fur strokes, warts with a highlight and a shadow pixel)
 *     instead of flat hand-placed blocks, with proper anatomy (skull / muzzle / ears / ruff / deep chest / tucked waist /
 *     hock + paw / bushy tail; eye bumps / lily-pad hat / throat sac / splayed toes / folded haunch);
 *   - the Hush Shade keeps a minimum interior ramp index (never a black hole against fog), has a violet rim light on its
 *     back edge and a theatre mask (arched brows, crescent eye slits, a stitched mouth), never a skull;
 *   - every backlit silhouette carries a rim or eyes; the Moth carries its glowing green healing crosses (green is
 *     reserved for healing); the Wisp's eyes are non-emissive (no bleed);
 *   - the Willow is multi-part (core: trunk + face + root beard built from T2.1's `lock` fronds; lash roots; the front /
 *     back / canopy frond curtains are T2.1's `prop.ch2.fronds.*`), authored shape normals everywhere.
 * Conventions: 16 texels per metre, anchor at the foot; every enemy is drawn facing right and baked flipped to face the hero
 * (image, glow AND normal with x negated: `Layer.finish({ flip: true })`, the `.flip`-twin approach of ch2Props done at
 * build time, Ch2 only; Ch1 sprites are never touched).
 *
 * Keys (ProceduralSpriteSource): `monster.<id>` with anims `idle` (+ `atk`, and `cast` / `howl` / `crouch` where the
 * brief wants one), and `monster.<id>.elite` (gold-rimmed render variant for any enemy, driven by `EnemyView.elite`).
 * The Willow: `monster.willow` (idle = phase 1, atk = hush spell, plus intro / p1 / spell / riddle / freed) and
 * `monster.willow.lash` (coil / whip / recoil).
 */

import { bayer, clamp, clump, hash, hex, Layer, lerp, limb, lock, mk, PAL, pal, pick, RNG, strand } from "./ch2Props";
import type { SpriteFrame } from "./SpriteSource";

// ------------------------------------------------------------------ public ids + layout constants
export const CH2_MONSTER_IDS = ["wisp", "shade", "moth", "toad", "wolf"] as const;
export type Ch2MonsterId = (typeof CH2_MONSTER_IDS)[number];

/** Actor scales from the brief (section 3). The elite variant is x1.08 over the base scale (brief 3.6). */
export const CH2_SCALE: Record<Ch2MonsterId | "willow", number> = { wisp: 1.2, shade: 1.1, moth: 1.15, toad: 1.3, wolf: 1.45, willow: 1.0 };
export const ELITE_SCALE = 1.08;
/** Elite read, generic (brief 3.6): persistent rim flash, ground sigil, rising motes. The sprite carries the gold outline. */
export const ELITE_FX = {
  rim: { strength: 0.42, color: [1.9, 1.35, 0.45], breathe: 0.08, hz: 0.7 },
  sigil: { radius: 3.4, strength: 0.55, color: [1.5, 1.05, 0.3] },
  motes: { rate: 7, color: [2.2, 1.5, 0.4], life: [0.8, 1.3] },
} as const;
export const eliteKey = (key: string): string => `${key}.elite`;

/** Willow part layout (brief 3.7): metres relative to the boss anchor (root collar); the face is the plate anchor. */
export const WILLOW_FACE_Y_M = 4.75;
export const WILLOW_LAYOUT = {
  core: { scale: 1.0, w: 112, h: 132 },
  faceY: WILLOW_FACE_Y_M,
  frontFronds: [{ dx: -4.6, y: 9.3, dz: 0.35, i: 0, s: 1.25 }, { dx: -3.7, y: 9.9, dz: 0.5, i: 1, s: 1.15 }, { dx: 3.7, y: 9.8, dz: 0.5, i: 2, s: 1.2 }, { dx: 4.8, y: 9.2, dz: 0.35, i: 3, s: 1.3 }],
  backFronds: [{ dx: -6.5, y: 10.4, dz: -0.4, i: 2, s: 1.4 }, { dx: 6.5, y: 10.6, dz: -0.4, i: 1, s: 1.4 }, { dx: 0, y: 11.4, dz: -0.6, i: 3, s: 1.3 }],
  lashRoots: [{ dx: -3, dz: 0.4, s: 1.2 }, { dx: 3, dz: 0.4, s: 1.2, mirror: true }],
} as const;

// ------------------------------------------------------------------ small SDF kit
const sdEll = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
const sdCap = (x, y, ax, ay, bx, by, ra, rb) => { const dx = bx - ax, dy = by - ay; const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) - lerp(ra, rb, t); };
/** Paint every pixel inside `sd` (negative inside) with `shade(x, y, nx, ny, edge, depth)`; (nx, ny) = outward, image coords. */
function paintSdf(L, w, h, sd, shade, rim = 3.2) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = sd(x + 0.5, y + 0.5);
    if (d > 0) continue;
    const gx = sd(x + 1.5, y + 0.5) - sd(x - 0.5, y + 0.5), gy = sd(x + 0.5, y + 1.5) - sd(x + 0.5, y - 0.5);
    const gl = Math.hypot(gx, gy) || 1;
    shade(x, y, gx / gl, gy / gl, clamp(1 + d / rim, 0, 1), -d);
  }
}
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const finishMon = (L, outline, o = {}) => L.finish({ outline, flip: true, ...o });

// ------------------------------------------------------------------ 1. LANTERN WISP (22 x 30, flies)
/** A runaway lantern flame wearing its broken iron cap. Body emissive (0.75), eyes + cap NOT emissive. */
export function makeWisp(phase = 0, atk = false) {
  const w = 22, h = 30, L = Layer(w, h), C = PAL.WISP, I = PAL.IRON;
  const cx = 11, cy = 21, R = atk ? 6.7 : 5.9, sway = Math.sin(phase * 1.7) * 2.3, flick = Math.sin(phase * 3.1);
  // main flame: a teardrop with a flicking tip and two small side licks (a silhouette that is not a blob)
  const lick = (x, y) => { // side tongues: left tongue + right tongue, offset by phase
    let m = 0;
    for (const [sx, sy, s] of [[-1, 15.5, 1], [1, 16.5, 1]]) { const lx = cx + sx * (R + 0.2 + Math.sin(phase * 2 + sx) * 0.5), ly = sy - Math.cos(phase * 2 + sx) * 0.8; const d = Math.hypot((x - lx) / 1.5, (y - ly) / 3.2); if (d < 1) m = Math.max(m, 1 - d); }
    return m;
  };
  for (let y = 2; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const dy = y - cy, t = clamp((cy - y) / (cy - 3), 0, 1);
    const ccx = cx + sway * t * t + (t > 0.8 ? flick * (t - 0.8) * 5 : 0);
    const rad = dy > 0 ? R * Math.sqrt(Math.max(0, 1 - Math.pow(dy / (R + 1.3), 2))) : R * Math.pow(1 - t, 0.82) + 0.3;
    const d = Math.abs(x - ccx) / Math.max(0.55, rad);
    const lk = lick(x, y);
    if ((d > 1 || (dy > 0 && dy > R + 1.1)) && lk < 0.25) continue;
    // deep-blue rim -> cyan flesh -> a small white-hot core low in the body (never a white blob)
    const core = Math.max(0, 1 - Math.hypot((x - cx) / 2.8, (y - cy - 1.2) / 3.2));
    const heat = Math.max(0, 1 - Math.hypot((x - cx) / 5, (y - cy - 0.5) / 6)) * 0.9;
    const l = 0.9 + (1 - Math.min(d, 1)) * 1.7 + core * 2.5 + heat * 0.7 - t * 0.9 + bayer(x, y) * 0.5 + (atk ? 0.5 : 0) + lk * 0.8;
    const c = pick(C, l);
    L.ed(x, y, c, 0.75);
    L.n(x, y, (x - ccx) / Math.max(1, rad), -dy / 8, 0.8);
  }
  // eyes: dark with a catch-light, non-emissive (L.set clears glow), a small 'o' mouth
  for (const ex of [8, 13]) { for (let k = 0; k < 3; k++) { L.set(ex, 19 + k, hex('#081226')); L.set(ex + 1, 19 + k, hex('#0c1a34')); } L.set(ex, 18, hex('#0a1630')); L.set(ex + 1, 18, hex('#0a1630')); L.set(ex + 1, 19, hex('#ffffff')); }
  for (const [mx, my] of [[10, 24], [11, 24], [10, 25], [11, 25]]) L.set(mx, my, hex('#0c2a50'));
  L.set(10, 25, hex('#173a66')); L.set(11, 25, hex('#173a66'));
  // the broken iron lantern cap riding the flame: an 11 px band, three bars, a ring handle (with a dented side)
  const capY = 13 + Math.round(Math.sin(phase) * 0.6);
  for (let x = 6; x <= 16; x++) { L.sn(x, capY, x === 6 || x === 16 ? I[1] : I[3], 0, 1, 0.5); L.sn(x, capY + 1, x < 9 ? I[3] : I[2], 0, 0, 1); L.sn(x, capY + 2, I[1], 0, -0.5, 0.8); }
  L.sn(15, capY + 1, I[1], 0, 0, 1); L.sn(16, capY + 1, I[0], 0, 0, 1); // the dent
  for (const bx of [8, 11, 14]) { L.sn(bx, capY - 1, I[2], 0, 1, 0.5); L.sn(bx, capY - 2, I[3], 0, 1, 0.5); }
  for (let a = 0; a < 15; a++) { const an = Math.PI + a / 14 * Math.PI; L.sn(11 + Math.cos(an) * 3, capY - 3 + Math.sin(an) * 3, a < 7 ? I[3] : I[2], Math.cos(an), -Math.sin(an), 0.6); }
  return finishMon(L, [8, 12, 34], { bulge: 0.6 });
}

// ------------------------------------------------------------------ 2. HUSH SHADE (28 x 40, hovers)
/** A hooded lost word with a theatre mask. Minimum interior ramp index 3 (never near-black), violet rim light on the back edge. */
export function makeShade(phase = 0, atk = false) {
  const w = 28, h = 40, L = Layer(w, h), C = PAL.SHADE, M = PAL.MASK, V = PAL.HUSHV;
  const cx = 13 + (atk ? 2 : 0);
  for (let y = 1; y < h; y++) {
    const t = (y - 1) / (h - 1);
    let hw = t < 0.33 ? 1 + Math.pow(t / 0.33, 0.7) * 6.5 : 7.5 + (t - 0.33) * 9;
    if (atk && t > 0.35 && t < 0.75) hw += 2.5;
    const tipLean = t < 0.33 ? -(0.33 - t) * 16 : 0;
    const sx = cx + tipLean + (t > 0.55 ? Math.sin(phase + t * 7) * 1.4 * (t - 0.55) * 2 : 0);
    const x0 = Math.floor(sx - hw), x1 = Math.floor(sx + hw);
    for (let x = x0; x <= x1; x++) {
      const q = (x - sx) / Math.max(1, hw);
      if (t > 0.74) { const tooth = Math.abs(Math.sin((x - sx) * 0.85 + phase)); if (t - 0.74 > tooth * 0.24) continue; if (bayer(x, y) < (t - 0.74) * 3.4) continue; }
      // base ramp 4.2 (#30265e-#43387e): the robe is a dark indigo, not black. Folds dip to 3.0 at most.
      let l = 4.3 - q * 1.3 - t * 1.2 + (hash(x, y >> 1) - 0.5) * 0.5 + bayer(x, y) * 0.5;
      if (t > 0.38 && Math.abs(Math.sin(q * 4.6 + t * 2.4)) < 0.11) l -= 0.9; // robe folds
      if (t > 0.38 && Math.abs(Math.sin(q * 4.6 + t * 2.4 + 0.5)) < 0.1) l += 0.7; // fold highlight
      if (t < 0.36 && q > 0.45) l += 0.9; // moonlit hood edge
      l = Math.max(l, 3.0);
      let c = pick(C, l);
      // violet back-edge rim light (the leading edge faces the camera, this one is the silhouette's backlit side)
      if (x === x0 || x === x0 + 1 && t < 0.7) c = x === x0 ? V[1] : [C[5][0], C[5][1], C[5][2]];
      L.sn(x, y, c, q * 0.9, 0.25 - t * 0.4, 0.8);
      if (x === x0 && t > 0.05 && t < 0.72) L.g(x, y, dark(V[2], 0.32));
    }
  }
  // the hood opening (a deep void, not pure black: #0a0818) and the pale blank theatre mask floating in it
  const fx = cx + 1.5, fy = 11;
  for (let y = fy - 6; y <= fy + 6; y++) for (let x = fx - 5; x <= fx + 5; x++) { const d = Math.hypot((x - fx) / 4.6, (y - fy) / 6); if (d < 1) L.set(x, y, hex('#0a0818')); }
  // mask: an oval with a pointed chin, forehead lit, cheeks soft, a darker rim. Faint self-glow (0.3) so it reads at night.
  for (let y = fy - 5; y <= fy + 5; y++) {
    const v = (y - fy) / 5, half = 3.9 * Math.sqrt(Math.max(0, 1 - v * v)) * (v > 0 ? 1 - v * 0.62 : 1 + v * 0.14);
    for (let x = Math.ceil(fx - half); x <= Math.floor(fx + half); x++) {
      const dx = (x - fx) / Math.max(1, half);
      let l = 2.5 - dx * 0.9 - v * 0.7 + bayer(x, y) * 0.35;
      if (Math.abs(dx) > 0.82 || Math.abs(v) > 0.88) l -= 1.2;
      L.ed(x, y, pick(M, l), 0.3);
      L.n(x, y, dx * 0.8, -v * 0.6, 0.8);
    }
  }
  // painted brows (arched, sorrowful), two separate crescent eye slits (violet, emissive), a nose ridge, a short stitched mouth
  for (const s of [-1, 1]) {
    const ex = Math.round(fx + s * 1.9);
    for (const [bx, by] of [[ex - s * 1, fy - 3], [ex, fy - 3], [ex + s * 1, fy - 2]]) L.set(bx, by, hex('#5a4e74'));
    L.e(ex - s, fy - 1, V[2]); L.e(ex, fy, V[3]); L.e(ex + s, fy, V[2]);
    L.set(ex - s, fy, hex('#9a90b0')); L.set(ex, fy + 1, hex('#b0a8c6'));
  }
  for (let y = fy - 1; y <= fy + 2; y++) L.set(Math.round(fx), y, y === fy + 2 ? hex('#8e84a8') : hex('#c4bcd6'));
  for (let k = -2; k <= 2; k++) L.set(Math.round(fx) + k, fy + 4, hex('#6e6288'));
  for (const k of [-2, 0, 2]) { L.e(Math.round(fx) + k, fy + 3, V[2]); L.e(Math.round(fx) + k, fy + 5, V[1]); }
  // long drooping sleeves, the near one reaching forward (and lunging in atk)
  for (let s = 0; s < 13; s++) { const t = s / 13; L.sn(cx - 7 - s * 0.25, 16 + s, pick(C, 3.4 - t * 0.6), -0.6, 0, 0.8); L.sn(cx - 6 - s * 0.25, 16 + s, pick(C, 3.0 - t * 0.4), -0.4, 0, 0.8); }
  for (let s = 0; s < 14; s++) { const t = s / 14, ax = atk ? s * 0.95 : s * 0.45, ay = atk ? -s * 0.45 : s * 0.8; L.sn(cx + 6 + ax, 16 + ay, pick(C, 5.2 - t * 0.6), 0.6, 0.2, 0.8); L.sn(cx + 6 + ax, 17 + ay, pick(C, 4.2 - t * 0.5), 0.6, -0.2, 0.8); L.sn(cx + 6 + ax, 18 + ay, pick(C, 3.4), 0.6, -0.4, 0.8); if (t > 0.78) { L.sn(cx + 7 + ax, 17 + ay + (s % 2), M[1], 0.6, 0, 0.8); L.sn(cx + 8 + ax, 17 + ay, M[0], 0.6, 0, 0.8); } }
  // word-motes fraying off the hem (dim violet, emissive)
  for (let k = 0; k < 4; k++) { const mx = cx - 6 + k * 4 + Math.round(Math.sin(phase + k) * 1.5), my = h - 2 - (k % 2) * 2; L.ed(mx, my, V[2], 0.8); L.ed(mx + 1, my - 1, V[1], 0.6); }
  return finishMon(L, [16, 10, 44], { bulge: 0.8 });
}

// ------------------------------------------------------------------ 3. MOTH MENDER (36 x 28, flies, healer)
/** Dusty moth; each forewing eyespot is a dark ring around a glowing green cross (green = healing, reserved). */
export function makeMoth(phase = 0, cast = false) {
  const w = 36, h = 28, L = Layer(w, h), B = PAL.MOTHB, W = PAL.MOTHW, G = PAL.HEAL;
  const cx = 18, cy = 15, up = cast ? -5 : Math.round(Math.sin(phase) * 3);
  for (const s of [-1, 1]) {
    const fore = [[1, -3], [5, -8 + up * 0.5], [12, -12 + up], [16, -11 + up], [16.5, -6 + up * 0.6], [13, -1], [11, 1], [5, 2.5], [1, 1]];
    const hind = [[1, 1], [6, 1], [11, 3], [12, 6.5], [9, 10], [5, 10.5], [2, 8], [1, 5]];
    for (let y = -14; y <= 12; y++) for (let x = 0; x <= 17; x++) {
      const inF = inPoly(x + 0.5, y + 0.5, fore), inH = !inF && inPoly(x + 0.5, y + 0.5, hind);
      if (!inF && !inH) continue;
      // scalloped trailing edges (bites between the wing "teeth")
      const sc = Math.sin(Math.atan2(y + 2, x + 0.5) * 9);
      if ((inF && x > 9 && y > -4 && sc > 0.55 && hash(x, y) < 0.8) || (inH && (x > 8 || y > 6) && sc > 0.35 && hash(x * 3, y) < 0.8)) continue;
      const X = cx + s * (x + 1), Y = cy + y;
      const edge = inF ? (16.5 - x) * 0.04 : 0;
      let l = inF ? 3.5 - (y + 12) * 0.075 + x * 0.04 : 2.5 - y * 0.06;
      if (inF && Math.abs(Math.sin(Math.atan2(y + 2, x) * 5)) < 0.15) l -= 1.0; // radial veins
      if (inF && Math.abs(x - (13 - (y + 10) * 0.5)) < 0.8) l += 1.1; // a pale band across the forewing
      if (hash(x * 5, y * 3) > 0.88) l += 0.7; // dusty scale speckle
      if (y < -8 + up * 0.5 + (x < 6 ? 5 : 0) && inF) l += 0.6; // moonlit leading edge
      L.sn(X, Y, pick(W, l + bayer(X, Y) * 0.5 - edge), s * (0.25 + x * 0.02), 0.35 - y * 0.01, 0.85);
    }
    // the healer eyespot: a dark ring around a glowing green cross, 7 px across (reads as a plus at 1280 px)
    const ex = cx + s * 9, ey = cy - 5 + Math.round(up * 0.6);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.hypot(x, y); if (d < 4.2) L.sn(ex + x, ey + y, d > 3.2 ? hex('#141008') : d > 2.6 ? hex('#1c3a1e') : hex('#0e2a16'), x / 4, -y / 4, 0.6); }
    const k = cast ? 1.5 : 1;
    for (let a = -3; a <= 3; a++) {
      const c = a === 0 ? G[4] : Math.abs(a) === 3 ? G[1] : G[2];
      L.set(ex + a, ey, c); L.g(ex + a, ey, dark(c, k)); L.set(ex, ey + a, c); L.g(ex, ey + a, dark(c, k));
    }
    L.set(ex - 1, ey - 1, hex('#0e2a16')); // keep the cross centre-weighted: soft corners
  }
  // fuzzy segmented body with a pale thorax collar
  for (let y = cy - 4; y <= cy + 10; y++) for (let x = cx - 2; x <= cx + 2; x++) { const q = (x - cx) / 2.5; if (Math.abs(q) > 0.75 && y > cy + 7) continue; L.sn(x, y, pick(B, 4.2 - Math.abs(q) * 1.6 - (y - cy) * 0.11 + hash(x, y) * 0.8 - ((y - cy) % 3 === 0 ? 0.9 : 0) + (y < cy - 1 ? 0.6 : 0)), q, 0, 0.9); }
  for (let x = cx - 3; x <= cx + 3; x++) for (let y = cy - 8; y <= cy - 4; y++) if (Math.hypot(x - cx, y - (cy - 6)) < 3) L.sn(x, y, pick(B, 4.8 - Math.abs(x - cx) * 0.4 + (y < cy - 6 ? 0.4 : 0)), (x - cx) / 3, 0.5, 0.8);
  for (let x = cx - 3; x <= cx + 3; x++) L.sn(x, cy - 3, pick(B, 5.1), 0, 0.3, 0.9); // fluffy collar
  // feathered antennae
  for (const s of [-1, 1]) for (let k = 0; k < 9; k++) { const x = cx + s * (1 + k * 0.8), y = cy - 9 - k * 0.9 + k * k * 0.09; L.sn(x, y, B[4], 0, 1, 0.5); if (k % 2) { L.sn(x + s, y + 1, B[2], 0, 1, 0.5); L.sn(x - s * 0.5, y - 1, B[3], 0, 1, 0.5); } }
  L.set(cx - 1, cy - 7, hex('#101008')); L.set(cx + 1, cy - 7, hex('#101008'));
  return finishMon(L, [14, 12, 6], { bulge: 0.7 });
}

// ------------------------------------------------------------------ 4. MIRE TOAD (44 x 32, brute)
/**
 * Squat warty toad. SDF-built: body dome + folded haunch + head + eye bumps + throat sac + splayed front leg with toes + long
 * hind foot, form-shaded, with warts (highlight + shadow pixel), wet speculars, a lily-pad hat with one white flower.
 * pose: 'idle' (pulse = throat sac phase) | 'crouch' (the 12 s telegraph: squashed, eyes narrowed) | 'atk' (the leap: stretched, mouth open).
 */
export function makeToad(pose = 'idle', pulse = 0) {
  const w = 44, h = 32, L = Layer(w, h), C = PAL.TOAD, Bl = PAL.BELLY, E = PAL.GOLDEYE;
  const base = 30, crouch = pose === 'crouch', atk = pose === 'atk';
  const sqy = crouch ? 0.82 : 1, hx = atk ? 2 : 0, sac = atk ? 0 : pulse;
  const toSd = (y) => base - (base - y) / sqy;   // screen y -> sdf-space y (squash about the ground)
  const toScr = (y) => base - (base - y) * sqy;  // sdf-space y -> screen y (for hand-placed details)
  const eyes = [[30 + hx, 16.3], [35.6 + hx, 16.7]];
  const sacC = [34 + hx, 26.4], sacR = [5.2 + sac * 0.8, 3.2 + sac * 0.8];
  const main = (x, y0) => { const y = toSd(y0); return Math.min(
    sdEll(x, y, 19, 21, 14.6, 9.6),                         // back dome (the highest point, behind the head)
    sdEll(x, y, 32.5 + hx, 22.6, 8.2, 5.8),                 // head, low and wide
    sdEll(x, y, eyes[0][0], eyes[0][1], 3.5, 3.2), sdEll(x, y, eyes[1][0], eyes[1][1], 3.3, 3.1), // eye bumps
    sdEll(x, y, sacC[0], sacC[1], sacR[0], sacR[1]),        // throat sac
  ); };
  const haunch = (x, y0) => { const y = toSd(y0); return atk ? Math.min(sdEll(x, y, 9.5, 23, 7.4, 6.2), sdCap(x, y, 8, 25, 2, 29, 3, 1.6)) : sdEll(x, y, 10, 23.6, 7.6, 6.6); };
  const hind = (x, y0) => { const y = toSd(y0); const a = atk ? [3, 28.6, 14, 29.6] : [6.5, 29.2, 17, 29.7]; let d = sdCap(x, y, a[0], a[1], a[2], a[3], 2.3, 1.2); for (const tx of atk ? [1.5, 3.6, 5.6] : [18.4, 20.6, 22.6]) d = Math.min(d, sdEll(x, y, tx, 29.6, 1.5, 0.95)); return d; };
  const front = (x, y0) => { const y = toSd(y0); const a = atk ? [28 + hx, 23.5, 38, 27.5] : [27.5 + hx, 23.4, 29.2 + hx, 29.4]; let d = sdCap(x, y, a[0], a[1], a[2], a[3], 3.2, 1.9); for (const tx of atk ? [39.5, 41.8, 43] : [28, 30.6, 33]) d = Math.min(d, sdEll(x, y, tx + (atk ? 0 : hx), atk ? 27.8 : 29.5, 1.6, 1.0)); return d; };
  // warts: a centre pixel (lighter) with a shadow pixel below-right; clustered on the back and the cheeks
  const rr = RNG(7), warts = new Set();
  for (let i = 0; i < 18; i++) warts.add(`${6 + Math.floor(rr() * 24)},${12 + Math.floor(rr() * 9)}`);
  const wartAt = (x, y) => warts.has(`${x},${y}`) ? 1.8 : warts.has(`${x - 1},${y}`) || warts.has(`${x},${y - 1}`) ? -0.9 : 0;
  const skin = (x, y, nx, ny, edge, o = {}) => {
    const lit = -ny * 0.85 + nx * 0.32;
    let l = (o.base ?? 4.2) + lit * 2.1 * edge + (hash(x >> 1, y >> 1) - 0.5) * 0.8 + bayer(x, y) * 0.55;
    if (y < 24 && !o.noWart) l += wartAt(x, y);
    if (ny > 0.55 && edge > 0.4) l -= 0.7;
    if (edge > 0.93) l -= o.rim ?? 0.9;
    if (o.crease && edge > 0.6) l -= o.crease;
    return pick(C, Math.max(l, 2.7));
  };
  paintSdf(L, w, h, main, (x, y, nx, ny, edge) => {
    let c = skin(x, y, nx, ny, edge);
    const sacD = Math.hypot((x - sacC[0]) / sacR[0], (y - sacC[1]) / sacR[1]);
    const lower = y + (bayer(x, y) - 0.5) * 2.4 > 27.2 && x > 27; // a thin pale strip under the chin
    if (sacD < 1 || lower) c = pick(Bl, 1.7 + (sacD < 1 ? (1 - sacD) * 1.9 : 0) - ny * 0.7 + bayer(x, y) * 0.5 - (edge > 0.9 ? 0.7 : 0));
    L.sn(x, y, c, nx * edge * 0.9, -ny * edge * 0.9, Math.sqrt(Math.max(0.05, 1 - edge * edge * 0.8)));
  });
  paintSdf(L, w, h, haunch, (x, y, nx, ny, edge) => {
    const c = skin(x, y, nx, ny, edge, { base: 4.5, rim: 1.4 });
    // the folded thigh: a dark crease on its front-lower arc so it reads as a leg, not a lump
    const crease = nx > 0.35 && ny > -0.1 && edge > 0.72;
    L.sn(x, y, crease ? pick(C, 2.8) : c, nx * edge, -ny * edge, Math.sqrt(Math.max(0.05, 1 - edge * edge * 0.8)));
  });
  paintSdf(L, w, h, hind, (x, y, nx, ny, edge) => L.sn(x, y, skin(x, y, nx, ny, edge, { base: 5.0, noWart: true, rim: 1.2, crease: 1.1 }), nx * edge * 0.8, -ny * edge * 0.8, 0.8));
  paintSdf(L, w, h, front, (x, y, nx, ny, edge) => L.sn(x, y, skin(x, y, nx, ny, edge, { base: 5.2, noWart: true, rim: 1.4, crease: 1.4 }), nx * edge * 0.9, -ny * edge * 0.9, 0.8));
  // wet speculars (hard pale-green pips) on the back
  if (!crouch) for (const [sx, sy] of [[15, 12.8], [21, 12.4], [18, 13.8], [29, 22]]) if (L.a(sx, sy)) L.set(sx, sy, hex('#c4dc8a'));
  // mouth: a wide smile from the snout back under the eye, with a lip highlight above
  const mx0 = 39.8 + hx, mx1 = 27 + hx;
  for (let x = Math.round(mx1); x <= Math.round(mx0); x++) {
    const t = (x - mx1) / (mx0 - mx1), yy = Math.round(toScr(atk ? 22 : 24.1) - Math.sin(t * Math.PI * 0.9) * 0.9 + (1 - t) * 1.3);
    if (atk) { for (let k = 0; k < 4; k++) L.set(x, yy + k, k === 3 ? hex('#b8506a') : hex('#3a0c14')); L.set(x, yy - 1, C[6]); if (x % 3 === 0) L.set(x, yy + 4, hex('#d86a86')); }
    else { if (L.a(x, yy)) L.set(x, yy, hex('#0a0e04')); if (L.a(x, yy - 1)) L.set(x, yy - 1, C[6]); }
  }
  L.set(Math.round(mx1) - 1, Math.round(toScr(24.6)), hex('#0a0e04'));
  L.set(Math.round(39 + hx), Math.round(toScr(20.2)), hex('#0a0e04')); L.set(Math.round(38 + hx), Math.round(toScr(20)), hex('#0a0e04')); // nostrils
  // eyes: a skin lid ring, gold iris (emissive 0.75), a vertical slit pupil, a white catch-light. Crouch = narrowed (lids over the top half).
  for (const [ex, e0] of eyes) {
    const eyy = toScr(e0);
    for (let y = Math.floor(eyy - 3); y <= Math.ceil(eyy + 3); y++) for (let x = Math.floor(ex - 3); x <= Math.ceil(ex + 3); x++) {
      const d = Math.hypot(x - ex, (y - eyy) * 1.1);
      if (d > 3.3 || !L.a(x, y)) continue;
      const lidCover = crouch ? y < eyy + 0.6 : y < eyy - 2.2;
      if (d > 2.6 || lidCover) { L.sn(x, y, pick(C, 5.2 - (y - eyy) * 0.35 + (x > ex ? 0.4 : 0)), (x - ex) / 3, -(y - eyy) / 3, 0.7); continue; }
      const iris = pick(E, 3.0 - d * 0.6 - (y - eyy) * 0.25);
      L.sn(x, y, iris, (x - ex) / 3, -(y - eyy) / 3, 0.7); L.g(x, y, dark(iris, 0.75));
    }
    for (let y = Math.round(crouch ? eyy + 1 : eyy - 1); y <= Math.round(eyy + 1.5); y++) L.set(Math.round(ex + 0.5), y, hex('#120a02'));
    if (!crouch) L.set(Math.round(ex - 1), Math.round(eyy - 1.4), hex('#ffffff'));
  }
  // lily-pad hat on the top of the back with one white flower (the appeal beat)
  const hyy = toScr(10.4), hcx = 18;
  for (let x = hcx - 7; x <= hcx + 7; x++) for (let y = Math.floor(hyy - 2); y <= Math.ceil(hyy + 2); y++) {
    const d = Math.hypot((x - hcx) / 7, (y - hyy) / 1.9);
    if (d >= 1 || (x === hcx + 1 && y === Math.round(hyy) && d > 0.45)) continue; // the pad's notch
    L.sn(x, y, pick(PAL.NMOSS, 3.3 + (1 - d) * 1.3 - (y - hyy) * 0.5 + bayer(x, y) * 0.4), 0, 1, 0.5);
  }
  for (let x = hcx - 5; x <= hcx + 5; x += 2) L.set(x, Math.round(hyy), PAL.NMOSS[2]); // pad veins
  const fy = Math.round(hyy) - 2, fcx = hcx - 2;
  for (const [px, py, c] of [[-1, 0, '#f0d8e8'], [1, 0, '#f0d8e8'], [0, -1, '#ffffff'], [0, 1, '#f0d8e8'], [-1, -1, '#ffffff'], [1, -1, '#f6e8f0']]) L.sn(fcx + px, fy + py, hex(c), 0, 1, 0.5);
  L.sn(fcx, fy, hex('#ffd45a'), 0, 1, 0.5);
  return finishMon(L, [8, 10, 4], { bulge: 1.0 });
}

// ------------------------------------------------------------------ 5. GLOOM WOLF (56 x 38, elite-capable)
/**
 * A lean stalking wolf, SDF-built: skull + muzzle + pointed ears, a long neck with a shaggy ruff, a deep chest, a tucked waist,
 * a hocked haunch, four legs with paws, a bushy tail hanging low. Fur strokes + a moonlit top edge. Interior ramp floor =
 * #2a3042 (index 2): never a black hole in the fen backlight. pose: 'idle' | 'howl' (head up: the telegraph) | 'atk' (lunge).
 */
export function makeWolf(phase = 0, pose = 'idle') {
  const w = 56, h = 38, L = Layer(w, h), C = PAL.WOLF, E = PAL.EMBER, G = PAL.GOLD;
  const howl = pose === 'howl', atk = pose === 'atk';
  const br = Math.sin(phase) * 0.5, OFF = 4; // sd works in a 34 px local space; the canvas has 4 spare rows on top for the howl
  const dx = atk ? 3 : 0; // the lunge shifts the front half forward
  const sk = howl ? [43.5, 4.2] : atk ? [46.5, 11.5] : [42, 9.8];
  const nk = howl ? [41, 5.6] : atk ? [44, 11.5] : [40, 9.8];
  // long muzzle: a wolf's nose is a third of the head length again
  const mzA = howl ? [46, 3.4] : atk ? [49.5, 12] : [45.8, 10.8], mzB = howl ? [52.5, -3.2] : atk ? [54.8, 12.8] : [53.2, 12.7];
  const jwA = atk ? [48, 15] : null, jwB = atk ? [53.5, 19] : null;
  const fur = (x, y) => (hash(x | 0, (y | 0) * 3) - 0.5) * 0.9;
  const legs = (x, y, far) => {
    const o = far ? 5 : 0;
    const fa = atk ? [[33 + dx + o, 20], [38 + dx + o, 26], [43 + dx + o, 31.5]] : [[32 + o, 20.5], [34 + o, 27], [34.6 + o, 32]];
    const ha = atk ? [[13 + o * 0.5, 21], [8 + o * 0.5, 26], [4 + o * 0.5, 31.5]] : [[13 + o * 0.6, 21.5], [9.8 + o * 0.6, 27.5], [12.2 + o * 0.6, 32]];
    let d = Math.min(
      sdCap(x, y, fa[0][0], fa[0][1], fa[1][0], fa[1][1], 3.2, 1.9), sdCap(x, y, fa[1][0], fa[1][1], fa[2][0], fa[2][1], 1.9, 1.35),
      sdEll(x, y, fa[2][0] + 0.9, fa[2][1] + 0.3, 2.5, 1.25),
      sdCap(x, y, ha[0][0], ha[0][1], ha[1][0], ha[1][1], 3.4, 2.0), sdCap(x, y, ha[1][0], ha[1][1], ha[2][0], ha[2][1], 2.0, 1.3),
      sdEll(x, y, ha[2][0] + 1.2, ha[2][1] + 0.3, 2.7, 1.25),
    );
    return d;
  };
  // bushy tail: roots high on the rump, sweeps out and back, then hangs low (a thick brush, clearly apart from the hind leg)
  const tail = (x, y) => Math.min(sdCap(x, y, 9, 12.5, 3.2, 15.5, 2.3, 3.0), sdCap(x, y, 3.2, 15.5, 1.8, 24, 3.2, 3.4), sdCap(x, y, 1.8, 24, 2.6, 29, 3.2, 0.9));
  const body = (x, y) => {
    let d = Math.min(
      sdEll(x, y, 23 + dx * 0.5, 17 + br, 11, 6),             // barrel
      sdEll(x, y, 19, 17.6 + br * 0.5, 7, 4.6),               // the tucked waist (narrower, pulls the line in)
      sdEll(x, y, 33 + dx, 17 + br, 7.4, 8.0),                // deep chest
      sdEll(x, y, 13.5, 18.2, 6.6, 7.2),                      // haunch
      sdCap(x, y, 34 + dx, 13, nk[0], nk[1], 5.8, 4.4),       // neck
      sdEll(x, y, sk[0], sk[1], 4.6, 4.1),                    // skull
      sdCap(x, y, mzA[0], mzA[1], mzB[0], mzB[1], 2.9, 1.6),  // muzzle
      tail(x, y),
    );
    if (jwA) d = Math.min(d, sdCap(x, y, jwA[0], jwA[1], jwB[0], jwB[1], 1.5, 0.9));
    else d = Math.min(d, sdCap(x, y, sk[0] + 2.5, sk[1] + 2.6, mzB[0] - 1.5, mzB[1] + 1.4, 1.5, 1.0)); // under-jaw
    // ears: two thin capsules up and back
    const eb = howl ? -1.5 : 0;
    d = Math.min(d, sdCap(x, y, sk[0] - 2.4 + eb, sk[1] - 3, sk[0] - 4 + eb * 2, sk[1] - 9.3, 1.9, 0.35), sdCap(x, y, sk[0] + 0.8 + eb, sk[1] - 3.2, sk[0] - 0.4 + eb * 2, sk[1] - 9.6, 1.7, 0.35));
    // shaggy ruff (throat + shoulders) and a ragged back line: jagged tufts via noise on the distance
    if (x > 28 && x < sk[0] - 2 && y > 11) d -= Math.max(0, Math.sin(y * 1.5 + x * 0.9) * 1.2 + fur(x, y) * 0.8) * (y > 15 ? 1 : 0.5);
    if (y < 15 && x > 12 && x < 36) d -= Math.max(0, Math.sin(x * 1.6) * 0.8 + fur(x, y) * 0.7);
    if (x < 9 && y > 14) d -= Math.max(0, Math.sin(y * 1.8 + x) * 0.9); // bushy tail fur
    return d;
  };
  const SDF = (fn) => (x, y) => fn(x, y - OFF);
  paintSdf(L, w, h, SDF((x, y) => legs(x, y, true)), (x, y, nx, ny, edge) => {
    // far legs: clearly darker than the near ones but never below the ramp floor
    L.sn(x, y, pick(C, Math.max(2.0, 2.5 - ny * 0.6 + fur(x, y) * 0.8 - edge * 0.4)), nx * edge, -ny * edge, 1 - edge * 0.5);
  });
  paintSdf(L, w, h, SDF((x, y) => Math.min(body(x, y), legs(x, y, false))), (x, y, nx, ny, edge, depth) => {
    const ly = y - OFF;
    const lit = -ny * 0.85 + nx * 0.3;
    let l = 3.7 + lit * 2.7 * edge - (ly > 19 ? Math.min(1.5, (ly - 19) * 0.16) : 0) + fur(x, y) + bayer(x, y) * 0.5;
    // anatomy read: a shoulder-blade lift, a haunch lift, and creases behind the shoulder / in front of the haunch
    if (Math.hypot((x - 30 - dx) / 5, (ly - 14.5) / 4) < 1) l += 0.55;
    if (Math.hypot((x - 13) / 4.6, (ly - 16) / 4.6) < 1) l += 0.55;
    if (Math.abs(x - (26.5 + dx * 0.6) - (ly - 17) * 0.25) < 0.6 && ly > 12 && ly < 22) l -= 0.9;
    if (Math.abs(x - (19.5) + (ly - 20) * 0.3) < 0.6 && ly > 18 && ly < 24) l -= 0.8;
    if (((x * 2 + ly * 3) % 7 === 0) && depth > 1.3) l -= 0.8;        // fur streaks
    if (((x * 3 - ly * 2 + 11) % 9 === 0) && depth > 1.3 && edge > 0.35) l += 0.7;
    if (ny < -0.62 && edge > 0.55) l += 1.3;                             // moonlit top edge
    if (x < 24 && ly > 12 && ly < 22 && depth > 3) l += 0.3 * Math.sin(x * 0.5);
    if (x > sk[0] - 1 && ly > sk[1] - 3 && ly < sk[1] + 1) l += 0.7;     // lighter muzzle / brow
    if (x > 29 && x < 38 && ly > 15 && ly < 22 && ny > 0.1) l += 0.5;   // pale throat / chest ruff
    l = Math.max(l, 2.2);                                                // the interior floor: #2a3042
    L.sn(x, y, pick(C, l), nx * edge * 0.95, -ny * edge * 0.95, Math.sqrt(Math.max(0.05, 1 - edge * edge * 0.9)));
  });
  const Y = (v) => v + OFF;
  // nose, mouth line, teeth + open mouth when lunging
  L.set(mzB[0] - 0.2, Y(mzB[1]) - 0.5, hex('#06060a')); L.set(mzB[0] - 1.2, Y(mzB[1]) - 0.5, hex('#0a0b10')); L.set(mzB[0] - 0.2, Y(mzB[1]) + 0.5, hex('#0a0b10'));
  if (atk) {
    for (let k = 0; k <= 8; k++) { const t = k / 8, x = lerp(mzA[0] - 1, mzB[0] - 0.5, t); for (let yy = Y(lerp(mzA[1], mzB[1], t)) + 1.6; yy < Y(lerp(jwA[1], jwB[1], t)) - 0.6; yy++) L.set(x, yy, yy > Y(lerp(jwA[1], jwB[1], t)) - 2 ? hex('#a8484c') : hex('#2a0a10')); }
    for (const k of [1, 3, 5, 7]) { const t = k / 8, x = lerp(mzA[0] - 1, mzB[0] - 1, t); L.set(x, Y(lerp(mzA[1], mzB[1], t)) + 1.8, hex('#f0ece0')); L.set(x, Y(lerp(mzA[1], mzB[1], t)) + 2.6, hex('#d8d4c4')); }
    for (const k of [2, 5]) { const t = k / 8; L.set(lerp(jwA[0], jwB[0], t), Y(lerp(jwA[1], jwB[1], t)) - 1, hex('#e8e4d8')); }
  } else for (let k = 0; k < 7; k++) { const t = k / 6; L.set(lerp(mzA[0] - 1, mzB[0] - 1.5, t), Y(lerp(mzA[1], mzB[1], t)) + 1.7, C[1]); }
  // ear inner + brow
  for (const eo of [-2.4, 0.8]) for (let k = 0; k < 4; k++) { const ex = sk[0] + eo - (howl ? 1.5 * 2 * 0 : 0) - k * 0.35, eyy = Y(sk[1] - 4.2 - k * 1.4); if (L.a(ex, eyy)) L.set(ex + 0.4, eyy, pick(C, 1.6)); }
  // ember eye with a hot core + a brow notch so the gaze reads
  const ex = sk[0] + 1.8, eyy = Y(sk[1]) - 1;
  L.e(ex - 1, eyy, E[1]); L.e(ex, eyy, E[2]); L.e(ex + 1, eyy, E[3]); L.e(ex, eyy + 1, E[1]); L.set(ex - 1, eyy - 1, pick(C, 1)); L.set(ex, eyy - 1.4, pick(C, 1)); L.set(ex + 1, eyy - 1.8, pick(C, 1));
  // broken gold chain collar slung along the throat, a loose end hanging
  const cn = howl ? [39, 12] : atk ? [41.5, 17] : [37, 15.5];
  for (let k = 0; k < 8; k++) { const t = k / 7, x = lerp(cn[0] - 4, cn[0] + 2.5, t), y = Y(lerp(cn[1] + 1.5, cn[1] - 1.2, t) + Math.sin(t * Math.PI) * 2.6) ; L.sn(x, y, k % 2 ? G[2] : G[3], 0, 0.6, 0.8); if (k % 2 === 0) L.g(x, y, dark(G[1], 0.5)); }
  for (let k = 0; k < 5; k++) L.sn(cn[0] - 4 + (k % 2) * 0.6, Y(cn[1] + 1.8 + k * 1.2), k % 2 ? G[1] : G[2], 0, 0, 1);
  return finishMon(L, [3, 3, 8], { bulge: 0.9 });
}

// ------------------------------------------------------------------ elite render variant (any enemy)
/**
 * The gold elite read, baked at the sprite: every outline pixel (the 1 px dark ring) becomes warm gold, with a dim gold glow
 * so it survives the night grade. The renderer adds the rest (ELITE_FX: rim breathing, ground sigil, motes, x1.08 scale).
 * Works on any SpriteFrame produced by this file (image + normal are kept; only the border ring changes).
 */
export function eliteFrame(f: SpriteFrame): SpriteFrame {
  const W = f.img.width, H = f.img.height;
  const c = mk(W, H); c.x.drawImage(f.img, 0, 0);
  const d = c.x.getImageData(0, 0, W, H), src = new Uint8ClampedArray(d.data);
  const g = mk(W, H); if (f.glow) g.x.drawImage(f.glow, 0, 0);
  const gd = g.x.getImageData(0, 0, W, H);
  const A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!A(x, y)) continue;
    if (A(x - 1, y) && A(x + 1, y) && A(x, y - 1) && A(x, y + 1)) continue;
    const i = (y * W + x) * 4, top = y < H / 2 ? 1 : 0.78; // a touch brighter on the upper (moonlit) half
    d.data[i] = 232 * top; d.data[i + 1] = 178 * top; d.data[i + 2] = 58 * top;
    gd.data[i] = 150 * top; gd.data[i + 1] = 104 * top; gd.data[i + 2] = 24 * top; gd.data[i + 3] = 255;
  }
  c.x.putImageData(d, 0, 0); g.x.putImageData(gd, 0, 0);
  return { ...f, img: c.c, glow: g.c };
}

// ------------------------------------------------------------------ 6. THE WHISPERING WILLOW (multi-part)
/**
 * Core: trunk, carved face, root beard (T2.1 `lock` strands), ground roots, two great boughs with leaf clumps and hanging locks.
 * 112 x 132 px, anchor at the root collar, the face (eyes y 46, mouth y 66) is the plate anchor (WILLOW_FACE_Y_M).
 * state: 'intro' (eyes shut, dark cracks) | 'p1' (half-lidded violet) | 'spell' (wide, glow x1.3, glowing O, blazing cracks) |
 *        'riddle' (calm teal-gold, closed "listening" mouth) | 'freed' (closed eyes, a soft smile, no glow).
 */
export function makeWillowCore(state = 'p1') {
  const w = 112, h = 132, L = Layer(w, h), P = PAL.WBARK, V = PAL.HUSHV, T = PAL.HUSHT, LF = PAL.WLEAF;
  const base = h - 2, cx = 56;
  const spell = state === 'spell', k13 = spell ? 1.3 : 1;
  // ground roots spreading and gripping the ground (cylinder-shaded limbs, mossy on top)
  for (let i = 0; i < 9; i++) {
    const dir = i % 2 ? 1 : -1, len = 22 + (i >> 1) * 7, sx = cx + dir * (11 + (i >> 1) * 3);
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([sx + dir * t * len, base - 20 * (1 - t) * (1 - t) + Math.sin(t * 6 + i) * 1.2]); }
    limb(L, pts, 11 - (i >> 1), 2, P, { groove: true, base: 2.5 });
  }
  // the trunk: a massive twisted column with bark fissures; flares at the collar and splits into two boughs at the top
  const top = 18;
  for (let y = top; y <= base; y++) {
    const t = (base - y) / (base - top);
    const flare = Math.pow(Math.max(0, 0.27 - t) / 0.27, 1.8) * 24;
    const hw = 21 - t * 4 + flare + Math.sin(y * 0.21) * 0.8;
    const sx = cx + Math.sin(t * 2.2) * 3;
    for (let xx = -hw; xx <= hw; xx += 0.5) {
      const q = xx / hw, X = Math.round(sx + xx);
      const twist = Math.sin(xx * 0.42 - y * 0.16 + t * 3);
      const gro = twist > 0.76 ? -1.4 : twist < -0.9 ? 0.5 : 0;
      let l = 3.5 - q * 1.5 + gro + (hash(X >> 1, y >> 2) - 0.5) * 1.0 + bayer(X, y) * 0.7;
      if (Math.abs(q) > 0.9) l -= 1;
      if (y > 34 && y < 84 && Math.abs(xx) < 16) l += 0.6 - Math.abs(xx) * 0.02; // the face plate catches the moon
      // moss patches at the collar
      const moss = t < 0.18 && hash(X >> 1, y >> 1) > 0.78;
      L.sn(X, y, moss ? pick(PAL.NMOSS, 2.4 + (hash(X, y) - 0.5) * 1.6 + bayer(X, y) * 0.6 - q * 0.6) : pick(P, l), q * 0.95, 0.05, Math.sqrt(Math.max(0.05, 1 - q * q)));
    }
  }
  // two great boughs fork off the trunk top and leave the frame up and out, each carrying leaf masses and hanging locks
  for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([cx + s * (7 + t * 50 + Math.sin(t * 5) * 2), top + 12 - t * 36 - Math.sin(t * 3) * 3]); }
    limb(L, pts, 19, 8, P, { groove: true, base: 3.0 });
    for (const t of [0.3, 0.5, 0.7, 0.9]) { const [px, py] = pts[Math.round(t * 10)]; clump(L, px, py + 1, 11 - t * 3, 5.5, LF, Math.round(px * 7 + s), -0.2); clump(L, px + s * 5, py - 3, 8, 4.5, LF, Math.round(px * 5 + s), 0.1); }
    for (let i = 0; i < 7; i++) { const t = 0.18 + i * 0.12, [px, py] = pts[Math.round(t * 10)]; lock(L, px + (hash(i, s + 5) - 0.5) * 6, py + 4, 16 + hash(i, 9) * 22, 4.4, LF, i * 1.7 + s, { sway: 1.8, base: 3.2 }); }
  }
  // ---- the face, carved in the bark at the upper-middle: brows, sockets, a nose ridge, cheek hollows, a mouth
  const eyeY = 46, mouthY = 66;
  const eyeCol = state === 'riddle' ? [T[1], T[2], hex('#ffe08a')] : state === 'freed' || state === 'intro' ? null : [V[2], V[3], V[5]];
  // cheek hollows + forehead lift (authored normals only: a darker bark tone beneath the cheekbones)
  for (const s of [-1, 1]) for (let y = eyeY + 6; y <= eyeY + 17; y++) for (let x = cx + s * 6; Math.abs(x - cx) <= 17; x += s) {
    const d = Math.hypot((x - (cx + s * 12)) / 6, (y - (eyeY + 12)) / 5.5);
    if (d < 1 && L.a(x, y)) L.sn(x, y, pick(P, 2.0 + d * 1.4 + bayer(x, y) * 0.4), s * (1 - d) * -0.6, 0.15, 0.7);
  }
  for (const s of [-1, 1]) {
    const ex = cx + s * 10;
    // brow ridge: a heavy bark shelf (3 px thick, lit from above, shadowed below, inner end lowered: a calm frown)
    for (let k = -8; k <= 8; k++) { const by = eyeY - 7 + Math.round((s * k > 0 ? 1.2 : 0.2) * Math.abs(k) * 0.2) + (s * k < -4 ? 1 : 0); L.sn(ex + k, by, P[6], 0, 1, 0.4); L.sn(ex + k, by + 1, P[5], 0, 0.6, 0.6); L.sn(ex + k, by + 2, P[4], 0, 0.1, 0.8); L.sn(ex + k, by + 3, P[1], 0, -0.7, 0.6); }
    // socket
    for (let y = eyeY - 5; y <= eyeY + 5; y++) for (let x = ex - 8; x <= ex + 8; x++) { const d = Math.hypot((x - ex) / 7.4, (y - eyeY) / 4.2); if (d < 1) L.sn(x, y, d > 0.74 ? P[1] : hex('#050308'), 0, 0, 1); }
    if (eyeCol) {
      const lid = state === 'p1' ? 1.6 : 0;
      for (let y = Math.floor(eyeY - 3 + lid); y <= eyeY + 3; y++) for (let x = ex - 6; x <= ex + 6; x++) {
        const d = Math.hypot((x - ex) / 5.6, (y - eyeY) / (spell ? 3.3 : 2.6));
        if (d < 1) { const c = d < 0.42 ? eyeCol[2] : d < 0.74 ? eyeCol[1] : eyeCol[0]; L.set(x, y, c); L.g(x, y, dark(c, k13)); }
      }
      if (state === 'p1') for (let x = ex - 6; x <= ex + 6; x++) { L.sn(x, eyeY - 2 + (Math.abs(x - ex) > 3 ? 1 : 0), P[3], 0, -0.5, 0.8); L.sn(x, eyeY - 3 + (Math.abs(x - ex) > 3 ? 1 : 0), P[5], 0, 0.8, 0.6); } // the heavy lid above the half-open eye
    } else {
      for (let k = -6; k <= 6; k++) { L.sn(ex + k, eyeY + Math.round(k * k * 0.06), P[0], 0, 0, 1); if (state === 'freed') L.sn(ex + k, eyeY + 1 + Math.round(k * k * 0.06), P[2], 0, 0, 1); }
      if (state === 'intro') for (const k of [-3, 0, 3]) L.ed(ex + k, eyeY + 1, V[0], 0.45);
    }
  }
  // nose: a knot ridge with nostril notches
  for (let y = eyeY + 1; y <= eyeY + 13; y++) { L.sn(cx - 2, y, P[2], -0.7, 0, 0.7); L.sn(cx - 1, y, P[4], -0.2, 0, 1); L.sn(cx, y, P[6], 0.2, 0, 1); L.sn(cx + 1, y, P[5], 0.5, 0, 0.9); L.sn(cx + 2, y, P[3], 0.7, 0, 0.7); }
  for (let k = -4; k <= 4; k++) L.sn(cx + k, eyeY + 14, P[Math.abs(k) > 2 ? 1 : 4], 0, 1, 0.5);
  L.set(cx - 3, eyeY + 14, P[0]); L.set(cx + 3, eyeY + 14, P[0]);
  // mouth: a long crack (p1 / riddle / intro), a gaping glowing O (spell) or a soft smile (freed)
  if (spell) {
    for (let y = mouthY - 5; y <= mouthY + 7; y++) for (let x = cx - 10; x <= cx + 10; x++) { const d = Math.hypot((x - cx) / 9.6, (y - mouthY - 1) / 6); if (d < 1) { if (d > 0.84) L.sn(x, y, P[1], 0, 0, 1); else { const c = pick(V, 5 - d * 4.4); L.set(x, y, c); L.g(x, y, dark(c, 1.3)); } } }
  } else if (state === 'freed') {
    for (let k = -9; k <= 9; k++) { const yy = mouthY + Math.round((81 - k * k) * 0.032); L.sn(cx + k, yy, P[0], 0, 0, 1); L.sn(cx + k, yy + 1, P[3], 0, -0.5, 0.7); }
  } else {
    for (let k = -14; k <= 14; k++) { const y = mouthY + Math.round(Math.sin(k * 0.5) * 1.4 + (k * k) * 0.006); L.sn(cx + k, y, hex('#040306'), 0, 0, 1); L.sn(cx + k, y + 1, P[1], 0, 0, 1); L.sn(cx + k, y - 1, P[5], 0, 0.8, 0.6); if (state === 'p1' && Math.abs(k) < 10 && k % 3 === 0) L.ed(cx + k, y, V[2], 0.9); }
  }
  // glyph cracks running up the bark (emissive: dark in intro, dim violet p1, blazing in spell, teal in riddle, gone when freed)
  if (state !== 'freed') {
    const gc = state === 'riddle' ? T : V, gi = spell ? 3 : state === 'riddle' ? 1 : state === 'intro' ? 0 : 1;
    const gk = spell ? 1.3 : state === 'intro' ? 0.25 : 1;
    const crack = (x0, y0, len, dir) => { let x = x0; for (let k = 0; k < len; k++) { x += (hash(k, x0) - 0.5) * 1.6 + dir * 0.3; const c = gc[clamp(gi - (k % 7 === 0 ? 1 : 0), 0, gc.length - 1)]; L.set(x, y0 - k, c); L.g(x, y0 - k, dark(c, gk)); if (k % 9 === 4 || (spell && k % 5 === 2)) { L.set(x + dir, y0 - k, gc[gi]); L.g(x + dir, y0 - k, dark(gc[gi], gk)); } } };
    crack(cx - 16, base - 10, 34, -0.2); crack(cx + 15, base - 14, 30, 0.2); crack(cx - 5, base - 6, 18, 0); crack(cx + 6, mouthY + 12, 14, 0.3);
    if (spell) { crack(cx - 24, base - 8, 22, -0.4); crack(cx + 23, base - 9, 24, 0.4); }
  }
  // root beard under the chin: LOCKS in the bark ramp (same style as the fronds), not strands
  for (let i = 0; i < 9; i++) lock(L, cx - 12 + i * 3 + hash(i, 4) * 1.5, mouthY + 7, 9 + hash(i, 5) * 17, 3.2 + hash(i, 8) * 1.6, P, i * 1.3, { sway: 1.2, base: 3.2, leaves: false, tuft: false });
  for (let i = 0; i < 4; i++) strand(L, cx - 8 + i * 5, mouthY + 8, 10 + hash(i, 6) * 8, P, i, 1, 1);
  return L.finish({ ax: cx, ay: h, bulge: 1.3 });
}

/** Lash roots (attack): 60 x 40, anchor at the base on the ground. frame: 'coil' | 'whip' | 'recoil'. Drawn facing right, baked flipped. */
export function makeWillowLash(frame = 'coil') {
  const w = 60, h = 40, L = Layer(w, h), P = PAL.WBARK;
  const base = h - 3;
  const roots = frame === 'coil' ? [[6, base, 14, base - 10, 22, base - 14, 28, base - 8, 24, base - 3, 18, base - 6]]
    : frame === 'whip' ? [[4, base - 2, 16, base - 20, 34, base - 24, 50, base - 14, 57, base - 4, 58, base]]
      : [[5, base, 11, base - 14, 17, base - 22, 15, base - 28, 9, base - 26, 8, base - 22]];
  for (const [i, r] of roots.entries()) {
    const pts = []; for (let k = 0; k < r.length; k += 2) pts.push([r[k], r[k + 1]]);
    // a smooth curve through the points (Catmull-Rom-ish by sampling)
    const dense = []; for (let k = 0; k < pts.length - 1; k++) for (let s = 0; s < 8; s++) { const t = s / 8, a = pts[Math.max(0, k - 1)], b = pts[k], c = pts[k + 1], d = pts[Math.min(pts.length - 1, k + 2)]; const f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); dense.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]); }
    limb(L, dense, 9, 2, P, { groove: true, base: 2.7 });
    // knuckles + a thorn tip
    for (let k = 6; k < dense.length - 6; k += 9) { const [x, y] = dense[k]; L.sn(x, y - 4, P[6], 0, 1, 0.5); L.sn(x + 1, y - 4, P[5], 0, 1, 0.5); }
    const [tx, ty] = dense[dense.length - 1]; L.sn(tx, ty, P[6], 0, 0, 1); L.sn(tx + 1, ty + 1, P[5], 0, 0, 1);
    for (let k = 0; k < 4; k++) lock(L, dense[2][0] + k * 2, dense[2][1] + 3, 6 + k * 2, 2.5, PAL.NMOSS, k, { sway: 1, base: 2.6, leaves: false, tuft: false });
  }
  return L.finish({ outline: [10, 7, 14], flip: true, ax: Math.round(w / 2), ay: h, bulge: 1.0 });
}

// ------------------------------------------------------------------ registry
type Anims = Record<string, SpriteFrame[]>;
/**
 * Registers `monster.<wisp|shade|moth|toad|wolf>` (+ `.elite`), `monster.willow` and `monster.willow.lash` into the source's
 * key table. `idle` + `atk` exist for every actor (the stage binds those two); extra anims are listed per enemy:
 *   wisp  idle x3, atk (hurt = atk + flash, death = chime-puff VFX)
 *   shade idle x2, atk
 *   moth  idle x3, atk (= cast pose), cast
 *   toad  idle x2, atk (leap), crouch (the 12 s telegraph, held)
 *   wolf  idle x2, atk (lunge), howl (the telegraph pose, held)
 *   willow intro / p1 / spell / riddle / freed (idle = p1, atk = spell); willow.lash: coil / whip / recoil (idle = coil, atk = whip)
 */
export function registerCh2Monsters(table: Map<string, () => Anims>): void {
  const set = (id: string, make: () => Anims) => {
    let base: Anims | null = null;
    const get = () => (base ??= make());
    table.set(`monster.${id}`, get);
    table.set(`monster.${id}.elite`, () => { const b = get(), out: Anims = {}; for (const k of Object.keys(b)) out[k] = b[k].map(eliteFrame); return out; });
  };
  set("wisp", () => { const idle = [makeWisp(0), makeWisp(1.6), makeWisp(3.2)], atk = [makeWisp(0, true)]; return { idle, atk }; });
  set("shade", () => ({ idle: [makeShade(0), makeShade(1.5)], atk: [makeShade(0, true)] }));
  set("moth", () => { const cast = [makeMoth(0, true)]; return { idle: [makeMoth(-1.6), makeMoth(0), makeMoth(1.6)], atk: cast, cast }; });
  set("toad", () => { const atk = [makeToad('atk')]; return { idle: [makeToad('idle', 0), makeToad('idle', 1)], atk, crouch: [makeToad('crouch')] }; });
  set("wolf", () => ({ idle: [makeWolf(0), makeWolf(Math.PI)], atk: [makeWolf(0, 'atk')], howl: [makeWolf(0, 'howl')] }));
  const states = ['intro', 'p1', 'spell', 'riddle', 'freed'];
  table.set("monster.willow", (() => { let b: Anims | null = null; return () => { if (!b) { const f = Object.fromEntries(states.map((s) => [s, [makeWillowCore(s)]])); b = { ...f, idle: f.p1, atk: f.spell }; } return b; }; })());
  table.set("monster.willow.lash", (() => { let b: Anims | null = null; return () => (b ??= { coil: [makeWillowLash('coil')], whip: [makeWillowLash('whip')], recoil: [makeWillowLash('recoil')], idle: [makeWillowLash('coil')], atk: [makeWillowLash('whip')] }); })());
}

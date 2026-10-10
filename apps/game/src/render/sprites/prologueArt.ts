// @ts-nocheck
// biome-ignore-all lint: dense procedural pixel-art code (same convention as proceduralArt.ts / ch2Props.ts / ch2Monsters.ts).
// biome-ignore-all format: see above.
/**
 * P2.1: NUL, THE SILENT KING (prologue villain), production sprite.
 * Binding spec: docs/vfx/prologue-art-direction.md section 1 (silhouette, proportions, palette, materials, animations) and the
 * R0 checklist (section 6). Mock to beat: docs/prologue/nul-turnaround-palette.jpg.
 *
 * Keys: `monster.nul` (idle x4, cast x3 (atk = cast), write x3, catch x2, reach x2, hurt x2, intro x4, rise x2 = 22 frames, one
 * shared anchor) and `monster.nul.ward` (the same frames with the 1 px silhouette ring recoloured to a glowing violet rim: a RIM
 * only, never a dome or a fill; P3 of the VFX spec).
 *
 * Conventions: 16 texels per metre; actor scale 1.0 (the same texel size as the hero, NOT the boss default 1.6); canvas 96 x 92
 * (a 94 x 90 drawing + 1 px outline each side); the foot line is the bottom edge of row 89; drawn facing RIGHT and baked flipped
 * (image, glow AND normal.x negated) like the Ch2 monsters. "u" below = texels up from the foot line.
 *
 * Architecture: the whole thing is built on plain typed arrays (`renderNulRaw`) so unit tests and the measurement tools can run
 * in Node with no DOM; `nulFrames()` only wraps the arrays into canvases for the renderer.
 */
import { bayer, clamp, hash, hex, mk, pal, pick } from "./ch2Props";
import type { SpriteFrame } from "./SpriteSource";

// ------------------------------------------------------------------ public constants (spec section 1.2)
export const NUL_SCALE = 1.0;
export const NUL_W = 96;
export const NUL_H = 92;
/** Drawing size (before the 1 px outline pad). */
const W = 94, H = 90, GY = 88, CX = 36;
/** Final-image anchor: the cloak centre after the flip, and the foot line (bottom edge of the last body row). */
export const NUL_ANCHOR = { ax: NUL_W - (CX + 1), ay: NUL_H - 2 } as const;
export const NUL_HEIGHT_TX = 73;
export const HERO_HEIGHT_TX = 31;
export const NUL_MASK_TX = { w: 12, h: 14, centreU: 53 } as const;
/** The boss plate anchors 1.0 m above the crown tip (never on the mask). */
export const NUL_PLATE_Y_M = NUL_HEIGHT_TX / 16 + 1.0;
export const NUL_STAFF_TX = 66;

// ------------------------------------------------------------------ palette (spec section 1.3)
export const NUL_PAL = {
  INK: pal(["#07050d", "#0e0a18", "#140f22", "#1c1530", "#2a1d45", "#3a2a5e", "#4e3a7a"]),
  RIM: pal(["#2a1260", "#5a3ab8", "#8a6cff", "#b9a6ff", "#e6dcff"]),
  BONE: pal(["#4a4652", "#7a7684", "#a8a29e", "#bdb6ad", "#cfc8bc", "#e9e3d6", "#f8f4ea"]),
  EYE: pal(["#5a1a8a", "#9a2ee0", "#c04dff", "#e08aff", "#f2d8ff", "#ffffff"]),
  GOLD: pal(["#3e2f14", "#6e5424", "#b08a3e", "#d8b464"]),
  HAND: pal(["#6a6672", "#8e8a86", "#b5aea4", "#ddd6c8"]),
  OUT: [10, 6, 20],
};
const { INK, RIM, BONE, EYE, GOLD, HAND, OUT } = NUL_PAL;
/** Every colour a Nul pixel may have (the R0 palette check). */
export const NUL_PALETTE_SET = new Set(
  [INK, RIM, BONE, EYE, GOLD, HAND, [OUT]].flat().map((c) => `${c[0]},${c[1]},${c[2]}`),
);

/** Part ids written alongside the colour (tests + measurement tools). */
export const PART = { none: 0, cloak: 1, wing: 2, head: 3, sleeve: 4, mask: 5, eye: 6, crown: 7, staff: 8, hand: 9, glyph: 10, rim: 11 } as const;

// ------------------------------------------------------------------ poses (spec section 1.5)
const POSE0 = {
  breath: 0, ph: 0, lift: 0, lean: 0, dx: 0, hemLong: 0, flare: 0,
  glyphs: 5, gAge: 0,
  hand: { x: 15, u: 30 }, ang: -90, grip: 30, // the staff: nib direction from the hand (deg, 0 = forward, +up) and the nib-to-hand distance
  arm: null, close: 0, palmUp: 0,
  mDx: 0, mTilt: 0, eye: 0, nibFlare: 0,
};
const P = (o) => ({ ...POSE0, ...o, hand: { ...POSE0.hand, ...(o.hand ?? {}) } });

/** anim -> frames (pose parameters) + hold times in ms (0 = hold until the cue ends). */
export const NUL_ANIMS: Record<string, any> = {
  idle: [0, 1, 2, 3].map((f) => P({ breath: f & 1, ph: f * 1.57, gAge: f })),
  cast: [
    P({ hand: { x: 15, u: 33 }, ang: -68, grip: 30, gAge: 0 }),
    P({ hand: { x: 17, u: 38 }, ang: 35, grip: 28, gAge: 1 }),
    P({ hand: { x: 16, u: 38 }, ang: 32, grip: 28, dx: -1, nibFlare: 1, gAge: 2 }),
  ],
  write: [-20, 5, 30].map((a, i) => P({ hand: { x: 17, u: 38 + i * 3 }, ang: a, grip: 30, ph: i * 1.57, gAge: i })),
  catch: [P({ arm: "catch" }), P({ arm: "catch", palmUp: 1, ph: 1.57 })],
  reach: [P({ arm: "reach" }), P({ arm: "reach", close: 1, ph: 1.57 })],
  hurt: [
    P({ lean: -3, mDx: -1.4, mTilt: -0.12, eye: 1, flare: 0.06 }),
    P({ lean: -1.5, mDx: -0.7, mTilt: -0.06, eye: 1, flare: 0.03, ph: 1.57 }),
  ],
  intro: [
    P({ lift: 10, hemLong: 6, glyphs: 15, hand: { u: 40 }, gAge: 0 }),
    P({ lift: 6, hemLong: 4, glyphs: 15, hand: { u: 36 }, gAge: 1, ph: 1.57 }),
    P({ lift: 2, hemLong: 1, glyphs: 10, hand: { u: 32 }, gAge: 2, ph: 3.14 }),
    P({ eye: 2 }),
  ],
  rise: [
    P({ lift: 6, hemLong: 6, glyphs: 15, hand: { u: 36 }, gAge: 0 }),
    P({ lift: 6, hemLong: 7, glyphs: 15, hand: { u: 36 }, gAge: 2, ph: 2.1 }),
  ],
};
NUL_ANIMS.atk = NUL_ANIMS.cast;
export const NUL_FRAME_MS = {
  idle: [220, 220, 220, 220],
  cast: [120, 160, 0],
  write: [110, 110, 110],
  catch: [80, 0],
  reach: [0, 90],
  hurt: [60, 140],
  intro: [200, 200, 300, 0],
  rise: [180, 180],
};
/** The 22 distinct frames (atk aliases cast). */
export const NUL_FRAME_COUNT = Object.entries(NUL_ANIMS).filter(([k]) => k !== "atk").reduce((n, [, v]) => n + v.length, 0);

/** Tip of the staff's nib in drawing coordinates (x from the left of the 94-wide drawing, u from the foot line). */
export function nulNibTip(pose) {
  const a = (pose.ang * Math.PI) / 180;
  return { x: CX + pose.dx + pose.hand.x + Math.cos(a) * pose.grip, u: pose.hand.u + Math.sin(a) * pose.grip };
}

// ------------------------------------------------------------------ raw layer
function Raw() {
  const n = W * H * 4;
  const col = new Uint8ClampedArray(n), nrm = new Uint8ClampedArray(n), glw = new Uint8ClampedArray(n), part = new Uint8Array(W * H);
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const R = {
    col, nrm, glw, part,
    inb,
    a(x, y) { return inb(x, y) ? col[(y * W + x) * 4 + 3] : 0; },
    id(x, y) { return inb(x, y) ? part[y * W + x] : 0; },
    set(x, y, c, id) { x |= 0; y |= 0; if (!inb(x, y)) return; const i = (y * W + x) * 4; col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2]; col[i + 3] = 255; glw[i] = glw[i + 1] = glw[i + 2] = glw[i + 3] = 0; part[y * W + x] = id; },
    n(x, y, nx, ny, nz) { x |= 0; y |= 0; if (!inb(x, y)) return; const l = Math.hypot(nx, ny, nz) || 1, i = (y * W + x) * 4; nrm[i] = (nx / l * 0.5 + 0.5) * 255; nrm[i + 1] = (ny / l * 0.5 + 0.5) * 255; nrm[i + 2] = (nz / l * 0.5 + 0.5) * 255; nrm[i + 3] = 255; },
    sn(x, y, c, id, nx, ny, nz) { R.set(x, y, c, id); R.n(x, y, nx, ny, nz); },
    g(x, y, c, k = 1) { x |= 0; y |= 0; if (!inb(x, y)) return; const i = (y * W + x) * 4; glw[i] = c[0] * k; glw[i + 1] = c[1] * k; glw[i + 2] = c[2] * k; glw[i + 3] = 255; },
    /** colour + glow at k x colour */
    ed(x, y, c, id, k, nx = 0, ny = 0, nz = 1) { R.sn(x, y, c, id, nx, ny, nz); R.g(x, y, c, k); },
  };
  return R;
}
const uc = (y) => GY - y + 0.5; // continuous u of a pixel row centre
const rowU = (u) => GY - Math.floor(u + 1e-6); // row index of the cell [floor(u), floor(u)+1)

const segDist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)); };
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

// ------------------------------------------------------------------ 3x5 hem glyphs
const GLYPHS = ["101111111101101", "101101101101111", "100100100100111", "101101111111101", "110101110101101", "111010010010111", "111100110100111", "011100010001110", "111010010010010", "010101111101101", "111101101101111"];

// ------------------------------------------------------------------ geometry shared by the passes
function profile(vv, pose) {
  const s = clamp((40 - vv) / 40, 0, 1);
  let hw = vv <= 41 ? 8.4 + 6.1 * Math.pow(s, 0.9) : 8.4 * Math.sqrt(Math.max(0, 1 - Math.pow((vv - 41) / (6.4 + pose.breath), 2)));
  if (pose.flare) hw *= 1 + pose.flare * clamp((30 - vv) / 30, 0, 1);
  const sp = Math.pow(s, 0.8);
  return { hw, hwB: hw * (1 + 0.18 * sp), hwF: hw * (1 - 0.14 * sp) };
}
const bodyX = (vv, pose) => CX + pose.dx + pose.lean * (Math.max(vv, 0) / 60);

// ------------------------------------------------------------------ the renderer
/**
 * Draw one Nul frame into typed arrays. Returns the 96 x 92 final image (outlined; flipped unless `flip: false`; the outline pad is
 * skipped with `outline: false`, which gives the 94 x 90 drawing) plus the part-id map for the tests.
 */
export function renderNulRaw(pose, opts = {}) {
  const R = Raw();
  const lift = pose.lift;
  // ---------------- cloak: A-line, folds, hem page strips
  for (let y = 0; y < H; y++) {
    const U = uc(y), v = U - lift;
    if (v < -pose.hemLong - 0.5 || v > 48 + pose.breath) continue;
    const vv = Math.max(v, 0), { hwB, hwF } = profile(vv, pose), xc = bodyX(vv, pose);
    for (let x = Math.floor(xc - hwB - 1); x <= Math.ceil(xc + hwF + 1); x++) {
      const dx = x + 0.5 - xc;
      if (dx < -hwB || dx > hwF) continue;
      let pale = false;
      if (v < 8.5) { // page strips: 3 tx wide, ragged bottoms, 60% separated by a 1 px gap
        const k = Math.floor((dx + 24) / 3);
        let vb = 1.5 + hash(k, 3) * 5.5 + Math.sin(pose.ph + k * 1.1) * 0.8 - pose.hemLong * (0.65 + 0.35 * hash(k, 5));
        if (pose.hemLong) vb += Math.sin(pose.ph * 1.3 + k * 0.9) * 0.6;
        if (v < vb) continue;
        if (hash(k, 11) < 0.6 && Math.floor(dx + 24) % 3 === 0 && v < 8) continue;
        pale = v < vb + 1;
      }
      const q = clamp(dx / (dx < 0 ? hwB : hwF), -1, 1);
      let l = 2.7 - q * 0.5 + (vv / 46) * 0.7 + (hash(x >> 1, y >> 1) - 0.5) * 0.35 + (bayer(x, y) - 0.5) * 0.45;
      const fold = Math.sin(q * 4.4 + (1 - vv / 46) * 1.9);
      if (fold > 0.8) l -= 1.2; else if (fold > 0.5 && fold < 0.72) l += 1.7 * (0.5 + 0.5 * vv / 42);
      if (vv > 40) l += 0.6;
      if (v < 8.5) l -= 0.25;
      l = clamp(l, 1.6, 5);
      const nx = q * 0.9 + Math.cos(q * 4.4 + (1 - vv / 46) * 1.9) * 0.22, nz = Math.sqrt(Math.max(0.05, 1 - q * q * 0.8));
      R.sn(x, y, pale ? BONE[1] : pick(INK, l), PART.cloak, nx, 0.15, nz);
    }
  }
  // ---------------- collar wings, head ink, neck
  const headX = bodyX(53, pose) + 1.2 + pose.mDx;
  for (const side of [-1, 1]) {
    const tip = (side < 0 ? 58 : 56) + pose.breath, os = side > 0 ? 0.82 : 1;
    const o40 = 4.2 + 2.5 * os, oT = 4.2 + (2.5 + 0.32 * (tip - 40)) * os, mid = 4.2 + (oT - 4.2) * 0.5;
    const pts = [[4.2, 40], [o40, 40], [oT, tip], [mid, tip - 4.4], [4.2, tip - 10]];
    const wc = bodyX(50, pose) + 0.5;
    for (let y = 0; y < H; y++) {
      const U = uc(y), u = U - lift;
      if (u < 40 || u > tip + 1) continue;
      for (let x = Math.floor(wc - 14); x <= Math.ceil(wc + 14); x++) {
        const dx = (x + 0.5 - wc) * side;
        if (!inPoly(dx, u, pts)) continue;
        const outward = clamp((dx - 4.2) / (oT - 4.2), 0, 1), rise = (u - 40) / (tip - 40);
        let l = 3.0 + (side < 0 ? 0.3 : -0.1) - outward * 0.5 + rise * 0.9 + (bayer(x, y) - 0.5) * 0.6 + (hash(x, y >> 1) - 0.5) * 0.3;
        if (Math.abs(outward - rise * 0.55) < 0.07) l -= 1.0; // the centre fold of the blade
        R.sn(x, y, pick(INK, clamp(l, 2, 5.4)), PART.wing, side * 0.7, 0.3, 0.6);
      }
    }
  }
  // neck fill + head ink oval (behind the mask: a dark halo that isolates the mask as one bright blob)
  for (let y = 0; y < H; y++) {
    const U = uc(y), u = U - lift;
    for (let x = Math.floor(headX - 9); x <= Math.ceil(headX + 9); x++) {
      const dx = x + 0.5 - headX;
      const oval = Math.hypot(dx / 6.9, (u - 53.5) / 8.2) < 1;
      const neck = u > 42 && u < 51 && Math.abs(dx) < 5.2;
      if (!oval && !neck) continue;
      const l = 2.3 + (bayer(x, y) - 0.5) * 0.5 - dx * 0.04 + (hash(x, y) - 0.5) * 0.3;
      R.sn(x, y, pick(INK, clamp(l, 2, 3.4)), PART.head, dx / 8, 0.1, 0.8);
    }
  }
  // ---------------- the front sleeve (shoulder to the staff hand)
  const hand = { x: CX + pose.dx + pose.hand.x, u: pose.hand.u };
  const sleeve = (ax, au, bx, bu, r0, r1, cuff) => {
    for (let y = 0; y < H; y++) {
      const U = uc(y);
      if (U < Math.min(au, bu) - 5 || U > Math.max(au, bu) + 5) continue;
      for (let x = Math.floor(Math.min(ax, bx) - 5); x <= Math.ceil(Math.max(ax, bx) + 5); x++) {
        const X = x + 0.5, d = segDist(X, U, ax, au, bx, bu);
        const t = clamp(((X - ax) * (bx - ax) + (U - au) * (bu - au)) / ((bx - ax) ** 2 + (bu - au) ** 2 || 1), 0, 1);
        const r = r0 + (r1 - r0) * t + (cuff && t > 0.86 ? 0.9 : 0);
        if (d > r) continue;
        // which side of the limb axis: upper-left light
        const px = -(bu - au), pu = bx - ax, pl = Math.hypot(px, pu) || 1;
        const side = (((X - ax) * px + (U - au) * pu) / pl) / Math.max(r, 0.5); // -1..1 across
        let l = 3.3 - side * 0.7 * Math.sign(pu || 1) + (bayer(x, y) - 0.5) * 0.5 - (Math.abs(side) > 0.8 ? 1.1 : 0);
        let c = pick(INK, clamp(l, 2.2, 5));
        if (cuff && t > 0.86 && t < 0.97 && d > r - 1.1) c = BONE[1]; // the pale paper cuff
        R.sn(x, y, c, PART.sleeve, side * 0.6, 0.2, 0.75);
      }
    }
  };
  sleeve(bodyX(44, pose) + 7, 43.5 + lift, hand.x - 0.6, hand.u + 3, 3.1, 2.3, true);

  // ---------------- the staff (the Quill of Unwriting)
  const drawStaff = () => {
    const a = (pose.ang * Math.PI) / 180, nibDir = [Math.cos(a), Math.sin(a)];
    const nib = [hand.x + nibDir[0] * pose.grip, hand.u + nibDir[1] * pose.grip];
    const d = [-nibDir[0], -nibDir[1]]; // nib -> feather
    const o = [d[1], -d[0]]; // outer (forward) side
    const flare = pose.nibFlare, eyeFlash = pose.eye;
    const place = (s, w) => [nib[0] + d[0] * s + o[0] * w, nib[1] + d[1] * s + o[1] * w];
    const put = (s, w, c, id, k, nx, ny, nz) => {
      const [X, Uu] = place(s, w), x = Math.floor(X), y = rowU(Uu);
      if (s > pose.grip + 0.01 && R.id(x, y) && R.id(x, y) !== PART.staff) return; // beyond the hand the staff is behind the body
      if (k) R.ed(x, y, c, id, k, nx, ny, nz); else R.sn(x, y, c, id, nx, ny, nz);
    };
    for (let s = 0; s <= NUL_STAFF_TX; s += 0.3) {
      if (s < 7.3) { // nib: a violet crystal with a white slit, emissive 0.9
        const r = 1.9 * Math.pow(Math.sin(Math.PI * s / 7.3), 0.75) + 0.3 + (flare && s > 2 && s < 6 ? 0.6 : 0);
        for (let w = -r; w <= r; w += 0.45) {
          const edge = Math.abs(w) > r - 0.55, core = Math.abs(w) < 0.5 && s > 1.6 && s < 6.2;
          const c = core ? EYE[5] : edge ? EYE[1] : EYE[w < 0 ? 3 : 2];
          put(s, w, c, PART.staff, core ? 1 : 0.9, w * 0.4, 0.2, 0.8);
        }
      } else if (s < 8.6) { // gold ferrule
        for (let w = -1.4; w <= 1.4; w += 0.45) put(s, w, GOLD[Math.abs(w) > 1 ? 1 : 3], PART.staff, 0, w * 0.5, 0.2, 0.8);
      } else if (s < 39.6) { // 2 px shaft: lit side (-0.5), shade side (+0.5)
        for (let w = -1; w <= 1; w += 0.45) { const lit = w < 0; put(s, w, GOLD[lit ? 2 : 1], PART.staff, 0, lit ? -0.5 : 0.5, 0.2, 0.8); }
      } else { // feather: bone rachis, torn vane (4.6 out / 2.6 in), violet rim on the vane edge
        const f = (s - 39.6) / 26.4;
        let prof = Math.pow(Math.sin(Math.PI * (0.1 + 0.82 * f)), 0.8);
        if (f > 0.88) prof *= (1 - f) / 0.12;
        const wo = 4.6 * prof, wi = 2.6 * prof;
        for (let w = -wi; w <= wo; w += 0.45) {
          const aw = Math.abs(w);
          if (aw < 0.55) { put(s, w, BONE[f < 0.3 ? 3 : 2], PART.staff, 0, w, 0.2, 0.8); continue; }
          const ext = w > 0 ? wo : wi, edge = aw > ext - 0.9;
          const sx = Math.round(s * 1.7), notch = (hash(sx, w > 0 ? 3 : 7) < 0.22 && aw > ext * 0.45) || (w > 0 && ((f > 0.4 && f < 0.47 && aw > 1.3) || (f > 0.68 && f < 0.74 && aw > 1.8)));
          if (notch) continue;
          const l = 4.1 - aw / Math.max(ext, 0.5) * 1.6 + (bayer(Math.round(s * 2), Math.round(w * 2)) - 0.5) * 0.7;
          if (edge && w > 0) put(s, w, RIM[1], PART.staff, 0.3, 0.5, 0.2, 0.8);
          else put(s, w, pick(INK, clamp(l + 0.6, 3, 6)), PART.staff, 0, w > 0 ? 0.5 : -0.5, 0.2, 0.8);
        }
      }
    }
    return { nib, d };
  };
  const staff = drawStaff();
  // nib flare / intro eye halo are glow-only extras
  if (pose.nibFlare) for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4; R.g(Math.floor(staff.nib[0] + Math.cos(ang) * 2.6), rowU(staff.nib[1] + Math.sin(ang) * 2.6), EYE[2], 0.8); }

  // ---------------- the staff hand (3 x 4 grip + finger tips), bone, always darker than the mask
  const gripHand = () => {
    const hx = Math.floor(hand.x), hu = hand.u;
    for (let j = 0; j < 4; j++) for (let i = -1; i <= 1; i++) {
      const lit = j === 3 ? 2.6 : j === 0 ? 0.6 : 1.5;
      R.sn(hx + i, rowU(hu - 2 + j), pick(HAND, lit + (i < 0 ? 0.3 : 0) + (bayer(hx + i, j) - 0.5) * 0.5), PART.hand, i * 0.4, 0.2, 0.8);
    }
    R.sn(hx + 2, rowU(hu - 1), HAND[1], PART.hand, 0.8, 0, 0.6); R.sn(hx + 2, rowU(hu + 0.5), HAND[2], PART.hand, 0.8, 0, 0.6);
    R.sn(hx - 1, rowU(hu + 1.5), HAND[3], PART.hand, -0.4, 0.4, 0.8); // the single specular on the knuckle
  };
  gripHand();

  // ---------------- the free arm (catch / reach)
  if (pose.arm === "catch") {
    const wx = CX + pose.dx + 21, wu = 40 + lift + pose.palmUp;
    sleeve(bodyX(40, pose) + 3, 41 + lift, wx, wu, 3.0, 2.3, true);
    const px = CX + pose.dx + 25, pu = 41 + lift + pose.palmUp;
    for (let j = -2; j <= 1; j++) for (let i = -2; i <= 1; i++) R.sn(Math.floor(px) + i, rowU(pu + j), pick(HAND, 1.5 + (j < 0 ? -0.5 : 0.5) + (bayer(i, j) - 0.5) * 0.5), PART.hand, 0.2, 0.2, 0.9); // the palm, facing the hero
    for (let i = -1; i <= 0; i++) R.sn(Math.floor(px) + i, rowU(pu - 0.5), HAND[0], PART.hand, 0, 0, 1); // a palm crease
    for (let f = 0; f < 4; f++) { // 4 splayed fingers up
      const off = (f - 1.5), len = f === 0 || f === 3 ? 3 : 4;
      for (let k = 0; k < len; k++) R.sn(Math.floor(px + off * 1.0 + off * 0.5 * k + 0.5), rowU(pu + 2 + k), pick(HAND, k === len - 1 ? 2.3 : 1.7), PART.hand, off * 0.3, 0.3, 0.8);
    }
    R.sn(Math.floor(px) - 3, rowU(pu - 1), HAND[1], PART.hand, -0.6, 0, 0.8); // thumb
    R.sn(Math.floor(px) - 3, rowU(pu), HAND[2], PART.hand, -0.6, 0, 0.8);
  } else if (pose.arm === "reach") {
    const wx = CX + pose.dx + 23, wu = 46 + lift;
    sleeve(bodyX(44, pose) + 3, 44 + lift, wx, wu, 3.0, 2.3, true);
    const px = CX + pose.dx + 27, pu = 47 + lift;
    for (let j = -1; j <= 1; j++) for (let i = -2; i <= 1; i++) R.sn(Math.floor(px) + i, rowU(pu + j), pick(HAND, 1.6 + (j < 0 ? -0.5 : 0.4) + (bayer(i, j) - 0.5) * 0.5), PART.hand, 0.2, 0.2, 0.9);
    for (let f = 0; f < 4; f++) { // fingers hooked toward the hero: run forward, then curl down
      const fu = pu + 1.6 - f * 1.05, run = 3 - pose.close, curl = 2 + pose.close;
      for (let k = 0; k < run; k++) R.sn(Math.floor(px) + 2 + k, rowU(fu), pick(HAND, 1.8 + (f === 0 ? 0.4 : 0)), PART.hand, 0.5, 0.2, 0.8);
      for (let k = 1; k <= curl; k++) R.sn(Math.floor(px) + 1 + run, rowU(fu - k * 0.9), pick(HAND, 1.3 + (k === curl ? 1.0 : 0)), PART.hand, 0.7, -0.2, 0.7);
    }
    R.sn(Math.floor(px) - 1, rowU(pu - 2), HAND[1], PART.hand, 0, -0.5, 0.8); R.sn(Math.floor(px), rowU(pu - 2.9), HAND[1], PART.hand, 0, -0.5, 0.8);
  }

  // ---------------- the mask: 12 x 14 bone oval, chin taper 38%, sphere normals, glow = 0.25 x colour; no brows, no mouth
  const mAng = pose.mTilt, headU = 53, mc = headX;
  const maskRows = [];
  for (let r = 0; r < 14; r++) {
    const uLo = 46 + r + lift, uCentre = uLo + 0.5 - lift, s = (53.5 - uCentre) / 7; // -1 top .. +1 bottom
    const tilt = mAng * (uCentre - 53);
    const hw = Math.max(1.4, 6 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.2)), 0.55) * (s > 0 ? 1 - 0.38 * s * s : 1));
    const row = rowU(uLo), xl = mc + tilt - hw * 0.93, xr = mc + tilt + hw * 1.05;
    for (let x = Math.ceil(xl - 0.5); x <= Math.floor(xr - 0.5); x++) {
      const dxn = clamp((x + 0.5 - (mc + tilt)) / (hw || 1), -1, 1), nx = dxn * 0.75, ny = -s * 0.6, nz = 0.75, nl = Math.hypot(nx, ny, nz);
      const dot = (nx * -0.45 + ny * 0.55 + nz * 0.7) / nl; // light from upper-left, in front
      let l = 3.2 + dot * 3.8 + (bayer(x, row) - 0.5) * 0.9;
      if (s < -0.78) l += 0.35; // forehead catches the light
      if (Math.abs(dxn) > 0.84 || Math.abs(s) > 0.9) l -= 1.3; // a darker rim keeps the oval crisp
      R.set(x, row, pick(BONE, clamp(l, 1.4, 6.4)), PART.mask);
      R.n(x, row, nx, ny, nz);
      R.g(x, row, pick(BONE, clamp(l, 1.4, 6.4)), 0.25);
      maskRows.push([x, row, dxn]);
    }
  }
  // two thin horizontal eye slits at u 54: 3 + 3 px with a 2 px gap (3/4 view: the far one is 2 px). Full emissive.
  const eyeRow = rowU(54 + lift), fc = Math.round(mc + mAng * 1);
  const flash = pose.eye >= 1;
  const slit = (x0, x1) => {
    for (let x = x0; x <= x1; x++) {
      const centre = x === Math.round((x0 + x1) / 2);
      R.ed(x, eyeRow, flash ? EYE[4] : centre ? EYE[4] : EYE[2], PART.eye, 1, 0, 0, 1);
      if (R.id(x, eyeRow + 1) === PART.mask) { R.set(x, eyeRow + 1, BONE[2], PART.mask); R.g(x, eyeRow + 1, BONE[2], 0.25); }
    }
    if (pose.eye === 2) { for (let x = x0 - 1; x <= x1 + 1; x++) { R.g(x, eyeRow - 1, EYE[1], 0.55); R.g(x, eyeRow + 1, EYE[1], 0.55); } R.g(x0 - 1, eyeRow, EYE[3], 1); R.g(x1 + 1, eyeRow, EYE[3], 1); }
  };
  slit(fc - 3, fc - 2); // far eye (2 px)
  slit(fc + 1, fc + 3); // near eye (3 px)
  // the mask strap: a 1 px gold line from the mask's far edge toward the back of the head
  { let x0 = 999; for (const [x, r] of maskRows) if (r === eyeRow && x < x0) x0 = x; for (let k = 1; k <= 3; k++) R.sn(x0 - k, eyeRow, GOLD[k === 3 ? 1 : 2], PART.crown, -0.5, 0, 0.8); }

  // ---------------- crown band (u 60-61, 13 tx, ends curved down 1.5) + 5 broken quills
  for (let i = -6; i <= 6; i++) {
    const drop = Math.round(1.5 * Math.pow(Math.abs(i) / 6.5, 2)), x = Math.round(mc + mAng * 7 + i);
    R.sn(x, rowU(61 - drop + lift), GOLD[Math.abs(i) > 4 ? 2 : 3], PART.crown, i * 0.1, 0.8, 0.5);
    R.sn(x, rowU(60 - drop + lift), GOLD[Math.abs(i) > 4 ? 1 : 2], PART.crown, i * 0.1, 0.2, 0.9);
  }
  const quills = [[-6, 5, -1.3], [-3, 8, -0.7], [0, 11, 0], [3, 7, 0.8], [6, 5, 1.4]];
  quills.forEach(([qd, qh, lean], qi) => {
    const broken = qi === 0 || qi === 3, base = mc + mAng * 7 + qd;
    for (let j = 0; j < qh; j++) {
      const x0 = base + lean * j, wide = j < qh * 0.6 ? 2 : 1, uRow = 62 + j + lift;
      if (broken && j >= qh - 2) { // a jagged split tip: two tines of different length
        if (j === qh - 2) { R.sn(Math.round(x0), rowU(uRow), GOLD[2], PART.crown, 0, 0.5, 0.8); R.sn(Math.round(x0) + 2, rowU(uRow), GOLD[1], PART.crown, 0.3, 0.5, 0.8); }
        else R.sn(Math.round(x0 - 0.2), rowU(uRow), GOLD[3], PART.crown, 0, 0.5, 0.8);
        continue;
      }
      for (let k = 0; k < wide; k++) R.sn(Math.round(x0) + k, rowU(uRow), GOLD[wide === 2 ? (k === 0 ? 3 : 1) : j === qh - 1 ? 3 : 2], PART.crown, (k - 0.5) * 0.6, 0.6, 0.7);
      if (qi === 2 && j >= 3 && j <= 8) R.sn(Math.round(x0) + 2, rowU(uRow), GOLD[1], PART.crown, 0.5, 0.2, 0.8); // the one 1 px vane
    }
  });

  // ---------------- rims (spec 1.3): back edge 2 px, front edge 1 px, collar outer edge
  const inBody = (id) => id === PART.cloak || id === PART.wing || id === PART.head || id === PART.sleeve;
  for (let y = 0; y < H; y++) {
    const u = uc(y) - lift;
    let x0 = -1, x1 = -1;
    for (let x = 0; x < W; x++) if (inBody(R.id(x, y))) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 < 0 || u < 1.6) continue;
    const collar = u >= 40;
    const back = (x, c, k) => { const i = (y * W + x) * 4, id = R.id(x, y); if (!inBody(id)) return; const nxn = R.nrm[i] / 255 * 2 - 1; R.set(x, y, c, PART.rim); R.n(x, y, -0.9, 0.25, 0.35); R.g(x, y, c, k); };
    back(x0, RIM[2], 0.45); back(x0 + 1, RIM[1], 0.45);
    if (collar) { if (u < 56 || x1 !== x0) { const c = RIM[2]; back(x1, c, 0.35); } }
    else if (u >= 12) { const i = (y * W + x1) * 4; if (inBody(R.id(x1, y))) { R.set(x1, y, RIM[1], PART.rim); R.n(x1, y, 0.9, 0.25, 0.35); R.g(x1, y, RIM[1], 0.25); } }
  }

  // ---------------- hem letters: 3x5 glyphs peeling off the hem beside the cloak, dissolving by Bayer dither
  const gl = (pose.glyphs ?? 5);
  for (let gi = 0; gi < gl; gi++) {
    const glyph = GLYPHS[(gi * 3 + 1) % GLYPHS.length], front = gi % 5 === 4;
    const age = (((pose.gAge + gi * 0.8) % 4) + 4) % 4 / 4; // 0..1, 2.5 tx per frame
    const vBase = 1.5 + (gi % 3) * 0.6, u = vBase + age * 9 + lift * 0.4;
    const { hwB } = profile(clamp(u - lift, 0, 40), pose);
    const baseX = front ? CX + pose.dx + 19 + (gi % 3) * 3 : CX + pose.dx - hwB - 5 - (gi % 4) * 3.2 - age * 3;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (glyph[r * 3 + c] !== "1") continue;
      const x = Math.floor(baseX) + c, y = rowU(u + (4 - r));
      if (R.id(x, y) || bayer(x, y) < age * 1.15) continue;
      R.ed(x, y, r === 0 ? RIM[3] : RIM[2], PART.glyph, 0.45, 0, 0, 1);
    }
  }
  const raw = finishRaw(R, opts);
  raw.nib = nulNibTip(pose);
  return raw;
}

// ------------------------------------------------------------------ outline + flip (array versions of ch2Props' outline / flipC / flipN)
function finishRaw(R, opts) {
  const doOutline = opts.outline !== false, doFlip = opts.flip !== false;
  const { col, nrm, glw, part } = R;
  for (let i = 0; i < W * H; i++) if (col[i * 4 + 3] && !nrm[i * 4 + 3]) { nrm[i * 4] = 128; nrm[i * 4 + 1] = 150; nrm[i * 4 + 2] = 240; nrm[i * 4 + 3] = 255; }
  const ow = doOutline ? W + 2 : W, oh = doOutline ? H + 2 : H, pad = doOutline ? 1 : 0;
  const O = { w: ow, h: oh, col: new Uint8ClampedArray(ow * oh * 4), nrm: new Uint8ClampedArray(ow * oh * 4), glw: new Uint8ClampedArray(ow * oh * 4), part: new Uint8Array(ow * oh) };
  const A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && col[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const sx = x - pad, sy = y - pad, o = (y * ow + x) * 4;
    const mx = doFlip ? ow - 1 - x : x, mo = (y * ow + mx) * 4;
    if (A(sx, sy)) {
      const i = (sy * W + sx) * 4;
      O.col[mo] = col[i]; O.col[mo + 1] = col[i + 1]; O.col[mo + 2] = col[i + 2]; O.col[mo + 3] = 255;
      O.nrm[mo] = doFlip ? 255 - nrm[i] : nrm[i]; O.nrm[mo + 1] = nrm[i + 1]; O.nrm[mo + 2] = nrm[i + 2]; O.nrm[mo + 3] = nrm[i + 3];
      O.glw[mo] = glw[i]; O.glw[mo + 1] = glw[i + 1]; O.glw[mo + 2] = glw[i + 2]; O.glw[mo + 3] = glw[i + 3];
      O.part[y * ow + mx] = part[sy * W + sx];
    } else if (doOutline && (A(sx - 1, sy) || A(sx + 1, sy) || A(sx, sy - 1) || A(sx, sy + 1))) {
      O.col[mo] = OUT[0]; O.col[mo + 1] = OUT[1]; O.col[mo + 2] = OUT[2]; O.col[mo + 3] = 255;
    }
  }
  return O;
}

// ------------------------------------------------------------------ ward rim variant (a ring only, never a fill)
/** Recolour the 1 px outline ring of a final frame to a glowing violet rim (glow 0.85 x colour). Array form for the tests. */
export function wardRaw(O) {
  const out = { ...O, col: new Uint8ClampedArray(O.col), glw: new Uint8ClampedArray(O.glw) };
  const { w, h } = O;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && O.col[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A(x, y) || (A(x - 1, y) && A(x + 1, y) && A(x, y - 1) && A(x, y + 1))) continue;
    const i = (y * w + x) * 4, c = y < h * 0.55 ? RIM[3] : RIM[2];
    out.col[i] = c[0]; out.col[i + 1] = c[1]; out.col[i + 2] = c[2];
    out.glw[i] = c[0] * 0.85; out.glw[i + 1] = c[1] * 0.85; out.glw[i + 2] = c[2] * 0.85; out.glw[i + 3] = 255;
  }
  return out;
}

// ------------------------------------------------------------------ SpriteFrame wrappers (need a DOM canvas)
function toCanvas(arr, w, h) {
  const m = mk(w, h), id = m.x.createImageData(w, h);
  id.data.set(arr); m.x.putImageData(id, 0, 0);
  return m.c;
}
export function rawToFrame(O) {
  return { img: toCanvas(O.col, O.w, O.h), normal: toCanvas(O.nrm, O.w, O.h), glow: toCanvas(O.glw, O.w, O.h), w: O.w, h: O.h, ax: NUL_ANCHOR.ax, ay: NUL_ANCHOR.ay, bulge: 0.7 };
}
function buildAnims(ward) {
  const out = {};
  for (const [k, poses] of Object.entries(NUL_ANIMS)) {
    if (k === "atk") continue;
    out[k] = poses.map((p) => { const raw = renderNulRaw(p); return rawToFrame(ward ? wardRaw(raw) : raw); });
  }
  out.atk = out.cast;
  return out;
}

type Anims = Record<string, SpriteFrame[]>;
/** Registers `monster.nul` and `monster.nul.ward` (replaces the P0.3 placeholder). */
export function registerPrologueArt(table: Map<string, () => Anims>): void {
  let base: Anims | null = null, ward: Anims | null = null;
  table.set("monster.nul", () => (base ??= buildAnims(false)));
  table.set("monster.nul.ward", () => (ward ??= buildAnims(true)));
}

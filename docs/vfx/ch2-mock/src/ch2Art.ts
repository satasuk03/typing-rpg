// @ts-nocheck
/**
 * C0.2 SCRATCH: Ch2 procedural pixel-art direction sketches (props, enemies, Willow, backdrops).
 * Throwaway direction code, NOT production. T2.1 / T2.3 re-implement these in `render/sprites/ch2Props.ts` and
 * `ch2Monsters.ts` to the brief (docs/vfx/ch2-art-direction.md). Same conventions as proceduralArt.ts:
 * 16 texels per metre, anchor at the foot (or the top for `hang`), dark 1 px outline on actors.
 *
 * One upgrade over Ch1 that the brief makes normative: big props carry AUTHORED normals from their own
 * geometry (cylinder normals across a trunk, hemisphere normals per leaf clump) instead of the alpha-derived bulge,
 * so the moon rakes across a trunk instead of lighting a flat cut-out.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function RNG(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pal = a => a.map(hex);
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return { c, x }; }

// ------------------------------------------------------------------ palettes (sRGB)
export const PAL = {
  // hushwood
  NBARK: pal(['#0b0910', '#141019', '#1e1824', '#2a2232', '#3a3044', '#514660', '#6e6280']),
  NLEAF: pal(['#060d12', '#0a171c', '#0f2226', '#163132', '#204440', '#2f5c52', '#477a66', '#6c9c80']),
  NMOSS: pal(['#10201a', '#1a3226', '#284a34', '#3c6644', '#5a8656']),
  HMOSS: pal(['#161e1c', '#222e2a', '#33443c', '#4a5e54', '#66786c']),
  PAPER: pal(['#6a2e10', '#b4561a', '#f08a30', '#ffbe64', '#fff0c4']),
  IRON: pal(['#0c0a0e', '#1c181e', '#2e282e', '#463e44']),
  NSTONE: pal(['#111118', '#1b1b24', '#272733', '#363644', '#4a4a5a', '#646476', '#82829a']),
  RUNE: pal(['#1e8a9a', '#46d8e0', '#a8fff8', '#eaffff']),
  STEM: pal(['#6a6a74', '#a4a4b0', '#d4d4dc', '#f0f0f6']),
  CAPT: pal(['#123c46', '#1f7a80', '#3fd0c8', '#9ff6ee', '#eafffb']),
  CAPV: pal(['#2a1a4a', '#5a3aa0', '#9a72f0', '#d0b8ff', '#f4ecff']),
  // fen
  CYP: pal(['#0b0d0b', '#141814', '#1e231d', '#2a3128', '#3a4236', '#4e5848', '#68725e', '#8a9480']),
  SPM: pal(['#1e2620', '#2c3a2e', '#3e5040', '#566a56', '#76887a', '#98aa98']),
  REED: pal(['#10160a', '#1a2410', '#283818', '#3a5020', '#52682a', '#708436', '#94a448', '#c4bc6a']),
  CATT: pal(['#24160c', '#3e2614', '#5a3a1e', '#7a5430']),
  WOOD: pal(['#16100b', '#241a12', '#34261a', '#4a3624', '#634a32', '#7e6242', '#9a7c56']),
  // grove / willow
  WBARK: pal(['#0a070e', '#130e18', '#1c1424', '#281c32', '#362642', '#4a3656', '#62506e', '#80708c']),
  WLEAF: pal(['#071212', '#0c1e1e', '#122c2c', '#1a403c', '#265a50', '#367a66', '#4e9a7e', '#76bc9c', '#acdcc4']),
  HUSHV: pal(['#2a1260', '#4e28b0', '#7a50f0', '#ac90ff', '#dcd0ff', '#f6f2ff']),
  HUSHT: pal(['#0c5a5a', '#1aa898', '#3fe8cc', '#a8fff0']),
  // enemies
  WISP: pal(['#123a7a', '#2a78c0', '#4cc0ec', '#90ecff', '#d6ffff', '#ffffff']),
  SHADE: pal(['#07060f', '#0e0b1e', '#17122e', '#221a44', '#30265e', '#43387e', '#5e52a2']),
  MASK: pal(['#5e5672', '#9a90b0', '#cec6dc', '#eee8f4']),
  MOTHB: pal(['#3a2e1e', '#5e4c32', '#8a7650', '#b8a478', '#e0d2a8', '#f6eed4']),
  MOTHW: pal(['#1e1e16', '#30301e', '#4a4a2c', '#68683c', '#8c8a52', '#b2ae72', '#d8d29c']),
  HEAL: pal(['#0e6a2e', '#22b450', '#5cf08a', '#b6ffc8', '#f0fff2']),
  TOAD: pal(['#0e1208', '#171e0c', '#222c10', '#2f3d16', '#40521e', '#566a28', '#6e8434', '#8ea044']),
  BELLY: pal(['#4e4a2e', '#7a7448', '#a8a070', '#d0c894']),
  GOLDEYE: pal(['#8a5a08', '#e0a020', '#ffd448', '#fff2a8']),
  WOLF: pal(['#101218', '#1c202c', '#2a3042', '#384058', '#4a5470', '#5e6a8a', '#7c88a8', '#a4b0cc']),
  EMBER: pal(['#7a2a06', '#d4600e', '#ffa62a', '#ffe08a', '#fff8e0']),
  GOLD: pal(['#5a3c0a', '#a8761a', '#e8b23a', '#ffe08a']),
};

// ------------------------------------------------------------------ layer with colour + normal + glow
function Layer(w, h) {
  const col = new Uint8ClampedArray(w * h * 4), nrm = new Uint8ClampedArray(w * h * 4), glw = new Uint8ClampedArray(w * h * 4);
  let hasN = false, hasG = false;
  const idx = (x, y) => ((y | 0) * w + (x | 0)) * 4;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const L = {
    w, h,
    set(x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (!inb(x, y)) return; const i = idx(x, y); col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2]; col[i + 3] = a; glw[i] = 0; glw[i + 1] = 0; glw[i + 2] = 0; glw[i + 3] = 0; },
    n(x, y, nx, ny, nz) { x = Math.round(x); y = Math.round(y); if (!inb(x, y)) return; hasN = true; const l = Math.hypot(nx, ny, nz) || 1; const i = idx(x, y); nrm[i] = (nx / l * 0.5 + 0.5) * 255; nrm[i + 1] = (ny / l * 0.5 + 0.5) * 255; nrm[i + 2] = (nz / l * 0.5 + 0.5) * 255; nrm[i + 3] = 255; },
    sn(x, y, c, nx, ny, nz) { L.set(x, y, c); L.n(x, y, nx, ny, nz); },
    g(x, y, c) { x = Math.round(x); y = Math.round(y); if (!inb(x, y)) return; hasG = true; const i = idx(x, y); glw[i] = c[0]; glw[i + 1] = c[1]; glw[i + 2] = c[2]; glw[i + 3] = 255; },
    // colour + glow in one go (emissive pixel)
    e(x, y, c) { L.set(x, y, c); L.g(x, y, c); },
    // dim emissive: colour c, glow at k x c (a faint self-light that survives the night grade)
    ed(x, y, c, k) { L.set(x, y, c); L.g(x, y, [c[0] * k, c[1] * k, c[2] * k]); },
    a(x, y) { x = Math.round(x); y = Math.round(y); return inb(x, y) ? col[idx(x, y) + 3] : 0; },
    clearPx(x, y) { x = Math.round(x); y = Math.round(y); if (!inb(x, y)) return; const i = idx(x, y); col[i + 3] = 0; nrm[i + 3] = 0; glw[i + 3] = 0; },
    finish(o = {}) {
      const toC = (d) => { const m = mk(w, h); const id = m.x.createImageData(w, h); id.data.set(d); m.x.putImageData(id, 0, 0); return m.c; };
      if (hasN) for (let i = 0; i < w * h; i++) if (col[i * 4 + 3] && !nrm[i * 4 + 3]) { nrm[i * 4] = 128; nrm[i * 4 + 1] = 150; nrm[i * 4 + 2] = 240; nrm[i * 4 + 3] = 255; }
      let img = toC(col);
      let normal = hasN ? toC(nrm) : undefined;
      let glow = hasG ? toC(glw) : undefined;
      if (o.outline) { img = outline(img, o.outline); normal = normal && pad1(normal); glow = glow && pad1(glow); }
      if (o.flip) { img = flipC(img); normal = normal && flipN(normal); glow = glow && flipC(glow); }
      const W = img.width, H = img.height;
      return { img, normal, glow, w: W, h: H, ax: o.ax ?? Math.round(W / 2), ay: o.ay ?? H, bulge: o.bulge ?? 1, hang: o.hang, flameY: o.flameY };
    },
  };
  return L;
}
function outline(c, col = [12, 8, 18]) {
  const w = c.width, h = c.height, o = mk(w + 2, h + 2);
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const od = o.x.createImageData(w + 2, h + 2);
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    const sx = x - 1, sy = y - 1;
    if (!A(sx, sy) && (A(sx - 1, sy) || A(sx + 1, sy) || A(sx, sy - 1) || A(sx, sy + 1))) { const i = (y * (w + 2) + x) * 4; od.data[i] = col[0]; od.data[i + 1] = col[1]; od.data[i + 2] = col[2]; od.data[i + 3] = 255; }
  }
  o.x.putImageData(od, 0, 0); o.x.drawImage(c, 1, 1); return o.c;
}
function pad1(c) { const o = mk(c.width + 2, c.height + 2); o.x.drawImage(c, 1, 1); return o.c; }
function flipC(c) { const o = mk(c.width, c.height); o.x.translate(c.width, 0); o.x.scale(-1, 1); o.x.drawImage(c, 0, 0); return o.c; }
function flipN(c) { // mirror AND negate the normal's x so the light still comes from the right side
  const f = flipC(c); const x = f.getContext('2d', { willReadFrequently: true }); const d = x.getImageData(0, 0, f.width, f.height);
  for (let i = 0; i < d.data.length; i += 4) d.data[i] = 255 - d.data[i]; x.putImageData(d, 0, 0); return f;
}
const pick = (P, l) => P[clamp(Math.floor(l) || 0, 0, P.length - 1)];

// ------------------------------------------------------------------ shared drawing primitives
/** A tapered cylinder limb along a polyline, with cylinder normals across it. */
function limb(L, pts, w0, w1, P, opts = {}) {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const seg = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= seg; s++) {
      const u = s / seg, t = (i + u) / (n - 1);
      const x = lerp(x0, x1, u), y = lerp(y0, y1, u);
      const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1;
      const px = -dy / dl, py = dx / dl; // perpendicular
      const hw = lerp(w0, w1, t) / 2;
      for (let k = -hw; k <= hw; k += 0.5) {
        const q = k / Math.max(hw, 0.5); // -1..1 across
        const xx = x + px * k, yy = y + py * k;
        // light from upper-left: the side whose perpendicular points left/up is brighter
        const side = (px * k * -0.8 + py * k * -1.0) / Math.max(hw, 0.5);
        let l = (opts.base ?? 2.6) + side * 1.3 + (hash(Math.round(xx) >> 1, Math.round(yy) >> 2) - 0.5) * 1.1 + bayer(Math.round(xx), Math.round(yy)) * 0.7 - 0.35;
        if (Math.abs(q) > 0.86) l -= 1.0;
        if (opts.groove && hash(Math.round(xx * 0.5 + yy * 0.15), Math.round(yy) >> 3) < 0.12) l -= 1.2;
        const nz = Math.sqrt(Math.max(0.05, 1 - q * q));
        L.sn(xx, yy, pick(P, l), px * q, -py * q, nz);
      }
    }
  }
}
/** Recursive twisty branch: returns terminal points. */
function branch(L, r, x, y, ang, len, th, depth, P, ends, twist = 0.09) {
  const pts = [[x, y]]; let a = ang, cx = x, cy = y; const steps = Math.max(3, Math.round(len / 5)); const ph = r() * 6;
  for (let i = 0; i < steps; i++) { a += Math.sin(i * 0.9 + ph) * twist * 3 + (r() - 0.5) * 0.18; cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps; pts.push([cx, cy]); }
  limb(L, pts, th, Math.max(1, th * 0.55), P, { groove: th > 4 });
  if (depth <= 0 || th < 1.6) { ends.push([cx, cy, a]); return; }
  const kids = 2 + (r() < 0.35 ? 1 : 0);
  for (let k = 0; k < kids; k++) {
    const da = (k - (kids - 1) / 2) * (0.55 + r() * 0.35);
    branch(L, r, cx, cy, a + da, len * (0.55 + r() * 0.2), th * 0.6, depth - 1, P, ends, twist);
  }
}
/** Flattened leaf "shelf" clump with hemisphere normals and a moonlit top edge. */
function clump(L, cx, cy, rx, ry, P, seed, lift = 0) {
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const n = hash((x >> 1) + seed, (y >> 1) - seed);
    const d = Math.hypot(dx, dy * (dy > 0 ? 1.35 : 1));
    if (d > 0.82 + n * 0.3) continue;
    // leafy texture: little 2x1 leaf pips
    const pip = hash(x >> 1, y) > 0.82 ? 0.6 : 0;
    let l = 3.1 - dy * 2.4 - dx * 0.8 + (n - 0.5) * 1.3 + pip + bayer(x, y) * 0.8 + lift;
    if (d > 0.76) l -= 1.4;
    const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(1, d * d)));
    L.sn(x, y, pick(P, l), dx * 0.8, -dy * 0.9, nz);
  }
}
function strand(L, x, y, len, P, ph, w = 1, sway = 1.4) {
  for (let s = 0; s < len; s++) {
    const t = s / len, xx = x + Math.sin(s * 0.18 + ph) * sway * t;
    const l = 3.2 - t * 2.2 + (hash(Math.round(xx), y + s) - 0.5) * 1.2;
    for (let k = 0; k < w; k++) L.sn(xx + k, y + s, pick(P, l - k * 0.7), 0, 0.2, 1);
    if (s % 4 === 0 && t > 0.15 && hash(s, ph * 99 | 0) > 0.4) L.sn(xx + (hash(s, 7) > 0.5 ? 1 : -1), y + s + 1, pick(P, l + 0.5), 0, 0.3, 1);
  }
}

// ------------------------------------------------------------------ HUSHWOOD props
/**
 * Twisted hollow oak (night). 184 x 176 px. Mid / bg layer. Built LOW on purpose: the battle camera's top ray is
 * horizontal at y ~= 7 m, so the trunk splits at 3.5-4.5 m and the limbs reach SIDEWAYS (not up) with their shelf
 * clumps and moss at 4.5-7 m, inside the frame.
 */
export function makeNightOak(seed, hollow = true) {
  const r = RNG(seed), w = 184, h = 176, L = Layer(w, h), P = PAL.NBARK;
  const base = h - 2, cx = w / 2 + (r() - 0.5) * 12, top = base - (58 + r() * 14), ph = r() * 6, lean = (r() - 0.5) * 2;
  const spine = (y) => { const t = (base - y) / (base - top); return cx + Math.sin(t * 2.4 + ph) * 6 * t + lean * t * t * 10; };
  // roots first (behind the trunk)
  const nR = 5 + (r() * 3 | 0);
  for (let i = 0; i < nR; i++) {
    const dir = i % 2 ? 1 : -1, sx = spine(base - 6) + dir * (6 + r() * 6), len = 24 + r() * 28;
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([sx + dir * t * len, base - 13 * (1 - t) * (1 - t) - 2 + Math.sin(t * 5 + i) * 1.5 + t * 2]); }
    limb(L, pts, 9 - i * 0.5, 2, P, { groove: true, base: 2.2 });
  }
  // trunk
  for (let y = Math.floor(top) - 6; y <= base; y++) {
    const t = (base - y) / (base - top);
    const flare = Math.pow(Math.max(0, 0.3 - t) / 0.3, 1.6) * 20;
    const hw = lerp(16, 11, Math.min(1, t)) + flare;
    const sx = spine(y);
    for (let xx = -hw; xx <= hw; xx += 0.5) {
      const q = xx / hw, X = Math.round(sx + xx);
      const gro = Math.sin((xx * 0.55 + y * 0.22 + ph * 3)) > 0.72 ? -1.2 : 0; // spiral grooves
      let l = 2.9 - q * 1.5 + gro + (hash(X >> 1, y >> 2) - 0.5) * 1.1 + bayer(X, y) * 0.7;
      if (Math.abs(q) > 0.88) l -= 0.9;
      if (hash(X, y >> 1) < 0.04) l += 1.4; // pale lichen flecks
      L.sn(X, y, pick(P, l), q * 0.95, 0.05, Math.sqrt(Math.max(0.05, 1 - q * q)));
    }
  }
  if (hollow) {
    const hy = base - 30 - r() * 10, hx = spine(hy) + (r() - 0.5) * 4, rx = 5.5, ry = 9;
    for (let y = hy - ry - 2; y <= hy + ry + 2; y++) for (let x = hx - rx - 2; x <= hx + rx + 2; x++) {
      const d = Math.hypot((x - hx) / rx, (y - hy) / ry);
      if (d < 1) L.sn(x, y, d > 0.8 && (y - hy) > 0 ? P[3] : hex('#040306'), 0, 0, 1);
      else if (d < 1.28) L.sn(x, y, (x - hx) + (y - hy) * 0.5 > 0 ? P[4] : P[1], (x - hx) / rx, -(y - hy) / ry, 0.6);
    }
  }
  // limbs: reach sideways and a little up, twisting
  const ends = []; const nL = 4 + (r() * 2 | 0);
  for (let i = 0; i < nL; i++) {
    const side = i % 2 ? 1 : -1, k = (i >> 1);
    const a0 = -Math.PI / 2 + side * (0.75 + k * 0.32 + r() * 0.2);
    branch(L, r, spine(top + 6) + side * 4, top + 6 + k * 3, a0, 30 + r() * 16, 9.5 - k * 2, 2, P, ends, 0.07);
  }
  ends.sort((a, b) => b[1] - a[1]);
  for (const [ex, ey] of ends) clump(L, ex, ey - 1, 11 + r() * 9, 5 + r() * 3, PAL.NLEAF, seed + (ex | 0), 0);
  for (const [ex, ey] of ends) { const n = 2 + (r() * 3 | 0); for (let k = 0; k < n; k++) strand(L, ex + (r() - 0.5) * 16, ey + 3, 8 + r() * 26, PAL.HMOSS, r() * 6); }
  // moss on the root collar
  for (let x = 0; x < w; x++) for (let y = base - 26; y <= base; y++) if (L.a(x, y) && !L.a(x, y - 2) && hash(x, y + seed) < 0.7) L.sn(x, y, pick(PAL.NMOSS, 1 + hash(x, y) * 3), 0, 1, 0.4);
  return L.finish({ ax: Math.round(cx), ay: h, bulge: 1.2 });
}

/** Hanging paper lantern on a cord. Anchor at the TOP (hang). 13 x (cord + 18) px. */
export function makeHangingLantern(cord = 22, warm = true) {
  const w = 13, h = cord + 19, L = Layer(w, h), I = PAL.IRON, PP = warm ? PAL.PAPER : PAL.CAPT;
  for (let y = 0; y < cord; y++) L.sn(6, y, y % 3 ? I[2] : I[3], 0, 0, 1);
  const y0 = cord;
  for (let x = 3; x <= 9; x++) { L.sn(x, y0, I[2], 0, 1, 0.5); L.sn(x, y0 + 1, I[1], 0, 0, 1); }
  L.sn(6, y0 - 1, I[3], 0, 1, 0.4);
  const rows = [7, 9, 11, 11, 11, 11, 11, 11, 11, 9, 7];
  rows.forEach((rw, i) => {
    const y = y0 + 2 + i;
    for (let k = 0; k < rw; k++) {
      const x = 6 - (rw - 1) / 2 + k, q = (k - (rw - 1) / 2) / ((rw - 1) / 2 || 1);
      const rib = (k === 0 || k === rw - 1 || Math.abs(x - 6) === 3) && i > 0 && i < rows.length - 1;
      const core = 1 - Math.abs(q) * 0.75 - Math.abs(i - 5) * 0.06;
      const c = rib ? PP[1] : pick(PP, 1.4 + core * 3.2 + bayer(x, y) * 0.5);
      L.set(x, y, c); L.g(x, y, rib ? PP[0] : c); L.n(x, y, q * 0.8, 0, 1);
    }
  });
  const yb = y0 + 2 + rows.length;
  for (let x = 4; x <= 8; x++) L.sn(x, yb, I[1], 0, -1, 0.5);
  for (let y = yb + 1; y < h; y++) L.sn(6, y, (y - yb) % 2 ? PAL.PAPER[0] : hex('#8a1e14'), 0, 0, 1);
  return L.finish({ ax: 6, ay: 0, hang: 1, bulge: 0.6 });
}

/** Stilt / road lantern: a crooked pole with a crossarm and a lantern hanging off it. 30 x 96 px. */
export function makeLanternPost(seed = 3, tall = 90) {
  const r = RNG(seed), w = 30, h = tall + 2, L = Layer(w, h), P = PAL.WOOD;
  const lean = (r() - 0.5) * 3;
  const pts = []; for (let k = 0; k <= 8; k++) pts.push([8 + lean * (k / 8) + Math.sin(k * 1.3 + seed) * 0.6, h - 1 - k * (tall - 4) / 8]);
  limb(L, pts, 4, 3, P, { groove: false, base: 2.6 });
  const tx = pts[8][0], ty = pts[8][1];
  limb(L, [[tx - 1, ty + 4], [tx + 10, ty + 3], [tx + 19, ty + 4.5]], 2.5, 2, P, { base: 2.8 });
  for (let k = 0; k < 4; k++) { L.sn(tx - 2 + k, ty + 14 + k, P[1], 0, 0, 1); L.sn(tx + 3 - k, ty + 14 + k, P[2], 0, 0, 1); }
  // rope wraps
  for (const yy of [h - 20, h - 22, ty + 22]) for (let x = -2; x <= 2; x++) L.sn(tx + x + lean * ((h - yy) / tall), yy, hex('#8a7a52'), 0, 0, 1);
  const lan = makeHangingLantern(6, true);
  // stamp the lantern under the arm tip
  const ctx = lan.img.getContext('2d').getImageData(0, 0, lan.w, lan.h).data;
  const gl = lan.glow.getContext('2d').getImageData(0, 0, lan.w, lan.h).data;
  const ox = Math.round(tx + 17 - 6), oy = Math.round(ty + 5);
  for (let y = 0; y < lan.h; y++) for (let x = 0; x < lan.w; x++) {
    const i = (y * lan.w + x) * 4; if (!ctx[i + 3]) continue;
    L.set(ox + x, oy + y, [ctx[i], ctx[i + 1], ctx[i + 2]]); L.n(ox + x, oy + y, 0, 0, 1);
    if (gl[i + 3]) L.g(ox + x, oy + y, [gl[i], gl[i + 1], gl[i + 2]]);
  }
  return L.finish({ ax: 8, ay: h, bulge: 0.6, flameY: (h - (oy + 12)) / 16 });
}

/** Waystone: rounded slab with a faint glowing rune and a moss cap. 30 x 46 px. */
export function makeWaystone(seed = 5) {
  const r = RNG(seed), w = 30, h = 46, L = Layer(w, h), P = PAL.NSTONE;
  const cx = 15, top = 4, lean = (r() - 0.5) * 3;
  for (let y = top; y < h; y++) {
    const t = (y - top) / (h - top);
    const hw = (y - top < 8 ? Math.sqrt(Math.max(0, 1 - Math.pow((8 - (y - top)) / 8, 2))) * 10 : 10) + t * 2.5 + (hash(y >> 2, seed) - 0.5) * 1.2;
    const sx = cx + lean * (1 - t);
    for (let xx = -hw; xx <= hw; xx += 0.5) {
      const q = xx / hw, X = Math.round(sx + xx);
      let l = 3.4 - q * 1.6 - (y - top < 8 ? 0 : t * 0.6) + (hash(X >> 1, y >> 1) - 0.5) * 1.0 + bayer(X, y) * 0.6;
      if (Math.abs(q) > 0.88) l -= 1.1;
      if (hash(X >> 1, (y >> 2) + seed) < 0.06) l -= 1.4; // chips
      L.sn(X, y, pick(P, l), q, y - top < 8 ? (8 - (y - top)) / 8 : 0, Math.sqrt(Math.max(0.05, 1 - q * q)));
      if (hash(X, y * 3 + seed) < 0.025) L.sn(X, y, hex('#9aa86a'), q, 0, 1); // lichen
    }
  }
  // the rune: a vertical glyph of 3 strokes + a ring
  const gx = cx + lean * 0.5, gy = 16;
  const R = PAL.RUNE;
  for (let y = 0; y < 16; y++) L.e(gx, gy + y, y % 5 === 0 ? R[3] : R[1]);
  for (let k = -3; k <= 3; k++) { L.e(gx + k, gy + 5 + Math.abs(k) * 0.6, R[1]); L.e(gx + k, gy + 11 - Math.abs(k) * 0.6, R[0]); }
  for (let a = 0; a < 20; a++) { const an = a / 20 * Math.PI * 2; L.e(gx + Math.cos(an) * 3.2, gy + 2 + Math.sin(an) * 2.2, R[2]); }
  // moss cap
  for (let x = 0; x < w; x++) for (let y = 0; y < 16; y++) if (L.a(x, y) && !L.a(x, y - 2) && hash(x, y + 9) < 0.9) { L.sn(x, y, pick(PAL.NMOSS, 2 + hash(x, y) * 3), 0, 1, 0.4); if (hash(x, 4) < 0.5) L.sn(x, y + 1, PAL.NMOSS[1], 0, 1, 0.5); }
  return L.finish({ ax: 15, ay: h, bulge: 1.1 });
}

/** A run of glowing mushrooms (a ring seen edge-on). 52 x 22 px. */
export function makeMushrooms(seed = 4, violet = false) {
  const r = RNG(seed), w = 52, h = 22, L = Layer(w, h), C = violet ? PAL.CAPV : PAL.CAPT, S = PAL.STEM;
  const n = 7 + (r() * 3 | 0); const list = [];
  for (let i = 0; i < n; i++) list.push({ x: 4 + r() * (w - 8), hh: 3 + r() * 11, cw: 2 + r() * 3.5 });
  list.sort((a, b) => b.hh - a.hh);
  for (const m of list) {
    const x = Math.round(m.x);
    for (let k = 0; k < m.hh; k++) { L.sn(x, h - 1 - k, k < 2 ? S[0] : S[2], -0.3, 0, 1); if (m.cw > 3) L.sn(x + 1, h - 1 - k, S[1], 0.4, 0, 1); }
    const cy = h - 1 - m.hh, cw = Math.round(m.cw);
    for (let j = -cw; j <= cw; j++) {
      const q = j / cw, top = Math.round(Math.sqrt(1 - q * q) * (cw * 0.7));
      for (let k = 0; k <= top; k++) { const c = pick(C, 2.2 + (1 - Math.abs(q)) * 1.2 + k * 0.5 - (q > 0.4 ? 0.8 : 0)); L.e(x + j, cy - k, c); L.n(x + j, cy - k, q, 0.6, 0.6); }
      L.e(x + j, cy + 1, C[1]); // gills
    }
    if (cw > 2) { L.e(x - 1, cy - Math.round(cw * 0.5), C[4]); }
  }
  // grass tufts at the foot
  for (let x = 0; x < w; x++) if (hash(x, seed) < 0.5) { const hh = 1 + hash(x, 3) * 4; for (let k = 0; k < hh; k++) L.sn(x, h - 1 - k, pick(PAL.NMOSS, 1 + k), 0, 1, 0.5); }
  return L.finish({ ax: w / 2, ay: h, bulge: 0.5 });
}

/** Root arch: two gnarled roots meeting over the path, moss hanging. 150 x 104 px. Mid layer (behind the lane). */
export function makeRootArch(seed = 7) {
  const r = RNG(seed), w = 150, h = 104, L = Layer(w, h), P = PAL.NBARK;
  for (let s = 0; s < 3; s++) {
    const pts = [];
    const x0 = 8 + s * 6 + r() * 4, x1 = w - 10 - s * 5 - r() * 4, peak = 14 + s * 9 + r() * 4;
    for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([lerp(x0, x1, t) + Math.sin(t * 9 + s) * 2.5, h - 2 - Math.sin(t * Math.PI) * (h - peak) + Math.sin(t * 13 + s * 2) * 2]); }
    limb(L, pts, 12 - s * 3, 9 - s * 2.5, P, { groove: true, base: 2.4 - s * 0.3 });
  }
  for (let i = 0; i < 16; i++) strand(L, 18 + r() * (w - 36), 14 + r() * 18, 8 + r() * 30, PAL.HMOSS, r() * 6);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (L.a(x, y) && !L.a(x, y - 1) && hash(x, y) < 0.55) L.sn(x, y, pick(PAL.NMOSS, 2 + hash(x, 1) * 2.5), 0, 1, 0.4);
  return L.finish({ ax: w / 2, ay: h, bulge: 1.0 });
}

/** Foreground moss curtain: a gnarled bough with dense hanging moss. Hang. 150 x 190 px. */
export function makeMossCurtain(seed = 9) {
  const r = RNG(seed), w = 150, h = 190, L = Layer(w, h);
  const pts = []; for (let k = 0; k <= 10; k++) pts.push([k * w / 10, 6 + Math.sin(k * 0.8 + seed) * 4 + k * 0.6]);
  limb(L, pts, 12, 7, PAL.NBARK, { groove: true, base: 2.0 });
  for (let i = 0; i < 60; i++) { const x = r() * w; strand(L, x, 6 + Math.sin(x / w * 8 + seed) * 4 + x / w * 6, 20 + Math.pow(r(), 0.7) * (h - 30), PAL.HMOSS, r() * 6, r() < 0.3 ? 2 : 1, 2.2); }
  return L.finish({ ax: w / 2, ay: 0, hang: 1, bulge: 0.5 });
}

/** Foreground leaf-litter mound + night ferns. 120 x 70. */
export function makeNightFern(seed = 2, wd = 110, ht = 76) {
  const r = RNG(seed), L = Layer(wd, ht), C = PAL.NLEAF;
  const n = 8 + (r() * 4 | 0);
  for (let f = 0; f < n; f++) {
    const bx = wd / 2 + (r() - 0.5) * wd * 0.25, dir = r() < 0.5 ? -1 : 1, len = ht * (0.6 + r() * 0.45), arc = 0.4 + r() * 0.8;
    for (let s = 0; s < len; s++) {
      const t = s / len, px = bx + dir * Math.pow(t, 1.4) * len * arc * 0.9, py = ht - t * len * 0.95 + Math.pow(t, 2.2) * len * 0.45 * arc;
      L.sn(px, py, C[3], 0, 1, 0.5); L.sn(px, py + 1, C[2], 0, 0.5, 1);
      if (s % 2 === 0 && t > 0.08) { const ll = Math.round((1 - t) * 9 + 2); for (let k = 1; k <= ll; k++) { L.sn(px - k * 0.45 * dir, py - k * 0.9, k === ll ? C[6] : C[s % 4 ? 3 : 4], -dir * 0.3, 0.8, 0.5); L.sn(px + k * 0.9 * dir, py - k * 0.3, k === ll ? C[5] : C[2], dir * 0.3, 0.4, 0.8); } }
    }
  }
  return L.finish({ ax: wd / 2, ay: ht, bulge: 0.8 });
}

// ------------------------------------------------------------------ FEN props
/** Dead bald cypress with buttressed base, knees and Spanish-moss drapes. 120 x 250 px. */
export function makeCypress(seed = 11) {
  const r = RNG(seed), w = 120, h = 250, L = Layer(w, h), P = PAL.CYP;
  const base = h - 2, cx = w / 2 + (r() - 0.5) * 8, top = 30 + r() * 20, lean = (r() - 0.5) * 6;
  const spine = (y) => { const t = (base - y) / (base - top); return cx + lean * t + Math.sin(t * 3 + seed) * 2; };
  // knees
  for (let i = 0; i < 4; i++) { const kx = cx + (i - 1.5) * 22 + (r() - 0.5) * 8, kh = 5 + r() * 9; for (let y = 0; y < kh; y++) { const hw = (1 - y / kh) * 3 + 0.5; for (let xx = -hw; xx <= hw; xx += 0.5) L.sn(kx + xx, base - y, pick(P, 3.2 - xx / hw * 1.2 + hash(y, i) * 0.8), xx / hw, 0.2, 0.9); } }
  for (let y = Math.floor(top); y <= base; y++) {
    const t = (base - y) / (base - top);
    const hw = 5 + 2.5 * (1 - t) + 30 * Math.exp(-t * 9) + Math.sin(y * 0.9) * 0.4;
    const sx = spine(y);
    for (let xx = -hw; xx <= hw; xx += 0.5) {
      const q = xx / hw, X = Math.round(sx + xx);
      // buttress fluting: vertical ridges near the base
      const flute = t < 0.25 ? Math.sin(xx * 0.9) * (0.25 - t) * 5 : 0;
      let l = 3.3 - q * 1.6 + flute + (hash(X >> 1, y >> 3) - 0.5) * 1.0 + bayer(X, y) * 0.6;
      if (Math.abs(q) > 0.9) l -= 0.9;
      L.sn(X, y, pick(P, l), q * 0.9 + flute * 0.1, 0, Math.sqrt(Math.max(0.05, 1 - q * q)));
    }
  }
  // snapped top
  for (let k = 0; k < 7; k++) L.clearPx(spine(top) + (k - 3), top + (hash(k, seed) * 6 | 0) - 1);
  // sparse crooked limbs + moss drapes
  const ends = [];
  for (let i = 0; i < 5; i++) {
    const y0 = top + 20 + i * 24 + r() * 10, dir = i % 2 ? 1 : -1;
    const len = 18 + r() * 22;
    const pts = [[spine(y0), y0]]; let a = dir > 0 ? -0.35 : Math.PI + 0.35;
    let x = spine(y0), y = y0; for (let k = 0; k < 5; k++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; pts.push([x, y]); }
    limb(L, pts, 3.2, 1.2, P, { base: 2.8 });
    ends.push(pts);
  }
  for (const pts of ends) for (let k = 1; k < pts.length; k++) if (r() < 0.8) { const [x, y] = pts[k]; const n = 3 + (r() * 4 | 0); for (let j = 0; j < n; j++) strand(L, x + (r() - 0.5) * 6, y + 1, 10 + r() * 34, PAL.SPM, r() * 6, 1, 2.4); }
  return L.finish({ ax: Math.round(cx), ay: h, bulge: 1.3 });
}

/** Reed clump with cattails. 48 x 64 px. */
export function makeReeds(seed = 13, wd = 48, ht = 64) {
  const r = RNG(seed), L = Layer(wd, ht), C = PAL.REED;
  const n = 16 + (r() * 8 | 0); const tall = [];
  for (let i = 0; i < n; i++) {
    const x0 = wd / 2 + (r() - 0.5) * wd * 0.55, len = ht * (0.35 + r() * 0.62), lean = (r() - 0.5) * 18, wide = r() < 0.4;
    let tx = x0, ty = ht - 1;
    for (let s = 0; s < len; s++) {
      const t = s / len; tx = x0 + lean * t * t; ty = ht - 1 - s;
      const l = 1.4 + t * 4.4 + (hash(i, s >> 2) - 0.5) * 0.9;
      L.sn(tx, ty, pick(C, l), lean > 0 ? 0.4 : -0.4, 0.2, 0.9);
      if (wide && t < 0.8) L.sn(tx + 1, ty, pick(C, l - 1), 0.6, 0.2, 0.8);
    }
    if (len > ht * 0.7) tall.push([tx, ty, lean]);
  }
  tall.slice(0, 4).forEach(([x, y]) => { for (let k = 0; k < 9; k++) { L.sn(x, y + 3 + k, pick(PAL.CATT, 2.5 - k * 0.2 + (k < 2 ? 0.7 : 0)), -0.3, 0, 1); L.sn(x + 1, y + 3 + k, pick(PAL.CATT, 1.2), 0.6, 0, 0.8); } L.sn(x, y + 1, C[6], 0, 1, 0.5); L.sn(x, y + 2, C[5], 0, 1, 0.5); });
  return L.finish({ ax: wd / 2, ay: ht, bulge: 0.4 });
}

/** Boardwalk post with a rope. 10 x 30 px. */
export function makePost(seed = 2) {
  const w = 10, h = 30, L = Layer(w, h), P = PAL.WOOD;
  for (let y = 3; y < h; y++) for (let x = 3; x <= 6; x++) { const q = (x - 4.5) / 1.5; L.sn(x, y, pick(P, 3.2 - q * 1.3 + hash(x, y >> 2) * 0.6 - (y < 5 ? 0 : 0)), q, 0, 0.8); }
  for (let x = 3; x <= 6; x++) L.sn(x, 3, P[5], 0, 1, 0.3);
  for (const yy of [8, 10]) for (let x = 2; x <= 7; x++) L.sn(x, yy, hex('#8a7a52'), 0, 0, 1);
  return L.finish({ ax: 5, ay: h, bulge: 0.6 });
}

/** Sunken shrine column (cool green stone, broken top). 26 x 70 px. */
export function makeSunkenColumn(seed = 3, ht = 64) {
  const r = RNG(seed), w = 20, L = Layer(w + 6, ht + 6), P = pal(['#101612', '#1a221c', '#26302a', '#344038', '#46544a', '#5e6e62']);
  const cut = []; for (let x = 0; x < w; x++) cut.push(Math.floor(hash(x >> 1, seed) * 9 + (x > w / 2 ? 4 : 0)));
  for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) {
    if (y < cut[x] + 2) continue;
    const fl = (x % 5 === 0) ? -1 : 0, q = (x - w / 2) / (w / 2);
    let l = 3.4 - q * 1.6 + fl + (hash(x >> 2, y >> 3) - 0.5) * 0.8 + bayer(x, y) * 0.6;
    L.sn(x + 3, y + 3, pick(P, l), q, 0, Math.sqrt(Math.max(0.05, 1 - q * q)));
    if (y < cut[x] + 6 && hash(x, y) < 0.5) L.sn(x + 3, y + 3, pick(PAL.NMOSS, 2 + hash(x, y) * 2), 0, 1, 0.4);
    if (hash(x, y + 77) < 0.02) L.sn(x + 3, y + 3, hex('#8a9a5a'), 0, 0, 1);
  }
  for (let i = 0; i < 4; i++) strand(L, 4 + r() * w, cut[2] + 6, 6 + r() * 16, PAL.SPM, r() * 6);
  return L.finish({ ax: (w + 6) / 2, ay: ht + 6, bulge: 1.1 });
}

// ------------------------------------------------------------------ backdrops (wrapping strips)
function strip(w, h, fn) { const L = Layer(w, h); fn(L); return L.finish().img; }
export function skyNight() {
  return strip(64, 128, (L) => {
    const stops = [[0, '#0a0c22'], [0.35, '#1a1c48'], [0.62, '#2e2a5e'], [0.8, '#3c4a72'], [0.92, '#4a6a7e'], [1, '#5a7c84']].map(([t, c]) => [t, hex(c)]);
    const col = t => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(j => Math.round(a[1][j] + (b[1][j] - a[1][j]) * k)); } return stops[stops.length - 1][1]; };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const v = (y / 128) * 18 + bayer(x, y) - 0.5; L.set(x, y, col(clamp(Math.round(v) / 18, 0, 1))); }
    for (let i = 0; i < 40; i++) { const x = (hash(i, 1) * 64) | 0, y = (hash(i, 2) * 70) | 0; L.set(x, y, hash(i, 3) > 0.7 ? [230, 236, 255] : [150, 160, 210]); }
  });
}
export function skyDusk() {
  return strip(64, 128, (L) => {
    const stops = [[0, '#14202a'], [0.3, '#2a3c3e'], [0.55, '#4e5a48'], [0.72, '#8a8a5a'], [0.86, '#c0a868'], [1, '#e0c884']].map(([t, c]) => [t, hex(c)]);
    const col = t => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(j => Math.round(a[1][j] + (b[1][j] - a[1][j]) * k)); } return stops[stops.length - 1][1]; };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const v = (y / 128) * 16 + bayer(x, y) - 0.5; L.set(x, y, col(clamp(Math.round(v) / 16, 0, 1))); }
  });
}
/** Far forest silhouette: spiky dead crowns and round oaks. */
export function farForest(dark, mid, light, seed = 23, base = 170, spiky = 0.6, cypress = false) {
  return strip(768, 216, (L) => {
    const r = RNG(seed); let x = 0; const C = hex(mid), D = hex(dark), R = hex(light);
    while (x < 768) {
      const ht = 34 + r() * 60, top = base - ht, kind = r();
      for (let y = Math.floor(top); y < base + 2; y++) {
        const k = (y - top) / ht; let hw;
        if (cypress) hw = k < 0.08 ? 0.8 : 1.6 + k * 3 + (k > 0.85 ? (k - 0.85) * 40 : 0) + (hash(y >> 2, x) < 0.3 ? 4 * (1 - k) : 0);
        else if (kind < spiky) hw = (k % 0.12) * 18 * (0.5 + k) + k * 9;
        else hw = Math.sqrt(Math.max(0, 1 - Math.pow(k * 2.2 - 1.1, 2))) * ht * 0.4 + (k > 0.6 ? 1.5 : 0);
        if (!cypress && kind >= spiky && k > 0.62) hw = 1.6 + (k - 0.62) * 4;
        for (let xx = Math.floor(-hw); xx <= hw; xx++) L.set(x + xx, y, xx < -hw + 1.5 && bayer(x + xx, y) > 0.35 ? R : (xx > hw * 0.35 ? D : C));
      }
      if (cypress) for (let k = 0; k < 5; k++) { const yy = top + 10 + k * ht / 6, len = 6 + r() * 14; for (let s = 0; s < len; s++) L.set(x + (k % 2 ? 1 : -1) * (3 + s * 0.6), yy + s * 0.2, C); }
      x += 6 + r() * 14;
    }
    for (let y = base; y < 216; y++) for (let x2 = 0; x2 < 768; x2++) L.set(x2, y, bayer(x2, y) > 0.8 ? R : C);
  });
}

// ------------------------------------------------------------------ ENEMIES (drawn facing right, flipped to face the hero)
/** Lantern Wisp: a runaway lantern flame wearing its broken iron cap. 22 x 30 px. Flies. */
export function makeWisp(phase = 0, atk = false) {
  const w = 22, h = 30, L = Layer(w, h), C = PAL.WISP, I = PAL.IRON;
  const cx = 11, cy = 21, R = atk ? 6.6 : 5.8, sway = Math.sin(phase * 1.7) * 2.2;
  for (let y = 3; y < h - 1; y++) for (let x = 0; x < w; x++) {
    const dy = y - cy, t = clamp((cy - y) / (cy - 4), 0, 1);
    const ccx = cx + sway * t * t;
    const rad = dy > 0 ? R * Math.sqrt(Math.max(0, 1 - Math.pow(dy / (R + 1.2), 2))) : R * Math.pow(1 - t, 0.85) + 0.3;
    const d = Math.abs(x - ccx) / Math.max(0.6, rad);
    if (d > 1 || (dy > 0 && dy > R + 1)) continue;
    // a small white-hot core low in the body, cyan flesh, deep-blue rim: never a white blob
    const core = Math.max(0, 1 - Math.hypot((x - cx) / 3, (y - cy - 0.5) / 3.5));
    const l = 1.3 + (1 - d) * 1.9 + core * 2.4 - t * 0.9 + bayer(x, y) * 0.45 + (atk ? 0.5 : 0);
    const c = pick(C, l);
    L.ed(x, y, c, 0.75); L.n(x, y, (x - ccx) / Math.max(1, rad), -dy / 8, 0.8);
  }
  // face: big dark eyes with a catch-light, a small 'o' mouth
  for (const ex of [8, 13]) { L.set(ex, 20, hex('#081226')); L.set(ex, 21, hex('#081226')); L.set(ex + 1, 21, hex('#0c1a34')); L.e(ex + 1, 20, hex('#ffffff')); }
  L.set(10, 24, hex('#0c2a50')); L.set(11, 24, hex('#0c2a50')); L.set(10, 25, hex('#0c2a50')); L.set(11, 25, hex('#0c2a50'));
  // the broken iron lantern cap riding the flame: an 11 px band, three bars, a ring handle
  const capY = 13 + Math.round(Math.sin(phase) * 0.6);
  for (let x = 6; x <= 16; x++) { L.sn(x, capY, x === 6 || x === 16 ? I[1] : I[3], 0, 1, 0.5); L.sn(x, capY + 1, I[2], 0, 0, 1); L.sn(x, capY + 2, I[1], 0, -0.5, 0.8); }
  for (const bx of [8, 11, 14]) { L.sn(bx, capY - 1, I[2], 0, 1, 0.5); L.sn(bx, capY - 2, I[2], 0, 1, 0.5); }
  for (let a = 0; a < 14; a++) { const an = Math.PI + a / 13 * Math.PI; L.sn(11 + Math.cos(an) * 3, capY - 3 + Math.sin(an) * 3, I[3], Math.cos(an), -Math.sin(an), 0.6); }
  return L.finish({ outline: [8, 12, 34], flip: true, bulge: 0.6 });
}

/** Hush Shade: a hooded lost word, pale stitched mask, long sleeves; the hem frays into nothing. 28 x 40 px. Hovers. */
export function makeShade(phase = 0, atk = false) {
  const w = 28, h = 40, L = Layer(w, h), C = PAL.SHADE, M = PAL.MASK, V = PAL.HUSHV;
  const cx = 13 + (atk ? 2 : 0);
  // robe + hood: the hood tip leans back (left, before the flip), shoulders at y 14, flaring to a torn hem
  for (let y = 1; y < h; y++) {
    const t = (y - 1) / (h - 1);
    let hw = t < 0.33 ? 1 + Math.pow(t / 0.33, 0.7) * 6.5 : 7.5 + (t - 0.33) * 9;
    if (atk && t > 0.35 && t < 0.75) hw += 2.5;
    const tipLean = t < 0.33 ? -(0.33 - t) * 16 : 0;
    const sx = cx + tipLean + (t > 0.55 ? Math.sin(phase + t * 7) * 1.4 * (t - 0.55) * 2 : 0);
    for (let x = Math.floor(sx - hw); x <= sx + hw; x++) {
      const q = (x - sx) / Math.max(1, hw);
      if (t > 0.74) { const tooth = Math.abs(Math.sin((x - sx) * 0.85 + phase)); if (t - 0.74 > tooth * 0.24) continue; if (bayer(x, y) < (t - 0.74) * 3.4) continue; }
      let l = 3.6 - q * 1.5 - t * 1.6 + (hash(x, y >> 1) - 0.5) * 0.5 + bayer(x, y) * 0.5;
      if (Math.abs(q) > 0.85) l -= 1;
      if (t > 0.38 && Math.abs(Math.sin(q * 4.6 + t * 2.4)) < 0.11) l -= 1.1; // robe folds
      if (t < 0.36 && q > 0.55) l += 0.8; // moonlit hood edge
      L.sn(x, y, pick(C, l), q * 0.9, 0.25 - t * 0.4, 0.8);
    }
  }
  // the face opening (a void) and the pale mask floating in it: a faint self-glow so it reads at night
  const fx = cx + 1.5, fy = 11;
  for (let y = fy - 5; y <= fy + 5; y++) for (let x = fx - 4; x <= fx + 4; x++) { const d = Math.hypot((x - fx) / 4.2, (y - fy) / 5.2); if (d < 1) L.set(x, y, hex('#030208')); }
  for (let y = fy - 3; y <= fy + 4; y++) for (let x = fx - 3; x <= fx + 3; x++) { const d = Math.hypot((x - fx - 0.5) / 3.1, (y - fy - 0.5) / 4.0); if (d < 1) L.ed(x, y, pick(M, 3.4 - d * 1.6 - (y - fy) * 0.1), 0.28); }
  // hollow violet eyes + stitched mouth (the Silence took its voice)
  for (const ex of [fx - 1, fx + 2]) { L.e(ex, fy - 1, V[2]); L.e(ex + (ex < fx ? -1 : 1) * 0, fy - 1, V[3]); }
  for (let k = -1; k <= 2; k++) L.set(fx + k + 0.5, fy + 3, hex('#7a6e92'));
  for (const k of [-1, 1]) L.ed(fx + k + 0.5, fy + 2, V[2], 0.8);
  L.ed(fx + 1.5, fy + 4, V[2], 0.8);
  // long drooping sleeves, the near one reaching forward
  for (let s = 0; s < 13; s++) { const t = s / 13; L.sn(cx - 7 - s * 0.25, 16 + s, pick(C, 2.6 - t), -0.6, 0, 0.8); L.sn(cx - 6 - s * 0.25, 16 + s, pick(C, 2.0 - t), -0.4, 0, 0.8); }
  for (let s = 0; s < 13; s++) { const t = s / 13, ax = atk ? s * 0.9 : s * 0.45, ay = atk ? -s * 0.45 : s * 0.8; L.sn(cx + 6 + ax, 16 + ay, pick(C, 4.6 - t), 0.6, 0.2, 0.8); L.sn(cx + 6 + ax, 17 + ay, pick(C, 3.4 - t), 0.6, -0.2, 0.8); if (t > 0.8) L.sn(cx + 7 + ax, 17 + ay + (s % 2), C[3], 0.6, 0, 0.8); }
  // a few word-motes fraying off the hem (dim violet)
  for (let k = 0; k < 4; k++) L.ed(cx - 6 + k * 4 + Math.round(Math.sin(phase + k) * 1.5), h - 2 - (k % 2) * 2, V[1], 0.6);
  return L.finish({ outline: [5, 3, 14], flip: true, bulge: 0.8 });
}

/** Moth Mender: the healer. Dusty moth whose forewing eyespots carry a glowing green cross. 36 x 28 px. Flies. */
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
export function makeMoth(phase = 0, cast = false) {
  const w = 36, h = 28, L = Layer(w, h), B = PAL.MOTHB, W = PAL.MOTHW, G = PAL.HEAL;
  const cx = 18, cy = 15, up = cast ? -5 : Math.round(Math.sin(phase) * 3);
  for (const s of [-1, 1]) {
    // forewing: a swept triangle with a rounded, scalloped trailing edge; hindwing: a round lobe
    const fore = [[1, -3], [6, -8 + up * 0.5], [13, -12 + up], [16, -10 + up], [15, -5 + up * 0.6], [11, 0], [5, 2], [1, 1]];
    const hind = [[1, 1], [6, 1], [11, 3], [11, 7], [7, 10], [3, 8], [1, 5]];
    for (let y = -14; y <= 12; y++) for (let x = 0; x <= 17; x++) {
      const inF = inPoly(x + 0.5, y + 0.5, fore), inH = !inF && inPoly(x + 0.5, y + 0.5, hind);
      if (!inF && !inH) continue;
      if ((inF && x > 9 && y > -2 && hash(x, y) < 0.35) || (inH && y > 7 && hash(x * 3, y) < 0.4)) continue; // scalloped edges
      const X = cx + s * (x + 1), Y = cy + y;
      let l = inF ? 3.6 - (y + 12) * 0.08 + x * 0.05 : 2.6 - y * 0.08;
      if (inF && Math.abs(Math.sin(Math.atan2(y + 2, x) * 5)) < 0.16) l -= 1.1; // radial veins
      if (inF && Math.abs(x - (13 - (y + 10) * 0.5)) < 0.8) l += 1.0; // a pale band across the forewing
      L.sn(X, Y, pick(W, l + bayer(X, Y) * 0.6), s * 0.35, 0.35, 0.85);
    }
    // the healer eyespot on each forewing: a dark ring around a glowing green cross (reads as a plus at 1280 px)
    const ex = cx + s * 9, ey = cy - 5 + Math.round(up * 0.6);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = Math.hypot(x, y); if (d < 3.6) L.set(ex + x, ey + y, d > 2.6 ? hex('#141008') : hex('#0e2a16')); }
    for (let k = -2; k <= 2; k++) { L.e(ex + k, ey, k === 0 ? G[4] : G[2]); L.e(ex, ey + k, k === 0 ? G[4] : G[2]); }
  }
  // fuzzy segmented body
  for (let y = cy - 4; y <= cy + 9; y++) for (let x = cx - 2; x <= cx + 2; x++) { const q = (x - cx) / 2.5; if (Math.abs(q) > 0.75 && y > cy + 7) continue; L.sn(x, y, pick(B, 4.2 - Math.abs(q) * 1.6 - (y - cy) * 0.12 + hash(x, y) * 0.7 - ((y - cy) % 3 === 0 ? 0.9 : 0)), q, 0, 0.9); }
  for (let x = cx - 3; x <= cx + 3; x++) for (let y = cy - 8; y <= cy - 4; y++) if (Math.hypot(x - cx, y - (cy - 6)) < 3) L.sn(x, y, pick(B, 4.8 - Math.abs(x - cx) * 0.4), (x - cx) / 3, 0.5, 0.8);
  // feathered antennae
  for (const s of [-1, 1]) for (let k = 0; k < 8; k++) { const x = cx + s * (1 + k * 0.8), y = cy - 9 - k * 0.9 + k * k * 0.09; L.sn(x, y, B[4], 0, 1, 0.5); if (k % 2) { L.sn(x + s, y + 1, B[2], 0, 1, 0.5); L.sn(x - s * 0.5, y - 1, B[3], 0, 1, 0.5); } }
  L.set(cx - 1, cy - 7, hex('#101008')); L.set(cx + 1, cy - 7, hex('#101008'));
  return L.finish({ outline: [14, 12, 6], flip: true, bulge: 0.7 });
}

/** Mire Toad: the brute. Squat warty toad with a lily pad hat and gold slit eyes. 44 x 32 px. */
export function makeToad(phase = 0, atk = false) {
  const w = 44, h = 32, L = Layer(w, h), C = PAL.TOAD, Bl = PAL.BELLY, E = PAL.GOLDEYE;
  const cx = 22, base = h - 2, sq = atk ? -3 : Math.round(Math.sin(phase) * 0.8);
  const bw = 16 + (atk ? -2 : 0), bh = 15 - sq;
  // back legs (behind)
  for (const s of [-1, 1]) for (let y = base - 7; y <= base; y++) for (let x = cx + s * 9; Math.abs(x - cx) <= 21; x += s) { const d = Math.hypot((x - (cx + s * 15)) / 7, (y - (base - 3)) / 4.5); if (d < 1) L.sn(x, y, pick(C, 3 - d + hash(x, y) * 0.6 - (y > base - 2 ? 1 : 0)), s * 0.6, 0.2, 0.8); }
  // body dome
  for (let y = base - bh - 4; y <= base; y++) for (let x = cx - bw - 2; x <= cx + bw + 2; x++) {
    const dx = (x - cx) / bw, dy = (y - (base - 2)) / (bh + 2);
    const d = Math.hypot(dx, dy < 0 ? dy : dy * 3);
    if (d > 1 || y > base) continue;
    let l = 4.4 + dy * 2.6 - dx * 0.9 + (hash(x >> 1, y >> 1) - 0.5) * 0.9 + bayer(x, y) * 0.6;
    if (d > 0.9) l -= 1.1;
    const wart = hash(x >> 1, (y >> 1) + 5) > 0.86 && dy < -0.25;
    let c = pick(C, l + (wart ? 1.6 : 0));
    // belly / throat sac (front-lower, toward +x = mouth side)
    if (dy > -0.38 && dx > -0.15) { c = pick(Bl, 2.6 + dy * 1.2 - Math.abs(dx - 0.35) * 0.8 + bayer(x, y) * 0.5); }
    L.sn(x, y, c, dx * 0.9, -dy * 0.9, Math.sqrt(Math.max(0.05, 1 - d * d)));
  }
  // mouth line
  const my = base - 8 - Math.round(bh * 0.15);
  for (let x = cx + 1; x <= cx + bw + 1; x++) { const yy = my + Math.round(Math.pow((x - cx) / bw, 2) * 2); if (L.a(x, yy)) L.set(x, yy, hex('#141a08')); }
  // eyes on top, bulging
  for (const ex of [cx + 3, cx + 11]) {
    const ey = base - bh - 3;
    for (let y = ey - 3; y <= ey + 2; y++) for (let x = ex - 3; x <= ex + 3; x++) { const d = Math.hypot(x - ex, (y - ey) * 1.1); if (d < 3.2) { L.sn(x, y, d > 2.4 ? C[3] : pick(E, 2.8 - d * 0.5), (x - ex) / 3, -(y - ey) / 3, 0.7); if (d <= 2.4) L.g(x, y, pick(E, 1.6)); } }
    for (let y = ey - 1; y <= ey + 1; y++) L.set(ex, y, hex('#120a02'));
  }
  // front legs (splayed)
  for (const fx of [cx + 4, cx + 14]) { for (let y = base - 6; y <= base; y++) { const sx = fx + (y - (base - 6)) * 0.4; L.sn(sx, y, C[5], -0.3, 0.2, 0.9); L.sn(sx + 1, y, C[6], 0.2, 0.2, 0.9); L.sn(sx + 2, y, C[4], 0.6, 0, 0.8); } for (const tx of [-1, 1, 3, 5]) L.sn(fx + 2 + tx, base, C[6], 0, 1, 0.6); }
  // lily-pad hat with a tiny flower (the appeal beat)
  const hy = base - bh - 6;
  for (let x = cx - 8; x <= cx + 2; x++) for (let y = hy - 1; y <= hy + 1; y++) if (Math.hypot((x - (cx - 3)) / 6, (y - hy) / 1.6) < 1 && !(x > cx - 3 && y === hy - 1 && x < cx)) L.sn(x, y, pick(PAL.NMOSS, y === hy - 1 ? 4 : 3), 0, 1, 0.4);
  L.sn(cx - 4, hy - 2, hex('#f0d8e8'), 0, 1, 0.5); L.sn(cx - 3, hy - 3, hex('#ffffff'), 0, 1, 0.5); L.sn(cx - 2, hy - 2, hex('#f0d8e8'), 0, 1, 0.5); L.sn(cx - 3, hy - 2, hex('#ffe080'), 0, 1, 0.5);
  return L.finish({ outline: [8, 10, 4], flip: true, bulge: 1.0 });
}

/**
 * SDF shape painter: union of ellipses and tapered capsules -> shaded pixels with an outward normal from the SDF
 * gradient (moon from the upper left). Used for organic animal silhouettes (the wolf).
 */
const sdEll = (x, y, cx, cy, rx, ry) => { const k = Math.hypot((x - cx) / rx, (y - cy) / ry); return (k - 1) * Math.min(rx, ry); };
const sdCap = (x, y, ax, ay, bx, by, ra, rb) => { const dx = bx - ax, dy = by - ay; const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) - lerp(ra, rb, t); };
function paintSdf(L, w, h, sd, shade) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = sd(x + 0.5, y + 0.5);
    if (d > 0) continue;
    const gx = sd(x + 1.5, y + 0.5) - sd(x - 0.5, y + 0.5), gy = sd(x + 0.5, y + 1.5) - sd(x + 0.5, y - 0.5);
    const gl = Math.hypot(gx, gy) || 1, nx = gx / gl, ny = gy / gl; // outward, image coords (y down)
    const edge = clamp(1 + d / 3.2, 0, 1); // 1 at the rim, 0 deep inside
    shade(x, y, nx, ny, edge, -d);
  }
}

/** Gloom Wolf: the elite. A lean stalking wolf: pointed ears, long muzzle, deep chest, shaggy ruff, ember eye,
 *  a broken gold chain collar. 54 x 34 px. pose: 'idle' | 'howl' (head up, the telegraph) | 'atk' (lunge). */
export function makeWolf(phase = 0, pose = 'idle') {
  const w = 54, h = 34, L = Layer(w, h), C = PAL.WOLF, E = PAL.EMBER, G = PAL.GOLD;
  const howl = pose === 'howl', atk = pose === 'atk';
  const br = Math.sin(phase) * 0.4;
  // head pose
  const hx = atk ? 44 : 41, hy = howl ? 6 : atk ? 13 : 11.5;
  const mA = howl ? [hx + 3, hy - 1] : [hx + 3, hy + 1], mB = howl ? [hx + 8, hy - 6] : atk ? [hx + 10, hy + 2] : [hx + 9, hy + 3];
  const fur = (x, y) => (hash(x | 0, (y | 0) * 3) - 0.5) * 0.9;
  const legs = (x, y, far) => {
    const o = far ? 2.5 : 0;
    const fl = atk ? [[33 + o, 21], [38 + o, 31]] : [[32 + o, 21], [32.5 + o, 31]];
    const bl1 = atk ? [[14 + o, 19], [9 + o, 25]] : [[14 + o, 19], [12 + o, 25.5]], bl2 = atk ? [[9 + o, 25], [6 + o, 31]] : [[12 + o, 25.5], [14 + o, 31]];
    return Math.min(
      sdCap(x, y, fl[0][0], fl[0][1], fl[1][0], fl[1][1], 2.4, 1.3),
      sdCap(x, y, bl1[0][0], bl1[0][1], bl1[1][0], bl1[1][1], 3.0, 1.5),
      sdCap(x, y, bl2[0][0], bl2[0][1], bl2[1][0], bl2[1][1], 1.5, 1.2),
    );
  };
  const body = (x, y) => {
    let d = Math.min(
      sdEll(x, y, 23, 15.5 + br, 12, 5.6),          // barrel
      sdEll(x, y, 32, 15.5 + br, 6.4, 7.0),         // deep chest
      sdEll(x, y, 14, 15 + br, 6.2, 5.8),           // haunch
      sdCap(x, y, 32, 13, hx - 1, hy, 5.8, 4.0),    // neck
      sdEll(x, y, hx, hy, 5.0, 4.2),                // skull
      sdCap(x, y, mA[0], mA[1], mB[0], mB[1], 2.7, 1.5), // muzzle
      sdCap(x, y, 10, 13, 5, 17, 3.2, 3.4),         // tail root
      sdCap(x, y, 5, 17, 3.5, 25, 3.4, 1.4),        // tail brush, hanging low
    );
    // ears: two thin capsules pointing up and back
    const ex = howl ? -1 : 0;
    d = Math.min(d, sdCap(x, y, hx - 2 + ex, hy - 3, hx - 4 + ex, hy - 9, 1.8, 0.4), sdCap(x, y, hx + 1 + ex, hy - 3, hx, hy - 9, 1.6, 0.4));
    // shaggy ruff + back fur: jagged tufts on the top and the throat
    if (y < 16 && x > 20 && x < hx) d -= Math.max(0, Math.sin(x * 1.3 + y * 0.4) * 1.3 + fur(x, y));
    if (x > 30 && x < 38 && y > 14) d -= Math.max(0, Math.sin(y * 1.6 + x) * 1.2);
    return d;
  };
  // far legs first (darker), then the body + near legs
  paintSdf(L, w, h, (x, y) => legs(x, y, true), (x, y, nx, ny, edge) => {
    L.sn(x, y, pick(C, 2.2 - ny * 0.8 + fur(x, y) - edge * 0.6), nx * edge, -ny * edge, 1 - edge * 0.5);
  });
  paintSdf(L, w, h, (x, y) => Math.min(body(x, y), legs(x, y, false)), (x, y, nx, ny, edge, depth) => {
    // moonlit back, dark belly; fur strokes as short diagonal streaks
    const lit = (-nx * 0.45 - ny * 0.9);
    let l = 3.7 + lit * 2.1 * edge - (y > 18 ? (y - 18) * 0.12 : 0) + fur(x, y) + bayer(x, y) * 0.5;
    if (((x + y * 2) % 5 === 0) && depth > 1.2) l -= 0.9;
    L.sn(x, y, pick(C, l), nx * edge * 0.95, -ny * edge * 0.95, Math.sqrt(Math.max(0.05, 1 - edge * edge * 0.9)));
  });
  // nose, jaw line, teeth when lunging
  L.set(mB[0] + 0.5, mB[1] - 0.5, hex('#06060a')); L.set(mB[0] - 0.5, mB[1] - 0.5, hex('#0a0b10'));
  for (let k = 0; k < 6; k++) { const t = k / 6; L.set(lerp(mA[0], mB[0], t), lerp(mA[1], mB[1], t) + 1.6, C[1]); }
  if (atk) for (let k = 1; k < 6; k += 2) L.set(lerp(mA[0], mB[0], k / 6), lerp(mA[1], mB[1], k / 6) + 1.2, hex('#e8e4d8'));
  // ember eye with a hot core
  L.e(hx + 1.5, hy - 1, E[2]); L.e(hx + 2.5, hy - 1, E[3]); L.e(hx + 1.5, hy, E[1]);
  // broken gold chain collar: links round the neck, a loose end hanging
  for (let k = 0; k < 6; k++) { const t = k / 5, x = lerp(hx - 7, hx - 3, t), y = lerp(hy + 2, hy + 6, t) + (k % 2) * 0.5; L.sn(x, y, k % 2 ? G[2] : G[3], 0, 0.6, 0.8); }
  for (let k = 0; k < 5; k++) L.sn(hx - 5.5 + (k % 2) * 0.5, hy + 6 + k, k % 2 ? G[1] : G[2], 0, 0, 1);
  return L.finish({ outline: [3, 3, 8], flip: true, bulge: 0.9 });
}

// ------------------------------------------------------------------ THE WHISPERING WILLOW (multi-part)
/**
 * Core: trunk + face + root beard. 112 x 132 px, anchor at the root collar. `state`:
 *  'p1' (eyes half-lidded violet), 'spell' (mouth open, glyph cracks blazing), 'riddle' (eyes teal-gold, calm),
 *  'freed' (eyes closed, faint smile, no violet).
 */
export function makeWillowCore(state = 'p1') {
  const w = 112, h = 132, L = Layer(w, h), P = PAL.WBARK, V = PAL.HUSHV, T = PAL.HUSHT;
  const base = h - 2, cx = 56;
  // roots spreading on the ground
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 ? 1 : -1, len = 22 + (i >> 1) * 7, sx = cx + dir * (10 + (i >> 1) * 3);
    const pts = []; for (let k = 0; k <= 7; k++) { const t = k / 7; pts.push([sx + dir * t * len, base - 18 * (1 - t) * (1 - t) + Math.sin(t * 6 + i) * 1.2]); }
    limb(L, pts, 10 - (i >> 1), 2, P, { groove: true, base: 2.4 });
  }
  // the trunk: massive, a twisted column that splits into two boughs at the top
  const top = 18;
  for (let y = top; y <= base; y++) {
    const t = (base - y) / (base - top);
    const flare = Math.pow(Math.max(0, 0.25 - t) / 0.25, 1.8) * 22;
    const hw = 21 - t * 4 + flare + Math.sin(y * 0.21) * 0.8;
    const sx = cx + Math.sin(t * 2.2) * 3;
    for (let xx = -hw; xx <= hw; xx += 0.5) {
      const q = xx / hw, X = Math.round(sx + xx);
      const gro = Math.sin(xx * 0.42 - y * 0.16) > 0.78 ? -1.3 : 0;
      let l = 3.4 - q * 1.5 + gro + (hash(X >> 1, y >> 2) - 0.5) * 1.0 + bayer(X, y) * 0.7;
      if (Math.abs(q) > 0.9) l -= 1;
      L.sn(X, y, pick(P, l), q * 0.95, 0.05, Math.sqrt(Math.max(0.05, 1 - q * q)));
    }
  }
  // two great boughs leaving the frame top-left and top-right
  for (const s of [-1, 1]) { const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([cx + s * (8 + t * 46), top + 14 - t * 22 + t * t * 6]); } limb(L, pts, 15, 7, P, { groove: true, base: 2.9 }); }
  // the face, carved in the bark at the upper third
  const fy = 52, eyeY = fy, mouthY = fy + 20;
  const eyeCol = state === 'riddle' ? [T[2], T[3], hex('#ffe08a')] : state === 'freed' ? null : [V[2], V[3], V[5]];
  for (const s of [-1, 1]) {
    const ex = cx + s * 10;
    // brow ridge: a heavy bark shelf
    for (let k = -7; k <= 7; k++) { const by = eyeY - 6 - Math.round(Math.abs(k) * 0.25) + (s * k > 0 ? 1 : 0); L.sn(ex + k, by, P[6], 0, 1, 0.4); L.sn(ex + k, by + 1, P[5], 0, 0.6, 0.6); L.sn(ex + k, by + 2, P[1], 0, -0.6, 0.6); }
    // socket
    for (let y = eyeY - 3; y <= eyeY + 3; y++) for (let x = ex - 6; x <= ex + 6; x++) { const d = Math.hypot((x - ex) / 6, (y - eyeY) / 3.4); if (d < 1) L.sn(x, y, d > 0.7 ? P[1] : hex('#050308'), 0, 0, 1); }
    if (eyeCol) {
      const lid = state === 'p1' ? 1 : 0; // half-lidded in phase 1
      for (let y = eyeY - 1 + lid; y <= eyeY + 1; y++) for (let x = ex - 3; x <= ex + 3; x++) { const d = Math.hypot((x - ex) / 3.4, (y - eyeY) / 1.6); if (d < 1) L.e(x, y, d < 0.45 ? eyeCol[2] : d < 0.75 ? eyeCol[1] : eyeCol[0]); }
    } else {
      for (let k = -4; k <= 4; k++) L.sn(ex + k, eyeY + Math.round(k * k * 0.06), P[0], 0, 0, 1); // peacefully closed
    }
  }
  // nose: a knot ridge
  for (let y = eyeY + 1; y <= eyeY + 12; y++) { L.sn(cx - 1, y, P[2], -0.6, 0, 0.8); L.sn(cx, y, P[6], 0.2, 0, 1); L.sn(cx + 1, y, P[5], 0.6, 0, 0.8); }
  for (let k = -3; k <= 3; k++) L.sn(cx + k, eyeY + 13, P[4], 0, 1, 0.5);
  // mouth: a long crack (p1/riddle), a gaping glowing O (spell) or a soft smile (freed)
  if (state === 'spell') {
    for (let y = mouthY - 4; y <= mouthY + 6; y++) for (let x = cx - 9; x <= cx + 9; x++) { const d = Math.hypot((x - cx) / 9, (y - mouthY - 1) / 5.5); if (d < 1) { if (d > 0.82) L.sn(x, y, P[1], 0, 0, 1); else L.e(x, y, pick(V, 5 - d * 4.2)); } }
  } else if (state === 'freed') {
    for (let k = -8; k <= 8; k++) L.sn(cx + k, mouthY + Math.round((64 - k * k) * 0.035), P[0], 0, 0, 1);
  } else {
    for (let k = -10; k <= 10; k++) { const y = mouthY + Math.round(Math.sin(k * 0.6) * 1.2); L.sn(cx + k, y, hex('#040306'), 0, 0, 1); L.sn(cx + k, y + 1, P[1], 0, 0, 1); if (state === 'p1' && Math.abs(k) < 6 && k % 3 === 0) L.e(cx + k, y, V[1]); }
  }
  // hush glyph cracks running up the bark (emissive; bright in 'spell', dim in 'p1', teal in 'riddle', gone when freed)
  if (state !== 'freed') {
    const gc = state === 'riddle' ? T : V, gi = state === 'spell' ? 3 : state === 'riddle' ? 1 : 1;
    const crack = (x0, y0, len, dir) => { let x = x0; for (let k = 0; k < len; k++) { x += (hash(k, x0) - 0.5) * 1.6 + dir * 0.3; L.e(x, y0 - k, gc[clamp(gi - (k % 7 === 0 ? 1 : 0), 0, gc.length - 1)]); if (k % 9 === 4) L.e(x + dir, y0 - k, gc[gi]); } };
    crack(cx - 16, base - 10, 34, -0.2); crack(cx + 15, base - 14, 30, 0.2); crack(cx - 5, base - 6, 18, 0); crack(cx + 6, mouthY + 10, 14, 0.3);
  }
  // root beard under the chin
  for (let i = 0; i < 12; i++) strand(L, cx - 11 + i * 2 + hash(i, 4) * 1.5, mouthY + 6, 8 + hash(i, 5) * 16, P, i, 1, 1);
  return L.finish({ ax: cx, ay: h, bulge: 1.3 });
}
/**
 * A weeping frond curtain (one of several that hang from the boughs). Hang. ~60 x 140 px.
 * Bundled, not uniform: 5-7 BUNDLES of 4-7 strands with real gaps between them, a leafy canopy band at the top,
 * tapered tips, moonlight catching the outer strands and the lower half. `tint`: 'silver' | 'hush' | 'gold' | 'bloom'.
 */
export function makeWillowFronds(seed = 1, tint = 'silver', wd = 60, ht = 140) {
  const r = RNG(seed), L = Layer(wd, ht);
  const P = tint === 'gold' ? pal(['#160e06', '#2a1a0a', '#4a2e10', '#70461a', '#9a6424', '#c48a34', '#e8b24e', '#ffd878', '#fff0b0'])
    : tint === 'hush' ? pal(['#0a0818', '#141030', '#201a48', '#2c2666', '#3a3a80', '#4e589a', '#6a7cb4', '#90a4d0', '#c4d0f0'])
      : PAL.WLEAF;
  // canopy band: overlapping small clumps along the top edge (the bough's leaf mass)
  for (let i = 0; i < 7; i++) clump(L, (i + 0.5) * wd / 7 + (r() - 0.5) * 4, 5 + r() * 4, 7 + r() * 4, 4 + r() * 2, P, seed * 13 + i, -0.6);
  const nb = Math.max(4, Math.round(wd / 10));
  for (let b = 0; b < nb; b++) {
    const bx = (b + 0.5) * wd / nb + (r() - 0.5) * 5, blen = ht * (0.5 + r() * 0.5), ns = 4 + (r() * 4 | 0), ph = r() * 6, bsw = 1.5 + r() * 2.5;
    for (let j = 0; j < ns; j++) {
      const off = (j - (ns - 1) / 2) * 1.4 + (r() - 0.5) * 0.8, outer = Math.abs(j - (ns - 1) / 2) / ((ns - 1) / 2 || 1);
      const len = blen * (1 - outer * 0.3) * (0.85 + r() * 0.15);
      for (let s = 4; s < len; s++) {
        const t = s / len, x = bx + off * (1 + t * 0.4) + Math.sin(s * 0.045 + ph) * bsw * t;
        const lit = (off < 0 ? 0.9 : 0) + t * 1.6 - outer * 0.3;
        L.sn(x, s, pick(P, 1.6 + lit * 0.6 + hash(b * 7 + j, s >> 2) * 0.6), off < 0 ? -0.4 : 0.3, 0.2, 0.9);
        // leaves: 2-3 px slivers angled down and out, denser near the top, sparser at the tip
        if (s % 2 === 0 && hash(j * 31 + b, s) > t * 0.55) {
          const d = (s >> 1) % 2 ? 1 : -1, ll = 2 + (hash(b, s + j) * 2 | 0);
          for (let k = 1; k <= ll; k++) L.sn(x + d * k * 0.7, s + k, pick(P, 2.4 + lit + (k === ll ? 0.8 : 0) + bayer(x | 0, s) * 0.6), d * 0.6, 0.3, 0.75);
        }
        if (tint === 'bloom' && hash(b * 5 + j, s) > 0.975) { L.e(x + 1, s, hex('#ffcce4')); L.e(x, s + 1, hex('#ffe8f4')); L.e(x + 1, s + 1, hex('#fff6a0')); }
        if (tint === 'hush' && hash(b * 5 + j, s) > 0.985) L.e(x, s, PAL.HUSHV[3]);
      }
    }
  }
  return L.finish({ ax: wd / 2, ay: 0, hang: 1, bulge: 0.5 });
}
/** Riddle leaf: the plate carrier. 22 x 14 px; tint 'neutral' | 'bloom' | 'wither'. */
export function makeRiddleLeaf(tint = 'neutral') {
  const w = 22, h = 14, L = Layer(w, h);
  const P = tint === 'bloom' ? pal(['#2a6a1a', '#4aa030', '#8ae050', '#d8ff9a', '#ffffe0']) : tint === 'wither' ? pal(['#2a1a10', '#4a2e1a', '#6a4426', '#8a5e36', '#a87a4a']) : pal(['#5a4a12', '#9a7a1e', '#d8a838', '#ffd870', '#fff0b8']);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = (y - h / 2) / (h / 2);
    const half = Math.sin(u * Math.PI) * (1 - u * 0.25);
    if (half < 0.05 || Math.abs(v) > half) continue;
    let l = 2.6 + (1 - Math.abs(v) / half) * 1.2 - v * 0.6;
    if (Math.abs(v) < 0.1) l += 1; // midrib
    if (Math.abs(Math.abs(v) - Math.abs(Math.sin(u * 14)) * 0.5 * half) < 0.06 && u > 0.1) l -= 0.8; // veins
    const c = pick(P, l + bayer(x, y) * 0.5);
    if (tint === 'wither') L.sn(x, y, c, 0, -v, 0.9); else L.e(x, y, c);
  }
  for (let k = 0; k < 3; k++) L.sn(k, h / 2 + k * 0.3, P[1], 0, 0, 1);
  return L.finish({ outline: [20, 14, 4], bulge: 0.4, ay: Math.round(h / 2 + 1) });
}

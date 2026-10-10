// @ts-nocheck
// biome-ignore-all lint: procedural pixel-art code (same convention as proceduralArt.ts / ch2Props.ts / prologueArt.ts).
// biome-ignore-all format: see above.
/**
 * P2.2: the three Word Gate props of the prologue "The Unwriting" (docs/vfx/prologue-art-direction.md 2.4, interfaces 14.5).
 *
 *   prop.prologue.wordgate        the great carved arch. 192 x 200 texels (12 x 12.5 m), anchor at the foot centre. The letters
 *                                 are gold (#ffcf6a / #fff2c4) on recessed #241c16 cartouches and live on the GLOW layer, so
 *                                 the layout's `emis` (2.4) drives them; 40 glyphs on the arch (19) and the two pillars (11 each).
 *   prop.prologue.runestone.0-2   standing stones with a short column of the same lit letters.
 *   prop.prologue.sword           the knight's sword stuck in the ground (the fall beat).
 * Every prop has a `.flip` twin (image, glow and normal.x mirrored), the ch2Props convention.
 *
 * Authored normals: flat front faces (+z), bevels and the arch intrados lean to the sides, so the key (a low sun BEHIND the
 * gate) and the camera fill read the stone as carved volume instead of a flat cut-out. A warm rim runs along the outer edge
 * (the storm sun's halo) and the edge facing the opening is the brightest, like the real backlight.
 * No moss and no vines: the gate is dry, dead stone (the grade cannot turn green gold; see the art direction, ruling 2).
 */
import { bayer, clamp, flipFrame, hash, hex, Layer, pal, pick } from "./ch2Props";
import type { SpriteFrame } from "./SpriteSource";

type Anims = Record<string, SpriteFrame[]>;

// ------------------------------------------------------------------ palette (sRGB)
/** Dry warm ruin stone, dark to light. */
const GSTONE = pal(["#1b1816", "#2a2622", "#3c372f", "#524b40", "#6c6455", "#8a806c", "#aa9c80"]);
const CART = hex("#241c16");
const CART_LIT = hex("#4a3a2c");
const CART_DEEP = hex("#120d0a");
const LGOLD = hex("#ffcf6a");
const LHI = hex("#fff2c4");
const LLOW = hex("#d49a30");
const RIM_WARM = pal(["#8a5a2c", "#c88a44", "#f0b868", "#ffd890"]);
const STEEL = pal(["#1c2028", "#343c4a", "#566074", "#8a96ae", "#c4d0e4", "#f0f6ff"]);
const HGOLD = pal(["#4a3208", "#8a5e14", "#c8921e", "#f0c85a", "#fff0a8"]);
const LEATHER = pal(["#1a0e0a", "#2e1a12", "#48281a", "#68402a"]);
const DIRT = pal(["#3a2c20", "#54402c", "#745a3c", "#957852"]);

// ------------------------------------------------------------------ 5 x 7 letter font (only the glyphs the gate spells)
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
};

/** Carve one recessed cartouche (8 x 10) with a lit glyph at cell centre (cx, cy). Returns nothing; draws on `L`. */
function glyphCell(L, cx, cy, ch, lit = 1) {
  const g = FONT[ch];
  const x0 = Math.round(cx) - 4, y0 = Math.round(cy) - 5;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) {
    // recess: dark floor, a deeper top/left shadow, a lit bottom/right lip (carved INTO the stone)
    const c = y === 0 || x === 0 ? CART_DEEP : y === 9 || x === 7 ? CART_LIT : CART;
    const nx = x === 0 ? 0.7 : x === 7 ? -0.7 : 0, ny = y === 0 ? -0.7 : y === 9 ? 0.7 : 0;
    L.sn(x0 + x, y0 + y, c, nx, ny, 0.8);
  }
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
    if (g[gy][gx] !== "1") continue;
    const px = x0 + 1 + gx + 1, py = y0 + 1 + gy + 1; // 8 x 10 cell: the 5 x 7 glyph sits in the 6 x 8 floor, 1 px from the lip
    const top = gy === 0 || g[gy - 1][gx] !== "1";
    const c = lit > 0.5 ? (top ? LHI : (gx + gy) % 3 === 0 ? LLOW : LGOLD) : LLOW;
    L.e(px, py, c);
    L.n(px, py, 0, 0, 1);
  }
}

// ------------------------------------------------------------------ the Word Gate
const GW = 192, GH = 200, GCX = 96, ARC_CY = 88, R_IN = 56, R_OUT = 88;
/** The letters, in reading order. */
export const WORDGATE_TEXT = { arch: "THEFIRSTWORDWASHOPE", left: "FIREANDWORD", right: "HOPEINSTEAD" } as const;
const PITCH = 11;

/**
 * Where every lit letter sits in the gate sprite, in texels from the top-left of the image (`x`, `y` = the cell centre), sorted
 * left to right (the `gateDarken` order). The cutscene VFX reads this to dim letters one by one.
 */
export function wordgateLetters() {
  const out = [];
  const mid = (R_IN + R_OUT) / 2; // 72: the middle of the arch band
  // arch: equal arc length steps along the mid radius, left springer to right springer
  const n = WORDGATE_TEXT.arch.length;
  const arcLen = Math.PI * mid;
  const step = arcLen / n;
  for (let i = 0; i < n; i++) {
    const ang = Math.PI - ((i + 0.5) * step) / mid; // pi .. 0
    out.push({ x: GCX + Math.cos(ang) * mid, y: ARC_CY - Math.sin(ang) * mid, ch: WORDGATE_TEXT.arch[i], part: "arch" });
  }
  // pillars: top to bottom, between the springer and the plinth
  const y0 = ARC_CY + 12, span = GH - 24 - y0;
  for (const [side, text] of [[-1, WORDGATE_TEXT.left], [1, WORDGATE_TEXT.right]]) {
    const m = text.length;
    for (let i = 0; i < m; i++) out.push({ x: GCX + side * mid, y: y0 + ((i + 0.5) * span) / m, ch: text[i], part: side < 0 ? "left" : "right" });
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

/** Is (x, y) stone, and its distance in from the nearest face (for bevels)? Returns { s, d, side, rad } or null. */
function gateShape(x, y) {
  const dx = x - GCX;
  const ax = Math.abs(dx);
  if (y >= GH - 10) return ax <= 96 ? { s: 1, d: Math.min(96 - ax, GH - y - 1), side: dx < 0 ? -1 : 1, plinth: 1 } : null;
  if (y >= GH - 22) { // base mouldings
    const lo = 52, hi = 92;
    return ax >= lo && ax <= hi ? { s: 1, d: Math.min(ax - lo, hi - ax), side: dx < 0 ? -1 : 1, plinth: 1 } : null;
  }
  if (y < ARC_CY) {
    const dy = y - ARC_CY;
    const r = Math.hypot(dx, dy);
    if (r < R_IN || r > R_OUT) return null;
    return { s: 1, d: Math.min(r - R_IN, R_OUT - r), side: r - R_IN < R_OUT - r ? 0 : 1, rad: [dx / r, dy / r], r };
  }
  if (ax < R_IN || ax > R_OUT) return null;
  return { s: 1, d: Math.min(ax - R_IN, R_OUT - ax), inner: ax - R_IN < R_OUT - ax, side: dx < 0 ? -1 : 1 };
}

export function makeWordGate(seed = 7) {
  const L = Layer(GW, GH);
  // fractured top: a bite out of the upper right of the arch and a chipped left shoulder (the gate is old, not a ruin)
  const broken = (x, y) => {
    const dx = x - GCX;
    if (dx > 28 && dx < 62 && y < 30 + (hash(x >> 1, seed) * 7 | 0) - (dx - 28) * 0.18) return hash(x >> 2, y >> 2) < 0.92;
    if (dx < -50 && y < 54 && y > 38 && hash(x, y >> 1) < 0.05) return true;
    return false;
  };
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const sh = gateShape(x, y);
    if (!sh || broken(x, y)) continue;
    const dx = x - GCX;
    // course seams: horizontal courses on the pillars and plinth; radial voussoirs on the arch
    let seam = false, blk = 0;
    if (sh.rad) {
      const ang = Math.atan2(y - ARC_CY, dx); // -pi .. 0 on the arch
      const k = (ang + Math.PI) * 11.5 / Math.PI; // 11 voussoirs
      blk = Math.floor(k);
      seam = Math.abs(k - Math.round(k)) < 0.045 * (R_OUT / Math.max(sh.r, 1)) && Math.round(k) > 0 && Math.round(k) < 11.5;
    } else if (!sh.plinth) {
      const row = Math.floor((y - ARC_CY) / 14);
      blk = row * 7 + (sh.inner ? 1 : 0);
      seam = (y - ARC_CY) % 14 === 0 || ((x + (row & 1) * 11) % 32 === 0 && hash(x >> 3, row) < 0.35);
    } else {
      seam = y % 12 === 0 || (x + Math.floor(y / 12) * 9) % 24 === 0;
      blk = Math.floor(y / 12) * 5 + Math.floor((x + Math.floor(y / 12) * 9) / 24);
    }
    // lighting from upper left (the camera fill), authored normals
    let nx = 0, ny = 0, nz = 1;
    const bev = sh.d < 4 ? (4 - sh.d) / 4 : 0;
    if (sh.rad) {
      const sgn = sh.side === 0 ? -1 : 1; // 0 = nearest the opening: normal points into the opening
      nx = -sh.rad[0] * sgn * bev * 0.9; ny = -sh.rad[1] * sgn * bev * 0.9;
    } else if (!sh.plinth) {
      nx = (sh.inner ? -sh.side : sh.side) * bev * 0.9;
    } else {
      ny = sh.d < 2 && y < GH - 4 ? -0.8 : 0; nx = sh.d < 3 ? sh.side * 0.7 : 0;
    }
    let l = 3.2 + (-nx * 0.9 - ny * 0.7) * 1.1 + (hash(blk, seed) - 0.5) * 1.1 + (hash(x >> 1, y >> 2) - 0.5) * 0.7 + bayer(x, y) * 0.7 - 0.35;
    // weathering: darker streaks down from the arch, sunbaked pale patches on the pillar faces
    l -= Math.max(0, hash(x >> 2, seed + 3) - 0.78) * 2.2 * ((y % 80) / 80);
    if (hash(x >> 1, (y >> 1) + seed) < 0.05) l -= 0.9;
    if (bev > 0.5) l -= 0.5;
    let c = pick(GSTONE, l);
    if (seam) { c = GSTONE[0]; nx = 0; ny = 0; }
    L.sn(x, y, c, nx, ny, nz);
  }
  // cracks
  for (let i = 0; i < 6; i++) {
    let x = 20 + hash(i, seed) * 150, y = 8 + hash(i, seed + 1) * 170;
    const dirx = hash(i, seed + 2) < 0.5 ? -1 : 1, len = 8 + hash(i, 3) * 14;
    for (let k = 0; k < len; k++) { x += dirx * (0.4 + hash(k, i) * 0.6); y += 0.9; if (L.a(x, y)) L.sn(x, y, GSTONE[0], 0, 0, 1); }
  }
  // letters: recessed cartouches with lit glyphs (over the stone, before the rim)
  const letters = wordgateLetters();
  for (const g of letters) glyphCell(L, g.x, g.y, g.ch);
  // the storm sun is BEHIND the gate: a warm rim on the whole outer edge, brightest on the edge that faces the opening
  const src = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) src[y * GW + x] = L.a(x, y) ? 1 : 0;
  const A = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && src[y * GW + x] === 1;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!A(x, y)) continue;
    const open = !A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1);
    if (!open) continue;
    const dx = x - GCX, inward = Math.abs(dx) < 70 || y < ARC_CY && Math.hypot(dx, y - ARC_CY) < 64;
    const k = inward ? 2.6 : 1.4;
    L.sn(x, y, pick(RIM_WARM, k + hash(x, y) * 0.9), dx < 0 ? 0.5 : -0.5, -0.4, 0.8);
  }
  return L.finish({ ax: GCX, ay: GH - 1, bulge: 1.0 });
}

// ------------------------------------------------------------------ runestones
/** A standing slab of dry stone with a column of lit glyphs. `text` letters, top to bottom. */
export function makeRunestone(seed, w, h, text, lean = 0) {
  const L = Layer(w + 8, h + 4);
  const W = w + 8, cx = W / 2;
  const top = (x) => 6 + Math.abs(hash(Math.floor((x + seed) / 5), seed)) * 7 + Math.abs((x - cx) / (w / 2)) ** 2.2 * 12;
  for (let y = 0; y < h + 3; y++) for (let x = 0; x < W; x++) {
    const t = y / (h + 3);
    const hw = (w / 2) * (0.82 + t * 0.2) + (hash(y >> 2, seed) - 0.5) * 2;
    const x0 = cx + lean * (1 - t) * 3;
    const rel = (x - x0) / hw;
    if (Math.abs(rel) > 1 || y < top(x)) continue;
    const edge = Math.min(1 - Math.abs(rel), 1) * hw;
    const bev = edge < 3 ? (3 - edge) / 3 : 0;
    const nx = Math.sign(rel) * bev * 0.9;
    let l = 3.0 - rel * 0.6 - nx * 0.8 + (hash(x >> 1, y >> 2 ^ seed) - 0.5) * 0.9 + bayer(x, y) * 0.6 - 0.3;
    if (y % 13 === 0 && hash(x >> 2, y) < 0.5) l -= 1.2;
    if (bev > 0.5) l -= 0.4;
    L.sn(x, y, pick(GSTONE, l), nx, y < top(x) + 2 ? -0.6 : 0, 1);
  }
  const n = text.length, y0 = top(cx) + 12, span = h - 14 - y0;
  for (let i = 0; i < n; i++) glyphCell(L, cx + lean * (1 - (y0 + (i + 0.5) * span / n) / h) * 3, y0 + (i + 0.5) * span / n, text[i]);
  // backlight rim
  const w2 = W, h2 = h + 4;
  const filled = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) filled[y * w2 + x] = L.a(x, y) ? 1 : 0;
  const A = (x, y) => x >= 0 && y >= 0 && x < w2 && y < h2 && filled[y * w2 + x] === 1;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) if (A(x, y) && (!A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1))) L.sn(x, y, pick(RIM_WARM, 1.4 + hash(x, y) * 1.6), x < cx ? 0.5 : -0.5, -0.4, 0.8);
  // dirt base
  for (let y = h - 1; y < h + 3; y++) for (let x = 2; x < W - 2; x++) if (!L.a(x, y) && hash(x, y + seed) < 0.8) L.sn(x, y, pick(DIRT, 1 + hash(x, y) * 2.5), 0, 1, 0.6);
  return L.finish({ ax: cx, ay: h + 3, bulge: 1.1 });
}

// ------------------------------------------------------------------ the knight's sword
/** The sword planted point-down, a few degrees off true. 28 x 64: blade, cross-guard, wrapped grip, pommel, a dirt mound. */
export function makeSword() {
  const W = 28, H = 64, L = Layer(W, H), cx = 14, lean = 0.1;
  const px = (y) => cx + (H - 6 - y) * lean * -0.4;
  for (let y = 18; y < H - 6; y++) { // blade, point down into the ground at y = H - 6
    const t = (y - 18) / (H - 24), hw = t > 0.82 ? Math.max(0, (1 - t) / 0.18) * 2.4 : 2.4;
    for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x++) {
      if (Math.abs(x) > hw) continue;
      const rel = x / Math.max(hw, 0.5);
      const fuller = Math.abs(x) < 0.7 && t < 0.7;
      L.sn(px(y) + x, y, fuller ? STEEL[2] : pick(STEEL, rel < -0.2 ? 4.4 : rel > 0.4 ? 1.6 : 3 - rel), rel * 0.8, 0, 0.7);
    }
  }
  const gx = px(18);
  for (let x = -9; x <= 9; x++) for (let y = 15; y < 19; y++) { // cross-guard
    const taper = Math.abs(x) > 6 ? 1 : 0;
    if (taper && y === 15) continue;
    L.sn(gx + x, y + (Math.abs(x) > 7 ? 1 : 0), pick(HGOLD, y === 15 ? 3.6 : y === 18 ? 1.0 : 2.4 + (x < 0 ? 0.6 : -0.3)), x / 9 * 0.6, y === 15 ? -0.6 : 0.2, 0.8);
  }
  for (let y = 5; y < 15; y++) for (let x = -1; x <= 1; x++) L.sn(gx + x, y, pick(LEATHER, 1.6 + (x < 0 ? 0.9 : 0) + ((y + x) % 3 === 0 ? -0.8 : 0.3)), x * 0.6, 0, 0.8); // wrapped grip
  for (let y = 1; y < 5; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(y - 3) <= 3) L.sn(gx + x, y, pick(HGOLD, 2.2 + (x < 0 ? 1.2 : -0.4) + (y === 1 ? 1 : 0)), x * 0.4, y < 3 ? -0.5 : 0.3, 0.8); // pommel
  for (let y = H - 9; y < H; y++) for (let x = 2; x < W - 2; x++) { // dirt mound
    const mound = (H - 7) - Math.abs(x - cx) * 0.28 - hash(x, 7) * 1.5;
    if (y >= mound) L.sn(x, y, pick(DIRT, 1 + hash(x, y) * 2.4 + (y < mound + 1.5 ? 1 : 0)), 0, 1, 0.5);
  }
  // sun-side rim on the blade edge
  for (let y = 20; y < H - 8; y++) { const x = px(y) - 2.4; if (L.a(x, y)) L.sn(x, y, STEEL[5], -0.6, 0, 0.8); }
  return L.finish({ ax: cx, ay: H - 3, bulge: 0.9 });
}

// ------------------------------------------------------------------ registry
export function registerPrologueProps(table: Map<string, () => Anims>): void {
  const add = (key: string, make: () => SpriteFrame): void => {
    let base: SpriteFrame | null = null;
    const get = (): SpriteFrame => (base ??= make());
    table.set(`prop.prologue.${key}`, () => ({ idle: [get()] }));
    table.set(`prop.prologue.${key}.flip`, () => ({ idle: [flipFrame(get())] }));
  };
  add("wordgate", () => makeWordGate(7));
  add("runestone.0", () => makeRunestone(3, 36, 76, "FIRE", 1));
  add("runestone.1", () => makeRunestone(11, 30, 58, "WORD", -1));
  add("runestone.2", () => makeRunestone(19, 42, 50, "HOPE", 0));
  add("sword", () => makeSword());
}

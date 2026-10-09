// @ts-nocheck
// biome-ignore-all lint: verbatim port of the POC v2 procedural pixel-art generators (dense art code).
// biome-ignore-all format: see above.
/**
 * Procedural pixel-art generators, ported from poc/hd2d-poc-v2.html (sprite builder, hero, monsters,
 * chest, environment props, far backdrops). This is the FIRST SpriteSource implementation; Aseprite
 * atlases replace it later. Type checking is disabled for this one file on purpose: it is art code
 * ported verbatim, and the typed surface is `SpriteSource` in ./SpriteSource.ts.
 */
import type { ProceduralArt } from "./artTypes";

const PX = 1 / 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export function buildProceduralArt(): ProceduralArt {
function RNG(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mk(w, h, rf) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; return { c, x }; }

function bbox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { ax: Math.round((x0 + x1 + 1) / 2), ay: y1 + 1 };
}
function outline(c, col = [22, 12, 26]) {
  const w = c.width, h = c.height, o = mk(w + 2, h + 2);
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const od = o.x.createImageData(w + 2, h + 2);
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    const sx = x - 1, sy = y - 1;
    if (!A(sx, sy) && (A(sx - 1, sy) || A(sx + 1, sy) || A(sx, sy - 1) || A(sx, sy + 1))) {
      const i = (y * (w + 2) + x) * 4; od.data[i] = col[0]; od.data[i + 1] = col[1]; od.data[i + 2] = col[2]; od.data[i + 3] = 255;
    }
  }
  o.x.putImageData(od, 0, 0); o.x.drawImage(c, 1, 1); return o.c;
}
function padC(c) { const o = mk(c.width + 2, c.height + 2); o.x.drawImage(c, 1, 1); return o.c; }
function flipC(c) { const o = mk(c.width, c.height); o.x.translate(c.width, 0); o.x.scale(-1, 1); o.x.drawImage(c, 0, 0); return o.c; }

// normal map from alpha: distance-to-edge bulge + gentle global roundness.
function normalMapOf(c, bulge = 1, R = 3) {
  const w = c.width, h = c.height;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const H = new Float32Array(w * h);
  let minx = w, maxx = 0, miny = h, maxy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!A(x, y)) continue;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    let best = R + 1;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { if (!A(x + i, y + j)) { const dd = Math.hypot(i, j); if (dd < best) best = dd; } }
    const k = clamp(best / (R + 1), 0, 1); H[y * w + x] = Math.sqrt(1 - (1 - k) * (1 - k));
  }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, hw = Math.max(4, (maxx - minx) / 2), hh = Math.max(4, (maxy - miny) / 2);
  const o = mk(w, h); const id = o.x.createImageData(w, h); const D = id.data;
  const g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : H[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!A(x, y)) continue;
    let nx = (g(x - 1, y) - g(x + 1, y)) * 1.6 * bulge, ny = (g(x, y + 1) - g(x, y - 1)) * 1.6 * bulge;
    nx += (x - cx) / hw * 0.45 * bulge; ny += (cy - y) / hh * 0.25 * bulge;
    const nz = 1; const L = Math.hypot(nx, ny, nz);
    D[i] = Math.round((nx / L * 0.5 + 0.5) * 255); D[i + 1] = Math.round((ny / L * 0.5 + 0.5) * 255); D[i + 2] = Math.round((nz / L * 0.5 + 0.5) * 255); D[i + 3] = 255;
  }
  o.x.putImageData(id, 0, 0); return o.c;
}

function build(w, h, fn, flip) {
  const s = mk(w, h, 1), g = mk(w, h);
  const p = (x, y, ww, hh, c) => { s.x.fillStyle = c; s.x.fillRect(Math.round(x), Math.round(y), ww ?? 1, hh ?? 1); };
  const e = (x, y, ww, hh, c) => { p(x, y, ww, hh, c); g.x.fillStyle = c; g.x.fillRect(Math.round(x), Math.round(y), ww ?? 1, hh ?? 1); };
  fn(p, e);
  let img = outline(s.c), glow = padC(g.c);
  if (flip) { img = flipC(img); glow = flipC(glow); }
  return { img, glow, w: img.width, h: img.height };
}
function anchorSet(frames) { const a = bbox(frames[0].img); frames.forEach(f => { f.ax = a.ax; f.ay = a.ay; }); return frames; }
function pixelsOf(sp) {
  if (sp.px) return sp.px;
  const d = sp.img.getContext('2d').getImageData(0, 0, sp.w, sp.h).data, out = [];
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) { const i = (y * sp.w + x) * 4; if (d[i + 3]) out.push([x, y, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]); }
  return (sp.px = out);
}

// ---------------------------------------------------------------- hero
const HC = { skin: '#f6d1a8', skinD: '#d09670', hair: '#8a4520', hairL: '#c4722f', hairD: '#552511', tun: '#3f72b0', tunL: '#79aee6', tunD: '#284d7e', cape: '#b8343f', capeD: '#7a1f2c', belt: '#4d301b', gold: '#f3c552', pant: '#3c3554', pantD: '#29243b', boot: '#6a4026', bootD: '#40261a', steel: '#eef4fb', steelD: '#93a1b8', hilt: '#6b4a2a', eye: '#1c1626', scarf: '#efe2b4', scarfD: '#c7b47c' };
function heroFrame(o) {
  return build(38, 36, (p, e) => {
    const OX = 5, OY = 3, ln = o.lean || 0, bb = o.bob || 0, cp = o.cape || 0;
    const L = (x, y, w, h, c) => p(x + OX, y + OY, w, h, c);
    const U = (x, y, w, h, c) => p(x + OX + ln, y + OY + bb, w, h, c);
    const UE = (x, y, w, h, c) => e(x + OX + ln, y + OY + bb, w, h, c);
    const leg = (x, dx, c, b) => { for (let r = 0; r < 7; r++) L(x + Math.round(dx * r / 6), 21 + r, 3, 1, c); L(x + dx, 28, 4, 3, b); L(x + dx, 31, 4, 1, HC.bootD); };
    for (let r = 0; r < 12; r++) { const sx = Math.round(r * cp / 10); U(7 - sx, 13 + r, 4, 1, r > 8 ? HC.capeD : HC.cape); U(7 - sx, 13 + r, 1, 1, HC.capeD); }
    leg(10, o.lb || 0, HC.pantD, HC.bootD);
    U(9, 14, 2, 5, HC.tunD); U(9, 19, 2, 1, HC.skinD);
    leg(12, o.lf || 0, HC.pant, HC.boot);
    U(9, 13, 7, 8, HC.tun); U(9, 13, 2, 8, HC.tunD); U(14, 14, 1, 5, HC.tunL);
    U(8, 20, 9, 2, HC.tun); U(8, 21, 9, 1, HC.tunD);
    U(9, 19, 7, 1, HC.belt); U(13, 19, 1, 1, HC.gold);
    U(9, 12, 7, 2, HC.scarf); U(9, 13, 7, 1, HC.scarfD); U(6 - Math.round(cp / 2), 13, 3, 2, HC.scarf); U(5 - Math.round(cp / 2), 14, 2, 1, HC.scarfD);
    U(10, 5, 6, 6, HC.skin); U(10, 5, 1, 6, HC.skinD); U(11, 11, 4, 1, HC.skinD);
    U(9, 2, 8, 3, HC.hair); U(10, 1, 4, 1, HC.hair); U(9, 5, 2, 5, HC.hair); U(8, 3, 1, 4, HC.hairD); U(14, 5, 3, 1, HC.hair); U(16, 4, 1, 2, HC.hair); U(11, 2, 4, 1, HC.hairL); U(12, 1, 1, 1, HC.hairL); U(7, 4, 1, 2, HC.hairD);
    if (o.blink || o.hurt) U(14, 8, 2, 1, HC.eye); else { U(14, 7, 1, 2, HC.eye); U(15, 7, 1, 1, '#ffffff'); }
    U(12, 7, 1, 2, HC.skinD); U(16, 8, 1, 1, HC.skin);
    if (o.arm === 'raise') {
      U(14, 10, 2, 4, HC.tun); U(14, 8, 2, 2, HC.skin);
      U(13, 7, 3, 1, HC.gold);
      for (let i = 0; i < 10; i++) { U(13 - i, 6 - Math.floor(i * 0.6), 1, 1, HC.steel); U(13 - i, 7 - Math.floor(i * 0.6), 1, 1, HC.steelD); }
    } else if (o.arm === 'up') {
      U(14, 6, 2, 8, HC.tun); U(14, 4, 2, 2, HC.skin); U(13, 3, 4, 1, HC.gold);
      for (let i = 0; i < 9; i++) { UE(15, 2 - i, 1, 1, HC.steel); U(14, 2 - i, 1, 1, HC.steelD); }
    } else if (o.arm === 'slash') {
      U(15, 14, 4, 2, HC.tun); U(19, 14, 2, 2, HC.skin);
      U(21, 12, 1, 5, HC.gold);
      U(22, 14, 9, 1, HC.steel); U(22, 15, 8, 1, HC.steelD); U(31, 14, 1, 1, HC.steelD);
    } else if (o.arm === 'cast') {
      U(15, 12, 3, 2, HC.tun); U(18, 10, 2, 2, HC.skin);
      UE(19, 7, 3, 3, '#ffd27a'); UE(20, 8, 1, 1, '#ffffff');
      for (let i = 0; i < 8; i++) U(6 + i, 4 + i, 1, 1, i < 2 ? HC.hilt : HC.steelD);
    } else {
      U(14, 14, 2, 4, HC.tun); U(14, 14, 1, 4, HC.tunD); U(15, 18, 2, 2, HC.skin);
      U(16, 17, 1, 3, HC.hilt); U(15, 16, 1, 1, HC.gold); U(15, 20, 3, 1, HC.gold);
      for (let i = 0; i < 9; i++) { U(17 + Math.floor(i / 2), 21 + i, 1, 1, HC.steel); U(16 + Math.floor(i / 2), 21 + i, 1, 1, HC.steelD); }
    }
  });
}
const HERO = { idle: anchorSet([heroFrame({ arm: 'rest' }), heroFrame({ arm: 'rest', bob: 1, cape: 1 }), heroFrame({ arm: 'rest', bob: 1, cape: 1, blink: 1 })]) };
HERO.walk = [heroFrame({ lf: 2, lb: -2, cape: 3 }), heroFrame({ bob: 1, cape: 4 }), heroFrame({ lf: -2, lb: 2, cape: 3 }), heroFrame({ bob: 1, cape: 2 })];
HERO.raise = [heroFrame({ arm: 'raise', lf: 2, lb: -1, cape: 2 })];
HERO.slash = [heroFrame({ arm: 'slash', lean: 2, lf: 3, lb: -3, cape: 6 })];
HERO.cast = [heroFrame({ arm: 'cast', lf: 1, lb: -1, cape: 3 })];
HERO.hurt = [heroFrame({ arm: 'rest', lean: -1, hurt: 1, lf: -1, lb: 1, cape: 5 })];
HERO.win = [heroFrame({ arm: 'up', cape: 3, lf: 1, lb: -1 })];
['walk', 'raise', 'slash', 'cast', 'hurt', 'win'].forEach(k => HERO[k].forEach(f => { f.ax = HERO.idle[0].ax; f.ay = HERO.idle[0].ay; }));

// ---------------------------------------------------------------- monsters
const SLIME_ROWS = ['......aaaa......', '....aabbbbaa....', '...abccbbbbba...', '..abccbbbbbbba..', '..abcbbbbbbbba..', '.abbbbbbbbbbbba.', '.abbbbbebbbebba.', '.abbbbbebbbebba.', 'abbbbbbbbbbbbbda', 'abbbbbbbmmbbbdda', 'abbbbbbbbbbbddda', '.adddddddddddda.', '..aaaaaaaaaaaa..'];
function slimeSet(pal) {
  const P = { a: pal[0], b: pal[1], c: pal[2], d: pal[3], e: '#14202a', m: '#14202a' };
  const f0 = build(16, 13, p => SLIME_ROWS.forEach((r, y) => { for (let x = 0; x < 16; x++) if (r[x] !== '.') p(x, y, 1, 1, P[r[x]]); }), true);
  const f1 = build(18, 13, p => { for (let y = 0; y < 12; y++) for (let x = 0; x < 18; x++) { const ch = SLIME_ROWS[Math.min(12, Math.floor(y * 13 / 12))][Math.min(15, Math.floor(x * 16 / 18))]; if (ch !== '.') p(x, y + 1, 1, 1, P[ch]); } }, true);
  const f2 = build(14, 15, p => { for (let y = 0; y < 15; y++) for (let x = 0; x < 14; x++) { const ch = SLIME_ROWS[Math.min(12, Math.floor(y * 13 / 15))][Math.min(15, Math.floor(x * 16 / 14))]; if (ch !== '.') p(x, y, 1, 1, P[ch]); } }, true);
  const s = anchorSet([f0, f1]); const b2 = bbox(f2.img); f2.ax = b2.ax; f2.ay = b2.ay; return { idle: s, atk: [f2] };
}
function batFrame(up) {
  return build(22, 15, (p, e) => {
    const B = '#5c3a74', BL = '#9a72b8', BD = '#352048', Wc = '#4a2c62', WD = '#2a173a';
    for (let i = 1; i <= 8; i++) {
      const top = up ? 6 - Math.round(i * 0.7) : 6 + Math.round(i * 0.3);
      const len = 3 + ((i % 3) ? 1 : 0) + (i < 3 ? 1 : 0);
      p(10 - i, top, 1, len, i % 3 ? Wc : WD); p(11 + i, top, 1, len, i % 3 ? Wc : WD);
      p(10 - i, top, 1, 1, BL); p(11 + i, top, 1, 1, BL);
    }
    p(9, 5, 4, 6, B); p(10, 4, 2, 1, B); p(9, 3, 1, 2, BD); p(12, 3, 1, 2, BD); p(10, 5, 2, 1, BL);
    e(9, 7, 1, 1, '#ff5a7a'); e(12, 7, 1, 1, '#ff5a7a');
    p(10, 10, 1, 1, '#f4f0e0'); p(11, 10, 1, 1, '#f4f0e0');
  });
}
function goblinFrame(o, GC) {
  return build(26, 24, (p, e) => {
    const b = o.bob || 0, P = (x, y, w, h, c) => p(x, y + b, w, h, c);
    p(8, 18, 2, 4, GC.skinD); p(12, 18, 2, 4, GC.skin); p(8, 22, 3, 1, GC.skinD); p(12, 22, 3, 1, GC.skinD);
    P(5, 13, 2, 4, GC.skinD);
    if (!o.atk) { P(16, 7, 2, 9, GC.club); P(15, 3, 4, 5, GC.club); P(15, 6, 4, 1, GC.clubD); P(18, 4, 1, 1, '#d8d0b0'); }
    P(7, 12, 8, 7, GC.cloth); P(7, 12, 2, 7, GC.clothD); P(7, 16, 8, 1, GC.clothD); P(11, 16, 1, 1, '#e0b04a');
    P(6, 3, 10, 9, GC.skin); P(6, 3, 2, 9, GC.skinD); P(7, 2, 8, 1, GC.skin); P(10, 3, 4, 1, GC.skinL);
    P(3, 5, 3, 2, GC.skinD); P(2, 4, 1, 1, GC.skinD); P(16, 5, 3, 2, GC.skin); P(19, 4, 1, 1, GC.skin);
    P(11, 5, 4, 1, GC.skinD); e(12, 6 + b, 2, 2, GC.eye); P(13, 7, 1, 1, GC.pupil);
    P(15, 8, 2, 2, GC.skinD); P(11, 10, 5, 1, GC.mouth); P(12, 10, 1, 1, GC.tooth); P(14, 10, 1, 1, GC.tooth);
    if (o.atk) { P(14, 13, 4, 2, GC.skin); P(18, 11, 7, 4, GC.club); P(18, 14, 7, 1, GC.clubD); P(23, 10, 2, 1, '#d8d0b0'); }
    else { P(14, 13, 2, 4, GC.skin); P(15, 14, 2, 2, GC.skinL); }
  }, true);
}
const GC1 = { skin: '#7fb24c', skinD: '#557d2f', skinL: '#b2dc6e', eye: '#ffe14a', pupil: '#4a0d0d', cloth: '#8a5a32', clothD: '#5e3a1e', club: '#9a7448', clubD: '#64482a', tooth: '#f6f0d6', mouth: '#2a1410' };
const GC2 = { skin: '#b0584a', skinD: '#7a3530', skinL: '#e08a6e', eye: '#fff07a', pupil: '#3a0808', cloth: '#3e3a4e', clothD: '#26222f', club: '#6e6a74', clubD: '#46424e', tooth: '#f6f0d6', mouth: '#2a1410' };
const SC = { s: '#9a958a', sL: '#c9c3b0', sD: '#6c685f', sDD: '#48453f', moss: '#5f8f3a', mossL: '#8fbf4f', rune: '#8ff8ff', runeD: '#3fb6d0' };
function golemFrame(o) {
  return build(48, 50, (p, e) => {
    const b = o.bob || 0, P = (x, y, w, h, c) => p(x, y + b, w, h, c), E = (x, y, w, h, c) => e(x, y + b, w, h, c);
    p(12, 37, 8, 9, SC.sD); p(11, 44, 10, 4, SC.sDD); p(24, 37, 8, 9, SC.s); p(23, 44, 11, 4, SC.sD); p(25, 38, 2, 6, SC.sL);
    P(4, 16, 7, 16, SC.sD); P(3, 30, 9, 8, SC.sDD); P(4, 31, 7, 6, SC.sD);
    P(9, 14, 28, 24, SC.s); P(9, 14, 6, 24, SC.sD); P(11, 13, 24, 2, SC.sL); P(15, 15, 18, 1, SC.sL);
    P(9, 25, 28, 1, SC.sDD); P(22, 14, 1, 11, SC.sDD); P(16, 26, 1, 12, SC.sDD); P(30, 26, 1, 12, SC.sDD);
    P(32, 17, 1, 3, SC.sDD); P(33, 20, 1, 2, SC.sDD); P(12, 30, 2, 1, SC.sDD);
    E(20, 28, 6, 6, SC.runeD); E(21, 29, 4, 4, SC.rune); E(22, 27, 2, 1, SC.rune); E(22, 34, 2, 1, SC.rune); E(18, 30, 1, 2, SC.runeD); E(27, 30, 1, 2, SC.runeD);
    E(12, 20, 1, 3, SC.runeD); E(34, 22, 1, 3, SC.runeD); E(25, 18, 3, 1, SC.runeD);
    P(17, 4, 16, 11, SC.s); P(17, 4, 4, 11, SC.sD); P(19, 3, 12, 1, SC.sL); P(17, 14, 16, 1, SC.sDD);
    E(26, 8, 5, 2, SC.rune); E(27, 8, 2, 1, '#ffffff');
    P(11, 12, 9, 2, SC.moss); P(13, 11, 4, 1, SC.mossL); P(26, 12, 9, 2, SC.moss); P(28, 11, 3, 1, SC.mossL); P(18, 2, 8, 2, SC.moss); P(20, 1, 3, 1, SC.mossL); P(9, 20, 2, 5, SC.moss); P(36, 30, 1, 4, SC.moss); P(12, 38 - b, 3, 1, SC.moss);
    if (o.atk) { P(33, 12, 8, 7, SC.s); P(37, 3, 10, 10, SC.sL); P(37, 10, 10, 3, SC.s); P(39, 5, 6, 1, '#e6e0cc'); E(40, 8, 2, 2, SC.runeD); }
    else { P(35, 15, 8, 17, SC.s); P(35, 15, 2, 17, SC.sD); P(41, 16, 1, 12, SC.sL); P(34, 31, 11, 9, SC.s); P(34, 38, 11, 2, SC.sD); P(36, 32, 6, 1, SC.sL); E(38, 34, 2, 2, SC.runeD); }
  }, true);
}
const MSPR = {
  slimeG: slimeSet(['#245e52', '#59c7a4', '#d2fff2', '#3a9c84']),
  slimeP: slimeSet(['#5a2450', '#d26aa8', '#ffe0f2', '#a04884']),
  bat: (() => { const s = anchorSet([batFrame(true), batFrame(false)]); return { idle: s, atk: s }; })(),
  goblin: (() => { const s = anchorSet([goblinFrame({}, GC1), goblinFrame({ bob: 1 }, GC1)]); const a = goblinFrame({ atk: 1 }, GC1); a.ax = s[0].ax; a.ay = s[0].ay; return { idle: s, atk: [a] }; })(),
  goblinR: (() => { const s = anchorSet([goblinFrame({}, GC2), goblinFrame({ bob: 1 }, GC2)]); const a = goblinFrame({ atk: 1 }, GC2); a.ax = s[0].ax; a.ay = s[0].ay; return { idle: s, atk: [a] }; })(),
  golem: (() => { const s = anchorSet([golemFrame({}), golemFrame({ bob: 1 })]); const a = golemFrame({ atk: 1 }); a.ax = s[0].ax; a.ay = s[0].ay; return { idle: s, atk: [a] }; })(),
};
const CH = { w: '#8a4b22', wL: '#c0743c', wD: '#5a2e14', band: '#e8b84e', bandD: '#9a7020', lock: '#fff2b0' };
const CHEST = {
  closed: build(18, 15, p => {
    p(1, 3, 16, 5, CH.w); p(2, 2, 14, 1, CH.wL); p(2, 3, 14, 1, CH.wL); p(1, 8, 16, 7, CH.w); p(1, 12, 16, 3, CH.wD); p(1, 8, 16, 1, CH.wD);
    p(4, 2, 2, 13, CH.band); p(12, 2, 2, 13, CH.band); p(4, 13, 2, 2, CH.bandD); p(12, 13, 2, 2, CH.bandD); p(8, 7, 2, 3, CH.lock); p(8, 9, 2, 1, CH.bandD);
  }),
  open: build(18, 15, (p, e) => {
    p(1, 0, 16, 5, CH.wD); p(2, 1, 14, 3, CH.w); p(4, 0, 2, 5, CH.bandD); p(12, 0, 2, 5, CH.bandD);
    p(1, 6, 16, 3, '#2a1408'); e(3, 6, 12, 2, '#ffd860'); e(6, 5, 6, 1, '#fff6c0');
    p(1, 8, 16, 7, CH.w); p(1, 12, 16, 3, CH.wD); p(1, 8, 16, 1, CH.wL); p(4, 8, 2, 7, CH.band); p(12, 8, 2, 7, CH.band); p(8, 9, 2, 2, CH.lock);
  }),
};
[CHEST.closed, CHEST.open].forEach(f => { const a = bbox(CHEST.closed.img); f.ax = a.ax; f.ay = a.ay; });
const ICON = {
  fire: build(12, 12, (p) => { p(5, 0, 2, 2, '#ffb040'); p(3, 2, 6, 3, '#ff8a30'); p(2, 4, 8, 5, '#ff6a20'); p(3, 9, 6, 2, '#c03a18'); p(4, 4, 4, 4, '#ffd060'); p(5, 5, 2, 3, '#fff3c0'); p(7, 2, 1, 2, '#ffd060'); }),
  guard: build(12, 12, (p) => { p(1, 1, 10, 6, '#5a8ad0'); p(2, 7, 8, 2, '#4a76b8'); p(3, 9, 6, 1, '#3a5e98'); p(4, 10, 4, 1, '#2a4a80'); p(5, 11, 2, 1, '#2a4a80'); p(5, 1, 2, 10, '#e8c060'); p(1, 3, 10, 1, '#e8c060'); p(2, 1, 3, 1, '#a8c8f8'); p(2, 2, 1, 4, '#a8c8f8'); }),
  sword: build(10, 10, (p) => { for (let i = 0; i < 7; i++) { p(2 + i, 7 - i, 1, 1, '#eef4fb'); p(3 + i, 7 - i, 1, 1, '#93a1b8'); } p(1, 6, 4, 1, '#e8c060'); p(2, 5, 1, 3, '#e8c060'); p(0, 8, 2, 2, '#6b4a2a'); }),
};
function imgLayer(w, h, fn, wrap) {
  const m = mk(w, h, 1); const id = m.x.createImageData(w, h); const D = id.data;
  const set = (x, y, col, a = 255) => { x = Math.round(x); y = Math.round(y); if (y < 0 || y >= h) return; if (wrap) x = ((x % w) + w) % w; else if (x < 0 || x >= w) return; const i = (y * w + x) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a; };
  const get = (x, y) => { x = Math.round(x); y = Math.round(y); if (y < 0 || y >= h) return 0; if (wrap) x = ((x % w) + w) % w; else if (x < 0 || x >= w) return 0; return D[(y * w + x) * 4 + 3]; };
  fn(set, get); m.x.putImageData(id, 0, 0); return m.c;
}
const pal = a => a.map(hex);
const LEAF = pal(['#0f2418', '#1a3d25', '#2a5a30', '#437a36', '#6fa244', '#b2d468']);
const LEAF_AUT = pal(['#2a160c', '#4a2412', '#7a3a18', '#b05a22', '#de8a34', '#f6c25a']);
const BARK = pal(['#1e140c', '#33231a', '#4e3626', '#735036', '#98724c']);
const STONE = pal(['#2e2c2a', '#4a4741', '#6b675e', '#8f8a7b', '#bbb4a0']);
const MOSS = pal(['#2f5a26', '#4f8a34', '#8cbc50']);
const CAVE = pal(['#141012', '#231c1c', '#382c28', '#544036', '#7a5e48', '#a3836a']);

function canopy(set, get, blobs, P, w, h) {
  for (const b of blobs) {
    const R = b.rad;
    for (let y = Math.floor(b.y - R - 3); y < b.y + R + 3; y++) for (let x = Math.floor(b.x - R - 3); x < b.x + R + 3; x++) {
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const dx = x - b.x, dy = (y - b.y) * 1.08;
      const n = hash(x >> 1, y >> 1), d = Math.hypot(dx, dy) / R;
      if (d > 0.84 + n * 0.24) continue;
      let l = 0.62 - (dx * 0.5 + dy * 0.85) / R * 0.5 + (n - 0.5) * 0.35 + (b.lift || 0);
      if (d > 0.8) l -= 0.32;
      set(x, y, P[clamp(Math.floor(l * 5 + bayer(x, y) * 0.9), 0, 5)]);
    }
  }
}
function makeTree(seed, autumn) {
  const r = RNG(seed), w = 128, h = 208, P = autumn ? LEAF_AUT : LEAF;
  const c = imgLayer(w, h, (set, get) => {
    const tx = 64 + (r() - 0.5) * 8, tw = 10 + r() * 6, top = 60;
    for (let y = top; y < h; y++) {
      const flare = Math.max(0, y - (h - 26)) * 0.9, hw = tw / 2 + flare, lean = Math.sin(y * 0.03 + seed) * 2;
      for (let xx = Math.floor(-hw); xx <= hw; xx++) {
        const rel = (xx + hw) / (2 * hw + 1); let idx = rel < 0.2 ? 3 : rel < 0.5 ? 2 : rel < 0.8 ? 1 : 0;
        if (rel < 0.08 && bayer(xx, y) > 0.5) idx = 4;
        if (hash(Math.round(tx + xx) >> 1, y >> 2) < 0.14) idx = Math.max(0, idx - 1);
        set(tx + xx + lean, y, BARK[idx]);
      }
    }
    for (let k = 0; k < 3; k++) { const dir = k % 2 ? 1 : -1, y0 = 80 + r() * 30; for (let i = 0; i < 30; i++) { set(tx + dir * i, y0 - i * 0.7, BARK[1]); set(tx + dir * i, y0 - i * 0.7 + 1, BARK[0]); set(tx + dir * i, y0 - i * 0.7 - 1, BARK[2]); } }
    const blobs = []; const n = 9 + (r() * 4 | 0);
    for (let i = 0; i < n; i++) blobs.push({ x: 64 + (r() - 0.5) * 92, y: 18 + r() * 78, rad: 18 + r() * 18 });
    blobs.sort((a, b) => a.y - b.y);
    canopy(set, get, blobs, P, w, h);
    // moss/ivy on trunk
    for (let y = top + 40; y < h - 4; y++) if (hash(y, seed) < 0.35) set(tx - tw / 2 + 1 + (hash(y, 3) * 3 | 0), y, MOSS[(hash(y, 9) * 3) | 0]);
  });
  return { img: c, ax: 64, ay: h, w, h, bulge: 1.4 };
}
function makeBush(seed, wd = 52, ht = 28, P = LEAF) {
  const r = RNG(seed);
  const c = imgLayer(wd, ht, (set, get) => {
    const blobs = []; for (let i = 0; i < 6; i++) blobs.push({ x: wd * 0.2 + r() * wd * 0.6, y: ht * 0.45 + r() * ht * 0.4, rad: ht * 0.35 + r() * ht * 0.2 });
    blobs.sort((a, b) => a.y - b.y);
    canopy(set, get, blobs, P, wd, ht);
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 1.2 };
}
function makeFern(seed, wd = 96, ht = 72, dark = 0) {
  const r = RNG(seed), C = dark ? pal(['#081009', '#0f1d12', '#18301b', '#2c4a28', '#4f6e38']) : pal(['#13261a', '#1e3d24', '#2f5a2f', '#4f8a3c', '#8cbc58']);
  const c = imgLayer(wd, ht, (set) => {
    const n = 7 + (r() * 4 | 0);
    for (let f = 0; f < n; f++) {
      const bx = wd / 2 + (r() - 0.5) * wd * 0.25, dir = r() < 0.5 ? -1 : 1, len = ht * (0.6 + r() * 0.45), arc = 0.4 + r() * 0.8;
      for (let s = 0; s < len; s++) {
        const t = s / len, px = bx + dir * Math.pow(t, 1.4) * len * arc * 0.9, py = ht - t * len * 0.95 + Math.pow(t, 2.2) * len * 0.45 * arc;
        set(px, py, C[2]); set(px, py + 1, C[1]);
        if (s % 2 === 0 && t > 0.08) { const ll = Math.round((1 - t) * 9 + 2); for (let k = 1; k <= ll; k++) { set(px - k * 0.45 * dir, py - k * 0.9, k === ll ? C[4] : C[s % 4 ? 2 : 3]); set(px + k * 0.9 * dir, py - k * 0.3, k === ll ? C[3] : C[1]); } }
      }
    }
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 0.8 };
}
function makeGrass(seed, wd = 20, ht = 12, C = pal(['#1e3d24', '#2f5a2f', '#4f8a3c', '#8cbc58', '#c4e07a'])) {
  const r = RNG(seed);
  const c = imgLayer(wd, ht, (set) => {
    for (let i = 0; i < wd * 0.9; i++) { const x = r() * wd, hh = ht * (0.35 + r() * 0.65), lean = (r() - 0.5) * 4; for (let k = 0; k < hh; k++) { const t = k / hh; set(x + lean * t * t, ht - 1 - k, C[clamp(Math.floor(t * 4 + r() * 0.8), 0, 4)]); } }
    if (r() < 0.6) { const fx = 3 + r() * (wd - 6), fy = 2 + r() * 3, fc = r() < 0.5 ? hex('#f6e27a') : hex('#e88aa8'); set(fx, fy, fc); set(fx + 1, fy, fc); set(fx, fy + 1, fc); set(fx + 1, fy + 1, hex('#fff6d0')); }
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 0.4 };
}
function makeRock(seed, wd, ht, P = STONE, mossy = true) {
  const r = RNG(seed);
  const c = imgLayer(wd, ht, (set) => {
    const pts = []; for (let i = 0; i < 5; i++) pts.push([wd * (0.25 + r() * 0.5), ht * (0.45 + r() * 0.4), Math.min(wd, ht * 1.6) * (0.25 + r() * 0.2)]);
    for (let y = 0; y < ht; y++) for (let x = 0; x < wd; x++) {
      let best = 9, bi = 0; for (let i = 0; i < pts.length; i++) { const [px, py, pr] = pts[i]; const d = Math.hypot((x - px) / (pr * 1.3), (y - py) / pr); if (d < best) { best = d; bi = i; } }
      if (best > 1 || y > ht - 1) continue;
      const [px, py, pr] = pts[bi]; const nx = (x - px) / pr, ny = (y - py) / pr;
      let l = 2.6 - nx * 1.2 - ny * 1.4 + (hash(x >> 1, y >> 1) - 0.5) * 0.7;
      if (best > 0.86) l -= 1.2;
      let col = P[clamp(Math.floor(l + bayer(x, y) * 0.8), 0, P.length - 1)];
      if (mossy && ny < -0.45 && hash(x, y + seed) < 0.75) col = MOSS[clamp(Math.floor(1.5 - ny + hash(x, y) * 1.2), 0, 2)];
      set(x, y, col);
    }
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 1.5 };
}
function makePillar(seed, ht, broken) {
  const w = 16;
  const c = imgLayer(w + 6, ht + 4, (set) => {
    const topCut = []; for (let x = 0; x < w; x++) topCut.push(broken ? Math.floor(hash(x >> 1, seed) * 7 + (x > w / 2 ? 3 : 0)) : 0);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) {
      if (y < topCut[x] + 2) continue;
      const row = Math.floor(y / 6), off = row % 2 ? 4 : 0, seamX = (x + off) % 8 === 0, seamY = y % 6 === 0;
      let l = x < 3 ? 3.4 : x < 7 ? 2.6 : x < 12 ? 1.8 : 1.0; l += (hash((x + off) >> 3, row + seed) - 0.5) * 0.8;
      let col = STONE[clamp(Math.floor(l + bayer(x, y) * 0.7), 0, 4)];
      if (seamX || seamY) col = STONE[0];
      if (y === topCut[x] + 2) col = STONE[4];
      set(x + 3, y + 2, col);
      if ((y < topCut[x] + 5 && hash(x, y + seed) < 0.6) || (hash(x >> 1, y >> 2) < 0.08)) set(x + 3, y + 2, MOSS[clamp(Math.floor(hash(x, y) * 3), 0, 2)]);
    }
    for (let y = ht - 4; y < ht + 2; y++) for (let x = -3; x < w + 3; x++) set(x + 3, Math.min(y + 2, ht + 3), y === ht - 4 ? STONE[4] : STONE[x < 4 ? 3 : 1]);
  });
  return { img: c, ax: (w + 6) / 2, ay: ht + 4, w: w + 6, h: ht + 4, bulge: 1.2 };
}
function makeArch(seed) {
  const w = 104, h = 96;
  const c = imgLayer(w, h, (set) => {
    const inner = 30, outer = 46, cx = 52, cy = 52;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let inside = false;
      const dx = x - cx, dy = y - cy;
      if (y < cy) { const d = Math.hypot(dx, dy * 1.1); inside = d < outer && d > inner; }
      else inside = Math.abs(dx) > inner && Math.abs(dx) < outer;
      // broken chunk on right top
      if (x > 70 && y < 30 && hash(x >> 2, y >> 2) < 0.8) inside = false;
      if (!inside) continue;
      const ang = Math.atan2(dy, dx), brick = y < cy ? Math.floor((ang + Math.PI) * 6) : Math.floor(y / 7);
      const seam = y < cy ? (Math.abs(((ang + Math.PI) * 6) % 1) < 0.1 || Math.abs(Math.hypot(dx, dy * 1.1) - 38) < 0.6) : (y % 7 === 0 || (x + (Math.floor(y / 7) % 2) * 4) % 9 === 0);
      let l = 2.4 - (dx / outer) * 0.8 - (dy / 50) * 0.6 + (hash(brick, seed) - 0.5);
      let col = STONE[clamp(Math.floor(l + bayer(x, y) * 0.7), 0, 4)];
      if (seam) col = STONE[0];
      if (hash(x >> 1, y >> 1 ^ seed) < 0.1 || (y < cy - 30 && hash(x, y) < 0.5)) col = MOSS[(hash(x, y) * 3) | 0];
      set(x, y, col);
    }
    // hanging ivy
    for (let i = 0; i < 9; i++) { const x = 10 + i * 10 + hash(i, 1) * 6, len = 10 + hash(i, 2) * 28; for (let y = 0; y < len; y++) set(x + Math.sin(y * 0.3) * 1.2, 14 + y, LEAF[2 + ((y >> 1) % 3)]); }
  });
  return { img: c, ax: w / 2, ay: h, w, h, bulge: 0.8 };
}
function makeStalagmite(seed, wd, ht, P = CAVE) {
  const r = RNG(seed);
  const c = imgLayer(wd, ht, (set) => {
    const cx = wd / 2 + (r() - 0.5) * 4, tilt = (r() - 0.5) * 6;
    for (let y = 0; y < ht; y++) {
      const t = y / ht, hw = Math.pow(t, 0.75) * wd * 0.48 + (hash(y >> 2, seed) - 0.5) * 2;
      const x0 = cx + tilt * (1 - t);
      for (let x = Math.floor(x0 - hw); x <= x0 + hw; x++) {
        const rel = (x - (x0 - hw)) / (2 * hw + 1e-3);
        let l = 4.2 - rel * 3.4 + (hash(x >> 1, y >> 2) - 0.5) * 0.9 - (1 - t) * 0.4;
        if (y % 9 === 0 && hash(x >> 2, y) < 0.6) l -= 1;
        set(x, y, P[clamp(Math.floor(l + bayer(x, y) * 0.8), 0, P.length - 1)]);
      }
    }
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 1.6 };
}
function makeStalactite(seed, wd, ht, P = CAVE) {
  const s = makeStalagmite(seed, wd, ht, P);
  const o = mk(wd, ht); o.x.translate(0, ht); o.x.scale(1, -1); o.x.drawImage(s.img, 0, 0);
  return { img: o.c, ax: wd / 2, ay: 0, w: wd, h: ht, bulge: 1.6, hang: 1 };
}
function makeCrystal(seed, col) {
  const r = RNG(seed), w = 34, h = 40;
  const C = col === 'blue' ? pal(['#1a2a5a', '#2f5ab8', '#56a8ff', '#a8e4ff', '#f0fbff']) : pal(['#3a1450', '#7a2ab0', '#c060ff', '#e8b0ff', '#fff0ff']);
  const g = mk(w, h);
  const c = imgLayer(w, h, (set) => {
    const n = 4 + (r() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const bx = w / 2 + (r() - 0.5) * 18, len = 14 + r() * 24, ang = (r() - 0.5) * 0.9, wd = 2 + r() * 3;
      for (let s = 0; s < len; s++) {
        const t = s / len, cx = bx + Math.sin(ang) * s, cy = h - 1 - Math.cos(ang) * s, hw = wd * (t > 0.75 ? (1 - t) / 0.25 : 1);
        for (let x = -hw; x <= hw; x++) { const lv = x < 0 ? 3 : x < hw * 0.5 ? 2 : 1; set(cx + x, cy, C[t > 0.8 && x < 0 ? 4 : lv]); }
      }
    }
  });
  g.x.drawImage(c, 0, 0); g.x.globalCompositeOperation = 'source-in'; g.x.fillStyle = col === 'blue' ? '#7fd0ff' : '#d080ff'; g.x.fillRect(0, 0, w, h);
  return { img: c, glow: g.c, ax: w / 2, ay: h, w, h, bulge: 0.8 };
}
function makeShrooms(seed) {
  const w = 22, h = 14, g = mk(w, h);
  const c = imgLayer(w, h, (set) => {
    const r = RNG(seed);
    for (let i = 0; i < 4; i++) { const x = 3 + i * 5 + (r() * 2 | 0), hh = 4 + (r() * 6 | 0); for (let k = 0; k < hh; k++) set(x, h - 1 - k, hex('#d8e0d0')); for (let j = -2; j <= 2; j++) set(x + j, h - 1 - hh, hex('#3fd8c8')); for (let j = -1; j <= 1; j++) set(x + j, h - 2 - hh, hex('#9ff8ee')); set(x, h - 3 - hh, hex('#e8fffa')); }
  });
  g.x.drawImage(c, 0, 0); g.x.globalCompositeOperation = 'source-in'; g.x.fillStyle = '#6ff8e8'; g.x.fillRect(0, 0, w, h);
  g.x.globalCompositeOperation = 'destination-out'; g.x.fillRect(0, h - 4, w, 4);
  return { img: c, glow: g.c, ax: w / 2, ay: h, w, h, bulge: 0.5 };
}
function makeTorchPost(tall = 34) {
  const w = 12, h = tall;
  const c = imgLayer(w, h, (set) => {
    for (let y = 6; y < h; y++) { set(5, y, BARK[3]); set(6, y, BARK[2]); set(7, y, BARK[1]); if (y % 7 === 0) { set(5, y, BARK[1]); set(6, y, BARK[1]); } }
    for (let x = 2; x < 10; x++) { set(x, 4, hex('#4a4440')); set(x, 5, hex('#2a2624')); set(x, 6, hex('#5c5650')); }
    set(2, 2, hex('#4a4440')); set(2, 3, hex('#4a4440')); set(9, 2, hex('#4a4440')); set(9, 3, hex('#4a4440')); set(5, 3, hex('#3a2a20')); set(6, 3, hex('#5a3a22'));
  });
  return { img: c, ax: w / 2, ay: h, w, h, bulge: 0.6, flameY: (h - 3) * PX };
}
function makeSconce() {
  const w = 12, h = 14;
  const c = imgLayer(w, h, (set) => {
    for (let x = 2; x < 10; x++) { set(x, 3, hex('#5c5650')); set(x, 4, hex('#2a2624')); }
    for (let y = 5; y < 12; y++) { set(5, y, hex('#3a3632')); set(6, y, hex('#5c5650')); }
    set(4, 12, hex('#3a3632')); set(7, 12, hex('#3a3632')); set(5, 2, hex('#3a2a20')); set(6, 2, hex('#5a3a22'));
  });
  return { img: c, ax: w / 2, ay: h, w, h, bulge: 0.5, flameY: (h - 2) * PX };
}
function makeVines(seed, wd = 44, ht = 120, C = pal(['#0c1a10', '#173020', '#24482c', '#3c6a36', '#6a9a4a'])) {
  const r = RNG(seed);
  const c = imgLayer(wd, ht, (set) => {
    for (let i = 0; i < 7; i++) {
      const x = 4 + r() * (wd - 8), len = ht * (0.4 + r() * 0.6), ph = r() * 6;
      for (let y = 0; y < len; y++) { const vx = x + Math.sin(y * 0.08 + ph) * 3; set(vx, y, C[1]); if (y % 5 === 0) { const d = r() < 0.5 ? -1 : 1; for (let k = 1; k < 5; k++) set(vx + d * k, y + k * 0.5, C[k === 4 ? 4 : 2 + (k & 1)]); } }
    }
    for (let x = 0; x < wd; x++) for (let y = 0; y < 8 + hash(x >> 2, seed) * 8; y++) set(x, y, C[clamp(Math.floor(2 - y * 0.15 + hash(x, y) * 2), 0, 4)]);
  });
  return { img: c, ax: wd / 2, ay: 0, w: wd, h: ht, bulge: 0.6, hang: 1 };
}
function makeTrunk(seed, wd = 40, ht = 220) {
  const c = imgLayer(wd, ht, (set) => {
    for (let y = 0; y < ht; y++) {
      const flare = Math.max(0, y - (ht - 30)) * 0.8, hw = wd / 2 - 6 + flare * 0.3;
      for (let xx = Math.floor(-hw); xx <= hw; xx++) {
        const rel = (xx + hw) / (2 * hw + 1); let idx = rel < 0.15 ? 2 : rel < 0.5 ? 1 : 0;
        if (hash(xx >> 1, y >> 3 ^ seed) < 0.18) idx = Math.max(0, idx - 1);
        set(wd / 2 + xx, y, BARK[idx]);
      }
    }
  });
  return { img: c, ax: wd / 2, ay: ht, w: wd, h: ht, bulge: 1.2 };
}

// --- far backdrops (wrapping strips, from v1) ---
const IW = 384, IH = 216;
const BD_MTN = imgLayer(768, IH, (set) => {
  const r = RNG(11);
  const ridge = (base, amp, cA, cB, cC) => {
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28], hs = [];
    for (let x = 0; x < 768; x++) { const t = x / 768 * Math.PI * 2; hs.push(base - amp * (0.55 * Math.sin(t * 2 + ph[0]) + 0.3 * Math.sin(t * 5 + ph[1]) + 0.18 * Math.sin(t * 13 + ph[2]))); }
    for (let x = 0; x < 768; x++) {
      const y0 = Math.round(hs[x]), rising = hs[(x + 767) % 768] - hs[x] > 0.15;
      for (let y = y0; y < IH; y++) { const d = y - y0; let c = cB; if (rising && d < 6 + bayer(x, y) * 6) c = cA; else if (!rising && d < 10 && bayer(x, y) > 0.55) c = cC; if (d > 40 + bayer(x, y) * 10) c = cC; set(x, y, c); }
    }
  };
  ridge(112, 38, hex('#e2d0cc'), hex('#a2a2bc'), hex('#8a8fae'));
  ridge(140, 26, hex('#b4abc0'), hex('#7e86a2'), hex('#6a7392'));
}, true);
const BD_FAR = imgLayer(768, IH, (set) => {
  const r = RNG(23), base = 170; const C = hex('#3a5660'), R = hex('#6a8c86'), D = hex('#2c4450');
  let x = 0;
  while (x < 768) {
    const ht = 30 + r() * 46, cx = x, top = base - ht, round = r() < 0.35;
    for (let y = Math.floor(top); y < base + 2; y++) {
      let hw;
      if (round) { const k = (y - top) / ht; hw = Math.sqrt(Math.max(0, 1 - Math.pow(k * 2 - 1.1, 2))) * ht * 0.42; if (k > 0.8) hw = 1.5; }
      else { const k = (y - top); hw = (k % 7) * 0.55 + k * 0.22; if (y > base - 4) hw = 1.5; }
      for (let xx = Math.floor(-hw); xx <= hw; xx++) set(cx + xx, y, xx < -hw + 1.5 && bayer(cx + xx, y) > 0.3 ? R : (xx > hw * 0.4 ? D : C));
    }
    x += 7 + r() * 12;
  }
  for (let y = base; y < IH; y++) for (let x2 = 0; x2 < 768; x2++) set(x2, y, bayer(x2, y) > 0.8 ? R : C);
}, true);
const BD_SKY = imgLayer(64, 128, (set) => {
  const stops = [[0, '#2a3f66'], [0.3, '#5a7aa8'], [0.55, '#b4a8b8'], [0.72, '#f0bc88'], [0.86, '#ffd8a0'], [1, '#fff0c8']].map(([t, c]) => [t, hex(c)]);
  const col = t => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]); return [0, 1, 2].map(j => a[1][j] + (b[1][j] - a[1][j]) * k); } return stops[stops.length - 1][1]; };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const q = 16, v = (y / 128) * q + bayer(x, y) - 0.5; set(x, y, col(clamp(Math.round(v) / q, 0, 1)).map(Math.round)); }
}, true);

  return { HERO, MSPR, CHEST, ICON, BD_MTN, BD_FAR, BD_SKY, LEAF, LEAF_AUT, CAVE,
    makeTree, makeBush, makeFern, makeGrass, makeRock, makePillar, makeArch, makeStalagmite, makeStalactite,
    makeCrystal, makeShrooms, makeTorchPost, makeSconce, makeVines, makeTrunk };
}

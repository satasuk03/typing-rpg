// biome-ignore-all lint: dense art/measurement code (same convention as the sprite generators).
// biome-ignore-all format: see above.
import { describe, expect, it } from "vitest";
import { ProceduralSpriteSource } from "./ProceduralSpriteSource";
import {
  HERO_HEIGHT_TX,
  NUL_ANCHOR,
  NUL_ANIMS,
  NUL_FRAME_COUNT,
  NUL_H,
  NUL_HEIGHT_TX,
  NUL_PAL,
  NUL_PALETTE_SET,
  NUL_PLATE_Y_M,
  NUL_SCALE,
  NUL_W,
  nulNibTip,
  PART,
  renderNulRaw,
  wardRaw,
} from "./prologueArt";

type Raw = ReturnType<typeof renderNulRaw>;
const idle0 = (opts = {}): Raw => renderNulRaw(NUL_ANIMS.idle[0], opts);
const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const pixLum = (f: Raw, i: number): number => lum(f.col[i * 4] ?? 0, f.col[i * 4 + 1] ?? 0, f.col[i * 4 + 2] ?? 0);

/** 50% box downsample: coverage (alpha) and alpha-weighted relative luminance per 2x2 block. */
export function half(f: Raw): { w: number; h: number; cov: Float32Array; lum: Float32Array } {
  const w = f.w >> 1, h = f.h >> 1;
  const cov = new Float32Array(w * h), l = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0, s = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const i = (2 * y + dy) * f.w + 2 * x + dx;
          if ((f.col[i * 4 + 3] ?? 0) > 0) { a++; s += pixLum(f, i); }
        }
      cov[y * w + x] = a / 4;
      l[y * w + x] = a ? s / a : 0;
    }
  return { w, h, cov, lum: l };
}
const runs = (row: boolean[]): number => { let n = 0; for (let i = 0; i < row.length; i++) if (row[i] && !row[i - 1]) n++; return n; };
const hue = (r: number, g: number, b: number): { h: number; s: number } => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d / mx };
};

describe("Nul sprite (P2.1)", () => {
  it("registers monster.nul and monster.nul.ward in the source", () => {
    const src = new ProceduralSpriteSource();
    expect(src.has("monster.nul")).toBe(true);
    expect(src.has("monster.nul.ward")).toBe(true);
  });

  it("has the 22 frames of the brief and a single anchor", () => {
    expect(NUL_FRAME_COUNT).toBe(22);
    const lens = Object.fromEntries(Object.entries(NUL_ANIMS).map(([k, v]) => [k, v.length]));
    expect(lens).toMatchObject({ idle: 4, cast: 3, write: 3, catch: 2, reach: 2, hurt: 2, intro: 4, rise: 2 });
    expect(NUL_ANIMS.atk).toBe(NUL_ANIMS.cast);
    expect(NUL_SCALE).toBe(1.0);
    expect(NUL_ANCHOR.ay).toBe(NUL_H - 2);
    for (const poses of Object.values(NUL_ANIMS))
      for (const p of poses) {
        const f = renderNulRaw(p);
        expect([f.w, f.h]).toEqual([NUL_W, NUL_H]);
      }
  });

  it("is deterministic", () => {
    const a = idle0(), b = idle0();
    expect(Buffer.from(a.col).equals(Buffer.from(b.col))).toBe(true);
    expect(Buffer.from(a.glw).equals(Buffer.from(b.glw))).toBe(true);
  });

  it("is 73 tx tall (2.35x the hero) with a 12 x 14 tx mask; the plate sits 1 m above the crown", () => {
    const f = idle0({ outline: false, flip: false });
    let top = f.h, bottom = 0, mTop = f.h, mBot = 0, mL = f.w, mR = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (!f.col[i * 4 + 3]) continue;
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        if (f.part[i] === PART.mask) { mTop = Math.min(mTop, y); mBot = Math.max(mBot, y); mL = Math.min(mL, x); mR = Math.max(mR, x); }
      }
    const height = bottom - top + 1;
    expect(height).toBe(NUL_HEIGHT_TX);
    expect(height / HERO_HEIGHT_TX).toBeGreaterThanOrEqual(2.25);
    expect(height / HERO_HEIGHT_TX).toBeLessThanOrEqual(2.45);
    expect(mBot - mTop + 1).toBe(14);
    expect(mR - mL + 1).toBeLessThanOrEqual(13);
    expect(mR - mL + 1).toBeGreaterThanOrEqual(11);
    expect(NUL_PLATE_Y_M).toBeCloseTo(5.5625, 3);
  });

  it("50% alpha silhouette: >= 4 crown spikes, a collar notch both sides, a detached staff", () => {
    const h = half(idle0({ flip: false }));
    const solid = (x: number, y: number): boolean => (h.cov[y * h.w + x] ?? 0) >= 0.5;
    // the crown band is at u 60-61: find the top of the head line (first row where the mask-wide run appears) from the top.
    let best = 0;
    for (let y = 0; y < h.h; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < h.w; x++) row.push(solid(x, y));
      const r = runs(row);
      if (y < 12) best = Math.max(best, r); // rows in the crown zone only (the staff tip adds one run)
    }
    expect(best).toBeGreaterThanOrEqual(4);
    // collar notch: a gap column between the wing tip and the head, on both sides, in the rows just under the crown
    const f = idle0({ outline: false, flip: false });
    let notchL = false, notchR = false;
    for (let y = 0; y < f.h; y++) {
      const u = 88 - y;
      if (u < 49 || u > 57) continue;
      const xs: number[] = [];
      for (let x = 0; x < f.w; x++) if ([PART.wing, PART.rim].includes(f.part[y * f.w + x] as 2)) xs.push(x);
      const heads: number[] = [];
      for (let x = 0; x < f.w; x++) if ([PART.head, PART.mask].includes(f.part[y * f.w + x] as 5)) heads.push(x);
      if (!xs.length || !heads.length) continue;
      const hl = Math.min(...heads), hr = Math.max(...heads);
      if (xs.some((x) => x < hl - 1)) notchL = true;
      if (xs.some((x) => x > hr + 1)) notchR = true;
    }
    expect(notchL && notchR).toBe(true);
    // the staff: rows (u 8..66) where the staff has at least one empty 50%-pixel column between it and the body
    let detached = 0;
    for (let u = 4; u <= 66; u++) {
      const y = 88 - u;
      let sMin = 999, bMax = -1;
      for (let x = 0; x < f.w; x++) {
        const id = f.part[y * f.w + x];
        if (id === PART.staff) sMin = Math.min(sMin, x);
        else if (id && id !== PART.glyph && id !== PART.hand && x < 60) bMax = Math.max(bMax, x);
      }
      if (sMin === 999 || sMin - bMax >= 3) detached++;
    }
    expect(detached / 63).toBeGreaterThanOrEqual(0.6);
  });

  it("50% value silhouette: the mask is the only bright blob (<= 6 px of crown tip may pass)", () => {
    const h = half(idle0({ flip: false }));
    let bright = 0, crownish = 0, maskBlob = 0;
    const f = idle0({ outline: false, flip: false });
    for (let y = 0; y < h.h; y++)
      for (let x = 0; x < h.w; x++) {
        const i = y * h.w + x;
        if ((h.cov[i] ?? 0) < 0.5 || (h.lum[i] ?? 0) <= 0.5) continue;
        bright++;
        const id = f.part[(2 * y) * f.w + 2 * x] ?? 0, id2 = f.part[(2 * y + 1) * f.w + 2 * x + 1] ?? 0;
        if ([id, id2].includes(PART.mask) || [id, id2].includes(PART.eye)) maskBlob++;
        else crownish++;
      }
    expect(maskBlob).toBeGreaterThan(8);
    expect(crownish).toBeLessThanOrEqual(6);
    expect(bright).toBe(maskBlob + crownish);
  });

  it("sprite luma: mask vs cloak contrast >= 10:1", () => {
    const f = idle0({ outline: false, flip: false });
    let ms = 0, mn = 0, cs = 0, cn = 0;
    for (let i = 0; i < f.w * f.h; i++) {
      const id = f.part[i];
      if (id === PART.mask) { ms += pixLum(f, i); mn++; }
      else if (id === PART.cloak) { cs += pixLum(f, i); cn++; }
    }
    const m = ms / mn, c = cs / cn;
    expect((m + 0.05) / (c + 0.05)).toBeGreaterThanOrEqual(10);
    expect(m / c).toBeGreaterThan(10);
  });

  it("uses only the palette; no warm hue outside the gold/bone ramps; no black holes in the cloak", () => {
    for (const poses of Object.values(NUL_ANIMS))
      for (const p of poses) {
        const f = renderNulRaw(p);
        for (let i = 0; i < f.w * f.h; i++) {
          if (!f.col[i * 4 + 3]) continue;
          const r = f.col[i * 4] ?? 0, g = f.col[i * 4 + 1] ?? 0, b = f.col[i * 4 + 2] ?? 0;
          expect(NUL_PALETTE_SET.has(`${r},${g},${b}`), `${r},${g},${b}`).toBe(true);
          const { h, s } = hue(r, g, b);
          if (h >= 0 && h <= 60 && s > 0.3) {
            const isGold = [[62, 47, 20], [110, 84, 36], [176, 138, 62], [216, 180, 100]].some((c) => c[0] === r && c[1] === g && c[2] === b);
            expect(isGold, `warm ${r},${g},${b}`).toBe(true);
          }
          if (f.part[i] === PART.cloak) expect(r + g + b).toBeGreaterThan(0x0e + 0x0a + 0x18 - 1); // never #07050d
        }
      }
  });

  it("lore guard: bone mask, no mouth, no brows (only the eye slits break the bone)", () => {
    const f = idle0({ outline: false, flip: false });
    const eyeRows = new Set<number>();
    for (let i = 0; i < f.w * f.h; i++) if (f.part[i] === PART.eye) eyeRows.add(Math.floor(i / f.w));
    expect(eyeRows.size).toBe(1);
    const bone = new Set(["74,70,82", "122,118,132", "168,162,158", "189,182,173", "207,200,188", "233,227,214", "248,244,234"]);
    for (let i = 0; i < f.w * f.h; i++)
      if (f.part[i] === PART.mask) {
        const k = `${f.col[i * 4]},${f.col[i * 4 + 1]},${f.col[i * 4 + 2]}`;
        expect(bone.has(k), k).toBe(true); // lavender #eee8f4 is not in the set
      }
    const eyeY = [...eyeRows][0] as number;
    let slits = 0;
    for (let x = 0; x < f.w; x++) if (f.part[eyeY * f.w + x] === PART.eye) slits++;
    expect(slits).toBe(5); // 2 (far) + 3 (near) in the 3/4 view
  });

  it("flip negates normal.x and keeps glow in step with the image", () => {
    const a = idle0({ flip: false }), b = idle0({ flip: true });
    let checked = 0;
    for (let y = 0; y < a.h; y += 3)
      for (let x = 0; x < a.w; x++) {
        const ia = (y * a.w + x) * 4, ib = (y * a.w + (a.w - 1 - x)) * 4;
        if (!a.col[ia + 3] || !a.nrm[ia + 3]) continue;
        expect(b.col[ib]).toBe(a.col[ia]);
        expect(b.nrm[ib]).toBe(255 - (a.nrm[ia] ?? 0));
        expect(b.glw[ib]).toBe(a.glw[ia]);
        checked++;
      }
    expect(checked).toBeGreaterThan(500);
  });

  it("glow: mask 0.25 x colour, eyes and nib emissive, the cloak body has none", () => {
    const f = idle0({ outline: false, flip: false });
    let maskChecked = 0, eyes = 0, cloakGlow = 0, nib = 0;
    for (let i = 0; i < f.w * f.h; i++) {
      const id = f.part[i];
      if (!f.col[i * 4 + 3]) continue;
      if (id === PART.mask && f.glw[i * 4 + 3]) {
        for (let c = 0; c < 3; c++) expect(Math.abs((f.glw[i * 4 + c] ?? 0) - 0.25 * (f.col[i * 4 + c] ?? 0))).toBeLessThanOrEqual(1);
        maskChecked++;
      }
      if (id === PART.eye) { expect(f.glw[i * 4]).toBe(f.col[i * 4]); eyes++; }
      if (id === PART.cloak && f.glw[i * 4 + 3]) cloakGlow++;
      if (id === PART.staff && f.glw[i * 4 + 3]) nib++;
    }
    expect(maskChecked).toBeGreaterThan(80);
    expect(eyes).toBe(5);
    expect(cloakGlow).toBe(0);
    expect(nib).toBeGreaterThan(10);
  });

  it("anims: one anchor, no foot slide between idle frames, 3 distinct write nib points, catch palm and reach hooks", () => {
    const foot = (f: Raw): { bottom: number; nibX: number } => {
      let bottom = 0, nibX = -1;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.part[y * f.w + x] === PART.staff) { if (y >= bottom) { bottom = y; nibX = x; } }
      return { bottom, nibX };
    };
    const idle = NUL_ANIMS.idle.map((p: never) => foot(renderNulRaw(p, { outline: false, flip: false })));
    for (const f of idle) expect(f).toEqual(idle[0]);
    const tips = NUL_ANIMS.write.map(nulNibTip);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot((tips[i]?.x ?? 0) - (tips[j]?.x ?? 0), (tips[i]?.u ?? 0) - (tips[j]?.u ?? 0))).toBeGreaterThanOrEqual(4);
    const hands = (p: (typeof NUL_ANIMS.idle)[number]): number => {
      const f = renderNulRaw(p, { outline: false, flip: false });
      let n = 0;
      for (let i = 0; i < f.w * f.h; i++) if (f.part[i] === PART.hand) n++;
      return n;
    };
    const base = hands(NUL_ANIMS.idle[0] as never);
    expect(hands(NUL_ANIMS.catch[0] as never)).toBeGreaterThan(base + 10);
    expect(hands(NUL_ANIMS.reach[0] as never)).toBeGreaterThan(base + 10);
    expect(hands(NUL_ANIMS.reach[1] as never)).not.toBe(hands(NUL_ANIMS.reach[0] as never)); // fingers close on the pull beat
    // the write nib pixel really is where the pose says
    for (const p of NUL_ANIMS.write) {
      const f = renderNulRaw(p, { outline: false, flip: false }), t = nulNibTip(p);
      let near = false;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (f.part[(88 - Math.floor(t.u) + dy) * f.w + Math.floor(t.x) + dx] === PART.staff) near = true;
      expect(near).toBe(true);
    }
  });

  it("hem: pale page edge on the strips; glyphs stay beside the cloak and at most 10 tx high (F6/F7)", () => {
    const f = idle0({ outline: false, flip: false });
    let pale = 0, glyphs = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x, id = f.part[i];
        if (id === PART.cloak && f.col[i * 4] === 122 && f.col[i * 4 + 1] === 118) pale++;
        if (id === PART.glyph) glyphs++;
      }
    expect(pale).toBeGreaterThan(5);
    expect(glyphs).toBeGreaterThan(5);
    // every frame of the anims that sit on the ground (intro and rise keep their lift): glyph rows <= 10.5 tx above the foot line
    for (const [k, poses] of Object.entries(NUL_ANIMS)) {
      if (k === "atk" || k === "intro" || k === "rise") continue;
      poses.forEach((p: never, n: number) => {
        const g = renderNulRaw(p, { outline: false, flip: false });
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.part[y * g.w + x] === PART.glyph) expect(88 - y - 0.5, `${k}[${n}] glyph height (row centre above the foot line)`).toBeLessThanOrEqual(10.5);
      });
    }
  });

  it("hem glyphs never sit over the body: no glyph px has body on both sides within 3 px (F6)", () => {
    for (const [k, poses] of Object.entries(NUL_ANIMS)) {
      if (k === "atk") continue;
      poses.forEach((p: never, n: number) => {
        const g = renderNulRaw(p, { outline: false, flip: false });
        const body = (x: number, y: number): boolean => { const id = g.part[y * g.w + x] ?? 0; return x >= 0 && x < g.w && id !== 0 && id !== PART.glyph; };
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
          if (g.part[y * g.w + x] !== PART.glyph) continue;
          let l = false, r = false;
          for (let d = 1; d <= 3; d++) { if (body(x - d, y)) l = true; if (body(x + d, y)) r = true; }
          expect(l && r, `${k}[${n}] glyph at ${x},${y} is over the body`).toBe(false);
        }
      });
    }
  });

  it("cloak folds read (F2): 12-18% of cloak px at ramp index >= 4 in idle[0]; sprite luma stays >= 10:1; forehead : cloak >= 6.5", () => {
    const f = idle0({ outline: false, flip: false });
    const idx = new Map<string, number>(NUL_PAL.INK.map((c: number[], i: number): [string, number] => [`${c[0]},${c[1]},${c[2]}`, i]));
    let n = 0, hi = 0, ms = 0, mn = 0, cs = 0, cn = 0;
    for (let i = 0; i < f.w * f.h; i++) {
      if (f.part[i] === PART.cloak) {
        const k = idx.get(`${f.col[i * 4]},${f.col[i * 4 + 1]},${f.col[i * 4 + 2]}`);
        if (k === undefined) continue; // pale hem strip edge
        n++; if (k >= 4) hi++;
        cs += pixLum(f, i); cn++;
      }
      if (f.part[i] === PART.mask) { ms += pixLum(f, i); mn++; }
    }
    expect(hi / n).toBeGreaterThanOrEqual(0.12);
    expect(hi / n).toBeLessThanOrEqual(0.18);
    expect((ms / mn + 0.05) / (cs / cn + 0.05)).toBeGreaterThanOrEqual(10);
  });

  it("intro[3] eye slits stay two separate slits: the 2 gap px on the eye row carry no glow (F4)", () => {
    const f = renderNulRaw(NUL_ANIMS.intro[3], { outline: false, flip: false });
    const eyes: number[] = [];
    let row = -1;
    for (let i = 0; i < f.w * f.h; i++) if (f.part[i] === PART.eye) { eyes.push(i % f.w); row = Math.floor(i / f.w); }
    expect(eyes.length).toBe(5);
    eyes.sort((a, b) => a - b);
    const gap = [] as number[];
    for (let x = (eyes[1] as number) + 1; x < (eyes[2] as number); x++) gap.push(x);
    expect(gap.length).toBe(2);
    for (const x of gap) for (let c = 0; c < 4; c++) expect(f.glw[(row * f.w + x) * 4 + c]).toBe(0);
  });

  it("outline ring carries a valid flat normal, not the 0,0,0,0 that decodes to (-1,-1,-1) (F8)", () => {
    const f = idle0();
    let ring = 0;
    for (let i = 0; i < f.w * f.h; i++) if (f.col[i * 4 + 3] && f.part[i] === 0) { ring++; expect([f.nrm[i * 4], f.nrm[i * 4 + 1], f.nrm[i * 4 + 2], f.nrm[i * 4 + 3]]).toEqual([127, 128, 255, 255]); } // flipped by default: 255 - 128
    expect(ring).toBeGreaterThan(100);
  });

  it("ward variant is a rim only: it changes only the 1 px outline ring", () => {
    const base = idle0(), ward = wardRaw(base);
    let changed = 0;
    for (let i = 0; i < base.w * base.h; i++) {
      if (ward.col[i * 4] !== base.col[i * 4] || ward.col[i * 4 + 2] !== base.col[i * 4 + 2]) {
        changed++;
        expect(base.part[i]).toBe(0); // outline pixels carry no part id
      }
    }
    expect(changed).toBeGreaterThan(100);
    expect(changed).toBeLessThan(base.w * base.h * 0.08);
  });

  it("generates all 22 frames quickly (cold)", () => {
    const t0 = performance.now();
    for (const [k, poses] of Object.entries(NUL_ANIMS)) if (k !== "atk") for (const p of poses) renderNulRaw(p);
    expect(performance.now() - t0).toBeLessThan(60);
  });
});

/**
 * T2.6 spec 12.3: the next letter stays legible at tier 4 and max intensity.
 * Every 0.1 s over 10 s, for every target plate:
 *   1. the existing invariants (`checkSnapshot`) hold;
 *   2. next-letter pixel test: the next letter's cell is read from the HUD canvas with typing FX on
 *      and again with FX off at the same frame; the FX-off crop defines the glyph mask. With FX on,
 *      WCAG contrast(mean glyph luminance, mean non-glyph luminance) >= 4.5 (or within 0.15 of the
 *      FX-off baseline) and mask IoU >= 0.85.
 * The pixels come from the HUD canvas (the layer above WebGL, so the world can never touch a letter);
 * plate backgrounds are 96-97% opaque, so the world contributes at most a few percent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "../vfx/helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(240_000);

interface Result {
  samples: number;
  checked: number;
  violations: string[];
  minContrast: number;
  minDelta: number;
  minCell: number;
  minIoU: number;
  maxClutter: number;
  maxSparks: number;
  maxStreaks: number;
  typoSamples: number;
  dumps: { t: number; on: string; off: string }[];
}

const CASES = [
  { name: "forest-40wpm", params: "wpm=40&tier=4&biome=forest&typoAt=2.2,4.4,6.6,8.8" },
  { name: "forest-90wpm", params: "wpm=90&tier=4&biome=forest&typoAt=2.5,5,7.5" },
  { name: "cave-40wpm", params: "wpm=40&tier=4&biome=cave&typoAt=3,6,9" },
  { name: "cave-90wpm", params: "wpm=90&tier=4&biome=cave&typoAt=3.3,6.6" },
  { name: "boss-40wpm", params: "wpm=40&tier=4&boss=1&typoAt=4,8" },
];

for (const c of CASES) {
  test(`next letter stays legible at tier 4, intensity 1: ${c.name}`, async ({ page }) => {
    const errors = await openTyping(page, `${c.params}&intensity=1&at=1.5`);
    const res: Result = await page.evaluate(() => {
      const api = window.__typingVfx;
      if (!api) throw new Error("no hook");
      const out: Result = {
        samples: 0,
        checked: 0,
        violations: [],
        minContrast: 99,
        minDelta: 99,
        minCell: 99,
        minIoU: 1,
        maxClutter: 0,
        maxSparks: 0,
        maxStreaks: 0,
        typoSamples: 0,
        dumps: [],
      };
      const cv = document.getElementById("hud") as HTMLCanvasElement;
      const ctx = cv.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      const lin = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const crop = (r: { x: number; y: number; w: number; h: number }) => {
        const x = Math.max(0, Math.floor(r.x));
        const y = Math.max(0, Math.floor(r.y));
        const w = Math.max(1, Math.min(cv.width - x, Math.ceil(r.w)));
        const h = Math.max(1, Math.min(cv.height - y, Math.ceil(r.h)));
        const d = ctx.getImageData(x, y, w, h).data;
        const luma = new Float32Array(w * h); // perceptual 0..1 (mask)
        const rel = new Float32Array(w * h); // relative luminance (contrast)
        for (let i = 0; i < w * h; i++) {
          const a = (d[i * 4 + 3] as number) / 255;
          // composite over black
          const r8 = (d[i * 4] as number) * a;
          const g8 = (d[i * 4 + 1] as number) * a;
          const b8 = (d[i * 4 + 2] as number) * a;
          luma[i] = (0.299 * r8 + 0.587 * g8 + 0.114 * b8) / 255;
          rel[i] = 0.2126 * lin(r8) + 0.7152 * lin(g8) + 0.0722 * lin(b8);
        }
        return { w, h, luma, rel };
      };
      // glyph pixels = pixels brighter than 80% of the crop's own peak (95th percentile) luma. For a
      // white next letter that is ~0.8 (clear of its cream halo, which tops out near 0.7); for a red
      // typo glyph (luma ~0.5) it adapts, so the colour change itself is not read as a missing glyph.
      const peak = (l: Float32Array): number =>
        Math.max(0.3, Array.from(l).sort((x, y) => x - y)[Math.floor(l.length * 0.95)] ?? 1);
      const nextLetter = (): { rect: { x: number; y: number; w: number; h: number } } | null => {
        const v = api.driver().view;
        const id = v.targetPlateId;
        const p = v.plates.find((q) => q.id === id);
        if (!p || p.typedIndex >= p.text.length || p.text[p.typedIndex] === " ") return null;
        const r = api.hud.getLetterRect(p.id, p.typedIndex);
        // analyse the glyph rows only: the blinking underline strip (bottom 5 px of the cell) moves by a
        // sub-pixel with the plate bounce and is not part of the glyph
        return r ? { rect: { x: r.x, y: r.y, w: r.w, h: Math.max(10, r.h - 5) } } : null;
      };
      let lastTypo = -99;
      for (let s = 0; s < 100; s++) {
        api.step(100);
        out.samples++;
        for (const v of api.readability()) out.violations.push(`t=${s / 10}s ${v}`);
        const st = api.stats();
        out.maxSparks = Math.max(out.maxSparks, st.sparks);
        out.maxStreaks = Math.max(out.maxStreaks, st.streaks);
        if ((api.eventCounts().Typo ?? 0) > lastTypo) {
          lastTypo = api.eventCounts().Typo ?? 0;
          out.typoSamples++;
        }
        const on = nextLetter();
        if (!on) continue;
        const a = crop(on.rect);
        api.typing.setEnabled(false);
        api.redrawHud();
        const off = nextLetter();
        const b = off ? crop(off.rect) : null;
        api.typing.setEnabled(true);
        api.redrawHud();
        if (!b || a.w !== b.w || a.h !== b.h) continue;
        out.checked++;
        // Glyph masks. FX-off core (luma > 0.5) is the reference glyph. FX-on is compared at the best
        // +-3 px alignment, which covers the spec'd typo jitter (+-2 px), the plate bounce (<= 4 px,
        // moves the whole plate) and sub-pixel anti-aliasing. The FX-on mask only counts pixels within
        // 3 px of the reference glyph: a popped neighbour (scale 1.35, spec R4) legitimately overhangs
        // the cell edge, and the cell-clutter check below bounds that separately.
        const W = a.w;
        const H = a.h;
        const pOn = peak(a.luma);
        const pOff = peak(b.luma);
        const mOn = new Uint8Array(W * H);
        const mOff = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
          mOn[i] = (a.luma[i] as number) > 0.8 * pOn ? 1 : 0;
          mOff[i] = (b.luma[i] as number) > 0.8 * pOff ? 1 : 0;
        }
        const at = (m: Uint8Array, x: number, y: number): number =>
          x >= 0 && y >= 0 && x < W && y < H ? (m[y * W + x] as number) : 0;
        // is there a set pixel of `m` within r px of (x, y)?
        const near = (m: Uint8Array, x: number, y: number, r: number): boolean => {
          for (let oy = -r; oy <= r; oy++)
            for (let ox = -r; ox <= r; ox++) if (at(m, x + ox, y + oy)) return true;
          return false;
        };
        // shift the FX-off mask by (dx, dy) so it lines up with the FX-on crop
        const shifted = (dx: number, dy: number): Uint8Array => {
          const out = new Uint8Array(W * H);
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) out[y * W + x] = at(mOff, x - dx, y - dy);
          return out;
        };
        // tolerant IoU: a glyph pixel counts as matched when the other mask has a pixel within 1 px
        // (sub-pixel anti-aliasing noise floor of a 3 px pixel-font stroke); FX-on pixels farther than
        // 3 px from the glyph are ignored here and bounded by the clutter check below
        let iou = 0;
        let best = shifted(0, 0);
        // smallest shifts first, so ties (the 1 px tolerance makes several shifts score the same) keep
        // the least displacement
        const shifts: [number, number][] = [];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) shifts.push([dx, dy]);
        shifts.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]));
        for (const [dx, dy] of shifts) {
          const off = shifted(dx, dy);
          let nOff = 0;
          let nOffHit = 0;
          let nOn = 0;
          let nOnHit = 0;
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              if (off[y * W + x]) {
                nOff++;
                if (near(mOn, x, y, 1)) nOffHit++;
              }
              if (mOn[y * W + x] && near(off, x, y, 3)) {
                nOn++;
                if (near(off, x, y, 1)) nOnHit++;
              }
            }
          const v = nOff + nOn === 0 ? 1 : (nOffHit + nOnHit) / (nOff + nOn);
          if (v > iou) {
            iou = v;
            best = off;
          }
        }
        // cell clutter: bright FX-on pixels farther than 3 px from the reference glyph
        let clutter = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) if (mOn[y * W + x] && !near(best, x, y, 3)) clutter++;
        const clutterFrac = clutter / (W * H);
        out.maxClutter = Math.max(out.maxClutter, clutterFrac);
        if (clutterFrac > 0.35)
          out.violations.push(
            `t=${s / 10}s next-letter cell clutter ${clutterFrac.toFixed(2)} > 0.35`,
          );
        // Contrast of the glyph core (FX-off mask, best alignment, 1 px eroded so anti-aliased edges do
        // not count) against (a) everything else in the cell: the spec 12.3 metric, which must be
        // >= 4.5, and (b) `ring`, the pixels 1..2 px around the core: the dark outline the glyph is
        // actually read against. The next letter carries a cream glow in the base UI, so the ring
        // baseline itself sits near 4.3-5 with FX off; the ring must stay >= 3 (WCAG AA for large text:
        // these are 22-24 px bold glyphs) with FX on, including typo frames.
        const ratio = (
          rel: Float32Array,
          mask: Uint8Array,
          ringOnly: boolean,
        ): { c: number; lg: number; ln: number } => {
          let g = 0;
          let n = 0;
          let cg = 0;
          let cn = 0;
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const i = y * W + x;
              if (mask[i]) {
                // glyph luminance from the interior (1 px eroded): anti-aliased edge pixels move with
                // the plate bounce's sub-pixel offset and are not what makes the glyph readable
                let inner = true;
                for (let oy = -1; oy <= 1 && inner; oy++)
                  for (let ox = -1; ox <= 1; ox++) if (!at(mask, x + ox, y + oy)) inner = false;
                if (inner) {
                  g += rel[i] as number;
                  cg++;
                }
              } else if (!ringOnly || near(mask, x, y, 2)) {
                n += rel[i] as number;
                cn++;
              }
            }
          const lg = cg ? g / cg : 1;
          const ln = cn ? n / cn : 0;
          return { c: (Math.max(lg, ln) + 0.05) / (Math.min(lg, ln) + 0.05), lg, ln };
        };
        const onC = ratio(a.rel, best, true);
        const offC = ratio(b.rel, mOff, true);
        const cellC = ratio(a.rel, best, false);
        const contrast = onC.c;
        out.minContrast = Math.min(out.minContrast, contrast);
        out.minCell = Math.min(out.minCell, cellC.c);
        out.minDelta = Math.min(out.minDelta, contrast - offC.c);
        const bad = contrast < 3 || cellC.c < 4.5;
        if (bad && out.dumps.length < 4) {
          const mk = (rect: { x: number; y: number; w: number; h: number }): string => {
            const o = document.createElement("canvas");
            o.width = 250;
            o.height = 360;
            const c2 = o.getContext("2d") as CanvasRenderingContext2D;
            c2.imageSmoothingEnabled = false;
            c2.fillStyle = "#000";
            c2.fillRect(0, 0, o.width, o.height);
            c2.drawImage(cv, rect.x - 6, rect.y - 3, 25, 36, 0, 0, 250, 360);
            return o.toDataURL("image/png");
          };
          out.dumps.push({ t: s, on: mk(on.rect), off: "" });
        }
        if (bad)
          out.violations.push(
            `t=${s / 10}s next-letter contrast ring ${contrast.toFixed(2)} (< 3) / cell ${cellC.c.toFixed(2)} (< 4.5) (FX off ${offC.c.toFixed(2)} g${offC.lg.toFixed(3)} r${offC.ln.toFixed(3)}; glyph ${onC.lg.toFixed(3)} ring ${onC.ln.toFixed(3)})`,
          );
        out.minIoU = Math.min(out.minIoU, iou);
        if (iou < 0.85)
          out.violations.push(`t=${s / 10}s next-letter IoU ${iou.toFixed(2)} < 0.85`);
      }
      return out;
    });
    if (process.env.READ_DUMP)
      for (const d of res.dumps)
        fs.writeFileSync(
          path.join(dir, "..", "vfx", "__captures__", `read-${c.name}-${d.t}.png`),
          Buffer.from(d.on.split(",")[1] as string, "base64"),
        );
    console.log(
      `readability ${c.name}: ${JSON.stringify({ ...res, violations: res.violations.length, dumps: res.dumps.length })}`,
    );
    expect(res.violations).toEqual([]);
    expect(res.checked).toBeGreaterThan(30);
    expect(res.maxSparks, "the FX must actually be running").toBeGreaterThan(10);
    expect(res.typoSamples, "typo glitch frames are part of the sweep").toBeGreaterThan(0);
    expect(res.minCell, "spec 12.3 cell contrast").toBeGreaterThanOrEqual(4.5);
    expect(res.minContrast, "ring contrast").toBeGreaterThanOrEqual(3);
    expect(res.maxClutter).toBeLessThanOrEqual(0.35);
    expect(res.minIoU).toBeGreaterThanOrEqual(0.85);
    expect(errors).toEqual([]);
  });
}

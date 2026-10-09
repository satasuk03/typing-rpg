import { clamp } from "../util";

/**
 * Derive a tangent-space normal map from a sprite's alpha: distance-to-edge bulge plus a gentle
 * global roundness (the automated version of SpriteIlluminator). Ported from the POC `normalMapOf`.
 * Returns RGBA bytes (alpha 255 where the sprite is opaque, 0 elsewhere) so it is testable without a DOM.
 */
export function normalMapData(
  alpha: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  bulge = 1,
  R = 3,
): Uint8ClampedArray {
  const A = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && (alpha[(y * w + x) * 4 + 3] ?? 0) > 0;
  const H = new Float32Array(w * h);
  let minx = w;
  let maxx = 0;
  let miny = h;
  let maxy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!A(x, y)) continue;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      let best = R + 1;
      for (let j = -R; j <= R; j++) {
        for (let i = -R; i <= R; i++) {
          if (!A(x + i, y + j)) {
            const dd = Math.hypot(i, j);
            if (dd < best) best = dd;
          }
        }
      }
      const k = clamp(best / (R + 1), 0, 1);
      H[y * w + x] = Math.sqrt(1 - (1 - k) * (1 - k));
    }
  }
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  const hw = Math.max(4, (maxx - minx) / 2);
  const hh = Math.max(4, (maxy - miny) / 2);
  const out = new Uint8ClampedArray(w * h * 4);
  const g = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (H[y * w + x] ?? 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!A(x, y)) continue;
      const i = (y * w + x) * 4;
      let nx = (g(x - 1, y) - g(x + 1, y)) * 1.6 * bulge;
      let ny = (g(x, y + 1) - g(x, y - 1)) * 1.6 * bulge;
      nx += ((x - cx) / hw) * 0.45 * bulge;
      ny += ((cy - y) / hh) * 0.25 * bulge;
      const nz = 1;
      const L = Math.hypot(nx, ny, nz);
      out[i] = Math.round((nx / L) * 0.5 * 255 + 127.5);
      out[i + 1] = Math.round((ny / L) * 0.5 * 255 + 127.5);
      out[i + 2] = Math.round((nz / L) * 0.5 * 255 + 127.5);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Canvas wrapper around {@link normalMapData}. */
export function normalMapCanvas(
  src: CanvasImageSource & { width: number; height: number },
  bulge = 1,
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const nm = normalMapData(data, w, h, bulge);
  const img = ctx.createImageData(w, h);
  img.data.set(nm);
  ctx.putImageData(img, 0, 0);
  return c;
}

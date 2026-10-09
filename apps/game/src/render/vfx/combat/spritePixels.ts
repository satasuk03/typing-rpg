/**
 * Sprite pixel samples for the death dissolve (POC `pixelsOf`): for a frame, a fixed set of opaque texels as
 * (u, v, r, g, b) with u/v in 0..1 of the image (v from the top). Built once per frame object and cached, so a
 * death only reads typed arrays. Needs a DOM 2D canvas (browser only); returns an empty set without one.
 */
import type { SpriteFrame } from "../../sprites/SpriteSource";

export interface PixelSamples {
  n: number;
  /** u, v, r, g, b per sample (rgb 0..1). */
  data: Float32Array;
}

const MAX = 256;
const EMPTY: PixelSamples = { n: 0, data: new Float32Array(0) };
const cache = new WeakMap<SpriteFrame, PixelSamples>();
let scratch: HTMLCanvasElement | null = null;

export function pixelSamples(f: SpriteFrame): PixelSamples {
  const hit = cache.get(f);
  if (hit) return hit;
  let out = EMPTY;
  try {
    if (typeof document !== "undefined") {
      scratch ??= document.createElement("canvas");
      const w = f.img.width;
      const h = f.img.height;
      scratch.width = w;
      scratch.height = h;
      const ctx = scratch.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(f.img as CanvasImageSource, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        let opaque = 0;
        for (let i = 3; i < d.length; i += 4) if ((d[i] as number) > 127) opaque++;
        const step = Math.max(1, Math.floor(opaque / MAX));
        const data = new Float32Array(MAX * 5);
        let n = 0;
        let seen = 0;
        for (let i = 0; i < w * h && n < MAX; i++) {
          if ((d[i * 4 + 3] as number) <= 127) continue;
          if (seen++ % step !== 0) continue;
          const o = n * 5;
          data[o] = ((i % w) + 0.5) / w;
          data[o + 1] = (Math.floor(i / w) + 0.5) / h;
          data[o + 2] = (d[i * 4] as number) / 255;
          data[o + 3] = (d[i * 4 + 1] as number) / 255;
          data[o + 4] = (d[i * 4 + 2] as number) / 255;
          n++;
        }
        out = { n, data };
      }
    }
  } catch {
    out = EMPTY;
  }
  cache.set(f, out);
  return out;
}

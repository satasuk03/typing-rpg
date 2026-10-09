/**
 * Hero readability probe (pure pixel maths, shared by the typing scene's `heroProbe`, the play-scene silhouette
 * test and the cave contrast test). Inputs are two RGBA crops of the SAME frame: the hero shown and the hero
 * hidden. The hero mask is every pixel that differs between them.
 *
 *   area      = mask pixels (a washed-out or covered hero loses area)
 *   edge      = Sobel edge energy over the mask, in the shown frame (a white-out loses edges)
 *   contrast  = luminance contrast between the hero's mean linear luminance and the mean of the surround: the
 *               pixels of the crop outside the mask, up to `ring` px away from the mask's bounding box (WCAG form
 *               (L1 + 0.05) / (L2 + 0.05), always >= 1)
 */

export interface HeroMetrics {
  area: number;
  edge: number;
  contrast: number;
  /** Mean linear luminance of the hero mask and of the surround. */
  heroLum: number;
  surroundLum: number;
}

const lin = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const relLum = (r: number, g: number, b: number): number =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/**
 * @param shown  RGBA of the crop with the hero
 * @param hidden RGBA of the same crop without the hero
 * @param w,h    crop size; the crop is expected to include a `ring` px margin around the hero for the surround
 * @param thr    colour distance above which a pixel belongs to the hero
 * @param ring   surround width in px
 */
export function analyseHero(
  shown: Uint8ClampedArray,
  hidden: Uint8ClampedArray,
  w: number,
  h: number,
  thr = 24,
  ring = 64,
): HeroMetrics {
  const mask = new Uint8Array(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  let heroSum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = (shown[i] as number) - (hidden[i] as number);
      const dg = (shown[i + 1] as number) - (hidden[i + 1] as number);
      const db = (shown[i + 2] as number) - (hidden[i + 2] as number);
      if (Math.hypot(dr, dg, db) <= thr) continue;
      mask[y * w + x] = 1;
      area++;
      heroSum += relLum(shown[i] as number, shown[i + 1] as number, shown[i + 2] as number);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  let edge = 0;
  const L = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    return (
      0.2126 * (shown[i] as number) +
      0.7152 * (shown[i + 1] as number) +
      0.0722 * (shown[i + 2] as number)
    );
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!mask[y * w + x]) continue;
      const gx =
        L(x + 1, y - 1) +
        2 * L(x + 1, y) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x - 1, y) -
        L(x - 1, y + 1);
      const gy =
        L(x - 1, y + 1) +
        2 * L(x, y + 1) +
        L(x + 1, y + 1) -
        L(x - 1, y - 1) -
        2 * L(x, y - 1) -
        L(x + 1, y - 1);
      edge += Math.hypot(gx, gy);
    }
  }
  let surSum = 0;
  let surN = 0;
  if (area > 0) {
    const x0 = Math.max(0, minX - ring);
    const x1 = Math.min(w - 1, maxX + ring);
    const y0 = Math.max(0, minY - ring);
    const y1 = Math.min(h - 1, maxY + ring);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue; // inside the hero box
        const i = (y * w + x) * 4;
        surSum += relLum(hidden[i] as number, hidden[i + 1] as number, hidden[i + 2] as number);
        surN++;
      }
    }
  }
  const heroLum = area > 0 ? heroSum / area : 0;
  const surroundLum = surN > 0 ? surSum / surN : 0;
  const hi = Math.max(heroLum, surroundLum);
  const lo = Math.min(heroLum, surroundLum);
  return { area, edge, contrast: (hi + 0.05) / (lo + 0.05), heroLum, surroundLum };
}

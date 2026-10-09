/** Pre-rendered radial glow sprites, one per palette colour. Pools draw them with drawImage (no shadowBlur). */
import { parseHex } from "../../theme";
import { FILL, GLOW_INDICES, I_BUCKET, I_TIER } from "./palette";

export type GlowSprites = (HTMLCanvasElement | undefined)[];
export const GLOW_SIZE = 64;

export function buildGlowSprites(): GlowSprites {
  const out: GlowSprites = [];
  for (const idx of GLOW_INDICES) {
    const cv = document.createElement("canvas");
    cv.width = GLOW_SIZE;
    cv.height = GLOW_SIZE;
    const c = cv.getContext("2d");
    if (!c) continue;
    const r = GLOW_SIZE / 2;
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    const col = FILL[idx] as string;
    // hot white-ish core, coloured falloff
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.18, col);
    g.addColorStop(0.5, `${col}55`);
    g.addColorStop(1, `${col}00`);
    c.fillStyle = g;
    c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    out[idx] = cv;
  }
  return out;
}

/** Draw a glow of radius r (CSS px) centred at x,y. Caller sets the composite op. */
export function drawGlow(
  c: CanvasRenderingContext2D,
  sprites: GlowSprites,
  idx: number,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  const s = sprites[idx];
  if (!s || alpha <= 0.003) return;
  c.globalAlpha = alpha > 1 ? 1 : alpha;
  c.drawImage(s, x - r, y - r, r * 2, r * 2);
}
/** Same, stretched to an ellipse (plate back-glow). */
export function drawGlowRect(
  c: CanvasRenderingContext2D,
  sprites: GlowSprites,
  idx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
): void {
  const s = sprites[idx];
  if (!s || alpha <= 0.003) return;
  c.globalAlpha = alpha > 1 ? 1 : alpha;
  c.drawImage(s, x, y, w, h);
}

// ---------------------------------------------------------------- plate halo (9-slice soft glow)

export const HALO_SIZE = 128;
/** Width of the soft falloff in source px (also the 9-slice corner size). */
export const HALO_PAD = 48;

/**
 * Soft rounded-rectangle halo, pre-rendered once per colour: alpha is 1 inside the (small) core
 * rectangle and falls off smoothly with the distance to it (a gaussian-ish profile, no banding).
 * Drawn 9-sliced around any plate size, so one tiny sprite serves every plate.
 */
export function buildHaloSprites(): GlowSprites {
  const out: GlowSprites = [];
  const idxs = [
    I_TIER + 1,
    I_TIER + 2,
    I_TIER + 3,
    ...Array.from({ length: 12 }, (_, i) => I_BUCKET + i),
  ];
  const N = HALO_SIZE;
  const core = HALO_PAD; // core rect = [core, N - core]
  const rc = 10; // core corner radius
  for (const idx of idxs) {
    const cv = document.createElement("canvas");
    cv.width = N;
    cv.height = N;
    const c = cv.getContext("2d");
    if (!c) continue;
    const img = c.createImageData(N, N);
    const [r, g, b] = parseHex(FILL[idx] as string);
    const half = N / 2 - core;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const qx = Math.abs(x + 0.5 - N / 2) - (half - rc);
        const qy = Math.abs(y + 0.5 - N / 2) - (half - rc);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rc; // signed distance to the core
        const u = Math.min(1, Math.max(0, d / core));
        // smooth, hot near the edge: (1-u)^2 with a soft shoulder
        const a = d <= 0 ? 1 : (1 - u) * (1 - u) * (1 - u * 0.35);
        const o = (y * N + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = Math.round(a * 255);
      }
    }
    c.putImageData(img, 0, 0);
    out[idx] = cv;
  }
  return out;
}

/**
 * Draw a halo around the rect (x, y, w, h): its core edge sits ON the rect edge and the falloff extends
 * `ext` CSS px outward. Nine drawImage calls from the shared sprite.
 */
export function drawHalo(
  c: CanvasRenderingContext2D,
  sprites: GlowSprites,
  idx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  ext: number,
  alpha: number,
): void {
  const s = sprites[idx];
  if (!s || alpha <= 0.003) return;
  c.globalAlpha = alpha > 1 ? 1 : alpha;
  const P = HALO_PAD;
  const M = HALO_SIZE - 2 * P; // middle source size
  const x0 = x - ext;
  const y0 = y - ext;
  const iw = w;
  const ih = h;
  // corners
  c.drawImage(s, 0, 0, P, P, x0, y0, ext, ext);
  c.drawImage(s, P + M, 0, P, P, x + iw, y0, ext, ext);
  c.drawImage(s, 0, P + M, P, P, x0, y + ih, ext, ext);
  c.drawImage(s, P + M, P + M, P, P, x + iw, y + ih, ext, ext);
  // edges
  c.drawImage(s, P, 0, M, P, x, y0, iw, ext);
  c.drawImage(s, P, P + M, M, P, x, y + ih, iw, ext);
  c.drawImage(s, 0, P, P, M, x0, y, ext, ih);
  c.drawImage(s, P + M, P, P, M, x + iw, y, ext, ih);
  // (no centre piece: the plate is 96% opaque, so the area under it is never seen)
}

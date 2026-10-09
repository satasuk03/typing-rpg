/** Pre-rendered radial glow sprites, one per palette colour. Pools draw them with drawImage (no shadowBlur). */
import { FILL, GLOW_INDICES } from "./palette";

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

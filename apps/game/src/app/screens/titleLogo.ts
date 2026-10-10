/**
 * Pixel-art "TYPING ADVENTURE" logo. Text is rasterised once into a tiny logical canvas (Press Start 2P),
 * thresholded to hard pixels, then composed per pixel: dark outline, hard drop shadow, banded gold fill.
 * The canvas is shown with image-rendering:pixelated at an integer CSS scale.
 */

const W = 160;
const H = 52;
const FONT = "'Press Start 2P'";

type Rgb = [number, number, number];
const hex = (s: string): Rgb => [
  Number.parseInt(s.slice(1, 3), 16),
  Number.parseInt(s.slice(3, 5), 16),
  Number.parseInt(s.slice(5, 7), 16),
];

/** Stepped bands, top to bottom, per text line. */
const BANDS_BIG = ["#fff4b8", "#ffe070", "#ffc030", "#f09020", "#c2601a", "#8e3c14"].map(hex);
const BANDS_SMALL = ["#ffffff", "#e8f4ff", "#a8d0f0", "#6a9cd0"].map(hex);
const OUTLINE = hex("#1a0b10");
const SHADOW = hex("#0a0408");
const HILITE = hex("#fffbe0");

interface Line {
  text: string;
  size: number;
  y: number; // baseline-ish top of the glyph box
  spacing: number;
  bands: Rgb[];
}

const LINES: Line[] = [
  { text: "TYPING", size: 16, y: 3, spacing: 10, bands: BANDS_SMALL },
  { text: "ADVENTURE", size: 16, y: 27, spacing: 0, bands: BANDS_BIG },
];

function maskFor(line: Line): Uint8Array {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.font = `${line.size}px ${FONT}`;
  g.textBaseline = "top";
  g.fillStyle = "#fff";
  const adv = line.size + line.spacing;
  const total = line.text.length * adv - line.spacing;
  let x = Math.round((W - total) / 2);
  for (const ch of line.text) {
    g.fillText(ch, x, line.y);
    x += adv;
  }
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = (d[i * 4 + 3] as number) > 110 ? 1 : 0;
  return m;
}

/** Radius-2 rounded dilation (no sharp corners) so the outline is chunky but stepped. */
function dilate(src: Uint8Array, r: number): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!src[y * W + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r + 1) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
        }
    }
  return out;
}

export interface Logo {
  base: HTMLCanvasElement;
  glint: HTMLCanvasElement;
}

/** Builds the base logo canvas and a white silhouette canvas used by the CSS glint sweep. */
export function drawLogo(): Logo {
  const base = document.createElement("canvas");
  const glint = document.createElement("canvas");
  base.width = glint.width = W;
  base.height = glint.height = H;
  const g = base.getContext("2d") as CanvasRenderingContext2D;
  const gg = glint.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(W, H);
  const gimg = gg.createImageData(W, H);
  const put = (im: ImageData, x: number, y: number, c: Rgb): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    im.data[i] = c[0];
    im.data[i + 1] = c[1];
    im.data[i + 2] = c[2];
    im.data[i + 3] = 255;
  };
  const masks = LINES.map(maskFor);
  const all = new Uint8Array(W * H);
  for (const m of masks) for (let i = 0; i < m.length; i++) if (m[i]) all[i] = 1;
  const outline = dilate(all, 2);
  // hard drop shadow: the outlined silhouette shifted down 3 px
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (outline[y * W + x]) put(img, x, y + 3, SHADOW);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (outline[y * W + x]) put(img, x, y, OUTLINE);
  // banded fill per line, measured on each line's own glyph rows
  masks.forEach((m, li) => {
    const line = LINES[li] as Line;
    const top = line.y;
    const bh = line.size;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!m[y * W + x]) continue;
        const rel = Math.min(bh - 1, Math.max(0, y - top));
        const band = Math.min(line.bands.length - 1, Math.floor((rel / bh) * line.bands.length));
        put(img, x, y, line.bands[band] as Rgb);
        // 1px bevel highlight on the left/top edges of the glyph
        if (!m[y * W + x - 1] || !m[(y - 1) * W + x]) put(img, x, y, HILITE);
        put(gimg, x, y, [255, 255, 255]);
      }
  });
  g.putImageData(img, 0, 0);
  gg.putImageData(gimg, 0, 0);
  return { base, glint };
}

/** Pixel crest: a small sword flanked by gems, drawn from a string sprite (1 char = 1 logical px). */
const CREST = [
  "..........................................o..........................................",
  ".........................................ooo.........................................",
  "........................................o+++o........................................",
  "..........oo...........................o+###+o...........................oo..........",
  "..........o+o.........................o+#####+o.........................o+o..........",
  "..oooooooooo+oooooooooooooooooooooooooo+#####+oooooooooooooooooooooooooo+oooooooooo..",
  ".o++++++++++#+++++++++++++++++++++++++++#####+++++++++++++++++++++++++++#++++++++++o.",
  "..oooooooooo+oooooooooooooooooooooooooo+#####+oooooooooooooooooooooooooo+oooooooooo..",
  "..........o+o.........................o+#####+o.........................o+o..........",
  "..........oo...........................o+###+o...........................oo..........",
  "........................................o+++o........................................",
  ".........................................ooo.........................................",
  "..........................................o..........................................",
];
const CREST_PAL: Record<string, string> = { o: "#1a0b10", "+": "#ffc030", "#": "#fff4b8" };

export function drawCrest(): HTMLCanvasElement {
  const w = (CREST[0] as string).length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = CREST.length;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  CREST.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = CREST_PAL[row[x] as string];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

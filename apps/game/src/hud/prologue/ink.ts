/**
 * The ink-calligraphy line ("I unwrite you.", one letter per charMs, an echo of the player's own typing) and the centre
 * captions. Both are drawn above WebGL. Letters bloom in (scale + alpha), the ink bleeds a drip under some of them.
 */
import type { Ctx } from "../draw";
import { clamp, eOut } from "../draw";
import { FONT_DISP } from "../theme";
import { INK_FONT } from "./geometry";

export const INK_BLOOM_S = 0.24;
const SLANT = -0.14;

export interface InkLayout {
  text: string;
  xs: number[];
  widths: number[];
  total: number;
}

export function measureInk(c: Ctx, text: string): InkLayout {
  c.font = `900 ${INK_FONT}px ${FONT_DISP}`;
  c.letterSpacing = "2px";
  const xs: number[] = [];
  const widths: number[] = [];
  for (let i = 0; i < text.length; i++) {
    xs.push(c.measureText(text.slice(0, i)).width);
    widths.push(c.measureText(text[i] as string).width);
  }
  const total = c.measureText(text).width;
  c.letterSpacing = "0px";
  return { text, xs, widths, total };
}

function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function drawInk(
  c: Ctx,
  lay: InkLayout,
  cx: number,
  baseY: number,
  shown: number,
  births: readonly number[],
  clock: number,
  alpha: number,
  intensity: number,
  reducedMotion: boolean,
): void {
  if (alpha <= 0.01) return;
  const left = cx - lay.total / 2;
  c.save();
  c.globalAlpha = alpha;
  c.font = `900 ${INK_FONT}px ${FONT_DISP}`;
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.lineJoin = "round";
  c.letterSpacing = "2px";
  for (let i = 0; i < Math.min(shown, lay.text.length); i++) {
    const ch = lay.text[i] as string;
    if (ch === " ") continue;
    const age = clock - (births[i] ?? clock - 9);
    const k = clamp(age / INK_BLOOM_S, 0, 1);
    const sc = reducedMotion ? 1 : 1 + 0.4 * (1 - eOut(k));
    const a = reducedMotion ? 1 : clamp(age / 0.09, 0, 1);
    const w = lay.widths[i] ?? 0;
    c.save();
    c.globalAlpha = alpha * a;
    c.translate(left + (lay.xs[i] ?? 0) + w / 2, baseY);
    c.transform(1, 0, SLANT, 1, 0, 0);
    c.scale(sc, sc);
    if (age < 0.5 && intensity > 0) {
      c.shadowColor = "rgba(150,110,255,0.95)";
      c.shadowBlur = 22 * intensity * (1 - age / 0.5);
    }
    c.strokeStyle = "#160a30";
    c.lineWidth = 9;
    c.strokeText(ch, -w / 2, 0);
    const g = c.createLinearGradient(0, -INK_FONT * 0.75, 0, 0);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.55, "#d8ccff");
    g.addColorStop(1, "#8a6cff");
    c.fillStyle = g;
    c.fillText(ch, -w / 2, 0);
    c.shadowBlur = 0;
    // the ink bleeds: a drip under every third letter, growing after the bloom
    if (i % 3 === 0 && age > INK_BLOOM_S) {
      const len = (8 + hash(i * 13) * 16) * clamp((age - INK_BLOOM_S) / 0.7, 0, 1);
      c.fillStyle = "#b9a6ff";
      c.fillRect(-1 + (hash(i * 7) - 0.5) * w * 0.4, 6, 3, len);
      c.beginPath();
      c.arc(0.5 + (hash(i * 7) - 0.5) * w * 0.4, 6 + len + 2, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  c.letterSpacing = "0px";
  c.restore();
}

export function drawCaption(
  c: Ctx,
  W: number,
  H: number,
  text: string,
  alpha: number,
  y = 0.46,
): void {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha = alpha;
  c.font = `700 38px ${FONT_DISP}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.letterSpacing = "3px";
  c.lineJoin = "round";
  c.strokeStyle = "rgba(6,4,10,0.9)";
  c.lineWidth = 8;
  c.strokeText(text, W / 2, H * y);
  c.shadowColor = "rgba(255,200,120,0.55)";
  c.shadowBlur = 14;
  c.fillStyle = "#fbefd0";
  c.fillText(text, W / 2, H * y);
  c.restore();
}

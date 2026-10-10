/**
 * Skip ring ("Hold Esc to skip", fills while Esc is held) and the hint / nudge card ("Type the words to fight!",
 * "Red word: type it to block!", the idle "type any word" nudge). Both register a reserved rect so plates keep clear.
 */
import type { Ctx } from "../draw";
import { clamp, frame, txt } from "../draw";
import type { Rect } from "../layout";
import { FONT_UI, GOLD_HI } from "../theme";

export function measureHint(c: Ctx, text: string): number {
  c.font = `700 16px ${FONT_UI}`;
  c.letterSpacing = "1px";
  const w = c.measureText(text).width;
  c.letterSpacing = "0px";
  return w;
}

export function drawHint(
  c: Ctx,
  r: Rect,
  text: string,
  alpha: number,
  slide: number,
  time: number,
  reducedMotion: boolean,
): void {
  if (alpha <= 0.01) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(0, (1 - slide) * 12);
  frame(c, r.x, r.y, r.w, r.h, {
    bg0: "rgba(26,19,38,0.94)",
    bg1: "rgba(10,7,16,0.94)",
    crest: false,
  });
  const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 4);
  c.globalAlpha = alpha * pulse;
  txt(c, text, r.x + r.w / 2, r.y + r.h / 2 + 1, 16, "#fff0c8", {
    align: "center",
    f: FONT_UI,
    w: 700,
    ls: 1,
    stroke: false,
  });
  c.restore();
}

/** The ring sits at the right end of `r`; its label ("Hold Esc to skip") to the left of it, on a dark pill. */
export function drawSkipRing(
  c: Ctx,
  r: Rect,
  progress: number,
  alpha: number,
  time: number,
  reducedFlash: boolean,
): void {
  if (alpha <= 0.01) return;
  const p = clamp(progress, 0, 1);
  const cx = r.x + r.w - 32;
  const cy = r.y + r.h / 2;
  c.save();
  c.globalAlpha = alpha;
  // label pill
  c.font = `700 13px ${FONT_UI}`;
  c.letterSpacing = "1px";
  const label = "HOLD ESC TO SKIP";
  const lw = c.measureText(label).width;
  c.letterSpacing = "0px";
  c.fillStyle = "rgba(10,7,16,0.72)";
  c.beginPath();
  c.roundRect(cx - 34 - lw - 22, cy - 14, lw + 26, 28, 14);
  c.fill();
  txt(c, label, cx - 34 - lw - 9, cy + 1, 13, "#f6e6c4", {
    f: FONT_UI,
    w: 700,
    ls: 1,
    stroke: false,
  });
  // disc, track, progress arc
  c.fillStyle = "rgba(10,7,16,0.78)";
  c.beginPath();
  c.arc(cx, cy, 25, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = "rgba(255,255,255,0.2)";
  c.beginPath();
  c.arc(cx, cy, 20, 0, Math.PI * 2);
  c.stroke();
  if (p > 0) {
    c.strokeStyle = p >= 1 ? "#ffffff" : "#ffd24a";
    c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    c.stroke();
    c.lineCap = "butt";
  } else if (!reducedFlash) {
    // idle: a tiny comet circling the empty ring says "press and hold"
    const a = time * 2.2;
    c.fillStyle = GOLD_HI;
    c.fillRect(Math.round(cx + Math.cos(a) * 20 - 2), Math.round(cy + Math.sin(a) * 20 - 2), 4, 4);
  }
  // key cap
  c.fillStyle = "#1c1528";
  c.strokeStyle = "#b8955a";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(cx - 13, cy - 8, 26, 16, 3);
  c.fill();
  c.stroke();
  txt(c, "ESC", cx, cy + 1, 9, "#f6e6c4", { align: "center", f: FONT_UI, w: 700, stroke: false });
  c.restore();
}

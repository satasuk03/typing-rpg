/**
 * Dialogue box (plan §4.3): bottom centre, at most 2 lines, a speaker plate (Nul violet, Knight amber), text contrast
 * >= 7:1 on its own panel (checked worst case over a white world), a typewriter reveal at 40 chars/s and a "Space"
 * advance hint. Nothing is drawn after it (it is the last thing the prologue HUD draws).
 */
import type { Ctx } from "../draw";
import { frame, txt } from "../draw";
import { FONT_UI } from "../theme";
import type { DialogueGeom } from "./geometry";
import { DLG_FONT, DLG_LINE_H, DLG_PLATE_OVER, wrapLines } from "./geometry";
import { DIALOGUE_PANEL, DIALOGUE_TEXT, type SpeakerId, SPEAKERS } from "./palette";

export const TYPE_CPS = 40;
/** The advance hint appears once the text is fully revealed (or after this many ms, whichever is first). */
export const HINT_AFTER_MS = 900;

export interface DialogueLayout {
  text: string;
  lines: string[];
  fontPx: number;
}

/** Wrap `text` into <= 2 lines at the box's inner width, shrinking the font (to 14 px) if it does not fit. */
export function layoutDialogue(c: Ctx, text: string, geom: DialogueGeom): DialogueLayout {
  let px = DLG_FONT;
  let lines: string[] = [];
  for (; px >= 14; px -= 1) {
    c.font = `700 ${px}px ${FONT_UI}`;
    c.letterSpacing = "1px";
    lines = wrapLines((s) => c.measureText(s).width, text, geom.inner.w);
    c.letterSpacing = "0px";
    if (lines.length <= 2) break;
  }
  return { text, lines: lines.slice(0, 2), fontPx: px };
}

export interface DialogueDraw {
  speaker: SpeakerId;
  layout: DialogueLayout;
  ageMs: number;
  alpha: number;
  time: number;
  reducedMotion: boolean;
}

/** Characters revealed after `ageMs` (all of them under reduced motion). */
export const revealedChars = (total: number, ageMs: number, reduced: boolean): number =>
  reduced ? total : Math.min(total, Math.floor((ageMs / 1000) * TYPE_CPS) + 1);

export function drawDialogue(c: Ctx, g: DialogueGeom, d: DialogueDraw): void {
  if (d.alpha <= 0.01) return;
  const sp = SPEAKERS[d.speaker];
  const { box } = g;
  c.save();
  c.globalAlpha = d.alpha;
  const rgba = (hex: string): string => {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${DIALOGUE_PANEL.alpha})`;
  };
  frame(c, box.x, box.y, box.w, box.h, {
    bg0: rgba(DIALOGUE_PANEL.top),
    bg1: rgba(DIALOGUE_PANEL.bottom),
    col: sp.rim,
    crest: false,
  });
  // speaker plate
  c.font = `700 14px ${FONT_UI}`;
  c.letterSpacing = "2px";
  const nameW = c.measureText(sp.name).width;
  c.letterSpacing = "0px";
  const pw = Math.ceil(nameW) + 28;
  const ph = 26;
  const px0 = box.x + 22;
  const py0 = box.y - DLG_PLATE_OVER;
  c.fillStyle = "#050308";
  c.fillRect(px0 - 2, py0 - 2, pw + 4, ph + 4);
  c.fillStyle = sp.plate;
  c.fillRect(px0, py0, pw, ph);
  c.fillStyle = sp.rim;
  c.fillRect(px0, py0 + ph - 3, pw, 3);
  txt(c, sp.name, px0 + pw / 2, py0 + ph / 2 - 1, 14, sp.plateInk, {
    align: "center",
    f: FONT_UI,
    w: 700,
    ls: 2,
    stroke: false,
  });
  // text with the typewriter reveal (the wrap is laid out on the full text, so nothing reflows)
  let left = revealedChars(d.layout.text.length, d.ageMs, d.reducedMotion);
  const full = left >= d.layout.text.length;
  c.font = `700 ${d.layout.fontPx}px ${FONT_UI}`;
  for (let i = 0; i < d.layout.lines.length; i++) {
    const ln = d.layout.lines[i] as string;
    const shown = ln.slice(0, Math.max(0, left));
    left -= ln.length + 1; // the space the wrap consumed
    if (shown.length === 0) continue;
    txt(c, shown, g.inner.x, g.inner.y + DLG_LINE_H * i + DLG_LINE_H / 2, d.layout.fontPx, DIALOGUE_TEXT, {
      f: FONT_UI,
      w: 700,
      ls: 1,
      stroke: false,
    });
  }
  // advance hint: "SPACE" and a small triangle, blinking while it waits
  if (full || d.ageMs > HINT_AFTER_MS) {
    const blink = d.reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(d.time * 5);
    c.globalAlpha = d.alpha * blink;
    const hx = box.x + box.w - 24;
    const hy = box.y + box.h - 11;
    txt(c, "SPACE", hx - 14, hy, 11, "#ffd98a", { align: "right", f: FONT_UI, w: 700, ls: 2, stroke: false });
    c.fillStyle = "#ffd98a";
    c.beginPath();
    c.moveTo(hx - 8, hy - 5);
    c.lineTo(hx, hy);
    c.lineTo(hx - 8, hy + 5);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/**
 * Riddle of Leaves panel (T3.1). A reserved rect under the boss plate: the plate layout solver, the pop
 * placer and the readability invariants all treat it as a keep-out, so it never overlaps a leaf plate or
 * covers the clue. Right = gold (K3), wrong = red, timeout = grey. Green stays reserved for healing.
 */
import type { LevelView, RiddleView } from "@hd2d/sim";
import type { Ctx } from "./draw";
import { frame, txt } from "./draw";
import type { Rect } from "./layout";
import { bossPlateRect } from "./panels";
import { FONT_UI, GOLD, GOLD_HI } from "./theme";
import { timerStrip } from "./timer";

export const RIDDLE_PANEL_W = 620;
export const RIDDLE_PANEL_H = 124;
const PAD = 16;

/** Design-px rect: under the boss plate (its +22 pop margin included), else near the top. */
export function riddlePanelRect(W: number, hasBoss: boolean): Rect {
  const bp = bossPlateRect(W);
  const y = hasBoss ? bp.y + bp.h + 30 : 24;
  return { x: Math.round(W / 2 - RIDDLE_PANEL_W / 2), y, w: RIDDLE_PANEL_W, h: RIDDLE_PANEL_H };
}

export const RIDDLE_SLIDE_SEC = 0.25;
/** Slide-in (brief 5.4): the panel drops 56 px into its reserved rect while fading in over 250 ms; instant in reduced motion. */
export function riddleSlide(age: number, reducedMotion: boolean): { dy: number; a: number } {
  if (reducedMotion || age >= RIDDLE_SLIDE_SEC) return { dy: 0, a: 1 };
  const k = Math.max(0, age) / RIDDLE_SLIDE_SEC;
  const e = 1 - (1 - k) ** 3;
  return { dy: -(1 - e) * 56, a: e };
}

/** The panel exists only while a riddle is live (null in the gap, after the last riddle, and during Second Wind). */
export function activeRiddle(v: LevelView): RiddleView | null {
  if (v.minigame?.kind !== "riddle") return null;
  return v.minigame.riddle ?? null;
}

/** Greedy word wrap using the current font. */
export function wrapLines(c: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (line && c.measureText(t).width > maxW) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export function lastLine(last: NonNullable<RiddleView["last"]>): { text: string; col: string } {
  switch (last.outcome) {
    case "right":
      return { text: `LAST: RIGHT - ${last.answerText}`, col: GOLD_HI };
    case "wrong":
      return { text: `LAST: WRONG - IT WAS ${last.answerText}`, col: "#ffa090" };
    default:
      return { text: `LAST: TIME UP - IT WAS ${last.answerText}`, col: "#d8d0c0" };
  }
}

export function drawRiddlePanel(
  c: Ctx,
  r: Rect,
  riddle: RiddleView,
  alpha: number,
  time: number,
  reducedFlash: boolean,
): void {
  frame(c, r.x, r.y, r.w, r.h, {
    col: "#d8b84a",
    bg0: "rgba(14,30,32,0.95)",
    bg1: "rgba(5,12,14,0.96)",
  });
  const x0 = r.x + PAD;
  const inner = r.w - PAD * 2;
  // header: title left, riddle pips right
  txt(c, "RIDDLE OF LEAVES", x0, r.y + 22, 13, "#8ae8d4", { ls: 3 });
  for (let i = 0; i < riddle.riddleCount; i++) {
    const px = r.x + r.w - PAD - (riddle.riddleCount - i) * 16;
    const cur = i === riddle.riddleIndex;
    c.fillStyle = "rgba(0,0,0,0.85)";
    c.fillRect(px - 1, r.y + 15, 12, 12);
    c.fillStyle = cur ? GOLD : i < riddle.riddleIndex ? "#8a7a4a" : "#2a2a30";
    c.fillRect(px, r.y + 16, 10, 10);
  }
  // clue: two lines max, shrink to fit; Silkscreen is a proportional pixel face
  let sz = 20;
  let lines: string[] = [];
  for (; sz >= 14; sz -= 2) {
    c.font = `700 ${sz}px ${FONT_UI}`;
    lines = wrapLines(c, riddle.clue, inner);
    if (lines.length <= 2) break;
  }
  const lh = sz + 6;
  lines.slice(0, 2).forEach((ln, i) => {
    txt(c, ln, x0, r.y + 48 + i * lh, sz, "#fff4d8", { w: 700, sw: 4 });
  });
  // timer bar (hatched, non-colour cue) + seconds
  const t = timerStrip(riddle.ticksLeft, riddle.totalTicks, alpha);
  const ty = r.y + 90;
  const bw = inner - 64;
  c.fillStyle = "rgba(0,0,0,0.85)";
  c.fillRect(x0 - 1, ty - 1, bw + 2, 10);
  c.fillStyle = "#1e1624";
  c.fillRect(x0, ty, bw, 8);
  if (t) {
    c.fillStyle = t.critical ? "#ff5a4a" : "#e0b84a";
    c.fillRect(x0, ty, bw * t.remaining, 8);
    c.save();
    c.beginPath();
    c.rect(x0, ty, bw * t.remaining, 8);
    c.clip();
    c.strokeStyle = "rgba(0,0,0,0.4)";
    c.lineWidth = 2;
    for (let hx = x0 - 6; hx < x0 + bw + 8; hx += 7) {
      c.beginPath();
      c.moveTo(hx, ty + 9);
      c.lineTo(hx + 7, ty - 1);
      c.stroke();
    }
    c.restore();
    for (const f of [0.25, 0.5, 0.75]) {
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.fillRect(x0 + bw * f - 0.5, ty - 1, 1, 10);
    }
    const blink = t.critical && !reducedFlash && Math.floor(time * 2) % 2 === 0;
    const col = blink ? "#ffffff" : t.critical ? "#ff9a8a" : "#f2e4c8";
    txt(c, `${t.secondsLeft.toFixed(1)}s`, x0 + bw + 12, ty + 5, 14, col, { w: 700 });
  }
  // feedback row from the previous riddle
  if (riddle.last) {
    const f = lastLine(riddle.last);
    txt(c, f.text.toUpperCase(), x0, r.y + r.h - 14, 13, f.col, { ls: 1, w: 700 });
  } else {
    txt(c, "TYPE THE LEAF THAT ANSWERS THE RIDDLE", x0, r.y + r.h - 14, 12, "#9aa8a4", { ls: 1 });
  }
}

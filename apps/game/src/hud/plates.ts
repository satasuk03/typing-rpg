/**
 * Word plates. The readability contract lives here:
 * plates are drawn last (above everything except the clipped "above" FX layer), high contrast,
 * typed letters gold, untyped white, NEXT letter brighter + scaled + underlined, guard plates red
 * with a jagged border, shield badge, GUARD label and a hatched timer strip (non-colour cues).
 */
import type { PlateView } from "@hd2d/sim";
import type { Ctx } from "./draw";
import { frame, setFont, txt } from "./draw";
import type { PlateFx } from "./fx";
import type { Rect } from "./layout";
import type { HudSettings } from "./settings";
import type { TextLayout } from "./textLayout";
import { layoutText } from "./textLayout";
import type { PlatePalette } from "./theme";
import { FONT_DISP, FONT_PIX, GOLD, PLATE_PALETTES } from "./theme";
import { timerStrip } from "./timer";

export const PLATE_PAD_X = 14;
export const PLATE_PAD_Y = 7;
export const SINGLE_WORD_PX = 22;
export const SENTENCE_PX = 18;
export const SENTENCE_MAX_W = 600;
const LABEL_H = 18;
const TIMER_H = 14;
const BADGE_W = 30;

export interface PlateGeom {
  view: PlateView;
  palette: PlatePalette;
  /** Total box incl. label row, badge and timer strip. */
  w: number;
  h: number;
  /** Text frame inside the box. */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  cw: number;
  sz: number;
  lineH: number;
  layout: TextLayout;
  label: string;
  hasTimer: boolean;
  isGuard: boolean;
}

const cwCache = new Map<string, number>();
/** Glyph cell width for the plate font (works for any fallback font). */
export function cellWidth(c: Ctx, sz: number): number {
  const key = `${FONT_PIX}|${sz}`;
  let w = cwCache.get(key);
  if (w === undefined) {
    setFont(c, sz, FONT_PIX);
    c.letterSpacing = "0px";
    const m = Math.max(c.measureText("M").width, c.measureText("W").width);
    w = Math.ceil(m) + 3;
    cwCache.set(key, w);
  }
  return w;
}

export function gimmickLabel(p: PlateView): string {
  if (p.faded) return "FADING";
  if (p.display !== p.text) return "SCRAMBLED";
  return "";
}

export function measurePlate(c: Ctx, p: PlateView): PlateGeom {
  const palette = PLATE_PALETTES[p.kind] ?? (PLATE_PALETTES.word as PlatePalette);
  const sentence = p.display.includes(" ");
  const sz = sentence ? SENTENCE_PX : SINGLE_WORD_PX;
  const cw = cellWidth(c, sz);
  const maxCols = Math.max(6, Math.floor((SENTENCE_MAX_W - PLATE_PAD_X * 2) / cw));
  const layout = layoutText(p.display, sentence ? maxCols : 99);
  const lineH = sz + 8;
  const fw = layout.cols * cw + PLATE_PAD_X * 2;
  const fh = layout.lineCount * lineH + PLATE_PAD_Y * 2;
  const isGuard = p.kind === "guard";
  const g = gimmickLabel(p);
  const label = [palette.label, g].filter(Boolean).join(" · ");
  const hasTimer = p.expiresAtTick !== null && p.totalTicks !== null;
  const left = isGuard ? BADGE_W : 0;
  const right = isGuard ? 6 : 0;
  const bw = Math.max(fw + left + right, label ? label.length * 9 + 70 : 0);
  return {
    view: p,
    palette,
    w: bw,
    h: LABEL_H + fh + (hasTimer ? TIMER_H : 4),
    fx: left + (bw - left - right - fw) / 2,
    fy: LABEL_H,
    fw,
    fh,
    cw,
    sz,
    lineH,
    layout,
    label,
    hasTimer,
    isGuard,
  };
}

export interface PlateDrawCtx {
  time: number;
  nowTick: number;
  isTarget: boolean;
  fx: PlateFx;
  settings: HudSettings;
  alpha: number;
  /** Filled with design-px letter rects (index-aligned with text). */
  letterRects: Rect[];
}

function frameShape(c: Ctx, kind: string, x: number, y: number, w: number, h: number): void {
  c.beginPath();
  if (kind === "guard") {
    const jag = 6;
    c.moveTo(x - jag, y);
    for (let i = 0; i <= 8; i++) c.lineTo(x + (w * i) / 8, y + (i % 2 ? -4 : 0));
    c.lineTo(x + w + jag, y + h / 2);
    c.lineTo(x + w, y + h);
    for (let i = 8; i >= 0; i--) c.lineTo(x + (w * i) / 8, y + h + (i % 2 ? 4 : 0));
    c.lineTo(x - jag, y + h / 2);
  } else {
    // doom: chamfered corners
    const ch = 9;
    c.moveTo(x + ch, y);
    c.lineTo(x + w - ch, y);
    c.lineTo(x + w, y + ch);
    c.lineTo(x + w, y + h - ch);
    c.lineTo(x + w - ch, y + h);
    c.lineTo(x + ch, y + h);
    c.lineTo(x, y + h - ch);
    c.lineTo(x, y + ch);
  }
  c.closePath();
}

export function drawPlate(c: Ctx, g: PlateGeom, box: Rect, d: PlateDrawCtx): void {
  const p = g.view;
  const pal = g.palette;
  const tint = d.fx.tint(p.id);
  const off = d.fx.offset(p.id, d.time);
  const bx = box.x + off.dx;
  const by = box.y + off.dy;
  const x = bx + g.fx;
  const y = by + g.fy;
  const { fw, fh } = g;
  const inten = d.settings.effectsIntensity;
  const timer = timerStrip(p.expiresAtTick, p.totalTicks, d.nowTick);
  const pulse = 0.5 + 0.5 * Math.sin(d.time * (timer ? 8 + 10 * timer.urgency : 8));
  const pulseOn = d.settings.reducedFlash ? 0.5 : pulse;
  const border = tint?.border ?? pal.border;

  c.save();
  c.globalAlpha = d.alpha;

  // ---- plate body
  if (g.isGuard || p.kind === "doom") {
    frameShape(c, p.kind, x, y, fw, fh);
    const gr = c.createLinearGradient(0, y, 0, y + fh);
    gr.addColorStop(0, pal.bg0);
    gr.addColorStop(1, pal.bg1);
    c.fillStyle = gr;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = "#120306";
    c.stroke();
    c.lineWidth = 1.5;
    c.strokeStyle = g.isGuard ? `rgba(255,${(120 + pulseOn * 90) | 0},100,1)` : border;
    c.stroke();
    if (inten > 0 && !d.settings.reducedFlash) {
      c.shadowColor = g.isGuard ? "rgba(255,60,40,0.9)" : "rgba(170,100,255,0.9)";
      c.shadowBlur = (10 + pulseOn * 14) * inten;
      c.stroke();
      c.shadowBlur = 0;
    }
    if (p.kind === "doom") {
      c.save();
      c.translate(0, 0);
      frameShape(c, "doom", x + 5, y + 5, fw - 10, fh - 10);
      c.lineWidth = 1;
      c.strokeStyle = "rgba(200,150,255,0.5)";
      c.stroke();
      c.restore();
    }
  } else {
    frame(c, x, y, fw, fh, {
      hot: d.isTarget,
      crest: false,
      col: border,
      bg0: hexA(pal.bg0, 0.96),
      bg1: hexA(pal.bg1, 0.97),
    });
    if (d.isTarget && inten > 0) {
      c.save();
      c.shadowColor = tint?.glow ?? "rgba(255,210,110,0.85)";
      c.shadowBlur = 16 * inten;
      c.strokeStyle = "rgba(255,220,140,0.9)";
      c.lineWidth = 1.5;
      c.strokeRect(x + 3.5, y + 3.5, fw - 7, fh - 7);
      c.restore();
    }
  }

  // ---- guard shield badge (non-colour cue)
  if (g.isGuard) {
    const bxc = x - 16;
    const byc = y + fh / 2;
    const r = 13;
    c.beginPath();
    c.moveTo(bxc, byc - r);
    c.lineTo(bxc + r * 0.85, byc - r * 0.6);
    c.lineTo(bxc + r * 0.75, byc + r * 0.35);
    c.lineTo(bxc, byc + r);
    c.lineTo(bxc - r * 0.75, byc + r * 0.35);
    c.lineTo(bxc - r * 0.85, byc - r * 0.6);
    c.closePath();
    c.fillStyle = "#3a5ac0";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = "#0a0810";
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = "#cfe0ff";
    c.stroke();
    txt(c, "!", bxc, byc + 1, 15, "#ffffff", { f: FONT_DISP, w: 900, align: "center", sw: 3 });
  }

  // ---- letters
  const letterFont = FONT_PIX;
  const scrambled = p.display !== p.text;
  for (const cell of g.layout.cells) {
    const i = cell.index;
    const lx = x + PLATE_PAD_X + cell.col * g.cw;
    const ly = y + PLATE_PAD_Y + cell.line * g.lineH;
    d.letterRects[i] = { x: lx, y: ly, w: g.cw, h: g.lineH };
    const cx = lx + g.cw / 2;
    const cy = ly + g.lineH / 2 + 1;
    const typed = i < p.typedIndex;
    const isNext = i === p.typedIndex;
    if (cell.isSpace) {
      if (!typed) {
        c.fillStyle = "rgba(235,225,205,0.55)";
        c.fillRect(cx - 2, cy - 2, 4, 4);
      }
      continue;
    }
    const lf = d.fx.letter(p.id, i);
    let ch = p.display[i] ?? "";
    if (typed) ch = p.text[i] ?? ch;
    let col = pal.untyped;
    let size = g.sz;
    let glow: string | null = null;
    let gb = 6;
    if (typed) {
      col = tint?.typed ?? pal.typed;
      glow = "rgba(255,190,60,0.6)";
    }
    if (p.faded && !typed) {
      // fading gimmick: untyped chars become blanks; the gimmick overrides the next-letter rule
      c.fillStyle = "rgba(235,225,205,0.7)";
      c.fillRect(cx - g.cw * 0.28, cy + g.sz * 0.28, g.cw * 0.56, 3);
      if (isNext && d.isTarget) underline(c, d, g, cx, ly, true);
      continue;
    }
    const emphasize = isNext && !scrambled && d.isTarget;
    if (emphasize) {
      col = pal.next;
      size = g.sz * 1.1;
      glow = g.isGuard ? "rgba(255,120,100,0.9)" : "rgba(255,240,200,0.9)";
      gb = 12;
    } else if (isNext && !scrambled) {
      col = pal.next;
    }
    if (lf.scale !== 1) size *= lf.scale;
    if (lf.glitch > 0) col = mix(col, "#ff5a4a", lf.glitch);
    if (lf.flash > 0) col = mix(col, "#ffffff", lf.flash);
    const gx = lf.glitch > 0 ? Math.sin(d.time * 120 + i) * 2 * lf.glitch : 0;
    txt(c, ch, cx + gx, cy, size, col, {
      f: letterFont,
      align: "center",
      sw: 5,
      glow: inten > 0 ? glow : null,
      gb: gb * inten,
    });
    if (lf.crack) {
      c.save();
      c.strokeStyle = "rgba(255,90,70,0.95)";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(lx + g.cw * 0.2, ly + 3);
      c.lineTo(lx + g.cw * 0.55, ly + g.lineH * 0.45);
      c.lineTo(lx + g.cw * 0.35, ly + g.lineH * 0.6);
      c.lineTo(lx + g.cw * 0.8, ly + g.lineH - 3);
      c.stroke();
      c.restore();
    }
    if (isNext && !scrambled) underline(c, d, g, cx, ly, d.isTarget);
  }

  // ---- label row (top-left tab), target arrow, timer strip
  if (g.label) {
    const secs = timer ? `  ${timer.secondsLeft.toFixed(1)}s` : "";
    txt(c, g.label + secs, x + 2, by + LABEL_H / 2 + 1, 12, pal.labelCol, {
      ls: 2,
      glow: g.isGuard && !d.settings.reducedFlash ? "rgba(255,80,60,0.7)" : null,
      gb: 8 * inten,
    });
  }
  if (d.isTarget) {
    const bob = d.settings.reducedMotion ? 0 : Math.sin(d.time * 8) * 2;
    const ax = g.label ? x + fw - 16 : x + fw / 2;
    const ay = by + LABEL_H / 2 + bob;
    c.beginPath();
    c.moveTo(ax - 8, ay - 5);
    c.lineTo(ax + 8, ay - 5);
    c.lineTo(ax, ay + 5);
    c.closePath();
    c.fillStyle = GOLD;
    c.fill();
    c.strokeStyle = "#1a0e06";
    c.lineWidth = 2;
    c.stroke();
  }
  if (timer) {
    const ty = y + fh + 5;
    const tw = fw - 12;
    c.fillStyle = "rgba(0,0,0,0.7)";
    c.fillRect(x + 6, ty, tw, 6);
    const col = timer.critical ? "#ff5a4a" : g.isGuard ? "#ffb070" : pal.labelCol;
    c.fillStyle = col;
    c.fillRect(x + 6, ty, tw * timer.remaining, 6);
    // diagonal hatch: readable without colour
    c.save();
    c.beginPath();
    c.rect(x + 6, ty, tw * timer.remaining, 6);
    c.clip();
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 2;
    for (let hx = x - 4; hx < x + tw + 12; hx += 7) {
      c.beginPath();
      c.moveTo(hx, ty + 7);
      c.lineTo(hx + 7, ty - 1);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 1;
    c.strokeRect(x + 5.5, ty - 0.5, tw + 1, 7);
    for (const f of [0.25, 0.5, 0.75]) {
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillRect(x + 6 + tw * f - 0.5, ty - 2, 1, 10);
    }
  }
  c.restore();
}

function underline(
  c: Ctx,
  d: PlateDrawCtx,
  g: PlateGeom,
  cx: number,
  ly: number,
  target: boolean,
): void {
  const blink = d.settings.reducedFlash || Math.floor(d.time * 3) % 2 === 0;
  if (!blink && target) return;
  c.fillStyle = target ? "#ffcf4a" : "rgba(255,255,255,0.75)";
  c.fillRect(cx - g.cw * 0.42, ly + g.lineH - 3, g.cw * 0.84, 3);
}

function hexA(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function mix(a: string, b: string, t: number): string {
  if (!a.startsWith("#")) return t > 0.5 ? b : a;
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

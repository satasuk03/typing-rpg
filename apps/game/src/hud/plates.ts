/**
 * Word plates. The readability contract lives here:
 * plates are drawn last (above everything except the clipped "above" FX layer), high contrast,
 * typed letters gold, untyped white, NEXT letter brighter + scaled + underlined, guard plates red
 * with a jagged border, shield badge, GUARD label and a hatched timer strip (non-colour cues).
 */
import type { PlateView } from "@hd2d/sim";
import { FIXED_PRISM_HEX, PRISM_BUCKETS } from "../level/typingFxParams";
import { drawLeafGlyph, drawShiftCue, SHIFT_CAP, SHIFT_GUTTER_W } from "./ch2Glyphs";
import type { Ctx } from "./draw";
import { frame, glowOnly, setFont, txt } from "./draw";
import type { PlateFx } from "./fx";
import { hueBucket, prismLetter, TINT_KINDS, typoColorFor } from "./fx/typing/palette";
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
  /** v2.0: riddle leaf plate (teal-gold, leaf glyph in the left gutter). */
  isLeaf: boolean;
}

/** v2.0 riddle leaf plate look: teal-gold, never green (green is reserved for healing). */
const LEAF_PALETTE: PlatePalette = {
  bg0: "#123436",
  bg1: "#061416",
  untyped: "#f4efd8",
  typed: "#ffcf4a",
  next: "#ffffff",
  border: "#d8b84a",
  label: "LEAF",
  labelCol: "#8ae8d4",
};

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

export function measurePlate(c: Ctx, p: PlateView, leaf = false): PlateGeom {
  const palette = leaf
    ? LEAF_PALETTE
    : (PLATE_PALETTES[p.kind] ?? (PLATE_PALETTES.word as PlatePalette));
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
  const left = isGuard ? BADGE_W : p.exactCase || leaf ? SHIFT_GUTTER_W : 0;
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
    isLeaf: leaf,
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
  /** Quality tier 0..2 (2 drops the conic border and the border glow). */
  quality?: number;
}

const PERIM = { x: 0, y: 0 };
/** Point at distance d (clockwise from the top-left corner) along a rectangle's perimeter. */
export function perimPoint(
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  out: { x: number; y: number },
): void {
  const per = 2 * (w + h);
  let t = d % per;
  if (t < 0) t += per;
  if (t < w) {
    out.x = x + t;
    out.y = y;
  } else if (t < w + h) {
    out.x = x + w;
    out.y = y + (t - w);
  } else if (t < 2 * w + h) {
    out.x = x + w - (t - w - h);
    out.y = y + h;
  } else {
    out.x = x;
    out.y = y + h - (t - 2 * w - h);
  }
}

const CRACK_DX = [0, 3, -2, 2, 0];
/** Guard plates are red, so their typo cue is white-cyan (distinct from the plate, contrast >= 4.5 on its bg). */
export const GUARD_TYPO = "#d6f6ff";

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
  const tinted = tint && TINT_KINDS.has(p.kind) ? tint : null;
  const rm = d.settings.reducedMotion;
  const border = pal.border;

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
    // border flash on the jagged / chamfered frames (guard typo: white-cyan, readable on the red plate)
    const gflash = d.fx.borderFlash(p.id);
    if (gflash > 0.01) {
      c.save();
      c.globalAlpha = d.alpha * gflash;
      frameShape(c, p.kind, x, y, fw, fh);
      c.lineJoin = "round";
      c.strokeStyle = "rgba(8,5,12,0.9)";
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = d.fx.borderFlashColor(p.id);
      c.lineWidth = 4;
      c.stroke();
      c.restore();
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
    if (tinted) {
      // tier border (R5: allowed kinds only). Target plate adds the tier glow (one shadowBlur stroke).
      c.save();
      c.lineWidth = 2.5;
      const lowQ = (d.quality ?? 0) >= 2;
      if (tinted.prism && !rm) {
        const ang = d.time * ((120 * Math.PI) / 180);
        if (!lowQ && typeof c.createConicGradient === "function") {
          const gr = c.createConicGradient(ang, x + fw / 2, y + fh / 2);
          const b0 = hueBucket(d.time, 0);
          for (let i = 0; i <= 6; i++)
            gr.addColorStop(i / 6, PRISM_BUCKETS[(b0 + 2 * (i % 6)) % 12] as string);
          c.strokeStyle = gr;
        } else {
          const gr = c.createLinearGradient(x, y, x + fw, y + fh);
          gr.addColorStop(0, PRISM_BUCKETS[hueBucket(d.time, 0)] as string);
          gr.addColorStop(1, PRISM_BUCKETS[hueBucket(d.time, 150)] as string);
          c.strokeStyle = gr;
        }
      } else {
        const base = tinted.prism ? FIXED_PRISM_HEX : (tinted.border as string);
        c.strokeStyle = base;
      }
      if (d.isTarget && inten > 0 && !lowQ && (tinted.borderGlowPx ?? 0) > 0) {
        // the glow lives outside the frame: clipped out of the text area so it never lifts the dark
        // ground the letters are read against
        if (typeof Path2D !== "undefined") {
          const outside = new Path2D();
          outside.rect(-1e5, -1e5, 2e5, 2e5);
          outside.rect(x + 5, y + 5, fw - 10, fh - 10);
          c.clip(outside, "evenodd");
        }
        c.shadowColor =
          tinted.prism && !rm
            ? (PRISM_BUCKETS[hueBucket(d.time, 0)] as string)
            : (tinted.accent as string);
        c.shadowBlur = (tinted.borderGlowPx as number) * inten;
      } else if (d.isTarget && lowQ) c.lineWidth = 3.5;
      c.strokeRect(x + 3.5, y + 3.5, fw - 7, fh - 7);
      c.restore();
    } else if (d.isTarget && inten > 0) {
      c.save();
      c.shadowColor = "rgba(255,210,110,0.85)";
      c.shadowBlur = 16 * inten;
      c.strokeStyle = "rgba(255,220,140,0.9)";
      c.lineWidth = 1.5;
      c.strokeRect(x + 3.5, y + 3.5, fw - 7, fh - 7);
      c.restore();
    }
    // border flash (tier-up white, typo red / amber): one overlay stroke on any plate kind
    const flash = d.fx.borderFlash(p.id);
    if (flash > 0.01) {
      c.save();
      c.globalAlpha = d.alpha * flash;
      c.strokeStyle = d.fx.borderFlashColor(p.id);
      c.lineWidth = 3;
      c.strokeRect(x + 3.5, y + 3.5, fw - 7, fh - 7);
      c.restore();
    }
    // lock-on sweep (§2.6): a 30 px bright segment runs once around the frame
    const sw = d.fx.sweepProgress(p.id);
    if (sw >= 0 && inten > 0) {
      const rx = x + 3.5;
      const ry = y + 3.5;
      const rw = fw - 7;
      const rh = fh - 7;
      const per = 2 * (rw + rh);
      const d1 = sw * per;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      c.lineWidth = 2.5;
      c.strokeStyle = tinted?.prism
        ? (PRISM_BUCKETS[hueBucket(d.time, 0)] as string)
        : (tinted?.accent ?? "#ffe6a0");
      c.globalAlpha = d.alpha * Math.min(1, inten + 0.3);
      c.beginPath();
      perimPoint(rx, ry, rw, rh, d1 - 30, PERIM);
      c.moveTo(PERIM.x, PERIM.y);
      for (let k = 1; k <= 6; k++) {
        perimPoint(rx, ry, rw, rh, d1 - 30 + (30 * k) / 6, PERIM);
        c.lineTo(PERIM.x, PERIM.y);
      }
      c.stroke();
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

  // ---- v2.0 left-gutter cues: the shift key cap (lit only when the next letter is uppercase) or the leaf glyph.
  // They live outside the text frame, so the next letter is never touched and nothing here pulses.
  if (!g.isGuard && p.exactCase) {
    drawShiftCue(c, bx + 3, y + fh / 2, p.shiftNext === true);
  } else if (g.isLeaf) {
    drawLeafGlyph(c, bx + 7, y + fh / 2 - SHIFT_CAP / 2 + 4);
  }

  // ---- letters: two passes (R1). Every non-next letter first, then the next letter with its stroke,
  // so a popped neighbour that grows into the next cell is always under it.
  const letterFont = FONT_PIX;
  const scrambled = p.display !== p.text;
  const sentence = p.display.includes(" ");
  for (let i = 0; i < g.layout.cells.length; i++) {
    const cell = g.layout.cells[i];
    if (!cell) continue;
    d.letterRects[cell.index] = {
      x: x + PLATE_PAD_X + cell.col * g.cw,
      y: y + PLATE_PAD_Y + cell.line * g.lineH,
      w: g.cw,
      h: g.lineH,
    };
  }
  // Glows of typed letters are drawn clipped so they never bleed into the next letter's cell: the pop
  // glow (up to 16 px) of the letter just typed sits right beside it and would wash out the one glyph
  // the player must read next (R1/R2 spirit).
  let nextClip: Path2D | null = null;
  const nr = d.isTarget && !scrambled ? d.letterRects[p.typedIndex] : undefined;
  if (nr && typeof Path2D !== "undefined") {
    nextClip = new Path2D();
    nextClip.rect(-1e5, -1e5, 2e5, 2e5);
    nextClip.rect(nr.x, nr.y, nr.w, nr.h);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const cell of g.layout.cells) {
      const i = cell.index;
      const isNext = i === p.typedIndex;
      if ((pass === 1) !== isNext) continue;
      const lx = x + PLATE_PAD_X + cell.col * g.cw;
      const ly = y + PLATE_PAD_Y + cell.line * g.lineH;
      const cx = lx + g.cw / 2;
      let cy = ly + g.lineH / 2 + 1;
      const typed = i < p.typedIndex;
      if (cell.isSpace) {
        if (!typed) {
          c.fillStyle = "rgba(235,225,205,0.55)";
          c.fillRect(cx - 2, cy - 2, 4, 4);
        }
        continue;
      }
      const lf = d.fx.letter(p.id, i, sentence);
      let ch = p.display[i] ?? "";
      if (typed) ch = p.text[i] ?? ch;
      let col = pal.untyped;
      let size = g.sz;
      let glow: string | null = null;
      let gb = 6;
      if (typed) {
        col = tinted
          ? tinted.prism
            ? prismLetter(i, d.time, rm)
            : (tinted.typed ?? pal.typed)
          : pal.typed;
        glow = tinted?.glow ?? "rgba(255,190,60,0.6)";
        gb = tinted?.typedGlowPx ?? 6;
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
      // R2: the next letter is never animated by typing VFX (only the typo glitch tints it).
      if (!isNext) {
        if (lf.scale !== 1) size *= lf.scale;
        if (lf.flash > 0) col = mix(col, "#ffffff", lf.flash);
        if (lf.glowPx > 0) {
          glow = tinted
            ? tinted.prism && !rm
              ? (PRISM_BUCKETS[hueBucket(d.time, 24 * i)] as string)
              : (tinted.accent as string)
            : pal.typed;
          gb = Math.max(gb, lf.glowPx);
        }
        cy -= lf.liftPx;
      }
      if (lf.glitch > 0) {
        col = mix(
          col,
          g.isGuard && !lf.amber ? GUARD_TYPO : typoColorFor(pal.bg0, pal.bg1, lf.amber),
          lf.glitch,
        );
        // a cream glow behind a red glyph would eat its contrast: the glitch glyph sits on its dark outline
        if (lf.glitch > 0.5) glow = null;
      }
      const gx = lf.glitchDx;
      if (lf.split > 0 && !lf.amber) {
        const ga = c.globalAlpha;
        c.globalAlpha = ga * 0.6;
        txt(c, ch, cx + gx - 3, cy, size, "#ff3c3c", {
          f: letterFont,
          align: "center",
          stroke: false,
        });
        txt(c, ch, cx + gx + 3, cy, size, "#3cdcff", {
          f: letterFont,
          align: "center",
          stroke: false,
        });
        c.globalAlpha = ga;
      }
      if (nextClip && typed && glow && inten > 0 && i === p.typedIndex - 1) {
        // the letter beside the next one: glow-only pass clipped out of the next cell, glyph unlit
        c.save();
        c.clip(nextClip, "evenodd");
        glowOnly(c, ch, cx + gx, cy, size, glow, gb * inten, letterFont);
        c.restore();
        glow = null;
      }
      txt(c, ch, cx + gx, cy, size, col, {
        f: letterFont,
        align: "center",
        sw: 5,
        glow: inten > 0 ? glow : null,
        gb: gb * inten,
      });
      if (isNext && !scrambled) underline(c, d, g, cx, ly, d.isTarget);
    }
  }
  // typo cracks live in the gutter: they never cross a glyph (§6)
  for (let slot = 0; slot < 3; slot++) {
    const cr = d.fx.crackAt(p.id, slot);
    const rc = cr ? d.letterRects[cr.index] : undefined;
    if (!cr || !rc) continue;
    const cx = rc.x + rc.w / 2;
    c.save();
    c.strokeStyle = g.isGuard ? "rgba(214,246,255,0.95)" : "rgba(255,90,70,0.9)";
    c.globalAlpha = d.alpha * cr.a;
    c.lineWidth = 1.5;
    c.lineJoin = "miter";
    for (let side = 0; side < 2; side++) {
      const y0 = side === 0 ? y + 1 : y + fh - 1;
      const y1 = side === 0 ? rc.y + 2 : rc.y + g.lineH - 3;
      c.beginPath();
      c.moveTo(cx + (CRACK_DX[0] as number), y0);
      for (let k = 1; k <= 4; k++)
        c.lineTo(cx + (CRACK_DX[k] as number) * (side === 0 ? 1 : -1), y0 + ((y1 - y0) * k) / 4);
      c.strokeStyle = "rgba(10,4,6,0.8)";
      c.lineWidth = 3.5;
      c.stroke();
      c.strokeStyle = g.isGuard ? "rgba(236,252,255,0.98)" : "rgba(255,90,70,0.95)";
      c.lineWidth = 2;
      c.stroke();
    }
    c.restore();
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

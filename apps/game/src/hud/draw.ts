/** 2D canvas drawing primitives ported from the POC HUD (txt, frame, bar, badges, icons). */
import { FONT_DISP, FONT_UI, GOLD_HI } from "./theme";

export type Ctx = CanvasRenderingContext2D;

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const eOut = (t: number): number => 1 - (1 - t) ** 3;

export interface TxtOpts {
  f?: string;
  w?: string | number;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  ls?: number;
  out?: string;
  sw?: number;
  stroke?: boolean;
  glow?: string | null;
  gb?: number;
}

export function setFont(c: Ctx, size: number, family: string, weight: string | number = ""): void {
  c.font = `${weight} ${size}px ${family}`.trim();
}

export function txt(
  c: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  col: string,
  o: TxtOpts = {},
): void {
  setFont(c, size, o.f ?? FONT_UI, o.w ?? "");
  c.textAlign = o.align ?? "left";
  c.textBaseline = o.base ?? "middle";
  c.letterSpacing = o.ls ? `${o.ls}px` : "0px";
  if (o.stroke !== false) {
    c.lineJoin = "round";
    c.miterLimit = 2;
    c.strokeStyle = o.out ?? "rgba(8,5,12,0.95)";
    c.lineWidth = o.sw ?? Math.max(2, size * 0.22);
    c.strokeText(s, x, y);
  }
  if (o.glow) {
    c.shadowColor = o.glow;
    c.shadowBlur = o.gb ?? 12;
  }
  c.fillStyle = col;
  c.fillText(s, x, y);
  c.shadowBlur = 0;
  c.letterSpacing = "0px";
}

export function diamond(c: Ctx, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

export interface FrameOpts {
  bg0?: string;
  bg1?: string;
  col?: string;
  hot?: boolean;
  crest?: boolean;
}

/** Ornate gold-trimmed panel frame (POC `frame`). */
export function frame(c: Ctx, x: number, y: number, w: number, h: number, o: FrameOpts = {}): void {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, o.bg0 ?? "rgba(28,21,36,0.9)");
  g.addColorStop(1, o.bg1 ?? "rgba(9,7,13,0.92)");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.strokeStyle = "rgba(0,0,0,0.85)";
  c.lineWidth = 3;
  c.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  c.strokeStyle = o.hot ? "#ffe6a0" : (o.col ?? "#b8955a");
  c.lineWidth = 1.5;
  c.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  c.strokeStyle = "rgba(184,149,90,0.28)";
  c.lineWidth = 1;
  c.strokeRect(x + 7.5, y + 7.5, w - 15, h - 15);
  const dc = o.hot ? GOLD_HI : (o.col ?? "#d8b46e");
  for (const [cx, cy] of [
    [x + 3.5, y + 3.5],
    [x + w - 3.5, y + 3.5],
    [x + 3.5, y + h - 3.5],
    [x + w - 3.5, y + h - 3.5],
  ] as const) {
    diamond(c, cx, cy, 5, "#0c0910");
    diamond(c, cx, cy, 3.5, dc);
  }
  if (o.crest !== false && w > 120) {
    diamond(c, x + w / 2, y + 3.5, 5, "#0c0910");
    diamond(c, x + w / 2, y + 3.5, 3.5, dc);
    c.fillStyle = dc;
    c.fillRect(x + w / 2 - 26, y + 3, 16, 1);
    c.fillRect(x + w / 2 + 10, y + 3, 16, 1);
  }
}

export interface BarOpts {
  trailCol?: string;
  ticks?: number;
  edge?: string;
}

export function bar(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  v: number,
  c1: string,
  c2: string,
  trail?: number,
  o: BarOpts = {},
): void {
  c.fillStyle = "rgba(0,0,0,0.85)";
  c.fillRect(x - 2, y - 2, w + 4, h + 4);
  c.fillStyle = "#1e1624";
  c.fillRect(x, y, w, h);
  if (trail !== undefined && trail > v) {
    c.fillStyle = o.trailCol ?? "#f4e6d0";
    c.fillRect(x, y, w * clamp(trail, 0, 1), h);
  }
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  c.fillStyle = g;
  c.fillRect(x, y, w * clamp(v, 0, 1), h);
  c.fillStyle = "rgba(255,255,255,0.32)";
  c.fillRect(x, y, w * clamp(v, 0, 1), Math.max(1, h * 0.25));
  if (o.ticks) {
    c.fillStyle = "rgba(0,0,0,0.45)";
    for (let i = 1; i < o.ticks; i++) c.fillRect(x + (w * i) / o.ticks - 0.5, y, 1, h);
  }
  c.strokeStyle = o.edge ?? "rgba(216,180,110,0.55)";
  c.lineWidth = 1;
  c.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

export function shieldBadge(
  c: Ctx,
  x: number,
  y: number,
  label: string,
  broken: boolean,
  r = 14,
): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r * 0.85, y - r * 0.6);
  c.lineTo(x + r * 0.75, y + r * 0.35);
  c.lineTo(x, y + r);
  c.lineTo(x - r * 0.75, y + r * 0.35);
  c.lineTo(x - r * 0.85, y - r * 0.6);
  c.closePath();
  const g = c.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, broken ? "#5a5a66" : "#6a8ad8");
  g.addColorStop(1, broken ? "#2a2a33" : "#22346a");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = "#0a0810";
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = broken ? "#9a9aa8" : "#cfe0ff";
  c.stroke();
  if (label !== "" || broken)
    txt(c, broken ? "x" : label, x, y + 1, Math.round(r * 1.05), "#ffffff", {
      f: FONT_DISP,
      w: 900,
      align: "center",
      sw: 3,
    });
}

/** Small vector glyph per damage type: distinct SHAPE and colour (colour-blind safe). */
export function damageIcon(
  c: Ctx,
  type: string,
  x: number,
  y: number,
  r: number,
  known = true,
): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = "rgba(0,0,0,0.78)";
  c.fillRect(-r - 3, -r - 3, 2 * r + 6, 2 * r + 6);
  c.strokeStyle = "rgba(216,180,110,0.5)";
  c.lineWidth = 1;
  c.strokeRect(-r - 2.5, -r - 2.5, 2 * r + 5, 2 * r + 5);
  if (!known) {
    txt(c, "?", 0, 1, r * 1.6, "#b8a8c8", { f: FONT_DISP, w: 900, align: "center", sw: 3 });
    c.restore();
    return;
  }
  c.lineWidth = Math.max(2, r * 0.28);
  c.lineCap = "round";
  c.lineJoin = "round";
  const col: Record<string, string> = {
    slash: "#e8eef6",
    pierce: "#b8e0ff",
    blunt: "#d8b080",
    arcane: "#d49aff",
    fire: "#ff9a40",
    ice: "#8ae0ff",
    light: "#fff08a",
    shield: "#8ab8ff",
  };
  c.strokeStyle = col[type] ?? "#ffffff";
  c.fillStyle = col[type] ?? "#ffffff";
  c.beginPath();
  switch (type) {
    case "slash":
      c.moveTo(-r * 0.8, r * 0.8);
      c.lineTo(r * 0.8, -r * 0.8);
      c.stroke();
      break;
    case "pierce":
      c.moveTo(-r * 0.8, 0);
      c.lineTo(r * 0.5, 0);
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.9, 0);
      c.lineTo(r * 0.3, -r * 0.5);
      c.lineTo(r * 0.3, r * 0.5);
      c.closePath();
      c.fill();
      break;
    case "shield":
      c.moveTo(0, -r);
      c.lineTo(r * 0.85, -r * 0.55);
      c.lineTo(r * 0.7, r * 0.35);
      c.lineTo(0, r);
      c.lineTo(-r * 0.7, r * 0.35);
      c.lineTo(-r * 0.85, -r * 0.55);
      c.closePath();
      c.fill();
      break;
    case "blunt":
      c.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 0.9);
      c.fillRect(-r * 0.15, 0, r * 0.3, r * 0.85);
      break;
    case "arcane":
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.stroke();
      break;
    case "fire":
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.95, 0, 0, r * 0.9);
      c.quadraticCurveTo(-r * 0.95, 0, 0, -r);
      c.fill();
      break;
    case "ice":
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        c.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
      }
      c.stroke();
      break;
    default:
      c.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.stroke();
  }
  c.restore();
}

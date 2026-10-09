/** Banners: encounter start, wave, boss intro name plate, level clear/fail, downed. */

import type { Ctx } from "./draw";
import { clamp, diamond, setFont, txt } from "./draw";
import type { Rect } from "./layout";
import type { HudSettings } from "./settings";
import { FONT_DISP, FONT_UI, GOLD, INK } from "./theme";

export type BannerStyle = "enc" | "wave" | "victory" | "fail" | "down" | "boss";

export interface Banner {
  uid: number;
  style: BannerStyle;
  text: string;
  sub: string;
  age: number;
  dur: number;
}

export class BannerSystem {
  readonly banners: Banner[] = [];
  private uid = 1;
  show(style: BannerStyle, text: string, sub = "", dur = 2.0): Banner {
    // a newer banner of the same style replaces the older one (no pile-ups)
    for (let i = this.banners.length - 1; i >= 0; i--) {
      if (this.banners[i]?.style === style) this.banners.splice(i, 1);
    }
    const b: Banner = { uid: this.uid++, style, text, sub, age: 0, dur };
    this.banners.push(b);
    return b;
  }
  update(dt: number): void {
    for (const b of this.banners) b.age += dt;
    for (let i = this.banners.length - 1; i >= 0; i--) {
      const b = this.banners[i];
      if (b && b.age >= b.dur) this.banners.splice(i, 1);
    }
  }
  clear(): void {
    this.banners.length = 0;
  }
  /** Drops every banner of one style. */
  remove(style: BannerStyle): void {
    for (let i = this.banners.length - 1; i >= 0; i--) {
      if (this.banners[i]?.style === style) this.banners.splice(i, 1);
    }
  }
}

/** Fade envelope: fast in (10%), hold, fade out over the last 20%. */
export function bannerAlpha(age: number, dur: number): number {
  const k = age / dur;
  return clamp(k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1, 0, 1);
}

const STYLE = {
  enc: { size: 48, col: "#f4d690", out: "#2a1406", glow: "rgba(255,170,70,0.6)", cy: 0.26 },
  wave: { size: 44, col: "#bfe4ff", out: "#06101e", glow: "rgba(100,170,255,0.6)", cy: 0.26 },
  victory: { size: 64, col: "#ffe08a", out: "#2a1406", glow: "rgba(255,170,70,0.7)", cy: 0.26 },
  fail: { size: 56, col: "#ff8a7a", out: "#1e0606", glow: "rgba(255,60,40,0.6)", cy: 0.26 },
  down: { size: 48, col: "#ffb0a0", out: "#1e0606", glow: "rgba(255,60,40,0.5)", cy: 0.26 },
  boss: { size: 78, col: "#f4d690", out: "#0a0406", glow: "rgba(255,170,80,0.7)", cy: 0.64 },
} as const;

export function drawBanner(c: Ctx, b: Banner, W: number, H: number, s: HudSettings): void {
  const st = STYLE[b.style];
  const k = b.age / b.dur;
  const a = bannerAlpha(b.age, b.dur);
  const slide = 0;
  const cy = Math.round(H * st.cy);
  const glow = 20 * s.effectsIntensity;
  c.save();
  c.globalAlpha = a;
  const g = c.createLinearGradient(0, cy - 60, 0, cy + 60);
  g.addColorStop(0, "rgba(8,5,12,0)");
  g.addColorStop(0.5, "rgba(8,5,12,0.72)");
  g.addColorStop(1, "rgba(8,5,12,0)");
  c.fillStyle = g;
  c.fillRect(0, cy - 60, W, 120);
  if (b.style === "boss") {
    // T6.3 #8: dark band (alpha 0.55) behind the title so the card reads over any world
    c.fillStyle = "rgba(6,4,10,0.55)";
    c.fillRect(0, cy - 78, W, 154);
  }
  const lw = 380 * Math.min(1, k * 6);
  c.fillStyle = "rgba(233,196,106,0.75)";
  c.fillRect(W / 2 - lw, cy - 38, lw * 2, 1.5);
  c.fillRect(W / 2 - lw, cy + 40, lw * 2, 1.5);
  for (const [x, y] of [
    [W / 2 - lw, cy - 37],
    [W / 2 + lw, cy - 37],
    [W / 2 - lw, cy + 41],
    [W / 2 + lw, cy + 41],
  ] as const)
    diamond(c, x, y, 4, GOLD);
  if (b.style === "victory" && !s.reducedFlash) {
    c.save();
    c.globalCompositeOperation = "lighter";
    const rg = c.createRadialGradient(W / 2, cy - 4, 10, W / 2, cy - 4, 300);
    rg.addColorStop(0, `rgba(255,200,100,${0.35 * s.effectsIntensity})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = rg;
    c.fillRect(W / 2 - 320, cy - 200, 640, 400);
    c.restore();
  }
  if (b.style === "boss") {
    txt(c, b.sub.toUpperCase(), W / 2, cy - 60, 14, "#9fe8ff", { align: "center", ls: 6 });
    txt(c, "BOSS", W / 2, cy + 58, 12, "#ff9a7a", { align: "center", ls: 8 });
  }
  setFont(c, st.size, FONT_DISP, 900);
  if (b.style === "boss") {
    // gradient #ffe7a8 -> #d9a441 with a 3 px #2a1608 outline
    c.save();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.letterSpacing = "12px";
    c.lineJoin = "round";
    c.miterLimit = 2;
    c.strokeStyle = "#2a1608";
    c.lineWidth = 6;
    c.strokeText(b.text, W / 2, cy - 6);
    if (glow > 0) {
      c.shadowColor = st.glow;
      c.shadowBlur = glow;
    }
    const tg = c.createLinearGradient(0, cy - 6 - st.size / 2, 0, cy - 6 + st.size / 2);
    tg.addColorStop(0, "#ffe7a8");
    tg.addColorStop(1, "#d9a441");
    c.fillStyle = tg;
    c.fillText(b.text, W / 2, cy - 6);
    c.restore();
    c.restore();
    return;
  }
  txt(c, b.text, W / 2 - slide, cy - 6, st.size, st.col, {
    align: "center",
    f: FONT_DISP,
    w: 900,
    ls: 10,
    out: st.out,
    sw: 8,
    glow: glow > 0 ? st.glow : null,
    gb: glow,
  });
  if (b.sub) txt(c, b.sub, W / 2 + slide, cy + 26, 14, INK, { align: "center", ls: 3 });
  c.restore();
}

/** Rect (design px) of a banner's text; plates and pops treat it as an obstacle. */
export function bannerRect(c: Ctx, b: Banner, W: number, H: number): Rect {
  const st = STYLE[b.style];
  const cy = Math.round(H * st.cy);
  setFont(c, st.size, FONT_DISP, 900);
  c.letterSpacing = `${b.style === "boss" ? 12 : 10}px`;
  let w = c.measureText(b.text).width;
  c.letterSpacing = "3px";
  setFont(c, 14, FONT_UI, "");
  w = Math.max(w, c.measureText(b.sub).width);
  c.letterSpacing = "0px";
  const top = b.style === "boss" ? cy - 70 : cy - 6 - st.size / 2 - 8;
  const bottom = b.style === "boss" ? cy + 70 : cy + 38;
  return { x: Math.round(W / 2 - w / 2 - 12), y: top, w: Math.ceil(w + 24), h: bottom - top };
}

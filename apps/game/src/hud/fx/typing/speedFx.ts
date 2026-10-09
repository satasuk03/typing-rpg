/**
 * Speed feedback (§4): the SWIFT / BLAZING plate in its reserved rect, the screen-edge glow and the
 * speed lines. The sim owns thresholds and cooldown (BurstWpm); this only renders.
 */
import { easeOutBack, easeOutQuad, SPEED } from "../../../level/typingFxParams";
import { txt } from "../../draw";
import { FONT_DISP, FONT_PIX } from "../../theme";
import { hash01 } from "./pool";

const SKEW = Math.tan((SPEED.skewDeg * Math.PI) / 180) * SPEED.plateH;
const TOTAL_MS = SPEED.enterMs + SPEED.holdMs + SPEED.exitMs;

interface Grads {
  cssW: number;
  swiftL: CanvasGradient;
  swiftR: CanvasGradient;
  blazeL: CanvasGradient;
  blazeR: CanvasGradient;
  swiftBg: CanvasGradient;
  blazeBg: CanvasGradient;
  blazeText: CanvasGradient;
}
let GR: Grads | null = null;
let GR_CTX: CanvasRenderingContext2D | null = null;

function edgeGrad(
  c: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  rgb: string,
): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.4, `rgba(${rgb},0.5)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

export class SpeedFx {
  /** 0 none, 1 swift, 2 blazing. */
  private band = 0;
  private level = 0;
  heat = 0;
  private typoBoost = 0;
  private plateAge = -1;
  private plateBand = 0;
  private wpmText = "";

  get plateLive(): boolean {
    return this.plateAge >= 0;
  }

  onBurst(band: "swift" | "blazing", wpm: number): void {
    const b = band === "blazing" ? 2 : 1;
    // BLAZING is never downgraded by a SWIFT inside its hold
    if (
      this.plateBand === 2 &&
      b === 1 &&
      this.plateAge >= 0 &&
      this.plateAge < SPEED.enterMs / 1000 + SPEED.holdMs / 1000
    )
      return;
    this.band = b;
    this.plateBand = b;
    this.level = b === 2 ? SPEED.heat.blazing : SPEED.heat.swift;
    this.heat = this.level;
    this.plateAge = 0;
    this.wpmText = `${Math.round(wpm)} WPM`;
  }
  /** @hot */
  onKey(): void {
    if (this.heat > 0) this.heat = Math.min(this.level, this.heat + SPEED.heatKeyTopUp);
  }
  onTypo(): void {
    this.typoBoost = 1;
  }
  clear(): void {
    this.heat = 0;
    this.plateAge = -1;
    this.typoBoost = 0;
    this.band = 0;
  }

  /** @hot */
  update(dt: number): void {
    if (this.heat > 0) {
      const mult = this.typoBoost > 0 ? SPEED.typoDecayMult : 1;
      this.heat = Math.max(0, this.heat - (dt * this.level * mult) / SPEED.heatDecaySec);
    }
    if (this.typoBoost > 0) this.typoBoost = Math.max(0, this.typoBoost - dt);
    if (this.plateAge >= 0) {
      this.plateAge += dt;
      if (this.plateAge * 1000 >= TOTAL_MS) this.plateAge = -1;
    }
  }

  private grads(c: CanvasRenderingContext2D, cssW: number, S: number): Grads {
    if (GR && GR_CTX === c && GR.cssW === cssW) return GR;
    const e = SPEED.edgePx * S;
    const bg = (a: string, b: string): CanvasGradient => {
      const g = c.createLinearGradient(0, 0, 0, SPEED.plateH);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      return g;
    };
    const tx = c.createLinearGradient(0, 3, 0, 31);
    tx.addColorStop(0, "#fff0b8");
    tx.addColorStop(1, "#ff8a3c");
    GR = {
      cssW,
      swiftL: edgeGrad(c, 0, e, "92,200,255"),
      swiftR: edgeGrad(c, cssW, cssW - e, "92,200,255"),
      blazeL: edgeGrad(c, 0, e, "255,122,42"),
      blazeR: edgeGrad(c, cssW, cssW - e, "255,122,42"),
      swiftBg: bg("#0b2f3a", "#06141a"),
      blazeBg: bg("#4a1406", "#1a0602"),
      blazeText: tx,
    };
    GR_CTX = c;
    return GR;
  }

  /** @hot Screen-edge glow and speed lines. Composite op "lighter" set by the caller. CSS px. */
  drawEdges(
    c: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    S: number,
    time: number,
    k: number,
    q: number,
    reducedFlash: boolean,
    reducedMotion: boolean,
  ): void {
    if (this.heat <= 0.003 || k <= 0) return;
    const g = this.grads(c, cssW, S);
    const blaze = this.band === 2;
    const cap = reducedFlash ? SPEED.edgeAlphaReducedFlash : SPEED.edgeAlpha;
    const a = Math.min(cap, SPEED.edgeAlpha * this.heat * k);
    const e = SPEED.edgePx * S;
    c.globalAlpha = a;
    c.fillStyle = blaze ? g.blazeL : g.swiftL;
    c.fillRect(0, 0, e, cssH);
    c.fillStyle = blaze ? g.blazeR : g.swiftR;
    c.fillRect(cssW - e, 0, e, cssH);
    if (reducedMotion) return;
    const n = Math.round(SPEED.lines * q);
    c.strokeStyle = blaze ? SPEED.blazeHex : SPEED.swiftHex;
    c.lineWidth = 1;
    const band = 90 * S;
    c.globalAlpha = Math.min(1, SPEED.lineAlpha * this.heat * k);
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const len = (40 + hash01(i, 3) * 80) * S;
      const y = Math.round(hash01(i, 11) * cssH) + 0.5;
      const span = band + len;
      const off = (time * 900 * S + hash01(i, 5) * span) % span;
      if (i % 2 === 0) {
        const x1 = off; // moves inward (rightwards) from the left edge
        c.moveTo(x1 - len, y);
        c.lineTo(x1, y);
      } else {
        const x1 = cssW - off;
        c.moveTo(x1 + len, y);
        c.lineTo(x1, y);
      }
    }
    c.stroke();
  }

  /** Draw the SWIFT / BLAZING plate (design px: the caller has scaled the context by S). */
  drawPlate(
    c: CanvasRenderingContext2D,
    W: number,
    time: number,
    reducedFlash: boolean,
    reducedMotion: boolean,
    cssW: number,
    S: number,
  ): void {
    if (this.plateAge < 0) return;
    const ms = this.plateAge * 1000;
    const g = this.grads(c, cssW, S);
    const rect = SPEED.burstRect(W);
    const blaze = this.plateBand === 2;
    let slide = 0;
    let alpha = 1;
    if (ms < SPEED.enterMs) {
      slide = reducedMotion ? 0 : 60 * (1 - easeOutBack(ms / SPEED.enterMs, 1.6));
      alpha = Math.min(1, ms / SPEED.fadeInMs);
    } else if (ms > SPEED.enterMs + SPEED.holdMs) {
      const u = (ms - SPEED.enterMs - SPEED.holdMs) / SPEED.exitMs;
      slide = reducedMotion ? 0 : -20 * easeOutQuad(u);
      alpha = 1 - u;
    }
    const x = rect.x + rect.w - SPEED.plateW + slide;
    const y = rect.y + (rect.h - SPEED.plateH) / 2;
    const w = SPEED.plateW;
    const h = SPEED.plateH;
    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha;
    const accent = blaze ? SPEED.blazeHex : SPEED.swiftHex;
    const shape = (): void => {
      c.beginPath();
      c.moveTo(SKEW, 0);
      c.lineTo(w, 0);
      c.lineTo(w - SKEW, h);
      c.lineTo(0, h);
      c.closePath();
    };
    if (!blaze) {
      // three speed lines trailing left of the plate
      c.strokeStyle = accent;
      c.lineWidth = 1;
      c.globalAlpha = alpha * 0.7;
      for (let i = 0; i < 3; i++) {
        const len = [18, 28, 40][i] as number;
        const ly = 12 + i * 10;
        c.beginPath();
        c.moveTo(-6, ly);
        c.lineTo(-6 - len, ly);
        c.stroke();
      }
      c.globalAlpha = alpha;
    } else {
      // flame tongues on the top edge, heights re-rolled every 80 ms (static with reduced motion)
      const bucket = reducedMotion ? 0 : Math.floor(time / 0.08);
      c.fillStyle = "#ff8a3c";
      c.globalAlpha = alpha * 0.9;
      for (let i = 0; i < 7; i++) {
        const fh = 6 + hash01(bucket, i) * 6;
        const bx = SKEW + ((w - SKEW) * (i + 0.5)) / 7;
        c.beginPath();
        c.moveTo(bx - 9, 1);
        c.lineTo(bx, -fh);
        c.lineTo(bx + 9, 1);
        c.closePath();
        c.fill();
      }
      c.globalAlpha = alpha;
    }
    shape();
    c.fillStyle = blaze ? g.blazeBg : g.swiftBg;
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = 2;
    c.strokeStyle = accent;
    c.stroke();
    // glint sweep: a 20 px diagonal band crossing the plate in 220 ms, starting at 160 ms
    if (!reducedFlash && ms >= 160 && ms < 380) {
      const u = (ms - 160) / 220;
      const bx = -20 + (w + 40) * u;
      c.save();
      shape();
      c.clip();
      c.globalAlpha = alpha * 0.5;
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(bx + SKEW, 0);
      c.lineTo(bx + SKEW + 20, 0);
      c.lineTo(bx + 20, h);
      c.lineTo(bx, h);
      c.closePath();
      c.fill();
      c.restore();
    }
    c.globalAlpha = alpha;
    if (blaze)
      txt(c, "BLAZING", w / 2, 17, 28, g.blazeText as unknown as string, {
        f: FONT_DISP,
        w: 900,
        align: "center",
        ls: 4,
        sw: 3,
      });
    else
      txt(c, "SWIFT", w / 2, 17, 26, "#e6fbff", {
        f: FONT_DISP,
        w: 900,
        align: "center",
        ls: 4,
        sw: 3,
      });
    txt(c, this.wpmText, w / 2, 36, 12, "rgba(255,255,255,0.7)", {
      f: FONT_PIX,
      align: "center",
      sw: 3,
    });
    c.restore();
  }
}

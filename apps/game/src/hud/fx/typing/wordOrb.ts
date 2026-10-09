/**
 * WordOrbs (spec §9.1, first 120 ms): when a word of a sentence plate is finished its letters send bright
 * streaks to the word's centre, where they collapse into a glow orb (20 px). At 120 ms the orb is handed
 * to the world: `onLaunch(x, y, payload)` receives its CSS-px position and the world converts it with
 * `screenToActionPlane` and spawns the bolt. The plate's own letters are never touched (they are typed);
 * the streaks start inside the letter rects, so the `"above"` clip removes them there: the visible part is
 * the collapse outside the cells and the orb, which is intended (words stay readable).
 */
import { easeInQuad } from "../../../level/typingFxParams";
import { drawGlow, type GlowSprites } from "./glowSprites";

export const ORB_CAP = 4;
const MAX_LETTERS = 16;
const COLLAPSE_S = 0.12;
const FADE_S = 0.06;

export interface OrbPayload {
  plateId: number;
  kind: string;
  wordIndex: number;
  wordCount: number;
  /** Final word of its sentence. */
  final: boolean;
  /** Where the bolt leaves the HUD: the plate's bottom edge (CSS px), so it is not hidden behind the opaque plate. */
  exitY: number;
}

interface Orb {
  live: boolean;
  age: number;
  cx: number;
  cy: number;
  n: number;
  col: number;
  launched: boolean;
  payload: OrbPayload;
  xy: Float32Array;
}

export class WordOrbs {
  private readonly o: Orb[] = [];
  count = 0;
  /** Hand-off at 120 ms. */
  onLaunch: (x: number, y: number, p: OrbPayload) => void = () => {};

  constructor() {
    for (let i = 0; i < ORB_CAP; i++)
      this.o.push({
        live: false,
        age: 0,
        cx: 0,
        cy: 0,
        n: 0,
        col: 0,
        launched: false,
        payload: { plateId: 0, kind: "", wordIndex: 0, wordCount: 0, final: false, exitY: 0 },
        xy: new Float32Array(MAX_LETTERS * 2),
      });
  }

  /** `xy` holds `n` letter centres (x, y pairs, CSS px); the orb forms at their centroid. */
  start(xy: ArrayLike<number>, n: number, col: number, p: OrbPayload): void {
    let q = this.o.find((x) => !x.live);
    if (!q) {
      q = this.o[0] as Orb;
      for (const c of this.o) if (c.age > q.age) q = c;
    }
    n = Math.min(MAX_LETTERS, n);
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
      q.xy[i * 2] = xy[i * 2] as number;
      q.xy[i * 2 + 1] = xy[i * 2 + 1] as number;
      sx += xy[i * 2] as number;
      sy += xy[i * 2 + 1] as number;
    }
    q.live = true;
    q.age = 0;
    q.n = n;
    q.cx = n > 0 ? sx / n : 0;
    q.cy = n > 0 ? sy / n : 0;
    q.col = col;
    q.launched = false;
    q.payload.plateId = p.plateId;
    q.payload.kind = p.kind;
    q.payload.wordIndex = p.wordIndex;
    q.payload.wordCount = p.wordCount;
    q.payload.final = p.final;
    q.payload.exitY = p.exitY;
    this.count++;
  }

  update(dt: number): void {
    let live = 0;
    for (const q of this.o) {
      if (!q.live) continue;
      q.age += dt;
      if (!q.launched && q.age >= COLLAPSE_S) {
        q.launched = true;
        this.onLaunch(q.cx, Math.max(q.cy, q.payload.exitY), q.payload);
      }
      if (q.age >= COLLAPSE_S + FADE_S) q.live = false;
      else live++;
    }
    this.count = live;
  }

  clear(): void {
    for (const q of this.o) q.live = false;
    this.count = 0;
  }

  /** `"above"` layer, additive look through sprites. */
  draw(c: CanvasRenderingContext2D, S: number, sprites: GlowSprites, k: number): void {
    if (this.count <= 0 || k <= 0) return;
    for (const q of this.o) {
      if (!q.live) continue;
      const u = Math.min(1, q.age / COLLAPSE_S);
      const e = easeInQuad(u);
      // collapse streaks: bright duplicates of the letters moving to the centre
      for (let i = 0; i < q.n; i++) {
        const x = (q.xy[i * 2] as number) + (q.cx - (q.xy[i * 2] as number)) * e;
        const y = (q.xy[i * 2 + 1] as number) + (q.cy - (q.xy[i * 2 + 1] as number)) * e;
        const px =
          (q.xy[i * 2] as number) + (q.cx - (q.xy[i * 2] as number)) * Math.max(0, e - 0.25);
        const py =
          (q.xy[i * 2 + 1] as number) +
          (q.cy - (q.xy[i * 2 + 1] as number)) * Math.max(0, e - 0.25);
        c.globalAlpha = Math.min(1, (0.9 - 0.4 * u) * Math.min(1, k + 0.3));
        c.strokeStyle = "#ffffff";
        c.lineWidth = Math.max(1.5, 2 * S);
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.stroke();
        drawGlow(c, sprites, q.col, x, y, 5 * S, 0.9);
      }
      // the orb itself
      const fade = q.age > COLLAPSE_S ? 1 - (q.age - COLLAPSE_S) / FADE_S : 1;
      const r = (6 + 14 * easeInQuad(u)) * S;
      c.globalCompositeOperation = "lighter";
      drawGlow(c, sprites, q.col, q.cx, q.cy, r * 1.5, Math.min(1, 0.9 * fade * (0.4 + k)));
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = fade;
      c.fillStyle = "#ffffff";
      const core = Math.max(2, r * 0.32);
      c.fillRect(Math.round(q.cx - core), Math.round(q.cy - core), core * 2, core * 2);
    }
    c.globalAlpha = 1;
  }
}

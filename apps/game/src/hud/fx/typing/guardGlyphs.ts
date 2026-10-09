/**
 * GuardGlyphs (spec §8.1, §8.2, §8.3 "ignored", §6 guard typo): one blue hexagon rune per typed guard
 * letter. Each glyph flies from its letter to a slot on an arc in front of the hero (200 ms), locks
 * with a white flash and a 1.3 -> 1.0 scale settle, and bobs while the word is finished. On
 * `GuardWordTyped` the glyphs converge onto the arc's chord (a vertical "wall") and pop. When the
 * word is ignored they crumble (gravity, fade). A guard typo flickers them (alpha 0.3, 2 x 60 ms).
 *
 * Shape (hexagon) plus colour (blue) is the colour-blind cue (plan §8 gate 6). Drawn on the `"above"`
 * layer, after the sparks. Everything is in CSS px.
 */
import { easeOutCubic } from "../../../level/typingFxParams";
import { drawGlow, type GlowSprites } from "./glowSprites";

export const GUARD_CAP = 12;
const ST_FREE = 0;
const ST_FLY = 1;
const ST_LOCKED = 2;
const ST_SNAP = 3;
const ST_POP = 4;
const ST_CRUMBLE = 5;

const FLY_S = 0.2;
const LOCK_S = 0.12;
const POP_S = 0.08;
const CRUMBLE_S = 0.4;
const ARC_R = 70;
const ARC_X = 60;
const HEX_R = 17;
const OUTLINE = "#7fc8ff";
const FILL = "rgba(70,150,255,0.34)";
const RUNE = "#bfe4ff";

interface Glyph {
  st: number;
  /** Slot index on the arc and the number of slots. */
  slot: number;
  n: number;
  age: number;
  /** Flight start (the letter's top edge) and the control point. */
  sx: number;
  sy: number;
  /** Snap start. */
  px: number;
  py: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rune: number;
  plateId: number;
  ownerId: number;
  /** Seconds of flicker left (guard typo). */
  flick: number;
  landed: boolean;
}

/** Inner 3-stroke runes: endpoints in a unit hexagon (x0, y0, x1, y1 ...). */
const RUNES: readonly (readonly number[])[] = [
  [-0.5, -0.4, 0, 0.5, 0.5, -0.4],
  [-0.5, 0.4, 0, -0.5, 0.5, 0.4],
  [-0.45, 0, 0.45, 0, 0, 0.5, 0, -0.5],
  [-0.5, -0.3, 0.5, -0.3, 0, 0.5],
  [-0.4, -0.5, -0.4, 0.5, 0.4, 0, -0.4, -0.5],
  [0, -0.55, 0, 0.55, -0.45, 0.2, 0.45, 0.2],
];

export class GuardGlyphs {
  private readonly g: Glyph[] = [];
  /** Centre of the arc (CSS px); set by the owner every frame from the weapon anchor. */
  cx = 0;
  cy = 0;
  count = 0;
  /** Called when a glyph lands (x, y CSS px): the owner throws 3 sparks. */
  onLand: (x: number, y: number) => void = () => {};
  /** Called when the snap pops (x, y of the wall centre). */
  onPop: (x: number, y: number) => void = () => {};
  private snapMs = 100;
  /** White pop flash age of the whole wall (s), -1 = none. */
  private popAge = -1;
  private flickerAge = -1;

  constructor() {
    for (let i = 0; i < GUARD_CAP; i++)
      this.g.push({
        st: ST_FREE,
        slot: 0,
        n: 1,
        age: 0,
        sx: 0,
        sy: 0,
        px: 0,
        py: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rune: 0,
        plateId: -1,
        ownerId: -1,
        flick: 0,
        landed: false,
      });
  }

  /** True when this plate has live glyphs. */
  has(plateId: number): boolean {
    for (const q of this.g) if (q.st !== ST_FREE && q.plateId === plateId) return true;
    return false;
  }
  hasOwner(ownerId: number): boolean {
    for (const q of this.g) if (q.st !== ST_FREE && q.ownerId === ownerId) return true;
    return false;
  }

  /** Slot position on the arc (CSS px), -60 .. +60 degrees from top to bottom. */
  private slotPos(slot: number, n: number, S: number, out: { x: number; y: number }): void {
    const th = n <= 1 ? 0 : (-60 + (120 * slot) / (n - 1)) * (Math.PI / 180);
    out.x = this.cx + ARC_X * S + Math.cos(th) * ARC_R * S;
    out.y = this.cy + Math.sin(th) * ARC_R * S;
  }

  private readonly P = { x: 0, y: 0 };

  /**
   * One guard letter was typed. `i`/`len` are the letter index and word length, `(lx, ly)` the top
   * edge of the letter (CSS px). Letters beyond 10 share a slot (the glyph just re-locks).
   */
  add(
    plateId: number,
    ownerId: number,
    i: number,
    len: number,
    lx: number,
    ly: number,
    S: number,
  ): void {
    const n = Math.min(len, 10);
    const slot = Math.min(n - 1, Math.floor((i * n) / len));
    for (const q of this.g)
      if ((q.st === ST_LOCKED || q.st === ST_FLY) && q.plateId === plateId && q.slot === slot) {
        // a slot already has its glyph (letters beyond 10 share): re-lock it instead of adding another
        if (q.st === ST_LOCKED) {
          q.age = 0;
          q.landed = true;
        }
        return;
      }
    let q: Glyph | undefined;
    for (const c of this.g)
      if (c.st === ST_FREE) {
        q = c;
        break;
      }
    if (!q) return;
    q.st = ST_FLY;
    q.slot = slot;
    q.n = n;
    q.age = 0;
    q.sx = lx;
    q.sy = ly;
    q.rune = ((Math.imul(plateId + 1, 2654435761) >>> 0) + i * 7) % RUNES.length;
    q.plateId = plateId;
    q.ownerId = ownerId;
    q.flick = 0;
    q.landed = false;
    this.slotPos(slot, n, S, this.P);
    q.x = lx;
    q.y = ly;
    this.count++;
  }

  /** `GuardWordTyped`: converge onto the chord, then pop. `ms` is compressed for a late snap. */
  snap(plateId: number, ms: number): void {
    this.snapMs = Math.max(40, ms);
    for (const q of this.g)
      if (q.st !== ST_FREE && q.plateId === plateId) {
        q.st = ST_SNAP;
        q.age = 0;
        q.px = q.x;
        q.py = q.y;
      }
  }

  /** The word was ignored (EnemyAttack hit / plate expired): the glyphs fall and fade. */
  crumble(plateId: number): void {
    for (let i = 0; i < this.g.length; i++) {
      const q = this.g[i] as Glyph;
      if (q.st === ST_FREE || (plateId >= 0 && q.plateId !== plateId)) continue;
      if (q.st === ST_CRUMBLE || q.st === ST_POP) continue;
      q.st = ST_CRUMBLE;
      q.age = 0;
      q.vx = (((i * 37) % 11) - 5) * 9;
      q.vy = -40 - ((i * 13) % 7) * 8;
    }
  }

  /** The enemy attacked while its glyphs were still up (the word was ignored). */
  crumbleOwner(ownerId: number): void {
    for (const q of this.g) if (q.st !== ST_FREE && q.ownerId === ownerId) this.crumble(q.plateId);
  }

  /** Guard typo: every built glyph drops to alpha 0.3 for 2 x 60 ms (they are NOT removed). */
  flicker(): void {
    this.flickerAge = 0;
  }

  clear(): void {
    for (const q of this.g) q.st = ST_FREE;
    this.count = 0;
    this.popAge = -1;
  }

  update(dt: number, S: number): void {
    if (this.flickerAge >= 0) {
      this.flickerAge += dt;
      if (this.flickerAge > 0.12) this.flickerAge = -1;
    }
    if (this.popAge >= 0) {
      this.popAge += dt;
      if (this.popAge > POP_S) this.popAge = -1;
    }
    let live = 0;
    for (let i = 0; i < this.g.length; i++) {
      const q = this.g[i] as Glyph;
      if (q.st === ST_FREE) continue;
      q.age += dt;
      live++;
      switch (q.st) {
        case ST_FLY: {
          this.slotPos(q.slot, q.n, S, this.P);
          const u = Math.min(1, q.age / FLY_S);
          const e = easeOutCubic(u);
          const cxp = (q.sx + this.P.x) / 2;
          const cyp = Math.min(q.sy, this.P.y) - 50 * S;
          const a = (1 - e) * (1 - e);
          const b = 2 * (1 - e) * e;
          const c = e * e;
          q.x = a * q.sx + b * cxp + c * this.P.x;
          q.y = a * q.sy + b * cyp + c * this.P.y;
          if (u >= 1) {
            q.st = ST_LOCKED;
            q.age = 0;
            q.landed = true;
            this.onLand(this.P.x, this.P.y);
          }
          break;
        }
        case ST_LOCKED: {
          this.slotPos(q.slot, q.n, S, this.P);
          q.x = this.P.x;
          q.y = this.P.y;
          break;
        }
        case ST_SNAP: {
          const u = Math.min(1, q.age / (this.snapMs / 1000));
          // easeInBack 1.4 onto the chord x = arc centre + 0.5 R
          const s = 1.4;
          const e = (s + 1) * u * u * u - s * u * u;
          const wallX = this.cx + (ARC_X + ARC_R * 0.5) * S;
          q.x = q.px + (wallX - q.px) * e;
          if (u >= 1) {
            q.st = ST_POP;
            q.age = 0;
            this.popAge = 0;
            this.onPop(q.x, q.y);
          }
          break;
        }
        case ST_POP:
          if (q.age >= POP_S) {
            q.st = ST_FREE;
            live--;
          }
          break;
        case ST_CRUMBLE:
          q.vy += 600 * S * dt;
          q.x += q.vx * S * dt;
          q.y += q.vy * S * dt;
          if (q.age >= CRUMBLE_S) {
            q.st = ST_FREE;
            live--;
          }
          break;
        default:
          break;
      }
    }
    this.count = live;
  }

  /** `"above"` layer. `time` is the HUD clock (idle bob). */
  draw(
    c: CanvasRenderingContext2D,
    S: number,
    time: number,
    k: number,
    reducedMotion: boolean,
    sprites: GlowSprites,
    glowIdx: number,
  ): void {
    if (this.count <= 0 || k <= 0) return;
    // two 60 ms dips to alpha 0.3 with a one-frame gap between them
    const dip =
      this.flickerAge >= 0 ? (this.flickerAge < 0.05 || this.flickerAge > 0.07 ? 0.3 : 1) : 1;
    for (let i = 0; i < this.g.length; i++) {
      const q = this.g[i] as Glyph;
      if (q.st === ST_FREE) continue;
      let a = 0.85;
      let sc = 1;
      let bob = 0;
      let white = 0;
      const x = q.x;
      let y = q.y;
      if (q.st === ST_FLY) {
        sc = 0.8 + 0.2 * Math.min(1, q.age / FLY_S);
      } else if (q.st === ST_LOCKED) {
        const u = Math.min(1, q.age / LOCK_S);
        if (q.landed) {
          sc = 1.3 - 0.3 * easeOutCubic(u);
          white = Math.max(0, 1 - q.age / 0.06);
        }
        bob = reducedMotion ? 0 : Math.sin(time * Math.PI * 2 * 1.2 + q.slot * 1.7) * 1.5 * S;
      } else if (q.st === ST_SNAP) {
        sc = 1 - 0.1 * (q.age / (this.snapMs / 1000));
        white = 0.4;
      } else if (q.st === ST_POP) {
        const u = q.age / POP_S;
        sc = 1 + 0.5 * u;
        a = 0.85 * (1 - u);
        white = 1;
      } else if (q.st === ST_CRUMBLE) {
        const u = q.age / CRUMBLE_S;
        a = 0.85 * (1 - u);
        sc = 1 - 0.25 * u;
      }
      if (q.st !== ST_POP && q.st !== ST_CRUMBLE) a *= dip;
      y += bob;
      const r = HEX_R * S * sc;
      c.globalAlpha = Math.min(1, a * Math.min(1, k + 0.3));
      if (q.st !== ST_FLY) {
        c.globalCompositeOperation = "lighter";
        drawGlow(c, sprites, glowIdx, x, y, r * 2.1, 0.55 * a);
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = Math.min(1, a * Math.min(1, k + 0.3));
      }
      // hexagon body
      c.beginPath();
      for (let j = 0; j < 6; j++) {
        const th = Math.PI / 6 + (j * Math.PI) / 3;
        const px = x + Math.cos(th) * r;
        const py = y + Math.sin(th) * r;
        if (j === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = FILL;
      c.fill();
      c.lineWidth = Math.max(1.5, 2.2 * S);
      c.strokeStyle = white > 0.3 ? "#ffffff" : OUTLINE;
      c.stroke();
      // inner rune: 3 strokes
      const rune = RUNES[q.rune] as readonly number[];
      c.beginPath();
      c.moveTo(x + (rune[0] as number) * r * 0.9, y + (rune[1] as number) * r * 0.9);
      for (let j = 2; j < rune.length; j += 2)
        c.lineTo(x + (rune[j] as number) * r * 0.9, y + (rune[j + 1] as number) * r * 0.9);
      c.lineWidth = Math.max(1, 1.5 * S);
      c.strokeStyle = white > 0.3 ? "#ffffff" : RUNE;
      c.stroke();
      if (white > 0) {
        c.globalAlpha = Math.min(1, white * 0.6 * a);
        c.fillStyle = "#ffffff";
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }
}

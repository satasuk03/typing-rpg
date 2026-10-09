/**
 * QuadPool: a fixed set of transient fx quads of ONE kind (Star, Ring, Glow, Beam, Guard...), the POC's
 * `fxQuad(kind, o)` with a lifetime: scale lerps s0 -> s1, intensity fades out, `uP` runs 0 -> 1. Built once;
 * `spawn` writes numbers into a free slot (the oldest is stolen when all are busy). Nothing allocates per spawn.
 */

import type { FxKindId } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { FxQuad } from "../FxQuad";
import { eOut3 } from "./params";

interface Slot {
  q: FxQuad;
  on: boolean;
  t: number;
  life: number;
  s0: number;
  s1: number;
  ax: number;
  ay: number;
  i: number;
  ease: boolean;
  fadeIn: number;
}

/** Reusable spawn description (module-level scratch; fill the fields you need, `spawn` resets the rest). */
export interface QuadSpec {
  x: number;
  y: number;
  z: number;
  s0: number;
  s1: number;
  /** Aspect multipliers on x / y (a beam is a thin tall quad). */
  ax: number;
  ay: number;
  life: number;
  i: number;
  rot: number;
  /** Lie flat on the ground. */
  ground: boolean;
  /** easeOut on the scale instead of linear. */
  ease: boolean;
  /** Ramp the intensity in over this fraction of the life first. */
  fadeIn: number;
  r: number;
  g: number;
  b: number;
  r2: number;
  g2: number;
  b2: number;
}

export function newQuadSpec(): QuadSpec {
  return {
    x: 0,
    y: 0,
    z: 0,
    s0: 1,
    s1: 1,
    ax: 1,
    ay: 1,
    life: 0.4,
    i: 1,
    rot: 0,
    ground: false,
    ease: false,
    fadeIn: 0,
    r: 1,
    g: 1,
    b: 1,
    r2: 1,
    g2: 1,
    b2: 1,
  };
}

export function resetQuadSpec(q: QuadSpec): QuadSpec {
  q.x = q.y = q.z = 0;
  q.s0 = q.s1 = 1;
  q.ax = q.ay = 1;
  q.life = 0.4;
  q.i = 1;
  q.rot = 0;
  q.ground = false;
  q.ease = false;
  q.fadeIn = 0;
  q.r = q.g = q.b = q.r2 = q.g2 = q.b2 = 1;
  return q;
}

export class QuadPool {
  private readonly slots: Slot[] = [];
  private next = 0;

  constructor(world: RenderWorld, kind: FxKindId, n: number, renderOrder = 8) {
    for (let i = 0; i < n; i++)
      this.slots.push({
        q: new FxQuad(world, kind, renderOrder, i * 7.3),
        on: false,
        t: 0,
        life: 1,
        s0: 1,
        s1: 1,
        ax: 1,
        ay: 1,
        i: 1,
        ease: false,
        fadeIn: 0,
      });
  }

  get live(): number {
    let n = 0;
    for (const s of this.slots) if (s.on) n++;
    return n;
  }

  spawn(o: QuadSpec): void {
    let s = this.slots[this.next] as Slot;
    for (let i = 0; i < this.slots.length; i++) {
      const c = this.slots[(this.next + i) % this.slots.length] as Slot;
      if (!c.on) {
        s = c;
        break;
      }
    }
    this.next = (this.next + 1) % this.slots.length;
    s.on = true;
    s.t = 0;
    s.life = Math.max(0.02, o.life);
    s.s0 = o.s0;
    s.s1 = o.s1;
    s.ax = o.ax;
    s.ay = o.ay;
    s.i = o.i;
    s.ease = o.ease;
    s.fadeIn = o.fadeIn;
    const m = s.q.mesh;
    s.q.color(o.r, o.g, o.b).color2(o.r2, o.g2, o.b2).at(o.x, o.y, o.z).progress(0);
    m.rotation.set(o.ground ? -Math.PI / 2 : 0, 0, o.rot);
    m.scale.set(o.s0 * o.ax, o.s0 * o.ay, 1);
    s.q.intensity(o.i * (o.fadeIn > 0 ? 0 : 1));
  }

  /** @hot */
  update(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      if (!s.on) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.on = false;
        s.q.intensity(0);
        continue;
      }
      const e = s.ease ? eOut3(k) : k;
      const sc = s.s0 + (s.s1 - s.s0) * e;
      s.q.mesh.scale.set(sc * s.ax, sc * s.ay, 1);
      s.q.progress(k);
      const fi = s.fadeIn > 0 ? Math.min(1, k / s.fadeIn) : 1;
      s.q.intensity(s.i * (1 - k) * fi);
    }
  }

  clear(): void {
    for (const s of this.slots) {
      s.on = false;
      s.q.intensity(0);
    }
  }

  dispose(): void {
    for (const s of this.slots) s.q.dispose();
  }
}

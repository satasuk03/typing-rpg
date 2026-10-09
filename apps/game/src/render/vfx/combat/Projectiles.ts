/**
 * Projectiles: the pooled flying effects of the combat library: the Fireball (POC: fireball quad + glow + held
 * light + ember trail, arcing to the target), the staff bolt and the Doom Spell bolt. A projectile only FLIES; the
 * impact belongs to the `Hit` event (so the sim stays the single source of timing): when it arrives before its
 * hit it waits up to `HOLD` seconds, then `onExpire` plays the impact anyway.
 */
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { FxQuad } from "../FxQuad";
import { PK_GLOW, PK_STREAK } from "../PooledParticles";
import type { FxKit } from "./kit";
import type { Rgb } from "./params";

export const P_FIRE = 0;
export const P_BOLT = 1;
export const P_DOOM = 2;
const HOLD = 0.3;

interface Proj {
  on: boolean;
  type: number;
  t: number;
  delay: number;
  dur: number;
  sx: number;
  sy: number;
  sz: number;
  tid: number;
  tx: number;
  ty: number;
  tz: number;
  arc: number;
  hold: number;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  core: FxQuad;
  glow: FxQuad;
  fire: FxQuad;
}

const EN = { x: 0, y: 0, z: 0 };

export class Projectiles {
  private readonly slots: Proj[] = [];
  /** Called when a projectile arrived and no hit came to play its impact. */
  onExpire: (type: number, tid: number, x: number, y: number, z: number) => void = () => {};

  constructor(
    world: RenderWorld,
    private readonly kit: FxKit,
    n = 3,
  ) {
    for (let i = 0; i < n; i++)
      this.slots.push({
        on: false,
        type: 0,
        t: 0,
        delay: 0,
        dur: 0.5,
        sx: 0,
        sy: 0,
        sz: 0,
        tid: -1,
        tx: 0,
        ty: 0,
        tz: 0,
        arc: 0,
        hold: 0,
        x: 0,
        y: 0,
        z: 0,
        r: 1,
        g: 1,
        b: 1,
        core: new FxQuad(world, FxKind.Star, 10, i),
        glow: new FxQuad(world, FxKind.Glow, 9, i),
        fire: new FxQuad(world, FxKind.Fireball, 10, i * 2.7),
      });
  }

  get live(): number {
    let n = 0;
    for (const s of this.slots) if (s.on) n++;
    return n;
  }

  has(type: number): boolean {
    for (const s of this.slots) if (s.on && s.type === type) return true;
    return false;
  }

  launch(
    type: number,
    sx: number,
    sy: number,
    sz: number,
    tid: number,
    delay: number,
    dur: number,
    arc: number,
    col: Rgb,
    /** Fixed aim point (tid < 0): the hero, for the Doom bolt. */
    to?: { x: number; y: number; z: number },
  ): void {
    if (this.kit.scale.k <= 0) return;
    let s = this.slots[0] as Proj;
    for (const c of this.slots)
      if (!c.on) {
        s = c;
        break;
      }
    s.on = true;
    s.type = type;
    s.t = 0;
    s.delay = delay;
    s.dur = Math.max(0.08, dur);
    s.sx = sx;
    s.sy = sy;
    s.sz = sz;
    s.tid = tid;
    s.arc = arc;
    s.hold = 0;
    s.x = sx;
    s.y = sy;
    s.z = sz;
    s.r = col[0];
    s.g = col[1];
    s.b = col[2];
    // aim point: the target's body now (kept current each frame); fall back to straight ahead
    if (to) {
      s.tx = to.x;
      s.ty = to.y;
      s.tz = to.z;
    } else if (this.kit.deps.anchors.enemy(tid, EN)) {
      s.tx = EN.x;
      s.ty = EN.y;
      s.tz = EN.z + 0.4;
    } else {
      s.tx = sx + 6;
      s.ty = sy;
      s.tz = sz;
    }
    s.core.intensity(0);
    s.glow.intensity(0);
    s.fire.intensity(0);
  }

  /** The matching `Hit` arrived: the projectile is done (the hit plays the impact). */
  consume(type: number, tid: number): void {
    for (const s of this.slots)
      if (s.on && s.type === type && (tid < 0 || s.tid === tid || s.tid < 0)) {
        this.stop(s);
        return;
      }
  }

  private stop(s: Proj): void {
    s.on = false;
    s.core.intensity(0);
    s.glow.intensity(0);
    s.fire.intensity(0);
    if (s.type === P_FIRE) {
      const a = this.kit.lights.aura;
      a.intensity = 0;
      a.radius = 0;
    }
  }

  /** @hot */
  update(dt: number): void {
    const kit = this.kit;
    const sc = kit.scale;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Proj;
      if (!s.on) continue;
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.t += dt;
      if (s.tid >= 0 && kit.deps.anchors.enemy(s.tid, EN)) {
        s.tx = EN.x;
        s.ty = EN.y;
        s.tz = EN.z + 0.4;
      }
      const p = Math.min(1, s.t / s.dur);
      if (p >= 1) {
        s.core.intensity(0);
        s.glow.intensity(0);
        s.fire.intensity(0);
        if (s.type === P_FIRE) {
          kit.lights.aura.intensity = 0;
          kit.lights.aura.radius = 0;
        }
        s.hold += dt;
        if (s.hold >= HOLD) {
          s.on = false;
          this.onExpire(s.type, s.tid, s.tx, s.ty, s.tz);
        }
        continue;
      }
      s.x = s.sx + (s.tx - s.sx) * p;
      s.y = s.sy + (s.ty - s.sy) * p + Math.sin(p * Math.PI) * s.arc;
      s.z = s.sz + (s.tz - s.sz) * p;
      const g = sc.k <= 0 ? 0 : 0.5 + 0.5 * sc.k;
      if (s.type === P_FIRE) {
        s.fire
          .at(s.x, s.y, s.z)
          .size(1.2 + 0.1 * Math.sin(kit.time * 30))
          .intensity(1.3 * g * kit.glare * kit.caveDim);
        s.fire.mesh.rotation.z += dt * 8;
        s.glow
          .color(1.2, 0.42, 0.1)
          .at(s.x, s.y, s.z - 0.1)
          .size(2.4)
          .intensity(0.6 * g * kit.glare);
        // held light rides with the ball
        kit.lights.setAura(s.x, s.y, s.z + 0.3, 1, 0.5, 0.18, 3.2 * g * kit.glare * kit.caveDim, 6);
        for (let j = 0; j < kit.n(3); j++) {
          const sp = kit.p(
            s.x + (kit.rnd() - 0.5) * 0.3,
            s.y + (kit.rnd() - 0.5) * 0.3,
            s.z,
            (kit.rnd() - 0.5) * 1.2 - 2,
            kit.rnd() * 1.4,
            kit.rnd() - 0.5,
            0.35 + kit.rnd() * 0.2,
            0.28,
            PK_GLOW,
            [2, 0.7, 0.15],
            0.8,
          );
          sp.size1 = 0.05;
          sp.drag = 2;
          kit.emitA(sp);
        }
        if (kit.n(1) > 0) {
          const sp = kit.p(
            s.x,
            s.y,
            s.z,
            -3 + (kit.rnd() - 0.5) * 2,
            (kit.rnd() - 0.2) * 3,
            0,
            0.4,
            0.04,
            PK_STREAK,
            [4, 2, 0.5],
          );
          sp.st = 0.06;
          sp.grav = 3;
          kit.emitA(sp);
        }
      } else {
        // bolt: a bright star core with a coloured halo and a streak trail
        const big = s.type === P_DOOM ? 1.5 : 0.8;
        // W4: bright forest dims the bolt (soft); and a bolt arriving on a big pale target (the Golem) dims over the last
        // 40% of its flight so the core star does not wash the body out before the hit plays
        const near = s.tid >= 0 && p > 0.6 ? (p - 0.6) / 0.4 : 0;
        const bk = near > 0 ? 1 - (1 - kit.bigTargetK(s.tid)) * near : 1;
        s.core
          .color(s.r, s.g, s.b)
          .at(s.x, s.y, s.z)
          .size(big * 1.2)
          .intensity(1.1 * g * kit.glareSoft * bk);
        s.core.mesh.rotation.z += dt * 10;
        s.glow
          .color(s.r * 0.6, s.g * 0.6, s.b * 0.6)
          .at(s.x, s.y, s.z - 0.1)
          .size(big * 2.2)
          .intensity(0.8 * g * kit.glare * bk);
        for (let j = 0; j < kit.n(2); j++) {
          const sp = kit.p(
            s.x,
            s.y + (kit.rnd() - 0.5) * 0.2,
            s.z,
            -4 * (s.tx >= s.sx ? 1 : -1) + (kit.rnd() - 0.5),
            (kit.rnd() - 0.5) * 1.5,
            0,
            0.28,
            0.05,
            PK_STREAK,
            [s.r, s.g, s.b],
          );
          sp.st = 0.06;
          kit.emitA(sp);
        }
      }
    }
  }

  clear(): void {
    for (const s of this.slots) this.stop(s);
  }

  dispose(): void {
    for (const s of this.slots) {
      s.core.dispose();
      s.glow.dispose();
      s.fire.dispose();
    }
  }
}

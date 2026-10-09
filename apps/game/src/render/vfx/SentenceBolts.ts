/**
 * SentenceBolts (spec §9.1): the world half of a finished sentence word. The HUD collapses the word into an
 * orb and hands its screen position over; `launch` receives the point already converted to the action plane
 * (`screenToActionPlane`). A bolt flies 250 ms along an arc (apex +1.2 u) to the boss's body and bursts on arrival:
 * star, light flash, shake, 10 sparks. T6.3 #15: the bolt used to be invisible in flight, so it is now three layers:
 * a 1.2 u soft halo in the bolt colour, a small 0.35 u hot core that turns violet -> white over the flight, and a
 * 6-sample trail (6 glow particles per frame spread along the path travelled since the last frame, shrinking and
 * fading), plus a rotating star head. Bolts escalate through the sentence (`0.7 + 0.6 * (wordIndex + 1) / wordCount`); the last word of
 * a doom sentence is x1.5 with a camera punch; second wind sends teal bolts at the hero (a heal).
 *
 * Two bolt slots (words arrive at typing speed, never closer than a flight apart); a third steals the oldest.
 */
import { easeOutQuad } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { LIGHT_MAX_RADIUS, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { LightSlots } from "./LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_GLOW,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TypingFxSettings } from "./types";

export const BOLT_FLIGHT_S = 0.25;
/** Arc height above the straight line at mid-flight (world units). */
export const BOLT_APEX = 1.2;
export const BOLT_CORE = 0.35;
export const BOLT_HALO = 1.2;
export const BOLT_TRAIL_SAMPLES = 6;
const SLOTS = 2;
const SPEC: ParticleSpec = newSpec();

export const BOLT_COLORS = {
  doom: [1.2, 0.6, 2.0] as Rgb,
  finisher: [1.8, 1.4, 0.5] as Rgb,
  secondWind: [0.35, 1.5, 1.35] as Rgb,
};

/** Bolt scale through a sentence (spec): `0.7 + 0.6 * (wordIndex + 1) / wordCount`. */
export function boltScale(wordIndex: number, wordCount: number): number {
  return 0.7 + (0.6 * (wordIndex + 1)) / Math.max(1, wordCount);
}

interface Bolt {
  live: boolean;
  t: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  scale: number;
  doomFinal: boolean;
  heal: boolean;
  rgb: Rgb;
  /** Impact clock (s), -1 until it arrives. */
  hitT: number;
  /** Where the bolt was last frame (the trail is spread from here to the current position). */
  px: number;
  py: number;
  /** False until the first flight frame has set `px/py`. */
  seen: boolean;
  halo: FxQuad;
  core: FxQuad;
  head: FxQuad;
  burst: FxQuad;
}

export class SentenceBolts {
  private readonly b: Bolt[] = [];
  /** Bolts in flight or bursting (diagnostics). */
  count = 0;
  /** Total launched (tests). */
  launched = 0;
  /** Called on impact so the owner can add camera work the bolt itself does not know about. */
  onImpact: (doomFinal: boolean, heal: boolean) => void = () => {};

  constructor(
    private readonly world: RenderWorld,
    private readonly pool: PooledParticles,
    private readonly lights: LightSlots,
  ) {
    for (let i = 0; i < SLOTS; i++)
      this.b.push({
        live: false,
        t: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        scale: 1,
        doomFinal: false,
        heal: false,
        rgb: [1, 1, 1],
        hitT: -1,
        px: 0,
        py: 0,
        seen: false,
        halo: new FxQuad(world, FxKind.Glow, 9),
        core: new FxQuad(world, FxKind.Glow, 10),
        head: new FxQuad(world, FxKind.Star, 11),
        burst: new FxQuad(world, FxKind.Star, 11),
      });
  }

  /** Spawn a bolt from the action-plane point (sx, sy) to (tx, ty, tz). */
  launch(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    tz: number,
    scale: number,
    rgb: Rgb,
    doomFinal: boolean,
    heal: boolean,
  ): void {
    let q = this.b.find((x) => !x.live);
    if (!q) {
      q = this.b[0] as Bolt;
      for (const c of this.b) if (c.t > q.t) q = c;
    }
    q.live = true;
    q.t = 0;
    q.sx = sx;
    q.sy = sy;
    q.sz = tz;
    q.tx = tx;
    q.ty = ty;
    q.tz = tz;
    q.scale = scale * (doomFinal ? 1.5 : 1);
    q.doomFinal = doomFinal;
    q.heal = heal;
    q.rgb[0] = rgb[0];
    q.rgb[1] = rgb[1];
    q.rgb[2] = rgb[2];
    q.hitT = -1;
    q.seen = false;
    this.launched++;
  }

  /** Diagnostics: the live bolts' endpoints and clocks. */
  peek(): {
    t: number;
    hitT: number;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    tz: number;
  }[] {
    return this.b
      .filter((q) => q.live)
      .map((q) => ({ t: q.t, hitT: q.hitT, sx: q.sx, sy: q.sy, tx: q.tx, ty: q.ty, tz: q.tz }));
  }

  clear(): void {
    for (const q of this.b) {
      q.live = false;
      q.halo.intensity(0);
      q.core.intensity(0);
      q.head.intensity(0);
      q.burst.intensity(0);
    }
    this.count = 0;
  }

  /** @hot `dt` is the world dt. */
  update(dt: number, time: number, set: TypingFxSettings): void {
    const k = set.effectsIntensity;
    let live = 0;
    for (const q of this.b) {
      if (!q.live) continue;
      live++;
      if (k <= 0) {
        q.live = false;
        q.halo.intensity(0);
        q.core.intensity(0);
        q.head.intensity(0);
        q.burst.intensity(0);
        continue;
      }
      q.t += dt;
      const c = q.rgb;
      if (q.hitT < 0) {
        const u = Math.min(1, q.t / BOLT_FLIGHT_S);
        // ease-in so the bolt accelerates into the target; the arc apex is +1.2 u
        const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
        const x = q.sx + (q.tx - q.sx) * e;
        const y = q.sy + (q.ty - q.sy) * e + BOLT_APEX * 4 * e * (1 - e);
        const z = q.sz + 0.3;
        const s = q.scale;
        // violet -> white over the flight: the hot core whitens as the bolt arrives
        const w = u * u;
        const cr = c[0] * 1.4 + (3.2 - c[0] * 1.4) * w;
        const cg = c[1] * 1.4 + (3.2 - c[1] * 1.4) * w;
        const cb = c[2] * 1.4 + (3.2 - c[2] * 1.4) * w;
        q.halo
          .color(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9)
          .at(x, y, z - 0.05)
          .size(BOLT_HALO * s)
          .intensity(0.9 * k);
        q.core
          .color(cr, cg, cb)
          .at(x, y, z)
          .size(BOLT_CORE * (0.8 + 0.4 * s) * 1.0)
          .intensity(3.0 * k);
        q.head
          .color(c[0] * 1.2, c[1] * 1.2, c[2] * 1.2)
          .at(x, y, z + 0.05)
          .size(0.85 * s)
          .intensity(1.2 * k);
        q.head.mesh.rotation.z = time * 6;
        // trail: 6 samples per frame spread from where the bolt was to where it is now (pool A, glow kind), each
        // shrinking and fading; early samples are violet, late ones whiten with the core
        if (!q.seen) {
          q.px = x;
          q.py = y;
          q.seen = true;
        }
        const n = Math.max(1, Math.round(BOLT_TRAIL_SAMPLES * k));
        for (let i = 0; i < n; i++) {
          const f = (i + 1) / n;
          resetSpec(SPEC);
          SPEC.x = q.px + (x - q.px) * f;
          SPEC.y = q.py + (y - q.py) * f;
          SPEC.z = z;
          SPEC.vy = ((i % 3) - 1) * 0.25;
          SPEC.size = (0.32 + 0.08 * f) * s;
          SPEC.size1 = 0.04;
          SPEC.life = 0.3;
          SPEC.r = cr * 0.55;
          SPEC.g = cg * 0.55;
          SPEC.b = cb * 0.55;
          SPEC.a = 0.9;
          SPEC.kind = PK_GLOW;
          this.pool.emit(SPEC);
        }
        q.px = x;
        q.py = y;
        if (u >= 1) this.impact(q, set);
      } else {
        q.hitT += dt;
        const u = q.hitT / 0.22;
        if (u >= 1) {
          q.live = false;
          q.halo.intensity(0);
          q.core.intensity(0);
          q.head.intensity(0);
          q.burst.intensity(0);
          live--;
          continue;
        }
        const s = 1.6 * q.scale * (0.4 + 0.6 * easeOutQuad(Math.min(1, u * 2.5)));
        q.core
          .color(c[0], c[1], c[2])
          .at(q.tx, q.ty, q.tz + 0.35)
          .size(s * 1.1)
          .intensity(1.1 * (1 - u) * k);
        q.head.intensity(0);
        q.halo.intensity(0);
        q.burst
          .color(c[0] * 1.3, c[1] * 1.3, c[2] * 1.3)
          .at(q.tx, q.ty, q.tz + 0.4)
          .size(s)
          .intensity(2.0 * (1 - u) * k);
        q.burst.mesh.rotation.z = u * 0.8;
      }
    }
    this.count = live;
  }

  private impact(q: Bolt, set: TypingFxSettings): void {
    const k = set.effectsIntensity;
    q.hitT = 0;
    const c = q.rgb;
    const n = Math.max(2, Math.round(10 * k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      resetSpec(SPEC);
      SPEC.x = q.tx;
      SPEC.y = q.ty;
      SPEC.z = q.tz + 0.3;
      const sp = 2 + (i % 3) * 0.9;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp + 0.6;
      SPEC.grav = 3;
      SPEC.drag = 1.6;
      SPEC.size = 0.12 * q.scale;
      SPEC.size1 = 0.03;
      SPEC.life = 0.4;
      SPEC.r = c[0] * 1.2;
      SPEC.g = c[1] * 1.2;
      SPEC.b = c[2] * 1.2;
      SPEC.kind = PK_GLOW;
      this.pool.emit(SPEC);
    }
    this.lights.flash(
      q.tx,
      q.ty,
      q.tz - 0.5,
      c[0] * 0.55,
      c[1] * 0.55,
      c[2] * 0.55,
      1.7,
      Math.min(LIGHT_MAX_RADIUS, 3.2),
      0.25,
    );
    if (!q.heal && !set.reducedMotion) this.world.camera.shake(0.08, 0.25 * k);
    this.onImpact(q.doomFinal, q.heal);
  }

  dispose(): void {
    for (const q of this.b) {
      q.halo.dispose();
      q.core.dispose();
      q.head.dispose();
      q.burst.dispose();
    }
  }
}

/**
 * GuardBarrier (spec §8.1 world preview, §8.2 snap, §8.3 payoffs, §6 guard typo): the hex shield in front
 * of the hero.
 *
 *  - `preview(f)`: from the first guard key a faint barrier whose intensity builds with the typed share.
 *  - `snap(result, scale)`: 100 ms of waiting while the HUD glyphs converge, then the barrier scales 0.6 -> 1.0
 *    (easeOutBack) in 140 ms with a `uP` spike; block = azure and steady, parry = gold-white with a 4-point
 *    star on top (the shape cue) and a faster spin. A held light stays on until impact.
 *  - `block()`: the barrier takes the hit (rim flash 120 ms), 12 hex shards, shake, azure flash, push-back.
 *  - `parry()`: 70 ms hit-stop, gold flash, the barrier bursts outward as a ring (0 -> 3 u in 300 ms),
 *    camera punch, gold flash light, 20 gold sparks.
 *  - `fade(ms)`: ignored word, the preview fades.
 *  - `shimmer()`: guard typo, the preview flickers red for 150 ms.
 *
 * Everything is a fixed set of quads and pooled particles created once; nothing allocates per call.
 */
import { easeOutBack, easeOutQuad } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { LIGHT_MAX_RADIUS, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { LightSlots } from "./LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_GLOW,
  PK_STREAK,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TimeDilation } from "./TimeDilation";
import type { TypingFxCallbacks, TypingFxSettings } from "./types";

const SPEC: ParticleSpec = newSpec();
const AZURE: Rgb = [0.45, 0.75, 1.0];
const GOLD: Rgb = [1.0, 0.9, 0.55];
const RED: Rgb = [1.6, 0.3, 0.2];
/** Barrier centre relative to the hero (world units). */
const OFF_X = 1.65;
const OFF_Y = 1.2;
const OFF_Z = 0.35;
const SIZE = 2.2;

const M_NONE = 0;
const M_PREVIEW = 1;
const M_HELD = 2;
const M_BLOCK = 3;
const M_PARRY = 4;
const M_FADE = 5;

export class GuardBarrier {
  private readonly quad: FxQuad;
  private readonly star: FxQuad;
  private readonly burst: FxQuad;
  private mode = M_NONE;
  private result: "block" | "parry" = "block";
  private level = 0;
  private shown = 0;
  /** Snap clock (s), -1 when idle. Phase A (wait) is 0.1 s, phase B (scale) 0.14 s, both x `snapScale`. */
  private snapT = -1;
  private snapScale = 1;
  private t = 0;
  private spin = 0;
  private rimT = -1;
  private shimmerT = -1;
  private burstT = -1;
  private fadeT = 0;
  private fadeDur = 0.25;
  private hx = 0;
  private hz = 0;

  constructor(
    private readonly world: RenderWorld,
    private readonly pool: PooledParticles,
    private readonly lights: LightSlots,
    private readonly td: TimeDilation,
    private readonly cb: TypingFxCallbacks,
  ) {
    this.quad = new FxQuad(world, FxKind.Guard, 9);
    this.star = new FxQuad(world, FxKind.Star, 10);
    this.burst = new FxQuad(world, FxKind.Ring, 10);
  }

  get active(): boolean {
    return this.mode !== M_NONE;
  }
  get currentMode(): number {
    return this.mode;
  }
  /** 0..1 the barrier's displayed intensity (tests, bench). */
  get intensity(): number {
    return this.shown;
  }

  /** The hero's position (every frame, from the world fx). */
  setHero(x: number, z: number): void {
    this.hx = x;
    this.hz = z;
  }

  /** From the first guard key: the faint preview, building as `0.15 + 0.5 * typed / len`. */
  preview(f: number): void {
    if (this.mode === M_HELD || this.mode === M_BLOCK || this.mode === M_PARRY) return;
    this.mode = M_PREVIEW;
    this.level = 0.15 + 0.5 * Math.min(1, Math.max(0, f));
  }

  /** `GuardWordTyped`: the snap. `scale` < 1 compresses it for a late snap. */
  snap(result: "block" | "parry", scale = 1): void {
    this.mode = M_HELD;
    this.result = result;
    this.snapT = 0;
    this.snapScale = Math.min(1, Math.max(0.2, scale));
    this.level = 1;
  }

  /** `GuardBlocked`: impact on the barrier. */
  block(set: TypingFxSettings): void {
    if (this.mode === M_NONE) this.snap("block", 0.2);
    const k = set.effectsIntensity;
    this.mode = M_BLOCK;
    this.result = "block";
    this.rimT = 0;
    this.fadeT = 0;
    this.fadeDur = 0.25;
    if (k <= 0) return;
    const n = Math.max(2, Math.round(12 * k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      resetSpec(SPEC);
      SPEC.x = this.hx + OFF_X;
      SPEC.y = OFF_Y;
      SPEC.z = this.hz + OFF_Z;
      const sp = 1.5 + (i % 4) * 0.5;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp;
      SPEC.size = 0.16;
      SPEC.size1 = 0.04;
      SPEC.life = 0.4;
      SPEC.drag = 2;
      SPEC.r = 0.6;
      SPEC.g = 1.1;
      SPEC.b = 2.0;
      SPEC.kind = PK_GLOW;
      this.pool.emit(SPEC);
    }
    this.lights.flash(
      this.hx + OFF_X,
      OFF_Y,
      this.hz - 0.4,
      0.45,
      0.8,
      1.2,
      1.3,
      Math.min(LIGHT_MAX_RADIUS, 3),
      0.3,
    );
    this.world.camera.shake(0.12 * Math.max(0.5, k), 0.4 * k);
    this.cb.heroPush(0.15, 80, 200);
  }

  /** `GuardParried`: the barrier flashes gold and bursts outward. */
  parry(set: TypingFxSettings): void {
    if (this.mode === M_NONE) this.snap("parry", 0.2);
    const k = set.effectsIntensity;
    this.mode = M_PARRY;
    this.result = "parry";
    this.rimT = 0;
    this.burstT = 0;
    this.fadeT = 0;
    this.fadeDur = 0.3;
    if (k <= 0) return;
    this.td.hitStop(70 * Math.max(0.5, k));
    const n = Math.max(3, Math.round(20 * k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      resetSpec(SPEC);
      SPEC.x = this.hx + OFF_X;
      SPEC.y = OFF_Y;
      SPEC.z = this.hz + OFF_Z;
      const sp = 3 + (i % 5) * 0.8;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp;
      SPEC.drag = 1.8;
      SPEC.grav = 2;
      SPEC.size = 0.14;
      SPEC.size1 = 0.03;
      SPEC.st = 0.1;
      SPEC.life = 0.5;
      SPEC.r = 2.4;
      SPEC.g = 1.8;
      SPEC.b = 0.6;
      SPEC.kind = PK_STREAK;
      this.pool.emit(SPEC);
    }
    this.lights.flash(
      this.hx + OFF_X,
      OFF_Y,
      this.hz - 0.4,
      1.0,
      0.7,
      0.22,
      1.7,
      Math.min(LIGHT_MAX_RADIUS, 3.6),
      0.35,
    );
    if (!set.reducedMotion)
      this.world.camera.punch(0.45 * k, set.reducedFlash ? 0 : 0.0015 * k, 0.012 * k);
  }

  /** The word was ignored: the preview / barrier fades. */
  fade(ms = 200): void {
    if (this.mode === M_NONE) return;
    this.mode = M_FADE;
    this.fadeT = 0;
    this.fadeDur = ms / 1000;
  }

  /** Guard typo: the barrier shimmers red for 150 ms. */
  shimmer(): void {
    if (this.mode === M_NONE) return;
    this.shimmerT = 0;
  }

  clear(): void {
    this.mode = M_NONE;
    this.level = 0;
    this.shown = 0;
    this.snapT = -1;
    this.rimT = -1;
    this.burstT = -1;
    this.shimmerT = -1;
    this.hide();
  }

  private hide(): void {
    this.quad.intensity(0);
    this.star.intensity(0);
    this.burst.intensity(0);
  }

  /** @hot */
  update(dt: number, time: number, set: TypingFxSettings): void {
    const k = set.effectsIntensity;
    if (this.mode === M_NONE || k <= 0) {
      this.hide();
      if (k <= 0) this.mode = M_NONE;
      return;
    }
    this.t += dt;
    const rm = set.reducedMotion;
    let size = SIZE;
    let I = 0;
    let uP = 0;
    const col = this.result === "parry" ? GOLD : AZURE;
    let r = AZURE[0];
    let g = AZURE[1];
    let b = AZURE[2];
    let spinRate = 0.2;

    if (this.mode === M_PREVIEW) {
      this.shown += (this.level - this.shown) * Math.min(1, dt * 10);
      I = this.shown * 0.95;
      size = SIZE * (0.85 + 0.15 * this.shown);
    } else if (this.mode === M_FADE) {
      this.fadeT += dt;
      const u = Math.min(1, this.fadeT / this.fadeDur);
      I = this.shown * (1 - u) * 0.95;
      if (u >= 1) {
        this.mode = M_NONE;
        this.shown = 0;
        this.hide();
        return;
      }
    } else {
      // held / block / parry: the barrier proper
      r = col[0];
      g = col[1];
      b = col[2];
      spinRate = this.result === "parry" ? 1.2 : 0.2;
      let sc = 1;
      if (this.snapT >= 0) {
        this.snapT += dt;
        const wait = 0.1 * this.snapScale;
        const grow = 0.14 * this.snapScale;
        if (this.snapT < wait) {
          // the glyphs are converging: keep the preview look
          I = this.shown * 0.95;
          sc = 0.85;
        } else {
          const u = Math.min(1, (this.snapT - wait) / grow);
          sc = 0.6 + 0.4 * easeOutBack(u);
          this.shown = 1;
          I = 0.95 * easeOutQuad(Math.min(1, u * 2));
          uP = u < 1 ? 0.55 - 0.35 * u : 0.2;
          if (u >= 1) {
            this.snapT = -2;
            // held light until impact
            this.lights.flash(
              this.hx + OFF_X,
              OFF_Y,
              this.hz - 0.4,
              col[0] * 0.5,
              col[1] * 0.5,
              col[2] * 0.5,
              0.8,
              Math.min(LIGHT_MAX_RADIUS, 3),
              1.2,
            );
          }
        }
      } else {
        I = 0.8;
        uP = 0.2;
      }
      size = SIZE * sc;
      if (this.mode === M_BLOCK || this.mode === M_PARRY) {
        if (this.rimT >= 0) {
          this.rimT += dt;
          const u = this.rimT / 0.12;
          if (u < 1) {
            uP = this.mode === M_PARRY ? 0.3 : 0.55;
            I = this.mode === M_PARRY ? 0.8 : 1.0;
          }
        }
        this.fadeT += dt;
        const f = Math.min(1, Math.max(0, (this.fadeT - 0.12) / this.fadeDur));
        I *= 1 - f;
        if (f >= 1) {
          this.mode = M_NONE;
          this.shown = 0;
          this.rimT = -1;
          this.snapT = -1;
        }
      }
    }
    if (this.shimmerT >= 0) {
      this.shimmerT += dt;
      const u = this.shimmerT / 0.15;
      if (u >= 1) this.shimmerT = -1;
      else {
        const m = 1 - u;
        r = r + (RED[0] - r) * m;
        g = g + (RED[1] - g) * m;
        b = b + (RED[2] - b) * m;
      }
    }
    I *= 0.55;
    this.spin += dt * (rm ? 0 : spinRate);
    const hx = this.hx + OFF_X;
    this.quad
      .color(r, g, b)
      .at(hx, OFF_Y, this.hz + OFF_Z)
      .size(size, size)
      .progress(uP)
      .intensity(I * k);
    this.quad.mesh.rotation.z = this.spin;

    // parry: a 4-point star at the top of the barrier, pulsing at 2 Hz
    if (
      this.result === "parry" &&
      (this.mode === M_HELD || this.mode === M_PARRY) &&
      this.shown > 0.5
    ) {
      const pulse = rm ? 1 : 0.75 + 0.25 * Math.sin(time * Math.PI * 4);
      this.star
        .color(GOLD[0] * 1.8, GOLD[1] * 1.8, GOLD[2] * 1.8)
        .at(hx, OFF_Y + size * 0.5, this.hz + OFF_Z + 0.05)
        .size(0.9 * pulse)
        .intensity(1.4 * k * (this.mode === M_PARRY ? 0.6 : 1));
    } else this.star.intensity(0);

    // parry burst ring: 0 -> 3 u over 300 ms
    if (this.burstT >= 0) {
      this.burstT += dt;
      const u = this.burstT / 0.3;
      if (u >= 1) {
        this.burstT = -1;
        this.burst.intensity(0);
      } else {
        const s = 3 * 2 * easeOutQuad(u);
        this.burst
          .color(1.5, 1.1, 0.35)
          .color2(1.1, 0.75, 0.2)
          .at(hx, OFF_Y, this.hz + OFF_Z + 0.1)
          .size(s, s)
          .progress(0.2 + 0.75 * u)
          .intensity(1.0 * (1 - u) * k);
      }
    } else this.burst.intensity(0);
  }

  dispose(): void {
    this.quad.dispose();
    this.star.dispose();
    this.burst.dispose();
  }
}

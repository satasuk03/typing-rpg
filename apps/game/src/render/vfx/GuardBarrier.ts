/**
 * GuardBarrier (spec §8.1 world preview, §8.2 snap, §8.3 payoffs, §6 guard typo): the hex shield in front
 * of the hero.
 *
 *  - `preview(f)`: from the first guard key a faint barrier whose intensity builds with the typed share.
 *  - `snap(result, scale)`: 100 ms of waiting while the HUD glyphs converge, then the barrier scales 0.6 -> 1.0
 *    (easeOutBack) in 140 ms with a `uP` spike; block = azure and steady, parry = gold-white with a 4-point
 *    star on top (the shape cue) and a faster spin. A held light stays on until impact.
 *  - `block()`: the barrier takes the hit (rim flash 120 ms), 12 hex shards, shake, azure flash, push-back.
 *  - `parry()`: 70 ms hit-stop; a 140 ms flash disc (core #7fe8ff, rim #3ab8ff, radius 0.9 u) at the contact point
 *    where the blade meets the barrier (NOT on the hero's body), 8 hex shards, a thin cyan ring, camera punch.
 *    (T6.3 #14: the old gold-white 3 u disc blew out and read near-white.)
 *  - `fade(ms)`: ignored word, the preview fades.
 *  - `shimmer()`: guard typo, the preview flickers red for 150 ms.
 *
 * Everything is a fixed set of quads and pooled particles created once; nothing allocates per call.
 */
import { easeOutBack, easeOutQuad } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { hexLinear, LIGHT_MAX_RADIUS, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { LightSlots } from "./LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_GLOW,
  PK_HEXR,
  PK_STREAK,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TimeDilation } from "./TimeDilation";
import type { TypingFxCallbacks, TypingFxSettings } from "./types";

const SPEC: ParticleSpec = newSpec();
const AZURE: Rgb = [0.45, 0.75, 1.0];
const GOLD: Rgb = [1.0, 0.9, 0.55];
/** The held / bursting parry barrier: amber, not gold-white (the rim saturated to white under the bloom). */
const PARRY_BARRIER: Rgb = [0.8, 0.58, 0.2];
const RED: Rgb = [1.6, 0.3, 0.2];
/** Parry flash (T6.3 #14): core #7fe8ff, rim #3ab8ff, 140 ms, radius 0.9 u, 8 hex shards. */
export const PARRY_FLASH = {
  coreHex: "#7fe8ff",
  rimHex: "#3ab8ff",
  ms: 140,
  radius: 0.9,
  shards: 8,
  /** HDR gain over the linear hex colours (a touch above 1 so the bloom catches the rim). */
  coreGain: 1.0,
  rimGain: 1.2,
} as const;
const PARRY_CORE: Rgb = hexLinear(PARRY_FLASH.coreHex).map((v) => v * PARRY_FLASH.coreGain) as Rgb;
const PARRY_RIM: Rgb = hexLinear(PARRY_FLASH.rimHex).map((v) => v * PARRY_FLASH.rimGain) as Rgb;
// solid (normal-blend) shards: core #7fe8ff with the shader's dark blue rim, sitting on the focus plane
const PARRY_SHARD: Rgb = hexLinear(PARRY_FLASH.coreHex);
const PARRY_DISC_SEC = PARRY_FLASH.ms / 1000;
const PARRY_RADIUS = PARRY_FLASH.radius;
const PARRY_SHARDS = PARRY_FLASH.shards;
/** The contact point sits at the blade tip: this far in front of the barrier centre toward the hero. */
const CONTACT_DX = -0.6;
/** Barrier centre relative to the hero (world units). */
const OFF_X = 1.65;
const OFF_Y = 1.2;
const OFF_Z = 0.35;
const SIZE = 2.2;

/** A held barrier with no impact event fades itself after this long (an attack that never arrives, a missed binding). */
export const HELD_MAX_SEC = 2.5;
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
  private readonly disc: FxQuad;
  private discT = -1;
  private mode = M_NONE;
  private result: "block" | "parry" = "block";
  private level = 0;
  private shown = 0;
  /** Snap clock (s), -1 when idle. Phase A (wait) is 0.1 s, phase B (scale) 0.14 s, both x `snapScale`. */
  private snapT = -1;
  private snapScale = 1;
  /** Seconds spent in M_HELD with no impact: a fail-safe fades the barrier after `HELD_MAX_SEC`. */
  private heldT = 0;
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
    private readonly poolB: PooledParticles,
    private readonly lights: LightSlots,
    private readonly td: TimeDilation,
    private readonly cb: TypingFxCallbacks,
  ) {
    this.quad = new FxQuad(world, FxKind.Guard, 9);
    this.star = new FxQuad(world, FxKind.Star, 10);
    this.burst = new FxQuad(world, FxKind.Ring, 10);
    this.disc = new FxQuad(world, FxKind.Disc, 11);
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
    this.heldT = 0;
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
    this.discT = 0;
    const cx = this.hx + OFF_X + CONTACT_DX;
    // 8 hex shards fly off the contact point (a fixed fan, flipping as they go)
    for (let i = 0; i < PARRY_SHARDS; i++) {
      const a = (i / PARRY_SHARDS) * Math.PI * 2 + 0.4;
      resetSpec(SPEC);
      SPEC.x = cx;
      SPEC.y = OFF_Y;
      SPEC.z = this.hz + OFF_Z + 0.15;
      const sp = 3.4 + (i % 3) * 0.9;
      SPEC.vx = Math.cos(a) * sp + 1.2;
      SPEC.vy = Math.sin(a) * sp * 0.8;
      SPEC.drag = 2.2;
      SPEC.grav = 3;
      SPEC.size = 0.34;
      SPEC.size1 = 0.2;
      SPEC.life = 0.7;
      SPEC.spin = 9 + i;
      SPEC.r = PARRY_SHARD[0];
      SPEC.g = PARRY_SHARD[1];
      SPEC.b = PARRY_SHARD[2];
      SPEC.kind = PK_HEXR;
      SPEC.a = 1;
      this.poolB.emit(SPEC);
    }
    // a few thin streaks for energy
    const n = Math.max(3, Math.round(8 * k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.9;
      resetSpec(SPEC);
      SPEC.x = cx;
      SPEC.y = OFF_Y;
      SPEC.z = this.hz + OFF_Z + 0.15;
      const sp = 4 + (i % 4) * 0.8;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp;
      SPEC.drag = 1.8;
      SPEC.size = 0.1;
      SPEC.size1 = 0.03;
      SPEC.st = 0.1;
      SPEC.life = 0.35;
      SPEC.r = 0.5;
      SPEC.g = 1.6;
      SPEC.b = 2.2;
      SPEC.kind = PK_STREAK;
      this.pool.emit(SPEC);
    }
    this.lights.flash(
      cx,
      OFF_Y,
      this.hz - 0.4,
      0.35,
      0.8,
      1.0,
      1.1,
      Math.min(LIGHT_MAX_RADIUS, 3),
      0.25,
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
    this.discT = -1;
    this.hide();
  }

  private hide(): void {
    this.quad.intensity(0);
    this.star.intensity(0);
    this.burst.intensity(0);
    this.disc.intensity(0);
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
    if (this.mode === M_HELD) {
      this.heldT += dt;
      if (this.heldT > HELD_MAX_SEC) this.fade(300);
    }
    const rm = set.reducedMotion;
    let size = SIZE;
    let I = 0;
    let uP = 0;
    const col = this.result === "parry" ? PARRY_BARRIER : AZURE;
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

    // parry burst ring: a thin cyan ring, 0 -> 2.2 u over 300 ms
    if (this.burstT >= 0) {
      this.burstT += dt;
      const u = this.burstT / 0.3;
      if (u >= 1) {
        this.burstT = -1;
        this.burst.intensity(0);
      } else {
        const s = 2.2 * 2 * easeOutQuad(u);
        this.burst
          .color(0.3, 1.0, 1.6)
          .color2(0.1, 0.5, 1.2)
          .at(hx, OFF_Y, this.hz + OFF_Z + 0.1)
          .size(s, s)
          .progress(0.2 + 0.75 * u)
          .intensity(0.8 * (1 - u) * k);
      }
    } else this.burst.intensity(0);

    // parry flash disc: 140 ms, radius 0.9 u, at the contact point (blade tip), never on the hero's body
    if (this.discT >= 0) {
      this.discT += dt;
      const u = this.discT / PARRY_DISC_SEC;
      if (u >= 1) {
        this.discT = -1;
        this.disc.intensity(0);
      } else {
        const sc = 2 * PARRY_RADIUS * (0.55 + 0.45 * easeOutQuad(u));
        this.disc
          .color(PARRY_CORE[0], PARRY_CORE[1], PARRY_CORE[2])
          .color2(PARRY_RIM[0], PARRY_RIM[1], PARRY_RIM[2])
          .at(hx + CONTACT_DX, OFF_Y, this.hz + OFF_Z + 0.2)
          .size(sc, sc)
          .progress(u)
          .intensity((1 - u * u) * k * (set.reducedFlash ? 0.5 : 1));
      }
    } else this.disc.intensity(0);
  }

  dispose(): void {
    this.quad.dispose();
    this.star.dispose();
    this.burst.dispose();
    this.disc.dispose();
  }
}

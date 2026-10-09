/**
 * FinisherCinematic (spec §9.2): what `FinisherCompleted` does in the world. It runs on REAL time (the
 * presentation queue and the audio share that clock), so its own hit-stops never move the timeline.
 *
 *   0       freeze (hit-stop 140), post flash 0.35, CA, letterbox bars -> 0.12
 *   140     camera push on the boss (`cameraPose`), the hero dashes in (`dash`)
 *   300..780 five slash arcs (-35, +30, -10, +55, -60 deg; size 1.0 -> 1.6; element colour -> gold), each with a
 *           40 ms micro hit-stop, shake, light flash, 8 sparks and an audio `slash`
 *   900     the final X: two arcs at +-45 deg, size 2.0, gold-white; hit-stop 160, punch, shake 0.4 s, post
 *           flash 0.35, audio `crit`
 *   1060    (the queue presents EnemyDeath here: the T2.3 dissolve)
 *   1600    the camera returns, the bars go back (done by 2400)
 *
 * reducedMotion: the push is a hard cut at 140 ms and a hard cut back at 1600 ms; no shake, no punch;
 * hit-stops stay (a freeze is not motion). k = 0: nothing here (the handle compresses the death to 300 ms).
 * The arcs are drawn here (a stretched Beam quad each) so the finisher reads even when the T2.3 library has
 * not registered `slashArc`; the callback is still called for it.
 *
 * T6.3 #16: chromatic aberration <= 0.006 and zoom <= 0.04 (the resolve frame used to smear), the flashes are warm
 * [1, 0.92, 0.75] and fall below 0.1 within 120 ms, and every slash line is clipped to the viewport (it used to run
 * off both screen edges at the camera push's narrow FOV).
 */
import { Vector3 } from "three";
import { clamp01, easeOutQuad } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { LIGHT_MAX_RADIUS, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { LightSlots } from "./LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_STREAK,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TimeDilation } from "./TimeDilation";
import type { TypingFxCallbacks, TypingFxSettings } from "./types";

export const FIN_T = {
  freezeMs: 140,
  pushMs: 140,
  slashMs: [300, 420, 540, 660, 780] as readonly number[],
  slashDeg: [-35, 30, -10, 55, -60] as readonly number[],
  crossMs: 900,
  deathMs: 1060,
  returnMs: 1600,
  endMs: 2400,
  slashLifeMs: 170,
} as const;

const SPEC: ParticleSpec = newSpec();
const GOLD: Rgb = [2.4, 1.8, 0.6];
const GOLD_WHITE: Rgb = [2.6, 2.3, 1.5];
const BARS = 0.12;
/** Finisher post flash: warm, and gone (< 0.1) well inside 120 ms. */
export const FLASH_RGB: Rgb = [1, 0.92, 0.75];
export const FLASH_PEAK = 0.3;
export const FLASH_MS = 90;
/** Camera punch ceilings (T6.3 #16). */
export const CA_MAX = 0.006;
export const ZOOM_MAX = 0.04;
/** Slash lines stay inside this NDC box. */
const VIEW_LIMIT = 0.9;
const NDC = new Vector3();
/** Camera push pose relative to the boss (spec 9.2). */
export const PUSH = { dx: -1.5, dist: 13, fov: 24, pitch: 9, followRate: 6 } as const;

export interface FinisherHost {
  postFlash(amount: number, rgb: Rgb, ms: number, cap: number): void;
  /** Boss body centre; false when unknown. */
  enemy(id: number, out: { x: number; y: number; z: number }): boolean;
  /** Hero position. */
  hero(out: { x: number; z: number }): void;
  /** Element colour of the hero's weapon (linear HDR). */
  element(): Rgb;
}

interface Slash {
  quad: FxQuad;
  flash: FxQuad;
  t: number;
  angle: number;
  size: number;
  rgb: Rgb;
}

const EN = { x: 0, y: 0, z: 0 };
const HE = { x: 0, z: 0 };

export class FinisherCinematic {
  private t = -1;
  private bossId = -1;
  private bx = 0;
  private by = 1.5;
  private bz = 0;
  private fired = 0;
  private stage = 0;
  private readonly slashes: Slash[] = [];
  private bars = -1;
  /** Seconds since `play` (real time); -1 when idle. */
  get clock(): number {
    return this.t;
  }
  get active(): boolean {
    return this.t >= 0;
  }

  constructor(
    private readonly world: RenderWorld,
    private readonly pool: PooledParticles,
    private readonly lights: LightSlots,
    private readonly td: TimeDilation,
    private readonly cb: TypingFxCallbacks,
    private readonly host: FinisherHost,
  ) {
    for (let i = 0; i < 3; i++)
      this.slashes.push({
        quad: new FxQuad(world, FxKind.Beam, 11, i * 3 + 1),
        flash: new FxQuad(world, FxKind.Star, 12),
        t: -1,
        angle: 0,
        size: 1,
        rgb: [1, 1, 1],
      });
  }

  /** Start the cinematic against boss `id` (the freeze is this frame). */
  play(id: number, set: TypingFxSettings): void {
    if (set.effectsIntensity <= 0) return;
    this.t = 0;
    this.bossId = id;
    this.fired = 0;
    this.stage = 0;
    if (!this.host.enemy(id, EN)) {
      EN.x = 6;
      EN.y = 1.5;
      EN.z = 0;
    }
    this.bx = EN.x;
    this.by = EN.y;
    this.bz = EN.z;
    const k = set.effectsIntensity;
    this.td.hitStop(FIN_T.freezeMs * Math.max(0.5, k));
    this.host.postFlash(FLASH_PEAK, FLASH_RGB, FLASH_MS, FLASH_PEAK);
    if (!set.reducedMotion)
      this.world.camera.punch(0, set.reducedFlash ? 0 : Math.min(CA_MAX, 0.004 * k), 0);
    this.bars = 0;
  }

  clear(): void {
    this.t = -1;
    for (const s of this.slashes) {
      s.t = -1;
      s.quad.intensity(0);
      s.flash.intensity(0);
    }
    if (this.bars >= 0) {
      this.world.postFx.effects.bars = -1;
      this.bars = -1;
      this.cb.cameraPose(null, 2.6, true);
    }
  }

  /** kind 0 = flurry slash, 1 = the X's main arc (hit-stop, punch, shake, `crit`), 2 = its second arc (visual only). */
  private fireSlash(
    angleDeg: number,
    size: number,
    rgb: Rgb,
    set: TypingFxSettings,
    kind: 0 | 1 | 2,
  ): void {
    const k = set.effectsIntensity;
    const big = kind === 1;
    let s = this.slashes[0] as Slash;
    for (const c of this.slashes) if (c.t < 0) s = c;
    for (const c of this.slashes) if (c.t > s.t && s.t >= 0) s = c;
    s.t = 0;
    s.angle = (angleDeg * Math.PI) / 180;
    s.size = size;
    s.rgb[0] = rgb[0];
    s.rgb[1] = rgb[1];
    s.rgb[2] = rgb[2];
    this.cb.slashArc(s.angle, size, rgb, this.bossId);
    if (kind === 2) return;
    this.cb.sfx(big ? "crit" : "slash");
    this.td.hitStop((big ? 160 : 40) * Math.max(0.5, k));
    if (!set.reducedMotion) {
      this.world.camera.shake(big ? 0.4 : 0.1, (big ? 1.0 : 0.3) * k);
      if (big)
        this.world.camera.punch(
          0.6 * k,
          set.reducedFlash ? 0 : Math.min(CA_MAX, 0.003 * k),
          Math.min(ZOOM_MAX, 0.03 * k),
        );
    }
    this.lights.flash(
      this.bx,
      this.by,
      this.bz - 0.6,
      rgb[0] * 0.45,
      rgb[1] * 0.45,
      rgb[2] * 0.45,
      big ? 2.4 : 1.7,
      Math.min(LIGHT_MAX_RADIUS, big ? 3.4 : 3),
      big ? 0.4 : 0.22,
    );
    const n = Math.max(2, Math.round((big ? 14 : 8) * k));
    for (let i = 0; i < n; i++) {
      const a = s.angle + (i / n - 0.5) * 2.2 + (i % 2) * Math.PI;
      resetSpec(SPEC);
      SPEC.x = this.bx;
      SPEC.y = this.by;
      SPEC.z = this.bz + 0.3;
      const sp = 3 + (i % 4) * 1.2;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp;
      SPEC.drag = 1.8;
      SPEC.grav = 3;
      SPEC.size = 0.14;
      SPEC.size1 = 0.03;
      SPEC.st = 0.1;
      SPEC.life = 0.45;
      SPEC.r = rgb[0];
      SPEC.g = rgb[1];
      SPEC.b = rgb[2];
      SPEC.kind = PK_STREAK;
      this.pool.emit(SPEC);
    }
  }

  /**
   * Length of a slash line (centred on the boss, along `angle`) shrunk so both ends stay inside the viewport box.
   * @hot
   */
  private clipLen(len: number, angle: number): number {
    const cam = this.world.camera;
    cam.project(this.bx, this.by, this.bz + 0.45, NDC);
    const cx = NDC.x;
    const cy = NDC.y;
    // direction of the quad's long axis in the action plane (the quad is rotated about z)
    const dx = -Math.sin(angle) * len * 0.5;
    const dy = Math.cos(angle) * len * 0.5;
    cam.project(this.bx + dx, this.by + dy, this.bz + 0.45, NDC);
    const ex = Math.abs(NDC.x - cx);
    const ey = Math.abs(NDC.y - cy);
    let f = 1;
    if (ex > 1e-4) f = Math.min(f, Math.max(0, VIEW_LIMIT - Math.abs(cx)) / ex);
    if (ey > 1e-4) f = Math.min(f, Math.max(0, VIEW_LIMIT - Math.abs(cy)) / ey);
    return len * Math.max(0.15, Math.min(1, f));
  }

  /** @hot `realDt` seconds of real time. */
  update(realDt: number, set: TypingFxSettings): void {
    const k = set.effectsIntensity;
    // slash visuals run even while the world is frozen: they are the impact frames themselves
    for (const s of this.slashes) {
      if (s.t < 0) continue;
      s.t += realDt;
      const u = s.t / (FIN_T.slashLifeMs / 1000);
      if (u >= 1 || k <= 0) {
        s.t = -1;
        s.quad.intensity(0);
        s.flash.intensity(0);
        continue;
      }
      const grow = easeOutQuad(Math.min(1, u * 3));
      const len = this.clipLen(2.8 * s.size * grow, s.angle);
      const w = 0.2 * s.size * (1 - 0.6 * u);
      const f = 1 - u * u;
      const c = s.rgb;
      s.quad
        .color(c[0], c[1], c[2])
        .color2(
          Math.min(2.6, c[0] * 0.5 + 1.5),
          Math.min(2.6, c[1] * 0.5 + 1.5),
          Math.min(2.6, c[2] * 0.5 + 1.5),
        )
        .at(this.bx, this.by, this.bz + 0.45)
        .size(w, len)
        .intensity((s.size >= 2 ? 1.1 : 1.5) * f * k);
      s.quad.mesh.rotation.z = s.angle;
      s.flash
        .color(c[0], c[1], c[2])
        .at(this.bx, this.by, this.bz + 0.5)
        .size(1.2 * s.size * (0.5 + 0.5 * grow))
        .intensity((s.size >= 2 ? 0.9 : 1.4) * (1 - u) * k);
      s.flash.mesh.rotation.z = s.angle + u * 0.6;
    }
    if (this.t < 0) return;
    this.t += realDt;
    const ms = this.t * 1000;
    const rm = set.reducedMotion;

    // letterbox bars: 0 -> 0.12 over 200 ms, back to the biome default over 400 ms after the return
    if (this.bars >= 0) {
      const inU = clamp01(ms / 200);
      const outU = clamp01((ms - FIN_T.returnMs) / 400);
      const v = BARS * inU * (1 - outU);
      this.world.postFx.effects.bars = outU >= 1 ? -1 : v;
    }
    // stage 0: camera push at 140 ms
    if (this.stage === 0 && ms >= FIN_T.pushMs) {
      this.stage = 1;
      if (this.host.enemy(this.bossId, EN)) {
        this.bx = EN.x;
        this.by = EN.y;
        this.bz = EN.z;
      }
      this.cb.cameraPose(
        { x: this.bx + PUSH.dx, dist: PUSH.dist, fov: PUSH.fov, pitch: PUSH.pitch },
        PUSH.followRate,
        rm,
      );
      this.host.hero(HE);
      this.cb.dash(0, 560, this.bossId, "finisher");
    }
    // flurry
    while (this.fired < 5 && ms >= (FIN_T.slashMs[this.fired] as number)) {
      const i = this.fired++;
      const u = i / 4;
      const el = this.host.element();
      const rgb: Rgb = [
        el[0] + (GOLD[0] - el[0]) * u,
        el[1] + (GOLD[1] - el[1]) * u,
        el[2] + (GOLD[2] - el[2]) * u,
      ];
      this.fireSlash(FIN_T.slashDeg[i] as number, 1.0 + 0.6 * u, rgb, set, 0);
    }
    // the X
    if (this.stage === 1 && ms >= FIN_T.crossMs) {
      this.stage = 2;
      this.fireSlash(45, 2.0, GOLD_WHITE, set, 1);
      this.fireSlash(-45, 2.0, GOLD_WHITE, set, 2);
      this.host.postFlash(FLASH_PEAK, FLASH_RGB, FLASH_MS, FLASH_PEAK);
    }
    // return
    if (this.stage === 2 && ms >= FIN_T.returnMs) {
      this.stage = 3;
      this.cb.cameraPose(null, 2.6, rm);
    }
    if (ms >= FIN_T.endMs) {
      this.t = -1;
      this.bars = -1;
      this.world.postFx.effects.bars = -1;
    }
    void k;
  }

  dispose(): void {
    for (const s of this.slashes) {
      s.quad.dispose();
      s.flash.dispose();
    }
  }
}

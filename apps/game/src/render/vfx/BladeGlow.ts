/**
 * BladeGlow (spec §3.2, §5.1): the weapon as the focus of the word-complete payoff.
 *  - edge glow: constant from streak tier 3 (a glow quad at the weapon tip)
 *  - `charge(f)`: each shatter fragment that arrives adds f; the glow ramps to 0.8
 *  - `flare(perfect, rgb)`: a star flash at the tip plus a spray of world sparks
 *  - `strike(to, ...)`: a beam from the blade to the enemy's body
 * Sizes and brightness are above the spec numbers so the payoff reads in a still (tuning log).
 */
import { easeOutQuad } from "../../level/typingFxParams";
import { FxKind } from "../materials/fx";
import type { RenderWorld } from "../RenderWorld";
import { accentRgb, type Rgb } from "./colors";
import { FxQuad } from "./FxQuad";
import type { HeroAura } from "./HeroAura";
import {
  newSpec,
  type ParticleSpec,
  PK_STREAK,
  type PooledParticles,
  resetSpec,
} from "./PooledParticles";
import type { TypingFxSettings } from "./types";

const SPEC: ParticleSpec = newSpec();
const RGB: Rgb = [0, 0, 0];
const FLARE_SEC = 0.28;
const STRIKE_SEC = 0.2;

export class BladeGlow {
  private readonly glow: FxQuad;
  private readonly flareStar: FxQuad;
  private readonly flareCore: FxQuad;
  private readonly beam: FxQuad;
  private readonly beamHalo: FxQuad;
  private readonly hitStar: FxQuad;
  private readonly hitCore: FxQuad;
  x = 0;
  y = 1;
  z = 0.4;
  private chargeV = 0;
  private hold = 0;
  private flareT = -1;
  private flarePerfect = false;
  private flareRgb: Rgb = [1, 1, 1];
  private strikeT = -1;
  private strikePerfect = false;
  private sx = 0;
  private sy = 0;
  private ex = 0;
  private ey = 0;
  private strikeRgb: Rgb = [1, 1, 1];

  constructor(
    private readonly world: RenderWorld,
    private readonly poolA: PooledParticles,
  ) {
    this.glow = new FxQuad(world, FxKind.Glow, 8);
    this.flareStar = new FxQuad(world, FxKind.Star, 10);
    this.flareCore = new FxQuad(world, FxKind.Glow, 9);
    this.beam = new FxQuad(world, FxKind.Beam, 9, 5);
    this.beamHalo = new FxQuad(world, FxKind.Beam, 8, 9);
    this.hitStar = new FxQuad(world, FxKind.Star, 10);
    this.hitCore = new FxQuad(world, FxKind.Glow, 9);
  }

  /** Move the anchor (the weapon tip, world units). */
  setAnchor(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** One fragment arrived: ramp the blade glow (0 -> 0.8 over a full word). */
  charge(f: number): void {
    this.chargeV = Math.min(0.8, this.chargeV + f * 0.8);
    this.hold = 0.35;
  }

  /** Last fragment arrived: star flash at the tip plus 6 world sparks (spec §5.1). */
  flare(perfect: boolean, rgb: Rgb, sparks = 6): void {
    this.flareT = 0;
    this.flarePerfect = perfect;
    this.flareRgb[0] = rgb[0];
    this.flareRgb[1] = rgb[1];
    this.flareRgb[2] = rgb[2];
    for (let i = 0; i < sparks; i++) {
      const a = (i / sparks) * Math.PI * 2 + 0.4;
      resetSpec(SPEC);
      SPEC.x = this.x;
      SPEC.y = this.y;
      SPEC.z = this.z;
      const sp = 2.2 + (i % 3) * 0.9;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp + 0.8;
      SPEC.vz = 0;
      SPEC.drag = 2.2;
      SPEC.grav = 2.5;
      SPEC.size = 0.12;
      SPEC.size1 = 0.03;
      SPEC.st = 0.1;
      SPEC.life = 0.42;
      SPEC.r = rgb[0] * 1.3;
      SPEC.g = rgb[1] * 1.3;
      SPEC.b = rgb[2] * 1.3;
      SPEC.kind = PK_STREAK;
      this.poolA.emit(SPEC);
    }
  }

  /** Beam from the blade to a world point (the enemy's body). */
  strike(toX: number, toY: number, perfect: boolean, rgb: Rgb): void {
    this.strikeT = 0;
    this.strikePerfect = perfect;
    this.sx = this.x;
    this.sy = this.y;
    this.ex = toX;
    this.ey = toY;
    this.strikeRgb[0] = rgb[0];
    this.strikeRgb[1] = rgb[1];
    this.strikeRgb[2] = rgb[2];
    // the strike lands on the enemy: a few world sparks thrown back along the beam
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6 - 0.5) * 2.4;
      resetSpec(SPEC);
      SPEC.x = toX;
      SPEC.y = toY;
      SPEC.z = this.z + 0.3;
      const sp = 2.4 + (i % 3) * 1.1;
      SPEC.vx = Math.cos(a) * sp;
      SPEC.vy = Math.sin(a) * sp + 1.2;
      SPEC.grav = 4;
      SPEC.drag = 1.6;
      SPEC.size = 0.14;
      SPEC.size1 = 0.03;
      SPEC.st = 0.1;
      SPEC.life = 0.4;
      SPEC.r = rgb[0] * 1.4;
      SPEC.g = rgb[1] * 1.4;
      SPEC.b = rgb[2] * 1.4;
      SPEC.kind = PK_STREAK;
      this.poolA.emit(SPEC);
    }
  }

  clear(): void {
    this.chargeV = 0;
    this.flareT = -1;
    this.strikeT = -1;
    this.hide();
  }

  private hide(): void {
    this.glow.intensity(0);
    this.flareStar.intensity(0);
    this.flareCore.intensity(0);
    this.beam.intensity(0);
    this.beamHalo.intensity(0);
    this.hitStar.intensity(0);
    this.hitCore.intensity(0);
  }

  /** @hot */
  update(dt: number, time: number, aura: HeroAura, set: TypingFxSettings): void {
    const k0 = set.effectsIntensity;
    if (k0 <= 0) {
      this.hide();
      return;
    }
    // bright worlds (forest): the flare / strike impact stack with the backdrop and clip to a white blob, so the
    // additive stars are scaled by biome brightness (1 in the cave, 0.4 on the forest)
    const gl = 0.4 + 0.6 * Math.min(1, Math.max(0, this.world.currentMood.caveK));
    const k = k0;
    // charge decays when no fragment arrives for a moment (after the flare, quickly)
    if (this.hold > 0) this.hold -= dt;
    else this.chargeV = Math.max(0, this.chargeV - dt * 2.4);
    const tier = aura.visualTier;
    const lvl = aura.displayed;
    const edge = tier >= 4 ? 0.45 : tier >= 3 ? 0.3 : 0;
    const tgtLvl = tier >= 3 ? (tier === 4 ? 1 : 0.75) : 1;
    const e = edge * Math.min(1, lvl / tgtLvl);
    const g = Math.max(e, this.chargeV) * k;
    if (g > 0.003) {
      accentRgb(Math.max(1, tier), time, set.reducedMotion, RGB);
      const w = this.chargeV > e ? 0.55 : 1;
      this.glow
        .color(RGB[0] * w * 0.7 + (1 - w), RGB[1] * w * 0.7 + (1 - w), RGB[2] * w * 0.7 + (1 - w))
        .at(this.x, this.y, this.z)
        .size(0.55 + 0.9 * this.chargeV)
        .intensity(g * 1.1);
    } else this.glow.intensity(0);

    // ---- flare
    if (this.flareT >= 0) {
      this.flareT += dt;
      const u = this.flareT / FLARE_SEC;
      if (u >= 1) {
        this.flareT = -1;
        this.flareStar.intensity(0);
        this.flareCore.intensity(0);
      } else {
        const big = this.flarePerfect ? 2.6 : 1.9;
        const s = big * (0.35 + 0.65 * easeOutQuad(Math.min(1, u * 2.2))) * (1 - 0.35 * u);
        const f = (1 - u) * (1 - u);
        const c = this.flareRgb;
        this.flareStar
          .color(c[0], c[1], c[2])
          .at(this.x, this.y, this.z + 0.2)
          .size(s, s)
          .intensity(1.7 * f * k * gl);
        this.flareStar.mesh.rotation.z = u * 0.9;
        this.flareCore
          .color(c[0], c[1], c[2])
          .at(this.x, this.y, this.z + 0.15)
          .size(s * 1.3)
          .intensity(0.9 * f * k * gl);
      }
    }

    // ---- strike beam
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const u = this.strikeT / STRIKE_SEC;
      if (u >= 1) {
        this.strikeT = -1;
        this.beam.intensity(0);
        this.beamHalo.intensity(0);
      } else {
        const dx = this.ex - this.sx;
        const dy = this.ey - this.sy;
        const len = Math.hypot(dx, dy) || 1;
        const rot = Math.atan2(-dx, dy);
        const wBase = this.strikePerfect ? 0.34 : 0.24;
        const w = wBase * (1 - 0.55 * u);
        const f = 1 - u * u;
        const c = this.strikeRgb;
        const mx = (this.sx + this.ex) / 2;
        const my = (this.sy + this.ey) / 2;
        this.beam
          .color(c[0], c[1], c[2])
          .color2(
            Math.min(2.4, c[0] * 0.5 + 1.4),
            Math.min(2.4, c[1] * 0.5 + 1.4),
            Math.min(2.4, c[2] * 0.5 + 1.4),
          )
          .at(mx, my, this.z + 0.1)
          .size(w, len)
          .intensity(1.35 * f * k * (0.5 + 0.5 * gl));
        this.beam.mesh.rotation.z = rot;
        this.beamHalo
          .color(c[0], c[1], c[2])
          .color2(c[0], c[1], c[2])
          .at(mx, my, this.z + 0.05)
          .size(w * 2.6, len)
          .intensity(0.28 * f * k);
        this.beamHalo.mesh.rotation.z = rot;
        // impact flash on the enemy
        const ui = Math.min(1, u * 1.4);
        const si = (this.strikePerfect ? 2.0 : 1.4) * (0.5 + 0.5 * easeOutQuad(Math.min(1, u * 3)));
        this.hitStar
          .color(c[0], c[1], c[2])
          .at(this.ex, this.ey, this.z + 0.35)
          .size(si)
          .intensity(2.0 * (1 - ui) * k * gl);
        this.hitStar.mesh.rotation.z = u * 0.7;
        this.hitCore
          .color(c[0], c[1], c[2])
          .at(this.ex, this.ey, this.z + 0.3)
          .size(si * 1.1)
          .intensity(1.0 * (1 - ui) * k * gl);
      }
    } else {
      this.hitStar.intensity(0);
      this.hitCore.intensity(0);
    }
  }

  dispose(): void {
    this.glow.dispose();
    this.flareStar.dispose();
    this.flareCore.dispose();
    this.beam.dispose();
    this.beamHalo.dispose();
    this.hitStar.dispose();
    this.hitCore.dispose();
  }
}

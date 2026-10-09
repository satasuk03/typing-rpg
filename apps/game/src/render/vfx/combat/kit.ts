/**
 * FxKit: what every combat effect module shares: the particle pools and light slots (the typing VFX pools when they
 * exist, so there is one draw call per blend mode; otherwise pools of its own), the pooled quads / arcs / ghosts, the
 * settings-derived scale, a seeded RNG and non-allocating emit helpers. Effect modules never touch three.js objects
 * directly except through these.
 */
import type { LevelView } from "@hd2d/sim";
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import type { SpriteFrame } from "../../sprites/SpriteSource";
import { makeRng } from "../../util";
import { AuraKind, AuraQuad } from "../AuraQuad";
import { LIGHT_MAX_RADIUS } from "../colors";
import { LightSlots } from "../LightSlots";
import {
  newSpec,
  type ParticleSpec,
  PK_GLOW,
  PK_PIXEL,
  PK_STREAK,
  PooledParticles,
  resetSpec,
} from "../PooledParticles";
import type { TypingFxSettings, WorldAnchors } from "../types";
import { ArcPool } from "./ArcPool";
import { Ghosts } from "./Ghosts";
import { type CombatScale, type Rgb, scaled } from "./params";
import { newQuadSpec, QuadPool, type QuadSpec, resetQuadSpec } from "./QuadPool";

export interface HeroSnap {
  x: number;
  y: number;
  z: number;
}
export interface EnemyInfo {
  frame: SpriteFrame | null;
  scale: number;
  /** Foot position (the resting x, without lunges) and sprite height in world units. */
  x: number;
  y: number;
  z: number;
  height: number;
}

export interface CombatDeps {
  world: RenderWorld;
  anchors: WorldAnchors;
  /** The typing VFX particle pools to share (one draw call per blend mode). Without them the kit builds its own. */
  shared?: { add: PooledParticles; norm: PooledParticles } | null;
  getView(): LevelView | null;
  heroSnapshot(out: HeroSnap): SpriteFrame | null;
  enemyInfo(id: number, out: EnemyInfo): boolean;
  rim(who: "hero" | number, amount: number, rgb: readonly [number, number, number]): void;
  /** Capped full-screen flash (typing world fx `postFlash`); absent = no flashes. */
  postFlash?(amount: number, rgb: Rgb, ms: number, cap: number): void;
  seed?: number;
}

const QUAL = [1.0, 0.8, 0.55] as const;
/** Combat lights near enemies may be wide; near the hero they stay local so the sprite is never washed out. */
export const ENEMY_LIGHT_R = 7;
export const HERO_LIGHT_R = LIGHT_MAX_RADIUS;

export class FxKit {
  readonly add: PooledParticles;
  readonly norm: PooledParticles;
  readonly lights: LightSlots;
  readonly arcs: ArcPool;
  readonly ghosts: Ghosts;
  readonly stars: QuadPool;
  readonly rings: QuadPool;
  readonly glows: QuadPool;
  readonly hexes: QuadPool;
  readonly beams: QuadPool;
  readonly cracks: AuraQuad[] = [];
  /** Dev demo only: pretend the hero wields this archetype. */
  archetypeOverride: string | null = null;
  /** Dilated stage time (s). */
  time = 0;
  scale: CombatScale = { k: 1, q: 1, reducedFlash: false, reducedMotion: false };
  readonly rnd: () => number;
  private readonly S: ParticleSpec = newSpec();
  private readonly Q: QuadSpec = newQuadSpec();
  private crackNext = 0;
  private readonly ownsPools: boolean;
  readonly hero: HeroSnap = { x: 0, y: 0, z: 0 };

  constructor(readonly deps: CombatDeps) {
    const w = deps.world;
    this.rnd = makeRng(deps.seed ?? 20250131);
    if (deps.shared) {
      this.add = deps.shared.add;
      this.norm = deps.shared.norm;
      this.ownsPools = false;
    } else {
      // standalone (typing VFX off): own pools and lights, updated and uploaded by `update`
      this.add = new PooledParticles(320, true, w.scene);
      this.norm = new PooledParticles(96, false, w.scene);
      this.ownsPools = true;
    }
    // 3 lights of the combat library's own (typing keeps its 3); 16 light slots in total leave room for torches
    this.lights = new LightSlots(w.lights);
    this.arcs = new ArcPool(w, 8);
    this.ghosts = new Ghosts(w, 8);
    this.stars = new QuadPool(w, FxKind.Star, 8, 10);
    this.rings = new QuadPool(w, FxKind.Ring, 8, 9);
    this.glows = new QuadPool(w, FxKind.Glow, 8, 8);
    this.hexes = new QuadPool(w, FxKind.Guard, 4, 9);
    this.beams = new QuadPool(w, FxKind.Beam, 3, 9);
    for (let i = 0; i < 2; i++) {
      const c = new AuraQuad(w, AuraKind.Burst, 5, i * 3.1, 0);
      c.flat();
      this.cracks.push(c);
    }
  }

  get ownsParticlePools(): boolean {
    return this.ownsPools;
  }

  /** Re-derive the scale from the settings and the quality tier. */
  setSettings(s: TypingFxSettings, tier: number): void {
    const sc = this.scale;
    sc.k = s.effectsIntensity;
    sc.reducedFlash = s.reducedFlash;
    sc.reducedMotion = s.reducedMotion;
    sc.q = QUAL[tier] ?? 1;
    this.lights.gain = s.effectsIntensity * (s.reducedFlash ? 0.5 : 1);
  }

  /** Cave / boss hollow: dark, cool worlds where a warm arc edge reads (the POC's `caveK > 0.5`). */
  warmBiome(): boolean {
    const b = this.deps.world.biome;
    return b === "cave" || b === "boss";
  }

  /**
   * Additive glare scale by biome brightness: 1 in the dark cave / boss hollow (caveK 1), 0.4 on the bright forest
   * (caveK 0), where stacked additive flares otherwise clip to a white blob and lose their hue.
   */
  get glare(): number {
    const k = this.deps.world.currentMood.caveK;
    return 0.4 + 0.6 * Math.min(1, Math.max(0, k));
  }

  /** A hot colour kept amber on bright worlds: drops green / blue so the sum with the backdrop does not clip to white. */
  warm(c: Rgb): Rgb {
    const w = 1 - this.glare; // 0 cave .. 0.6 forest
    return [c[0], c[1] * (1 - 0.35 * w), c[2] * (1 - 0.8 * w)];
  }

  n(base: number): number {
    return scaled(base, this.scale);
  }

  // ------------------------------------------------------------------------------- emit helpers

  /** Begin a particle: returns the reset scratch spec to tweak, then `emitA` / `emitN`. */
  p(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: number,
    c: Rgb,
    a = 1,
  ): ParticleSpec {
    const s = resetSpec(this.S);
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.life = life;
    s.size = size;
    s.kind = kind;
    s.r = c[0];
    s.g = c[1];
    s.b = c[2];
    s.a = a;
    return s;
  }
  emitA(s: ParticleSpec): void {
    this.add.emit(s);
  }
  emitN(s: ParticleSpec): void {
    this.norm.emit(s);
  }

  /** POC `burst`: `n` streak sparks fanned around a point, biased toward +x by `dir` (away from the hero). */
  sparks(
    x: number,
    y: number,
    z: number,
    n: number,
    col: Rgb,
    spd: number,
    o: {
      dir?: number;
      life?: number;
      size?: number;
      kind?: number;
      grav?: number;
      st?: number;
    } = {},
  ): void {
    const dir = o.dir ?? 0;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const e = (this.rnd() - 0.3) * 1.6;
      const s = spd * (0.3 + this.rnd() * 0.9);
      const sp = this.p(
        x,
        y,
        z + 0.3,
        Math.cos(a) * s + dir * spd * 0.6,
        Math.sin(a) * s * 0.8 + e,
        (this.rnd() - 0.5) * s * 0.5,
        (o.life ?? 0.45) * (0.5 + this.rnd()),
        o.size ?? 0.06,
        o.kind ?? PK_STREAK,
        col,
      );
      sp.st = o.st ?? 0.05;
      sp.grav = o.grav ?? 6;
      sp.drag = 2.5;
      this.add.emit(sp);
    }
  }

  /** Soft puffs (dust, smoke, fire body) in the normal-blend pool. */
  puffs(
    x: number,
    y: number,
    z: number,
    n: number,
    col: Rgb,
    size: number,
    rise: number,
    life: number,
  ): void {
    for (let i = 0; i < n; i++) {
      const sp = this.p(
        x + (this.rnd() - 0.5) * 0.9,
        y + (this.rnd() - 0.2) * 0.3,
        z + 0.2,
        (this.rnd() - 0.5) * 2.2,
        rise * (0.4 + this.rnd()),
        (this.rnd() - 0.5) * 0.8,
        life * (0.6 + this.rnd() * 0.6),
        size * (0.7 + this.rnd() * 0.6),
        PK_GLOW,
        col,
        0.55,
      );
      sp.size1 = size * 2;
      sp.drag = 2.2;
      this.norm.emit(sp);
    }
  }

  /** Hard-edged pixel chips (rock, shards, coins) with gravity. */
  chips(
    x: number,
    y: number,
    z: number,
    n: number,
    col: Rgb,
    spd: number,
    size: number,
    life: number,
    grav = 12,
    pool: "add" | "norm" = "add",
  ): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = spd * (0.3 + this.rnd() * 0.9);
      const sp = this.p(
        x,
        y,
        z + 0.2,
        Math.cos(a) * s,
        Math.abs(Math.sin(a)) * s * 0.9 + spd * 0.25,
        (this.rnd() - 0.5) * s * 0.4,
        life * (0.6 + this.rnd() * 0.7),
        size * (0.7 + this.rnd() * 0.6),
        PK_PIXEL,
        col,
      );
      sp.grav = grav;
      sp.drag = 0.6;
      if (pool === "add") this.add.emit(sp);
      else this.norm.emit(sp);
    }
  }

  quad(): QuadSpec {
    return resetQuadSpec(this.Q);
  }

  /** A bright 4-point flare that snaps in and shrinks (the POC's `fxQuad(1, ...)` hit star). */
  star(
    x: number,
    y: number,
    z: number,
    s0: number,
    s1: number,
    life: number,
    c: Rgb,
    i: number,
    rot = 0,
  ): void {
    const g =
      this.scale.k <= 0
        ? 0
        : (0.5 + 0.5 * this.scale.k) * (this.scale.reducedFlash ? 0.5 : 1) * this.glare;
    if (g <= 0) return;
    const q = this.quad();
    q.x = x;
    q.y = y;
    q.z = z;
    q.s0 = s0;
    q.s1 = s1;
    q.life = life;
    q.i = i * g;
    q.rot = rot;
    q.r = c[0];
    q.g = c[1];
    q.b = c[2];
    this.stars.spawn(q);
  }

  /** An expanding ring (vertical, facing the camera) or ground shockwave. */
  ring(
    x: number,
    y: number,
    z: number,
    s0: number,
    s1: number,
    life: number,
    c: Rgb,
    c2: Rgb,
    i: number,
    ground = false,
  ): void {
    const g = this.scale.k <= 0 ? 0 : 0.5 + 0.5 * this.scale.k;
    if (g <= 0) return;
    const q = this.quad();
    q.x = x;
    q.y = y;
    q.z = z;
    q.s0 = s0;
    q.s1 = s1;
    q.life = life;
    q.i = i * g;
    q.ground = ground;
    q.ease = true;
    q.r = c[0];
    q.g = c[1];
    q.b = c[2];
    q.r2 = c2[0];
    q.g2 = c2[1];
    q.b2 = c2[2];
    this.rings.spawn(q);
  }

  /** A soft glow blob that swells (smoke-lit fire body, heal halo). */
  glow(
    x: number,
    y: number,
    z: number,
    s0: number,
    s1: number,
    life: number,
    c: Rgb,
    i: number,
  ): void {
    const g = this.scale.k <= 0 ? 0 : (0.5 + 0.5 * this.scale.k) * this.glare;
    if (g <= 0) return;
    const q = this.quad();
    q.x = x;
    q.y = y;
    q.z = z;
    q.s0 = s0;
    q.s1 = s1;
    q.life = life;
    q.i = i * g;
    q.ease = true;
    q.r = c[0];
    q.g = c[1];
    q.b = c[2];
    this.glows.spawn(q);
  }

  /** A hex-lattice flash (shield chip / break / frost); `s0` -> `s1` world units across. */
  hex(
    x: number,
    y: number,
    z: number,
    s0: number,
    s1: number,
    life: number,
    c: Rgb,
    i: number,
  ): void {
    const g = this.scale.k <= 0 ? 0 : (0.5 + 0.5 * this.scale.k) * this.glare * this.glare; // the lattice shader boosts x3.5 late in its life
    if (g <= 0) return;
    const q = this.quad();
    q.x = x;
    q.y = y;
    q.z = z;
    q.s0 = s0;
    q.s1 = s1;
    q.life = life;
    q.i = i * g;
    q.ease = true;
    q.r = c[0];
    q.g = c[1];
    q.b = c[2];
    this.hexes.spawn(q);
  }

  /** Dark radial cracks lying on the ground (hammer slam, boss phase change). */
  crack(x: number, z: number, size: number, life: number, c: Rgb): void {
    if (this.scale.k <= 0) return;
    const a = this.cracks[this.crackNext++ % this.cracks.length] as AuraQuad;
    a.color(c[0], c[1], c[2])
      .at(x, 0.04, z)
      .size(size)
      .alpha(0.9 * (0.6 + 0.4 * this.scale.k));
    a.progress(0);
    this.crackLife[this.cracks.indexOf(a)] = life;
    this.crackT[this.cracks.indexOf(a)] = 0;
    this.crackA[this.cracks.indexOf(a)] = 0.9 * (0.6 + 0.4 * this.scale.k);
  }
  private readonly crackLife = [0, 0];
  private readonly crackT = [0, 0];
  private readonly crackA = [0, 0];

  flash(
    x: number,
    y: number,
    z: number,
    c: Rgb,
    intensity: number,
    radius: number,
    life: number,
  ): void {
    if (this.scale.k <= 0) return;
    this.lights.flash(x, y, z, c[0], c[1], c[2], intensity * this.glare, radius, life);
  }

  /** Camera shake scaled by the settings (0 under reduced motion / k = 0). */
  shake(sec: number, mag: number): void {
    const k = this.scale.reducedMotion ? 0 : this.scale.k;
    if (k > 0) this.deps.world.camera.shake(sec, mag * k);
  }

  /** Capped full-screen flash. No-op without the typing world fx, or under reduced flash / k = 0. */
  postFlash(amount: number, c: Rgb, ms: number, cap: number): void {
    if (this.scale.reducedFlash || this.scale.k <= 0) return;
    this.deps.postFlash?.(amount * this.glare, c, ms, cap * this.glare);
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot `dt` is the stage's dilated dt. */
  update(dt: number): void {
    this.time += dt;
    this.arcs.gain = 1 - (1 - this.glare) * (2 / 3);
    this.arcs.update(dt);
    this.ghosts.update(dt);
    this.stars.update(dt);
    this.rings.update(dt);
    this.glows.update(dt);
    this.hexes.update(dt);
    this.beams.update(dt);
    for (let i = 0; i < this.cracks.length; i++) {
      const life = this.crackLife[i] as number;
      if (life <= 0) continue;
      const t = (this.crackT[i] as number) + dt;
      this.crackT[i] = t;
      const k = t / life;
      const c = this.cracks[i] as AuraQuad;
      if (k >= 1) {
        this.crackLife[i] = 0;
        c.alpha(0);
      } else c.alpha((this.crackA[i] as number) * (k < 0.15 ? k / 0.15 : (1 - k) ** 1.5));
    }
    this.lights.update(dt);
    if (this.ownsPools) {
      this.add.update(dt);
      this.norm.update(dt);
      this.add.upload();
      this.norm.upload();
    }
  }

  clear(): void {
    this.arcs.clear();
    this.ghosts.clear();
    this.stars.clear();
    this.rings.clear();
    this.glows.clear();
    this.hexes.clear();
    this.beams.clear();
    for (let i = 0; i < this.cracks.length; i++) {
      this.crackLife[i] = 0;
      (this.cracks[i] as AuraQuad).alpha(0);
    }
    if (this.ownsPools) {
      this.add.clear();
      this.norm.clear();
    }
    this.lights.clear();
  }

  dispose(): void {
    this.arcs.dispose();
    this.ghosts.dispose();
    this.stars.dispose();
    this.rings.dispose();
    this.glows.dispose();
    this.hexes.dispose();
    this.beams.dispose();
    for (const c of this.cracks) c.dispose();
    if (this.ownsPools) {
      this.add.dispose();
      this.norm.dispose();
    }
    this.lights.dispose();
  }
}

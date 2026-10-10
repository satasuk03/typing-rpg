/**
 * WorldBuilder: turns a validated `LevelLayout` into scene content through the `RenderWorld` add-helpers.
 *
 *   const layout = loadLevel("ch1-l03");
 *   const handle = buildWorld(layout, world, spriteSource);
 *   handle.getAnchor("enc1.hero");   // named anchors (hero stop, enemy slots, start/end)
 *   handle.walkPath.sample(0.5);      // walk path sampler
 *   handle.update(dt, camX);          // per frame: ambient zones + per-x mood
 *   handle.dispose();
 *
 * Every position comes from the layout data; this file contains no world coordinates.
 */
import type { Mesh, Object3D } from "three";
import { BIOMES, type BiomeMood, blendMood } from "../biomes";
import { BATTLE_POSE, BOSS_INTRO_POSE, type CameraPose, WALK_POSE } from "../camera";
import type { PropOptions, RenderWorld } from "../RenderWorld";
import type { SpriteSource } from "../sprites/SpriteSource";
import { clamp, lerp, makeRng, sstep } from "../util";
import {
  type AmbientKind,
  type AnchorDef,
  anchorMap,
  battleCameraName,
  type EncounterDef,
  heroAnchorName,
  type LayoutBiome,
  type LevelLayout,
  type MoodTweak,
  type PropLightDef,
  resolveCamera,
  type SegmentDef,
  type StyleDef,
  slotAnchorName,
  toRenderBiome,
  type V2,
  type V3,
  type ZoneDef,
} from "./layout";

// ---------------------------------------------------------------------------------------- walk path

export interface PathPoint {
  x: number;
  z: number;
  /** Unit tangent in the xz plane. */
  tx: number;
  tz: number;
}

/** Polyline sampler for the hero's walk. `t` is normalised arc length (0 = start, 1 = end). */
export class WalkPath {
  readonly length: number;
  private readonly cum: number[] = [0];

  constructor(readonly points: readonly V2[]) {
    if (points.length < 2) throw new Error("WalkPath needs 2+ points");
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as V2;
      const b = points[i] as V2;
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.cum.push(acc);
    }
    this.length = acc;
  }

  get startX(): number {
    return (this.points[0] as V2)[0];
  }

  get endX(): number {
    return (this.points[this.points.length - 1] as V2)[0];
  }

  /** Sample by arc-length distance in metres (clamped). */
  atDistance(d: number): PathPoint {
    const dd = clamp(d, 0, this.length);
    let i = 1;
    while (i < this.cum.length - 1 && (this.cum[i] as number) < dd) i++;
    const a = this.points[i - 1] as V2;
    const b = this.points[i] as V2;
    const c0 = this.cum[i - 1] as number;
    const seg = (this.cum[i] as number) - c0;
    const u = seg > 0 ? (dd - c0) / seg : 0;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return { x: lerp(a[0], b[0], u), z: lerp(a[1], b[1], u), tx: dx / l, tz: dz / l };
  }

  /** Sample by normalised arc length 0..1. */
  sample(t: number): PathPoint {
    return this.atDistance(clamp(t, 0, 1) * this.length);
  }

  /** Path depth (z) at a world x. */
  zAtX(x: number): number {
    const xs = clamp(x, this.startX, this.endX);
    let i = 1;
    while (i < this.points.length - 1 && (this.points[i] as V2)[0] < xs) i++;
    const a = this.points[i - 1] as V2;
    const b = this.points[i] as V2;
    const u = b[0] > a[0] ? (xs - a[0]) / (b[0] - a[0]) : 0;
    return lerp(a[1], b[1], u);
  }
}

// ---------------------------------------------------------------------------------------- handle

export interface EncounterAnchors {
  def: EncounterDef;
  hero: AnchorDef;
  slots: AnchorDef[];
  camera: CameraPose;
}

export type PoseName = "walk" | "boss" | `battle:${number}`;

export interface WorldHandle {
  readonly layout: LevelLayout;
  readonly walkPath: WalkPath;
  /** Named anchor (`start`, `end`, `enc1.hero`, `enc1.slot0`, `boss`...). Throws for unknown names. */
  getAnchor(name: string): AnchorDef;
  hasAnchor(name: string): boolean;
  anchorNames(): string[];
  encounter(index: number): EncounterAnchors;
  /** Camera pose for `walk`, `battle:<n>` or `boss` (x is the framing centre). */
  cameraPose(name: PoseName): CameraPose;
  /** Mood (biome preset + level tweaks, crossfaded across segment boundaries) at world x. */
  moodAt(x: number): BiomeMood;
  biomeAt(x: number): LayoutBiome;
  /** Letterbox bars from the biome mood (boss intro). Off by default so walk/battle poses stay bar-free. */
  setLetterbox(on: boolean): void;
  /** Push `moodAt(camX)` into the RenderWorld and spawn ambient-zone particles. Call once per frame. */
  update(dt: number, camX: number): void;
  /** Pre-simulate ambient zones so a still frame already has particles in the air. */
  warmUp(seconds: number, camX: number): void;
  /** Remove everything this builder added to the RenderWorld. */
  dispose(): void;
}

function applyTweak(base: BiomeMood, t: MoodTweak): BiomeMood {
  return { ...base, ...(t as Partial<BiomeMood>) };
}

function segmentMood(s: SegmentDef): BiomeMood {
  return applyTweak(BIOMES[toRenderBiome(s.biome)], s.mood);
}

/** Mood at world x for a sorted segment list (biome preset + tweak, crossfaded at boundaries). */
export function moodAtX(segs: readonly SegmentDef[], x: number): BiomeMood {
  const first = segs[0] as SegmentDef;
  if (segs.length === 1) return segmentMood(first);
  let i = segs.findIndex((s) => x < s.x1);
  if (i < 0) i = segs.length - 1;
  const cur = segs[i] as SegmentDef;
  const next = segs[i + 1];
  const prev = segs[i - 1];
  if (next) {
    const half = cur.blend / 2;
    if (half > 0 && x > cur.x1 - half) {
      return blendMood(
        segmentMood(cur),
        segmentMood(next),
        sstep(0, 1, (x - (cur.x1 - half)) / cur.blend),
      );
    }
  }
  if (prev) {
    const half = prev.blend / 2;
    if (half > 0 && x < cur.x0 + half) {
      return blendMood(
        segmentMood(prev),
        segmentMood(cur),
        sstep(0, 1, (x - (cur.x0 - half)) / prev.blend),
      );
    }
  }
  return segmentMood(cur);
}

// ---------------------------------------------------------------------------------------- ambient zones

interface ZonePreset {
  additive: boolean;
  kind: 0 | 1 | 2;
  color: readonly [number, number, number];
  alpha: number;
  size: V2;
  life: V2;
  vx: V2;
  vy: V2;
  sway: number;
  st?: number;
  grav?: number;
  spin?: number;
}

const ZONE_PRESETS: Readonly<Record<AmbientKind, ZonePreset>> = {
  wisps: {
    additive: true,
    kind: 0,
    color: [0.45, 1.3, 1.6],
    alpha: 0.8,
    size: [0.03, 0.06],
    life: [4, 6],
    vx: [-0.08, 0.12],
    vy: [0.04, 0.2],
    sway: 0.7,
  },
  pollen: {
    additive: true,
    kind: 0,
    color: [1.6, 1.4, 1.0],
    alpha: 0.8,
    size: [0.03, 0.06],
    life: [3, 5],
    vx: [0.05, 0.25],
    vy: [-0.1, 0.1],
    sway: 0.4,
  },
  fireflies: {
    additive: true,
    kind: 0,
    color: [2.0, 2.8, 0.8],
    alpha: 1,
    size: [0.08, 0.12],
    life: [2.5, 4.5],
    vx: [-0.3, 0.3],
    vy: [-0.2, 0.25],
    sway: 1.3,
  },
  leaves: {
    additive: false,
    kind: 1,
    color: [0.85, 0.45, 0.2],
    alpha: 1,
    size: [0.07, 0.1],
    life: [8, 10],
    vx: [-0.6, 0.2],
    vy: [-0.8, -0.55],
    sway: 1.6,
    spin: 3,
  },
  embers: {
    additive: true,
    kind: 2,
    color: [4.2, 1.4, 0.3],
    alpha: 0.9,
    size: [0.03, 0.05],
    life: [1.2, 2.4],
    vx: [-3.5, -1.5],
    vy: [1.4, 3.2],
    sway: 1.5,
    st: 0.22,
  },
  spores: {
    additive: true,
    kind: 0,
    color: [0.4, 2.2, 1.9],
    alpha: 0.9,
    size: [0.05, 0.09],
    life: [3, 5],
    vx: [-0.15, 0.15],
    vy: [0.15, 0.5],
    sway: 0.9,
  },
  dust: {
    additive: true,
    kind: 0,
    color: [1.4, 1.2, 0.9],
    alpha: 0.55,
    size: [0.03, 0.05],
    life: [4, 6],
    vx: [0.1, 0.4],
    vy: [-0.05, 0.1],
    sway: 0.6,
  },
  motes: {
    additive: true,
    kind: 0,
    color: [0.6, 1.4, 2.4],
    alpha: 0.9,
    size: [0.04, 0.08],
    life: [3, 5],
    vx: [-0.1, 0.1],
    vy: [0.05, 0.35],
    sway: 0.7,
  },
};

/** Zone particles are only simulated this far each side of the camera. */
const ZONE_WINDOW = 14;

class ZoneEmitter {
  private readonly rnd: () => number;
  constructor(
    private readonly world: RenderWorld,
    private readonly zones: readonly ZoneDef[],
    seed: number,
  ) {
    this.rnd = makeRng(seed);
  }

  update(dt: number, camX: number): void {
    const rnd = this.rnd;
    for (const z of this.zones) {
      const p = ZONE_PRESETS[z.kind];
      const a = Math.max(z.x0, camX - ZONE_WINDOW);
      const b = Math.min(z.x1, camX + ZONE_WINDOW);
      if (b <= a) continue;
      const n = z.density * dt * ((b - a) / (ZONE_WINDOW * 2));
      const sys = p.additive ? this.world.particles.additive : this.world.particles.normal;
      for (let i = 0; i < n || rnd() < n - i; i++) {
        sys.spawn({
          x: lerp(a, b, rnd()),
          y: lerp(z.y[0], z.y[1], rnd()),
          z: lerp(z.z0, z.z1, rnd()),
          vx: lerp(p.vx[0], p.vx[1], rnd()),
          vy: lerp(p.vy[0], p.vy[1], rnd()),
          vz: (rnd() - 0.5) * 0.3,
          life: lerp(p.life[0], p.life[1], rnd()),
          size: lerp(p.size[0], p.size[1], rnd()),
          kind: p.kind,
          r: p.color[0],
          g: p.color[1],
          b: p.color[2],
          a: p.alpha * (0.6 + 0.4 * rnd()),
          sway: p.sway,
          ph: rnd() * 6,
          fadeIn: 0.4,
          ...(p.st !== undefined ? { st: p.st } : {}),
          ...(p.spin !== undefined ? { spin: p.spin } : {}),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------- build

const HALF = 0.5;

const mid = (a: number, b: number): number => lerp(a, b, HALF);

function styleOpts(s: StyleDef): PropOptions {
  const o: PropOptions = {};
  if (s.tint) o.tint = s.tint;
  if (s.rim !== undefined) o.rim = s.rim;
  if (s.emis !== undefined) o.emis = s.emis;
  if (s.dark !== undefined) o.dark = s.dark;
  if (s.wrap !== undefined) o.wrap = s.wrap;
  return o;
}

/** Offset (metres) from an encounter's hero anchor to the battle camera is data: the `battle:N` Camera. */
export function buildWorld(
  layout: LevelLayout,
  world: RenderWorld,
  spriteSource?: SpriteSource,
): WorldHandle {
  if (spriteSource && spriteSource !== world.source) world.source = spriteSource;
  const src = world.source;
  const scene = world.scene;
  const fg = world.fgScene;
  const before = new Set<Object3D>([...scene.children, ...fg.children]);
  const staticsBefore = world.lights.staticLights.length;

  const need = (key: string): void => {
    if (!src.has(key)) throw new Error(`[${layout.id}] unknown sprite key "${key}"`);
  };

  const addLight = (x: number, y: number, z: number, l: PropLightDef): void => {
    world.lights.addStatic({
      x,
      y: y + l.dy,
      z: z + l.dz,
      radius: l.radius,
      color: l.color,
      intensity: l.intensity,
      scatter: l.scatter,
      flicker: l.flicker,
    });
  };

  const place = (
    key: string,
    x: number,
    y: number,
    z: number,
    scale: number,
    flip: boolean,
    foreground: boolean,
    style: StyleDef,
    flame: number,
    light: PropLightDef | undefined,
    flameColor?: V3,
  ): void => {
    need(key);
    world.addProp(key, x, y, z, { ...styleOpts(style), scale, flip, foreground });
    if (flame > 0)
      world.addFlame(x, y + world.flameY(key) * scale, z, flame, foreground, true, flameColor);
    if (light) addLight(x, y, z, light);
  };

  // --- terrain
  const g = layout.ground;
  world.lighting.uBiome.value.set(g.caveFrom, g.caveTo);
  world.addGround(g.x1 - g.x0, g.z1 - g.z0, mid(g.x0, g.x1), mid(g.z0, g.z1), g.kind, g.arena);
  world.addFogCards(toRenderBiome(layout.biome));
  if (layout.wall) {
    const w = layout.wall;
    world.addWall(w.x1 - w.x0, w.height, mid(w.x0, w.x1), w.cy, w.z, w.edgeX);
  }
  for (const b of layout.backdrops) {
    world.addBackdrop(b.kind, b.width, b.height, b.pos, b.tint, b.fogK, b.rep, b.follow);
  }

  const anchors = anchorMap(layout);
  // x positions the hero/enemies occupy in the camera poses: foreground scatters keep clear of them.
  const battleCenters = [
    ...layout.cameras.filter((c) => c.name.startsWith("battle:")).map((c) => c.x),
    ...layout.cameras.filter((c) => c.name === "walk").map((c) => c.x),
  ];

  // --- explicit props
  for (const p of layout.props) {
    place(p.key, p.x, p.y, p.z, p.scale, p.flip, p.foreground, p, p.flame, p.light, p.flameColor);
  }

  // --- scatters (seeded; placement rng is always advanced so edits to avoidBattle do not reshuffle)
  for (const s of layout.scatters) {
    const R = makeRng(s.seed + layout.seed * 7919);
    for (let x = s.x0; x < s.x1; x += lerp(s.spacing[0], s.spacing[1], R())) {
      const z = lerp(s.z0, s.z1, R());
      const key = s.keys[Math.floor(R() * s.keys.length)] as string;
      const scale = lerp(s.scale[0], s.scale[1], R());
      const y = lerp(s.y[0], s.y[1], R());
      const flip = s.flipRandom && R() < 0.5;
      const skip = R() < s.gap || battleCenters.some((c) => Math.abs(x - c) < s.avoidBattle);
      if (skip) continue;
      place(key, x, y, z, scale, flip, s.foreground, s, s.flame, s.light, s.flameColor);
    }
  }

  // --- lights, rays, runes
  for (const l of layout.lights) {
    world.lights.addStatic({
      x: l.x,
      y: l.y,
      z: l.z,
      radius: l.radius,
      color: l.color,
      intensity: l.intensity,
      scatter: l.scatter,
      flicker: l.flicker,
    });
  }
  for (const g of layout.glows) {
    world.addGlow(g.x, g.y, g.z, g.size, g.color, g.intensity, g.foreground);
  }
  for (const r of layout.godRays) {
    world.addGodRay(r.x, r.y, r.z, r.w, r.h, r.rotZ, r.color, r.intensity);
  }
  for (const f of layout.rayFields) {
    const R = makeRng(f.seed + layout.seed * 104729);
    for (let x = f.x0; x < f.x1; x += lerp(f.spacing[0], f.spacing[1], R())) {
      const col = f.color2 && f.colorFromX !== undefined && x > f.colorFromX ? f.color2 : f.color;
      world.addGodRay(
        x,
        f.y,
        lerp(f.z0, f.z1, R()),
        lerp(f.w[0], f.w[1], R()),
        f.h,
        f.rotZ,
        col,
        lerp(f.intensity[0], f.intensity[1], R()),
      );
    }
  }
  for (const r of layout.runes) world.addRuneCircle(r.x, r.z, r.size, r.intensity, r.color);

  const added = [...scene.children, ...fg.children].filter((o) => !before.has(o));
  const path = new WalkPath(layout.walkPath);
  const segs = [...layout.segments].sort((a, b) => a.x0 - b.x0);
  const emitter = new ZoneEmitter(world, layout.zones, layout.seed * 31 + 7);
  let disposed = false;
  let letterbox = false;

  const handle: WorldHandle = {
    layout,
    walkPath: path,
    getAnchor(name) {
      const a = anchors.get(name);
      if (!a) throw new Error(`[${layout.id}] no anchor "${name}"`);
      return a;
    },
    hasAnchor: (name) => anchors.has(name),
    anchorNames: () => [...anchors.keys()],
    encounter(index) {
      const def = layout.encounters.find((e) => e.index === index);
      if (!def) throw new Error(`[${layout.id}] no encounter ${index}`);
      const slots: AnchorDef[] = [];
      for (let s = 0; s < def.slots; s++) slots.push(handle.getAnchor(slotAnchorName(index, s)));
      return {
        def,
        hero: handle.getAnchor(heroAnchorName(index)),
        slots,
        camera: handle.cameraPose(battleCameraName(index) as PoseName),
      };
    },
    cameraPose(name) {
      const h = layout.cameras.find((c) => c.name === name);
      if (!h) throw new Error(`[${layout.id}] no camera hint "${name}"`);
      const base = name === "walk" ? WALK_POSE : name === "boss" ? BOSS_INTRO_POSE : BATTLE_POSE;
      return resolveCamera(h, base);
    },
    moodAt: (x) => moodAtX(segs, x),
    biomeAt(x) {
      const i = segs.findIndex((s) => x < s.x1);
      return (segs[i < 0 ? segs.length - 1 : i] as SegmentDef).biome;
    },
    setLetterbox(on) {
      letterbox = on;
    },
    update(dt, camX) {
      const m = moodAtX(segs, camX);
      world.setMood(letterbox ? m : { ...m, bars: 0 }, toRenderBiome(handle.biomeAt(camX)));
      emitter.update(dt, camX);
    },
    warmUp(seconds, camX) {
      const step = 1 / 30;
      for (let t = 0; t < seconds; t += step) emitter.update(step, camX);
      world.warmUpAmbient(seconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of added) world.remove(o as Mesh);
      world.pruneRemoved();
      world.lights.truncateStatics(staticsBefore);
    },
  };
  return handle;
}

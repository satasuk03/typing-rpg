/**
 * Level layout: the typed, world-space model the WorldBuilder consumes, plus the loader that validates
 * a hand-authored LDtk-compatible JSON subset (see README.md) with zod and converts it to that model.
 *
 * Everything here is pure data + validation (no three.js), so it can be unit-tested in node.
 */
import { z } from "zod";
import { AMBIENT_MOOD_KINDS, type BiomeId, type BiomeMood } from "../biomes";
import type { CameraPose } from "../camera";
import type { GroundKind } from "../materials/ch2Ground";
import type { BackdropKind } from "../sprites/SpriteSource";

// ------------------------------------------------------------------------------------------ model

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];

/** Layout biome ids. Content uses "hollow" for the boss arena; the renderer calls it "boss". */
export const LAYOUT_BIOMES = [
  "forest",
  "ruins",
  "cave",
  "hollow",
  "boss",
  "hushwood",
  "grove",
] as const;
export type LayoutBiome = (typeof LAYOUT_BIOMES)[number];

export function toRenderBiome(b: LayoutBiome): BiomeId {
  return b === "hollow" ? "boss" : b;
}

export const AMBIENT_KINDS = [
  "pollen",
  "fireflies",
  "leaves",
  "embers",
  "spores",
  "dust",
  "motes",
  "wisps",
] as const;
export type AmbientKind = (typeof AMBIENT_KINDS)[number];

/** Hero lane: no ground props may stand inside it (heroes and enemies stand here). */
export const LANE_Z: V2 = [-2.2, 2.2];
/** Foreground (blurred) props sit at or in front of this depth. */
export const FOREGROUND_MIN_Z = 5;
/** Mid-ground (sharp) props must stay behind this depth, or they cover the hero and the lens. */
export const MIDGROUND_MAX_Z = 5.6;

export type MoodTweak = Partial<Omit<BiomeMood, "ambient">> & {
  ambient?: BiomeMood["ambient"];
};

export interface SegmentDef {
  x0: number;
  x1: number;
  biome: LayoutBiome;
  mood: MoodTweak;
  /** Metres over which the mood crossfades into the next segment. */
  blend: number;
}

export interface StyleDef {
  tint?: V3;
  rim?: number;
  emis?: number;
  dark?: number;
  wrap?: number;
}

export interface PropLightDef {
  color: V3;
  intensity: number;
  radius: number;
  /** Offsets from the prop base. */
  dy: number;
  dz: number;
  scatter: number;
  flicker: boolean;
}

export interface PropDef extends StyleDef {
  key: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  flip: boolean;
  foreground: boolean;
  /** Flame size (0 = none): a torch flame + flickering light at the prop's flame attach point. */
  flame: number;
  /** Flame / torch-light colour (linear, near 1). Absent = the default torch orange. */
  flameColor?: V3;
  light?: PropLightDef;
}

export interface ScatterDef extends StyleDef {
  keys: readonly string[];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  spacing: V2;
  y: V2;
  scale: V2;
  flipRandom: boolean;
  seed: number;
  foreground: boolean;
  /** Skip placements closer than this to a battle camera centre (keeps enemies unobstructed). */
  avoidBattle: number;
  flame: number;
  flameColor?: V3;
  light?: PropLightDef;
  /** Probability (0..1) that a slot is left empty, for irregular rhythm. */
  gap: number;
}

export interface LightDef {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: V3;
  intensity: number;
  scatter: number;
  flicker: boolean;
}

export interface GodRayDef {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rotZ: number;
  color: V3;
  intensity: number;
}

export interface RayFieldDef {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
  spacing: V2;
  w: V2;
  h: number;
  rotZ: number;
  color: V3;
  /** Optional second colour used for rays beyond `colorFromX` (e.g. warmer toward the ruins). */
  color2?: V3;
  colorFromX?: number;
  intensity: V2;
  seed: number;
}

export interface RuneDef {
  x: number;
  z: number;
  size: number;
  intensity: number;
  /** Rune colour (linear HDR). Absent = the default cyan. */
  color?: V3;
}

export interface ZoneDef {
  kind: AmbientKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Particles per second inside the zone while the camera is within range. */
  density: number;
  y: V2;
}

export interface GroundDef {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** x range over which the ground dithers from forest dirt/grass to cave slabs. */
  caveFrom: number;
  caveTo: number;
  /** Ground look: forest/cave dither (default), `leaf` litter (hushwood) or `roots` arena (grove). */
  kind: GroundKind;
  /** World x/z the `roots` ground radiates from (the boss). */
  arena: V2;
}

export interface WallDef {
  x0: number;
  x1: number;
  /** Centre height. */
  cy: number;
  height: number;
  z: number;
  edgeX: number;
}

export interface BackdropDef {
  kind: BackdropKind;
  width: number;
  height: number;
  pos: V3;
  tint: V3;
  fogK: number;
  rep: number;
  follow: boolean;
}

export type AnchorKind = "start" | "end" | "hero" | "slot" | "boss" | "marker";

export interface AnchorDef {
  name: string;
  kind: AnchorKind;
  x: number;
  z: number;
  /** 1-based encounter index for hero/slot/boss anchors. */
  encounter?: number;
  slot?: number;
}

export interface EncounterDef {
  /** 1-based. */
  index: number;
  /** Enemy slots 0..slots-1 (named anchors `enc<i>.slot<n>`). */
  slots: number;
  /** Waves reuse the same slots. */
  waves: number;
  boss: boolean;
}

export interface CameraHint {
  name: string;
  x: number;
  y?: number;
  dist?: number;
  pitch?: number;
  fov?: number;
}

export interface LevelLayout {
  id: string;
  chapter: number;
  name: string;
  /** Short art-direction note (time of day / mood). */
  note: string;
  /** Primary biome (for UI and the default mood). */
  biome: LayoutBiome;
  /** Walkable length: start.x .. end.x. */
  segments: SegmentDef[];
  ground: GroundDef;
  wall?: WallDef;
  backdrops: BackdropDef[];
  props: PropDef[];
  scatters: ScatterDef[];
  lights: LightDef[];
  godRays: GodRayDef[];
  rayFields: RayFieldDef[];
  runes: RuneDef[];
  zones: ZoneDef[];
  anchors: AnchorDef[];
  encounters: EncounterDef[];
  walkPath: V2[];
  cameras: CameraHint[];
  /** Seed for scatter randomness not covered by a scatter's own seed. */
  seed: number;
}

// ------------------------------------------------------------------------------------------ zod

const num = z.number().finite();
const vec2 = z.tuple([num, num]);
const vec3 = z.tuple([num, num, num]);
const vec3pos = z.tuple([num.min(0), num.min(0), num.min(0)]);
const biomeEnum = z.enum(LAYOUT_BIOMES);

const MOOD_VEC3 = [
  "amb",
  "gamb",
  "sunCol",
  "sunDir",
  "fogCol",
  "fog",
  "lift",
  "gamma",
  "gain",
  "sh",
  "hi",
  "clear",
] as const;
const MOOD_NUM = [
  "scatter",
  "exposure",
  "sat",
  "contrast",
  "bloom",
  "thr",
  "vig",
  "rangeFar",
  "tilt",
  "bars",
  "caveK",
  "rays",
  "fill",
] as const;
const moodShape: Record<string, z.ZodType> = {
  ambient: z.enum(AMBIENT_MOOD_KINDS as [string, ...string[]]).optional(),
};
for (const k of MOOD_VEC3) moodShape[k] = vec3.optional();
for (const k of MOOD_NUM) moodShape[k] = num.optional();
const moodTweak = z.strictObject(moodShape);

const style = {
  tint: vec3pos.optional(),
  rim: num.optional(),
  emis: num.optional(),
  dark: num.min(0).max(1).optional(),
  wrap: num.optional(),
};

const propLight = z.strictObject({
  color: vec3pos,
  intensity: num.positive(),
  radius: num.positive(),
  dy: num.default(1.5),
  dz: num.default(1.5),
  scatter: num.min(0).default(0),
  flicker: z.boolean().default(false),
});

const FIELDS = {
  Level: z.strictObject({
    id: z.string().regex(/^ch\d+-l\d{2}$/),
    chapter: z.number().int().positive(),
    name: z.string().min(1),
    note: z.string().default(""),
    biome: biomeEnum,
    seed: z.number().int().default(1),
    xOrigin: num,
    zOrigin: num,
    encounters: z.array(
      z.strictObject({
        index: z.number().int().positive(),
        slots: z.number().int().min(1).max(5),
        waves: z.number().int().min(1).max(6).default(1),
        boss: z.boolean().default(false),
      }),
    ),
  }),
  Segment: z.strictObject({
    biome: biomeEnum,
    mood: moodTweak.default({}),
    blend: num.min(0).default(12),
  }),
  Ground: z.strictObject({
    caveFrom: num,
    caveTo: num,
    kind: z.enum(["forest", "leaf", "roots"]).default("forest"),
    arenaX: num.default(0),
    arenaZ: num.default(0),
  }),
  Wall: z.strictObject({ cy: num, height: num.positive(), z: num, edgeX: num }),
  Backdrop: z.strictObject({
    kind: z.enum(["sky", "mountains", "treeline", "skyNight", "mountainsNight", "treelineNight"]),
    width: num.positive(),
    height: num.positive(),
    pos: vec3,
    tint: vec3pos,
    fogK: num.min(0).max(1),
    rep: num.positive().default(1),
    follow: z.boolean().default(false),
  }),
  Prop: z.strictObject({
    key: z.string(),
    y: num.default(0),
    scale: num.positive().default(1),
    flip: z.boolean().default(false),
    foreground: z.boolean().default(false),
    flame: num.min(0).default(0),
    flameColor: vec3pos.optional(),
    light: propLight.optional(),
    ...style,
  }),
  Scatter: z.strictObject({
    keys: z.array(z.string()).min(1),
    spacing: vec2,
    y: vec2.default([0, 0]),
    scale: vec2.default([1, 1]),
    flipRandom: z.boolean().default(true),
    seed: z.number().int(),
    foreground: z.boolean().default(false),
    avoidBattle: num.min(0).default(0),
    flame: num.min(0).default(0),
    flameColor: vec3pos.optional(),
    light: propLight.optional(),
    gap: num.min(0).max(0.95).default(0),
    ...style,
  }),
  Light: z.strictObject({
    y: num,
    radius: num.positive(),
    color: vec3pos,
    intensity: num.positive(),
    scatter: num.min(0).default(0),
    flicker: z.boolean().default(false),
  }),
  GodRay: z.strictObject({
    y: num,
    w: num.positive(),
    h: num.positive(),
    rotZ: num,
    color: vec3pos,
    intensity: num.positive(),
  }),
  RayField: z.strictObject({
    y: num,
    spacing: vec2,
    w: vec2,
    h: num.positive(),
    rotZ: num,
    color: vec3pos,
    color2: vec3pos.optional(),
    colorFromX: num.optional(),
    intensity: vec2,
    seed: z.number().int(),
  }),
  Rune: z.strictObject({
    size: num.positive(),
    intensity: num.positive(),
    color: vec3pos.optional(),
  }),
  AmbientZone: z.strictObject({
    kind: z.enum(AMBIENT_KINDS),
    density: num.positive(),
    y: vec2.default([0.3, 5]),
  }),
  Anchor: z.strictObject({
    name: z.string().regex(/^[a-z0-9.]+$/),
    kind: z.enum(["start", "end", "hero", "slot", "boss", "marker"]),
    encounter: z.number().int().positive().optional(),
    slot: z.number().int().min(0).optional(),
  }),
  WalkPath: z.strictObject({ points: z.array(vec2).min(2) }),
  Camera: z.strictObject({
    name: z.string().regex(/^(walk|boss|battle:\d+)$/),
    y: num.optional(),
    dist: num.positive().optional(),
    pitch: num.optional(),
    fov: num.positive().optional(),
  }),
};

const fieldInstance = z.looseObject({ __identifier: z.string(), __value: z.unknown() });
const entityInstance = z.looseObject({
  __identifier: z.string(),
  px: vec2,
  width: num.default(16),
  height: num.default(16),
  fieldInstances: z.array(fieldInstance).default([]),
});
const layerInstance = z.looseObject({
  __identifier: z.string(),
  __type: z.string(),
  entityInstances: z.array(entityInstance).default([]),
});
const levelInstance = z.looseObject({
  identifier: z.string(),
  pxWid: num.positive(),
  pxHei: num.positive(),
  fieldInstances: z.array(fieldInstance).default([]),
  layerInstances: z.array(layerInstance).min(1),
});
export const ldtkFileSchema = z.looseObject({
  jsonVersion: z.string(),
  levels: z.array(levelInstance).length(1),
});

const PX_PER_M = 16;

function fieldsOf(
  list: readonly { __identifier: string; __value: unknown }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of list) out[f.__identifier] = f.__value;
  return out;
}

export class LayoutError extends Error {
  constructor(
    readonly levelId: string,
    message: string,
  ) {
    super(`[${levelId}] ${message}`);
    this.name = "LayoutError";
  }
}

function parseFields<K extends keyof typeof FIELDS>(
  kind: K,
  fields: Record<string, unknown>,
  where: string,
  levelId: string,
): z.output<(typeof FIELDS)[K]> {
  const r = FIELDS[kind].safeParse(fields);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new LayoutError(levelId, `${where}: ${msg}`);
  }
  return r.data as z.output<(typeof FIELDS)[K]>;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Validate raw JSON (LDtk subset) and convert to a world-space `LevelLayout`. Throws `LayoutError`. */
export function parseLevelLayout(raw: unknown): LevelLayout {
  const file = ldtkFileSchema.safeParse(raw);
  if (!file.success) {
    const msg = file.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new LayoutError("?", `not a valid LDtk-subset file: ${msg}`);
  }
  const lvl = file.data.levels[0];
  if (!lvl) throw new LayoutError("?", "no level");
  const head = parseFields("Level", fieldsOf(lvl.fieldInstances), "level fields", lvl.identifier);
  const id = head.id;
  if (lvl.identifier !== id)
    throw new LayoutError(id, `identifier "${lvl.identifier}" != field id`);

  const out: LevelLayout = {
    id,
    chapter: head.chapter,
    name: head.name,
    note: head.note,
    biome: head.biome,
    seed: head.seed,
    segments: [],
    ground: { x0: 0, x1: 0, z0: 0, z1: 0, caveFrom: 0, caveTo: 1, kind: "forest", arena: [0, 0] },
    backdrops: [],
    props: [],
    scatters: [],
    lights: [],
    godRays: [],
    rayFields: [],
    runes: [],
    zones: [],
    anchors: [],
    encounters: head.encounters.map((e) => ({ ...e })),
    walkPath: [],
    cameras: [],
  };
  let haveGround = false;
  let haveWalk = false;

  const layer = lvl.layerInstances.find((l) => l.__type === "Entities");
  if (!layer) throw new LayoutError(id, "no Entities layer");

  layer.entityInstances.forEach((e, n) => {
    const where = `entity #${n} ${e.__identifier}`;
    const kind = e.__identifier;
    if (!(kind in FIELDS) || kind === "Level")
      throw new LayoutError(id, `${where}: unknown entity type`);
    const f = fieldsOf(e.fieldInstances);
    const x0 = round(e.px[0] / PX_PER_M + head.xOrigin);
    const z0 = round(e.px[1] / PX_PER_M + head.zOrigin);
    const w = round(e.width / PX_PER_M);
    const d = round(e.height / PX_PER_M);
    switch (kind) {
      case "Segment": {
        const p = parseFields("Segment", f, where, id);
        out.segments.push({
          x0,
          x1: round(x0 + w),
          biome: p.biome,
          mood: p.mood as MoodTweak,
          blend: p.blend,
        });
        break;
      }
      case "Ground": {
        const p = parseFields("Ground", f, where, id);
        if (haveGround) throw new LayoutError(id, "more than one Ground");
        haveGround = true;
        out.ground = {
          x0,
          x1: round(x0 + w),
          z0,
          z1: round(z0 + d),
          caveFrom: p.caveFrom,
          caveTo: p.caveTo,
          kind: p.kind,
          arena: [p.arenaX, p.arenaZ],
        };
        break;
      }
      case "Wall": {
        const p = parseFields("Wall", f, where, id);
        out.wall = { x0, x1: round(x0 + w), cy: p.cy, height: p.height, z: p.z, edgeX: p.edgeX };
        break;
      }
      case "Backdrop": {
        const p = parseFields("Backdrop", f, where, id);
        out.backdrops.push(p as BackdropDef);
        break;
      }
      case "Prop": {
        const p = parseFields("Prop", f, where, id);
        const { light, ...rest } = p;
        out.props.push({ ...rest, x: x0, z: z0, ...(light ? { light } : {}) } as PropDef);
        break;
      }
      case "Scatter": {
        const p = parseFields("Scatter", f, where, id);
        const { light, ...rest } = p;
        out.scatters.push({
          ...rest,
          x0,
          x1: round(x0 + w),
          z0,
          z1: round(z0 + d),
          ...(light ? { light } : {}),
        } as ScatterDef);
        break;
      }
      case "Light": {
        const p = parseFields("Light", f, where, id);
        out.lights.push({ ...p, x: x0, z: z0 });
        break;
      }
      case "GodRay": {
        const p = parseFields("GodRay", f, where, id);
        out.godRays.push({ ...p, x: x0, z: z0 });
        break;
      }
      case "RayField": {
        const p = parseFields("RayField", f, where, id);
        out.rayFields.push({ ...p, x0, x1: round(x0 + w), z0, z1: round(z0 + d) } as RayFieldDef);
        break;
      }
      case "Rune": {
        const p = parseFields("Rune", f, where, id);
        out.runes.push({ ...p, x: x0, z: z0 });
        break;
      }
      case "AmbientZone": {
        const p = parseFields("AmbientZone", f, where, id);
        out.zones.push({ ...p, x0, x1: round(x0 + w), z0, z1: round(z0 + d) });
        break;
      }
      case "Anchor": {
        const p = parseFields("Anchor", f, where, id);
        out.anchors.push({
          name: p.name,
          kind: p.kind,
          x: x0,
          z: z0,
          ...(p.encounter !== undefined ? { encounter: p.encounter } : {}),
          ...(p.slot !== undefined ? { slot: p.slot } : {}),
        });
        break;
      }
      case "WalkPath": {
        const p = parseFields("WalkPath", f, where, id);
        if (haveWalk) throw new LayoutError(id, "more than one WalkPath");
        haveWalk = true;
        out.walkPath = p.points as V2[];
        break;
      }
      case "Camera": {
        const p = parseFields("Camera", f, where, id);
        out.cameras.push({ ...p, x: x0 });
        break;
      }
    }
  });

  validateLayout(out);
  return out;
}

// ------------------------------------------------------------------------------------------ semantic validation

export function slotAnchorName(encounter: number, slot: number): string {
  return `enc${encounter}.slot${slot}`;
}
export function heroAnchorName(encounter: number): string {
  return `enc${encounter}.hero`;
}
export function battleCameraName(encounter: number): string {
  return `battle:${encounter}`;
}

/** Cross-reference checks that zod alone can not express. Throws `LayoutError` on the first problem. */
export function validateLayout(l: LevelLayout): void {
  const bad = (m: string): never => {
    throw new LayoutError(l.id, m);
  };
  if (l.segments.length === 0) bad("needs at least one Segment");
  const segs = [...l.segments].sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1];
    const b = segs[i];
    if (a && b && b.x0 > a.x1 + 0.01) bad(`gap between segments at x=${a.x1}..${b.x0}`);
  }
  if (!(l.ground.x1 > l.ground.x0)) bad("missing Ground");
  if (l.walkPath.length < 2) bad("missing WalkPath");
  const names = new Set<string>();
  for (const a of l.anchors) {
    if (names.has(a.name)) bad(`duplicate anchor ${a.name}`);
    names.add(a.name);
  }
  for (const need of ["start", "end"]) if (!names.has(need)) bad(`missing anchor "${need}"`);
  const sorted = [...l.encounters].sort((a, b) => a.index - b.index);
  sorted.forEach((e, i) => {
    if (e.index !== i + 1) bad(`encounter indices must be 1..n (got ${e.index} at position ${i})`);
  });
  const camNames = new Set(l.cameras.map((c) => c.name));
  if (!camNames.has("walk")) bad("missing Camera walk");
  for (const e of l.encounters) {
    if (!names.has(heroAnchorName(e.index))) bad(`missing anchor ${heroAnchorName(e.index)}`);
    for (let s = 0; s < e.slots; s++) {
      if (!names.has(slotAnchorName(e.index, s)))
        bad(`missing anchor ${slotAnchorName(e.index, s)}`);
    }
    if (!camNames.has(battleCameraName(e.index)))
      bad(`missing Camera ${battleCameraName(e.index)}`);
    if (e.boss && !camNames.has("boss")) bad("boss encounter needs Camera boss");
  }
  // walk path is monotonic in x and spans start..end
  for (let i = 1; i < l.walkPath.length; i++) {
    const a = l.walkPath[i - 1];
    const b = l.walkPath[i];
    if (a && b && b[0] <= a[0]) bad("WalkPath x must strictly increase");
  }
  // lane rule: ground props and scatters stay out of the hero lane
  const inLane = (z: number): boolean => z > LANE_Z[0] && z < LANE_Z[1];
  for (const p of l.props) {
    if (!p.foreground && p.y < 6 && inLane(p.z))
      bad(`prop ${p.key} at x=${p.x} z=${p.z} stands in the hero lane`);
    if (p.foreground && p.z < FOREGROUND_MIN_Z)
      bad(`foreground prop ${p.key} too far back (z=${p.z})`);
    if (!p.foreground && p.z > MIDGROUND_MAX_Z)
      bad(`prop ${p.key} too close to the lens (z=${p.z}) without foreground`);
  }
  for (const s of l.scatters) {
    if (s.x1 <= s.x0) bad("scatter with empty x range");
    if (s.spacing[0] <= 0.2 || s.spacing[1] < s.spacing[0]) bad("scatter spacing invalid");
    if (s.foreground) {
      if (s.z0 < FOREGROUND_MIN_Z) bad("foreground scatter too far back");
    } else if (s.z1 > MIDGROUND_MAX_Z) {
      bad(`scatter ${s.keys[0]} too close to the lens (z1=${s.z1}) without foreground`);
    } else if (s.z0 < LANE_Z[1] && s.z1 > LANE_Z[0] && s.y[1] < 6) {
      bad(`scatter ${s.keys[0]} overlaps the hero lane (z ${s.z0}..${s.z1})`);
    }
  }
}

// ------------------------------------------------------------------------------------------ helpers

export function anchorMap(l: LevelLayout): Map<string, AnchorDef> {
  return new Map(l.anchors.map((a) => [a.name, a]));
}

/** Camera pose for a hint, falling back to the pose presets for omitted fields. */
export function resolveCamera(h: CameraHint, base: Readonly<Omit<CameraPose, "x">>): CameraPose {
  return {
    x: h.x,
    y: h.y ?? base.y,
    dist: h.dist ?? base.dist,
    pitch: h.pitch ?? base.pitch,
    fov: h.fov ?? base.fov,
  };
}

/** A stable string describing a level's prop composition (used to prove two levels differ). */
export function propSignature(l: LevelLayout): string {
  const counts = new Map<string, number>();
  const bump = (k: string, n: number): void => void counts.set(k, (counts.get(k) ?? 0) + n);
  for (const p of l.props) bump(`${p.foreground ? "fg:" : ""}${p.key}`, 1);
  for (const s of l.scatters) {
    const per = Math.max(
      1,
      Math.round(((s.x1 - s.x0) / ((s.spacing[0] + s.spacing[1]) / 2)) * (1 - s.gap)),
    );
    for (const k of s.keys) bump(`${s.foreground ? "fg:" : ""}${k}`, per / s.keys.length);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${Math.round(v)}`)
    .join(",");
}

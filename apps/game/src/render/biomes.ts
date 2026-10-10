/**
 * Per-biome mood presets (lighting, fog, grade, post). Values are taken from the POC v2 `BIOME` table.
 * Pure data + helpers (no three.js) so it can be validated in unit tests.
 */
import { lerp, type Vec3Tuple } from "./util";

export type BiomeId = "forest" | "ruins" | "cave" | "boss" | "hushwood" | "fen" | "grove";

/** Ambient particle flavours the `AmbientDirector` knows. */
export type AmbientKind = "pollen" | "embers" | "none" | "wisps" | "fireflies" | "leaves";
export const AMBIENT_MOOD_KINDS: readonly AmbientKind[] = [
  "pollen",
  "embers",
  "none",
  "wisps",
  "fireflies",
  "leaves",
];

export interface BiomeMood {
  /** Sky-side ambient colour (linear). */
  amb: Vec3Tuple;
  /** Ground-bounce ambient colour. */
  gamb: Vec3Tuple;
  sunCol: Vec3Tuple;
  sunDir: Vec3Tuple;
  fogCol: Vec3Tuple;
  /** [density, start distance, height falloff]. */
  fog: Vec3Tuple;
  /** Strength of the analytic point-light in-scatter glow. */
  scatter: number;
  exposure: number;
  lift: Vec3Tuple;
  gamma: Vec3Tuple;
  gain: Vec3Tuple;
  sat: number;
  contrast: number;
  /** Shadow tint added in the darks. */
  sh: Vec3Tuple;
  /** Highlight tint added in the lights. */
  hi: Vec3Tuple;
  bloom: number;
  /** Bloom brightness threshold. */
  thr: number;
  vig: number;
  /** DOF far range (world units beyond the focus plane for full blur). */
  rangeFar: number;
  /** Tilt-shift strength (blur toward top/bottom of the frame). */
  tilt: number;
  /** Clear colour. */
  clear: Vec3Tuple;
  /** Letterbox bar height, as a fraction of screen height per bar (0 = none). */
  bars: number;
  /** 0 = forest dirt/grass look, 1 = cave stone look. Drives sky-fill light and ambient flavour. */
  caveK: number;
  /** God-ray intensity multiplier. */
  rays: number;
  /** Strength of the warm fill light that follows the camera (lifts the foreground). */
  fill: number;
  /** Ambient particle flavour. */
  ambient: AmbientKind;
}

const forest: BiomeMood = {
  amb: [0.4, 0.47, 0.6],
  gamb: [0.2, 0.19, 0.15],
  sunCol: [1.75, 1.5, 1.08],
  sunDir: [-0.42, 0.8, 0.44],
  fogCol: [0.6, 0.66, 0.62],
  fog: [0.011, 15, 0.22],
  scatter: 0.55,
  exposure: 1.0,
  lift: [0.02, 0.016, 0.03],
  gamma: [1, 1, 1],
  gain: [1.04, 1.0, 0.93],
  sat: 1.12,
  contrast: 1.06,
  sh: [0.0, 0.01, 0.028],
  hi: [0.03, 0.02, 0.0],
  bloom: 0.4,
  thr: 1.1,
  vig: 0.42,
  rangeFar: 15,
  tilt: 0.2,
  clear: [0.6, 0.66, 0.62],
  bars: 0,
  caveK: 0,
  rays: 1,
  fill: 0,
  ambient: "pollen",
};

const ruins: BiomeMood = {
  amb: [0.3, 0.29, 0.42],
  gamb: [0.2, 0.14, 0.12],
  sunCol: [1.45, 0.78, 0.42],
  sunDir: [-0.75, 0.42, 0.5],
  fogCol: [0.56, 0.4, 0.36],
  fog: [0.014, 13, 0.25],
  scatter: 0.8,
  exposure: 1.05,
  lift: [0.02, 0.01, 0.035],
  gamma: [1, 1, 1.02],
  gain: [1.08, 0.98, 0.87],
  sat: 1.16,
  contrast: 1.08,
  sh: [0.01, 0.0, 0.04],
  hi: [0.04, 0.015, 0.0],
  bloom: 0.5,
  thr: 1.0,
  vig: 0.48,
  rangeFar: 15,
  tilt: 0.22,
  clear: [0.56, 0.4, 0.36],
  bars: 0,
  caveK: 0,
  rays: 0.6,
  fill: 0.2,
  ambient: "pollen",
};

const cave: BiomeMood = {
  amb: [0.05, 0.062, 0.095],
  gamb: [0.03, 0.026, 0.028],
  sunCol: [0, 0, 0],
  sunDir: [0, 1, 0],
  fogCol: [0.018, 0.016, 0.022],
  fog: [0.03, 12, 0.35],
  scatter: 1.0,
  exposure: 1.3,
  lift: [0.012, 0.01, 0.022],
  gamma: [1, 1, 1.03],
  gain: [1.07, 1.0, 0.9],
  sat: 1.2,
  contrast: 1.13,
  sh: [0.0, 0.01, 0.03],
  hi: [0.045, 0.016, 0.0],
  bloom: 0.6,
  thr: 0.95,
  vig: 0.6,
  rangeFar: 15,
  tilt: 0.24,
  clear: [0.018, 0.016, 0.022],
  bars: 0,
  caveK: 1,
  rays: 0,
  fill: 0.75,
  ambient: "embers",
};

/** Boss hollow: the cave mood plus the cinematic letterbox the POC uses on the boss intro. */
const boss: BiomeMood = { ...cave, bars: 0.1 };

/**
 * Ch2 moods (C0.2 brief section 1.1, values pasted from docs/vfx/ch2-mock/src/moods.ts). Cool moonlight
 * with warm lantern pools; violet is reserved for the Silence and never appears in the fog.
 */
const hushwood: BiomeMood = {
  amb: [0.13, 0.16, 0.3],
  gamb: [0.05, 0.058, 0.075],
  sunCol: [0.5, 0.62, 1.0],
  sunDir: [-0.55, 0.72, -0.12],
  fogCol: [0.045, 0.062, 0.12],
  fog: [0.018, 14, 0.32],
  scatter: 0.9,
  exposure: 1.45,
  lift: [0.008, 0.012, 0.032],
  gamma: [1, 1, 1.02],
  gain: [0.97, 1.0, 1.08],
  sat: 1.12,
  contrast: 1.15,
  sh: [0.0, 0.012, 0.045],
  hi: [0.045, 0.024, 0.0],
  bloom: 0.62,
  thr: 0.9,
  vig: 0.52,
  rangeFar: 13,
  tilt: 0.24,
  clear: [0.045, 0.062, 0.12],
  bars: 0,
  caveK: 0.45,
  rays: 1.1,
  fill: 0.8,
  ambient: "wisps",
};

/** Fen (the Reedmaze): a last dusk light low behind a fog bank; green-gold mids, teal shadows, black-green still water. */
const fen: BiomeMood = {
  amb: [0.19, 0.21, 0.25],
  gamb: [0.06, 0.065, 0.04],
  sunCol: [1.1, 0.8, 0.4],
  sunDir: [0.62, 0.36, -0.5],
  fogCol: [0.2, 0.23, 0.13],
  fog: [0.022, 9, 0.5],
  scatter: 0.9,
  exposure: 1.12,
  lift: [0.01, 0.014, 0.014],
  gamma: [1, 1, 1],
  gain: [1.04, 1.0, 0.86],
  sat: 1.16,
  contrast: 1.13,
  sh: [0.0, 0.02, 0.035],
  hi: [0.05, 0.032, 0.0],
  bloom: 0.55,
  thr: 0.95,
  vig: 0.5,
  rangeFar: 12,
  tilt: 0.24,
  clear: [0.2, 0.23, 0.13],
  bars: 0,
  caveK: 0.3,
  rays: 1.0,
  fill: 0.55,
  ambient: "fireflies",
};

/** Grove (the Willow's Heart, boss): the hushwood split-tone one notch darker. Bars only on the intro. */
const grove: BiomeMood = {
  amb: [0.08, 0.11, 0.2],
  gamb: [0.04, 0.04, 0.06],
  sunCol: [0.45, 0.62, 1.0],
  sunDir: [0.12, 0.92, -0.3],
  fogCol: [0.03, 0.055, 0.1],
  fog: [0.02, 12, 0.32],
  scatter: 1.0,
  exposure: 1.35,
  lift: [0.008, 0.01, 0.03],
  gamma: [1, 1, 1.02],
  gain: [0.98, 1.0, 1.06],
  sat: 1.15,
  contrast: 1.14,
  sh: [0.0, 0.012, 0.05],
  hi: [0.045, 0.026, 0.0],
  bloom: 0.66,
  thr: 0.88,
  vig: 0.56,
  rangeFar: 13,
  tilt: 0.26,
  clear: [0.03, 0.055, 0.1],
  bars: 0.1,
  caveK: 0.6,
  rays: 1.2,
  fill: 0.6,
  ambient: "leaves",
};

export const BIOMES: Readonly<Record<BiomeId, BiomeMood>> = {
  forest,
  ruins,
  cave,
  boss,
  hushwood,
  fen,
  grove,
};
export const BIOME_IDS: readonly BiomeId[] = [
  "forest",
  "ruins",
  "cave",
  "boss",
  "hushwood",
  "fen",
  "grove",
];

export function isBiomeId(v: unknown): v is BiomeId {
  return typeof v === "string" && (BIOME_IDS as readonly string[]).includes(v);
}

const VEC3_KEYS = [
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
const NUM_KEYS = [
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

/** Returns a list of human-readable problems with a mood (empty = valid). */
export function validateMood(m: BiomeMood): string[] {
  const errs: string[] = [];
  for (const k of VEC3_KEYS) {
    const v = m[k];
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => !Number.isFinite(x))) {
      errs.push(`${k}: expected 3 finite numbers`);
    } else if (k !== "sunDir" && v.some((x) => x < 0)) {
      errs.push(`${k}: negative component`);
    }
  }
  for (const k of NUM_KEYS) {
    if (!Number.isFinite(m[k])) errs.push(`${k}: not finite`);
  }
  if (m.exposure <= 0) errs.push("exposure must be > 0");
  if (m.sat < 0 || m.sat > 3) errs.push("sat out of range 0..3");
  if (m.vig < 0 || m.vig > 1) errs.push("vig out of range 0..1");
  if (m.bars < 0 || m.bars > 0.5) errs.push("bars out of range 0..0.5");
  if (m.caveK < 0 || m.caveK > 1) errs.push("caveK out of range 0..1");
  if (m.thr <= 0) errs.push("thr must be > 0");
  const sd = m.sunDir;
  if (Math.hypot(sd[0], sd[1], sd[2]) < 1e-6) errs.push("sunDir has zero length");
  if (!AMBIENT_MOOD_KINDS.includes(m.ambient)) {
    errs.push("ambient: unknown kind");
  }
  return errs;
}

const mixV = (a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Linear blend between two moods (t = 0 gives a, t = 1 gives b). Used for biome crossfades. */
export function blendMood(a: BiomeMood, b: BiomeMood, t: number): BiomeMood {
  const out: BiomeMood = { ...b };
  for (const k of VEC3_KEYS) out[k] = mixV(a[k], b[k], t);
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], t);
  out.ambient = t < 0.5 ? a.ambient : b.ambient;
  return out;
}

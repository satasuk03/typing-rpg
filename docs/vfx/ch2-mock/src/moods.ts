/**
 * Ch2 mood proposals (C0.2). Same shape as `apps/game/src/render/biomes.ts` `BiomeMood`, so T2.1 can paste
 * them. Values are LINEAR (like biomes.ts). `ambient` stays "none": the mock spawns its own wisps / fireflies /
 * leaves (T2.1 adds `"wisps" | "fireflies" | "leaves"` to the union, see the brief §1.5).
 */
import type { BiomeMood } from "../../../../apps/game/src/render/biomes";

export const hushwood: BiomeMood = {
  amb: [0.13, 0.16, 0.3],
  gamb: [0.05, 0.058, 0.075],
  sunCol: [0.5, 0.62, 1.0], // the moon: cool key from upper left, slightly behind
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
  ambient: "none",
};

export const fen: BiomeMood = {
  amb: [0.19, 0.21, 0.25],
  gamb: [0.06, 0.065, 0.04],
  sunCol: [1.1, 0.8, 0.4], // last dusk light, low and behind the fog bank
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
  ambient: "none",
};

export const grove: BiomeMood = {
  amb: [0.08, 0.11, 0.2],
  gamb: [0.04, 0.04, 0.06],
  sunCol: [0.45, 0.62, 1.0], // the moon straight above the willow
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
  ambient: "none",
};

export const MOODS = { hushwood, fen, grove } as const;
export type MoodId = keyof typeof MOODS;

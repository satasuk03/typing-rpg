/**
 * T2.3 combat VFX parameters: every number the combat effects need, in one place. Pure data and pure functions
 * (no DOM, no three.js), so the unit tests can pin them. Colours are linear HDR (values above 1 bloom).
 */
import type { ActiveSkillId, ChestTier, StatusId } from "@hd2d/sim";

export type Rgb = [number, number, number];

// ---------------------------------------------------------------------------------------------- intensity

export interface CombatScale {
  /** effectsIntensity 0..1. */
  k: number;
  /** World quality multiplier (WORLD_Q). */
  q: number;
  reducedFlash: boolean;
  reducedMotion: boolean;
}

/** Particle count for a base count: x k x q, rounded, never below 1 while k > 0 (and 0 at k = 0). */
export function scaled(base: number, s: CombatScale): number {
  if (s.k <= 0 || base <= 0) return 0;
  return Math.max(1, Math.round(base * s.k * s.q));
}

/** Glow / quad alpha: x (0.5 + 0.5 k), halved again under reduced flash for the bright flashes. */
export function glowK(s: CombatScale, flash = false): number {
  if (s.k <= 0) return 0;
  return (0.5 + 0.5 * s.k) * (flash && s.reducedFlash ? 0.5 : 1);
}

/** Camera shake / punch / hit-stop strength after the accessibility settings (0 = skip). */
export function motionK(s: { effectsIntensity: number; reducedMotion: boolean }): number {
  return s.reducedMotion ? 0 : s.effectsIntensity;
}

// ---------------------------------------------------------------------------------------------- weapons

export type Archetype = "sword" | "dagger" | "staff" | "hammer";

export interface ArcSpec {
  r: number;
  w: number;
  a0: number;
  sweep: number;
  rx: number;
  ry: number;
  rz: number;
  dur: number;
  tail: number;
}

/** Sword: the POC's three sweeping arcs, by hit index. */
export const SWORD_ARCS: readonly ArcSpec[] = [
  { r: 1, w: 0.6, a0: 2.3, sweep: -3.4, rx: -0.55, ry: 0.25, rz: -0.25, dur: 0.08, tail: 0.24 },
  { r: 1, w: 0.6, a0: -2.3, sweep: 3.2, rx: 0.5, ry: 0.25, rz: 0.35, dur: 0.08, tail: 0.24 },
  { r: 1, w: 0.6, a0: 1.4, sweep: -3.6, rx: -0.2, ry: 0.25, rz: 0.9, dur: 0.08, tail: 0.24 },
];
/** Dagger: two thin fast flicks that cross like an X; further hits alternate. */
export const DAGGER_ARCS: readonly ArcSpec[] = [
  { r: 0.85, w: 0.26, a0: 2.5, sweep: -2.6, rx: -0.4, ry: 0.2, rz: -0.55, dur: 0.05, tail: 0.15 },
  { r: 0.85, w: 0.26, a0: -2.5, sweep: 2.6, rx: 0.4, ry: 0.2, rz: 0.55, dur: 0.05, tail: 0.15 },
];
/** Hammer: a heavy overhead crescent (the slam adds the ground crack). */
export const HAMMER_ARC: ArcSpec = {
  r: 1,
  w: 0.95,
  a0: 2.9,
  sweep: -2.7,
  rx: -0.2,
  ry: 0.1,
  rz: 1.55,
  dur: 0.1,
  tail: 0.3,
};

export function arcFor(archetype: Archetype, hitIndex: number): ArcSpec | null {
  switch (archetype) {
    case "sword":
      return SWORD_ARCS[hitIndex % SWORD_ARCS.length] ?? null;
    case "dagger":
      return DAGGER_ARCS[hitIndex % DAGGER_ARCS.length] ?? null;
    case "hammer":
      return HAMMER_ARC;
    case "staff":
      return null; // a bolt, not an arc
  }
}

export interface ArcCol {
  core: Rgb;
  edge: Rgb;
}
export const ARC_COL = {
  slash: { core: [2.8, 2.9, 3.2], edge: [1.0, 1.7, 3.0] },
  /** The POC picks a warm edge in the cave so the arc does not fade into the blue crystals. */
  slashWarm: { core: [3.4, 3.2, 2.6], edge: [3.2, 1.3, 0.3] },
  crit: { core: [4, 3.6, 2.6], edge: [3.2, 1.3, 0.3] },
  dagger: { core: [2.6, 3.2, 3.0], edge: [0.5, 2.0, 1.6] },
  hammer: { core: [3.4, 2.6, 1.8], edge: [2.4, 1.0, 0.3] },
  wave: { core: [3.2, 3.6, 4.4], edge: [0.9, 1.8, 3.8] },
  claw: { core: [3.6, 1.2, 0.8], edge: [2.6, 0.35, 0.12] },
  gold: { core: [4, 3.4, 1.8], edge: [3, 1.8, 0.4] },
} satisfies Record<string, ArcCol>;

export const STAFF_BOLT: Rgb = [1.7, 0.9, 3.4];
export const FIRE_HOT: Rgb = [4, 1.4, 0.3];
export const SPARK_WHITE: Rgb = [3.2, 2.6, 1.8];
export const SPARK_CRIT: Rgb = [4, 3.2, 1.4];
export const ICE: Rgb = [1.2, 2.4, 3.6];
export const SHARD_BLUE: Rgb = [1.6, 2.4, 3.6];
export const WEAK_PINK: Rgb = [3.2, 0.9, 2.4];
export const WARN_RED: Rgb = [2.6, 0.45, 0.25];
export const HEAL_GREEN: Rgb = [0.9, 2.8, 1.5];
export const GUARD_STEEL: Rgb = [2.8, 2.6, 2.0];

// ---------------------------------------------------------------------------------------------- skills

export interface SkillStyle {
  core: Rgb;
  edge: Rgb;
  /** Light colour (plain linear). */
  light: Rgb;
  /** Hero cast-up swirl colour. */
  swirl: Rgb;
}

export const SKILL_STYLE: Readonly<Record<ActiveSkillId, SkillStyle>> = {
  fireball: {
    core: [4, 1.6, 0.35],
    edge: [3.2, 1.0, 0.2],
    light: [1, 0.55, 0.2],
    swirl: [4, 1.6, 0.4],
  },
  slashWave: {
    core: [3.2, 3.6, 4.4],
    edge: [0.9, 1.8, 3.8],
    light: [0.6, 0.8, 1],
    swirl: [1.4, 2.4, 4],
  },
  piercingThrust: {
    core: [3.4, 3.4, 3.8],
    edge: [2.0, 2.4, 3.6],
    light: [0.9, 0.95, 1],
    swirl: [2.2, 2.6, 3.6],
  },
  frostLock: {
    core: [2.4, 3.6, 4.4],
    edge: [0.8, 1.8, 3.6],
    light: [0.5, 0.85, 1],
    swirl: [1.4, 2.8, 4],
  },
  mendingLight: {
    core: [2.6, 3.6, 2.0],
    edge: [1.2, 2.8, 1.4],
    light: [0.6, 1, 0.55],
    swirl: [1.4, 3, 1.6],
  },
  aegis: {
    core: [3.2, 3.0, 2.2],
    edge: [2.4, 2.4, 3.4],
    light: [0.7, 0.8, 1],
    swirl: [2.4, 2.6, 3.8],
  },
  // v2.0.3 Reveal: no impact body (it deals no damage); only the generic hero cast-up swirl, in pale gold
  reveal: {
    core: [3.4, 3.2, 1.8],
    edge: [2.6, 2.2, 1.0],
    light: [1, 0.9, 0.55],
    swirl: [3.2, 2.8, 1.4],
  },
};

/** Persistent status markers (read from the view every frame). */
export interface StatusStyle {
  /** Particles per second at k = q = 1. */
  rate: number;
  col: Rgb;
}
export const STATUS_STYLE: Readonly<Partial<Record<StatusId, StatusStyle>>> = {
  burn: { rate: 16, col: [3.4, 1.3, 0.3] },
  bleed: { rate: 9, col: [2.4, 0.18, 0.2] },
  stagger: { rate: 36, col: [3.4, 3, 1] },
  freeze: { rate: 5, col: [1.2, 2.6, 3.8] },
};

// ---------------------------------------------------------------------------------------------- rewards

export interface ChestStyle {
  /** Beam colours (outer glow, hot core) and intensities of the two layers. */
  beamCol: Rgb;
  beamCore: Rgb;
  beam: number;
  halo: number;
  /** Beam width (world units). */
  width: number;
  /** Rising motes and the opening burst. */
  motes: number;
  burst: number;
  /** Held light colour and peak intensity. */
  light: Rgb;
  lightPeak: number;
  /** Ground rune circle (Mythic) and extra god-rays (Gold, Mythic). */
  rune: boolean;
  rays: boolean;
  /** Hue-cycling motes (Mythic). */
  prism: boolean;
  coins: number;
}

export const CHEST_STYLE: Readonly<Record<ChestTier, ChestStyle>> = {
  Wooden: {
    beamCol: [1.0, 0.62, 0.3],
    beamCore: [1.8, 1.3, 0.8],
    beam: 0.2,
    halo: 0.07,
    width: 1.3,
    motes: 8,
    burst: 14,
    light: [1, 0.72, 0.4],
    lightPeak: 1.8,
    rune: false,
    rays: false,
    prism: false,
    coins: 6,
  },
  Iron: {
    beamCol: [0.55, 0.8, 1.3],
    beamCore: [1.8, 2.4, 3.2],
    beam: 0.3,
    halo: 0.1,
    width: 1.6,
    motes: 16,
    burst: 26,
    light: [0.7, 0.85, 1],
    lightPeak: 2.4,
    rune: false,
    rays: false,
    prism: false,
    coins: 12,
  },
  Gold: {
    beamCol: [1.6, 1.1, 0.4],
    beamCore: [3.4, 2.8, 1.6],
    beam: 0.42,
    halo: 0.16,
    width: 2.0,
    motes: 30,
    burst: 70,
    light: [1, 0.8, 0.4],
    lightPeak: 3.2,
    rune: false,
    rays: true,
    prism: false,
    coins: 24,
  },
  Mythic: {
    beamCol: [1.5, 0.6, 2.3],
    beamCore: [3.4, 2.0, 3.6],
    beam: 0.5,
    halo: 0.22,
    width: 2.4,
    motes: 44,
    burst: 100,
    light: [0.85, 0.5, 1],
    lightPeak: 4.2,
    rune: true,
    rays: true,
    prism: true,
    coins: 36,
  },
};

/** Coins for a gold amount: 14 + amount/7, capped at 72 (a passive pickup is small). T6.3: was 6 + amount/12, cap 40. */
export function coinCount(amount: number, source: "encounter" | "passive"): number {
  const n = Math.min(72, 14 + Math.floor(amount / 7));
  return source === "passive" ? Math.max(3, Math.floor(n / 3)) : n;
}

// ---------------------------------------------------------------------------------------------- death

/** Dissolve particle budget by enemy size: boss > big > small. */
export function dissolveCount(isBoss: boolean, scale: number): number {
  return Math.round(Math.min(isBoss ? 170 : 110, 70 * scale + (isBoss ? 60 : 0)));
}

// ---------------------------------------------------------------------------------------------- easing

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const eOut3 = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const eIn2 = (t: number): number => clamp01(t) * clamp01(t);
export const easeOutBack = (t: number, s = 1.70158): number => {
  const u = clamp01(t) - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};

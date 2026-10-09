/**
 * T2.6 typing VFX parameters: every number of docs/vfx/typing-vfx-spec.md that Chunk A (and the
 * shared parts of B/C) needs, in one place. Design px unless a name says otherwise.
 * Pure data and pure functions: no DOM, no three.js.
 */

export type DamageElement = "slash" | "pierce" | "blunt" | "arcane" | "fire" | "ice" | "light";
export const ELEMENTS: readonly DamageElement[] = [
  "slash",
  "pierce",
  "blunt",
  "arcane",
  "fire",
  "ice",
  "light",
];
export const ELEMENT_HEX: readonly string[] = [
  "#ffe6a8",
  "#c8f0ff",
  "#ffb070",
  "#c89bff",
  "#ff7a2a",
  "#8fe8ff",
  "#fff6c0",
];
export function elementIndex(e: string | undefined): number {
  const i = ELEMENTS.indexOf(e as DamageElement);
  return i < 0 ? 0 : i;
}

// ---- easing (pure, allocation-free)
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t * t * t;
export const easeInQuad = (t: number): number => t * t;
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);
export const easeOutBack = (t: number, s = 1.70158): number => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Palette (§3.1). Tier 4 is a hue cycle; PRISM_BUCKETS are its 12 pre-built stops. */
export const TIER_ACCENT_HEX = ["#ffffff", "#ffd24a", "#ff8a3c", "#5cc8ff", "#ff7ad9"] as const;
export const TIER_BORDER_HEX = ["#b8955a", "#ffd24a", "#ff8a3c", "#5cc8ff", "#ff7ad9"] as const;
export const TIER_TYPED_HEX = ["#ffcf4a", "#ffd84a", "#ffa04a", "#8cdcff", "#ff7ad9"] as const;
export const TIER_TYPED_GLOW_PX = [6, 6, 7, 8, 9] as const;
export const TIER_BORDER_GLOW_PX = [0, 6, 10, 14, 16] as const;

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
/** 12 hue buckets (every 30 degrees), HSL S 100% L 76%. */
export const PRISM_BUCKETS: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  hslToHex(i * 30, 1, 0.76),
);
export const FIXED_PRISM_HEX = "#ff7ad9";

/** Per-tier numbers, index = key-streak tier 0..4. */
export const STREAK_STYLE = {
  sparks: [5, 7, 9, 11, 14],
  trailPx: [40, 60, 90, 120, 160],
  streakMs: [240, 225, 220, 205, 200],
  headPx: [14, 15, 17, 19, 22],
  embersPerSec: [0, 3, 8, 14, 20],
  backGlowAlpha: [0, 0.1, 0.16, 0.22, 0.28],
  bounceAmp: [2, 2.5, 3, 3.5, 4],
  auraLevel: [0, 0.25, 0.5, 0.75, 1.0],
} as const;

/** §2.1 letter pop keyframes (ms). Glow px is the tier-accent glow; the last key is the resting 6 px. */
export const POP = {
  t: [0, 40, 90, 140, 200],
  scale: [1.35, 1.18, 0.97, 1.02, 1.0],
  white: [1, 1, 0.45, 0.15, 0],
  glow: [16, 14, 10, 7, 6],
  lift: [3, 2, 0, 0, 0],
  sentenceExcess: 0.7,
  reducedFlashWhiteCap: 0.35,
} as const;

/** §4 speed feedback. */
export const SPEED = {
  burstRect: (W: number) => ({ x: W - 252, y: 300, w: 232, h: 52 }),
  plateW: 196,
  plateH: 44,
  skewDeg: 12,
  enterMs: 140,
  fadeInMs: 80,
  holdMs: 950,
  exitMs: 220,
  heat: { swift: 0.6, blazing: 1.0 },
  heatDecaySec: 4,
  heatKeyTopUp: 0.02,
  typoDecayMult: 3,
  edgePx: 80,
  edgeAlpha: 0.22,
  edgeAlphaReducedFlash: 0.12,
  lines: 8,
  lineAlpha: 0.35,
  swiftHex: "#5cc8ff",
  blazeHex: "#ff7a2a",
} as const;

/** §6 typo. */
export const TYPO = {
  red: "#ff5a4a",
  /** Guard plates are red: their typo cue is white-cyan. */
  guardCue: "#e6fbff",
  amber: "#ffb347",
  holdMs: 120,
  fadeMs: 180,
  amberMs: 200,
  jitter: [2, -2, 1],
  jitterStepMs: 40,
  splitMs: 80,
  shake: { mag: 3, sec: 0.18 },
  guardShake: { mag: 5, sec: 0.26 },
  vignette: 0.25,
  guardVignette: 0.35,
  strayVignette: 0.12,
  crackSec: 1.2,
  maxCracks: 3,
} as const;

/** §3.3 tier-up timeline. */
export const TIER_UP = {
  noteMs: 50,
  glintLifeMs: 220,
  ringMs: 420,
  fadeMs: 250,
  flashWhiteMs: 60,
  flashLerpMs: 260,
} as const;

/** §10.4 quality scaling of counts. */
export const QUALITY_Q = [1.0, 0.8, 0.55] as const;
export const QUALITY_TRAIL_SAMPLES = [6, 5, 4] as const;

/** Pool capacities (§10.2). */
export const POOL_CAP = { sparks: 320, streaks: 12, embers: 64, rings: 12 } as const;

/** §10.5 k-scaling helpers. */
export type IntensityRule = "linear" | "glowRadius" | "alpha";
export function applyIntensity(base: number, k: number, rule: IntensityRule = "linear"): number {
  return rule === "glowRadius" ? base * (0.5 + 0.5 * k) : base * k;
}

/** Weapon socket offsets per archetype (Chunk B uses them; kept here so the table is single-sourced). */
export const WEAPON_ANCHOR_OFFSET: Record<string, { x: number; y: number }> = {
  sword: { x: 0.55, y: 0.65 },
  dagger: { x: 0.35, y: 0.8 },
  staff: { x: 0.3, y: 1.55 },
  hammer: { x: 0.4, y: 1.25 },
};

/**
 * §5.1 word-complete timeline (ms from `WordCompleted`). The HUD shatter and the world blade charge share
 * it, so the fragments arrive at the weapon exactly when the blade glow fills.
 */
export const WORD = {
  /** Burst phase: fragments jump out. */
  burstMs: 70,
  /** Converge phase length per fragment. */
  convergeMs: 140,
  /** Per-fragment stagger and its cap (fragments beyond 48 do not stagger further). */
  staggerMs: 8,
  staggerMax: 48,
  /** Sentence plates sample at most this many letters. */
  maxFragments: 24,
  /** Strike beam after the last arrival. */
  strikeMs: 80,
  /** Presentation delay of `Hit{chip}` (spec §5.4). */
  chipDelayMs: 380,
} as const;

/** Arrival time (s) of fragment `i` (0-based) at the weapon. */
export function fragmentArrivalSec(i: number): number {
  return (WORD.burstMs + WORD.convergeMs + WORD.staggerMs * Math.min(i, WORD.staggerMax)) / 1000;
}

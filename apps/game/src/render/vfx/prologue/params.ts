/**
 * Prologue VFX numbers (P3.2): every colour, timing and count of `docs/vfx/prologue-art-direction.md` §3, as pure data and pure
 * functions (no DOM, no three.js, no clock, no Math.random), so the unit tests can pin them and every cue renderer is a function
 * of (seed, age) only: a cutscene `seek(t)` and a second capture reproduce the same frame.
 *
 * Colours are linear HDR (values above 1 bloom). Times are ms from the cue start unless a name says otherwise.
 */

export type Rgb = readonly [number, number, number];

// ---------------------------------------------------------------------------------------------- deterministic hash

/** A uniform [0, 1) from (seed, i, k): an integer hash, so the same cue always draws the same particles. */
export function rnd(seed: number, i: number, k = 0): number {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------- easing

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number): number => clamp01(t) ** 3;
export const easeInQuad = (t: number): number => clamp01(t) ** 2;
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * clamp01(t)));
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** easeOutBack with overshoot `s` (the spec's 1.2 for the ink-rise). */
export const easeOutBack = (t: number, s = 1.2): number => {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};

// ---------------------------------------------------------------------------------------------- quality

/** Quality multiplier per world quality tier: tier 0 1.0 / tier 1 0.75 / tier 2 0.5 (art direction §3 header). */
export const QUALITY_Q = [1.0, 0.75, 0.5] as const;

// ---------------------------------------------------------------------------------------------- palettes

export const INK_POOL: Rgb = [0.04, 0.03, 0.07];
export const INK_DRIP: Rgb = [0.05, 0.04, 0.1];
export const VIOLET_RIM: Rgb = [0.9, 0.5, 2.4];
export const VIOLET_RIM_END: Rgb = [0.4, 0.2, 1.2];
export const VIOLET_SPARK: Rgb = [1.2, 0.7, 3.0];
export const VIOLET_HEAD: Rgb = [1.6, 0.6, 3.2];
export const VIOLET_IMPACT: Rgb = [0.9, 0.4, 2.2];
export const TEAR_CORE: Rgb = [3.0, 2.8, 3.4];
export const TEAR_EDGE: Rgb = [1.4, 0.5, 3.0];
export const FIRE_HOT: Rgb = [4, 1.6, 0.35];
export const FIRE_GREY: Rgb = [0.5, 0.48, 0.52];
export const FIRE_ASH: Rgb = [0.3, 0.29, 0.33];
export const GOLD_SPARK: Rgb = [1.9, 1.35, 0.45];
export const MASK_FLASH: Rgb = [2.4, 1.6, 3.0];
export const FOG_GREY: Rgb = [0.3, 0.31, 0.34];
export const ASH_GREY: Rgb = [0.42, 0.42, 0.45];
export const BONE: Rgb = [0.9, 0.88, 0.84];
export const EMBER_LIGHT: Rgb = [1.0, 0.5, 0.18];

/**
 * The theft table (§1.3 x HDR 2.2, §3 `theftStream`): Fireball, Aegis, Slash Wave, Piercing Thrust, Mending Light, Frost Lock.
 * Six hues spread around the wheel, so adjacent thefts never match. Used only by `theftStream` (the HUD swirl has its own sRGB copy).
 */
export const THEFT_RGB: readonly Rgb[] = [
  [2.2, 0.42, 0.05],
  [2.2, 1.43, 0.15],
  [1.75, 1.85, 2.2],
  [0.18, 1.7, 2.2],
  [0.24, 2.0, 0.55],
  [0.35, 0.55, 2.2],
];

// ---------------------------------------------------------------------------------------------- timings (ms)

export const INK_RISE = {
  open: 250,
  riseEnd: 850,
  rimFrom: 250,
  rimTo: 700,
  closeFrom: 850,
  total: 1250,
  radius: 0.9,
  rimRadius: 1.3,
} as const;
export const SKY_TEAR = {
  openMs: 400,
  w0: 0.25,
  w1: 3.0,
  h: 9,
  closeMs: 600,
  lineMs: 160,
} as const;
export const HUSH_BOLT = {
  windupMs: 160,
  flightMs: 280,
  impactMs: 220,
  bodyLen: 2.4,
  maxY: 1.6,
} as const;
export const WARD = {
  fadeInMs: 300,
  fadeOutMs: 400,
  rippleMs: 180,
  w: 5.2,
  h: 6.6,
  cy: 2.7,
  dz: 0.7,
} as const;
export const CATCH = {
  holdMs: 500,
  lerpFrom: 500,
  lerpTo: 1100,
  crackTo: 1200,
  crumbleTo: 1900,
} as const;
export const INK_WRITE = { charMs: 110, sparkLifeMs: 260 } as const;
export const THEFT = {
  crackMs: 120,
  flyEnd: 820,
  drainEnd: 1100,
  flash: 120,
  motes: 36,
  strands: 2,
  tail: 0.66,
} as const;
export const AURA_COLLAPSE = { smokeFrom: 760, smokeTo: 1600 } as const;
export const GATE_DARKEN = { perGlyphMs: 120, fadeMs: 160, sparkMs: 420 } as const;
export const LETTER_VORTEX = {
  spawnMs: 4000,
  ratePerS: 60,
  lifeS: 1.6,
  riseMs: 3600,
  maxLive: 120,
} as const;
export const SILENCE_FOG = {
  rampFromMs: 0,
  // P4.2 (P1-11): the fog peaks DURING the wide shot (31 - 34.5 s) and is back to 0.016 by the 36.0 s close-up cut
  peakMs: 3200,
  backMs: 5000,
  fog0: 0.012,
  fogPeak: 0.03,
  fogEnd: 0.016,
  cards: 6,
  cardFromMs: 500,
  cardToMs: 5500,
  speed: 3,
  ashPerS: 8,
  ashLifeS: 6,
} as const;
export const EMBER = { lightRampMs: 600, flickerHz: 0.6, radius: 3.0, intensity: 2.4 } as const;

// ---------------------------------------------------------------------------------------------- pure helpers (unit-tested)

/** `inkRise`: the sprite's rise offset in metres (-1.2 -> 0, easeOutBack 1.2, 250-850 ms) for the stage to apply. */
export function inkRiseOffsetY(ageMs: number): number {
  if (ageMs <= INK_RISE.open) return -1.2;
  return (
    -1.2 * (1 - easeOutBack((ageMs - INK_RISE.open) / (INK_RISE.riseEnd - INK_RISE.open), 1.2))
  );
}

/** `inkRise`: the ink-pool radius in metres. */
export function inkPoolRadius(ageMs: number): number {
  if (ageMs < 0 || ageMs >= INK_RISE.total) return 0;
  if (ageMs < INK_RISE.open) return INK_RISE.radius * easeOutCubic(ageMs / INK_RISE.open);
  if (ageMs < INK_RISE.closeFrom) return INK_RISE.radius;
  return (
    INK_RISE.radius * (1 - (ageMs - INK_RISE.closeFrom) / (INK_RISE.total - INK_RISE.closeFrom))
  );
}

/** `skyTear`: the slit width in metres. `closeAt` (ms) starts the close; null = held open. */
export function skyTearWidth(ageMs: number, closeAt: number | null): number {
  const open = SKY_TEAR.w0 + (SKY_TEAR.w1 - SKY_TEAR.w0) * easeOutExpo(ageMs / SKY_TEAR.openMs);
  if (closeAt === null || ageMs < closeAt) return ageMs < 0 ? 0 : open;
  const u = (ageMs - closeAt) / SKY_TEAR.closeMs;
  if (u < 1) return Math.min(open, SKY_TEAR.w1) * (1 - easeInOutCubic(u));
  const line = ageMs - closeAt - SKY_TEAR.closeMs;
  return line < SKY_TEAR.lineMs ? 0.06 : 0;
}

/** `theftStream`: where a cubic bezier ribbon is at s (0..1). Control points arc `arc` metres off the line, alternating per beat. */
export function bezier3(
  out: [number, number, number],
  s: number,
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
): [number, number, number] {
  const u = 1 - s;
  const a = u * u * u;
  const b = 3 * u * u * s;
  const c = 3 * u * s * s;
  const d = s * s * s;
  out[0] = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0];
  out[1] = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1];
  out[2] = a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2];
  return out;
}

/** `gateDarken`: how lit glyph `index` still is at `ageMs` (1 lit .. 0 carved): 120 ms apart, each fading over 160 ms. */
export function glyphLit(index: number, ageMs: number): number {
  return litFrom(index * GATE_DARKEN.perGlyphMs, ageMs);
}

/** A glyph that starts going dark at `startMs`: 1 lit .. 0 carved over 160 ms. */
export function litFrom(startMs: number, ageMs: number): number {
  return 1 - clamp01((ageMs - startMs) / GATE_DARKEN.fadeMs);
}

/** `gateDarken`: the whole sequence in ms for `n` glyphs. */
export function gateDarkenTotalMs(n: number): number {
  return (n - 1) * GATE_DARKEN.perGlyphMs + GATE_DARKEN.fadeMs;
}

/** `silenceFog`: the mood fog density at ageMs (0.012 -> 0.03 over 5 s, back to 0.018 by 7 s). */
export function silenceFogDensity(ageMs: number): number {
  const S = SILENCE_FOG;
  if (ageMs <= S.rampFromMs) return S.fog0;
  if (ageMs <= S.peakMs)
    return lerp(
      S.fog0,
      S.fogPeak,
      easeInOutSine((ageMs - S.rampFromMs) / (S.peakMs - S.rampFromMs)),
    );
  if (ageMs <= S.backMs)
    return lerp(S.fogPeak, S.fogEnd, easeInOutSine((ageMs - S.peakMs) / (S.backMs - S.peakMs)));
  return S.fogEnd;
}

/** `ember`: the world light's level 0..1 (ramps in over 600 ms, breathes +-12% at 0.6 Hz). */
export function emberLevel(ageMs: number): number {
  const ramp = clamp01(ageMs / EMBER.lightRampMs);
  return ramp * (1 + 0.12 * Math.sin((ageMs / 1000) * Math.PI * 2 * EMBER.flickerHz));
}

/** The sun glows (art direction §2.4) scale with `rays / 1.5`: the stolen light. `blend` is the mood blend 0..1 toward UNWRITTEN. */
export function sunDim(blend: number): number {
  return lerp(1, 0.2 / 1.5, clamp01(blend));
}

/** Nul's lift in metres during `letterVortex` (0 -> 9 over 3.6 s, easeInQuad). */
export function nulLift(ageMs: number): number {
  return 9 * easeInQuad(ageMs / LETTER_VORTEX.riseMs);
}

/**
 * Pre-built colour strings and tier tints for the typing VFX. Nothing here builds a string at
 * runtime on the hot path: pools store a palette index and draw with `FILL[idx]`.
 */
import {
  ELEMENT_HEX,
  FIXED_PRISM_HEX,
  PRISM_BUCKETS,
  TIER_ACCENT_HEX,
  TIER_BORDER_GLOW_PX,
  TIER_BORDER_HEX,
  TIER_TYPED_GLOW_PX,
  TIER_TYPED_HEX,
} from "../../../level/typingFxParams";
import type { PlateTint } from "../../fx";
import { contrastRatio, parseHex, relLuminance } from "../../theme";

/** Plate kinds that take the tier tint (R5). Guard, doom, finisher and second wind keep their palettes. */
export const TINT_KINDS: ReadonlySet<string> = new Set(["word", "minigame", "trial"]);

// ---- palette index layout
export const I_TIER = 0; // 0..4
export const I_BUCKET = 5; // 5..16
export const I_ELEMENT = 17; // 17..23
export const I_WHITE = 24;
export const I_RED = 25;
export const I_AMBER = 26;
export const I_TEAL = 27;
export const I_SPARK = 28; // 28 + tier*7 + element  (35 entries)
export const I_TYPED = I_SPARK + 5 * 7; // 63..67: typed-letter colour per tier (shatter fragments)
export const I_SHARD = I_TYPED + 5; // dark frame-shard fill
export const I_CYAN = I_SHARD + 1; // guard typo cue
export const FILL_COUNT = I_CYAN + 1;

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const h = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${h(ar, br)}${h(ag, bg)}${h(ab, bb)}`;
}

function buildFill(): string[] {
  const out: string[] = new Array(FILL_COUNT);
  for (let t = 0; t < 5; t++) out[I_TIER + t] = TIER_ACCENT_HEX[t] as string;
  for (let i = 0; i < 12; i++) out[I_BUCKET + i] = PRISM_BUCKETS[i] as string;
  for (let i = 0; i < 7; i++) out[I_ELEMENT + i] = ELEMENT_HEX[i] as string;
  out[I_WHITE] = "#ffffff";
  out[I_RED] = "#ff5a4a";
  out[I_AMBER] = "#ffb347";
  out[I_TEAL] = "#5af0e0";
  for (let t = 0; t < 5; t++)
    for (let e = 0; e < 7; e++)
      out[I_SPARK + t * 7 + e] = mixHex(
        TIER_ACCENT_HEX[t] as string,
        ELEMENT_HEX[e] as string,
        0.35,
      );
  for (let t = 0; t < 5; t++) out[I_TYPED + t] = TIER_TYPED_HEX[t] as string;
  out[I_SHARD] = "#1a1220";
  out[I_CYAN] = "#bff4ff";
  return out;
}
/** Every fill colour of the typing VFX, as ready-to-use style strings. */
export const FILL: readonly string[] = buildFill();

/** Palette indices that get a pre-rendered glow sprite. */
export const GLOW_INDICES: readonly number[] = [
  ...Array.from({ length: 5 }, (_, i) => I_TIER + i),
  ...Array.from({ length: 12 }, (_, i) => I_BUCKET + i),
  ...Array.from({ length: 7 }, (_, i) => I_ELEMENT + i),
  I_WHITE,
  I_RED,
  I_AMBER,
  I_TEAL,
  I_CYAN,
];

export function sparkIndex(tier: number, element: number): number {
  return I_SPARK + tier * 7 + element;
}
/** Index of the tier accent; tier 4 resolves to a hue bucket. */
export function accentIndex(
  tier: number,
  time: number,
  offset: number,
  reducedMotion: boolean,
): number {
  if (tier < 4) return I_TIER + tier;
  return reducedMotion ? I_TIER + 4 : I_BUCKET + hueBucket(time, offset);
}
/** Hue bucket 0..11 of the prismatic cycle (140 deg/s) with a degree offset. */
export function hueBucket(time: number, offsetDeg: number): number {
  const d = (time * 140 + offsetDeg) % 360;
  return Math.floor((d < 0 ? d + 360 : d) / 30) % 12;
}
/** Prismatic typed-letter colour for letter i (base + 24 deg per letter). Reduced motion: fixed. */
export function prismLetter(i: number, time: number, reducedMotion: boolean): string {
  if (reducedMotion) return FIXED_PRISM_HEX;
  return PRISM_BUCKETS[hueBucket(time, 24 * i)] as string;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Static tints, one per tier. Tier 0 is the plate's own palette, so it has no tint (null). */
export const TIER_TINTS: readonly PlateTint[] = Array.from({ length: 5 }, (_, t) => ({
  tier: t,
  prism: t === 4,
  border: TIER_BORDER_HEX[t] as string,
  typed: TIER_TYPED_HEX[t] as string,
  glow: rgba(TIER_TYPED_HEX[t] as string, 0.6),
  accent: TIER_ACCENT_HEX[t] as string,
  typedGlowPx: TIER_TYPED_GLOW_PX[t] as number,
  borderGlowPx: TIER_BORDER_GLOW_PX[t] as number,
}));

/** Tint for a plate kind at a tier, or null when the kind keeps its own palette or the tier is 0. */
export function tintFor(tier: number, kind: string): PlateTint | null {
  if (tier <= 0 || !TINT_KINDS.has(kind)) return null;
  return TIER_TINTS[Math.min(4, tier)] ?? null;
}

/** A tint blended between two tiers (cross-fade; allocates, only used during the 250 ms fades). */
export function blendTints(from: number, to: number, t: number): PlateTint {
  const a = TIER_TINTS[from] as PlateTint;
  const b = TIER_TINTS[to] as PlateTint;
  if (to === 4 || from === 4) return t >= 0.5 ? b : a;
  return {
    tier: t >= 0.5 ? to : from,
    prism: false,
    border: mixHex(a.border as string, b.border as string, t),
    typed: mixHex(a.typed as string, b.typed as string, t),
    glow: rgba(mixHex(a.typed as string, b.typed as string, t), 0.6),
    accent: mixHex(a.accent as string, b.accent as string, t),
    typedGlowPx:
      (a.typedGlowPx as number) + ((b.typedGlowPx as number) - (a.typedGlowPx as number)) * t,
    borderGlowPx:
      (a.borderGlowPx as number) + ((b.borderGlowPx as number) - (a.borderGlowPx as number)) * t,
  };
}

const TYPO_CACHE = new Map<string, string>();
/**
 * Typo glitch colour for a plate palette: the spec red (or amber, zen) unless it falls below 4.5:1
 * on the plate's lightest background stop; then the next lighter variant (R2: the glitch colour
 * must keep contrast >= 4.5).
 */
export function typoColorFor(bg0: string, bg1: string, amber: boolean): string {
  const key = `${bg0}|${bg1}|${amber ? 1 : 0}`;
  let v = TYPO_CACHE.get(key);
  if (v) return v;
  const lightest = relLuminance(bg0) > relLuminance(bg1) ? bg0 : bg1;
  const ladder = amber ? ["#ffb347", "#ffc978", "#ffe0b0"] : ["#ff8878", "#ff9a8c", "#ffb8aa"];
  v = ladder.find((c) => contrastRatio(c, lightest) >= 4.5) ?? (ladder[2] as string);
  TYPO_CACHE.set(key, v);
  return v;
}

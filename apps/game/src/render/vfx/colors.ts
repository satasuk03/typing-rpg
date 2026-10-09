/**
 * World-side colours for the typing VFX (linear HDR rgb; values above 1 bloom).
 * Pure and allocation-free: every function writes into a caller-owned 3-array.
 */
import { ELEMENT_HEX } from "../../level/typingFxParams";

/** Hard cap on the hero sprite's final HDR brightness while typing FX are up (keeps the silhouette readable). */
export const HERO_LUM_CAP = 1.45;

/** Flash and aura lights sit BEHIND the hero (rim light, no in-scatter wash on the sprite) and stay local (radius cap, world units). */
export const LIGHT_BEHIND = -0.85;
export const LIGHT_MAX_RADIUS = 3.0;

export type Rgb = [number, number, number];

/** §3.1 "world accent" per key-streak tier (T4 is a hue cycle, see `hueRgb`). */
export const WORLD_ACCENT: readonly Rgb[] = [
  [1.0, 0.95, 0.85],
  [1.6, 1.2, 0.35],
  [1.9, 0.75, 0.22],
  [0.45, 1.1, 2.0],
  [1.8, 1.0, 1.8],
];

/** §3.2 combo-tier rune colours (bronze, silver, gold, radiant), linearised. */
export const COMBO_RGB: readonly Rgb[] = [
  [0, 0, 0],
  hexLinear("#d99a62"),
  hexLinear("#dfe6ee"),
  hexLinear("#ffd25a"),
  hexLinear("#ff9ae8"),
];

export function hexLinear(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number): number => (v / 255) ** 2.2;
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

/** Element colours as bright HDR for flares and beams (x1.9 so the bloom picks them up). */
export const ELEMENT_RGB: readonly Rgb[] = ELEMENT_HEX.map((h) => {
  const c = hexLinear(h);
  return [c[0] * 1.9, c[1] * 1.9, c[2] * 1.9] as Rgb;
});
/** Element colours for point lights (plain linear colour; the intensity carries the strength). */
export const ELEMENT_LIGHT: readonly Rgb[] = ELEMENT_HEX.map((h) => hexLinear(h));

/** Hue (degrees) to a saturated bright rgb scaled by `gain`, written into `out`. No allocation. */
export function hueRgb(hue: number, gain: number, out: Rgb): Rgb {
  const h = (((hue % 360) + 360) % 360) / 60;
  const i = Math.floor(h);
  const f = h - i;
  const q = 1 - f;
  let r = 1;
  let g = 1;
  let b = 1;
  // S 0.85, V 1 -> keep a little white so it stays luminous
  const s = 0.15;
  switch (i % 6) {
    case 0:
      g = f;
      b = 0;
      break;
    case 1:
      r = q;
      b = 0;
      break;
    case 2:
      r = 0;
      b = f;
      break;
    case 3:
      r = 0;
      g = q;
      break;
    case 4:
      r = f;
      g = 0;
      break;
    default:
      g = 0;
      b = q;
      break;
  }
  out[0] = (r + (1 - r) * s) * gain;
  out[1] = (g + (1 - g) * s) * gain;
  out[2] = (b + (1 - b) * s) * gain;
  return out;
}

/** Tier-4 prismatic hue drift: 0.25 Hz (one full cycle in 4 s), slow enough that it never reads as a strobe (T6.3 #17). */
export const T4_HUE_DEG_PER_SEC = 360 * 0.25;

/** World accent for a tier at a time; tier 4 drifts hue at `T4_HUE_DEG_PER_SEC` (reduced motion: fixed pink). */
export function accentRgb(tier: number, time: number, reducedMotion: boolean, out: Rgb): Rgb {
  if (tier >= 4) {
    if (reducedMotion) return hueRgb(310, 1.9, out);
    return hueRgb(time * T4_HUE_DEG_PER_SEC, 1.9, out);
  }
  const a = WORLD_ACCENT[tier] as Rgb;
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}

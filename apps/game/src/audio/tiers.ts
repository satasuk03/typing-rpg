import type { Rng, StreakTier } from "./types";

/** Per-key streak thresholds for tiers 1..4 (PO decision). */
export const STREAK_TIER_THRESHOLDS = [10, 25, 50, 100] as const;

export function streakTier(streak: number): StreakTier {
  let tier = 0;
  for (const t of STREAK_TIER_THRESHOLDS) if (streak >= t) tier++;
  return tier as StreakTier;
}

export const midiToHz = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** Pentatonic semitone offsets walked by the streak (ported from the POC `PENTA`). */
export const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;

export interface KeyVoice {
  tier: StreakTier;
  /** Fundamental of the pitched tick, Hz. */
  freq: number;
  detuneCents: number;
  /** Highpass corner of the noise click, Hz (brighter with tier). */
  noiseHz: number;
  /** Extra harmonic partial gains (0 = off), brighter timbre as tier rises. */
  partial2: number;
  partial3: number;
  gain: number;
}

/**
 * Pure mapping streak -> click voice. `r1`, `r2` are 0..1 random draws for slight variation
 * (the caller passes injectable-PRNG values, so tests are deterministic).
 * Pitch: pentatonic walk every 3 correct keys, plus a 2-semitone lift per tier.
 */
export function keyVoice(streak: number, r1: number, r2: number): KeyVoice {
  const s = Math.max(0, Math.floor(streak));
  const tier = streakTier(s);
  const step = PENTA[Math.floor(s / 3) % PENTA.length] ?? 0;
  const note = 76 + step + tier * 2;
  return {
    tier,
    freq: midiToHz(note),
    detuneCents: (r1 - 0.5) * 16,
    noiseHz: (3200 + tier * 900) * (0.9 + r2 * 0.2),
    partial2: tier >= 1 ? 0.025 * tier : 0,
    partial3: tier >= 3 ? 0.02 * (tier - 2) : 0,
    gain: 0.11 * (0.92 + r1 * 0.16),
  };
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

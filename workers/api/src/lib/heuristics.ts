// Timing heuristics for a Trial keystroke log (interfaces §10 "Heuristics"). Pure: no I/O, no clock.
// Runs AFTER the re-sim matched, so these only catch re-timed / scripted but self-consistent logs.
// IKI-based thresholds are PROVISIONAL; every computed value is returned in `metrics` so the caller can log it to `flags`.
import type { AcConfig } from "./env.ts";

export interface KeyRec {
  /** ms since the first record (Trial clock origin). */
  ms: number;
  /** key matched the passage cursor (stop-on-error semantics). */
  correct: boolean;
}

export interface HeuristicMetrics {
  keys: number;
  ikis: number;
  /** timer grain: GCD of all non-zero IKIs (1 = fine timer). */
  grainMs: number;
  ikiCv: number | null;
  fastShare: number | null;
  quantPeriodMs: number | null;
  quantShare: number | null;
  jankShare: number;
  sustainedWpm: number;
  burstWpm: number;
}

export interface HeuristicHit {
  code: "sustained_wpm" | "burst_wpm" | "iki_cv" | "fast_share" | "quantized" | "jank" | "perfect";
  value: number;
  threshold: number;
}

const gcd = (a: number, b: number): number => {
  let x = a;
  let y = b;
  while (y !== 0) [x, y] = [y, x % y];
  return x;
};

/** Max net WPM (correct chars / 5 per minute) over any window of `spanMs` starting at a correct key. */
export function maxWindowWpm(correctMs: readonly number[], spanMs: number): number {
  let best = 0;
  let j = 0;
  for (let i = 0; i < correctMs.length; i++) {
    const start = correctMs[i] as number;
    if (j < i) j = i;
    while (j < correctMs.length && (correctMs[j] as number) < start + spanMs) j++;
    best = Math.max(best, ((j - i) / 5) * (60_000 / spanMs));
  }
  return best;
}

/** Minimum number of IKIs before the distribution rules (CV / fast share / quantization) apply. */
const MIN_IKIS_FOR_STATS = 10;

export function analyzeTiming(
  keys: readonly KeyRec[],
  result: { accuracyBp: number; wpmX100: number },
  cfg: AcConfig,
): { hits: HeuristicHit[]; metrics: HeuristicMetrics } {
  // Coalesce identical timestamps into one jank cluster.
  const stamps: number[] = [];
  const sizes: number[] = [];
  for (const k of keys) {
    if (stamps.length > 0 && stamps[stamps.length - 1] === k.ms) {
      sizes[sizes.length - 1] = (sizes[sizes.length - 1] as number) + 1;
    } else {
      stamps.push(k.ms);
      sizes.push(1);
    }
  }
  let jankKeys = 0;
  for (const s of sizes) if (s > 1) jankKeys += s;

  const all: number[] = []; // every IKI between consecutive distinct timestamps (grain)
  const kept: number[] = []; // those not adjacent to a jank cluster (CV / fast / quantization)
  for (let i = 1; i < stamps.length; i++) {
    const d = (stamps[i] as number) - (stamps[i - 1] as number);
    all.push(d);
    if ((sizes[i] as number) === 1 && (sizes[i - 1] as number) === 1) kept.push(d);
  }
  let grain = 0;
  for (const d of all) grain = gcd(grain, d);
  if (grain === 0) grain = 1;

  const hits: HeuristicHit[] = [];
  const m: HeuristicMetrics = {
    keys: keys.length,
    ikis: kept.length,
    grainMs: grain,
    ikiCv: null,
    fastShare: null,
    quantPeriodMs: null,
    quantShare: null,
    jankShare: keys.length === 0 ? 0 : jankKeys / keys.length,
    sustainedWpm: 0,
    burstWpm: 0,
  };

  const correctMs = keys.filter((k) => k.correct).map((k) => k.ms);
  m.sustainedWpm = maxWindowWpm(correctMs, cfg.sustainedSpanMs);
  m.burstWpm = maxWindowWpm(correctMs, cfg.burstSpanMs);
  if (m.sustainedWpm > cfg.maxSustainedWpm) {
    hits.push({ code: "sustained_wpm", value: m.sustainedWpm, threshold: cfg.maxSustainedWpm });
  }
  if (m.burstWpm > cfg.maxBurstWpm) {
    hits.push({ code: "burst_wpm", value: m.burstWpm, threshold: cfg.maxBurstWpm });
  }

  if (kept.length >= MIN_IKIS_FOR_STATS) {
    const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
    const variance = kept.reduce((a, b) => a + (b - mean) ** 2, 0) / kept.length;
    m.ikiCv = mean === 0 ? 0 : Math.sqrt(variance) / mean;
    if (m.ikiCv < cfg.minIkiCv)
      hits.push({ code: "iki_cv", value: m.ikiCv, threshold: cfg.minIkiCv });

    m.fastShare = kept.filter((d) => d < cfg.fastIkiMs).length / kept.length;
    if (m.fastShare > cfg.maxFastIkiShare) {
      hits.push({ code: "fast_share", value: m.fastShare, threshold: cfg.maxFastIkiShare });
    }

    // Quantization: only meaningful with a fine timer (g = 1); a coarse timer already makes every IKI a multiple of g.
    if (grain === 1) {
      let bestP = 0;
      let bestShare = 0;
      for (let p = cfg.quantMinPeriodMs; p <= 50; p++) {
        const share = kept.filter((d) => d % p === 0).length / kept.length;
        if (share > bestShare) {
          bestShare = share;
          bestP = p;
        }
      }
      m.quantPeriodMs = bestP;
      m.quantShare = bestShare;
      if (bestShare > cfg.quantMaxShare) {
        hits.push({ code: "quantized", value: bestShare, threshold: cfg.quantMaxShare });
      }
    }
  }

  if (m.jankShare > cfg.maxJankShare) {
    hits.push({ code: "jank", value: m.jankShare, threshold: cfg.maxJankShare });
  }
  if (
    result.accuracyBp === 10_000 &&
    keys.length >= cfg.perfectMinKeys &&
    result.wpmX100 >= cfg.perfectMinWpm * 100
  ) {
    hits.push({ code: "perfect", value: result.wpmX100 / 100, threshold: cfg.perfectMinWpm });
  }
  return { hits, metrics: m };
}

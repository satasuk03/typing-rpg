// Word assignment (T1.2): tier mix draw + distinct-first-letter guarantee + deterministic pool-exhaustion fallbacks.
// Pure functions over a ResolvedLevel's pools and an explicit RNG state (the encounter's `words` stream).

import { K } from "./balance.ts";
import { SimError } from "./errors.ts";
import { isTypable } from "./input.ts";
import { below, pickWeighted, type RngState } from "./rng.ts";
import type { ResolvedLevel } from "./types.ts";

/** Last-resort plate words, one per letter, so a plate can ALWAYS be assigned a free first letter. */
export const FALLBACK_WORDS: readonly string[] = [
  "apple",
  "bread",
  "cloud",
  "dream",
  "eagle",
  "flame",
  "grass",
  "heart",
  "ivory",
  "jewel",
  "knife",
  "lemon",
  "moon",
  "night",
  "ocean",
  "pearl",
  "queen",
  "river",
  "stone",
  "tiger",
  "umber",
  "vine",
  "water",
  "xenon",
  "yield",
  "zebra",
];

const TIER_ORDER = ["current", "review", "biome", "weak"] as const;
type Tier = (typeof TIER_ORDER)[number];

/** The key a first-letter lock is compared on: always case-folded (interfaces §3.3 targeting). */
export const firstLetter = (text: string): string => text.charAt(0).toLowerCase();

const usable = (w: string): boolean =>
  w.length > 0 && w.charAt(0) !== " " && isTypable(w.charAt(0));

/** Effective tier weights: an empty pool's weight goes to `current`; if `current` is empty too, to the first non-empty tier. */
export function effectiveTierWeights(def: ResolvedLevel): Record<Tier, number> {
  const mix = def.tierMixBp;
  const w: Record<Tier, number> = {
    current: mix.current,
    review: mix.review,
    biome: mix.biome,
    weak: mix.weak,
  };
  const has = (t: Tier): boolean => def.words[t].some(usable);
  for (const t of TIER_ORDER) {
    if (t !== "current" && !has(t)) {
      w.current += w[t];
      w[t] = 0;
    }
  }
  if (!has("current")) {
    const first = TIER_ORDER.find((t) => has(t));
    if (first !== undefined && first !== "current") {
      w[first] += w.current;
      w.current = 0;
    }
  }
  return w;
}

export interface PickOptions {
  /** Case-folded first letters already used by visible targetable plates. */
  forbidden: readonly string[];
  /** Recently assigned texts (soft anti-repeat; relaxed when it would exhaust the pool). */
  recent: readonly string[];
  lengthRange: readonly [number, number];
}

/**
 * Picks a plate word. Always consumes the tier draw (when any pool has weight) and then exactly one `below` over the
 * candidate list of the first relaxation level that has candidates:
 *   L0 length ok + free letter + not recent;  L1 length ok + free letter;  L2 free letter;  then FALLBACK_WORDS.
 * Within a level the drawn tier is tried first, then the others in fixed order. Throws only if all 26 letters are taken.
 */
export function pickPlateWord(def: ResolvedLevel, rng: RngState, opts: PickOptions): string {
  const weights = effectiveTierWeights(def);
  const total = weights.current + weights.review + weights.biome + weights.weak;
  const drawn: Tier | null = total > 0 ? pickWeighted(rng, weights, TIER_ORDER) : null;
  const order: Tier[] =
    drawn === null ? [...TIER_ORDER] : [drawn, ...TIER_ORDER.filter((t) => t !== drawn)];
  const [lo, hi] = opts.lengthRange;
  const free = (w: string): boolean => usable(w) && !opts.forbidden.includes(firstLetter(w));
  const lenOk = (w: string): boolean => w.length >= lo && w.length <= hi;
  const levels: ((w: string) => boolean)[] = [
    (w) => free(w) && lenOk(w) && !opts.recent.includes(w),
    (w) => free(w) && lenOk(w),
    free,
  ];
  for (const ok of levels) {
    for (const t of order) {
      const cands = def.words[t].filter(ok);
      if (cands.length > 0) return cands[below(rng, cands.length)] as string;
    }
  }
  return pickFallback(rng, opts.forbidden);
}

/** Guard words come from the easy `guard` pool (doc 01 §1.7); any free first letter, no length filter. */
export function pickGuardWord(
  def: ResolvedLevel,
  rng: RngState,
  forbidden: readonly string[],
): string {
  const cands = def.words.guard.filter((w) => usable(w) && !forbidden.includes(firstLetter(w)));
  if (cands.length > 0) return cands[below(rng, cands.length)] as string;
  return pickFallback(rng, forbidden);
}

function pickFallback(rng: RngState, forbidden: readonly string[]): string {
  const cands = FALLBACK_WORDS.filter((w) => !forbidden.includes(firstLetter(w)));
  if (cands.length === 0) throw new SimError("word assignment: every first letter is taken");
  return cands[below(rng, cands.length)] as string;
}

/** Plate comparison folding: caseMode "auto" folds when the text has no uppercase letter; "strict" never folds. */
export function plateFolds(text: string, caseMode: "auto" | "strict"): boolean {
  if (caseMode === "strict") return false;
  return text === text.toLowerCase();
}

export const RECENT_LIMIT = K.RECENT_WORDS;

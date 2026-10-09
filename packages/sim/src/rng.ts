import { SimError } from "./errors.ts";
import { BP, type Bp } from "./fixed.ts";
import { fnv1a32 } from "./hash.ts";

export type RngState = [a: number, b: number, c: number, d: number]; // uint32 each
export const RNG_STREAMS = [
  "words",
  "combat",
  "enemyAi",
  "gimmick",
  "boss",
  "loot",
  "trial",
  "meta",
] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

const TWO_32 = 4294967296;

/** Sequential splitmix32 generator; only used to seed the four sfc32 words. */
function splitmix32Seed(seed: number): RngState {
  let a = seed >>> 0;
  const draw = (): number => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
  return [draw(), draw(), draw(), draw()];
}

/** Mutates s. */
export function nextU32(s: RngState): number {
  const t = (((s[0] + s[1]) >>> 0) + s[3]) >>> 0;
  s[3] = (s[3] + 1) >>> 0;
  s[0] = (s[1] ^ (s[1] >>> 9)) >>> 0;
  s[1] = (s[2] + (s[2] << 3)) >>> 0;
  s[2] = ((s[2] << 21) | (s[2] >>> 11)) >>> 0;
  s[2] = (s[2] + t) >>> 0;
  return t;
}

/** splitmix32 seeded with (seed ^ fnv1a32(stream) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0, 4 draws, 12 warm-up. */
export function deriveRng(seed: number, stream: RngStream, index = 0): RngState {
  const s = splitmix32Seed((seed ^ fnv1a32(stream) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  for (let i = 0; i < 12; i++) nextU32(s);
  return s;
}

/** Unbiased integer in [0, n) via rejection sampling. 1 <= n <= 2^32. Always consumes at least one draw. */
export function below(s: RngState, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new SimError(`below(): bad bound ${n}`);
  const limit = TWO_32 - (TWO_32 % n); // accept x < limit; limit is a multiple of n
  for (;;) {
    const x = nextU32(s);
    if (x < limit) return x % n;
  }
}

/** ALWAYS consumes exactly one below(s, BP) draw, even when p <= 0 or p >= BP (keeps streams aligned). */
export const chance = (s: RngState, p: Bp): boolean => below(s, BP) < p;

/** Weighted pick, one below() draw; iteration order is the explicit `order` array, never object-key order. */
export function pickWeighted<K extends string>(
  s: RngState,
  w: Readonly<Record<K, number>>,
  order: readonly K[],
): K {
  let total = 0;
  for (const k of order) {
    const x = w[k];
    if (!Number.isSafeInteger(x) || x < 0)
      throw new SimError(`pickWeighted(): bad weight for ${k}`);
    total += x;
  }
  if (total < 1) throw new SimError("pickWeighted(): total weight is 0");
  let r = below(s, total);
  for (const k of order) {
    const x = w[k];
    if (r < x) return k;
    r -= x;
  }
  throw new SimError("pickWeighted(): unreachable");
}

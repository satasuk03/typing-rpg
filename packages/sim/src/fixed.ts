import { SimError } from "./errors.ts";

export const BP = 10_000;
export const MILLI = 1_000;
export type Bp = number;
export type Milli = number;

const assertSafe = (n: number): number => {
  if (!Number.isSafeInteger(n)) throw new SimError(`fixed-point overflow or non-integer: ${n}`);
  return n;
};

/** floor(x * bp / BP). Throws if |x * bp| >= 2^53 (cheap always-on guard instead of a dev-only assert). */
export const mulBp = (x: Milli, bp: Bp): Milli => Math.floor(assertSafe(x * bp) / BP);
/** floor(a * b / c). Throws if |a * b| >= 2^53. c must be > 0. */
export const mulDiv = (a: number, b: number, c: number): number =>
  Math.floor(assertSafe(a * b) / c);
/** Floor division for integers, c > 0. */
export const divFloor = (a: number, c: number): number => Math.floor(a / c);
/** Ceiling division for integers, c > 0. */
export const divCeil = (a: number, c: number): number => Math.ceil(a / c);
/** Round-half-up division for integers, c > 0: floor((2a + c) / (2c)). */
export const divRound = (a: number, c: number): number =>
  Math.floor(assertSafe(2 * a + c) / (2 * c));
/** Integer clamp (lo <= hi). */
export const clampInt = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/** floor(sqrt(n)) for a safe integer n >= 0 via integer Newton iteration (no Math.sqrt). */
export function isqrt(n: number): number {
  assertSafe(n);
  if (n < 0) throw new SimError(`isqrt of negative: ${n}`);
  if (n < 2) return n;
  // Start from a power of two >= sqrt(n); Newton then decreases monotonically to floor(sqrt(n)).
  let x = 1;
  while (x * x < n) x *= 2;
  for (;;) {
    const y = Math.floor((x + Math.floor(n / x)) / 2);
    if (y >= x) return x;
    x = y;
  }
}

/** Module-init conversion of BALANCE literals ONLY (never on state). */
export const bp = (x: number): Bp => Math.round(x * BP);
export const milli = (x: number): Milli => Math.round(x * MILLI);
/** Display rounding for events/view: positive amounts never show as 0. */
export const toDisplay = (m: Milli): number => (m <= 0 ? 0 : Math.max(1, Math.round(m / MILLI)));
/** Code-unit string order. The ONLY string comparison logic may use (no localeCompare). */
export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

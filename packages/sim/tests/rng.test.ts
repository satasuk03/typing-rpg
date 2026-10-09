import { describe, expect, test } from "vitest";
import {
  BP,
  below,
  chance,
  deriveRng,
  fnv1a32,
  nextU32,
  pickWeighted,
  RNG_STREAMS,
  type RngState,
} from "../src/index.ts";

/** Independent reference: the closure-based sfc32 from the M0 placeholder, seeded with an already-derived seed. */
function referenceStream(derivedSeed: number): () => number {
  let sm = derivedSeed >>> 0;
  const splitmix = (): number => {
    sm = (sm + 0x9e3779b9) >>> 0;
    let t = sm ^ (sm >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const next = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

const draws = (s: RngState, n: number): number[] => Array.from({ length: n }, () => nextU32(s));

describe("rng: golden values", () => {
  test("deriveRng state is plain uint32 data", () => {
    const s = deriveRng(12345, "words");
    expect(s).toEqual([2197323274, 222067872, 3769793959, 1879410771]);
    for (const w of s) expect(Number.isInteger(w) && w >= 0 && w <= 0xffffffff).toBe(true);
  });

  test("nextU32 golden sequence (seed 12345, stream words)", () => {
    expect(draws(deriveRng(12345, "words"), 8)).toEqual([
      3834621, 1669780945, 3039180267, 3302162487, 4260271157, 3225458259, 794913830, 3966021952,
    ]);
  });

  test("below golden sequence (seed 12345, stream combat, index 3)", () => {
    const s = deriveRng(12345, "combat", 3);
    expect(Array.from({ length: 8 }, () => below(s, 100))).toEqual([
      26, 19, 74, 84, 14, 87, 66, 88,
    ]);
  });

  test("matches an independent sfc32 reference on the derived seed", () => {
    const seed = 987654321;
    const derived = (seed ^ fnv1a32("loot") ^ Math.imul(2 + 1, 0x9e3779b9)) >>> 0;
    const ref = referenceStream(derived);
    const s = deriveRng(seed, "loot", 2);
    for (let i = 0; i < 1000; i++) expect(nextU32(s)).toBe(ref());
  });

  test("state stays uint32 after many draws", () => {
    const s = deriveRng(7, "combat");
    for (let i = 0; i < 10_000; i++) nextU32(s);
    for (const w of s) expect(Number.isInteger(w) && w >= 0 && w <= 0xffffffff).toBe(true);
  });
});

describe("rng: streams", () => {
  test("all streams and indices give distinct states", () => {
    const seen = new Set<string>();
    for (const st of RNG_STREAMS)
      for (let i = 0; i < 4; i++) seen.add(deriveRng(99, st, i).join(","));
    expect(seen.size).toBe(RNG_STREAMS.length * 4);
  });

  test("adding draws on stream A does not change stream B", () => {
    const run = (extraA: number): number[] => {
      const a = deriveRng(555, "combat");
      const b = deriveRng(555, "words");
      for (let i = 0; i < extraA; i++) nextU32(a);
      return draws(b, 20);
    };
    expect(run(0)).toEqual(run(37));
    expect(run(0)).toEqual(run(5000));
  });

  test("deriveRng is a pure function of (seed, stream, index)", () => {
    expect(deriveRng(5, "boss", 2)).toEqual(deriveRng(5, "boss", 2));
    expect(deriveRng(5, "boss", 2)).not.toEqual(deriveRng(5, "boss", 3));
    expect(deriveRng(5, "boss", 2)).not.toEqual(deriveRng(6, "boss", 2));
  });
});

describe("rng: below / chance / pickWeighted", () => {
  test("below stays in range and is roughly uniform", () => {
    const s2 = deriveRng(1, "words");
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 70_000; i++) {
      const v = below(s2, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      c[v] = (c[v] ?? 0) + 1;
    }
    for (const n of c) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });

  test("below handles n = 1 (consumes a draw) and n = 2^32", () => {
    const s = deriveRng(3, "words");
    const before = [...s] as RngState;
    expect(below(s, 1)).toBe(0);
    expect(s).not.toEqual(before);
    const s2 = deriveRng(3, "words");
    const s3 = deriveRng(3, "words");
    expect(below(s2, 4294967296)).toBe(nextU32(s3));
  });

  test("below rejects bad bounds", () => {
    const s = deriveRng(3, "words");
    expect(() => below(s, 0)).toThrow();
    expect(() => below(s, -1)).toThrow();
    expect(() => below(s, 1.5)).toThrow();
    expect(() => below(s, 4294967297)).toThrow();
  });

  test("chance ALWAYS draws, even for p <= 0 and p >= BP", () => {
    for (const p of [-5, 0, 1, BP - 1, BP, BP + 100]) {
      const s = deriveRng(11, "combat");
      const ref = deriveRng(11, "combat");
      chance(s, p);
      below(ref, BP);
      expect(s).toEqual(ref);
    }
    expect(chance(deriveRng(1, "combat"), 0)).toBe(false);
    expect(chance(deriveRng(1, "combat"), BP)).toBe(true);
  });

  test("chance frequency matches p", () => {
    const s = deriveRng(21, "combat");
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (chance(s, 3_000)) hits++;
    expect(Math.abs(hits - 30_000)).toBeLessThan(900);
  });

  test("pickWeighted uses the explicit order, one draw, and respects zero weights", () => {
    const w = { b: 1, a: 3, c: 0 };
    const order = ["a", "b", "c"] as const;
    const s = deriveRng(8, "loot");
    const ref = deriveRng(8, "loot");
    const picks: string[] = [];
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 40_000; i++) {
      const k = pickWeighted(s, w, order);
      counts[k]++;
      if (i < 5) picks.push(k);
      below(ref, 4);
    }
    expect(s).toEqual(ref); // exactly one below() draw per pick
    expect(counts.c).toBe(0);
    expect(Math.abs(counts.a - 30_000)).toBeLessThan(800);
    expect(picks.length).toBe(5);
    expect(() => pickWeighted(s, { a: 0 }, ["a"])).toThrow();
    expect(() => pickWeighted(s, { a: -1, b: 2 }, ["a", "b"])).toThrow();
  });
});

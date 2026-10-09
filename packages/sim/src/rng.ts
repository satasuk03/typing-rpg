/** Minimal seeded PRNG (sfc32). Placeholder; the sim engineer replaces it in T1.1. */
export interface Rng {
  /** Next uint32. */
  nextU32(): number;
  /** Next float in [0, 1). */
  next(): number;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function sfc32(seed: number): Rng {
  const sm = splitmix32(seed);
  let a = sm();
  let b = sm();
  let c = sm();
  let d = sm();
  const nextU32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  // Warm up.
  for (let i = 0; i < 12; i++) nextU32();
  return { nextU32, next: () => nextU32() / 4294967296 };
}

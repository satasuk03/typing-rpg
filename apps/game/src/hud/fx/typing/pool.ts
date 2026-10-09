/**
 * Fixed-capacity SoA pool for HUD effects. Typed arrays are allocated once; `spawn` never
 * allocates. When full, the oldest entry (largest age field) is stolen. Removal is swap-remove.
 */

export class HudPool {
  count = 0;
  readonly f: Float32Array[];
  readonly b: Uint8Array[];

  /**
   * @param cap       capacity
   * @param nFloat    number of Float32 fields
   * @param nByte     number of Uint8 fields
   * @param ageField  index of the float field holding the age (used to steal the oldest)
   */
  constructor(
    readonly cap: number,
    nFloat: number,
    nByte: number,
    private readonly ageField = 0,
  ) {
    this.f = [];
    this.b = [];
    for (let i = 0; i < nFloat; i++) this.f.push(new Float32Array(cap));
    for (let i = 0; i < nByte; i++) this.b.push(new Uint8Array(cap));
  }

  /** Returns a slot index. The caller must fill every field of the slot. */
  spawn(): number {
    if (this.count < this.cap) return this.count++;
    const age = this.f[this.ageField] as Float32Array;
    let best = 0;
    let bv = age[0] as number;
    for (let i = 1; i < this.cap; i++) {
      const v = age[i] as number;
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    return best;
  }

  /** Swap-remove slot i (the last entry moves into i). Iterate downwards when removing. */
  remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (const a of this.f) a[i] = a[last] as number;
    for (const a of this.b) a[i] = a[last] as number;
  }

  clear(): void {
    this.count = 0;
  }
}

/** Presentation PRNG (deterministic per seed). Never `Math.random`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless deterministic hash to [0, 1). */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

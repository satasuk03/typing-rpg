// The exact Gear Cache effective rarity table (Markov chain over the pity counters, scripts/gen-tables.ts) equals the
// Python's own exact chain (tests/fixtures/economy-reference.json, scripts/dump-economy-reference.py).
import { describe, expect, test } from "vitest";
import { computeCacheEffective, computeCacheEffectiveBp } from "../scripts/gen-tables.ts";
import { CACHE_EFFECTIVE_BP } from "../src/tables.generated.ts";
import reference from "../tests/fixtures/economy-reference.json" with { type: "json" };

describe("cache effective odds", () => {
  test("TS chain == Python chain (1e-9) and the generated bp table matches", () => {
    const exact = computeCacheEffective();
    const py = reference.ref.cache_effective as Record<"C" | "U" | "R" | "E" | "L", number>;
    for (const r of ["C", "U", "R", "E", "L"] as const)
      expect(Math.abs(exact[r] - py[r])).toBeLessThan(1e-9);
    expect({ ...CACHE_EFFECTIVE_BP }).toEqual(computeCacheEffectiveBp());
    expect(CACHE_EFFECTIVE_BP.L).toBe(154); // 1.54%; the 3.16% in doc 02 C8 is the cosmetic Scribe's Chest
  });
});

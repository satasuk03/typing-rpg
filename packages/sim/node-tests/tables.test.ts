import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  computeGoldUnit,
  computeLevelGold,
  computePaceFactorBp,
  computeTierGrowthBp,
  computeTierPrice,
  computeUpgCost,
  renderTables,
} from "../scripts/gen-tables.ts";
import {
  GOLD_UNIT,
  LEVEL_GOLD,
  PACE_FACTOR_BP,
  TIER_GROWTH_BP,
  TIER_PRICE,
  UPG_COST,
} from "../src/tables.generated.ts";

describe("generated tables", () => {
  test("PACE_FACTOR_BP matches a fresh generation of (35/pace)^0.7 clamped to 0.6..1.8", () => {
    expect([...PACE_FACTOR_BP]).toEqual(computePaceFactorBp());
    expect(PACE_FACTOR_BP).toHaveLength(106);
    expect(PACE_FACTOR_BP[35 - 15]).toBe(10_000);
    expect(PACE_FACTOR_BP[0]).toBe(18_000);
    expect(PACE_FACTOR_BP[120 - 15]).toBe(6000);
  });

  test("every economy table equals a fresh generation from BALANCE", () => {
    expect([...TIER_GROWTH_BP]).toEqual(computeTierGrowthBp());
    expect([...TIER_PRICE]).toEqual(computeTierPrice());
    expect(UPG_COST.map((r) => [...r])).toEqual(computeUpgCost());
    expect([...GOLD_UNIT]).toEqual(computeGoldUnit());
    expect(LEVEL_GOLD.map((r) => [...r])).toEqual(computeLevelGold());
    expect([
      TIER_GROWTH_BP.length,
      TIER_PRICE.length,
      UPG_COST.length,
      UPG_COST[0]?.length,
    ]).toEqual([10, 10, 10, 15]);
    expect([GOLD_UNIT.length, LEVEL_GOLD.length, LEVEL_GOLD[0]?.length]).toEqual([30, 30, 10]);
    expect(TIER_GROWTH_BP[9]).toBe(206_610); // 1.4^9 = 20.661
  });

  test("tables.generated.ts on disk equals the generator output number for number", () => {
    const file = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/tables.generated.ts",
    );
    const nums = (t: string): string[] => t.match(/\d+/g) ?? [];
    // formatting (biome) may reflow the array; the numbers must match exactly
    expect(nums(fs.readFileSync(file, "utf8"))).toEqual(nums(renderTables()));
  });
});

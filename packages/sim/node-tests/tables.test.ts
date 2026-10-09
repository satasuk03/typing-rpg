import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { computePaceFactorBp, renderTables } from "../scripts/gen-tables.ts";
import { PACE_FACTOR_BP } from "../src/tables.generated.ts";

describe("generated tables", () => {
  test("PACE_FACTOR_BP matches a fresh generation of (35/pace)^0.7 clamped to 0.6..1.8", () => {
    expect([...PACE_FACTOR_BP]).toEqual(computePaceFactorBp());
    expect(PACE_FACTOR_BP).toHaveLength(106);
    expect(PACE_FACTOR_BP[35 - 15]).toBe(10_000);
    expect(PACE_FACTOR_BP[0]).toBe(18_000);
    expect(PACE_FACTOR_BP[120 - 15]).toBe(6000);
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

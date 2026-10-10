import { describe, expect, it } from "vitest";
import { BIOME_IDS, BIOMES, blendMood, isBiomeId, validateMood } from "./biomes";

describe("biome presets", () => {
  it("define the Ch1 biomes plus hushwood, fen and grove", () => {
    expect([...BIOME_IDS].sort()).toEqual([
      "boss",
      "cave",
      "fen",
      "forest",
      "grove",
      "hushwood",
      "ruins",
    ]);
    for (const id of BIOME_IDS) expect(BIOMES[id]).toBeDefined();
  });

  it.each(BIOME_IDS)("%s passes validation", (id) => {
    expect(validateMood(BIOMES[id])).toEqual([]);
  });

  it("keeps the POC values", () => {
    expect(BIOMES.forest.sunCol).toEqual([1.75, 1.5, 1.08]);
    expect(BIOMES.cave.exposure).toBe(1.3);
    expect(BIOMES.ruins.fog).toEqual([0.014, 13, 0.25]);
  });

  it("gives only the boss hollow a letterbox", () => {
    expect(BIOMES.boss.bars).toBeGreaterThan(0);
    expect(BIOMES.cave.bars).toBe(0);
  });

  it("keeps the Ch2 night moods cool, lit from the hero side, and bar-free outside the boss intro", () => {
    for (const id of ["hushwood", "grove"] as const) {
      const m = BIOMES[id];
      expect(m.sunCol[2]).toBeGreaterThan(m.sunCol[0]);
      expect(m.fogCol[2]).toBeGreaterThan(m.fogCol[0]);
      expect(m.caveK).toBeGreaterThan(0);
    }
    expect(BIOMES.hushwood.bars).toBe(0);
    expect(BIOMES.grove.ambient).toBe("leaves");
  });

  it("keeps the fen warm-lit from low behind, green-gold, with fireflies", () => {
    const m = BIOMES.fen;
    expect(m.sunCol[0]).toBeGreaterThan(m.sunCol[2]);
    expect(m.sunDir[1]).toBeLessThan(0.5);
    expect(m.gain[2]).toBeLessThan(1);
    expect(m.ambient).toBe("fireflies");
  });

  it("rejects broken presets", () => {
    const bad = { ...BIOMES.forest, exposure: 0, vig: 2, sunDir: [0, 0, 0] as const };
    const errs = validateMood(bad);
    expect(errs.some((e) => e.startsWith("exposure"))).toBe(true);
    expect(errs.some((e) => e.startsWith("vig"))).toBe(true);
    expect(errs.some((e) => e.startsWith("sunDir"))).toBe(true);
    expect(validateMood({ ...BIOMES.cave, amb: [Number.NaN, 0, 0] }).length).toBeGreaterThan(0);
    expect(validateMood({ ...BIOMES.cave, lift: [-1, 0, 0] }).length).toBeGreaterThan(0);
  });

  it("recognises biome ids", () => {
    expect(isBiomeId("cave")).toBe(true);
    expect(isBiomeId("desert")).toBe(false);
    expect(isBiomeId(undefined)).toBe(false);
  });

  it("blends linearly and stays valid", () => {
    const a = BIOMES.forest;
    const b = BIOMES.cave;
    expect(blendMood(a, b, 0).exposure).toBeCloseTo(a.exposure);
    expect(blendMood(a, b, 1).exposure).toBeCloseTo(b.exposure);
    const mid = blendMood(a, b, 0.5);
    expect(mid.exposure).toBeCloseTo((a.exposure + b.exposure) / 2);
    expect(mid.amb[0]).toBeCloseTo((a.amb[0] + b.amb[0]) / 2);
    expect(validateMood(mid)).toEqual([]);
  });
});

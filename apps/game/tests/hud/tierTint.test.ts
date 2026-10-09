import { describe, expect, it } from "vitest";
import {
  blendTints,
  FILL,
  prismLetter,
  TIER_TINTS,
  TINT_KINDS,
  tintFor,
  typoColorFor,
} from "../../src/hud/fx/typing/palette";
import { contrastRatio, PLATE_PALETTES } from "../../src/hud/theme";
import { PRISM_BUCKETS, TIER_ACCENT_HEX, TIER_TYPED_HEX } from "../../src/level/typingFxParams";

const ALLOWED = ["word", "minigame", "trial"] as const;

describe("tier tint contrast (R5)", () => {
  for (const kind of ALLOWED) {
    const pal = PLATE_PALETTES[kind];
    it(`every typed tier colour is >= 4.5 on ${kind} bg0 and bg1`, () => {
      expect(pal).toBeDefined();
      for (const col of TIER_TYPED_HEX) {
        expect(contrastRatio(col, pal?.bg0 as string), `${col} on bg0`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(col, pal?.bg1 as string), `${col} on bg1`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`every one of the 12 prismatic buckets is >= 4.5 on ${kind} bg0 and bg1`, () => {
      expect(PRISM_BUCKETS).toHaveLength(12);
      PRISM_BUCKETS.forEach((col, i) => {
        expect(
          contrastRatio(col, pal?.bg0 as string),
          `bucket ${i} ${col} on bg0`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(col, pal?.bg1 as string),
          `bucket ${i} ${col} on bg1`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it("the typo glitch colour keeps >= 4.5 on every plate palette (red, and amber for zen)", () => {
    for (const kind of Object.keys(PLATE_PALETTES)) {
      const pal = PLATE_PALETTES[kind] as { bg0: string; bg1: string };
      for (const amber of [false, true]) {
        const col = typoColorFor(pal.bg0, pal.bg1, amber);
        const tag = `${kind} ${amber ? "amber" : "red"}`;
        expect(contrastRatio(col, pal.bg0), `${tag} on bg0`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(col, pal.bg1), `${tag} on bg1`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // word plates keep the (lightened, see the tuning log) base red
    const word = PLATE_PALETTES.word as { bg0: string; bg1: string };
    expect(typoColorFor(word.bg0, word.bg1, false)).toBe("#ff8878");
  });
  it("the prismatic per-letter colour is always a pre-built bucket (or the fixed pink)", () => {
    for (let i = 0; i < 40; i++)
      for (const t of [0, 0.3, 1.7, 9.9]) {
        expect(PRISM_BUCKETS).toContain(prismLetter(i, t, false));
        expect(prismLetter(i, t, true)).toBe("#ff7ad9");
      }
  });
});

describe("tint application rules", () => {
  it("only word / minigame / trial plates take a tint", () => {
    expect([...TINT_KINDS].sort()).toEqual(["minigame", "trial", "word"]);
    for (const kind of ["guard", "doom", "finisher", "secondWind"])
      expect(tintFor(3, kind)).toBeNull();
    for (const kind of ALLOWED) expect(tintFor(3, kind)?.typed).toBe(TIER_TYPED_HEX[3]);
  });
  it("tier 0 has no tint (the plate keeps its own palette)", () => {
    expect(tintFor(0, "word")).toBeNull();
  });
  it("tier 4 is the prismatic tint", () => {
    expect(TIER_TINTS[4]?.prism).toBe(true);
    expect(TIER_TINTS[3]?.prism).toBe(false);
  });
  it("cross-fade blends colours between tiers and is exact at the ends", () => {
    expect(blendTints(1, 2, 0).typed).toBe(TIER_TYPED_HEX[1]);
    expect(blendTints(1, 2, 1).typed).toBe(TIER_TYPED_HEX[2]);
    const mid = blendTints(1, 2, 0.5);
    expect(mid.typed).not.toBe(TIER_TYPED_HEX[1]);
    expect(mid.typed).not.toBe(TIER_TYPED_HEX[2]);
    // prismatic jumps straight in
    expect(blendTints(3, 4, 0.2).prism).toBe(false);
    expect(blendTints(3, 4, 0.8).prism).toBe(true);
  });
  it("palette strings are pre-built: tier accents and spark mixes exist", () => {
    for (let t = 0; t < 5; t++) expect(FILL[t]).toBe(TIER_ACCENT_HEX[t]);
    expect(FILL.every((s) => typeof s === "string" && s.startsWith("#"))).toBe(true);
  });
});

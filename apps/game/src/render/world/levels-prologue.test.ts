import { describe, expect, it } from "vitest";
import { STORM_GOLD } from "../biomes";
import { parseLevelLayout } from "./layout";
import { levelIds, loadLevel, rawLevel } from "./registry";

describe("prologue layout", () => {
  it('loads and validates under the id "prologue" without a rename', () => {
    expect(levelIds()).toContain("prologue");
    const layout = loadLevel("prologue");
    expect(layout.id).toBe("prologue");
    expect(parseLevelLayout(rawLevel("prologue")).id).toBe("prologue");
  });

  it("its Word Gate mood tweak matches STORM_GOLD field by field", () => {
    const layout = loadLevel("prologue");
    expect(layout.segments.length).toBeGreaterThan(0);
    const mood = layout.segments[0]?.mood ?? {};
    // The segment mood is a MoodTweak (a subset of BiomeMood), so compare every field it sets.
    const keys = Object.keys(mood) as (keyof typeof mood)[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(mood[k], `mood.${k}`).toEqual(STORM_GOLD[k]);
    }
  });
});

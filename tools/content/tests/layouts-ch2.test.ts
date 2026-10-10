import { describe, expect, it } from "vitest";
import { CH2_LAYOUT_PLAN, type Layout, loadLayouts, ruleCh2Layouts } from "../src/index.ts";

const layouts = loadLayouts();
const ch2 = layouts.filter((l) => l.id.startsWith("ch2-"));
const clone = (l: Layout): Layout => structuredClone(l);

describe("T2.4 chapter 2 world layouts", () => {
  it("loads all ten and passes the plan rules (biome per level, encounters, anchors)", () => {
    expect(ch2.map((l) => l.id)).toEqual(CH2_LAYOUT_PLAN.map((p) => p.id));
    expect(ruleCh2Layouts(layouts)).toEqual([]);
  });

  it("does nothing when no Ch2 layout exists", () => {
    expect(ruleCh2Layouts(layouts.filter((l) => l.id.startsWith("ch1-")))).toEqual([]);
  });

  it("flags a wrong biome, a missing slot anchor and a missing Willow anchor", () => {
    const mk = (f: (l: Layout) => void, id: string): string[] => {
      const copy = layouts.filter((l) => l.id !== id);
      const l = clone(layouts.find((x) => x.id === id) as Layout);
      f(l);
      return ruleCh2Layouts([...copy, l]).map((i) => i.message);
    };
    expect(mk((l) => (l.biome = "forest"), "ch2-l03").some((m) => m.includes("plan says"))).toBe(
      true,
    );
    expect(
      mk((l) => (l.anchors = l.anchors.filter((a) => a !== "enc1.slot1")), "ch2-l05").some((m) =>
        m.includes("enc1.slot1"),
      ),
    ).toBe(true);
    expect(
      mk((l) => (l.anchors = l.anchors.filter((a) => a !== "riddle.leaf2")), "ch2-l10").some((m) =>
        m.includes("riddle.leaf2"),
      ),
    ).toBe(true);
    expect(mk((l) => (l.groundKind = "forest"), "ch2-l06").some((m) => m.includes("ground"))).toBe(
      true,
    );
  });
});

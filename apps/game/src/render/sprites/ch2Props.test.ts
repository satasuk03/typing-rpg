import { describe, expect, it } from "vitest";
import { FOG_CARDS } from "../ambient/fogCards";
import { loadLevel } from "../world/registry";
import { ProceduralSpriteSource } from "./ProceduralSpriteSource";

const GROUND_PROPS = [
  "oak.0",
  "oak.1",
  "oak.2",
  "oak.3",
  "oak.4",
  "lpost.0",
  "lpost.1",
  "waystone",
  "shroomT",
  "shroomV",
  "rootarch",
  "fern.0",
  "fern.1",
  "willowCore",
];
const HANGING = [
  "lantern.0",
  "lantern.1",
  "lantern.2",
  "moss.0",
  "moss.1",
  ...["silver", "hush", "gold", "bloom"].flatMap((t) =>
    [0, 1, 2, 3].map((i) => `fronds.${t}.${i}`),
  ),
];

describe("Ch2 props (T2.1)", () => {
  const src = new ProceduralSpriteSource();

  it("registers every prop with a flip twin (so flipped props negate normal.x)", () => {
    for (const k of [...GROUND_PROPS, ...HANGING]) {
      expect(src.has(`prop.ch2.${k}`), k).toBe(true);
      expect(src.has(`prop.ch2.${k}.flip`), `${k}.flip`).toBe(true);
    }
  });

  it("leaves Ch1 prop keys without flip twins, so Ch1 rendering is untouched", () => {
    expect(src.has("prop.tree.0")).toBe(true);
    expect(src.has("prop.tree.0.flip")).toBe(false);
  });

  it("has fog cards for the Ch2 night moods only", () => {
    expect(FOG_CARDS.hushwood?.length).toBe(3);
    expect(FOG_CARDS.grove?.length).toBe(3);
    expect(FOG_CARDS.forest).toBeUndefined();
    for (const d of [...(FOG_CARDS.hushwood ?? []), ...(FOG_CARDS.grove ?? [])]) {
      if (d.z > -3) expect(d.y + d.h / 2).toBeLessThanOrEqual(1.5); // action-band cards never veil the actors' bodies
    }
  });

  it("defaults a Ch1 layout to the forest ground kind", () => {
    expect(loadLevel("ch1-l02").ground.kind).toBe("forest");
  });
});

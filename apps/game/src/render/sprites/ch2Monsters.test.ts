import { describe, expect, it } from "vitest";
import {
  CH2_MONSTER_IDS,
  CH2_SCALE,
  ELITE_FX,
  ELITE_SCALE,
  eliteKey,
  WILLOW_FACE_Y_M,
  WILLOW_LAYOUT,
} from "./ch2Monsters";
import { ProceduralSpriteSource } from "./ProceduralSpriteSource";

describe("Ch2 monsters (T2.3)", () => {
  const src = new ProceduralSpriteSource();

  it("registers the five enemies, the Willow and its lash roots, each with idle + atk", () => {
    // `frames()` is lazy and needs a DOM canvas, so only the registry is checked here (the contact sheet is the pixel test).
    for (const id of [...CH2_MONSTER_IDS, "willow", "willow.lash"]) {
      expect(src.has(`monster.${id}`), id).toBe(true);
    }
  });

  it("offers an elite render variant for every Ch2 enemy and none for Ch1", () => {
    for (const id of CH2_MONSTER_IDS) expect(src.has(eliteKey(`monster.${id}`)), id).toBe(true);
    for (const id of ["slimeG", "slimeP", "bat", "goblin", "goblinR", "golem"]) {
      expect(src.has(`monster.${id}.elite`), id).toBe(false);
    }
  });

  it("keeps the brief's scales and the elite read constants", () => {
    expect(CH2_SCALE.wolf).toBe(1.45);
    expect(CH2_SCALE.toad).toBe(1.3);
    expect(ELITE_SCALE).toBe(1.08);
    expect(ELITE_FX.rim.strength).toBe(0.42);
    expect(ELITE_FX.sigil.radius).toBe(3.4);
  });

  it("anchors the Willow's plate at the face and lays out 4 front + 3 back frond curtains", () => {
    expect(WILLOW_FACE_Y_M).toBeGreaterThan(4.5);
    expect(WILLOW_FACE_Y_M).toBeLessThan(5);
    expect(WILLOW_LAYOUT.frontFronds).toHaveLength(4);
    expect(WILLOW_LAYOUT.backFronds).toHaveLength(3);
    expect(WILLOW_LAYOUT.lashRoots).toHaveLength(2);
  });
});

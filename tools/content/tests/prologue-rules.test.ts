import { type ContentBundle, contentBundle } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { loadMonsterSprites, ruleEnemies, ruleIdsAndRefs, rulePrologue } from "../src/index.ts";

const clone = (): ContentBundle => structuredClone(contentBundle);
const errs = (b: ContentBundle): string[] =>
  rulePrologue(b)
    .filter((i) => i.severity === "error")
    .map((i) => i.message);

describe("v2.2 prologue content", () => {
  it("the real bundle has the prologue, the nul enemy and boss", () => {
    const p = contentBundle.prologue;
    expect(p?.words).toHaveLength(60);
    expect(p?.guardWords).toHaveLength(16);
    expect(contentBundle.enemies.find((e) => e.id === "nul")?.scale).toBe(1);
    expect(contentBundle.bosses.find((x) => x.id === "nul")?.phase1.endAtHpPct).toBe(35);
    expect(p?.kit.actives.map((a) => a.id)).toEqual([
      "fireball",
      "aegis",
      "slashWave",
      "piercingThrust",
      "mendingLight",
      "frostLock",
    ]);
    expect(p?.kit.passives).toHaveLength(9);
  });
  it("has no prologue errors, no ref errors (prologue-only boss exempt), and the nul sprite resolves", () => {
    expect(errs(contentBundle)).toEqual([]);
    expect(ruleIdsAndRefs(contentBundle).filter((i) => i.severity === "error")).toEqual([]);
    expect(
      ruleEnemies(contentBundle, loadMonsterSprites()).filter((i) => i.severity === "error"),
    ).toEqual([]);
  });
  it("a bundle without a prologue is valid", () => {
    const b = clone();
    delete b.prologue;
    expect(rulePrologue(b)).toEqual([]);
  });
  it("catches unknown kit ids and Reveal", () => {
    const b = clone();
    const k = b.prologue?.kit;
    if (!k) throw new Error("no prologue");
    k.actives.push({ id: "reveal", startChargePct: 0 });
    k.passives.push("nope" as never);
    const e = errs(b);
    expect(e.some((m) => m.includes("reveal"))).toBe(true);
    expect(e.some((m) => m.includes('unknown passive "nope"'))).toBe(true);
  });
  it("catches too few first letters, a guard overlap and bad word length", () => {
    const b = clone();
    const p = b.prologue;
    if (!p) throw new Error("no prologue");
    p.words = p.words.filter((w) => "sfhw".includes(w.charAt(0))).concat(["sunny", "fiery"]);
    p.guardWords[0] = p.words[0] as string;
    p.words.push("toolong");
    const e = errs(b);
    expect(e.some((m) => m.includes("distinct first letters"))).toBe(true);
    expect(e.some((m) => m.includes("also a plate word"))).toBe(true);
    expect(e.some((m) => m.includes("3-5 lowercase"))).toBe(true);
  });
  it("catches gimmicks, elites, a non-rubble minigame and a bad climax gate", () => {
    const b = clone();
    const p = b.prologue;
    const nul = b.bosses.find((x) => x.id === "nul");
    if (!p || !nul) throw new Error("no prologue");
    const seg = p.segments[0];
    if (seg?.kind === "encounter")
      seg.encounter.waves[0]?.push({ enemy: "hush-shade", gimmick: "fading" });
    nul.phase1.adds.push({ enemy: "lantern-wisp", gimmick: "scrambled" });
    nul.phase1.endAtHpPct = 20;
    (nul.phase3 as { minigame: unknown }).minigame = {
      kind: "riddle",
      count: 5,
      leaves: 3,
      readS: 9,
      answerS: 6,
      gapS: 1,
      clearAtkMult: 1,
      missHit: 1,
      lengthRange: [3, 8],
    };
    const e = errs(b);
    expect(e.some((m) => m.includes('gimmick "fading"'))).toBe(true);
    expect(e.some((m) => m.includes('add gimmick "scrambled"'))).toBe(true);
    expect(e.some((m) => m.includes("fallingRubble"))).toBe(true);
    expect(e.some((m) => m.includes("climax gate"))).toBe(true);
  });
  it("catches an unknown enemy and boss reference", () => {
    const b = clone();
    const p = b.prologue;
    if (!p) throw new Error("no prologue");
    const seg = p.segments[0];
    if (seg?.kind === "encounter") seg.encounter.waves[0]?.push({ enemy: "nope" });
    p.segments[1] = { kind: "boss", bossId: "ghost" };
    const e = errs(b);
    expect(e.some((m) => m.includes('unknown enemy "nope"'))).toBe(true);
    expect(e.some((m) => m.includes('unknown boss "ghost"'))).toBe(true);
  });
  it("warns (not errors) on a HP floor above Last Stand and on words shared with level pools", () => {
    const b = clone();
    if (!b.prologue) throw new Error("no prologue");
    b.prologue.heroHpFloorPct = 50;
    const w = rulePrologue(b).filter((i) => i.severity === "warn");
    expect(w.some((i) => i.message.includes("heroHpFloorPct"))).toBe(true);
    // pooled-word freshness is a warning, never an error
    expect(errs(b)).toEqual([]);
  });
});

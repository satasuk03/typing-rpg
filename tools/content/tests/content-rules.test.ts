import { type ContentBundle, contentBundle } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import {
  loadLayouts,
  loadMonsterSprites,
  loadSfxIds,
  ruleEnemies,
  ruleGear,
  ruleGimmicks,
  ruleIdsAndRefs,
  ruleLayouts,
  ruleLevelWords,
  ruleSkills,
  ruleStars,
  runContentRules,
} from "../src/index.ts";

const ctx = {
  layouts: loadLayouts(),
  sfxIds: loadSfxIds(),
  monsterSprites: loadMonsterSprites(),
};
const clone = (): ContentBundle => structuredClone(contentBundle);
const errors = (issues: { severity: string }[]): number =>
  issues.filter((i) => i.severity === "error").length;

describe("T4.2 content rules on the real bundle", () => {
  it("finds the 10 world layouts, the SFX list and the sprite list", () => {
    expect(ctx.layouts.map((l) => l.id)).toContain("ch1-l10");
    expect(ctx.sfxIds).toContain("skillFire");
    expect(ctx.monsterSprites).toContain("golem");
  });
  it("has no errors", () => {
    expect(errors(runContentRules(contentBundle, ctx))).toBe(0);
  });
});

describe("T4.2 content rules catch breakage", () => {
  it("unknown enemy reference", () => {
    const b = clone();
    const seg = b.levels[0]?.segments.find((s) => s.kind === "encounter");
    if (seg?.kind === "encounter") seg.encounter.waves[0]?.push({ enemy: "nope" });
    expect(ruleIdsAndRefs(b).some((i) => i.message.includes('unknown enemy "nope"'))).toBe(true);
  });
  it("too many enemies for the anchors", () => {
    const b = clone();
    const seg = b.levels[0]?.segments.find((s) => s.kind === "encounter");
    if (seg?.kind === "encounter") {
      seg.encounter.waves[0] = [
        { enemy: "moss-slime" },
        { enemy: "moss-slime" },
        { enemy: "moss-slime" },
      ];
    }
    expect(ruleLayouts(b, ctx.layouts).some((i) => i.message.includes("slots"))).toBe(true);
  });
  it("wrong encounter count, biome and name", () => {
    const b = clone();
    const l = b.levels[2];
    if (l) {
      l.segments = l.segments.slice(0, 4);
      l.biome = "cave";
      l.name = "Wrong";
    }
    const msgs = ruleLayouts(b, ctx.layouts).map((i) => i.message);
    expect(msgs.some((m) => m.includes("encounters but the layout has"))).toBe(true);
    expect(msgs.some((m) => m.includes("biome"))).toBe(true);
    expect(msgs.some((m) => m.includes("name"))).toBe(true);
  });
  it("level without a layout", () => {
    const b = clone();
    const l = b.levels[0];
    if (l) l.id = "ch1-l99";
    expect(ruleLayouts(b, ctx.layouts).some((i) => i.message.includes("no world layout"))).toBe(
      true,
    );
  });
  it("gimmick that debuts together with another", () => {
    const b = clone();
    const seg = b.levels[3]?.segments.find(
      (s) => s.kind === "encounter" && s.encounter.name === "The Fading Sign",
    );
    if (seg?.kind === "encounter") {
      seg.encounter.waves[0] = [
        { enemy: "cave-bat", gimmick: "scrambled" },
        { enemy: "goblin-scout", gimmick: "fading" },
        { enemy: "murk-slime" },
      ];
    }
    expect(ruleGimmicks(b).some((i) => i.message.includes("not alone"))).toBe(true);
  });
  it("star challenges: bad slack, unreachable streak, repeated kind", () => {
    const b = clone();
    const [l1, l2, l3] = b.levels;
    if (l1 && l2 && l3) {
      l1.star3 = { kind: "streak", combo: 30 };
      l2.star3 = { kind: "parTime", slack: 3 };
      l3.star3 = { kind: "parTime", slack: 1.2 };
    }
    const msgs = ruleStars(b).map((i) => i.message);
    expect(msgs.some((m) => m.includes("out of reach"))).toBe(true);
    expect(msgs.some((m) => m.includes("slack"))).toBe(true);
    expect(msgs.some((m) => m.includes("same challenge kind"))).toBe(true);
  });
  it("tier mix and plate band", () => {
    const b = clone();
    const l = b.levels[1];
    if (l) {
      l.tierMix = { current: 50, review: 30, biome: 15, weak: 5 };
      l.plateLength = [3, 3];
    }
    const msgs = ruleLevelWords(b).map((i) => i.message);
    expect(msgs.some((m) => m.includes("60/20/15/5"))).toBe(true);
    expect(msgs.some((m) => m.includes("biome pool in band"))).toBe(true);
  });
  it("incomplete gear matrix", () => {
    const b = clone();
    b.gear = b.gear.filter((g) => !(g.archetype === "staff" && g.tier === 2));
    expect(ruleGear(b).some((i) => i.message.includes("tier 2 staff"))).toBe(true);
  });
  it("skills: missing id, bad sfx, bad unlock level, bad placeholder", () => {
    const b = clone();
    b.actives = b.actives.filter((a) => a.id !== "frostLock");
    const f = b.actives.find((a) => a.id === "fireball");
    if (f) {
      f.sfxId = "boom";
      f.description = "Burns {heal}.";
    }
    const a = b.actives.find((x) => x.id === "slashWave");
    if (a) a.unlockLevel = "ch9-l9";
    const msgs = ruleSkills(b, ctx.sfxIds).map((i) => i.message);
    expect(msgs.some((m) => m.includes('missing active "frostLock"'))).toBe(true);
    expect(msgs.some((m) => m.includes("not an audio effect"))).toBe(true);
    expect(msgs.some((m) => m.includes("unknown placeholder"))).toBe(true);
    expect(msgs.some((m) => m.includes("does not exist"))).toBe(true);
  });
  it("enemy sprite not in the renderer and uncovered weakness", () => {
    const b = clone();
    const e = b.enemies[0];
    if (e) e.spriteId = "nope";
    for (const x of b.enemies) x.weaknesses = ["slash"];
    const msgs = ruleEnemies(b, ctx.monsterSprites).map((i) => i.message);
    expect(msgs.some((m) => m.includes("not a renderer sprite"))).toBe(true);
    expect(msgs.some((m) => m.includes("weak to blunt"))).toBe(true);
  });
  it("boss finisher must come from the finisher pool", () => {
    const b = clone();
    const x = b.bosses[0];
    if (x) x.phase3.finisherText = "Not a pooled finisher.";
    expect(ruleIdsAndRefs(b).some((i) => i.message.includes("finisherText"))).toBe(true);
  });
});

describe("T4.3 riddle-boss pool rule and Ch2 content", () => {
  it("sees the Ch2 sprites and has no errors on the Ch2 levels", () => {
    expect(ctx.monsterSprites).toContain("wisp");
    expect(ctx.monsterSprites).toContain("willow");
    expect(errors(runContentRules(contentBundle, ctx))).toBe(0);
  });
  it("fails a riddle boss whose pool is smaller than count + 2", () => {
    const b = clone();
    let kept = 0;
    b.words = b.words.filter((w) => !w.uses.includes("riddle") || kept++ < 6);
    expect(
      ruleIdsAndRefs(b).some(
        (i) =>
          i.rule === "boss" &&
          i.message.includes("riddle pool has") &&
          i.message.includes("need 7"),
      ),
    ).toBe(true);
  });
  it("fails a riddle boss whose pool has fewer than 3 first letters", () => {
    const b = clone();
    b.words = b.words.map((w) =>
      w.uses.includes("riddle") && !w.text.startsWith("a") && !w.text.startsWith("b")
        ? { ...w, uses: w.uses.filter((u) => u !== "riddle") as typeof w.uses }
        : w,
    );
    expect(
      ruleIdsAndRefs(b).some((i) => i.rule === "boss" && i.message.includes("riddle pool has")),
    ).toBe(true);
  });
});

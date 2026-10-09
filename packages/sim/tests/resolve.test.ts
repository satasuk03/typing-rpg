// T1.5: resolveLevel maps the real content bundle to the integer ResolvedLevel (normal and boss levels).
import { CONTENT_VERSION, contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { mulDiv } from "../src/fixed.ts";
import { resolveLevel } from "../src/index.ts";

const resolve = (id: string, due: string[] = []) =>
  resolveLevel(contentBundle, id, { dueWeakWords: due });

describe("resolveLevel", () => {
  test("is deterministic and its contentVersion is the bundle's CONTENT_VERSION", () => {
    const a = resolve("ch1-l10");
    expect(a).toEqual(resolve("ch1-l10"));
    expect(a.contentVersion).toBe(CONTENT_VERSION);
  });

  test("a normal level: segments in ticks and milli, gimmick refs, enemy table, pools", () => {
    const l = resolve("ch1-l04", ["lantern", "lantern", "ember"]);
    expect(l).toMatchObject({
      levelId: "ch1-l04",
      chapter: 1,
      index: 4,
      isBoss: false,
      boss: null,
    });
    expect(l.segments[0]).toEqual({ kind: "walk", ticks: 7 * 60, heal: false });
    const enc2 = l.segments[3];
    expect(enc2).toMatchObject({
      kind: "encounter",
      name: "The Fading Sign",
      hpPoolM: 211_300,
      gruntHitM: 4460,
    });
    expect(enc2?.kind === "encounter" && enc2.waves[0]?.map((r) => r.gimmick)).toEqual([
      null,
      "fading",
      null,
    ]);
    expect(Object.keys(l.enemies).sort()).toEqual([
      "cave-bat",
      "goblin-scout",
      "moss-slime",
      "murk-slime",
    ]);
    expect(l.enemies["goblin-scout"]).toMatchObject({
      baseIntervalTicks: 540,
      hpWeightBp: 14_000,
      hitWeightBp: 11_000,
      shield: 3,
    });
    expect(l.words.weak).toEqual(["ember"]); // de-duplicated, order kept; "lantern" is longer than the level plateLength
    expect(l.words.current.length).toBeGreaterThan(100);
    expect(l.words.guard.length).toBeGreaterThan(20);
    expect(l.tierMixBp).toEqual({ current: 6000, review: 2000, biome: 1500, weak: 500 });
    expect(l.parHpM).toBe(100_000);
    expect(l.star3).toEqual({ kind: "guardian", parries: 3 });
  });

  test("the boss level: the Ruin Golem script, adds with the derived pool, boss text pools", () => {
    const l = resolve("ch1-l10");
    expect(l.isBoss).toBe(true);
    expect(l.segments.map((s) => s.kind)).toEqual([
      "walk",
      "encounter",
      "walk",
      "encounter",
      "walk",
      "boss",
    ]);
    const b = l.boss;
    expect(b).toMatchObject({
      id: "ruin-golem",
      hpM: 752_900,
      hitM: 7980,
      enemyId: "ruin-golem",
      breatherTicks: 120,
      introTicks: 240,
    });
    expect(b?.phase1).toMatchObject({ endAtHpBp: 6600 });
    expect(b?.phase1.adds).toEqual([
      { enemyId: "goblin-scout", gimmick: "scrambled" },
      { enemyId: "cave-bat", gimmick: null },
    ]);
    // adds pool = BOSS_ADDS_HP_ENC / BOSS_HP_ENC of the boss; the hit base is the level's encounter gruntHit
    expect(b?.phase1.addsHpPoolM).toBe(mulDiv(752_900, K.BOSS_ADDS_HP_NUM, K.BOSS_ADDS_HP_DEN));
    expect(b?.phase1.addsHpPoolM).toBe(117_640);
    expect(b?.phase1.addsGruntHitM).toBe(5280);
    expect(b?.phase2).toEqual({ endAtHpBp: 3300, doomEveryTicks: 960, minDoomSpells: 2 });
    expect(b?.phase3.minigame).toEqual({
      kind: "fallingRubble",
      lanes: 3,
      spawnEveryTicks: 156,
      fallTicks: 420,
      clearAtkMultBp: 12_000,
      missHitM: 6000,
    });
    expect(b?.phase3.finisherText).toBe("Rest now, Ruin Golem, and let the old stones sleep.");
    expect(Object.keys(l.enemies)).toContain("ruin-golem");
    expect(l.words.doom.length).toBeGreaterThanOrEqual(10);
    expect(l.words.minigame.length).toBeGreaterThanOrEqual(10);
    expect(l.words.finisher).toContain(b?.phase3.finisherText);
    expect(l.words.secondWind.length).toBeGreaterThan(5);
  });

  test("every Chapter 1 level resolves", () => {
    for (const lv of contentBundle.levels) {
      const r = resolve(lv.id);
      expect(r.segments.length).toBe(lv.segments.length);
      expect(r.isBoss).toBe(lv.kind === "boss");
    }
  });

  test("an unknown level is an error", () => {
    expect(() => resolve("ch9-l99")).toThrow(/unknown level/);
  });
});

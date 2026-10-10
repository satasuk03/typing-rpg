// T1.3: the persona bot answers the Riddle of Leaves (picks the right leaf with the persona's accuracy), so a riddle boss
// can be cleared by `pnpm bot --chapter 2` once T4.3 ships the real Willow. Until then the boss is test-only data on the
// real Ch2 vocabulary (the shipped bundle has no Willow yet).
import { BossDef, type ContentBundle, contentBundle, LevelDef } from "@hd2d/content";
import { resolveLevel } from "@hd2d/sim";
import { describe, expect, test } from "vitest";
import { drawAttempt, PERSONAS, playLevel, starterLoadout } from "../src/index.ts";

const boss = BossDef.parse({
  id: "willow-test",
  name: "Whispering Willow",
  title: "Keeper of the Hush",
  enemyId: "ruin-golem",
  hp: 120,
  hit: 5,
  attackPower: 1.3,
  plateLength: [4, 7],
  phase1: { adds: [{ enemy: "goblin-scout", gimmick: "fading" }], addsAttackPower: 1.25 },
  phase2: { doomEveryS: 12, minDoomSpells: 1 },
  phase3: {
    minigame: { kind: "riddle", readS: 3, answerS: 6, clearAtkMult: 3, missHit: 4 },
    finisherText: "Rest now, Willow, and let the words go home.",
  },
});
const level = LevelDef.parse({
  id: "ch2-l10",
  chapter: 2,
  index: 10,
  name: "Willow test",
  biome: "grove",
  layoutId: "ch2-l10",
  kind: "boss",
  wordTier: 1,
  plateLength: [3, 8],
  segments: [
    { kind: "walk", seconds: 5, heal: false },
    { kind: "boss", bossId: "willow-test" },
  ],
  star3: { kind: "streak", combo: 10 },
  parRefS: 200,
  reviewBiomes: ["forest", "ruins", "cave"],
});
const bundle: ContentBundle = {
  ...contentBundle,
  bosses: [...contentBundle.bosses, boss],
  levels: [...contentBundle.levels, level],
};
const def = resolveLevel(bundle, "ch2-l10", { dueWeakWords: [] });

describe("the persona bot on a riddle boss", () => {
  const persona = PERSONAS.find((p) => p.id === "average") as (typeof PERSONAS)[number];
  const run = (seed: number) =>
    playLevel({
      def,
      loadout: starterLoadout("starter", 2),
      seed,
      attempt: drawAttempt(persona, seed, false),
      options: {
        pace: 40,
        difficulty: "standard",
        comboMode: "gentle",
        caseMode: "auto",
        autoUnlockAfterTypos: 0,
        firstClear: true,
        frontierChapter: 2,
        goldMultBp: 10_000,
        allowExternalRevive: false,
        tutorial: false,
      },
    });

  test("the Willow level resolves with a riddle pool and exact-case Hush Spells", () => {
    expect(def.boss?.phase3.minigame.kind).toBe("riddle");
    expect((def.riddles ?? []).length).toBeGreaterThanOrEqual(40);
    expect(def.words.doom.every((s) => /[A-Z]/.test(s))).toBe(true);
  });

  test("the bot clears it, lands riddle hits (minigame damage), spawns no falling rubble, and is deterministic", () => {
    const seeds = [11, 12, 13, 14];
    const records = seeds.map(run);
    expect(records.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(3);
    for (const r of records) {
      expect(r.rubbleSpawned).toBe(0);
      expect(r.dmgByOrigin.minigame).toBeGreaterThan(0); // right answers
    }
    expect(run(11)).toEqual(records[0]);
  }, 60_000);
});

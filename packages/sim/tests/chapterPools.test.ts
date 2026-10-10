// T1.1 WordEntry.chapter pool scoping + LevelDef.reviewBiomes in resolveLevel (docs/interfaces.md §6, §13.4.1).
import { type ContentBundle, contentBundle, type WordEntry, withCh2Stubs } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { resolveLevel } from "../src/index.ts";

const base = withCh2Stubs(contentBundle);
const word = (text: string, extra: Partial<WordEntry> = {}): WordEntry =>
  ({
    key: text.toLowerCase(),
    text,
    kind: "word",
    tier: 1,
    biomes: [],
    uses: ["plate"],
    ...extra,
  }) as unknown as WordEntry;
const sentence = (text: string, use: WordEntry["uses"][number], chapter?: number): WordEntry =>
  ({
    key: text.toLowerCase(),
    text,
    kind: "sentence",
    tier: 1,
    biomes: [],
    uses: [use],
    ...(chapter === undefined ? {} : { chapter }),
  }) as unknown as WordEntry;

/** A bundle whose words are exactly `words` (levels, enemies and bosses from the real bundle + Ch2 stubs). */
const withWords = (words: WordEntry[]): ContentBundle => ({ ...base, words });
const r = (b: ContentBundle, id: string, due: string[] = []) =>
  resolveLevel(b, id, { dueWeakWords: due });

describe("sentence pools: exact chapter match", () => {
  const b = withWords([
    sentence("Ch1 doom line", "doom"), // no chapter = 1
    sentence("Ch1 explicit", "doom", 1),
    sentence("Ch2 doom line", "doom", 2),
    sentence("Ch2 finisher", "finisher", 2),
    sentence("Ch1 finisher", "finisher"),
    sentence("Ch2 wind", "secondWind", 2),
    sentence("Ch1 wind", "secondWind"),
    sentence("Ch2 rubble", "minigame", 2),
    sentence("Ch1 rubble", "minigame"),
    word("alpha"),
  ]);
  test("Ch1 level sees only chapter 1 / absent entries", () => {
    const w = r(b, "ch1-l10").words;
    expect(w.doom).toEqual(["Ch1 doom line", "Ch1 explicit"]);
    expect(w.finisher).toEqual(["Ch1 finisher"]);
    expect(w.secondWind).toEqual(["Ch1 wind"]);
    expect(w.minigame).toEqual(["Ch1 rubble"]);
  });
  test("Ch2 level sees only chapter 2 entries (Ch1 sentences do not carry over)", () => {
    const w = r(b, "ch2-l01").words;
    expect(w.doom).toEqual(["Ch2 doom line"]);
    expect(w.finisher).toEqual(["Ch2 finisher"]);
    expect(w.secondWind).toEqual(["Ch2 wind"]);
    expect(w.minigame).toEqual(["Ch2 rubble"]);
  });
});

describe("other pools: chapter <= the level's", () => {
  const b = withWords([
    word("alpha"), // absent = 1
    word("bravo", { chapter: 1 }),
    word("dune", { chapter: 2 }),
    word("forestone", { biomes: ["forest"], chapter: 1 }),
    word("hushone", { biomes: ["hushwood"], chapter: 2 }),
    word("guardone", { uses: ["guard"] }),
    word("guardtwo", { uses: ["guard"], chapter: 2 }),
  ]);
  test("Ch1 never sees a Ch2 entry, in any pool", () => {
    const w = r(b, "ch1-l01").words;
    expect(w.current).toEqual(["alpha", "bravo"]);
    expect(w.guard).toEqual(["guardone"]);
    expect([...w.current, ...w.review, ...w.biome, ...w.guard]).not.toContain("dune");
    expect([...w.current, ...w.review, ...w.biome, ...w.guard]).not.toContain("hushone");
  });
  test("Ch2 takes Ch1 and Ch2 entries", () => {
    const w = r(b, "ch2-l01").words;
    expect(w.current).toEqual(["alpha", "bravo", "dune"]);
    expect(w.guard).toEqual(["guardone", "guardtwo"]);
    expect(w.biome).toEqual(["hushone"]); // ch2-l01 is hushwood
  });
  test("weak words are scoped by the looked-up entry's chapter", () => {
    expect(r(b, "ch1-l01", ["dune", "alpha"]).words.weak).toEqual(["alpha"]);
    expect(r(b, "ch2-l01", ["dune", "alpha"]).words.weak).toEqual(["dune", "alpha"]);
  });
});

describe("reviewBiomes", () => {
  const b = withWords([
    word("alpha"),
    word("forestone", { biomes: ["forest"], tier: 2 }), // any tier counts
    word("ruinsone", { biomes: ["ruins"] }),
    word("caveone", { biomes: ["cave"] }),
    word("hushone", { biomes: ["hushwood"], chapter: 2 }),
    word("hollowone", { biomes: ["hollow"] }),
  ]);
  test("a level with reviewBiomes reviews those biomes' plate words at any tier", () => {
    const lv = base.levels.find((l) => l.id === "ch2-l01");
    expect(lv?.reviewBiomes).toEqual(["forest", "ruins", "cave"]);
    expect(r(b, "ch2-l01").words.review).toEqual(["forestone", "ruinsone", "caveone"]);
  });
  test("without reviewBiomes the v1 rule holds (tier < wordTier, no biome): empty for a tier-1 level", () => {
    expect(r(b, "ch1-l01").words.review).toEqual([]);
  });
});

import { contentBundle, type WordEntry } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import {
  answerStems,
  clueLeaksAnswer,
  type Filters,
  isCh2Entry,
  type RuleInput,
  ruleCh2Vocab,
} from "../src/index.ts";

const filters: Filters = { blocklist: new Set(["damn"]), substrings: [], allowlist: [] };

function word(over: Partial<WordEntry> = {}): WordEntry {
  const text = over.text ?? "lantern";
  return {
    text,
    key: text.toLowerCase(),
    kind: "word",
    tier: 2,
    biomes: ["hushwood"],
    uses: ["plate"],
    definition: "a light you carry",
    example: `A ${text} glows.`,
    translations: {},
    chapter: 2,
    ...over,
  };
}
const riddle = (text: string, clue: string, over: Partial<WordEntry> = {}): WordEntry =>
  word({ text, uses: ["plate", "riddle"], clue, ...over });

const input = (words: WordEntry[]): RuleInput => ({ words, passages: [], levels: [] });
const msgs = (words: WordEntry[], rule?: string): string[] =>
  ruleCh2Vocab(input(words), filters)
    .filter((i) => i.severity === "error" && (rule === undefined || i.rule === rule))
    .map((i) => i.message);

describe("T4.1 clue leak check", () => {
  it("flags the answer, its plural and simple stems (case-insensitive)", () => {
    expect(clueLeaksAnswer("A Lantern lights the way", "lantern")).toBe(true);
    expect(clueLeaksAnswer("Two owls sit here", "owl")).toBe(true);
    expect(clueLeaksAnswer("The willowy tree", "willow")).toBe(true);
    expect(clueLeaksAnswer("Bees make me", "honey")).toBe(false);
    expect(clueLeaksAnswer("Honeycomb is sweet", "honey")).toBe(true);
    expect(clueLeaksAnswer("Stems of the sapling", "sapling")).toBe(true);
  });
  it("does not flag unrelated words that merely share letters", () => {
    expect(clueLeaksAnswer("I am an animal that hoots at night", "owl")).toBe(false);
    expect(clueLeaksAnswer("A bat flies", "bath")).toBe(false);
    expect(clueLeaksAnswer("We go to the ant hill", "ants")).toBe(false);
  });
  it("answerStems keeps the word and a 4+ letter stem", () => {
    expect(answerStems("Cherry")).toEqual(["cherry", "cherr"]);
    expect(answerStems("owl")).toEqual(["owl"]);
  });
});

describe("T4.1 chapter and band rules", () => {
  it("recognises Ch2 entries by biome or use", () => {
    expect(isCh2Entry(word())).toBe(true);
    expect(isCh2Entry(word({ biomes: ["forest"] }))).toBe(false);
    expect(isCh2Entry(word({ biomes: [], uses: ["intro"] }))).toBe(true);
  });
  it("requires chapter 2 on Ch2 entries and forbids a stray chapter 2", () => {
    expect(msgs([word({ chapter: undefined })], "chapter").length).toBe(1);
    expect(msgs([word({ biomes: ["forest"] })], "chapter").length).toBe(1);
    expect(msgs([word()], "chapter")).toEqual([]);
  });
  it("requires 12 distinct first letters per band and biome", () => {
    const few = Array.from("abcdefghijk", (c) => word({ text: `${c}aaaa`, biomes: ["fen"] }));
    expect(msgs(few, "ch2vocab").some((m) => m.includes("fen: band 3-5 has 11"))).toBe(true);
    const enough = Array.from("abcdefghijkl", (c) => word({ text: `${c}aaaa`, biomes: ["fen"] }));
    expect(msgs(enough, "ch2vocab").some((m) => m.includes("fen: band 3-5"))).toBe(false);
  });
  it("needs an uppercase letter in Ch2 sentences", () => {
    const s = (text: string): WordEntry =>
      word({ text, kind: "sentence", tier: 1, uses: ["secondWind"], biomes: ["grove"] });
    expect(msgs([s("not yet, hero")], "ch2vocab").some((m) => m.includes("uppercase"))).toBe(true);
    expect(msgs([s("Not yet, hero")], "ch2vocab").some((m) => m.includes("uppercase"))).toBe(false);
  });
});

describe("T4.1 riddle rules", () => {
  it("fails a clue that contains its answer", () => {
    const out = msgs([riddle("lantern", "A lantern lights the night")], "riddle");
    expect(out.some((m) => m.includes("contains the answer"))).toBe(true);
  });
  it("fails a riddle word with no own clue and a too-long clue", () => {
    expect(msgs([riddle("owl", undefined as unknown as string)], "riddle").length).toBeGreaterThan(
      0,
    );
    expect(msgs([riddle("owl", "x".repeat(91))], "riddle").some((m) => m.includes("max 90"))).toBe(
      true,
    );
  });
  it("fails a riddle pool with fewer than 3 distinct first letters", () => {
    const pool = ["owl", "oak", "ox"].map((t) => riddle(t, "a thing in the wood"));
    expect(msgs(pool, "riddle").some((m) => m.includes("distinct first letters"))).toBe(true);
  });
  it("passes on the real bundle: 0 errors, a rich riddle pool, every clue clean", () => {
    expect(ruleCh2Vocab(input(contentBundle.words), filters)).toEqual([]);
    const pool = contentBundle.words.filter((w) => w.uses.includes("riddle"));
    expect(pool.length).toBeGreaterThanOrEqual(48);
    expect(new Set(pool.map((w) => w.text.charAt(0))).size).toBeGreaterThanOrEqual(10);
    for (const w of pool) expect(w.chapter).toBe(2);
  });
});

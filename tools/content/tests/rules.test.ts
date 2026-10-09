import { type ContentBundle, contentBundle, type WordEntry } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import {
  computeContentVersion,
  type Filters,
  type LevelLike,
  type RuleInput,
  renderVersionFile,
  ruleCoverage,
  ruleDefinitions,
  ruleDuplicates,
  ruleFeasibility,
  ruleLengthBands,
  ruleLevelsStartWithWalk,
  ruleProfanity,
  ruleSchema,
  ruleTrials,
  ruleTypable,
} from "../src/index.ts";

const filters: Filters = {
  blocklist: new Set(["damn", "kill"]),
  substrings: ["ass", "fuck"],
  allowlist: ["class*", "assess*"],
};

function word(over: Partial<WordEntry> = {}): WordEntry {
  const text = over.text ?? "cat";
  return {
    text,
    key: text.toLowerCase(),
    kind: "word",
    tier: 1,
    biomes: [],
    uses: ["plate"],
    definition: "a small pet",
    example: `The ${text} sleeps.`,
    translations: {},
    ...over,
  };
}

const okPassage = `${"The little river runs past the old green hill and the quiet farm. ".repeat(26).trim()}`;
const input = (over: Partial<RuleInput> = {}): RuleInput => ({
  words: [word()],
  passages: [okPassage],
  levels: [],
  ...over,
});
const errs = (issues: { severity: string }[]): number =>
  issues.filter((i) => i.severity === "error").length;

describe("schema", () => {
  it("passes the real bundle", () => expect(ruleSchema(contentBundle)).toEqual([]));
  it("fails a bad tier", () => {
    const bad = { ...contentBundle, words: [word({ tier: 99 })] } as ContentBundle;
    expect(errs(ruleSchema(bad))).toBeGreaterThan(0);
  });
});

describe("typable", () => {
  it("passes plain text", () => expect(ruleTypable(input())).toEqual([]));
  it("fails a char outside TYPABLE_CHARS", () => {
    expect(errs(ruleTypable(input({ words: [word({ text: "ca$t" })] })))).toBe(1);
    expect(errs(ruleTypable(input({ passages: ["Tab\there."] })))).toBe(1);
    expect(errs(ruleTypable(input({ words: [word({ definition: "café" })] })))).toBe(1);
  });
});

describe("duplicates", () => {
  it("passes distinct words", () => {
    expect(ruleDuplicates(input({ words: [word(), word({ text: "dog" })] }))).toEqual([]);
  });
  it("fails duplicate keys, wrong keys and duplicate passages", () => {
    expect(errs(ruleDuplicates(input({ words: [word(), word({ uses: ["guard"] })] })))).toBe(1);
    expect(errs(ruleDuplicates(input({ words: [word({ key: "kat" })] })))).toBe(1);
    expect(errs(ruleDuplicates(input({ passages: [okPassage, okPassage] })))).toBe(1);
  });
});

describe("length bands", () => {
  it("passes in-band words", () => {
    expect(ruleLengthBands(input({ words: [word(), word({ text: "friend", tier: 2 })] }))).toEqual(
      [],
    );
  });
  it("fails out-of-band words", () => {
    expect(errs(ruleLengthBands(input({ words: [word({ text: "elephant" })] })))).toBe(1);
    expect(errs(ruleLengthBands(input({ words: [word({ text: "Cat" })] })))).toBe(1);
  });
  it("fails guard words over 5 letters or above tier 1", () => {
    const long = word({ text: "shield", tier: 2, uses: ["guard"] });
    expect(errs(ruleLengthBands(input({ words: [long] })))).toBeGreaterThanOrEqual(2);
    expect(ruleLengthBands(input({ words: [word({ uses: ["plate", "guard"] })] }))).toEqual([]);
  });
  it("applies sentence bands to boss text", () => {
    const sentence = (text: string, use: WordEntry["uses"][number]): WordEntry =>
      word({ text, kind: "sentence", uses: [use], example: text });
    const good = sentence("The ground will tremble and the sky will fall.", "doom");
    expect(ruleLengthBands(input({ words: [good] }))).toEqual([]);
    expect(errs(ruleLengthBands(input({ words: [sentence("Too short.", "doom")] })))).toBe(1);
    const slow = sentence("Stand up and fight with all your strength now.", "secondWind");
    expect(errs(ruleLengthBands(input({ words: [slow] })))).toBe(1);
  });
});

describe("definitions and examples", () => {
  it("passes a short definition and an example that uses the word", () => {
    expect(ruleDefinitions(input())).toEqual([]);
  });
  it("fails a long definition", () => {
    expect(errs(ruleDefinitions(input({ words: [word({ definition: "x".repeat(81) })] })))).toBe(1);
  });
  it("fails an example without the exact word", () => {
    expect(errs(ruleDefinitions(input({ words: [word({ example: "A dog sleeps." })] })))).toBe(1);
    expect(errs(ruleDefinitions(input({ words: [word({ example: "Cats sleep." })] })))).toBe(1);
  });
});

describe("profanity filter", () => {
  it("passes clean text and allowlisted false positives", () => {
    expect(
      ruleProfanity(
        input({ words: [word({ text: "class", example: "The class sat." })] }),
        filters,
      ),
    ).toEqual([]);
    expect(ruleProfanity(input({ passages: ["We assess the plan."] }), filters)).toEqual([]);
  });
  it("fails a blocklisted word, in any field", () => {
    expect(errs(ruleProfanity(input({ words: [word({ definition: "to kill" })] }), filters))).toBe(
      1,
    );
    expect(errs(ruleProfanity(input({ passages: ["Damn, it rained."] }), filters))).toBe(1);
  });
  it("fails an embedded substring that is not allowlisted", () => {
    expect(
      errs(
        ruleProfanity(
          input({ passages: ["The classless crowd said hello to the bass."] }),
          filters,
        ),
      ),
    ).toBe(1);
    expect(errs(ruleProfanity(input({ passages: ["Mass of flowers."] }), filters))).toBe(1);
  });
  it("ships a blocklist that catches the doc examples and allows assess and class", async () => {
    const { loadFilters } = await import("../src/index.ts");
    const real = loadFilters();
    expect(ruleProfanity(input({ passages: ["The class will assess the glass."] }), real)).toEqual(
      [],
    );
    expect(errs(ruleProfanity(input({ passages: ["What the fuck."] }), real))).toBe(1);
  });
});

describe("coverage and pool sizes", () => {
  it("passes the real word set", () => {
    expect(errs(ruleCoverage({ words: contentBundle.words, passages: [], levels: [] }))).toBe(0);
  });
  it("fails a starved tier pool and tiny biome pools", () => {
    const few = contentBundle.words.filter(
      (w) => !(w.tier === 1 && w.biomes.length === 0 && !w.text.startsWith("b")),
    );
    const starved = few.filter((w) => !(w.tier === 1 && w.biomes.length === 0 && w.text > "e"));
    const issues = ruleCoverage({ words: starved, passages: [], levels: [] });
    expect(issues.some((i) => i.message.includes("T1 pool"))).toBe(true);
    const noBiome = contentBundle.words.filter((w) => !w.biomes.includes("cave"));
    expect(
      ruleCoverage({ words: noBiome, passages: [], levels: [] }).some((i) =>
        i.message.includes("cave"),
      ),
    ).toBe(true);
  });
  it("fails when boss pools are too small", () => {
    const noDoom = contentBundle.words.filter((w) => !w.uses.includes("doom"));
    expect(
      ruleCoverage({ words: noDoom, passages: [], levels: [] }).some((i) =>
        i.message.startsWith("doom"),
      ),
    ).toBe(true);
  });
});

describe("distinct first-letter feasibility", () => {
  const level = (waves: number, over: Partial<LevelLike> = {}): LevelLike => ({
    id: "ch1-l1",
    biome: "forest",
    wordTier: 1,
    plateLength: [3, 5],
    segments: [
      { kind: "walk" },
      { kind: "encounter", encounter: { waves: [Array(waves).fill(0)] } },
    ],
    ...over,
  });
  const tier1 = contentBundle.words.filter(
    (w) => w.tier === 1 && w.biomes.length === 0 && w.uses.includes("plate"),
  );
  it("passes the real pools for the Chapter 1 reference layout and a 4-plate wave", () => {
    expect(ruleFeasibility({ words: contentBundle.words, passages: [], levels: [] })).toEqual([]);
    expect(
      ruleFeasibility({ words: contentBundle.words, passages: [], levels: [level(4)] }),
    ).toEqual([]);
  });
  it("fails when the pool has fewer initials than plates + guard swaps", () => {
    const narrow = tier1.filter((w) => "abcde".includes(w.text.charAt(0)));
    const issues = ruleFeasibility({ words: narrow, passages: [], levels: [level(4)] });
    expect(errs(issues)).toBeGreaterThan(0);
    expect(issues[0]?.message).toContain("needs 6");
  });
  it("counts a boss segment as visible plates", () => {
    const narrow = tier1.filter((w) => "abcde".includes(w.text.charAt(0)));
    const boss = level(1, { id: "ch1-l10", segments: [{ kind: "walk" }, { kind: "boss" }] });
    expect(errs(ruleFeasibility({ words: narrow, passages: [], levels: [boss] }))).toBeGreaterThan(
      0,
    );
  });
});

describe("level segments", () => {
  const lv = (first: string): LevelLike => ({
    id: "ch1-l1",
    biome: "forest",
    wordTier: 1,
    plateLength: [3, 5],
    segments: [{ kind: first }, { kind: "boss" }],
  });
  it("passes a level that starts with a walk", () => {
    expect(ruleLevelsStartWithWalk(input({ levels: [lv("walk")] }))).toEqual([]);
  });
  it("fails a level that does not", () => {
    expect(errs(ruleLevelsStartWithWalk(input({ levels: [lv("encounter")] })))).toBe(1);
  });
});

describe("trial passages", () => {
  const distinct = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `${okPassage} Part ${"a".repeat(i + 1)}.`);

  it("passes 30 passages of at least 1600 chars", () => {
    expect(ruleTrials(input({ passages: distinct(30) }))).toEqual([]);
  });
  it("fails a small pool", () => {
    expect(errs(ruleTrials(input({ passages: distinct(29) })))).toBe(1);
  });
  it("fails a short passage, a double space and trailing space", () => {
    const base = distinct(30);
    expect(errs(ruleTrials(input({ passages: [...base.slice(1), "Too short."] })))).toBeGreaterThan(
      0,
    );
    expect(
      errs(
        ruleTrials(input({ passages: [...base.slice(1), `${okPassage.replace("old", " old")}.`] })),
      ),
    ).toBeGreaterThan(0);
    expect(
      errs(ruleTrials(input({ passages: [...base.slice(1), `${okPassage} `] }))),
    ).toBeGreaterThan(0);
  });
  it("fails when one passage is much harder than the rest", () => {
    const hard = `${"Extraordinarily complicated administrative responsibilities, notwithstanding considerable difficulties. ".repeat(18).trim()}`;
    expect(errs(ruleTrials(input({ passages: [...distinct(29), hard] })))).toBeGreaterThan(0);
  });
});

describe("CONTENT_VERSION", () => {
  it("is 8 hex chars, deterministic and sensitive to content", () => {
    const v = computeContentVersion(contentBundle);
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    expect(computeContentVersion(contentBundle)).toBe(v);
    const changed: ContentBundle = {
      ...contentBundle,
      words: [...contentBundle.words, word({ text: "zzz" })],
    };
    expect(computeContentVersion(changed)).not.toBe(v);
    expect(renderVersionFile(v)).toContain(`"${v}"`);
  });
});

import type { Biome, WordEntry } from "../schemas.ts";
import { parseRows, plateWords } from "./lines.ts";

/** Chapter 2 content is introduced in chapter 2 (WordEntry.chapter): sentence pools match exactly, plate pools take <=. */
export const CH2 = 2;

/**
 * Chapter 2 biome plate words. `clues` is a block of `word | riddle clue` rows: those words also get `uses: riddle`
 * and a `clue` (simple English, never containing the answer; tools/content checks that).
 */
export function ch2PlateWords(source: string, biome: Biome, clues: string): WordEntry[] {
  const clueBy = new Map<string, string>();
  for (const line of clues.split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const [w, c] = t.split(" | ");
    if (!w || !c) throw new Error(`bad clue row: ${t}`);
    clueBy.set(w.trim(), c.trim());
  }
  const words = plateWords(parseRows(source), { biome }).map((w) => {
    const clue = clueBy.get(w.text);
    return {
      ...w,
      chapter: CH2,
      ...(clue ? { uses: ["plate" as const, "riddle" as const], clue } : {}),
    };
  });
  for (const t of clueBy.keys()) {
    if (!words.some((w) => w.text === t)) throw new Error(`clue for unknown word "${t}"`);
  }
  return words;
}

/** Chapter 2 sentence lines (exact case): `text | what it means | (example = the sentence)`. */
export function ch2Sentences(
  source: string,
  use: "doom" | "finisher" | "secondWind" | "intro",
  biome: Biome,
): WordEntry[] {
  return parseRows(source).map((r) => ({
    text: r.text,
    key: r.text.toLowerCase(),
    kind: "sentence" as const,
    tier: 1,
    biomes: [biome],
    uses: [use],
    definition: r.definition,
    example: r.example,
    translations: {},
    chapter: CH2,
  }));
}

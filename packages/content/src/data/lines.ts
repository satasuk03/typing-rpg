import type { Biome, WordEntry } from "../schemas.ts";

/** One authored row: `word | simple definition | example sentence that uses the word`. */
export interface RawRow {
  text: string;
  definition: string;
  example: string;
}

export function parseRows(source: string): RawRow[] {
  const rows: RawRow[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(" | ");
    if (parts.length !== 3) throw new Error(`bad word row (need 3 parts): ${trimmed}`);
    const [text, definition, example] = parts as [string, string, string];
    rows.push({ text: text.trim(), definition: definition.trim(), example: example.trim() });
  }
  return rows;
}

/** Difficulty tier implied by word length (doc 01 section 5.1: T1 3-5, T2 up to 7, T3 6-10). */
export function tierForLength(len: number): number {
  if (len <= 5) return 1;
  if (len <= 7) return 2;
  return 3;
}

const CEFR_BY_TIER = { 1: "A1", 2: "A2", 3: "B1" } as const;

export function plateWords(
  rows: RawRow[],
  opts: { tier?: number; biome?: Biome; guardKeys?: ReadonlySet<string> },
): WordEntry[] {
  return rows.map((r) => {
    const key = r.text.toLowerCase();
    const tier = opts.tier ?? tierForLength(r.text.length);
    const uses: WordEntry["uses"] = opts.guardKeys?.has(key) ? ["plate", "guard"] : ["plate"];
    const cefr = opts.biome === undefined ? CEFR_BY_TIER[tier as 1 | 2 | 3] : undefined;
    return {
      text: r.text,
      key,
      kind: "word",
      tier,
      ...(cefr ? { cefr } : {}),
      biomes: opts.biome ? [opts.biome] : [],
      uses,
      definition: r.definition,
      example: r.example,
      translations: {},
    };
  });
}

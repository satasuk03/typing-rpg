import { ContentBundle, TypableText, type WordEntry } from "@hd2d/content";
import { CONFIG } from "./config.ts";
import { type Filters, type Issue, issue, type LevelLike, type RuleInput } from "./types.ts";

const firstLetter = (s: string): string => s.charAt(0).toLowerCase();
const distinctInitials = (ws: readonly { text: string }[]): number =>
  new Set(ws.map((w) => firstLetter(w.text))).size;
const has = (w: WordEntry, use: WordEntry["uses"][number]): boolean => w.uses.includes(use);

// ---------------------------------------------------------------- pools

export const isPlate = (w: WordEntry): boolean => has(w, "plate");
/** General (non-biome) plate words of a tier. */
export const tierPool = (ws: readonly WordEntry[], tier: number): WordEntry[] =>
  ws.filter((w) => isPlate(w) && w.biomes.length === 0 && w.tier === tier);
export const biomePool = (ws: readonly WordEntry[], biome: string): WordEntry[] =>
  ws.filter((w) => isPlate(w) && (w.biomes as string[]).includes(biome));
export const usePool = (ws: readonly WordEntry[], use: WordEntry["uses"][number]): WordEntry[] =>
  ws.filter((w) => has(w, use));

export function letterHistogram(ws: readonly { text: string }[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const w of ws) {
    const l = firstLetter(w.text);
    h[l] = (h[l] ?? 0) + 1;
  }
  return h;
}

// ---------------------------------------------------------------- schema

export function ruleSchema(bundle: unknown): Issue[] {
  const r = ContentBundle.safeParse(bundle);
  if (r.success) return [];
  return r.error.issues
    .slice(0, 25)
    .map((i) => issue("schema", "error", `${i.path.join(".")}: ${i.message}`));
}

// ---------------------------------------------------------------- typable chars

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export function ruleTypable(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  for (const w of input.words) {
    if (!TypableText.safeParse(w.text).success) {
      out.push(issue("typable", "error", `"${w.text}": contains a char outside TYPABLE_CHARS`));
    }
    for (const [field, v] of [
      ["definition", w.definition],
      ["example", w.example],
    ] as const) {
      if (!PRINTABLE_ASCII.test(v)) {
        out.push(issue("typable", "error", `"${w.text}": ${field} has a non-ASCII char`));
      }
    }
  }
  input.passages.forEach((p, i) => {
    if (!TypableText.safeParse(p).success) {
      out.push(issue("typable", "error", `passage ${i}: contains a char outside TYPABLE_CHARS`));
    }
  });
  return out;
}

// ---------------------------------------------------------------- duplicates and keys

export function ruleDuplicates(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  const seen = new Map<string, WordEntry>();
  for (const w of input.words) {
    const k = w.key.toLowerCase();
    const prev = seen.get(k);
    if (prev) {
      out.push(
        issue(
          "duplicate",
          "error",
          `"${w.text}" appears twice (uses ${prev.uses.join("+")} and ${w.uses.join("+")})`,
        ),
      );
    } else seen.set(k, w);
    if (w.key !== w.text.toLowerCase()) {
      out.push(issue("key", "error", `"${w.text}": key "${w.key}" must equal text.toLowerCase()`));
    }
  }
  const p = new Set<string>();
  input.passages.forEach((t, i) => {
    if (p.has(t)) out.push(issue("duplicate", "error", `passage ${i} is a duplicate`));
    p.add(t);
  });
  return out;
}

// ---------------------------------------------------------------- length bands

const SENTENCE_BANDS = {
  doom: CONFIG.doom,
  finisher: CONFIG.finisher,
  secondWind: CONFIG.secondWind,
} as const;

export function ruleLengthBands(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  for (const w of input.words) {
    const len = w.text.length;
    if (w.kind === "sentence") {
      for (const use of ["doom", "finisher", "secondWind"] as const) {
        if (!has(w, use)) continue;
        const b = SENTENCE_BANDS[use];
        if (len < b.minLen || len > b.maxLen) {
          out.push(
            issue(
              "length",
              "error",
              `${use} "${w.text}": ${len} chars, band ${b.minLen}-${b.maxLen}`,
            ),
          );
        }
      }
      continue;
    }
    if (has(w, "minigame")) {
      const b = CONFIG.minigame;
      if (len < b.minLen || len > b.maxLen) {
        out.push(
          issue(
            "length",
            "error",
            `minigame "${w.text}": ${len} chars, band ${b.minLen}-${b.maxLen}`,
          ),
        );
      }
    }
    if (isPlate(w) && w.kind === "word") {
      const band = CONFIG.tierBands[w.tier];
      if (!band) {
        out.push(issue("length", "error", `"${w.text}": tier ${w.tier} has no length band`));
      } else if (len < band[0] || len > band[1]) {
        out.push(
          issue(
            "length",
            "error",
            `"${w.text}" (T${w.tier}): ${len} letters, band ${band[0]}-${band[1]}`,
          ),
        );
      }
      if (w.tier <= 4 && !/^[a-z]+$/.test(w.text)) {
        out.push(
          issue("length", "error", `"${w.text}": T1-T4 plate words must be lowercase letters`),
        );
      }
    }
    if (has(w, "guard")) {
      const g = CONFIG.guard;
      if (len > g.maxLen || len < g.minLen) {
        out.push(
          issue(
            "guard",
            "error",
            `guard "${w.text}": ${len} letters, band ${g.minLen}-${g.maxLen}`,
          ),
        );
      }
      if (w.tier !== g.tier)
        out.push(issue("guard", "error", `guard "${w.text}": must be tier ${g.tier}`));
    }
  }
  return out;
}

// ---------------------------------------------------------------- definitions / examples

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ruleDefinitions(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  for (const w of input.words) {
    if (w.definition.length > CONFIG.maxDefinitionLen) {
      out.push(
        issue(
          "definition",
          "error",
          `"${w.text}": definition ${w.definition.length} chars (max ${CONFIG.maxDefinitionLen})`,
        ),
      );
    }
    if (w.kind === "word") {
      const re = new RegExp(`(^|[^a-z])${escapeRe(w.text.toLowerCase())}([^a-z]|$)`);
      if (!re.test(w.example.toLowerCase())) {
        out.push(
          issue(
            "example",
            "error",
            `"${w.text}": example does not use the exact word: "${w.example}"`,
          ),
        );
      }
    }
    if (Object.keys(w.translations).length > 0) {
      out.push(
        issue("translations", "warn", `"${w.text}": translations are expected to be empty in T4.1`),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- profanity / sensitive

export function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

function allowed(token: string, allowlist: readonly string[]): boolean {
  return allowlist.some((a) => (a.endsWith("*") ? token.startsWith(a.slice(0, -1)) : token === a));
}

export function checkText(text: string, f: Filters): string[] {
  const hits: string[] = [];
  for (const t of tokens(text)) {
    if (f.blocklist.has(t)) {
      hits.push(`blocked word "${t}"`);
      continue;
    }
    if (allowed(t, f.allowlist)) continue;
    const sub = f.substrings.find((s) => t.includes(s));
    if (sub) hits.push(`token "${t}" contains blocked substring "${sub}"`);
  }
  return hits;
}

export function ruleProfanity(input: RuleInput, f: Filters): Issue[] {
  const out: Issue[] = [];
  for (const w of input.words) {
    for (const [field, v] of [
      ["text", w.text],
      ["definition", w.definition],
      ["example", w.example],
    ] as const) {
      for (const h of checkText(v, f))
        out.push(issue("profanity", "error", `"${w.text}" ${field}: ${h}`));
    }
  }
  input.passages.forEach((p, i) => {
    for (const h of checkText(p, f)) out.push(issue("profanity", "error", `passage ${i}: ${h}`));
  });
  return out;
}

// ---------------------------------------------------------------- coverage and pool sizes

export function ruleCoverage(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  const { minLetters, minWordsPerLetter } = CONFIG.coverage;
  for (const tier of [1, 2]) {
    const pool = tierPool(input.words, tier);
    const hist = letterHistogram(pool);
    const rich = Object.values(hist).filter((n) => n >= minWordsPerLetter).length;
    if (rich < minLetters) {
      out.push(
        issue(
          "coverage",
          "error",
          `T${tier} pool: only ${rich} letters have >= ${minWordsPerLetter} words (need ${minLetters})`,
        ),
      );
    }
  }
  for (const biome of ["forest", "ruins", "cave"]) {
    const pool = biomePool(input.words, biome);
    const b = CONFIG.biome;
    if (pool.length < b.min)
      out.push(issue("coverage", "error", `${biome}: ${pool.length} words (min ${b.min})`));
    if (pool.length > b.max)
      out.push(issue("coverage", "warn", `${biome}: ${pool.length} words (max ${b.max})`));
    if (distinctInitials(pool) < b.minDistinctInitials) {
      out.push(
        issue(
          "coverage",
          "error",
          `${biome}: only ${distinctInitials(pool)} distinct first letters (need ${b.minDistinctInitials})`,
        ),
      );
    }
  }
  const pools = [
    ["guard", usePool(input.words, "guard"), CONFIG.guard],
    ["doom", usePool(input.words, "doom"), CONFIG.doom],
    ["secondWind", usePool(input.words, "secondWind"), CONFIG.secondWind],
    ["minigame", usePool(input.words, "minigame"), CONFIG.minigame],
  ] as const;
  for (const [name, pool, c] of pools) {
    if (pool.length < c.minCount)
      out.push(issue("pool", "error", `${name}: ${pool.length} entries (min ${c.minCount})`));
    if (distinctInitials(pool) < c.minDistinctInitials) {
      out.push(
        issue(
          "pool",
          "error",
          `${name}: ${distinctInitials(pool)} distinct first letters (need ${c.minDistinctInitials})`,
        ),
      );
    }
  }
  const fin = usePool(input.words, "finisher");
  if (fin.length < CONFIG.finisher.minCount) {
    out.push(
      issue("pool", "error", `finisher: ${fin.length} entries (min ${CONFIG.finisher.minCount})`),
    );
  }
  return out;
}

// ---------------------------------------------------------------- distinct-letter feasibility

/** Chapter 1 reference layout used when the bundle has no levels yet (T4.2 not merged). */
export function referenceCh1Levels(): LevelLike[] {
  const biomes = [
    "forest",
    "forest",
    "forest",
    "ruins",
    "ruins",
    "ruins",
    "cave",
    "cave",
    "cave",
  ] as const;
  const normal: LevelLike[] = biomes.map((biome, i) => ({
    id: `ch1-l${i + 1}`,
    biome,
    wordTier: 1,
    plateLength: [3, 5],
    segments: [{ kind: "walk" }, { kind: "encounter", encounter: { waves: [[1, 2, 3, 4]] } }],
  }));
  normal.push({
    id: "ch1-l10",
    biome: "hollow",
    wordTier: 1,
    plateLength: [3, 5],
    segments: [{ kind: "walk" }, { kind: "boss" }],
  });
  return normal;
}

export function visiblePlates(level: LevelLike): number {
  let max = 1;
  for (const s of level.segments) {
    if (s.kind === "boss") max = Math.max(max, CONFIG.feasibility.bossVisiblePlates);
    for (const wave of s.encounter?.waves ?? []) max = Math.max(max, wave.length);
  }
  return max;
}

export function ruleFeasibility(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  const levels = input.levels.length > 0 ? input.levels : referenceCh1Levels();
  for (const lv of levels) {
    const need = visiblePlates(lv) + CONFIG.feasibility.guardSwaps;
    const [lo, hi] = lv.plateLength;
    const inBand = (w: WordEntry): boolean => w.text.length >= lo && w.text.length <= hi;
    const current = input.words.filter(
      (w) => isPlate(w) && w.biomes.length === 0 && w.tier === lv.wordTier && inBand(w),
    );
    const review = input.words.filter(
      (w) => isPlate(w) && w.biomes.length === 0 && w.tier < lv.wordTier && inBand(w),
    );
    const biome = input.words.filter(
      (w) => isPlate(w) && (w.biomes as string[]).includes(lv.biome) && inBand(w),
    );
    const cur = distinctInitials(current);
    const all = distinctInitials([...current, ...review, ...biome]);
    if (cur < need) {
      out.push(
        issue(
          "feasibility",
          "error",
          `${lv.id}: current-tier pool has ${cur} distinct first letters, needs ${need}`,
        ),
      );
    }
    if (all < need) {
      out.push(
        issue(
          "feasibility",
          "error",
          `${lv.id}: full pool mix has ${all} distinct first letters, needs ${need}`,
        ),
      );
    }
  }
  return out;
}

export function ruleLevelsStartWithWalk(input: RuleInput): Issue[] {
  return input.levels
    .filter((l) => l.segments[0]?.kind !== "walk")
    .map((l) => issue("levels", "error", `${l.id}: first segment must be a walk`));
}

// ---------------------------------------------------------------- Typing Trial passages

export interface PassageStats {
  chars: number;
  words: number;
  avgWordLen: number;
  punctDensity: number;
  avgSentenceWords: number;
}

export function passageStats(text: string): PassageStats {
  const wordList = text.match(/[A-Za-z']+/g) ?? [];
  const letters = wordList.reduce((n, w) => n + w.replace(/'/g, "").length, 0);
  const punct = (text.match(/[.,;:!?'"()-]/g) ?? []).length;
  const sentences = (text.match(/[.!?]+(\s|$)/g) ?? []).length || 1;
  return {
    chars: text.length,
    words: wordList.length,
    avgWordLen: wordList.length ? letters / wordList.length : 0,
    punctDensity: text.length ? punct / text.length : 0,
    avgSentenceWords: wordList.length / sentences,
  };
}

export function ruleTrials(input: RuleInput): Issue[] {
  const out: Issue[] = [];
  const t = CONFIG.trial;
  if (input.passages.length < t.minPassages) {
    out.push(issue("trial", "error", `${input.passages.length} passages (min ${t.minPassages})`));
  }
  const stats = input.passages.map(passageStats);
  input.passages.forEach((p, i) => {
    const s = stats[i];
    if (!s) return;
    if (p.length < t.minChars)
      out.push(issue("trial", "error", `passage ${i}: ${p.length} chars (min ${t.minChars})`));
    if (p.length > t.maxChars)
      out.push(issue("trial", "warn", `passage ${i}: ${p.length} chars (max ${t.maxChars})`));
    if (/ {2}/.test(p)) out.push(issue("trial", "error", `passage ${i}: contains a double space`));
    if (p !== p.trim())
      out.push(issue("trial", "error", `passage ${i}: leading or trailing whitespace`));
    if (!/[.!?]$/.test(p))
      out.push(issue("trial", "error", `passage ${i}: must end with . ! or ?`));
    if (s.avgWordLen < t.avgWordLen[0] || s.avgWordLen > t.avgWordLen[1]) {
      out.push(
        issue(
          "trial",
          "error",
          `passage ${i}: avg word length ${s.avgWordLen.toFixed(2)} outside ${t.avgWordLen.join("-")}`,
        ),
      );
    }
    if (s.punctDensity < t.punctDensity[0] || s.punctDensity > t.punctDensity[1]) {
      out.push(
        issue(
          "trial",
          "error",
          `passage ${i}: punctuation density ${(s.punctDensity * 100).toFixed(2)}% outside ${t.punctDensity.map((x) => x * 100).join("-")}%`,
        ),
      );
    }
  });
  if (stats.length > 1) {
    const awl = stats.map((s) => s.avgWordLen);
    const pd = stats.map((s) => s.punctDensity);
    if (Math.max(...awl) - Math.min(...awl) > t.maxAvgWordLenSpread) {
      out.push(
        issue(
          "trial",
          "error",
          `avg word length spread ${(Math.max(...awl) - Math.min(...awl)).toFixed(2)} > ${t.maxAvgWordLenSpread}`,
        ),
      );
    }
    if (Math.max(...pd) - Math.min(...pd) > t.maxPunctSpread) {
      out.push(
        issue(
          "trial",
          "error",
          `punctuation spread ${((Math.max(...pd) - Math.min(...pd)) * 100).toFixed(2)}pp > ${t.maxPunctSpread * 100}pp`,
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- all rules

export function runAllRules(input: RuleInput, filters: Filters): Issue[] {
  return [
    ...ruleTypable(input),
    ...ruleDuplicates(input),
    ...ruleLengthBands(input),
    ...ruleDefinitions(input),
    ...ruleProfanity(input, filters),
    ...ruleCoverage(input),
    ...ruleFeasibility(input),
    ...ruleLevelsStartWithWalk(input),
    ...ruleTrials(input),
  ];
}

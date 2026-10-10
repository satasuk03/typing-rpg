import type { WordEntry } from "@hd2d/content";
import { CONFIG } from "./config.ts";
import { checkText, isPlate, usePool } from "./rules.ts";
import { type Filters, type Issue, issue, type RuleInput } from "./types.ts";

const firstLetter = (s: string): string => s.charAt(0).toLowerCase();
const initials = (ws: readonly { text: string }[]): number =>
  new Set(ws.map((w) => firstLetter(w.text))).size;
const has = (w: WordEntry, use: WordEntry["uses"][number]): boolean => w.uses.includes(use);

const CH2_BIOMES: readonly string[] = CONFIG.ch2.biomes;

/** An entry belongs to Chapter 2 when it sits in a Ch2 biome or carries a Ch2-only use (riddle, intro). */
export const isCh2Entry = (w: WordEntry): boolean =>
  (w.biomes as string[]).some((b) => CH2_BIOMES.includes(b)) || has(w, "riddle") || has(w, "intro");

/** The word forms a clue must not contain: the answer plus its simple stem (trailing s/es/ed/ing/er/y/e removed). */
export function answerStems(answer: string): string[] {
  const a = answer.toLowerCase();
  const stems = new Set<string>([a]);
  const trimmed = a.replace(/(ing|ed|es|er|s|y|e)$/, "");
  // Short stems ("ow" from "owl"s) would match unrelated words; only trim to a stem of 4+ letters.
  if (trimmed.length >= 4) stems.add(trimmed);
  return [...stems];
}

/** True when `clue` contains the answer or an obvious form of it (case-insensitive; matches inside longer tokens for stems). */
export function clueLeaksAnswer(clue: string, answer: string): boolean {
  const tokens = clue.toLowerCase().match(/[a-z]+/g) ?? [];
  const stems = answerStems(answer);
  return tokens.some((t) =>
    stems.some((s) =>
      s.length >= 4 ? t.startsWith(s) : t === s || t === `${s}s` || t === `${s}es`,
    ),
  );
}

export function ruleCh2Vocab(input: RuleInput, filters: Filters): Issue[] {
  const out: Issue[] = [];
  const cfg = CONFIG.ch2;
  const words = input.words;

  // Ch2 entries must say so, or the Ch1 pools would pick them up (interfaces v2.0 D39).
  for (const w of words) {
    if (isCh2Entry(w) && w.chapter !== 2) {
      out.push(issue("chapter", "error", `"${w.text}": a Chapter 2 entry must have chapter: 2`));
    }
    if (w.chapter === 2 && !isCh2Entry(w)) {
      out.push(issue("chapter", "error", `"${w.text}": chapter 2 but no Chapter 2 biome or use`));
    }
  }

  // >= 12 distinct first letters per plate band, per Ch2 biome.
  for (const biome of cfg.biomes) {
    const pool = words.filter((w) => isPlate(w) && (w.biomes as string[]).includes(biome));
    if (pool.length < cfg.minPool) {
      out.push(issue("ch2vocab", "error", `${biome}: ${pool.length} words (min ${cfg.minPool})`));
    }
    for (const [lo, hi] of cfg.bands) {
      const band = pool.filter((w) => w.text.length >= lo && w.text.length <= hi);
      if (initials(band) < cfg.minInitialsPerBand) {
        out.push(
          issue(
            "ch2vocab",
            "error",
            `${biome}: band ${lo}-${hi} has ${initials(band)} distinct first letters over ${band.length} words (need ${cfg.minInitialsPerBand})`,
          ),
        );
      }
    }
  }

  // Sentence pools of Chapter 2: counts, exact case, length bands.
  const ch2 = words.filter((w) => w.chapter === 2);
  for (const [use, min] of Object.entries(cfg.sentenceMin)) {
    const pool = ch2.filter((w) => has(w, use as WordEntry["uses"][number]));
    if (pool.length < min) {
      out.push(issue("ch2vocab", "error", `chapter 2 ${use}: ${pool.length} entries (min ${min})`));
    }
    for (const w of pool) {
      if (w.kind !== "sentence") {
        out.push(issue("ch2vocab", "error", `chapter 2 ${use} "${w.text}": must be a sentence`));
      }
      if (!/[A-Z]/.test(w.text)) {
        out.push(
          issue("ch2vocab", "error", `chapter 2 ${use} "${w.text}": needs an uppercase letter`),
        );
      }
    }
  }
  for (const w of ch2.filter((x) => has(x, "intro"))) {
    const [lo, hi] = cfg.introLen;
    if (w.text.length < lo || w.text.length > hi) {
      out.push(
        issue("length", "error", `intro "${w.text}": ${w.text.length} chars, band ${lo}-${hi}`),
      );
    }
  }

  // Riddle words.
  const riddles = usePool(words, "riddle");
  for (const w of riddles) {
    const clue = w.clue ?? w.definition;
    if (w.clue === undefined) {
      out.push(issue("riddle", "error", `"${w.text}": a riddle word needs its own clue`));
    }
    if (clue.length > 90) {
      out.push(issue("riddle", "error", `"${w.text}": clue is ${clue.length} chars (max 90)`));
    }
    if (clueLeaksAnswer(clue, w.text)) {
      out.push(issue("riddle", "error", `"${w.text}": the clue contains the answer: "${clue}"`));
    }
    for (const h of checkText(clue, filters)) {
      out.push(issue("profanity", "error", `"${w.text}" clue: ${h}`));
    }
    if (!isPlate(w) || !/^[a-z]+$/.test(w.text) || w.text.length > cfg.riddleMaxLen) {
      out.push(
        issue("riddle", "error", `"${w.text}": a riddle leaf must be a lowercase plate word`),
      );
    }
  }
  {
    if (riddles.length < cfg.riddle.minCount) {
      out.push(
        issue(
          "riddle",
          "error",
          `riddle pool: ${riddles.length} words (min ${cfg.riddle.minCount})`,
        ),
      );
    }
    // The sim draws answer + 2 decoys with distinct first letters (interfaces 3.6), 5 riddles per fight, no repeats.
    const letters = initials(riddles);
    if (letters < cfg.riddle.minInitials) {
      out.push(
        issue(
          "riddle",
          "error",
          `riddle pool: ${letters} distinct first letters (need ${cfg.riddle.minInitials} so 3 distinct letters can always be drawn)`,
        ),
      );
    }
    // Strict feasibility: for every possible answer there are two decoys with two further distinct letters.
    if (letters < 3) {
      out.push(issue("riddle", "error", "riddle pool cannot yield 3 distinct first letters"));
    }
  }
  return out;
}

import type { Biome, WordEntry } from "@hd2d/content";

export type Severity = "error" | "warn";
export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
}

/** The structural slice of a LevelDef that the rules need (real LevelDefs satisfy it). */
export interface LevelLike {
  id: string;
  biome: Biome;
  wordTier: number;
  plateLength: readonly [number, number];
  segments: readonly {
    kind: string;
    encounter?: { waves: readonly (readonly unknown[])[] };
  }[];
}

/** What the rules validate. Built from a ContentBundle by `inputFromBundle`. */
export interface RuleInput {
  words: WordEntry[];
  passages: string[];
  levels: LevelLike[];
}

export interface Filters {
  /** Whole-word blocklist (lowercase). */
  blocklist: ReadonlySet<string>;
  /** Substrings that may not appear inside any word token. */
  substrings: readonly string[];
  /** Tokens (or `prefix*`) exempt from the substring check. */
  allowlist: readonly string[];
}

export const issue = (rule: string, severity: Severity, message: string): Issue => ({
  rule,
  severity,
  message,
});

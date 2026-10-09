import { readFileSync } from "node:fs";
import type { Filters } from "./types.ts";

const dataFile = (name: string): string =>
  readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8");

export function parseList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

export function loadFilters(): Filters {
  return {
    blocklist: new Set(parseList(dataFile("blocklist.txt"))),
    substrings: parseList(dataFile("substrings.txt")),
    allowlist: parseList(dataFile("allowlist.txt")),
  };
}

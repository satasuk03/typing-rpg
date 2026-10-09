import { TYPABLE_CHARS } from "@hd2d/content"; // single source of truth (also builds the content text regex, §6)
import type { Tick } from "./time.ts";

export type SimKey = "Escape" | string; // string = exactly one char of TYPABLE_CHARS
export type KeyInput = { tick: Tick; key: SimKey };
export type CommandInput =
  | { tick: Tick; cmd: "abandon" } // quit from pause menu -> LevelFailed{abandoned}
  | { tick: Tick; cmd: "revive"; source: "gem" | "feather" }; // hook; ignored unless options.allowExternalRevive
export type SimInput = KeyInput | CommandInput;
export const isTypable = (k: string): boolean => k.length === 1 && TYPABLE_CHARS.includes(k);

/** Typographic normalization table (rule 4). Keys are single UTF-16 code units. */
const TYPOGRAPHIC: Readonly<Record<string, string>> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  " ": " ",
};

/** Pure mapping from a keydown-like record. Returns null = ignore (not logged, not sent). */
export function normalizeKey(e: {
  key: string;
  repeat: boolean;
  isComposing: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): SimKey | null {
  // 1. auto-repeat, IME composition, dead keys
  if (e.repeat || e.isComposing || e.key === "Dead" || e.key === "Process") return null;
  // 2. shortcuts are ignored, except Ctrl+Alt (Windows AltGr produces characters)
  if ((e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.altKey)) return null;
  // 3. Escape / Tab
  if (e.key === "Escape" || e.key === "Tab") return "Escape";
  // 4. typographic normalization
  const k = Object.hasOwn(TYPOGRAPHIC, e.key) ? (TYPOGRAPHIC[e.key] as string) : e.key;
  // 5. a single typable char is itself (case preserved); everything else is ignored
  return isTypable(k) ? k : null;
}

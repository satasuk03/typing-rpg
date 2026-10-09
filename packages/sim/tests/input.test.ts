import { TYPABLE_CHARS } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { isTypable, normalizeKey } from "../src/index.ts";

const ev = (key: string, over: Partial<Parameters<typeof normalizeKey>[0]> = {}) => ({
  key,
  repeat: false,
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...over,
});

describe("normalizeKey", () => {
  test("every TYPABLE_CHAR maps to itself with case preserved", () => {
    for (const ch of TYPABLE_CHARS) expect(normalizeKey(ev(ch))).toBe(ch);
    expect(normalizeKey(ev("A"))).toBe("A");
    expect(normalizeKey(ev(" "))).toBe(" ");
  });
  test("rule 1: repeat, composing, Dead, Process are ignored", () => {
    expect(normalizeKey(ev("a", { repeat: true }))).toBeNull();
    expect(normalizeKey(ev("a", { isComposing: true }))).toBeNull();
    expect(normalizeKey(ev("Dead"))).toBeNull();
    expect(normalizeKey(ev("Process"))).toBeNull();
  });
  test("rule 2: ctrl/meta shortcuts ignored, except ctrl+alt (AltGr)", () => {
    expect(normalizeKey(ev("a", { ctrlKey: true }))).toBeNull();
    expect(normalizeKey(ev("a", { metaKey: true }))).toBeNull();
    expect(normalizeKey(ev("Escape", { ctrlKey: true }))).toBeNull();
    expect(normalizeKey(ev("(", { ctrlKey: true, altKey: true }))).toBe("(");
  });
  test("rule 3: Escape and Tab both become Escape", () => {
    expect(normalizeKey(ev("Escape"))).toBe("Escape");
    expect(normalizeKey(ev("Tab"))).toBe("Escape");
  });
  test("rule 4: typographic characters normalize", () => {
    expect(normalizeKey(ev("’"))).toBe("'");
    expect(normalizeKey(ev("‘"))).toBe("'");
    expect(normalizeKey(ev("“"))).toBe('"');
    expect(normalizeKey(ev("”"))).toBe('"');
    expect(normalizeKey(ev("–"))).toBe("-");
    expect(normalizeKey(ev(" "))).toBe(" ");
  });
  test("rule 5: everything else is ignored", () => {
    for (const k of [
      "Shift",
      "Enter",
      "Backspace",
      "ArrowUp",
      "F1",
      "é",
      "@",
      "#",
      "",
      "ab",
      "—",
      "😀",
    ]) {
      expect(normalizeKey(ev(k)), k).toBeNull();
    }
    expect(normalizeKey(ev("å", { altKey: true }))).toBeNull(); // mac Option+a
  });
  test("isTypable", () => {
    expect(isTypable("a")).toBe(true);
    expect(isTypable("")).toBe(false);
    expect(isTypable("ab")).toBe(false);
    expect(isTypable("@")).toBe(false);
    expect(isTypable("Escape")).toBe(false);
  });
});

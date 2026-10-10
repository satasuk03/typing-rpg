// T1.1 chapter plumbing (docs/interfaces.md §8 v2.0, §13.2): parseLevelId, bundleChapters, levelUnlocked (by id),
// frontierChapterOf, parArmorBp(chapter).
import { type ContentBundle, contentBundle, withCh2Stubs } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  bundleChapters,
  frontierChapterOf,
  levelUnlocked,
  parArmorBp,
  parseLevelId,
} from "../src/index.ts";

const two = withCh2Stubs(contentBundle);
const clearedSet =
  (...ids: string[]) =>
  (id: string): boolean =>
    ids.includes(id);
const ids = (chapter: number, n = 10): string[] =>
  Array.from({ length: n }, (_, i) => `ch${chapter}-l${String(i + 1).padStart(2, "0")}`);

describe("parseLevelId", () => {
  test("parses chapter and index", () => {
    expect(parseLevelId("ch2-l07")).toEqual({ chapter: 2, index: 7 });
    expect(parseLevelId("ch1-l10")).toEqual({ chapter: 1, index: 10 });
    expect(parseLevelId("ch12-l01")).toEqual({ chapter: 12, index: 1 });
  });
  test("null for anything else (2-digit index required)", () => {
    for (const bad of [
      "",
      "ch2-l7",
      "ch2-l007",
      "level-1",
      "ch-l01",
      "CH2-L01",
      "ch2-l01x",
      "xch2-l01",
    ])
      expect(parseLevelId(bad)).toBeNull();
  });
});

describe("bundleChapters", () => {
  test("Ch1 only today; ascending with the Ch2 stubs", () => {
    expect(bundleChapters(contentBundle)).toEqual([1]);
    expect(bundleChapters(two)).toEqual([1, 2]);
  });
  test("ascending regardless of array order", () => {
    const shuffled: ContentBundle = { ...two, levels: [...two.levels].reverse() };
    expect(bundleChapters(shuffled)).toEqual([1, 2]);
  });
});

describe("levelUnlocked (by id, not bundle order)", () => {
  test("ch1-l01 is always open; the rest of Ch1 chains", () => {
    expect(levelUnlocked(clearedSet(), two, "ch1-l01")).toBe(true);
    expect(levelUnlocked(clearedSet(), two, "ch1-l02")).toBe(false);
    expect(levelUnlocked(clearedSet("ch1-l01"), two, "ch1-l02")).toBe(true);
    expect(levelUnlocked(clearedSet("ch1-l01"), two, "ch1-l03")).toBe(false);
  });
  test("ch2-l01 opens only on ch1-l10 cleared", () => {
    expect(levelUnlocked(clearedSet(...ids(1, 9)), two, "ch2-l01")).toBe(false);
    expect(levelUnlocked(clearedSet(...ids(1)), two, "ch2-l01")).toBe(true);
    expect(levelUnlocked(clearedSet(...ids(1)), two, "ch2-l02")).toBe(false);
    expect(levelUnlocked(clearedSet(...ids(1), "ch2-l01"), two, "ch2-l02")).toBe(true);
  });
  test("bundle array order does not matter", () => {
    const shuffled: ContentBundle = { ...two, levels: [...two.levels].reverse() };
    for (const id of ["ch1-l01", "ch1-l05", "ch2-l01", "ch2-l05"])
      expect(levelUnlocked(clearedSet(...ids(1), "ch2-l01", "ch2-l02"), shuffled, id)).toBe(
        levelUnlocked(clearedSet(...ids(1), "ch2-l01", "ch2-l02"), two, id),
      );
    expect(levelUnlocked(clearedSet(...ids(1)), shuffled, "ch2-l01")).toBe(true);
    expect(levelUnlocked(clearedSet(), shuffled, "ch1-l01")).toBe(true);
  });
  test("unknown or malformed ids are locked", () => {
    expect(levelUnlocked(clearedSet(...ids(1)), contentBundle, "ch2-l01")).toBe(false); // not in the Ch1-only bundle
    expect(levelUnlocked(clearedSet(), two, "nope")).toBe(false);
    expect(levelUnlocked(clearedSet(), two, "ch9-l01")).toBe(false);
  });
});

describe("frontierChapterOf", () => {
  test("Ch1 cleared opens chapter 2 (old saves, no migration)", () => {
    expect(frontierChapterOf(1, clearedSet(...ids(1)), two)).toBe(2);
  });
  test("not cleared: the stored value stands", () => {
    expect(frontierChapterOf(1, clearedSet(...ids(1, 9)), two)).toBe(1);
    expect(frontierChapterOf(2, clearedSet(), two)).toBe(2);
  });
  test("never goes down, capped at the highest bundle chapter", () => {
    expect(frontierChapterOf(2, clearedSet(...ids(1)), two)).toBe(2);
    expect(frontierChapterOf(1, clearedSet(...ids(1), ...ids(2)), two)).toBe(2);
    expect(frontierChapterOf(5, clearedSet(), two)).toBe(2);
    // today's shipped Ch1-only bundle: nothing to open yet
    expect(frontierChapterOf(1, clearedSet(...ids(1)), contentBundle)).toBe(1);
  });
});

describe("parArmorBp", () => {
  test("pinned: Ch1 10000, Ch2 11400 (T1 Common +2)", () => {
    expect(parArmorBp(1)).toBe(10_000);
    expect(parArmorBp(2)).toBe(11_400);
  });
});

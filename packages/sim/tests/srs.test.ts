// T1.6 SRS: Leitner 5 boxes (intervals 1/2/4/8/16 levels), D29 demotion, due ordering, injection into resolveLevel.
import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  NEW_SRS,
  resolveLevel,
  type SrsState,
  srsDue,
  srsUpdate,
  type WordResult,
} from "../src/index.ts";

const w = (key: string, over: Partial<WordResult> = {}): WordResult => ({
  wordKey: key,
  text: key,
  kind: "word",
  perfect: true,
  typos: 0,
  wpm: 40,
  ...over,
});
const typo = (key: string): WordResult => w(key, { perfect: false, typos: 1 });
const PACE = 40;
const play = (s: SrsState, ...words: WordResult[]): SrsState => srsUpdate(s, words, PACE);

describe("srsUpdate", () => {
  test("a typo enters box 1, due next level; levelsPlayed increments", () => {
    const s = play(NEW_SRS, typo("receive"));
    expect(s.levelsPlayed).toBe(1);
    expect(s.entries.receive).toEqual({ box: 1, due: 1, lapses: 0 });
    expect(srsDue(s, 10)).toEqual(["receive"]);
  });

  test("slow typing (wpm below 50% of pace) counts as a miss even when perfect", () => {
    expect(play(NEW_SRS, w("slow", { wpm: 19 })).entries.slow?.box).toBe(1);
    expect(play(NEW_SRS, w("fine", { wpm: 20 })).entries.fine).toBeUndefined();
  });

  test("a perfect word promotes only when due: intervals 1, 2, 4, 8, 16 then mastered", () => {
    let s = play(NEW_SRS, typo("a")); // box 1, due 1, levelsPlayed 1
    const trail: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      s = play(s, w("a"));
      const e = s.entries.a;
      trail.push([e?.box ?? 0, (e?.due ?? 0) - (s.levelsPlayed - 1)]);
      // wait until due, then promote again
      while ((s.entries.a?.due ?? 0) > s.levelsPlayed) s = play(s);
    }
    expect(trail).toEqual([
      [2, 2],
      [3, 4],
      [4, 8],
      [5, 16],
    ]);
    s = play(s, w("a")); // box 5, due -> mastered
    expect(s.entries.a).toBeUndefined();
    expect(s.mastered).toEqual(["a"]);
  });

  test("a perfect word that is not due does not move", () => {
    let s = play(NEW_SRS, typo("a"));
    s = play(s, w("a")); // due 1 <= 1: promoted to box 2, due 1 + 2 = 3, levelsPlayed 2
    const before = { ...s.entries.a };
    s = play(s, w("a")); // levelsPlayed 2 < due 3: untouched
    expect(s.entries.a).toEqual(before);
  });

  test("a typo demotes one box and counts a lapse (D29); box 1 stays box 1", () => {
    let s: SrsState = {
      levelsPlayed: 10,
      entries: { x: { box: 4, due: 12, lapses: 0 } },
      mastered: [],
    };
    s = play(s, typo("x"));
    expect(s.entries.x).toEqual({ box: 3, due: 10 + 4, lapses: 1 });
    s = { ...s, entries: { x: { box: 1, due: 5, lapses: 2 } } };
    s = play(s, typo("x"));
    expect(s.entries.x).toEqual({ box: 1, due: 11 + 1, lapses: 3 });
  });

  test("a word seen twice in a level is judged once: any typo fails it; all perfect passes it", () => {
    const s = play(NEW_SRS, w("dup"), typo("dup"));
    expect(s.entries.dup?.box).toBe(1);
    expect(Object.keys(s.entries)).toEqual(["dup"]);
    const seeded: SrsState = {
      levelsPlayed: 3,
      entries: { dup: { box: 1, due: 2, lapses: 0 } },
      mastered: [],
    };
    expect(play(seeded, w("dup"), w("dup")).entries.dup?.box).toBe(2);
  });

  test("only word plates count; guard and sentence plates are ignored", () => {
    const s = play(
      NEW_SRS,
      typo("guardword"),
      { ...typo("g"), kind: "guard" },
      { ...typo("s"), kind: "doom" },
    );
    expect(Object.keys(s.entries)).toEqual(["guardword"]);
  });

  test("a mastered word that fails again re-enters box 1 and leaves the mastered list", () => {
    const s: SrsState = { levelsPlayed: 50, entries: {}, mastered: ["m", "n"] };
    const t = play(s, typo("m"));
    expect(t.mastered).toEqual(["n"]);
    expect(t.entries.m).toEqual({ box: 1, due: 51, lapses: 0 });
  });

  test("the input state is not mutated", () => {
    const s: SrsState = {
      levelsPlayed: 3,
      entries: { a: { box: 2, due: 3, lapses: 0 } },
      mastered: [],
    };
    const snap = JSON.stringify(s);
    play(s, typo("a"), typo("b"));
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe("srsDue", () => {
  const s: SrsState = {
    levelsPlayed: 10,
    entries: {
      zeta: { box: 1, due: 8, lapses: 0 },
      alpha: { box: 2, due: 8, lapses: 0 },
      beta: { box: 1, due: 8, lapses: 0 },
      early: { box: 5, due: 3, lapses: 0 },
      later: { box: 1, due: 11, lapses: 0 }, // not due yet
      Alpha: { box: 1, due: 8, lapses: 0 },
    },
    mastered: [],
  };
  test("sorted by (due, box, key by code-unit order); not-yet-due words are excluded", () => {
    // due 3 first; then due 8: box 1 keys by cmpStr (uppercase sorts before lowercase), then box 2
    expect(srsDue(s, 10)).toEqual(["early", "Alpha", "beta", "zeta", "alpha"]);
  });
  test("limit truncates after sorting; limit 0 is empty", () => {
    expect(srsDue(s, 2)).toEqual(["early", "Alpha"]);
    expect(srsDue(s, 0)).toEqual([]);
  });
});

describe("injection into resolveLevel (the 5% weak share)", () => {
  const resolve = (due: string[]) => resolveLevel(contentBundle, "ch1-l04", { dueWeakWords: due });
  const plateWord = contentBundle.words.find(
    (x) =>
      x.kind === "word" && x.uses.includes("plate") && x.text.length >= 3 && x.text.length <= 5,
  );

  test("due keys become the authored plate text, de-duplicated, in due order", () => {
    const keys = contentBundle.words
      .filter(
        (x) =>
          x.kind === "word" && x.uses.includes("plate") && x.text.length >= 3 && x.text.length <= 5,
      )
      .slice(0, 3)
      .map((x) => x.key);
    const l = resolve([keys[1] as string, keys[0] as string, keys[1] as string, keys[2] as string]);
    expect(l.words.weak).toEqual(
      [keys[1], keys[0], keys[2]].map((k) => contentBundle.words.find((x) => x.key === k)?.text),
    );
    expect(l.tierMixBp.weak).toBe(500);
  });

  test("unknown keys and words outside the level's plateLength are skipped", () => {
    expect(plateWord).toBeDefined();
    const lv = contentBundle.levels.find((x) => x.id === "ch1-l04");
    const long = contentBundle.words.find(
      (x) =>
        x.kind === "word" && x.uses.includes("plate") && x.text.length > (lv?.plateLength[1] ?? 0),
    );
    const l = resolve(["definitely-not-a-word", long?.key ?? "x", plateWord?.key as string]);
    expect(l.words.weak).toEqual([plateWord?.text]);
  });

  test("plate pools are filtered to the level's plateLength", () => {
    const l = resolve([]);
    const [lo, hi] = l.plateLength;
    for (const pool of [l.words.current, l.words.review]) {
      for (const t of pool) {
        expect(t.length).toBeGreaterThanOrEqual(lo);
        expect(t.length).toBeLessThanOrEqual(hi);
      }
    }
    expect(l.words.current.length).toBeGreaterThan(0);
  });

  test("end to end: a weak word typo'd in one level is due in the next resolve", () => {
    let s = NEW_SRS;
    const target = plateWord?.key as string;
    s = srsUpdate(s, [w(target, { perfect: false, typos: 2 })], 35);
    const l = resolve(srsDue(s, 5));
    expect(l.words.weak).toEqual([plateWord?.text]);
  });
});

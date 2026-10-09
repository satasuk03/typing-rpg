// T1.5 typing gimmicks (doc 01 §4.1): the Fading word and the Scrambled word. Rules: interfaces §3.2 step 4,
// §4 WordFaded / WordScrambled / WordUnscrambled, §5 PlateView.faded / display; gimmicks never break the distinct-first-letter rule.
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { scrambleWord } from "../src/gimmick.ts";
import { deriveRng, type Gimmick, type ResolvedLevel } from "../src/index.ts";
import { firstLetter } from "../src/words.ts";
import { Driver, mkSimpleDef, POOL_CURRENT, POOL_GUARD } from "./typingHarness.ts";

/** One encounter with the given enemies, each carrying a gimmick, in zen (enemies never attack) unless said otherwise. */
function gimmickDef(gimmicks: (Gimmick | null)[], pool: string[] = POOL_CURRENT): ResolvedLevel {
  const def = mkSimpleDef(
    gimmicks.map(() => "slime"),
    { current: pool },
  );
  const seg = def.segments[0];
  if (seg?.kind !== "encounter") throw new Error("encounter expected");
  const wave = seg.waves[0] as { gimmick: Gimmick | null }[];
  gimmicks.forEach((g, i) => {
    (wave[i] as { gimmick: Gimmick | null }).gimmick = g;
  });
  return def;
}
const zen = (g: (Gimmick | null)[], seed = 3, pool?: string[]): Driver =>
  new Driver(gimmickDef(g, pool), seed, { difficulty: "zen" }).toCombat();

const sorted = (s: string): string => [...s].sort().join("");

describe("Fading word", () => {
  test("the plate fades FADE_DELAY after typing goes live: WordFaded on that tick, PlateView.faded flips", () => {
    const d = zen(["fading"]);
    const p = d.plates()[0];
    expect(p?.faded).toBe(false);
    const live = d.state.enc?.typingFromTick as number;
    const shown = d.ofType("PlateShown")[0];
    expect(shown?.tick).toBeLessThanOrEqual(live); // shown during the intro...
    const fadeAt = live + K.FADE_DELAY_T; // ...but the clock starts when typing is live
    expect(K.FADE_DELAY_T).toBe(90);
    d.step(fadeAt - d.state.tick); // up to tick fadeAt - 1
    expect(d.view().plates[0]?.faded).toBe(false);
    expect(d.ofType("WordFaded")).toHaveLength(0);
    const ev = d.step(1);
    expect(d.ofType("WordFaded", ev)).toEqual([
      { type: "WordFaded", tick: fadeAt, plateId: p?.id, enemyId: d.state.enc?.enemies[0]?.id },
    ]);
    expect(d.view().plates[0]).toMatchObject({ faded: true, display: p?.text });
    expect(d.ofType("WordFaded")).toHaveLength(1); // once
    d.step(300);
    expect(d.ofType("WordFaded")).toHaveLength(1);
  });

  test("typed letters stay (typedIndex advances while faded); Escape resets progress but the plate stays faded", () => {
    const d = zen(["fading"]);
    const first = d.plates()[0];
    d.step(K.FADE_DELAY_T + 2);
    d.type((first?.text ?? "").slice(0, 2));
    expect(d.view().plates[0]).toMatchObject({ faded: true, typedIndex: 2, isTarget: true });
    d.key("Escape");
    expect(d.view().plates[0]).toMatchObject({ faded: true, typedIndex: 0, isTarget: false });
    // typing the rest still works and is judged against the real text
    d.type(first?.text ?? "");
    expect(d.ofType("WordCompleted")[0]?.text).toBe(first?.text);
  });

  test("a completed word is replaced by a fresh, unfaded plate that fades on its own clock", () => {
    const d = zen(["fading"]);
    const first = d.plates()[0];
    d.step(K.FADE_DELAY_T + 2);
    d.type(first?.text ?? "");
    const next = d.plates()[0];
    expect(next?.id).not.toBe(first?.id);
    expect(next?.faded).toBe(false);
    const t0 = d.state.tick;
    const ev = d.step(K.FADE_DELAY_T + 1);
    expect(d.ofType("WordFaded", ev)[0]?.plateId).toBe(next?.id);
    expect(d.ofType("WordFaded", ev)[0]?.tick).toBeGreaterThanOrEqual(t0 + K.FADE_DELAY_T - 1);
  });

  test("a guard word is never faded, and the word that returns after the guard fades again", () => {
    const d = new Driver(gimmickDef(["fading"]), 3, { difficulty: "standard" }).toCombat();
    const e = d.state.enc?.enemies[0];
    d.until("GuardWordShown", 5000);
    expect(d.plates().find((p) => p.kind === "guard")?.faded).toBe(false);
    const g = d.plates().find((p) => p.kind === "guard");
    const faded = d.ofType("WordFaded").length;
    d.type(g?.text ?? "");
    const back = d.plates().find((p) => p.kind === "word" && p.ownerId === e?.id);
    expect(back?.faded).toBe(false);
    d.step(K.FADE_DELAY_T + 1);
    expect(d.ofType("WordFaded").length).toBeGreaterThan(faded);
    expect(d.ofType("WordFaded").some((w) => w.plateId === back?.id)).toBe(true);
  });

  test("only the gimmick enemy's plate fades", () => {
    const d = zen([null, "fading", null]);
    d.step(K.FADE_DELAY_T + 5);
    const faded = d.plates().filter((p) => p.faded);
    expect(faded).toHaveLength(1);
    expect(faded[0]?.ownerId).toBe(d.state.enc?.enemies[1]?.id);
  });
});

describe("Scrambled word", () => {
  test("the plate shows the letters scrambled; WordScrambled carries the display; the answer is the real word", () => {
    const d = zen(["scrambled"]);
    const p = d.plates()[0];
    expect(p?.display).not.toBe(p?.text);
    expect(sorted(p?.display ?? "")).toBe(sorted(p?.text ?? ""));
    expect(firstLetter(p?.display ?? "")).not.toBe(firstLetter(p?.text ?? ""));
    const ev = d.ofType("WordScrambled")[0];
    expect(ev).toMatchObject({ plateId: p?.id, display: p?.display });
    const shown = d.ofType("PlateShown").find((s) => s.plateId === p?.id);
    expect(shown).toMatchObject({ text: p?.text, display: p?.display });
  });

  test("the first VISIBLE letter is not a way in: it is a stray typo; the answer's first letter locks and unscrambles", () => {
    const d = zen(["scrambled"]);
    const p = d.plates()[0];
    const wrong = d.key(p?.display.charAt(0) ?? "");
    expect(d.ofType("Typo", wrong)[0]).toMatchObject({ plateId: null });
    expect(d.view().plates[0]?.isTarget).toBe(false);
    const ok = d.key(p?.text.charAt(0) ?? "");
    const kinds = ok.map((e) => e.type);
    expect(kinds.indexOf("TargetAcquired")).toBeLessThan(kinds.indexOf("WordUnscrambled"));
    expect(kinds.indexOf("WordUnscrambled")).toBeLessThan(kinds.indexOf("CharCorrect"));
    expect(d.ofType("WordUnscrambled", ok)[0]).toMatchObject({ plateId: p?.id });
    expect(d.view().plates[0]).toMatchObject({ display: p?.text, typedIndex: 1 });
    // typing the real word completes it
    d.type((p?.text ?? "").slice(1));
    expect(d.ofType("WordCompleted")[0]?.text).toBe(p?.text);
  });

  test("it stays unscrambled after Escape; the next plate of that enemy is scrambled again", () => {
    const d = zen(["scrambled"]);
    const p = d.plates()[0];
    d.key(p?.text.charAt(0) ?? "");
    d.key("Escape");
    expect(d.view().plates[0]?.display).toBe(p?.text);
    d.type(p?.text ?? "");
    const next = d.plates()[0];
    expect(next?.id).not.toBe(p?.id);
    expect(next?.display).not.toBe(next?.text);
    expect(d.ofType("WordScrambled")).toHaveLength(2);
  });

  test("distinct first letters hold for the answers AND the visible letters, at every tick, over many seeds and crowds", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const d = new Driver(gimmickDef(["scrambled", "scrambled", "fading", null]), seed, {
        difficulty: "standard",
      }).toCombat();
      for (let i = 0; i < 700; i++) {
        const plates = d.plates();
        const seen: string[] = [];
        for (const p of plates) {
          seen.push(firstLetter(p.text));
          if (p.display !== p.text) seen.push(firstLetter(p.display));
        }
        expect(new Set(seen).size).toBe(seen.length);
        if (i % 9 === 0) {
          const pick = plates.find((p) => p.kind === "word") ?? plates[0];
          if (pick !== undefined) d.type(pick.text.slice(0, 3), 1);
        }
        d.step(1);
      }
    }
  });

  test("a word that cannot be scrambled while keeping the rule is shown as it is (no event)", () => {
    const rng = deriveRng(1, "gimmick", 0);
    expect(scrambleWord(rng, "aaa", [])).toBeNull(); // every candidate letter is the answer's own
    expect(scrambleWord(rng, "ab", ["b"])).toBeNull(); // the only other letter is taken
    expect(scrambleWord(rng, "a", [])).toBeNull();
    const d = zen(["scrambled"], 3, ["aaa"]);
    expect(d.plates()[0]?.display).toBe("aaa");
    expect(d.ofType("WordScrambled")).toHaveLength(0);
  });

  test("scrambleWord is deterministic per rng state, keeps the multiset, never starts with the answer's first letter", () => {
    for (const w of ["goblin", "ember", "cave", "to", "stone"]) {
      const a = scrambleWord(deriveRng(7, "gimmick", 1), w, []);
      const b = scrambleWord(deriveRng(7, "gimmick", 1), w, []);
      expect(a).toBe(b);
      expect(sorted(a ?? "")).toBe(sorted(w));
      expect(firstLetter(a ?? "")).not.toBe(firstLetter(w));
    }
    // the forbidden set is respected
    const s = scrambleWord(deriveRng(7, "gimmick", 1), "goblin", ["b", "l", "i", "n"]);
    expect(s?.charAt(0)).toBe("o");
  });

  test("guard words are never scrambled", () => {
    const d = new Driver(gimmickDef(["scrambled"]), 3, { difficulty: "standard" }).toCombat();
    d.until("GuardWordShown", 5000);
    const g = d.plates().find((p) => p.kind === "guard");
    expect(g?.display).toBe(g?.text);
    expect(POOL_GUARD).toContain(g?.text);
  });
});

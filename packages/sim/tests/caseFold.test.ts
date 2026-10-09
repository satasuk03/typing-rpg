// PO ruling: Ch1 sentence plates fold case (lowercase and Shift+letter both count); punctuation and spaces stay exact.
// Later chapters (foldSentences = false) need exact case. Normal word plates and the Trial are unchanged.
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import type { ResolvedLevel } from "../src/index.ts";
import { BOSS, Driver, ENEMIES, mkDef, mkLoadout } from "./typingHarness.ts";

const DOOM = "Crumble beneath my ancient weight.";

function doomDriver(foldSentences: boolean, seed = 5): Driver {
  const def: ResolvedLevel = mkDef({
    foldSentences,
    segments: [{ kind: "boss", bossId: "ruinGolem" }],
    boss: { ...BOSS },
    enemies: { ...ENEMIES },
    words: {
      current: ["apple", "bird", "cat", "door", "eagle", "fish", "gold", "hill"],
      review: [],
      biome: [],
      weak: [],
      guard: ["arm", "bar", "cap", "dig", "end", "fin", "gap", "hit"],
      doom: [DOOM],
      finisher: [BOSS.phase3.finisherText],
      secondWind: ["Never give up."],
      minigame: ["dust", "crack", "brick", "shard"],
    },
  });
  const d = new Driver(def, seed, {}, mkLoadout()).toCombat();
  const quiet = (): void => {
    for (const e of d.state.enc?.enemies ?? []) {
      e.intervalTicks = 10_000_000;
      e.nextImpact = null;
      e.windupShown = false;
    }
  };
  quiet();
  const bs = () => d.state.enc?.boss as NonNullable<NonNullable<Driver["state"]["enc"]>["boss"]>;
  while (bs().phase < 2) {
    const b = d.state.enc?.enemies[0] as NonNullable<typeof d.state.enc>["enemies"][number];
    b.hpM = Math.min(b.hpM, b.gateHpM as number);
    for (let i = 0; i < 2000 && !(bs().phase >= 2 && d.state.phase === "combat"); i++) d.step();
  }
  quiet();
  for (let i = 0; i < 3000 && !d.plates().some((p) => p.kind === "doom"); i++) d.step();
  return d;
}

describe("sentence case folding", () => {
  test("Ch1: a Doom Spell completes typed all lowercase", () => {
    const d = doomDriver(true);
    const ev = d.type(DOOM.toLowerCase());
    expect(d.ofType("DoomSpellCompleted", ev)).toHaveLength(1);
    expect(d.ofType("DoomSpellFailed")).toHaveLength(0);
  });

  test("Ch1: Shift+letter (the authored capital) also counts", () => {
    const d = doomDriver(true);
    expect(d.ofType("DoomSpellCompleted", d.type(DOOM))).toHaveLength(1);
  });

  test("Ch1: punctuation and spaces must still be typed exactly", () => {
    const d = doomDriver(true);
    const plate = () => d.plates().find((p) => p.kind === "doom");
    d.type("crumble");
    expect(plate()?.typedIndex).toBe(7);
    d.key("x"); // the space is required
    expect(plate()?.typedIndex).toBe(7);
    d.step(1);
    d.type(" beneath my ancient weight");
    expect(plate()?.typedIndex).toBe(DOOM.length - 1);
    d.key(","); // the final "." is required
    expect(plate()?.typedIndex).toBe(DOOM.length - 1);
    d.step(1);
    expect(d.ofType("DoomSpellCompleted", d.type("."))).toHaveLength(1);
  });

  test("later chapter (folding off): the capital needs Shift", () => {
    const d = doomDriver(false);
    const plate = () => d.plates().find((p) => p.kind === "doom");
    d.key("c");
    expect(plate()?.typedIndex).toBe(0);
    d.step(1);
    d.key("C");
    expect(plate()?.typedIndex).toBe(1);
  });

  test("normal word plates are unchanged by the flag", () => {
    const d = doomDriver(true);
    const w = d.state.enc?.plates.find((p) => p.kind === "word");
    if (w !== undefined) expect(w.fold).toBe(w.text === w.text.toLowerCase());
  });

  test("the balance knob is Chapter 1", () => {
    expect(K.SENTENCE_FOLD_CASE_MAX_CHAPTER).toBe(1);
  });
});

// T1.1 "Ignore capitals" (LevelOptions.caseAssist, docs/interfaces.md §2 Case rule 1): every plate folds, beating caseMode.
import { describe, expect, test } from "vitest";
import type { ResolvedLevel } from "../src/index.ts";
import { BOSS, Driver, ENEMIES, mkDef, mkLoadout } from "./typingHarness.ts";

const DOOM = "Crumble beneath my ancient weight.";

function doomDriver(opts: { caseAssist?: boolean; caseMode?: "auto" | "strict" }): Driver {
  const def: ResolvedLevel = mkDef({
    foldSentences: false, // Ch2+: sentences are exact
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
  const d = new Driver(def, 5, opts, mkLoadout()).toCombat();
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

describe("caseAssist", () => {
  test("off (absent): an exact sentence needs the capital", () => {
    const d = doomDriver({});
    const plate = () => d.plates().find((p) => p.kind === "doom");
    d.key("c");
    expect(plate()?.typedIndex).toBe(0);
    d.step(1);
    d.key("C");
    expect(plate()?.typedIndex).toBe(1);
  });

  test("on: a Doom Spell completes typed all lowercase", () => {
    const d = doomDriver({ caseAssist: true });
    expect(d.ofType("DoomSpellCompleted", d.type(DOOM.toLowerCase()))).toHaveLength(1);
    expect(d.ofType("DoomSpellFailed")).toHaveLength(0);
  });

  test("on: every plate folds, and it beats caseMode strict", () => {
    const d = doomDriver({ caseAssist: true, caseMode: "strict" });
    for (const p of d.state.enc?.plates ?? []) expect(p.fold).toBe(true);
    expect(d.ofType("DoomSpellCompleted", d.type(DOOM.toLowerCase()))).toHaveLength(1);
  });

  test("strict without the assist keeps exact case", () => {
    const d = doomDriver({ caseMode: "strict" });
    const doom = d.state.enc?.plates.find((p) => p.kind === "doom");
    expect(doom?.fold).toBe(false);
  });
});

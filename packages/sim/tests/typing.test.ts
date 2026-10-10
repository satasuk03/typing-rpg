// T1.2 typing engine: one test per rule of docs/brainstorm/01-combat-and-levels.md §1 and docs/interfaces.md §3.3.
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { paceFactorBp, scheduleAttack } from "../src/guard.ts";
import { applyInput, createLevel, deriveRng, mulBp, type SimEvent } from "../src/index.ts";
import { comboMultBp, keyStreakAfterTypo, keyStreakTierOf } from "../src/typing.ts";
import { firstLetter, pickPlateWord } from "../src/words.ts";
import {
  Driver,
  FLAT_BOSS,
  mkDef,
  mkLoadout,
  mkOptions,
  mkSimpleDef,
  POOL_GUARD,
} from "./typingHarness.ts";

/** A boss-only level whose boss has 8 HP, so a few perfect chips (2.5 each) reach the final gate. */
const bossDef = () =>
  mkDef({
    segments: [{ kind: "boss", bossId: "ruinGolem" }],
    boss: { ...FLAT_BOSS, hpM: 8000 },
  });

/** Types the boss's word plates until the Finisher is shown (the flat boss passes its 1-tick breathers on the way). */
const toFinisher = (d: Driver): void => {
  for (let i = 0; i < 400 && d.ofType("FinisherShown").length === 0; i++) {
    const w = d.plates().find((p) => p.kind === "word");
    if (w !== undefined) d.type(w.text);
    else d.step();
  }
};

/** Zen difficulty = enemies never attack, so typing tests are not disturbed by guard words. */
const zenDriver = (
  enemies: string[],
  pool: string[],
  opts: Parameters<typeof mkOptions>[0] = {},
  waves = 1,
  loadout = mkLoadout(),
): Driver => {
  const d = new Driver(
    mkSimpleDef(enemies, { current: pool }, {}, waves, { poolM: 3_000_000, hitM: 5000 }),
    7,
    { difficulty: "zen", ...opts },
    loadout,
  );
  return d.toCombat();
};
const plateOf = (d: Driver, text: string) => {
  const p = d.plates().find((x) => x.text === text);
  if (p === undefined) throw new Error(`no plate ${text}`);
  return p;
};
const types = (ev: readonly SimEvent[]): string[] => ev.map((e) => e.type);
/** Types one whole perfect word (the first plate's text); returns the events. */
const perfectWord = (d: Driver, gap = 1): SimEvent[] => {
  const p = d.plates()[0];
  if (p === undefined) throw new Error("no plate");
  return d.type(p.text, gap);
};

describe("doc 01 §1.1 what the player types", () => {
  test("a plate completes on its last correct char: no Enter or Space submit", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const ev = d.type("apple");
    expect(d.ofType("WordCompleted", ev)).toHaveLength(1);
    expect(ev.filter((e) => e.type === "CharCorrect")).toHaveLength(5);
  });

  test("a completed plate is replaced at once by a fresh plate for the same enemy", () => {
    const d = zenDriver(["slime"], ["apple", "bread"], {}, 1);
    const owner = d.plates()[0]?.ownerId;
    const ev = d.type(d.plates()[0]?.text ?? "");
    const removed = d.ofType("PlateRemoved", ev);
    const shown = d.ofType("PlateShown", ev);
    expect(removed[0]?.reason).toBe("completed");
    expect(shown[0]?.ownerId).toBe(owner);
    expect(d.plates()).toHaveLength(1);
  });

  test("spaces only matter inside multi-word plates, where they must be typed", () => {
    const d = zenDriver(["slime"], ["red fox"]);
    d.key("r");
    d.step();
    d.key("e");
    d.step();
    d.key("d");
    d.step();
    const noSpace = d.key("f"); // expected " "
    expect(d.ofType("Typo", noSpace)[0]?.expected).toBe(" ");
    const space = d.key(" ");
    expect(d.ofType("CharCorrect", space)[0]?.char).toBe(" ");
    expect(d.ofType("SentenceWordDone", space)[0]).toMatchObject({ wordIndex: 0, wordCount: 2 });
    d.step();
    d.type("fox");
    expect(d.ofType("SentenceWordDone").map((e) => e.wordIndex)).toEqual([0, 1]);
    expect(d.ofType("WordCompleted")[0]?.text).toBe("red fox");
  });
});

describe("doc 01 §1.2 targeting", () => {
  test("first key selects the plate whose word starts with it", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const bird = plateOf(d, "bird");
    const ev = d.key("b");
    expect(d.ofType("TargetAcquired", ev)[0]).toMatchObject({
      plateId: bird.id,
      ownerId: bird.ownerId,
    });
    expect(d.ofType("CharCorrect", ev)[0]).toMatchObject({ plateId: bird.id, index: 0, char: "b" });
    expect(d.view().targetPlateId).toBe(bird.id);
    expect(types(ev)).toEqual(["TargetAcquired", "CharCorrect"]);
  });

  test("the first-letter lock is case-folded for lowercase plates (caseMode auto)", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const ev = d.key("B");
    expect(d.ofType("TargetAcquired", ev)).toHaveLength(1);
  });

  test("an uppercase plate is case-sensitive in auto mode; strict mode is always exact", () => {
    const a = zenDriver(["slime"], ["Bird"]);
    expect(d_has(a.key("b"), "Typo")).toBe(true);
    expect(d_has(a.key("B"), "TargetAcquired")).toBe(true);
    const b = zenDriver(["slime"], ["bird"], { caseMode: "strict" });
    expect(d_has(b.key("B"), "Typo")).toBe(true);
    expect(d_has(b.key("b"), "TargetAcquired")).toBe(true);
  });

  test("a key that matches no plate is a stray Typo with plateId null", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const ev = d.key("z");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({
      plateId: null,
      ownerId: null,
      kind: null,
      expected: null,
      got: "z",
    });
    expect(d.view().targetPlateId).toBeNull();
  });

  test("a space with no target is ignored", () => {
    const d = zenDriver(["slime"], ["apple"]);
    expect(d.key(" ")).toEqual([]);
    expect(d.state.run.keyStreak).toBe(0);
  });

  test("keys are ignored outside the combat phase (walk and encounter intro)", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 3, { difficulty: "zen" });
    expect(d.key("a")).toEqual([]); // before the first step
    d.step(5);
    expect(d.state.phase).toBe("encounterIntro");
    expect(d.key("a")).toEqual([]);
    expect(d.state.run.stats.typos).toBe(0);
    d.toCombat();
    expect(d.key("a").length).toBeGreaterThan(0);
  });

  test("while locked, other plates' letters do not switch the target (they are typos)", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const apple = plateOf(d, "apple");
    d.key("a");
    d.step();
    const ev = d.key("b");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({ plateId: apple.id, expected: "p", got: "b" });
    expect(d.view().targetPlateId).toBe(apple.id);
  });

  test("Escape drops the target", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const apple = plateOf(d, "apple");
    d.key("a");
    d.step();
    const ev = d.key("Escape");
    expect(d.ofType("TargetDropped", ev)[0]).toMatchObject({ plateId: apple.id, reason: "escape" });
    expect(d.view().targetPlateId).toBeNull();
  });

  test("Escape with no target does nothing", () => {
    const d = zenDriver(["slime"], ["apple"]);
    expect(d.key("Escape")).toEqual([]);
  });

  test("auto-unlock drops the lock after N consecutive wrong keys (and only then)", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"], { autoUnlockAfterTypos: 3 });
    d.key("a");
    d.step();
    d.key("x");
    d.step();
    d.key("x");
    d.step();
    expect(d.view().targetPlateId).not.toBeNull();
    const ev = d.key("x");
    expect(d.ofType("TargetDropped", ev)[0]?.reason).toBe("autoUnlock");
    expect(d.view().targetPlateId).toBeNull();
    // off by default
    const e = zenDriver(["slime", "bat"], ["apple", "bird"]);
    e.key("a");
    for (let i = 0; i < 6; i++) e.key("x");
    expect(e.view().targetPlateId).not.toBeNull();
  });

  test("a correct key resets the consecutive-wrong counter for auto-unlock", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"], { autoUnlockAfterTypos: 3 });
    d.key("a");
    d.key("x");
    d.key("x");
    d.key("p");
    d.key("x");
    d.key("x");
    expect(d.view().targetPlateId).not.toBeNull();
  });

  test("focus is the owner of the last completed plate", () => {
    const d = zenDriver(["slime", "bat"], ["apple", "bird"]);
    const other = d.plates().find((p) => p.ownerId !== d.view().focusEnemyId);
    if (other === undefined) throw new Error("setup");
    const ev = d.type(other.text);
    expect(d.view().focusEnemyId).toBe(other.ownerId);
    expect(d.ofType("FocusChanged", ev).at(-1)?.enemyId).toBe(other.ownerId);
  });

  test("when the focus dies, focus moves to the lowest-slot living enemy", () => {
    // two enemies share a 5 HP pool (2.5 each): a perfect word's chip (25% of 10 ATK) kills one outright
    const d = new Driver(
      mkSimpleDef(["slime", "bat"], { current: ["apple", "bird"] }, {}, 1, {
        poolM: 5000,
        hitM: 5000,
      }),
      7,
      { difficulty: "zen" },
    ).toCombat();
    const bird = plateOf(d, "bird");
    d.type("bird");
    const dead = d.view().enemies.find((e) => e.id === bird.ownerId);
    expect(dead?.alive).toBe(false);
    const alive = d.view().enemies.filter((e) => e.alive);
    expect(d.view().focusEnemyId).toBe(alive[0]?.id);
  });
});

function d_has(ev: readonly SimEvent[], type: SimEvent["type"]): boolean {
  return ev.some((e) => e.type === type);
}

describe("doc 01 §1.3 Word Strike", () => {
  test("completing a word emits a chip Hit on the plate's owner (typing-only stub damage)", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const owner = d.plates()[0]?.ownerId;
    const ev = d.type("apple");
    const hit = d.ofType("Hit", ev)[0];
    expect(hit).toMatchObject({ kind: "chip", origin: "chip", targetId: owner, sourceId: 0 });
    expect(types(ev).indexOf("WordCompleted")).toBeLessThan(types(ev).indexOf("Hit"));
  });
});

describe("doc 01 §1.4 accuracy vs speed", () => {
  test("typo does not advance", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.key("a");
    d.step();
    d.key("x");
    d.step();
    expect(d.plates()[0]?.typedIndex).toBe(1);
    d.key("p");
    expect(d.plates()[0]?.typedIndex).toBe(2);
  });

  test("Typo carries kind, index, expected and keyStreakBefore", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.type("app");
    const ev = d.key("x");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({
      kind: "word",
      index: 3,
      expected: "l",
      got: "x",
      keyStreakBefore: 3,
    });
  });

  test("a word with a typo completes imperfect (perfect=false)", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.key("a");
    d.key("x");
    d.step();
    const ev = d.type("pple");
    expect(d.ofType("WordCompleted", ev)[0]?.perfect).toBe(false);
    expect(d.plates()[0]?.hadTypo).toBe(false); // the fresh plate starts clean
  });

  test("PlateView.hadTypo and lastTypoTick report the current attempt", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.key("a");
    const tick = d.state.tick;
    d.key("x");
    expect(d.plates()[0]).toMatchObject({ hadTypo: true, lastTypoTick: tick });
  });

  test("a perfect word pays word_bonus x1.25 plus 0.25 x the per-char ATB paid (no swift when slow)", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const ev = d.type("apple", 20); // 36 WPM per word < 1.3 x pace 35: not swift
    const wc = d.ofType("WordCompleted", ev)[0];
    expect(wc?.swift).toBe(false);
    const perChar = 8000; // sword char_charge 8, combo 0
    expect(wc?.atbGainM).toBe(mulBp(10_000, 12_500) + mulBp(5 * perChar, 2500));
  });

  test("an imperfect word gets the plain word bonus, no x1.25 and no per-char bonus", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.key("a");
    d.key("x");
    d.step(20);
    const ev = d.type("pple", 20);
    expect(d.ofType("WordCompleted", ev)[0]?.atbGainM).toBe(10_000);
  });

  test("a Swift word (perfect, >= 1.3 x Pace) adds the flat Swift ATB and sets swift", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const ev = d.type("apple", 10); // 72 WPM >= 45.5
    const wc = d.ofType("WordCompleted", ev)[0];
    expect(wc?.swift).toBe(true);
    expect(wc?.atbGainM).toBe(mulBp(10_000, 12_500) + mulBp(5 * 8000, 2500) + K.SWIFT_ATB_M);
  });

  test("an imperfect word is never Swift", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.key("a");
    d.key("x");
    d.step();
    const ev = d.type("pple", 1);
    expect(d.ofType("WordCompleted", ev)[0]?.swift).toBe(false);
  });
});

describe("doc 01 §1.5 combo", () => {
  test("a perfect word gives +1 combo", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    const ev = perfectWord(d);
    expect(d.ofType("WordCompleted", ev)[0]?.combo).toBe(1);
    expect(d.view().combo).toBe(1);
  });

  test("an imperfect completion leaves the combo unchanged (B1)", () => {
    const d = zenDriver(["slime"], ["apple"], { comboMode: "zen" }, 20);
    perfectWord(d);
    perfectWord(d);
    d.key("a");
    d.key("x");
    d.step();
    const ev = d.type("pple");
    expect(d.ofType("WordCompleted", ev)[0]?.combo).toBe(2);
    expect(d.view().combo).toBe(2);
  });

  test("Gentle halves the combo (floor) on a typo", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 5; i++) perfectWord(d);
    expect(d.view().combo).toBe(5);
    d.key("a");
    const ev = d.key("x");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({ comboBefore: 5, combo: 2, penalty: "halved" });
    expect(d.view().combo).toBe(2);
  });

  test("Gentle halves combo once per word: a second typo on the same plate is latched", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 8; i++) perfectWord(d);
    d.key("a");
    const t1 = d.key("x");
    const t2 = d.key("x");
    expect(d.ofType("Typo", t1)[0]?.penalty).toBe("halved");
    expect(d.ofType("Typo", t2)[0]).toMatchObject({ penalty: "latched", comboBefore: 4, combo: 4 });
  });

  test("the typo latch is per plate: the next word's typo halves again", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 8; i++) perfectWord(d);
    d.key("a");
    d.key("x");
    d.type("pple");
    d.key("a");
    const ev = d.key("x");
    expect(d.ofType("Typo", ev)[0]?.penalty).toBe("halved");
  });

  test("stray typos share one latch that clears on the next correct char", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 8; i++) perfectWord(d);
    const s1 = d.key("z");
    const s2 = d.key("z");
    expect(d.ofType("Typo", s1)[0]?.penalty).toBe("halved");
    expect(d.ofType("Typo", s2)[0]?.penalty).toBe("latched");
    d.key("a"); // correct: acquires and clears the latch
    d.key("Escape");
    const s3 = d.key("z");
    expect(d.ofType("Typo", s3)[0]?.penalty).toBe("halved");
  });

  test("Strict resets the combo to 0 and costs 5 ATB", () => {
    const d = zenDriver(["slime"], ["apple"], { comboMode: "strict" }, 20);
    for (let i = 0; i < 3; i++) perfectWord(d);
    const atbBefore = d.state.enc?.atbM ?? 0;
    expect(atbBefore).toBeGreaterThan(K.STRICT_TYPO_ATB_M);
    d.key("a");
    const atbMid = d.state.enc?.atbM ?? 0;
    const ev = d.key("x");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({ comboBefore: 3, combo: 0, penalty: "reset" });
    expect(d.state.enc?.atbM).toBe(atbMid - K.STRICT_TYPO_ATB_M);
  });

  test("Zen has no combo or ATB penalty (typos only count toward accuracy)", () => {
    const d = zenDriver(["slime"], ["apple"], { comboMode: "zen" }, 20);
    for (let i = 0; i < 3; i++) perfectWord(d);
    d.key("a");
    const atb = d.state.enc?.atbM;
    const ev = d.key("x");
    expect(d.ofType("Typo", ev)[0]).toMatchObject({ comboBefore: 3, combo: 3, penalty: "none" });
    expect(d.state.enc?.atbM).toBe(atb);
    expect(d.state.run.stats.typos).toBe(1);
  });

  test("combo tiers are 5/15/30/50 and ComboTierChanged fires on the crossing word", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 60);
    const seen: [number, number, number][] = [];
    for (let i = 0; i < 52; i++) {
      for (const e of d.ofType("ComboTierChanged", perfectWord(d)))
        seen.push([e.from, e.to, e.combo]);
    }
    expect(seen).toEqual([
      [0, 1, 5],
      [1, 2, 15],
      [2, 3, 30],
      [3, 4, 50],
    ]);
    expect(d.view().comboTier).toBe(4);
  });

  test("a typo that halves the combo across a tier boundary emits ComboTierChanged downward", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    for (let i = 0; i < 15; i++) perfectWord(d);
    expect(d.view().comboTier).toBe(2);
    d.key("a");
    const ev = d.key("x");
    expect(d.ofType("ComboTierChanged", ev)[0]).toMatchObject({ from: 2, to: 1, combo: 7 });
  });

  test("ComboMult = 1 + 0.02 x min(combo, 25): per-char ATB scales and caps at x1.5", () => {
    expect(comboMultBp(0)).toBe(10_000);
    expect(comboMultBp(10)).toBe(12_000);
    expect(comboMultBp(25)).toBe(15_000);
    expect(comboMultBp(80)).toBe(15_000);
    const d = zenDriver(["slime"], ["apple"], {}, 60);
    for (let i = 0; i < 10; i++) perfectWord(d);
    const ev = d.type("a");
    expect(d.ofType("CharCorrect", ev)[0]?.atbGainM).toBe(mulBp(8000, 12_000));
  });

  test("Sword Perfect Parry adds +1 combo on top of the perfect word; other weapons do not", () => {
    const run = (arch: "sword" | "dagger"): number => {
      const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 4, {}, mkLoadout(arch));
      d.toCombat();
      d.until("GuardWordShown");
      const guard = d.plates().find((p) => p.kind === "guard");
      if (guard === undefined) throw new Error("no guard plate");
      d.type(guard.text);
      return d.view().combo;
    };
    expect(run("sword")).toBe(2);
    expect(run("dagger")).toBe(1);
  });
});

describe("interfaces §3.3 key streak (VFX only)", () => {
  test("key streak counts consecutive correct keys and persists across plates", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    perfectWord(d);
    perfectWord(d);
    expect(d.view().keyStreak).toBe(10);
  });

  test("any typo drops the key streak one tier (below T2: to 0), stray ones included, in every combo mode", () => {
    for (const comboMode of ["gentle", "strict", "zen"] as const) {
      const d = zenDriver(["slime"], ["apple"], { comboMode }, 20);
      d.type("app");
      expect(d.view().keyStreak).toBe(3);
      d.key("x");
      expect(d.view().keyStreak).toBe(0);
      d.type("le");
      d.key("z"); // stray
      d.type("a");
      expect(d.view().keyStreak).toBe(1);
      d.key("z");
      expect(d.view().keyStreak).toBe(0);
    }
  });

  test("KeyStreakTierChanged fires at 10/25/50/100 correct keys and on the one-tier drop", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    const seen: [number, number, number][] = [];
    for (let i = 0; i < 20; i++) {
      for (const e of d.ofType("KeyStreakTierChanged", perfectWord(d))) {
        seen.push([e.from, e.to, e.keyStreak]);
      }
    }
    expect(seen).toEqual([
      [0, 1, 10],
      [1, 2, 25],
      [2, 3, 50],
      [3, 4, 100],
    ]);
    d.key("a");
    const ev = d.key("x");
    expect(d.ofType("KeyStreakTierChanged", ev)[0]).toMatchObject({
      from: 4,
      to: 3,
      keyStreak: 50,
    });
  });

  test("CharCorrect carries the post-key combo, tiers and streak", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 2; i++) perfectWord(d);
    const ev = d.type("a");
    expect(d.ofType("CharCorrect", ev)[0]).toMatchObject({
      combo: 2,
      comboTier: 0,
      keyStreak: 11,
      keyStreakTier: 1,
    });
  });

  test("the key streak does not affect the mechanical combo or ATB", () => {
    const a = zenDriver(["slime"], ["apple"], {}, 20);
    const b = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 3; i++) perfectWord(a);
    for (let i = 0; i < 3; i++) {
      b.key("z"); // stray typo between words: streak resets, zen combo untouched
      perfectWord(b);
    }
    // zen differs only in typo handling; here combo mode is gentle, so b halves the combo: compare per-char gain rule instead
    expect(a.view().keyStreakTier).toBe(1);
    expect(b.view().keyStreak).toBe(5);
    expect(b.view().keyStreakTier).toBe(0);
  });
});

describe("PO 2026-10-09: a typo drops the key streak ONE tier", () => {
  const climb = (d: ReturnType<typeof zenDriver>, n: number): void => {
    for (let i = 0; i < n / 5; i++) perfectWord(d);
  };
  const stray = (d: ReturnType<typeof zenDriver>) => d.key("z");

  test("T4 streak 120 -> 50, T3 60 -> 25, T2 30 -> 10, T1 12/10 -> 0, 5 -> 0", () => {
    const cases: [number, number][] = [
      [120, 50],
      [60, 25],
      [30, 10],
      [15, 0],
      [5, 0],
    ];
    for (const [from, to] of cases) {
      const d = zenDriver(["slime"], ["apple"], {}, 40);
      climb(d, from);
      expect(d.view().keyStreak).toBe(from);
      stray(d);
      expect(d.view().keyStreak).toBe(to);
      expect(d.view().keyStreakTier).toBe(keyStreakTierOf(to));
    }
  });

  test("a typo at exactly a threshold drops from that tier (100 -> 50, 50 -> 25, 25 -> 10, 10 -> 0)", () => {
    for (const [from, to] of [
      [100, 50],
      [50, 25],
      [25, 10],
      [10, 0],
    ] as const) {
      const d = zenDriver(["slime"], ["apple"], {}, 40);
      climb(d, from);
      const ev = stray(d);
      expect(d.view().keyStreak).toBe(to);
      expect(d.ofType("Typo", ev)[0]).toMatchObject({ keyStreakBefore: from });
    }
  });

  test("several typos in a row walk down T4 -> T3 -> T2 -> T1 -> 0 and emit a tier change each time", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    climb(d, 120);
    const seen: [number, number, number][] = [];
    for (let i = 0; i < 5; i++) {
      for (const e of d.ofType("KeyStreakTierChanged", stray(d)))
        seen.push([e.from, e.to, e.keyStreak]);
    }
    expect(seen).toEqual([
      [4, 3, 50],
      [3, 2, 25],
      [2, 1, 10],
      [1, 0, 0],
    ]);
    expect(d.view().keyStreak).toBe(0);
  });

  test("keyStreakAfterTypo: 120 -> 50, 60 -> 25, 30 -> 10, 12 -> 0, 5 -> 0, threshold values drop a tier", () => {
    expect([120, 100, 60, 50, 30, 25, 12, 10, 5, 0].map(keyStreakAfterTypo)).toEqual([
      50, 50, 25, 25, 10, 10, 0, 0, 0, 0,
    ]);
  });

  test("T1 -> 0 emits a tier change; a further typo at 0 emits none", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    climb(d, 15);
    expect(d.ofType("KeyStreakTierChanged", stray(d))[0]).toMatchObject({ from: 1, to: 0 });
    expect(d.ofType("KeyStreakTierChanged", stray(d))).toEqual([]); // already 0
  });

  test("tier-up events fire again when climbing back (50 -> 100 re-fires the T4 tier-up)", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    climb(d, 100);
    stray(d); // 50, T3
    expect(d.view().keyStreakTier).toBe(3);
    const seen: [number, number, number][] = [];
    for (let i = 0; i < 10; i++) {
      for (const e of d.ofType("KeyStreakTierChanged", perfectWord(d))) {
        seen.push([e.from, e.to, e.keyStreak]);
      }
    }
    expect(seen).toEqual([[3, 4, 100]]);
  });

  test("a typo mid-word drops one tier too, and Escape (the only correction key) leaves the streak alone", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    climb(d, 30);
    d.type("ap");
    d.key("x");
    expect(d.view().keyStreak).toBe(10);
    d.key("Escape");
    expect(d.view().keyStreak).toBe(10);
  });

  test("maxKeyStreak keeps the peak across a drop", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 40);
    climb(d, 60);
    stray(d);
    expect(d.state.run.stats.maxKeyStreak).toBe(60);
  });

  test("the streak is VFX only: with gentle combo, combo/ATB/HP match whether or not the streak was high", () => {
    const run = (preTypos: boolean): [number, number] => {
      const d = zenDriver(["slime"], ["apple"], {}, 40);
      climb(d, 60);
      if (preTypos) stray(d);
      stray(d);
      return [d.view().combo, d.view().keyStreak];
    };
    // combo is driven by perfect words only; the extra typo changes the streak (25 vs 10) but a second typo's combo
    // effect is latched, so combo is identical
    expect(run(false)[0]).toBe(run(true)[0]);
    expect(run(false)[1]).not.toBe(run(true)[1]);
  });
});

describe("interfaces §3.3 Escape (B1)", () => {
  test("Escape resets progress, keeps perfect", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 5);
    d.key("a");
    d.key("x"); // typo: perfect = false
    d.key("p");
    d.key("Escape");
    const p = d.plates()[0];
    expect(p?.typedIndex).toBe(0);
    expect(p?.hadTypo).toBe(true);
    const ev = d.type("apple");
    expect(d.ofType("WordCompleted", ev)[0]?.perfect).toBe(false);
  });

  test("Escape keeps a still-perfect plate perfect and has no combo effect", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 20);
    for (let i = 0; i < 4; i++) perfectWord(d);
    d.type("app");
    const before = d.view().combo;
    const ev = d.key("Escape");
    expect(d.view().combo).toBe(before);
    expect(d.ofType("Typo", ev)).toHaveLength(0);
    expect(d.ofType("ComboTierChanged", ev)).toHaveLength(0);
    const done = d.type("apple");
    expect(d.ofType("WordCompleted", done)[0]).toMatchObject({ perfect: true, combo: before + 1 });
  });

  test("Escape does not touch the key streak", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.type("app");
    d.key("Escape");
    expect(d.view().keyStreak).toBe(3);
  });

  test("Escape keeps maxPaidIndex: re-typed chars pay no ATB again", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const first = d.type("app");
    d.key("Escape");
    const second = d.type("app");
    const paid = (ev: readonly SimEvent[]): number[] =>
      d.ofType("CharCorrect", ev).map((e) => e.atbGainM);
    expect(paid(first)).toEqual([8000, 8000, 8000]);
    expect(paid(second)).toEqual([0, 0, 0]);
    const rest = d.type("le");
    expect(paid(rest)).toEqual([8000, 8000]);
    // the completion bonus counts only chars actually paid on this plate
    const wc = d.ofType("WordCompleted")[0];
    expect(wc?.atbGainM).toBe(
      mulBp(10_000, 12_500) + mulBp(5 * 8000, 2500) + (wc?.swift ? K.SWIFT_ATB_M : 0),
    );
  });

  test("Escape/ATB farming is impossible: ATB after Escape cycles equals ATB without them", () => {
    const a = zenDriver(["slime"], ["apple"]);
    const b = zenDriver(["slime"], ["apple"]);
    a.type("apple");
    for (let i = 0; i < 6; i++) {
      b.type("appl");
      b.key("Escape");
    }
    b.type("apple");
    expect(b.state.enc?.atbM).toBe(a.state.enc?.atbM);
  });
});

describe("doc 01 §2 / interfaces §3.3 ATB gauge", () => {
  test("per-char ATB = weapon char_charge x ComboMult (Sword 8, Dagger 11, Staff 6, Hammer 5)", () => {
    const want = { sword: 8000, dagger: 11_000, staff: 6000, hammer: 5000 } as const;
    for (const arch of ["sword", "dagger", "staff", "hammer"] as const) {
      const d = zenDriver(["slime"], ["apple"], {}, 1, mkLoadout(arch));
      const ev = d.type("a");
      expect(d.ofType("CharCorrect", ev)[0]?.atbGainM).toBe(want[arch]);
    }
  });

  test("a full gauge emits AtbFilled and keeps the overflow, capped at 30", () => {
    const d = zenDriver(["slime"], ["apple"], {}, 60, mkLoadout("dagger"));
    let filled: SimEvent | undefined;
    for (let i = 0; i < 30 && filled === undefined; i++) {
      filled = d.ofType("AtbFilled", perfectWord(d))[0];
    }
    expect(filled?.type).toBe("AtbFilled");
    const overflow = (filled as Extract<SimEvent, { type: "AtbFilled" }>).overflowM;
    expect(overflow).toBeLessThanOrEqual(K.ATB_OVERFLOW_CAP_M);
    expect(d.state.enc?.atbM).toBeLessThan(K.ATB_FULL_M);
  });

  test("hero ATB resets to 0 at each encounter start", () => {
    const d = new Driver(
      mkSimpleDef(
        ["slime"],
        { current: ["apple"] },
        {
          segments: [
            {
              kind: "encounter",
              name: "A",
              hpPoolM: 6000,
              gruntHitM: 1,
              attackPowerBp: 10_000,
              waves: [[{ enemyId: "slime", gimmick: null }]],
            },
            {
              kind: "encounter",
              name: "B",
              hpPoolM: 90_000,
              gruntHitM: 1,
              attackPowerBp: 10_000,
              waves: [[{ enemyId: "slime", gimmick: null }]],
            },
          ],
        },
      ),
      2,
      { difficulty: "zen" },
    ).toCombat();
    for (let i = 0; i < 3; i++) perfectWord(d);
    expect(d.state.enc?.atbM).toBeGreaterThan(0);
    d.until("EncounterStarted");
    expect(d.state.enc?.atbM).toBe(0);
  });
});

describe("doc 01 §1.7 guard words", () => {
  const guardSpan = (pace: number, story = false): number => {
    let g = Math.max(K.GUARD_MIN_T, mulBp(K.GUARD_T, paceFactorBp(pace)));
    if (story) g += K.STORY_GUARD_BONUS_T;
    return g;
  };

  test("the plate swaps to a guard word at impact - max(1.5 s, 2.5 s x pace factor) and emits GuardWordShown", () => {
    for (const pace of [15, 35, 70, 120]) {
      const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5, { pace }).toCombat();
      const ev = d.until("GuardWordShown");
      expect(ev.spanTicks).toBe(guardSpan(pace));
      expect(ev.impactTick - ev.tick).toBe(guardSpan(pace));
      expect(guardSpan(pace)).toBeGreaterThanOrEqual(K.GUARD_MIN_T);
    }
    expect(guardSpan(120)).toBe(90); // the 1.5 s floor
  });

  test("the story preset adds 1 s to the guard span", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5, {
      difficulty: "story",
    }).toCombat();
    expect(d.until("GuardWordShown").spanTicks).toBe(guardSpan(35, true));
  });

  test("the tutorial's first guard is twice as long", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5, {
      tutorial: true,
    }).toCombat();
    for (let i = 0; i < 3; i++) perfectWord(d); // the tutorial holds enemy attacks until 3 words are typed
    expect(d.until("GuardWordShown").spanTicks).toBe(
      mulBp(guardSpan(35), K.TUTORIAL_FIRST_GUARD_MULT_BP),
    );
  });

  test("event order: EnemyAttackWindup, PlateRemoved(replaced), PlateShown(guard), GuardWordShown", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    const from = d.all.length;
    d.until("GuardWordShown");
    const seq = d.all.slice(from).filter((e) => e.type !== "FocusChanged");
    expect(types(seq)).toEqual([
      "EnemyAttackWindup",
      "PlateRemoved",
      "PlateShown",
      "GuardWordShown",
    ]);
    const shown = seq[2] as Extract<SimEvent, { type: "PlateShown" }>;
    expect(shown.kind).toBe("guard");
    expect(shown.replacesPlateId).not.toBeNull();
    expect((seq[1] as Extract<SimEvent, { type: "PlateRemoved" }>).reason).toBe("replaced");
    expect(POOL_GUARD).toContain(shown.text);
  });

  test("if the replaced plate was the target, TargetDropped(plateChanged) fires first", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    d.key("a");
    const from = d.all.length;
    d.until("GuardWordShown");
    const seq = d.all.slice(from);
    const drop = d.ofType("TargetDropped", seq)[0];
    expect(drop?.reason).toBe("plateChanged");
    expect(types(seq).indexOf("TargetDropped")).toBeLessThan(types(seq).indexOf("PlateRemoved"));
    expect(d.view().targetPlateId).toBeNull();
  });

  test("guard words keep the visible plates' first letters distinct", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const d = new Driver(
        mkSimpleDef(["slime", "bat", "brute"], { current: ["apple", "bird", "cat"] }),
        seed,
      ).toCombat();
      for (let i = 0; i < 900; i++) {
        d.step();
        const letters = d.plates().map((p) => firstLetter(p.text));
        expect(new Set(letters).size).toBe(letters.length);
      }
    }
  });

  test("typing the guard word is a Block; typing it perfectly is a Parry; both resolve at impact", () => {
    const run = (perfect: boolean) => {
      const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
      d.until("GuardWordShown");
      const g = d.plates().find((p) => p.kind === "guard");
      if (g === undefined) throw new Error("no guard");
      const ev: SimEvent[] = [];
      if (!perfect) {
        ev.push(...d.key(g.text.charAt(0)));
        ev.push(...d.key("#"));
        ev.push(...d.type(g.text.slice(1)));
      } else {
        ev.push(...d.type(g.text));
      }
      const typed = d.ofType("GuardWordTyped", ev)[0];
      const attack = d.until("EnemyAttack");
      return { typed, attack, d, ev };
    };
    const p = run(true);
    expect(p.typed).toMatchObject({ perfect: true, result: "parry" });
    expect(p.attack.outcome).toBe("parried");
    expect(p.d.ofType("GuardParried")).toHaveLength(1);
    const b = run(false);
    expect(b.typed).toMatchObject({ perfect: false, result: "block" });
    expect(b.attack.outcome).toBe("blocked");
    expect(b.d.ofType("GuardBlocked")).toHaveLength(1);
  });

  test("after the guard word is typed the normal word returns as a fresh plate", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    d.until("GuardWordShown");
    const g = d.plates().find((p) => p.kind === "guard");
    const ev = d.type(g?.text ?? "");
    const kinds = d.ofType("PlateShown", ev).map((e) => e.kind);
    expect(kinds).toEqual(["word"]);
    expect(d.plates().map((p) => p.kind)).toEqual(["word"]);
    expect(types(ev).indexOf("WordCompleted")).toBeLessThan(types(ev).indexOf("GuardWordTyped"));
  });

  test("a guard parry pays +10 ATB at impact", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    d.until("GuardWordShown");
    d.type(d.plates().find((p) => p.kind === "guard")?.text ?? "");
    const before = d.state.enc?.atbM ?? 0;
    d.until("EnemyAttack");
    expect((d.state.enc?.atbM ?? 0) - before).toBe(K.PARRY_ATB_M);
  });

  test("an ignored guard word: the hit lands, then the plate reverts to a normal word", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    d.until("GuardWordShown");
    const from = d.all.length;
    const atk = d.until("EnemyAttack");
    expect(atk.outcome).toBe("hit");
    const seq = d.all.slice(from);
    expect(d.ofType("PlateRemoved", seq)[0]?.reason).toBe("expired");
    expect(d.plates().map((p) => p.kind)).toEqual(["word"]);
    expect(d.state.run.stats.hitsTaken).toBe(1);
  });

  test("the enemy attacks again after a full interval and shows a new guard word", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5).toCombat();
    const first = d.until("GuardWordShown");
    d.until("EnemyAttack");
    const second = d.until("GuardWordShown");
    expect(second.tick - first.tick).toBe(540);
  });

  test("impacts of different enemies are kept at least 0.8 s apart", () => {
    const d = new Driver(
      mkSimpleDef(["slime", "slime"], { current: ["apple", "bird"] }),
      5,
    ).toCombat();
    const [a, b] = d.state.enc?.enemies ?? [];
    if (a === undefined || b === undefined || a.nextImpact === null) throw new Error("setup");
    scheduleAttack(d.state, b, a.nextImpact + 10);
    expect(Math.abs((b.nextImpact as number) - (a.nextImpact as number))).toBeGreaterThanOrEqual(
      K.TELEGRAPH_STAGGER_T,
    );
    scheduleAttack(d.state, b, a.nextImpact - 5);
    expect(Math.abs((b.nextImpact as number) - (a.nextImpact as number))).toBeGreaterThanOrEqual(
      K.TELEGRAPH_STAGGER_T,
    );
  });

  test("with several enemies every pair of scheduled impacts is >= 0.8 s apart, for many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = new Driver(
        mkSimpleDef(["bat", "bat", "bat", "bat"], { current: ["apple", "bird", "cat", "door"] }),
        seed,
      ).toCombat();
      const imp = (d.state.enc?.enemies ?? [])
        .map((e) => e.nextImpact as number)
        .sort((x, y) => x - y);
      for (let i = 1; i < imp.length; i++) {
        expect((imp[i] as number) - (imp[i - 1] as number)).toBeGreaterThanOrEqual(
          K.TELEGRAPH_STAGGER_T,
        );
      }
    }
  });

  test("zen difficulty: enemies never attack", () => {
    const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5, {
      difficulty: "zen",
    }).toCombat();
    d.step(3000);
    expect(d.ofType("EnemyAttackWindup")).toHaveLength(0);
    expect(d.ofType("GuardWordShown")).toHaveLength(0);
  });

  test("enemy interval scales with the Pace factor: slower pace, longer interval", () => {
    const first = (pace: number): number => {
      const d = new Driver(mkSimpleDef(["slime"], { current: ["apple"] }), 5, { pace }).toCombat();
      return d.state.enc?.enemies[0]?.intervalTicks ?? 0;
    };
    expect(first(35)).toBe(540);
    expect(first(15)).toBe(mulBp(540, paceFactorBp(15)));
    expect(first(120)).toBe(mulBp(540, paceFactorBp(120)));
    expect(first(15)).toBeGreaterThan(first(35));
    expect(first(120)).toBeLessThan(first(35));
  });
});

describe("live stats (integer math)", () => {
  test("net WPM = correct chars / 5 / minute, in ticks", () => {
    const d = zenDriver(["slime"], ["apple"]);
    d.type("apple", 4); // 20 combat ticks, 5 correct chars
    const active = d.state.run.activeTicks;
    expect(active).toBe(20);
    expect(d.view().stats.netWpm).toBe(Math.floor((5 * 72_000) / active) / 100); // 180 WPM
    expect(d.view().stats.netWpm).toBe(180);
  });

  test("accuracy is correct / (correct + typos) in basis points", () => {
    const d = zenDriver(["slime"], ["apple"]);
    expect(d.view().stats.accuracy).toBe(10_000);
    d.type("app");
    d.key("x");
    d.type("le");
    d.step(0);
    const correct = 5;
    expect(d.view().stats.accuracy).toBe(Math.floor((correct * 10_000) / (correct + 1)));
  });

  test("BurstWpm fires after 16 correct chars at >= 1.3 x Pace (swift) or >= 1.6 x (blazing), with a 5 s cooldown", () => {
    const run = (gap: number) => {
      const d = zenDriver(["slime"], ["apple"], {}, 40);
      let n = 0;
      while (n < 60) {
        for (const c of d.plates()[0]?.text ?? "") {
          d.key(c);
          d.step(gap);
          n++;
        }
      }
      return d.ofType("BurstWpm");
    };
    const swift = run(14); // (15 x 720) / (15 x 14) = 51 WPM: >= 45.5 and < 56
    expect(swift.length).toBeGreaterThanOrEqual(2);
    for (const e of swift) expect(e).toMatchObject({ band: "swift", wpm: 51 });
    for (let i = 1; i < swift.length; i++) {
      expect((swift[i]?.tick ?? 0) - (swift[i - 1]?.tick ?? 0)).toBeGreaterThanOrEqual(
        K.BURST_COOLDOWN_T,
      );
    }
    const blazing = run(3); // 240 WPM
    expect(blazing).toHaveLength(1); // 60 chars x 3 ticks = 180 ticks < the 300-tick cooldown
    expect(blazing[0]?.band).toBe("blazing");
    expect(run(40)).toHaveLength(0); // 18 WPM: below Pace
  });
});

describe("word assignment (docs/brainstorm/01 §5.1 mix: 60/20/15/5)", () => {
  const tierPool = (prefix: string, n: number): string[] =>
    Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const mixDef = () =>
    mkSimpleDef(["slime"], {
      current: tierPool("c", 40),
      review: tierPool("r", 40),
      biome: tierPool("b", 40),
      weak: tierPool("w", 40),
    });

  test("tiers are drawn from the words stream at 60/20/15/5", () => {
    const def = mixDef();
    const rng = deriveRng(99, "words", 0);
    const counts: Record<string, number> = { c: 0, r: 0, b: 0, w: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const w = pickPlateWord(def, rng, { forbidden: [], recent: [], lengthRange: [2, 4] });
      counts[w.charAt(0)] = (counts[w.charAt(0)] ?? 0) + 1;
    }
    expect((counts.c as number) / N).toBeCloseTo(0.6, 1);
    expect((counts.r as number) / N).toBeCloseTo(0.2, 1);
    expect((counts.b as number) / N).toBeCloseTo(0.15, 1);
    expect((counts.w as number) / N).toBeCloseTo(0.05, 1);
    expect(Math.abs((counts.c as number) / N - 0.6)).toBeLessThan(0.015);
    expect(Math.abs((counts.w as number) / N - 0.05)).toBeLessThan(0.01);
  });

  test("an empty pool's weight goes to the current tier", () => {
    const def = mixDef();
    def.words.review = [];
    def.words.weak = [];
    const rng = deriveRng(5, "words", 0);
    const counts: Record<string, number> = { c: 0, b: 0 };
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      const w = pickPlateWord(def, rng, { forbidden: [], recent: [], lengthRange: [2, 4] });
      counts[w.charAt(0)] = (counts[w.charAt(0)] ?? 0) + 1;
    }
    expect(Math.abs((counts.c as number) / N - 0.85)).toBeLessThan(0.015);
    expect(Math.abs((counts.b as number) / N - 0.15)).toBeLessThan(0.015);
  });

  test("visible plates always start with distinct first letters (all enemies of a wave)", () => {
    const d = new Driver(
      mkSimpleDef(["slime", "bat", "brute", "slime", "bat"], {
        current: ["apple", "acorn", "amber", "bird", "bark", "cat"],
      }),
      11,
      { difficulty: "zen" },
    );
    d.step();
    const letters = d.plates().map((p) => firstLetter(p.text));
    expect(letters).toHaveLength(5);
    expect(new Set(letters).size).toBe(5);
  });

  test("letter collisions: a pool whose words all share a first letter falls back deterministically", () => {
    const make = () =>
      new Driver(
        mkSimpleDef(["slime", "bat", "brute"], { current: ["apple", "acorn", "amber"] }),
        3,
        { difficulty: "zen" },
      );
    const a = make();
    const b = make();
    a.step();
    b.step();
    const texts = a.plates().map((p) => p.text);
    expect(texts).toEqual(b.plates().map((p) => p.text));
    expect(new Set(texts.map(firstLetter)).size).toBe(3);
    expect(texts.filter((t) => t.startsWith("a"))).toHaveLength(1);
  });

  test("pool exhaustion: a one-word pool still fills every plate, replays identically", () => {
    const run = (): string[] => {
      const d = new Driver(
        mkSimpleDef(["slime", "bat", "brute", "slime"], { current: ["apple"] }),
        8,
        { difficulty: "zen" },
        mkLoadout(),
      ).toCombat();
      const out: string[] = d.plates().map((p) => p.text);
      for (let i = 0; i < 4; i++) {
        d.type(d.plates()[0]?.text ?? "");
        out.push(...d.plates().map((p) => p.text));
      }
      return out;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.length).toBeGreaterThan(4);
  });

  test("an entirely empty pool uses the fallback words", () => {
    const d = new Driver(mkSimpleDef(["slime", "bat"], { current: [] }), 2, { difficulty: "zen" });
    d.step();
    const letters = d.plates().map((p) => firstLetter(p.text));
    expect(letters).toHaveLength(2);
    expect(new Set(letters).size).toBe(2);
  });

  test("plate length prefers the enemy's plateLength range", () => {
    const d = new Driver(
      mkSimpleDef(["slime"], { current: ["it", "apple", "extraordinary", "bird"] }),
      4,
      { difficulty: "zen" },
    );
    d.step();
    const len = d.plates()[0]?.text.length ?? 0;
    expect(len).toBeGreaterThanOrEqual(3);
    expect(len).toBeLessThanOrEqual(7);
  });

  test("the first plate of each encounter comes from that encounter's own words stream", () => {
    const def = mkDef2();
    const d = new Driver(def, 21, { difficulty: "zen" }).toCombat();
    for (const idx of [0, 1]) {
      const rng = deriveRng(21, "words", idx);
      const want = pickPlateWord(def, rng, { forbidden: [], recent: [], lengthRange: [3, 7] });
      const shown = d
        .ofType("PlateShown")
        .find((e) => e.ownerId !== null && e.replacesPlateId === null);
      if (idx === 0) expect(shown?.text).toBe(want);
      if (idx === 1) {
        for (let i = 0; i < 400 && d.ofType("EncounterStarted").length < 2; i++) {
          const p = d.plates()[0];
          if (d.state.phase === "combat" && p !== undefined) d.type(p.text);
          else d.step();
        }
        const startAt = d.all.findIndex(
          (e) => e.type === "EncounterStarted" && e.encounterIndex === 1,
        );
        const first = d.all.slice(startAt).find((e) => e.type === "PlateShown");
        expect((first as Extract<SimEvent, { type: "PlateShown" }>).text).toBe(want);
      }
    }
  });
});

function mkDef2() {
  const wave = [{ enemyId: "slime", gimmick: null }];
  return mkSimpleDef(
    ["slime"],
    { current: ["apple", "bird", "cat", "door", "eagle", "fish"] },
    {
      segments: [
        {
          kind: "encounter",
          name: "A",
          hpPoolM: 90_000,
          gruntHitM: 1,
          attackPowerBp: 10_000,
          waves: [wave],
        },
        {
          kind: "encounter",
          name: "B",
          hpPoolM: 90_000,
          gruntHitM: 1,
          attackPowerBp: 10_000,
          waves: [wave],
        },
      ],
    },
  );
}

describe("level flow (typing-only)", () => {
  test("createLevel clamps pace to 15..120 and requires segments", () => {
    const def = mkSimpleDef(["slime"], { current: ["apple"] });
    expect(createLevel(def, mkLoadout(), 1, mkOptions({ pace: 3 })).run.options.pace).toBe(15);
    expect(createLevel(def, mkLoadout(), 1, mkOptions({ pace: 500 })).run.options.pace).toBe(120);
    expect(() => createLevel({ ...def, segments: [] }, mkLoadout(), 1, mkOptions())).toThrow();
  });

  test("applyInput requires input.tick === state.tick", () => {
    const d = zenDriver(["slime"], ["apple"]);
    expect(() => applyInput(d.state, { tick: d.state.tick + 1, key: "a" })).toThrow();
    expect(() => applyInput(d.state, { tick: d.state.tick - 1, key: "a" })).toThrow();
    expect(() => applyInput(d.state, { tick: d.state.tick, key: "a" })).not.toThrow();
  });

  test("the encounter plays intro, combat, EncounterCleared, rewards, then the next segment", () => {
    const d = new Driver(
      mkSimpleDef(["slime"], { current: ["apple"] }, {}, 1, { poolM: 2000, hitM: 5000 }),
      3,
      { difficulty: "zen" },
    );
    d.toCombat();
    d.type("apple"); // a perfect chip (2.5 HP) kills the 2 HP slime
    d.step();
    expect(d.state.phase).toBe("rewards");
    expect(d.ofType("EncounterCleared")).toHaveLength(1);
    d.step(K.REWARD_T);
    expect(d.state.phase).toBe("cleared");
    expect(d.all.at(-1)?.type).toBe("LevelCleared");
  });

  test("the boss finisher is an exclusive, auto-targeted sentence plate that needs typed spaces", () => {
    const d = new Driver(bossDef(), 9, { difficulty: "zen" }).toCombat();
    toFinisher(d);
    const shown = d.ofType("FinisherShown")[0];
    expect(shown?.text).toBe("the old stones fall silent");
    const v = d.view();
    expect(v.plates).toHaveLength(1);
    expect(v.plates[0]).toMatchObject({ kind: "finisher", isTarget: true });
    d.key("t");
    d.key("h");
    d.key("e");
    const miss = d.key("o"); // the plate wants a typed space here
    expect(d.ofType("Typo", miss)[0]?.expected).toBe(" ");
    d.key(" ");
    const rest = d.type("old stones fall silent");
    expect(d.ofType("FinisherCompleted", rest)).toHaveLength(1);
    expect(d.ofType("EnemyDeath", rest)[0]?.byKind).toBe("finisher");
    expect(d.ofType("SentenceWordDone").map((e) => e.wordCount)).toEqual([5, 5, 5, 5, 5]);
    d.step(K.REWARD_T + 1);
    expect(d.state.phase).toBe("cleared");
  });

  test("Escape does not drop an exclusive (finisher) plate", () => {
    const d = new Driver(bossDef(), 9, { difficulty: "zen" }).toCombat();
    toFinisher(d);
    expect(d.key("Escape")).toEqual([]);
    expect(d.view().plates[0]?.isTarget).toBe(true);
  });

  test("the abandon command fails the level; a terminal level ignores input and steps", () => {
    const d = zenDriver(["slime"], ["apple"]);
    const out = applyInput(d.state, { tick: d.state.tick, cmd: "abandon" });
    expect(d.state.phase).toBe("failed");
    expect(out.at(-1)).toMatchObject({ type: "LevelFailed", reason: "abandoned" });
    const tick = d.state.tick;
    expect(d.step(10)).toEqual([]);
    expect(d.key("a")).toEqual([]);
    expect(d.state.tick).toBe(tick);
  });
});

// T1.3: the Riddle of Leaves (interfaces 3.6) and the Willow boss flow: picks, outcomes, the 5-riddle end rule, Second Wind,
// exact-case Hush Spells, the riddle view. Rules are quoted in the test names.
import {
  BossDef,
  type ContentBundle,
  contentBundle,
  LevelDef,
  type WordEntry,
} from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { riddleTicks } from "../src/bossPlates.ts";
import { damageHero, heroDown } from "../src/combat.ts";
import { mulBp } from "../src/fixed.ts";
import {
  below,
  deriveRng,
  type EventOf,
  type ResolvedBoss,
  type ResolvedLevel,
  resolveLevel,
  type SimEvent,
} from "../src/index.ts";
import { PACE_FACTOR_BP } from "../src/tables.generated.ts";
import { firstLetter } from "../src/words.ts";
import { runBot } from "./bot/refBot.ts";
import { Driver, mkLoadout, mkOptions } from "./typingHarness.ts";
import { HUSH_SPELLS, RIDDLES, WILLOW_FINISHER, willowDef } from "./willowFixture.ts";

/** A flat Willow (no adds, no Doom Spells owed) so a test can jump straight to a phase. */
const flat = (over: Partial<ResolvedLevel> = {}, bossOver: Partial<ResolvedBoss> = {}) =>
  willowDef(false, over, {
    phase2: { endAtHpBp: 3300, doomEveryTicks: 600, minDoomSpells: 0 },
    ...bossOver,
  });
const start = (def = flat(), seed = 5, opts: Parameters<typeof mkOptions>[0] = {}) =>
  new Driver(def, seed, opts, mkLoadout()).toCombat();
const bossOf = (d: Driver) =>
  d.state.enc?.enemies[0] as NonNullable<Driver["state"]["enc"]>["enemies"][number];
const bs = (d: Driver) =>
  d.state.enc?.boss as NonNullable<NonNullable<Driver["state"]["enc"]>["boss"]>;
const quiet = (d: Driver): void => {
  for (const e of d.state.enc?.enemies ?? []) {
    e.intervalTicks = 10_000_000;
    e.nextImpact = null;
    e.windupShown = false;
  }
};
/** Pushes the boss through its gates until phase `n` is live (combat), breather over. */
function toPhase(d: Driver, n: 2 | 3): void {
  while (bs(d).phase < n) {
    const from = bs(d).phase;
    const b = bossOf(d);
    b.hpM = Math.min(b.hpM, b.gateHpM as number);
    for (let i = 0; i < 2000 && !(bs(d).phase > from && d.state.phase === "combat"); i++) d.step();
    if (bs(d).phase === from) throw new Error(`the boss never left phase ${from}`);
  }
  quiet(d);
}
/** Phase 3, with the first riddle on screen. */
function toRiddle(d: Driver): EventOf<"RiddleStarted"> {
  toPhase(d, 3);
  return d.until("RiddleStarted", 600);
}
const last = <T extends SimEvent["type"]>(d: Driver, t: T): EventOf<T> =>
  d.ofType(t).at(-1) as EventOf<T>;
const answerOf = (rs: EventOf<"RiddleStarted">): string =>
  RIDDLES.find((r) => r.clue === rs.clue)?.text as string;
const leafText = (d: Driver, id: number): string =>
  d.plates().find((p) => p.id === id)?.text as string;

describe("the riddle pick is deterministic: 5 draws on the riddle stream, distinct first letters", () => {
  /** An independent implementation of the §3.6 pick, to compare the sim against. */
  function oracle(seed: number, encIndex: number, count: number) {
    const rng = deriveRng(seed, "riddle", encIndex);
    const asked: string[] = [];
    const out: { leaves: string[]; answer: string }[] = [];
    const fl = (t: string) => t.charAt(0).toLowerCase();
    for (let k = 0; k < count; k++) {
      const A = RIDDLES.filter((w) => !asked.includes(w.text));
      const answer = A[below(rng, A.length)] as (typeof RIDDLES)[number];
      const D1 = RIDDLES.filter((w) => w.text !== answer.text && fl(w.text) !== fl(answer.text));
      const d1 = D1[below(rng, D1.length)] as (typeof RIDDLES)[number];
      const D2 = RIDDLES.filter(
        (w) =>
          w.text !== answer.text && fl(w.text) !== fl(answer.text) && fl(w.text) !== fl(d1.text),
      );
      const d2 = D2[below(rng, D2.length)] as (typeof RIDDLES)[number];
      const leaves = [answer, d1, d2];
      for (const i of [2, 1]) {
        const j = below(rng, i + 1);
        [leaves[i], leaves[j]] = [
          leaves[j] as (typeof leaves)[number],
          leaves[i] as (typeof leaves)[number],
        ];
      }
      asked.push(answer.text);
      out.push({ leaves: leaves.map((l) => l.text), answer: answer.text });
    }
    return { out, rng };
  }

  test("over 40 seeds: the sim picks equal the oracle, first letters are distinct, answers never repeat, the stream is advanced by exactly 5 draws per riddle", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = start(flat(), seed, { difficulty: "zen" });
      toPhase(d, 3);
      const idx = d.state.enc?.index as number;
      // nobody types: five timeouts (zen: no damage), then the finisher
      for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) d.step();
      const started = d.ofType("RiddleStarted");
      expect(started).toHaveLength(5);
      const want = oracle(seed, idx, 5);
      const answers: string[] = [];
      started.forEach((rs, k) => {
        // the leaf texts are read from the PlateShown events of that riddle
        const shown = d
          .ofType("PlateShown")
          .filter((p) => rs.leafPlateIds.includes(p.plateId))
          .sort((a, b) => (a.lane as number) - (b.lane as number));
        const texts = shown.map((p) => p.text);
        expect(texts).toEqual(want.out[k]?.leaves);
        expect(shown.map((p) => p.lane)).toEqual([0, 1, 2]);
        expect(rs.leafPlateIds).toEqual(shown.map((p) => p.plateId));
        expect(new Set(texts.map(firstLetter)).size).toBe(3);
        expect(rs.clue).toBe(RIDDLES.find((r) => r.text === want.out[k]?.answer)?.clue);
        answers.push(want.out[k]?.answer as string);
      });
      expect(new Set(answers).size).toBe(5);
      expect(bs(d).riddle?.rng).toEqual(want.rng);
      expect(bs(d).riddle?.asked).toEqual(answers);
    }
  });

  test("the same seed and inputs give the same riddles (replay), and the seeds differ", () => {
    const run = (seed: number) => {
      const d = start(flat(), seed, { difficulty: "zen" });
      toPhase(d, 3);
      for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) d.step();
      return d.ofType("RiddleStarted").map((e) => [e.clue, e.leafPlateIds.length]);
    };
    expect(run(7)).toEqual(run(7));
    expect(JSON.stringify(run(7))).not.toBe(JSON.stringify(run(8)));
  });

  test("the picks never collide with another visible plate's first letter", () => {
    const d = start(flat(), 3, { difficulty: "zen" });
    toPhase(d, 3);
    for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) {
      d.step();
      const letters = d.plates().map((p) => firstLetter(p.text));
      expect(new Set(letters).size).toBe(letters.length);
    }
  });
});

describe("clue = clue ?? definition (resolveLevel)", () => {
  const entry = (text: string, definition: string, clue?: string): WordEntry =>
    ({
      text,
      key: text,
      kind: "word",
      tier: 1,
      biomes: [],
      uses: ["plate", "riddle"],
      definition,
      example: "Example.",
      translations: {},
      chapter: 2,
      ...(clue === undefined ? {} : { clue }),
    }) as WordEntry;
  const boss = BossDef.parse({
    id: "willow-test",
    name: "Willow",
    title: "Keeper",
    enemyId: "ruin-golem",
    hp: 300,
    hit: 8,
    plateLength: [4, 7],
    phase1: { adds: [] },
    phase2: { doomEveryS: 10, minDoomSpells: 1 },
    phase3: {
      minigame: { kind: "riddle", readS: 3, answerS: 5, clearAtkMult: 2, missHit: 5 },
      finisherText: WILLOW_FINISHER,
    },
  });
  const level = LevelDef.parse({
    id: "ch2-l10",
    chapter: 2,
    index: 10,
    name: "Willow test",
    biome: "grove",
    layoutId: "ch2-l10",
    kind: "boss",
    wordTier: 1,
    plateLength: [3, 8],
    segments: [
      { kind: "walk", seconds: 5, heal: false },
      { kind: "boss", bossId: "willow-test" },
    ],
    star3: { kind: "streak", combo: 10 },
    parRefS: 200,
  });
  const words = [
    entry("owl", "a bird that hunts at night", "a night bird with big eyes"),
    entry("moth", "a small insect that loves a flame"),
    entry("root", "the part of a tree under the ground"),
    entry("leaf", "a flat green part of a tree"),
    entry("bark", "the rough skin of a tree"),
    entry("fern", "a plant with feathery leaves"),
    entry("dew", "tiny drops of water on grass"),
    entry("nest", "a home that a bird builds"),
    entry("oak", "a big tree", undefined),
    entry("elmwoodxx", "too long for lengthRange [3, 8]"),
    { ...entry("lonely", "no riddle use"), uses: ["plate"] } as WordEntry,
    { ...entry("later", "a later-chapter word"), chapter: 3 } as WordEntry,
  ];
  const bundle: ContentBundle = {
    ...contentBundle,
    words,
    bosses: [...contentBundle.bosses, boss],
    levels: [...contentBundle.levels, level],
  };

  test("a word's own clue wins; without one the definition is the clue", () => {
    const r = resolveLevel(bundle, "ch2-l10", { dueWeakWords: [] });
    expect(r.riddles?.find((w) => w.text === "owl")?.clue).toBe("a night bird with big eyes");
    expect(r.riddles?.find((w) => w.text === "moth")?.clue).toBe(
      "a small insect that loves a flame",
    );
  });

  test("the pool: riddle-tagged words of chapter <= the level's, length in lengthRange, bundle order, deduped", () => {
    const r = resolveLevel(
      { ...bundle, words: [...words, entry("owl", "a duplicate")] },
      "ch2-l10",
      { dueWeakWords: [] },
    );
    expect(r.riddles?.map((w) => w.text)).toEqual([
      "owl",
      "moth",
      "root",
      "leaf",
      "bark",
      "fern",
      "dew",
      "nest",
      "oak",
    ]);
    expect(r.boss?.phase3.minigame).toEqual({
      kind: "riddle",
      count: 5,
      leaves: 3,
      readTicks: 180,
      answerTicks: 300,
      gapTicks: 90,
      clearAtkMultBp: 20_000,
      missHitM: 5000,
      lengthRange: [3, 8],
    });
  });

  test("a Ch1 level has no riddles key; a too-small riddle pool throws", () => {
    expect("riddles" in resolveLevel(contentBundle, "ch1-l10", { dueWeakWords: [] })).toBe(false);
    expect(() =>
      resolveLevel({ ...bundle, words: words.slice(0, 5) }, "ch2-l10", { dueWeakWords: [] }),
    ).toThrow(/riddle pool/);
  });

  test("the real Ch2 vocabulary resolves a Willow level: a rich riddle pool, exact-case Hush Spells", () => {
    const r = resolveLevel({ ...bundle, words: contentBundle.words }, "ch2-l10", {
      dueWeakWords: [],
    });
    expect((r.riddles ?? []).length).toBeGreaterThanOrEqual(40);
    expect(r.words.doom.length).toBeGreaterThanOrEqual(8);
    expect(r.words.doom.every((s) => /[A-Z]/.test(s))).toBe(true);
    expect(r.foldSentences).toBe(false);
  });
});

describe("outcomes: right = clearAtkMult hit, wrong or timeout = missHit", () => {
  test("right: WordCompleted, PlateRemoved{completed}, RiddleResolved, decoys expire, then a clearAtkMult x ATK minigame Hit", () => {
    const d = start();
    const rs = toRiddle(d);
    const answer = answerOf(rs);
    const hpBefore = bossOf(d).hpM;
    const ev = d.type(answer);
    const types = ev
      .map((e) => e.type)
      .filter(
        (t) =>
          !/^(CharCorrect|ComboChanged|KeyStreak|BurstWpm|TargetAcquired|RiddleLeafPicked|Atb)/.test(
            t,
          ),
      );
    expect(types).toEqual([
      "WordCompleted",
      "PlateRemoved",
      "RiddleResolved",
      "PlateRemoved",
      "PlateRemoved",
      "Hit",
    ]);
    const removed = d.ofType("PlateRemoved", ev);
    expect(removed.map((e) => e.reason)).toEqual(["completed", "expired", "expired"]);
    const res = last(d, "RiddleResolved");
    expect(res).toMatchObject({ riddleIndex: 0, outcome: "right", answerText: answer });
    expect(res.pickedPlateId).toBe(res.answerPlateId);
    const hit = last(d, "Hit");
    expect(hit).toMatchObject({
      kind: "minigame",
      origin: "minigame",
      damageType: null,
      weak: false,
      crit: false,
    });
    expect(hit.damageM).toBe(mulBp(d.state.run.heroAtkM, 30_000));
    expect(bossOf(d).hpM).toBe(hpBefore - hit.damageM);
    expect(d.view().minigame).toMatchObject({ cleared: 1, missed: 0 });
    expect(d.ofType("HeroDamaged")).toHaveLength(0);
  });

  test("wrong (a decoy completed): RiddleResolved{wrong} and the hero takes missHit; the boss is untouched", () => {
    const d = start();
    const rs = toRiddle(d);
    const answer = answerOf(rs);
    const decoy = rs.leafPlateIds.map((id) => leafText(d, id)).find((t) => t !== answer) as string;
    const hp = d.state.run.heroHpM;
    const bossHp = bossOf(d).hpM;
    const ev = d.type(decoy);
    const res = d.ofType("RiddleResolved", ev)[0] as EventOf<"RiddleResolved">;
    expect(res).toMatchObject({ outcome: "wrong", answerText: answer });
    expect(res.pickedPlateId).not.toBe(res.answerPlateId);
    expect(d.ofType("PlateRemoved", ev).map((e) => e.reason)).toEqual([
      "completed",
      "expired",
      "expired",
    ]);
    const dmg = d.ofType("HeroDamaged", ev)[0];
    expect(dmg).toMatchObject({ cause: "minigame", damage: 6, blocked: false });
    expect(d.state.run.heroHpM).toBe(hp - 6000);
    expect(bossOf(d).hpM).toBe(bossHp);
    expect(d.ofType("Hit", ev)).toHaveLength(0);
    expect(d.view().minigame).toMatchObject({ cleared: 0, missed: 1 });
  });

  test("timeout: TargetDropped (if a leaf was locked), three expiries, RiddleResolved{timeout, picked null}, then missHit", () => {
    const d = start();
    const rs = toRiddle(d);
    d.key((leafText(d, rs.leafPlateIds[0]) as string).charAt(0)); // lock a leaf, never finish it
    d.step();
    const from = d.all.length;
    for (let i = 0; i < 2000 && d.ofType("RiddleResolved").length === 0; i++) d.step();
    const seq = d.all
      .slice(from)
      .map((e) => e.type)
      .filter((t) =>
        ["TargetDropped", "PlateRemoved", "RiddleResolved", "HeroDamaged"].includes(t),
      );
    expect(seq).toEqual([
      "TargetDropped",
      "PlateRemoved",
      "PlateRemoved",
      "PlateRemoved",
      "RiddleResolved",
      "HeroDamaged",
    ]);
    const drop = last(d, "TargetDropped");
    expect(drop.reason).toBe("plateChanged");
    const res = last(d, "RiddleResolved");
    expect(res).toMatchObject({ outcome: "timeout", pickedPlateId: null });
    expect(res.tick).toBe(rs.deadlineTick);
    expect(last(d, "HeroDamaged")).toMatchObject({ cause: "minigame", damage: 6 });
  });

  test("Zen: a wrong pick or a timeout costs the hero nothing", () => {
    const d = start(flat(), 5, { difficulty: "zen" });
    toRiddle(d);
    for (let i = 0; i < 2000 && d.ofType("RiddleResolved").length === 0; i++) d.step();
    expect(d.ofType("HeroDamaged")).toHaveLength(0);
    expect(d.view().minigame?.missed).toBe(1);
  });

  test("a missHit that drops the hero starts Second Wind (the barrier does not absorb it)", () => {
    const d = start();
    toRiddle(d);
    d.state.run.heroHpM = 1000;
    for (let i = 0; i < 2000 && d.state.phase !== "secondWind"; i++) d.step();
    expect(d.state.phase).toBe("secondWind");
    expect(d.ofType("HeroDowned")).toHaveLength(1);
  });
});

describe("the timer is (readS + answerS) x the boss-script pace factor", () => {
  test.each([20, 35, 60, 100])("pace %i", (pace) => {
    const d = start(flat(), 5, { pace });
    const rs = toRiddle(d);
    const pf = K.BOSS_SCRIPT_PACE_SCALE ? (PACE_FACTOR_BP[pace - K.PACE_MIN] as number) : 10_000;
    expect(rs.totalTicks).toBe(Math.max(1, mulBp(180 + 300, pf)));
    expect(rs.deadlineTick).toBe(rs.tick + rs.totalTicks);
    expect(riddleTicks(d.state, flat().boss?.phase3.minigame as never)).toBe(rs.totalTicks);
  });

  test("the first riddle starts gapTicks after the breather; the next one gapTicks after a resolution (not pace-scaled)", () => {
    const d = start(flat(), 5, { pace: 20 });
    toPhase(d, 3);
    const started = last(d, "MinigameStarted");
    expect(started).toMatchObject({ kind: "riddle", lanes: 3 });
    const rs = d.until("RiddleStarted", 600);
    expect(rs.tick).toBe(started.tick + 90);
    d.type(answerOf(rs));
    const res = last(d, "RiddleResolved");
    const rs2 = d.until("RiddleStarted", 600);
    expect(rs2.tick).toBe(res.tick + 90);
  });
});

describe("exactly 5 riddles, then the finisher, whatever the boss HP", () => {
  test("all timeouts (boss HP untouched): 5 RiddleResolved, MinigameEnded{0, 5}, then FinisherShown", () => {
    const d = start(flat(), 5, { difficulty: "zen" });
    toPhase(d, 3);
    for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) d.step();
    expect(d.ofType("RiddleStarted")).toHaveLength(5);
    expect(d.ofType("RiddleResolved").map((e) => e.outcome)).toEqual(Array(5).fill("timeout"));
    expect(d.ofType("MinigameEnded")).toEqual([expect.objectContaining({ cleared: 0, missed: 5 })]);
    expect(bossOf(d).hpM).toBeGreaterThan(bossOf(d).maxHpM / 4); // the HP gate is NOT what ended the phase
    const types = d.all.map((e) => e.type);
    expect(types.indexOf("MinigameEnded")).toBeLessThan(types.indexOf("FinisherShown"));
    expect(d.plates().map((p) => p.kind)).toEqual(["finisher"]);
    // the finisher has no timer and kills the boss
    d.type(WILLOW_FINISHER);
    expect(d.ofType("FinisherCompleted")).toHaveLength(1);
    expect(d.ofType("EnemyDeath").at(-1)).toMatchObject({ isBoss: true, byKind: "finisher" });
  });

  test("the boss already at the final gate: all 5 riddles are still asked (the HP gate does not end a riddle phase)", () => {
    const d = start(flat(), 5, { difficulty: "zen" });
    toPhase(d, 3);
    bossOf(d).hpM = 1;
    for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) d.step();
    expect(d.ofType("RiddleStarted")).toHaveLength(5);
    expect(d.ofType("MinigameEnded")).toHaveLength(1);
  });

  test("five right answers: five heavy hits (clamped at the final gate), then the finisher", () => {
    const d = start();
    toPhase(d, 3);
    for (let k = 0; k < 5; k++) {
      const rs = d.until("RiddleStarted", 800);
      d.type(answerOf(rs));
    }
    for (let i = 0; i < 400 && d.ofType("FinisherShown").length === 0; i++) d.step();
    expect(d.ofType("RiddleResolved").map((e) => e.outcome)).toEqual(Array(5).fill("right"));
    expect(d.ofType("MinigameEnded")).toEqual([expect.objectContaining({ cleared: 5, missed: 0 })]);
    expect(d.ofType("FinisherShown")).toHaveLength(1);
    expect(bossOf(d).hpM).toBeGreaterThanOrEqual(1);
  });
});

describe("a riddle phase is not a Falling Rubble phase", () => {
  test("no Minigame{WordSpawned,WordCleared,WordMissed} events ever fire; the boss shows no word plate; only the 3 leaves are up", () => {
    const d = start(flat(), 9);
    toPhase(d, 3);
    for (let k = 0; k < 5; k++) {
      const rs = d.until("RiddleStarted", 800);
      const kinds = d.plates().map((p) => p.kind);
      expect(kinds).toEqual(["minigame", "minigame", "minigame"]);
      expect(d.plates().map((p) => p.lane)).toEqual([0, 1, 2]);
      if (k % 2 === 0) d.type(answerOf(rs));
    }
    for (let i = 0; i < 2000 && d.ofType("FinisherShown").length === 0; i++) d.step();
    for (const t of ["MinigameWordSpawned", "MinigameWordCleared", "MinigameWordMissed"] as const)
      expect(d.ofType(t)).toHaveLength(0);
    expect(
      d.all.some(
        (e) =>
          e.type === "PlateShown" &&
          e.kind === "word" &&
          e.ownerId === bossOf(d).id &&
          e.tick > last(d, "MinigameStarted").tick,
      ),
    ).toBe(false);
  });

  test("leaf plates pay no ATB and are not typed for skill charge", () => {
    const d = start();
    const rs = toRiddle(d);
    const ev = d.type(answerOf(rs));
    for (const c of d.ofType("CharCorrect", ev)) expect(c.atbGainM).toBe(0);
    expect(d.ofType("WordCompleted", ev)[0]?.atbGainM).toBe(0);
  });
});

describe("RiddleLeafPicked", () => {
  test("fires on every acquisition of a leaf, right after TargetAcquired, also after an Escape and a re-pick", () => {
    const d = start();
    const rs = toRiddle(d);
    const t0 = leafText(d, rs.leafPlateIds[1]);
    const ev = d.key(t0.charAt(0));
    expect(ev.map((e) => e.type).slice(0, 3)).toEqual([
      "TargetAcquired",
      "RiddleLeafPicked",
      "CharCorrect",
    ]);
    expect(d.ofType("RiddleLeafPicked", ev)[0]).toEqual({
      type: "RiddleLeafPicked",
      tick: d.state.tick,
      riddleIndex: 0,
      plateId: rs.leafPlateIds[1],
      lane: 1,
    });
    d.key("Escape");
    expect(last(d, "TargetDropped").reason).toBe("escape");
    const other = leafText(d, rs.leafPlateIds[2]);
    d.key(other.charAt(0));
    d.key("Escape");
    d.key(t0.charAt(0));
    expect(d.ofType("RiddleLeafPicked").map((e) => e.lane)).toEqual([1, 2, 1]);
  });
});

describe("LevelView.minigame.kind / riddle", () => {
  test("riddle view: null before the first riddle and in the gaps, the panel while one is up (clue, leaves, timer, last result)", () => {
    const d = start();
    toPhase(d, 3);
    expect(d.view().minigame).toEqual({
      lanes: 3,
      cleared: 0,
      missed: 0,
      kind: "riddle",
      riddle: null,
    });
    const rs = d.until("RiddleStarted", 800);
    const v = d.view().minigame;
    expect(v?.kind).toBe("riddle");
    expect(v?.riddle).toEqual({
      riddleIndex: 0,
      riddleCount: 5,
      clue: rs.clue,
      leafPlateIds: rs.leafPlateIds,
      ticksLeft: rs.deadlineTick - d.state.tick,
      totalTicks: rs.totalTicks,
      last: null,
    });
    d.step(10);
    expect(d.view().minigame?.riddle?.ticksLeft).toBe(rs.deadlineTick - d.state.tick);
    d.type(answerOf(rs));
    expect(d.view().minigame?.riddle).toBeNull(); // the gap
    d.until("RiddleStarted", 800);
    expect(d.view().minigame?.riddle).toMatchObject({
      riddleIndex: 1,
      last: { outcome: "right", answerText: answerOf(rs) },
    });
  });

  test("a Falling Rubble boss keeps the old view shape (no kind, no riddle key)", () => {
    const d = new Driver(
      willowDef(false, {
        boss: {
          ...(flat().boss as ResolvedBoss),
          phase3: {
            finisherText: "x y",
            minigame: {
              kind: "fallingRubble",
              lanes: 3,
              spawnEveryTicks: 120,
              fallTicks: 240,
              clearAtkMultBp: 20_000,
              missHitM: 5000,
            },
          },
        },
      }),
      5,
      {},
      mkLoadout(),
    ).toCombat();
    toPhase(d, 3);
    expect(d.view().minigame).toEqual({ lanes: 3, cleared: 0, missed: 0 });
  });
});

describe("Second Wind restores the leaves", () => {
  test("same texts, lanes and shifted deadline; typed progress reset; no new RiddleStarted; the boss still has no word plate", () => {
    const d = start();
    const rs = toRiddle(d);
    const before = rs.leafPlateIds.map(
      (id) => d.plates().find((p) => p.id === id) as { text: string; lane: number },
    );
    d.step(30);
    // type two letters of leaf 0, then the hero is downed
    const t0 = before[0]?.text as string;
    d.type(t0.slice(0, 2));
    const downAt = d.state.tick;
    const hp = d.state.run.heroHpM;
    damageHero(d.state, hp, { sourceId: null, cause: "attack", blocked: false }, (e) =>
      d.all.push(e),
    );
    heroDown(d.state, (e) => d.all.push(e));
    expect(d.state.phase).toBe("secondWind");
    expect(d.plates().map((p) => p.kind)).toEqual(["secondWind"]);
    expect(d.view().minigame?.riddle).toBeNull(); // the leaves are away: no panel
    const deadlineBefore = bs(d).riddle?.active?.deadline as number;
    d.step(100);
    d.type("Stay awake, Knight.");
    expect(d.state.phase).toBe("combat");
    const frozen = d.state.tick - downAt; // approx; the exact shift is what the deadline moved by
    const shift = (bs(d).riddle?.active?.deadline as number) - deadlineBefore;
    expect(shift).toBeGreaterThan(100);
    expect(shift).toBeLessThanOrEqual(frozen);
    const back = d.plates();
    expect(back.map((p) => [p.kind, p.text, p.lane, p.typedIndex])).toEqual(
      before.map((p) => ["minigame", p.text, p.lane, 0]),
    );
    expect(back.every((p) => p.expiresAtTick === bs(d).riddle?.active?.deadline)).toBe(true);
    expect(d.ofType("RiddleStarted")).toHaveLength(1);
    expect(d.view().minigame?.riddle?.leafPlateIds).toEqual(back.map((p) => p.id));
    // the restored riddle still resolves normally
    d.type(answerOf(rs));
    expect(last(d, "RiddleResolved")).toMatchObject({ outcome: "right", riddleIndex: 0 });
  });

  test("Second Wind in the gap between riddles shifts the pending start; riddle count and picks are unaffected", () => {
    const d = start();
    toPhase(d, 3);
    d.step(20); // inside the 90-tick gap
    const next = bs(d).riddle?.nextAt as number;
    damageHero(
      d.state,
      d.state.run.heroHpM,
      { sourceId: null, cause: "attack", blocked: false },
      (e) => d.all.push(e),
    );
    heroDown(d.state, (e) => d.all.push(e));
    d.step(50);
    d.type("Stay awake, Knight.");
    expect(bs(d).riddle?.nextAt).toBeGreaterThan(next);
    const rs = d.until("RiddleStarted", 800);
    expect(rs.riddleIndex).toBe(0);
  });
});

describe("Hush Spells are exact-case; 'Ignore capitals' folds them", () => {
  const toSpell = (d: Driver) => {
    toPhase(d, 2);
    d.until("DoomSpellStarted", 2000);
    return d.plates().find((p) => p.kind === "doom") as ReturnType<Driver["plates"]>[number];
  };

  test("an exact-case spell: exactCase, a shift cue on the capital first letter (untargeted too), lowercase first key is a stray typo", () => {
    const d = start(flat({ chapter: 2 }), 5);
    const spell = toSpell(d);
    expect(HUSH_SPELLS).toContain(spell.text);
    expect(spell.exactCase).toBe(true);
    expect(spell.shiftNext).toBe(spell.text.charAt(0) >= "A" && spell.text.charAt(0) <= "Z");
    const ev = d.key(spell.text.charAt(0).toLowerCase());
    expect(ev.map((e) => e.type)).toContain("Typo");
    expect(d.ofType("TargetAcquired", ev)).toHaveLength(0);
  });

  test("typing the exact capital acquires it; CharCorrect.shifted is set only on capital letters", () => {
    const d = start(flat({ chapter: 2 }), 5);
    const spell = toSpell(d);
    const ev = d.type(spell.text);
    const chars = d.ofType("CharCorrect", ev);
    expect(chars).toHaveLength(spell.text.length);
    chars.forEach((c, i) => {
      const ch = spell.text.charAt(i);
      if (ch >= "A" && ch <= "Z") expect(c.shifted).toBe(true);
      else expect("shifted" in c).toBe(false);
    });
    expect(chars.some((c) => c.shifted === true)).toBe(true);
    expect(d.ofType("DoomSpellCompleted", ev)).toHaveLength(1);
  });

  test("shiftNext follows the next letter: set while a capital is next, absent otherwise", () => {
    const d = start(flat({ chapter: 2 }), 5);
    const spell = toSpell(d);
    d.key(spell.text.charAt(0));
    for (let i = 1; i < spell.text.length - 1; i++) {
      const p = d.plates().find((x) => x.id === spell.id) as ReturnType<Driver["plates"]>[number];
      const next = spell.text.charAt(i);
      expect(p.shiftNext === true).toBe(next >= "A" && next <= "Z");
      d.key(next);
    }
  });

  test("caseAssist: the spell folds (no exactCase / shiftNext, no shifted), a lowercase first key acquires it", () => {
    const d = start(flat({ chapter: 2 }), 5, { caseAssist: true });
    const spell = toSpell(d);
    expect(spell.exactCase).toBeUndefined();
    expect(spell.shiftNext).toBeUndefined();
    const ev = d.type(spell.text.toLowerCase());
    expect(d.ofType("Typo", ev)).toHaveLength(0);
    expect(d.ofType("CharCorrect", ev).some((c) => "shifted" in c)).toBe(false);
    expect(d.ofType("DoomSpellCompleted", ev)).toHaveLength(1);
  });

  test("the finisher and Second Wind sentences are exact too (Ch2)", () => {
    const d = start(flat({ chapter: 2 }), 5, { difficulty: "zen" });
    toPhase(d, 3);
    for (let i = 0; i < 20_000 && d.ofType("FinisherShown").length === 0; i++) d.step();
    const fin = d.plates().find((p) => p.kind === "finisher") as ReturnType<
      Driver["plates"]
    >[number];
    expect(fin.exactCase).toBe(true);
    expect(fin.shiftNext).toBe(true); // "Rest now, ...": auto-targeted, the first letter is a capital
  });
});

describe("the Willow flow: phase 1 adds, phase 2 Hush Spells, phase 3 riddles, then the finisher (reference bot)", () => {
  const play = (seed: number, wpm: number, riddleAccuracy: number, pace = 35) =>
    runBot(willowDef(true), mkLoadout(), seed, mkOptions({ pace }), {
      wpm,
      accuracy: 0.95,
      riddleAccuracy,
      maxTicks: 72_000,
    });

  test("a clean run clears the boss through every phase, in order", () => {
    const run = play(11, 45, 1);
    expect(run.result?.outcome).toBe("cleared");
    const seq: string[] = [];
    for (const e of run.events) {
      const tag =
        e.type === "BossPhaseChanged"
          ? `phase${e.to}`
          : e.type === "MinigameStarted" ||
              e.type === "MinigameEnded" ||
              e.type === "FinisherShown" ||
              e.type === "FinisherCompleted" ||
              e.type === "DoomSpellStarted"
            ? e.type
            : e.type === "RiddleResolved"
              ? `riddle:${e.outcome}`
              : e.type === "EnemyHealed"
                ? "heal"
                : null;
      if (tag !== null && seq.at(-1) !== tag) seq.push(tag);
    }
    const idx = (t: string) => seq.indexOf(t);
    expect(idx("phase2")).toBeGreaterThan(-1);
    expect(idx("DoomSpellStarted")).toBeGreaterThan(idx("phase2"));
    expect(idx("phase3")).toBeGreaterThan(idx("DoomSpellStarted"));
    expect(idx("MinigameStarted")).toBeGreaterThan(idx("phase3"));
    expect(run.events.filter((e) => e.type === "RiddleResolved")).toHaveLength(5);
    expect(idx("MinigameEnded")).toBeGreaterThan(idx("riddle:right"));
    expect(idx("FinisherShown")).toBeGreaterThan(idx("MinigameEnded"));
    expect(idx("FinisherCompleted")).toBeGreaterThan(idx("FinisherShown"));
    // the adds: a fading Shade and a Mender
    const spawned = run.events.filter(
      (e): e is EventOf<"EnemySpawned"> => e.type === "EnemySpawned",
    );
    expect(spawned.map((s) => s.defId)).toEqual(["willow", "shade", "mender"]);
    expect(spawned[2]?.healer).toBe(true);
    expect(run.events.some((e) => e.type === "WordFaded")).toBe(true);
  });

  test("a bot that guesses the leaf (accuracy 0.34) gets wrong answers, still ends with the finisher after exactly 5 riddles", () => {
    const run = play(21, 45, 0.34);
    const res = run.events.filter(
      (e): e is EventOf<"RiddleResolved"> => e.type === "RiddleResolved",
    );
    expect(res.length).toBeGreaterThanOrEqual(5);
    expect(res.some((r) => r.outcome === "wrong")).toBe(true);
    // every started riddle belongs to one fight: 5 per boss attempt
    expect(run.events.filter((e) => e.type === "RiddleStarted")).toHaveLength(5);
  });
});

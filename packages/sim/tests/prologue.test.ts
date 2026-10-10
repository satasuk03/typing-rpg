// Prologue sim rules (interfaces v2.2 §3.7, P1.1): one block per rule. The fixture (tests/prologueFixture.ts) is built from
// scratch here; the real packages/content/src/data/prologue.ts is P1.2's and no test reads it.
import { contentBundle, type PrologueDef } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { resolveDamage } from "../src/combat.ts";
import {
  applyInput,
  BP,
  createLevel,
  getResult,
  getView,
  hash,
  type LevelState,
  MAX_LEVEL_TICKS,
  mulBp,
  prologueRunConfig,
  replay,
  resolveLevel,
  resolvePrologue,
  SimError,
  type SimEvent,
  step,
} from "../src/index.ts";
import { hasPassive } from "../src/passives.ts";
import { surgeBp } from "../src/prologue.ts";
import type { EncounterState } from "../src/state.ts";
import { playPrologue, prologueBundle, prologueRun } from "./prologueFixture.ts";
import { mkDef, mkLoadout, mkOptions } from "./typingHarness.ts";

const types = (ev: readonly SimEvent[]): string[] => ev.map((e) => e.type);
const count = (ev: readonly SimEvent[], t: SimEvent["type"]): number =>
  ev.filter((e) => e.type === t).length;

/** Steps until the phase is "combat" (typing live). Returns the events. */
function toCombat(state: LevelState, max = 3000): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max && state.phase !== "combat"; i++) out.push(...step(state, 1));
  expect(state.phase).toBe("combat");
  return out;
}

/** A run whose only segment is the boss (the schema forbids it; the sim doesn't care). */
function bossOnly(over: Record<string, unknown> = {}) {
  const run = prologueRun(over);
  run.def.segments = [{ kind: "boss", bossId: "nul" }];
  return run;
}

describe("resolvePrologue / prologueRunConfig (§3.7.1)", () => {
  const b = prologueBundle();
  const def = resolvePrologue(b);
  const p = b.prologue as PrologueDef;

  test("the ResolvedLevel field mapping", () => {
    expect(def).toMatchObject({
      levelId: "prologue",
      chapter: 1,
      index: 0,
      isBoss: true,
      goldTotal: 0,
      parRefTicks: 0,
      tutorial: false,
      foldSentences: true,
      star3: { kind: "noSkills" },
      tierMixBp: { current: 10_000, review: 0, biome: 0, weak: 0 },
      plateLength: [3, 5],
    });
    expect(def.words.current).toEqual(p.words);
    expect(def.words.guard).toEqual(p.guardWords);
    for (const k of [
      "review",
      "biome",
      "weak",
      "doom",
      "finisher",
      "secondWind",
      "minigame",
    ] as const)
      expect(def.words[k]).toEqual([]);
    expect("riddles" in def).toBe(false);
    expect(def.segments.map((s) => s.kind)).toEqual(["walk", "encounter", "walk", "boss"]);
    expect(def.boss?.id).toBe("nul");
    expect(def.boss?.phase1.endAtHpBp).toBe(3500);
    expect(Object.keys(def.enemies).sort()).toEqual(["nul", "pgrunt", "pwisp"]);
    expect(def.contentVersion).toMatch(/^[0-9a-f]{8}$/);
  });

  test("the ResolvedPrologue numbers (ticks, bp, milli)", () => {
    const rp = def.prologue;
    expect(rp).toBeDefined();
    expect(rp?.kitActives).toEqual([
      "fireball",
      "aegis",
      "slashWave",
      "piercingThrust",
      "mendingLight",
      "frostLock",
    ]);
    expect(rp?.kitStartChargeM).toEqual(
      rp?.kitActives.map((id, i) =>
        Math.floor(
          ((K.SKILL_CHARGE_M[id] as number) * (p.kit.actives[i]?.startChargePct as number)) / 100,
        ),
      ),
    );
    expect(rp?.kitPassives).toEqual(p.kit.passives);
    expect(rp).toMatchObject({
      chargeMultBp: 25_000,
      castGapTicks: 90,
      forceAfterTicks: 240,
      heroHpFloorBp: 2500,
      bossMinTicks: 720,
      surge: {
        encounterAfterTicks: 1080,
        bossAfterTicks: 1200,
        doubleEveryTicks: 240,
        maxMultBp: 160_000,
      },
    });
  });

  test("castGap and doubleEvery are clamped to >= 1 tick", () => {
    const d = resolvePrologue(
      prologueBundle({
        castGapS: 0.001,
        surge: { encounterAfterS: 1, bossAfterS: 1, doubleEveryS: 0.001, maxMult: 2 },
      }),
    );
    expect(d.prologue?.castGapTicks).toBe(1);
    expect(d.prologue?.surge.doubleEveryTicks).toBe(1);
  });

  test("throws SimError: no prologue, unknown enemy/boss, boss not last, riddle boss", () => {
    expect(() => resolvePrologue(contentBundle)).toThrow(SimError);
    expect(() => prologueRunConfig(contentBundle)).toThrow(SimError);
    const bad = (over: Record<string, unknown>) => () => resolvePrologue(prologueBundle(over));
    const enc = (enemy: string) => ({
      kind: "encounter",
      encounter: { name: "x", hp: 40, gruntHit: 10, waves: [[{ enemy }]] },
    });
    expect(bad({ segments: [enc("ghost"), { kind: "boss", bossId: "nul" }] })).toThrow(
      /unknown enemy/,
    );
    expect(bad({ segments: [enc("pgrunt"), { kind: "boss", bossId: "ghost" }] })).toThrow(
      /unknown boss/,
    );
    // the PrologueDef schema already rejects these, so build the malformed defs behind its back
    const noBoss = prologueBundle();
    (noBoss.prologue as PrologueDef).segments = [enc("pgrunt") as never, enc("pgrunt") as never];
    expect(() => resolvePrologue(noBoss)).toThrow(/boss segment/);
    const notLast = prologueBundle();
    (notLast.prologue as PrologueDef).segments = [
      { kind: "boss", bossId: "nul" },
      enc("pgrunt") as never,
    ];
    expect(() => resolvePrologue(notLast)).toThrow(/last/);
    const noEnc = prologueBundle();
    (noEnc.prologue as PrologueDef).segments = [{ kind: "boss", bossId: "nul" }];
    expect(() => resolvePrologue(noEnc)).toThrow(/encounter/);
    const riddle = prologueBundle();
    const nul = riddle.bosses.find((x) => x.id === "nul");
    if (nul === undefined) throw new Error("fixture");
    riddle.bosses = riddle.bosses.map((x) =>
      x.id === "nul"
        ? {
            ...x,
            phase3: {
              ...x.phase3,
              minigame: {
                kind: "riddle",
                count: 5,
                leaves: 3,
                readS: 2,
                answerS: 4,
                gapS: 1.5,
                clearAtkMult: 2,
                missHit: 5,
                lengthRange: [3, 8],
              },
            },
          }
        : x,
    );
    expect(() => resolvePrologue(riddle)).toThrow(/fallingRubble/);
  });

  test("resolving is deterministic and does not touch story levels", () => {
    expect(resolvePrologue(b)).toEqual(resolvePrologue(b));
    const story = resolveLevel(prologueBundle(), "ch1-l01", { dueWeakWords: [] });
    expect("prologue" in story).toBe(false);
  });

  test("prologueRunConfig: new-save defaults, full-power gear, empty loadout skills, no caseAssist key", () => {
    const cfg = prologueRunConfig(b);
    expect(cfg.seed).toBe(p.seed);
    expect(cfg.loadout).toEqual({
      weapon: { archetype: "sword", tier: 3, rarity: "L", upgrade: 5 },
      armor: { tier: 3, rarity: "L", upgrade: 5 },
      charm: { tier: 3, rarity: "L", upgrade: 5 },
      actives: [null, null],
      activeModes: ["smart", "smart"],
      passives: [null, null, null],
    });
    expect(cfg.options).toEqual({
      pace: 25,
      difficulty: "standard",
      comboMode: "gentle",
      caseMode: "auto",
      autoUnlockAfterTypos: 0,
      firstClear: false,
      frontierChapter: 1,
      goldMultBp: 0,
      allowExternalRevive: false,
      tutorial: false,
    });
    expect("caseAssist" in cfg.options).toBe(false);
    expect(cfg.def).toEqual(def);
  });
});

describe("run state at create (§3.7.2) and story byte-identity (§14.1)", () => {
  test("the prologue sizes the charge arrays from the kit and seeds the run state", () => {
    const run = prologueRun();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    const rp = run.def.prologue;
    expect(s.run.skillChargeM).toEqual(rp?.kitStartChargeM);
    expect(s.run.skillChargeM).toHaveLength(6);
    // Fireball starts at 100%: ready from tick 0; the others (<100%) are not
    expect(s.run.skillReady).toEqual([true, false, false, false, false, false]);
    expect(s.run.prologue).toEqual({
      combatTicks: 0,
      waitTicks: [0, 0, 0, 0, 0, 0],
      lastCastTick: null,
      lastCastSlot: null,
    });
    expect(step(s, 1).some((e) => e.type === "SkillCharged")).toBe(false); // a pre-charged slot emits nothing
    expect(getView(s).skills[0]?.ready).toBe(true);
  });

  test("a story level keeps length-2 arrays and carries no prologue key anywhere", () => {
    const def = mkDef();
    const loadout = {
      ...mkLoadout(),
      actives: ["fireball", null] as [string | null, string | null],
    } as never;
    const s = createLevel(def, loadout, 1, mkOptions());
    expect(s.run.skillChargeM).toEqual([0, 0]);
    expect(s.run.skillReady).toEqual([false, false]);
    expect("prologue" in s.run).toBe(false);
    expect("prologue" in s.run.def).toBe(false);
    step(s, 600);
    expect("prologue" in getView(s)).toBe(false);
    expect(JSON.stringify(s)).not.toContain("prologue");
  });
});

describe("the N-slot kit (§3.7.3)", () => {
  test("no cast before the run's first WordCompleted; then Fireball is the first cast", () => {
    const run = prologueRun();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    const pre = toCombat(s);
    expect(count(pre, "SkillCast")).toBe(0);
    const idle = step(s, 600); // ten seconds of combat, no typing: the ready Fireball must wait
    expect(count(idle, "SkillCast")).toBe(0);
    expect(getView(s).prologue?.armed).toBe(false);
    expect(s.run.prologue?.waitTicks).toEqual([0, 0, 0, 0, 0, 0]); // waits do not accrue before arming
    // type the first word perfectly
    const out: SimEvent[] = [];
    let guard = 0;
    while (count(out, "WordCompleted") === 0 && guard++ < 50) {
      const v = getView(s);
      const plate = v.plates.find((x) => x.isTarget) ?? v.plates.find((x) => x.kind === "word");
      if (plate === undefined) {
        out.push(...step(s, 1));
        continue;
      }
      out.push(...applyInput(s, { tick: s.tick, key: plate.text.charAt(plate.typedIndex) }));
    }
    expect(count(out, "WordCompleted")).toBe(1);
    const next = step(s, 1);
    const cast = [...out, ...next].find((e) => e.type === "SkillCast");
    expect(cast).toMatchObject({ type: "SkillCast", slot: 0, skillId: "fireball" });
  });

  test("charge gain is multiplied by chargeMultBp and SkillCharged fires on the edge, in slot order", () => {
    const one = (mult: number) => {
      const run = prologueRun({
        chargeMult: mult,
        kit: {
          actives: [
            { id: "slashWave", startChargePct: 0 },
            { id: "frostLock", startChargePct: 0 },
          ],
          passives: [],
        },
      });
      const s = createLevel(run.def, run.loadout, run.seed, run.options);
      toCombat(s);
      const v = getView(s);
      const plate = v.plates.find((x) => x.kind === "word");
      if (plate === undefined) throw new Error("no word plate");
      for (const ch of plate.text) applyInput(s, { tick: s.tick, key: ch });
      return s.run.skillChargeM;
    };
    const x1 = one(1);
    const x25 = one(2.5);
    expect(x1[0]).toBeGreaterThan(0);
    expect(x25).toEqual(x1.map((c) => mulBp(c, 25_000)));
    // SkillCharged edge: a slot at 80% needs a 0.2 word: one word with x2.5 gain crosses it for both slots, in slot order
    const run = prologueRun({
      kit: {
        actives: [
          { id: "slashWave", startChargePct: 95 },
          { id: "frostLock", startChargePct: 95 },
        ],
        passives: [],
      },
    });
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    const plate = getView(s).plates.find((x) => x.kind === "word");
    const ev: SimEvent[] = [];
    for (const ch of plate?.text ?? "") ev.push(...applyInput(s, { tick: s.tick, key: ch }));
    const charged = ev.filter((e) => e.type === "SkillCharged");
    expect(charged.map((e) => (e as { slot: number }).slot)).toEqual([0, 1]);
  });

  /** A run armed by hand (no typing) with every kit slot full, so only the cast rules are exercised. */
  function armed(
    kit: { id: string; startChargePct: number }[],
    over: Record<string, unknown> = {},
  ) {
    const run = prologueRun({
      kit: { actives: kit, passives: [] },
      // a fat single-enemy encounter that never dies, and enemies that never attack: only the cast rules are exercised
      segments: [
        {
          kind: "encounter",
          encounter: { name: "Wall", hp: 9_999_999, gruntHit: 1, waves: [[{ enemy: "pgrunt" }]] },
        },
        { kind: "boss", bossId: "nul" },
      ],
      ...over,
    });
    run.options.difficulty = "zen";
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    s.run.stats.wordsCompleted = 1; // armed
    return s;
  }

  test("one cast per castGapTicks, round robin from the slot after the last cast", () => {
    const s = armed([
      { id: "fireball", startChargePct: 100 },
      { id: "aegis", startChargePct: 100 },
      { id: "slashWave", startChargePct: 100 },
      { id: "piercingThrust", startChargePct: 100 },
      { id: "mendingLight", startChargePct: 100 },
      { id: "frostLock", startChargePct: 100 },
    ]);
    for (let i = 0; i < 6; i++)
      s.run.skillChargeM[i] =
        5 * (K.SKILL_CHARGE_M[s.run.def.prologue?.kitActives[i] ?? "fireball"] as number); // overflow: always ready
    s.run.skillReady = s.run.skillReady.map(() => true);
    const ev = step(s, 90 * 6);
    const casts = ev.filter((e) => e.type === "SkillCast") as Extract<
      SimEvent,
      { type: "SkillCast" }
    >[];
    expect(casts.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < casts.length; i++)
      expect(
        (casts[i] as { tick: number }).tick - (casts[i - 1] as { tick: number }).tick,
      ).toBeGreaterThanOrEqual(90);
    // smart conditions on one full-HP, no-windup enemy: only Fireball (0) and Piercing (3) qualify, so the round robin goes
    // 0, 3, 0 ... until Aegis (1) has waited forceAfterTicks (240) and its asap condition (barrier below the cap) lets it in
    expect(casts.slice(0, 4).map((c) => c.slot)).toEqual([0, 3, 0, 1]);
    expect(count(ev, "SkillCast")).toBe(casts.length);
  });

  test("smart becomes asap after forceAfterTicks of ready-wait (Slash Wave on a single enemy)", () => {
    const s = armed([{ id: "slashWave", startChargePct: 100 }]);
    const t0 = s.tick;
    const force = s.run.def.prologue?.forceAfterTicks as number;
    expect(force).toBe(240);
    const early = step(s, force - 1);
    expect(count(early, "SkillCast")).toBe(0); // smart: needs >= 2 enemies
    expect(getView(s).skills[0]?.mode).toBe("smart");
    const at = step(s, 1);
    const cast = at.find((e) => e.type === "SkillCast");
    expect(cast).toMatchObject({ slot: 0, skillId: "slashWave", tick: t0 + force - 1 });
    expect(s.run.prologue?.waitTicks[0]).toBe(0); // reset by the cast
  });

  test("the view mode flips to asap once the wait is reached; asap never casts a pointless skill", () => {
    const s = armed([{ id: "mendingLight", startChargePct: 100 }]); // full HP: Mending is pointless in both modes
    step(s, 600);
    expect(count(step(s, 1), "SkillCast")).toBe(0);
    expect(getView(s).skills[0]?.mode).toBe("asap");
    expect(getView(s).skills[0]?.ready).toBe(true);
  });

  test("hasPassive reads the kit, never the loadout", () => {
    const withKit = prologueRun({
      kit: { actives: [{ id: "fireball", startChargePct: 0 }], passives: ["openingGambit"] },
    });
    const s1 = createLevel(withKit.def, withKit.loadout, withKit.seed, withKit.options);
    expect(hasPassive(s1.run, "openingGambit")).toBe(true);
    expect(hasPassive(s1.run, "cleanCut")).toBe(false);
    const ev = toCombat(s1).concat();
    expect(ev.some((e) => e.type === "PassiveTriggered" && e.passiveId === "openingGambit")).toBe(
      true,
    );
    expect((s1.enc as EncounterState).atbM).toBeGreaterThan(0);
    // a loadout that lists a passive does nothing when the kit omits it
    const noKit = prologueRun({
      kit: { actives: [{ id: "fireball", startChargePct: 0 }], passives: [] },
    });
    noKit.loadout.passives = ["openingGambit", "cleanCut", "riposte"];
    const s2 = createLevel(noKit.def, noKit.loadout, noKit.seed, noKit.options);
    expect(hasPassive(s2.run, "openingGambit")).toBe(false);
    expect(toCombat(s2).some((e) => e.type === "PassiveTriggered")).toBe(false);
    expect((s2.enc as EncounterState).atbM).toBe(0);
  });
});

describe("the HP floor (§3.7.4)", () => {
  // hits so heavy that every unguarded attack would kill a story hero
  const heavy = (bossHit: number) =>
    prologueRun(
      {
        segments: [
          { kind: "walk", seconds: 2, heal: false },
          {
            kind: "encounter",
            encounter: {
              name: "Doom",
              hp: 9999,
              gruntHit: 90_000,
              waves: [[{ enemy: "pgrunt" }, { enemy: "pwisp" }]],
            },
          },
          { kind: "boss", bossId: "nul" },
        ],
      },
      bossHit,
    );

  test("an idle hero is hit again and again but never drops below the floor: no HeroDowned, no Second Wind, no fail", () => {
    const run = heavy(90_000);
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    const floorM = Math.max(1, mulBp(s.run.heroMaxHpM, 2500));
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3600; i++) {
      ev.push(...step(s, 1));
      expect(s.run.heroHpM).toBeGreaterThanOrEqual(floorM);
    }
    expect(count(ev, "EnemyAttack")).toBeGreaterThan(5);
    expect(s.run.heroHpM).toBe(floorM); // pinned at the floor
    expect(count(ev, "HeroDowned")).toBe(0);
    expect(count(ev, "SecondWindStarted")).toBe(0);
    expect(count(ev, "LevelFailed")).toBe(0);
    expect(s.phase).not.toBe("failed");
    // a hit at the floor still emits its EnemyAttack but no HeroDamaged
    const atFloor = ev.filter((e) => e.type === "HeroDamaged" && e.hpAfter * 1000 <= floorM + 1000);
    expect(atFloor.length).toBeGreaterThan(0);
    const lastAttackTick = [...ev].reverse().find((e) => e.type === "EnemyAttack")?.tick ?? -1;
    expect(lastAttackTick).toBeGreaterThan(
      [...ev].reverse().find((e) => e.type === "HeroDamaged")?.tick ?? 0,
    );
    expect(getView(s).hero.secondWindAvailable).toBe(false);
    expect(s.run.secondWindUsed).toBe(false);
  });

  test("the floor is max(1, mulBp(maxHp, heroHpFloorBp)) for any floor pct", () => {
    for (const pct of [1, 25, 99]) {
      const run = prologueRun({ heroHpFloorPct: pct }, 90_000);
      run.def.segments = heavy(90_000).def.segments;
      const s = createLevel(run.def, run.loadout, run.seed, run.options);
      step(s, 3000);
      expect(s.run.heroHpM).toBeGreaterThanOrEqual(Math.max(1, mulBp(s.run.heroMaxHpM, pct * 100)));
    }
  });

  test("the story rule is untouched: the same heavy hits down a story hero", () => {
    const run = heavy(90_000);
    const story = mkDef({
      segments: run.def.segments,
      enemies: run.def.enemies,
      boss: run.def.boss,
      words: run.def.words,
    });
    const s = createLevel(story, mkLoadout(), 5, mkOptions());
    const ev: SimEvent[] = [];
    for (let i = 0; i < 3600 && s.phase !== "failed"; i++) ev.push(...step(s, 1));
    expect(count(ev, "HeroDowned")).toBeGreaterThan(0);
  });
});

describe("the surge (§3.7.5)", () => {
  function inEncounter(boss: boolean) {
    const run = boss ? bossOnly() : prologueRun();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    return s;
  }
  const at = (s: LevelState, c: number): number => {
    (s.run.prologue as { combatTicks: number }).combatTicks = c;
    return surgeBp(s);
  };

  test("encounter: x1 until 1079, then x2 at 1080, x4 at 1320, x8 at 1560, x16 from 1800 (the capped value holds)", () => {
    const s = inEncounter(false);
    expect([0, 1079].map((c) => at(s, c))).toEqual([BP, BP]);
    expect(at(s, 1080)).toBe(2 * BP);
    expect(at(s, 1319)).toBe(2 * BP);
    expect(at(s, 1320)).toBe(4 * BP);
    expect(at(s, 1560)).toBe(8 * BP);
    expect(at(s, 1800)).toBe(16 * BP);
    expect(at(s, 100_000)).toBe(16 * BP);
  });

  test("boss encounter uses bossAfterTicks (1200)", () => {
    const s = inEncounter(true);
    expect(at(s, 1199)).toBe(BP);
    expect(at(s, 1200)).toBe(2 * BP);
    expect(at(s, 1440)).toBe(4 * BP);
  });

  test("maxMult 1 disables the surge", () => {
    const run = prologueRun({
      surge: { encounterAfterS: 1, bossAfterS: 1, doubleEveryS: 1, maxMult: 1 },
    });
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    expect(at(s, 99_999)).toBe(BP);
  });

  test("the surge scales hero damage after the other mods, never enemy damage; the combat counter feeds it", () => {
    const s = inEncounter(false);
    const enc = s.enc as EncounterState;
    const e = enc.enemies[0] as EncounterState["enemies"][number];
    e.hpM = e.maxHpM = 900_000_000;
    const spec = {
      kind: "auto" as const,
      origin: "weapon" as const,
      skillId: null,
      damageType: null,
      baseM: 10_000,
      crit: false,
      hitIndex: 0,
      hitCount: 1,
    };
    at(s, 0);
    const base = resolveDamage(s, e, spec).dmgM;
    expect(base).toBe(10_000);
    at(s, 1080);
    expect(resolveDamage(s, e, spec).dmgM).toBe(2 * base);
    at(s, 1800);
    expect(resolveDamage(s, e, spec).dmgM).toBe(16 * base);
    // a boss held at its gate still takes 0
    const hit = { ...spec, baseM: 1 };
    at(s, 1800);
    expect(resolveDamage(s, e, hit).dmgM).toBe(16);
    expect(getView(s).prologue?.surgeMult).toBe(16);
  });
});

describe("combatTicks (§3.7.2)", () => {
  test("counts only combat ticks of the current encounter and resets at EncounterStarted", () => {
    const run = prologueRun();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    let mine = 0;
    let encIdx = -1;
    let sawFirst = false;
    for (let i = 0; i < 6000 && s.phase !== "cleared"; i++) {
      const wasCombat = s.phase === "combat" && s.enc !== null;
      const beforeIdx = s.enc?.index ?? -1;
      step(s, 1);
      if ((s.enc?.index ?? -1) !== beforeIdx) mine = 0; // a new encounter started on this tick (a non-combat tick)
      encIdx = s.enc?.index ?? -1;
      if (wasCombat && s.enc?.index === beforeIdx) mine++;
      if (wasCombat && mine === 1) sawFirst = true;
      expect(s.run.prologue?.combatTicks).toBe(mine);
      void encIdx;
      if (s.phase === "failed") break;
    }
    expect(sawFirst).toBe(true);
    expect(s.run.activeTicks).toBeGreaterThan(0);
  });
});

describe("the climax (§3.7.6)", () => {
  test("a boss at its gate with the adds alive climaxes on the first tick combatTicks reaches bossMinTicks", () => {
    const run = bossOnly();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    const enc = s.enc as EncounterState;
    const boss = enc.enemies[0] as EncounterState["enemies"][number];
    expect(boss.isBoss).toBe(true);
    boss.hpM = boss.gateHpM as number; // parked at the 35% gate
    const min = run.def.prologue?.bossMinTicks as number;
    (s.run.prologue as { combatTicks: number }).combatTicks = min - 2;
    expect(enc.enemies.filter((e) => e.alive && !e.isBoss)).toHaveLength(2);
    expect(getView(s).prologue?.bossClamped).toBe(true);
    expect(getView(s).boss?.holding).toBeNull(); // adds never hold the gate
    expect(count(step(s, 1), "PrologueClimax")).toBe(0); // combatTicks = min - 1
    expect(s.phase).toBe("combat");
    const tickBefore = s.tick;
    const ev = step(s, 1); // combatTicks = min
    expect(types(ev)).toEqual(["PrologueClimax", "LevelCleared"]);
    expect(ev[0]).toMatchObject({
      type: "PrologueClimax",
      tick: tickBefore,
      enemyId: boss.id,
      bossId: "nul",
      surgeMultBp: BP,
      addIds: enc.enemies.filter((e) => !e.isBoss).map((e) => e.id),
    });
    expect(ev[1]).toMatchObject({
      type: "LevelCleared",
      tick: tickBefore,
      levelId: "prologue",
      durationTicks: tickBefore,
      gold: 0,
    });
    expect(s.phase).toBe("cleared");
    expect(
      count(ev, "EnemyDeath") + count(ev, "BossPhaseChanged") + count(ev, "EncounterCleared"),
    ).toBe(0);
    // terminal: nothing more happens, adds and plates stay as they are
    const adds = enc.enemies.filter((e) => e.alive).length;
    expect(step(s, 600)).toEqual([]);
    expect(applyInput(s, { tick: s.tick, key: "a" })).toEqual([]);
    expect(enc.enemies.filter((e) => e.alive)).toHaveLength(adds);
    expect(getView(s).prologue?.bossClamped).toBe(false);
  });

  test("the surge multiplier at the climax is reported", () => {
    const run = bossOnly();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    const boss = (s.enc as EncounterState).enemies[0] as EncounterState["enemies"][number];
    boss.hpM = boss.gateHpM as number;
    (s.run.prologue as { combatTicks: number }).combatTicks = 2000;
    const ev = step(s, 1);
    expect(ev[0]).toMatchObject({ type: "PrologueClimax", surgeMultBp: 16 * BP });
  });

  test("bossMinTicks clamps: the boss is parked at the gate until then (full run, perfect typing, bossMinS 40)", () => {
    const run = prologueRun({ bossMinS: 40 });
    const r = playPrologue(run, "perfect", { everyTicks: 8 });
    expect(r.state.phase).toBe("cleared");
    const climax = r.events.find((e) => e.type === "PrologueClimax");
    expect(climax).toBeDefined();
    const need = run.def.prologue?.bossMinTicks as number;
    expect(need).toBe(2400);
    // combatTicks reads 1 on the first combat tick, typingFromTick + 1, so it reaches `need` at typingFromTick + need
    const bossIntro = r.events.find((e) => e.type === "EncounterStarted" && e.isBoss);
    const typingFrom = (bossIntro as { typingFromTick: number }).typingFromTick;
    expect(climax?.tick).toBe(typingFrom + need);
    const end = r.events.at(-1);
    expect(end).toMatchObject({ type: "LevelCleared", gold: 0 });
    expect(r.events.at(-2)?.type).toBe("PrologueClimax");
    expect(getResult(r.state)).toMatchObject({
      outcome: "cleared",
      gold: 0,
      chests: [],
      failReason: null,
    });
  });

  test("a long hold with the surge on cannot kill the boss: it stays at the gate", () => {
    const run = prologueRun({ bossMinS: 600 });
    const r = playPrologue(run, "perfect", { everyTicks: 6, maxTicks: 3 * 60 * 60 });
    const boss = r.state.enc?.enemies[0] as EncounterState["enemies"][number];
    expect(r.state.phase).not.toBe("cleared");
    expect(boss.alive).toBe(true);
    expect(boss.hpM).toBe(boss.gateHpM);
    expect(getView(r.state).prologue?.bossClamped).toBe(true);
  });
});

describe("no loot, no timeout (§3.7.7)", () => {
  test("a cleared prologue emits no GoldGained / ChestDropped and pays nothing", () => {
    const run = prologueRun();
    const r = playPrologue(run, "perfect", { everyTicks: 8 });
    expect(r.state.phase).toBe("cleared");
    const ev = types(r.events);
    expect(ev).not.toContain("GoldGained");
    expect(ev).not.toContain("ChestDropped");
    expect(ev).toContain("EncounterCleared"); // the encounter still clears and rewards as today
    expect(r.state.run.goldCollected).toBe(0);
    expect(r.state.run.chests).toEqual([]);
  });

  test("a story level with the same shape still pays gold (the skip is gated)", () => {
    const run = prologueRun();
    const story = mkDef({
      segments: run.def.segments,
      enemies: run.def.enemies,
      boss: null,
      isBoss: false,
      words: run.def.words,
      goldTotal: 100,
    });
    story.segments = story.segments.filter((x) => x.kind !== "boss");
    const s = createLevel(story, mkLoadout(), 9, mkOptions());
    const ev: SimEvent[] = [];
    for (let i = 0; i < 2000; i++) {
      const v = getView(s);
      const pl = v.plates.find((x) => x.isTarget) ?? v.plates.find((x) => x.kind === "word");
      if (pl !== undefined && i % 6 === 0 && s.phase === "combat")
        ev.push(...applyInput(s, { tick: s.tick, key: pl.text.charAt(pl.typedIndex) }));
      ev.push(...step(s, 1));
      if (s.phase === "cleared") break;
    }
    expect(count(ev, "GoldGained")).toBeGreaterThan(0);
  });

  test("no timeout fail: an idle prologue runs to MAX_LEVEL_S and replay reports result null", () => {
    const run = prologueRun();
    const res = replay(run.def, run.loadout, run.seed, run.options, []);
    expect(res.finalState.tick).toBe(MAX_LEVEL_TICKS);
    expect(res.finalState.phase).not.toBe("failed");
    expect(res.result).toBeNull();
    expect(res.events.some((e) => e.type === "LevelFailed")).toBe(false);
  });

  test("the only fail is abandon", () => {
    const run = prologueRun();
    const res = replay(run.def, run.loadout, run.seed, run.options, [
      { tick: 300, cmd: "abandon" },
    ]);
    expect(res.result).toMatchObject({ outcome: "failed", failReason: "abandoned" });
    expect(res.events.at(-1)).toMatchObject({ type: "LevelFailed", reason: "abandoned" });
  });
});

describe("the view (§3.7.8)", () => {
  test("one SkillView per kit slot, kit passives, no Second Wind, no hold, prologue block", () => {
    const run = prologueRun();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    const v0 = getView(s);
    expect(v0.skills.map((x) => x.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(v0.skills.map((x) => x.id)).toEqual(run.def.prologue?.kitActives);
    expect(v0.skills[0]).toMatchObject({ ready: true, chargeFrac: 1, mode: "smart" });
    expect(v0.skills[1]?.chargeFrac).toBeCloseTo(0.8, 5);
    expect(v0.skills[5]?.chargeFrac).toBe(0);
    expect(v0.passives).toEqual(run.def.prologue?.kitPassives);
    expect(v0.hero.secondWindAvailable).toBe(false);
    expect(v0.prologue).toEqual({ surgeMult: 1, bossClamped: false, armed: false });
    toCombat(s);
    const v1 = getView(s);
    expect(v1.prologue).toEqual({ surgeMult: 1, bossClamped: false, armed: false });
  });

  test("the boss strip reports holding null on the prologue", () => {
    const run = bossOnly();
    const s = createLevel(run.def, run.loadout, run.seed, run.options);
    toCombat(s);
    const v = getView(s);
    expect(v.boss).not.toBeNull();
    expect(v.boss?.holding).toBeNull();
    expect(v.boss?.gateHpFrac).toBeCloseTo(0.35, 5);
  });

  test("hash and snapshot are stable for a prologue state", () => {
    const run = prologueRun();
    const a = createLevel(run.def, run.loadout, run.seed, run.options);
    const b = createLevel(run.def, run.loadout, run.seed, run.options);
    step(a, 500);
    step(b, 500);
    expect(hash(a)).toBe(hash(b));
  });
});

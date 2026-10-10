// T1.2 (interfaces v2.0 §3.5): healers, per-ref attackPower and elites. Fixtures are inline EnemyDefs (no Ch2 content).
import { describe, expect, test } from "vitest";
import { healIntervalTicks } from "../src/heal.ts";
import {
  below,
  deriveRng,
  type EnemyView,
  hash,
  type LevelOptions,
  type ResolvedBoss,
  type ResolvedEnemy,
  type ResolvedEnemyRef,
  type ResolvedHeal,
  type ResolvedLevel,
} from "../src/index.ts";
import type { EnemyState } from "../src/state.ts";
import { firstLetter } from "../src/words.ts";
import {
  BOSS,
  Driver,
  ENEMIES,
  mkDef,
  mkSimpleDef,
  POOL_CURRENT,
  scriptedSession,
} from "./typingHarness.ts";

const LAZY = 1_000_000; // attack interval so long that nobody attacks during a test
const dummy = (id: string): ResolvedEnemy => ({
  id,
  archetype: "grunt",
  baseIntervalTicks: LAZY,
  heavy: false,
  plateLength: [3, 7],
  weaknesses: ["slash"],
  shield: 0,
  hpWeightBp: 10_000,
  hitWeightBp: 10_000,
});
const mender = (
  heal: Partial<ResolvedHeal> = {},
  over: Partial<ResolvedEnemy> = {},
): ResolvedEnemy => ({
  ...dummy("mender"),
  heal: { everyTicks: 600, fracBp: 2000, maxTargets: 2, maxHeals: 0, ...heal },
  ...over,
});
const HEAL_ENEMIES = (heal: Partial<ResolvedHeal> = {}, over: Partial<ResolvedEnemy> = {}) => ({
  ...ENEMIES,
  ally: dummy("ally"),
  mender: mender(heal, over),
});

const ref = (enemyId: string, extra: Partial<ResolvedEnemyRef> = {}): ResolvedEnemyRef => ({
  enemyId,
  gimmick: null,
  ...extra,
});

/** One encounter, one wave: the mender (slot 0) and `allies` dummies. */
function healerLevel(
  allies: number,
  heal: Partial<ResolvedHeal> = {},
  over: Partial<ResolvedEnemy> = {},
): ResolvedLevel {
  const def = mkSimpleDef(
    ["mender", ...Array.from({ length: allies }, () => "ally")],
    { current: POOL_CURRENT },
    { enemies: HEAL_ENEMIES(heal, over) },
    1,
    { poolM: 300_000, hitM: 5000 },
  );
  return def;
}

const setup = (
  allies: number,
  heal: Partial<ResolvedHeal> = {},
  options: Partial<LevelOptions> = {},
  over: Partial<ResolvedEnemy> = {},
) => {
  const d = new Driver(healerLevel(allies, heal, over), 5, options).toCombat();
  const enemies = (d.state.enc?.enemies ?? []) as EnemyState[];
  return { d, enemies, healer: enemies[0] as EnemyState };
};
const healed = (d: Driver) => d.ofType("EnemyHealed");
const stepUntil = (d: Driver, tick: number): void => {
  while (d.state.tick < tick) d.step();
};
/** Damage ally i to `frac` of its max HP. */
const setFrac = (e: EnemyState, num: number, den: number): void => {
  e.hpM = Math.floor((e.maxHpM * num) / den);
};

describe("healer cadence", () => {
  test("the first heal is due at max(spawnTick, typingFromTick) + healTicks, then every healTicks", () => {
    const { d, enemies, healer } = setup(1);
    const ally = enemies[1] as EnemyState;
    setFrac(ally, 1, 10);
    const enc = d.state.enc as NonNullable<typeof d.state.enc>;
    const heal = healIntervalTicks(d.state, "mender");
    const first = Math.max(healer.spawnTick, enc.typingFromTick) + heal;
    expect(healer.nextHealTick).toBe(first);
    stepUntil(d, first + heal + 2);
    expect(healed(d).map((e) => e.tick)).toEqual([first, first + heal]);
  });

  test("cadence is pace-scaled and preset-scaled like attacks", () => {
    const interval = (pace: number, difficulty: "story" | "standard" | "hard" | "zen") => {
      const { d, healer } = setup(1, {}, { pace, difficulty });
      const enc = d.state.enc as NonNullable<typeof d.state.enc>;
      return (healer.nextHealTick as number) - Math.max(healer.spawnTick, enc.typingFromTick);
    };
    const base = interval(35, "standard");
    expect(base).toBe(600); // pace factor 1.0 at pace 35
    expect(interval(70, "standard")).toBeLessThan(base); // faster typists face faster healers
    expect(interval(15, "standard")).toBeGreaterThan(base);
    expect(interval(35, "story")).toBe(840); // x1.4
    expect(interval(35, "zen")).toBe(600); // Zen does not stop heals
  });

  test("the pace-70 healer heals on the scaled tick", () => {
    const { d, enemies } = setup(1, {}, { pace: 70 });
    setFrac(enemies[1] as EnemyState, 1, 10);
    const first = (enemies[0] as EnemyState).nextHealTick as number;
    stepUntil(d, first + 1);
    expect(healed(d)[0]?.tick).toBe(first);
  });
});

describe("healer targets", () => {
  test("heals only living non-boss allies, lowest HP fraction first, capped by maxTargets, never itself", () => {
    const { d, enemies, healer } = setup(4, { maxTargets: 2 });
    const [, a, b, c, dead] = enemies as [
      EnemyState,
      EnemyState,
      EnemyState,
      EnemyState,
      EnemyState,
    ];
    setFrac(healer, 1, 10); // a hurt healer never heals itself
    setFrac(a, 1, 2);
    setFrac(b, 1, 5); // lowest
    setFrac(c, 4, 5);
    dead.alive = false;
    dead.hpM = 0;
    stepUntil(d, (healer.nextHealTick as number) + 1);
    const ev = healed(d);
    expect(ev.map((e) => e.targetId)).toEqual([b.id, a.id]);
    expect(ev.every((e) => e.sourceId === healer.id)).toBe(true);
    expect(ev.every((e) => e.tick === ev[0]?.tick)).toBe(true);
    expect(c.hpM).toBeLessThan(c.maxHpM); // third lowest: beyond maxTargets
    expect(healer.hpM).toBe(Math.floor(healer.maxHpM / 10));
    expect(dead.hpM).toBe(0);
  });

  test("ties on HP fraction break by slot", () => {
    const { d, enemies, healer } = setup(3, { maxTargets: 1 });
    for (const e of enemies.slice(1)) setFrac(e, 1, 2);
    stepUntil(d, (healer.nextHealTick as number) + 1);
    expect(healed(d).map((e) => e.targetId)).toEqual([(enemies[1] as EnemyState).id]);
  });

  test("the boss is never healed (healer add in boss phase 1)", () => {
    const boss: ResolvedBoss = {
      ...BOSS,
      phase1: { endAtHpBp: 6600, adds: [ref("mender"), ref("ally")] },
    };
    const def = mkDef({
      segments: [{ kind: "boss", bossId: boss.id }],
      boss,
      enemies: HEAL_ENEMIES(),
    });
    const d = new Driver(def, 3).toCombat();
    const [bossE, healer, ally] = (d.state.enc?.enemies ?? []) as EnemyState[];
    expect((bossE as EnemyState).isBoss).toBe(true);
    (bossE as EnemyState).hpM = Math.floor((bossE as EnemyState).maxHpM * 0.8);
    const bossHp = (bossE as EnemyState).hpM;
    (ally as EnemyState).hpM = Math.floor((ally as EnemyState).maxHpM / 2);
    stepUntil(d, ((healer as EnemyState).nextHealTick as number) + 1);
    expect(healed(d).map((e) => e.targetId)).toEqual([(ally as EnemyState).id]);
    expect((bossE as EnemyState).hpM).toBe(bossHp);
  });

  test("no qualifying target: the heal is spent silently and the cadence continues", () => {
    const { d, enemies, healer } = setup(1);
    const first = healer.nextHealTick as number;
    const heal = healIntervalTicks(d.state, "mender");
    stepUntil(d, first + 1);
    expect(healed(d)).toHaveLength(0);
    expect(healer.nextHealTick).toBe(first + heal);
    setFrac(enemies[1] as EnemyState, 1, 2);
    stepUntil(d, first + heal + 1);
    expect(healed(d)).toHaveLength(1);
  });
});

describe("healer amounts", () => {
  test("never above max HP: the heal is clamped and hpAfter equals maxHp", () => {
    const { d, enemies, healer } = setup(1, { fracBp: 9000 });
    const ally = enemies[1] as EnemyState;
    ally.hpM = ally.maxHpM - 100;
    stepUntil(d, (healer.nextHealTick as number) + 1);
    const [ev] = healed(d);
    expect(ev?.amountM).toBe(100);
    expect(ev?.hpAfter).toBe(ev?.maxHp);
    expect(ally.hpM).toBe(ally.maxHpM);
  });

  test("amount is mulBp(target maxHp, fracBp)", () => {
    const { d, enemies, healer } = setup(1, { fracBp: 1500 });
    const ally = enemies[1] as EnemyState;
    ally.hpM = 1000;
    const before = ally.hpM;
    stepUntil(d, (healer.nextHealTick as number) + 1);
    const [ev] = healed(d);
    expect(ev?.amountM).toBe(Math.floor((ally.maxHpM * 1500) / 10_000));
    expect(ally.hpM).toBe(before + (ev?.amountM ?? 0));
  });

  test("maxHeals caps effective heals per encounter; ineffective (no-target) heals do not count", () => {
    const { d, enemies, healer } = setup(1, { maxHeals: 2, fracBp: 300 });
    const ally = enemies[1] as EnemyState;
    const heal = healIntervalTicks(d.state, "mender");
    stepUntil(d, (healer.nextHealTick as number) + 1); // an ineffective first heal (everyone is full)
    expect(healer.healsDone).toBe(0);
    ally.hpM = 1000;
    stepUntil(d, d.state.tick + heal * 5);
    expect(healed(d)).toHaveLength(2);
    expect(healer.healsDone).toBe(2);
    expect(d.view().enemies[0]?.healer).toMatchObject({ ticksLeft: null, healsLeft: 0 });
  });
});

describe("healer deferral", () => {
  test("a Break delays the heal to the tick the Break ends", () => {
    const { d, enemies, healer } = setup(1, {}, {}, { shield: 3 });
    setFrac(enemies[1] as EnemyState, 1, 5);
    const due = healer.nextHealTick as number;
    healer.brokenUntil = due + 40;
    stepUntil(d, due + 39);
    expect(healed(d)).toHaveLength(0);
    expect(d.view().enemies[0]?.healer?.ticksLeft).toBeNull(); // charge ring paused
    stepUntil(d, due + 42);
    expect(healed(d).map((e) => e.tick)).toEqual([due + 40]);
  });

  test("Frost Lock delays the heal to the tick the freeze ends", () => {
    const { d, enemies, healer } = setup(1);
    setFrac(enemies[1] as EnemyState, 1, 5);
    const due = healer.nextHealTick as number;
    healer.frozenUntil = due + 25;
    stepUntil(d, due + 24);
    expect(healed(d)).toHaveLength(0);
    stepUntil(d, due + 27);
    expect(healed(d).map((e) => e.tick)).toEqual([due + 25]);
  });

  test("a dead healer has no timer", () => {
    const { d, enemies, healer } = setup(1);
    setFrac(enemies[1] as EnemyState, 1, 5);
    healer.alive = false;
    healer.hpM = 0;
    stepUntil(d, (healer.nextHealTick as number) + 50);
    expect(healed(d)).toHaveLength(0);
  });
});

describe("per-ref attackPower and elite", () => {
  const levelWith = (refs: ResolvedEnemyRef[], encP = 10_000): ResolvedLevel => {
    const def = mkSimpleDef(["slime"], { current: POOL_CURRENT }, { enemies: HEAL_ENEMIES() });
    (def.segments[0] as { attackPowerBp: number; waves: ResolvedEnemyRef[][] }).attackPowerBp =
      encP;
    (def.segments[0] as { waves: ResolvedEnemyRef[][] }).waves = [refs];
    return def;
  };

  test("a ref's attackPowerBp overrides the encounter's; refs without one inherit it", () => {
    const d = new Driver(
      levelWith(
        [
          ref("slime", { attackPowerBp: 12_500 }),
          ref("slime"),
          ref("slime", { attackPowerBp: 5000 }),
        ],
        8000,
      ),
      4,
    ).toCombat();
    expect((d.state.enc?.enemies ?? []).map((e) => e.attackPowerBp)).toEqual([12_500, 8000, 5000]);
    const v = d.view().enemies;
    expect(v.map((e) => e.attackPowerBp)).toEqual([12_500, 8000, 5000]); // par armor is 10_000 in the fixture
    expect(v[0]?.leakBp).toBeGreaterThan(v[1]?.leakBp ?? 0); // leak is computed per enemy
    expect(v[2]?.leakBp).toBe(0);
  });

  test("boss adds: ref override beats addsAttackPowerBp, which beats 1.0; the boss keeps its own P", () => {
    const boss: ResolvedBoss = {
      ...BOSS,
      attackPowerBp: 13_000,
      phase1: {
        endAtHpBp: 6600,
        addsAttackPowerBp: 7000,
        adds: [ref("slime", { attackPowerBp: 12_500 }), ref("slime")],
      },
    };
    const def = mkDef({ segments: [{ kind: "boss", bossId: boss.id }], boss });
    const d = new Driver(def, 3).toCombat();
    expect((d.state.enc?.enemies ?? []).map((e) => e.attackPowerBp)).toEqual([
      13_000, 12_500, 7000,
    ]);
  });

  test("elite is presentation only: EnemySpawned.elite, EnemyView.elite, no other effect; keys absent otherwise", () => {
    const d = new Driver(
      levelWith([ref("slime", { attackPowerBp: 12_500, elite: true }), ref("slime")]),
      4,
    );
    d.toCombat();
    const spawned = d.ofType("EnemySpawned");
    expect(spawned[0]?.elite).toBe(true);
    expect("elite" in (spawned[1] as object)).toBe(false);
    expect("healer" in (spawned[0] as object)).toBe(false);
    const [e0, e1] = d.view().enemies as [EnemyView, EnemyView];
    expect(e0.elite).toBe(true);
    expect("elite" in e1).toBe(false);
    expect("healer" in e1).toBe(false);
    const [s0, s1] = (d.state.enc?.enemies ?? []) as EnemyState[];
    expect(s0?.elite).toBe(true);
    expect("elite" in (s1 as object)).toBe(false);
    expect("nextHealTick" in (s1 as object)).toBe(false);
  });

  test("healer flag and view data: EnemySpawned.healer, EnemyView.healer {ticksLeft,totalTicks,healsLeft}", () => {
    const d = new Driver(healerLevel(1, { maxHeals: 3 }), 5).toCombat();
    expect(d.ofType("EnemySpawned").map((e) => e.healer)).toEqual([true, undefined]);
    const h = d.view().enemies[0]?.healer;
    expect(h?.totalTicks).toBe(600);
    expect(h?.healsLeft).toBe(3);
    expect(h?.ticksLeft).toBeGreaterThan(0);
    expect("healer" in (d.view().enemies[1] as object)).toBe(false);
  });
});

/** Random healer-heavy level for the property + determinism tests. */
function randomHealerDef(seed: number): ResolvedLevel {
  const r = deriveRng(seed, "meta", 7);
  const letters = 3 + below(r, 23);
  const word = (): string => {
    let w = "";
    const len = 3 + below(r, 5);
    for (let i = 0; i < len; i++) w += "abcdefghijklmnopqrstuvwxyz".charAt(below(r, letters));
    return w;
  };
  const enemies: Record<string, ResolvedEnemy> = { ...ENEMIES };
  for (let i = 0; i < 3; i++) {
    const id = `h${i}`;
    enemies[id] = {
      ...dummy(id),
      baseIntervalTicks: 200 + below(r, 400),
      heal: {
        everyTicks: 60 + below(r, 240),
        fracBp: 500 + below(r, 4000),
        maxTargets: 1 + below(r, 4),
        maxHeals: below(r, 3) === 0 ? 1 + below(r, 3) : 0,
      },
    };
  }
  const ids = ["slime", "bat", "brute", "h0", "h1", "h2"];
  const waves = Array.from({ length: 1 + below(r, 3) }, () =>
    Array.from({ length: 2 + below(r, 4) }, () =>
      ref(
        ids[below(r, ids.length)] as string,
        below(r, 4) === 0 ? { attackPowerBp: 12_500, elite: true } : {},
      ),
    ),
  );
  return mkDef({
    isBoss: false,
    boss: null,
    enemies,
    segments: [
      {
        kind: "encounter",
        name: "H",
        hpPoolM: 60_000 + below(r, 200_000),
        gruntHitM: 800,
        attackPowerBp: 10_000,
        waves,
      },
    ],
    words: {
      current: Array.from({ length: 30 }, word),
      review: [],
      biome: [],
      weak: [],
      guard: Array.from({ length: 10 }, word),
      doom: [],
      finisher: [],
      secondWind: [],
      minigame: [],
    },
  });
}

describe("healers: property + determinism", () => {
  test("with healers present: no two visible plates share a first letter, ally HP stays in 0..max, heals are valid", () => {
    let heals = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const def = randomHealerDef(seed);
      const r = deriveRng(seed, "meta", 9);
      const d = new Driver(def, seed, {
        pace: 15 + below(r, 106),
        difficulty: (["story", "standard", "hard", "zen"] as const)[below(r, 4)] as "story",
      });
      for (let i = 0; i < 4000 && d.state.phase !== "cleared" && d.state.phase !== "failed"; i++) {
        if (d.state.phase === "combat" && below(r, 3) === 0) {
          const v = d.view();
          const target = v.plates.find((p) => p.isTarget);
          if (target !== undefined) d.key(target.text.charAt(target.typedIndex));
          else if (v.plates.length > 0)
            d.key((v.plates[below(r, v.plates.length)] as { text: string }).text.charAt(0));
        }
        const ev = d.step();
        for (const e of ev) {
          if (e.type !== "EnemyHealed") continue;
          heals++;
          expect(e.hpAfter).toBeLessThanOrEqual(e.maxHp);
          expect(e.amountM).toBeGreaterThan(0);
        }
        const v = d.view();
        const letters = v.plates.map((p) => firstLetter(p.text));
        for (const p of v.plates) if (p.display !== p.text) letters.push(firstLetter(p.display));
        expect(new Set(letters).size).toBe(letters.length);
        for (const e of d.state.enc?.enemies ?? []) {
          expect(e.hpM).toBeLessThanOrEqual(e.maxHpM);
          expect(e.hpM).toBeGreaterThanOrEqual(0);
        }
      }
    }
    expect(heals).toBeGreaterThan(20); // the property really exercised healers
  });

  test("determinism: the same seed and inputs give identical events and state hash", () => {
    const run = (seed: number) => {
      const { driver, inputs } = scriptedSession(seed, randomHealerDef(seed), 6000);
      return {
        events: JSON.stringify(driver.all),
        h: hash(driver.state),
        inputs,
        endTick: driver.state.tick,
      };
    };
    for (const seed of [11, 22, 33]) {
      const a = run(seed);
      const b = run(seed);
      expect(b.events).toBe(a.events);
      expect(b.h).toBe(a.h);
      expect(a.events).toContain("EnemyHealed");
      // replay: feed the recorded inputs into a fresh driver
      const d = new Driver(randomHealerDef(seed), seed);
      for (const i of a.inputs) {
        while (d.state.tick < i.tick) d.step();
        d.key(i.key);
      }
      while (d.state.tick < a.endTick) d.step();
      expect(JSON.stringify(d.all)).toBe(a.events);
    }
  });
});

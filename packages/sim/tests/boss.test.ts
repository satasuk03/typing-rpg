// T1.5 boss script: the Ruin Golem's 3 phases, Doom Spells, Falling Rubble, the Finisher, Second Wind and Frost Lock
// interplay. Rules: docs/interfaces.md §3.4 and D14-D17; orchestrator rulings are quoted where a test pins one.
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { doomTicks } from "../src/boss.ts";
import { doomEveryTicks, rubbleFallTicks, rubbleSpawnTicks } from "../src/bossPlates.ts";
import { mulBp } from "../src/fixed.ts";
import type {
  EventOf,
  ResolvedBoss,
  ResolvedEnemy,
  ResolvedLevel,
  SimEvent,
} from "../src/index.ts";
import type { EnemyState } from "../src/state.ts";
import { freezeEnemy } from "../src/statuses.ts";
import { PACE_FACTOR_BP } from "../src/tables.generated.ts";
import { BOSS, Driver, ENEMIES, mkDef, mkLoadout, type mkOptions } from "./typingHarness.ts";

const DOOM = [
  "Crumble beneath my ancient weight.",
  "Dust and stone shall bury your light.",
  "Every gate must close and every road must end.",
  "Fall, tiny hero, as the old mountain falls.",
];
const RUBBLE = ["dust", "crack", "brick", "shard", "grit", "beam", "chunk", "clay"];
const FINISHER = BOSS.phase3.finisherText;

/** A boss-only level. The boss never attacks unless a test arms it (`intervalTicks` is huge), so damage is attributable. */
function bossLevel(
  over: Partial<ResolvedBoss> = {},
  words: Partial<ResolvedLevel["words"]> = {},
  extraEnemies: Record<string, ResolvedEnemy> = {},
): ResolvedLevel {
  return mkDef({
    segments: [{ kind: "boss", bossId: "ruinGolem" }],
    boss: { ...BOSS, ...over },
    enemies: { ...ENEMIES, ...extraEnemies },
    words: {
      current: ["apple", "bird", "cat", "door", "eagle", "fish", "gold", "hill"],
      review: [],
      biome: [],
      weak: [],
      guard: ["arm", "bar", "cap", "dig", "end", "fin", "gap", "hit"],
      doom: DOOM,
      finisher: [FINISHER],
      secondWind: ["Never give up."],
      minigame: RUBBLE,
      ...words,
    },
  });
}

const boss = (d: Driver): EnemyState => d.state.enc?.enemies[0] as EnemyState;
const bs = (d: Driver) =>
  d.state.enc?.boss as NonNullable<NonNullable<Driver["state"]["enc"]>["boss"]>;

function start(
  over: Partial<ResolvedBoss> = {},
  opts: Parameters<typeof mkOptions>[0] = {},
  words: Partial<ResolvedLevel["words"]> = {},
  extra: Record<string, ResolvedEnemy> = {},
): Driver {
  const d = new Driver(bossLevel(over, words, extra), 5, opts, mkLoadout()).toCombat();
  quiet(d);
  return d;
}
/** The boss attack timer is pushed out of reach (restartAttackCycle reads intervalTicks too). */
function quiet(d: Driver): void {
  for (const e of d.state.enc?.enemies ?? []) {
    e.intervalTicks = 10_000_000;
    e.nextImpact = null;
    e.windupShown = false;
  }
}
/** Sets the boss to its gate and steps until the next phase's breather has ended. */
function toPhase(d: Driver, n: 2 | 3): void {
  while (bs(d).phase < n) {
    const from = bs(d).phase;
    const b = boss(d);
    b.hpM = Math.min(b.hpM, b.gateHpM as number);
    for (let i = 0; i < 2000 && !(bs(d).phase > from && d.state.phase === "combat"); i++) d.step();
    if (bs(d).phase === from) throw new Error(`the boss never left phase ${from}`);
  }
  quiet(d);
}
const doomPlate = (d: Driver) => d.plates().find((p) => p.kind === "doom");
const last = <T extends SimEvent["type"]>(d: Driver, t: T): EventOf<T> =>
  d.ofType(t).at(-1) as EventOf<T>;
const parHit = mulBp(100_000, K.DOOM_DMG_BP); // mkDef: parHpM 100_000, DOOM_DMG 15%

describe("phase 1 -> 2 at the 66% gate", () => {
  test("the boss cannot be damaged below 66%; reaching it starts the transition on that tick's step", () => {
    const d = start();
    const b = boss(d);
    const gate = mulBp(BOSS.hpM, 6600);
    expect(b.gateHpM).toBe(gate);
    b.hpM = gate + 1000;
    const hurt = 50_000;
    d.state.run.heroHpM = hurt;
    const ev = d.type(d.plates()[0]?.text ?? "");
    const hit = d.ofType("Hit", ev)[0];
    expect(hit).toMatchObject({ kind: "chip", damageM: 1000 }); // a 2.5 chip is clamped to the gate
    expect(b.hpM).toBe(gate);
    // the chip landed during `type`'s key tick; the script saw it in the same tick's step
    const changed = d.ofType("BossPhaseChanged");
    expect(changed).toEqual([
      expect.objectContaining({
        enemyId: b.id,
        from: 1,
        to: 2,
        breatherUntilTick: (changed[0]?.tick as number) + BOSS.breatherTicks,
      }),
    ]);
    expect(d.state.phase).toBe("bossBreather");
    expect(d.view().plates).toHaveLength(0);
    expect(d.ofType("HeroHealed")[0]).toMatchObject({ cause: "phase", amount: 10 });
    expect(d.state.run.heroHpM).toBe(hurt + mulBp(100_000, K.PHASE_HEAL_BP));
    // keys are ignored during the breather
    expect(d.key("a")).toEqual([]);
    d.step(BOSS.breatherTicks);
    expect(d.state.phase).toBe("combat");
    expect(d.view().boss).toMatchObject({ phase: 2, gateHpFrac: 0.33 });
    expect(b.gateHpM).toBe(mulBp(BOSS.hpM, 3300));
    expect(d.plates().filter((p) => p.kind === "word")).toHaveLength(1);
  });

  test("the 66% gate waits for the adds: they are targeted instead of the clamped boss", () => {
    const scout: ResolvedEnemy = { ...(ENEMIES.slime as ResolvedEnemy), id: "scout" };
    const d = start(
      { phase1: { endAtHpBp: 6600, adds: [{ enemyId: "scout", gimmick: null }] } },
      {},
      {},
      { scout },
    );
    const b = boss(d);
    const add = d.state.enc?.enemies[1] as EnemyState;
    expect(add.isBoss).toBe(false);
    expect(d.state.enc?.focusEnemyId).toBe(add.id); // the adds are killed first (economy_sim)
    b.hpM = b.gateHpM as number;
    d.step(5);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(0);
    expect(d.view().boss?.holding).toBe("adds");
    // an auto-attack aimed at the clamped boss is re-aimed at the add
    d.state.enc?.pending.push({
      tick: d.state.tick + 1,
      kind: "auto",
      targetId: b.id,
      crit: false,
    });
    if (d.state.enc !== null) d.state.enc.focusEnemyId = b.id;
    const ev = d.step(2);
    expect(d.ofType("Hit", ev)[0]?.targetId).toBe(add.id);
    add.hpM = 1;
    d.state.enc?.pending.push({
      tick: d.state.tick + 1,
      kind: "auto",
      targetId: add.id,
      crit: false,
    });
    d.step(3);
    expect(d.ofType("EnemyDeath").map((e) => e.enemyId)).toEqual([add.id]);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(1); // the last add's death opened the gate
  });

  test("boss adds are the EnemyDefs scaled by the encounter scaling: pool = boss HP x 0.5/3.2, hit = gruntHit x hitWeight", () => {
    const heavy: ResolvedEnemy = {
      ...(ENEMIES.slime as ResolvedEnemy),
      id: "heavy",
      hpWeightBp: 14_000,
      hitWeightBp: 11_000,
    };
    const light: ResolvedEnemy = {
      ...(ENEMIES.bat as ResolvedEnemy),
      id: "light",
      hpWeightBp: 7000,
      hitWeightBp: 8000,
    };
    const d = start(
      {
        hpM: 752_900,
        phase1: {
          endAtHpBp: 6600,
          adds: [
            { enemyId: "heavy", gimmick: null },
            { enemyId: "light", gimmick: null },
          ],
          addsHpPoolM: 117_640,
          addsGruntHitM: 5280,
        },
      },
      {},
      {},
      { heavy, light },
    );
    const [, a, c] = (d.state.enc as NonNullable<typeof d.state.enc>).enemies;
    expect([(a as EnemyState).maxHpM, (c as EnemyState).maxHpM]).toEqual([78_426, 39_213]);
    expect(((a as EnemyState).maxHpM + (c as EnemyState).maxHpM) / 2).toBeCloseTo(58_819, -1); // ~58.8 each
    expect([(a as EnemyState).hitM, (c as EnemyState).hitM]).toEqual([5808, 4224]);
  });
});

describe("phase 2: the Doom Spell", () => {
  test("the first Doom Spell starts doomEveryS after the breather; the next one doomEveryS after the previous RESOLUTION", () => {
    const d = start();
    toPhase(d, 2);
    const t0 = last(d, "BossPhaseChanged").breatherUntilTick; // typing is live from here
    expect(bs(d).nextDoomTick).toBe(t0 + BOSS.phase2.doomEveryTicks);
    d.step(t0 + BOSS.phase2.doomEveryTicks - d.state.tick);
    expect(doomPlate(d)).toBeUndefined();
    const ev = d.step(1);
    const started = d.ofType("DoomSpellStarted", ev)[0] as EventOf<"DoomSpellStarted">;
    expect(started.tick).toBe(t0 + 900);
    expect(DOOM).toContain(started.text);
    expect(started.deadlineTick - started.tick).toBe(doomTicks(started.text.length, 35));
    expect(started.deadlineTick - started.tick).toBe(
      Math.ceil((started.text.length * 900) / 35) + 120,
    );
    expect(d.view().doom).toMatchObject({
      plateId: started.plateId,
      ticksLeft: doomTicks(started.text.length, 35) - 1,
    });
    expect(d.view().plates.find((p) => p.id === started.plateId)).toMatchObject({
      kind: "doom",
      expiresAtTick: started.deadlineTick,
      totalTicks: doomTicks(started.text.length, 35),
    });
    // type it: success -> stagger and the next cast 900 ticks after this resolution
    d.step(30);
    const done = d.type(started.text);
    const completed = d.ofType("DoomSpellCompleted", done)[0] as EventOf<"DoomSpellCompleted">;
    expect(completed.staggerUntilTick).toBe(completed.tick + K.DOOM_STAGGER_T);
    expect(d.ofType("StatusApplied", done).find((e) => e.status === "stagger")).toMatchObject({
      targetId: boss(d).id,
      untilTick: completed.staggerUntilTick,
    });
    expect(bs(d).nextDoomTick).toBe(completed.tick + 900);
    const second = d.until("DoomSpellStarted", 2000);
    expect(second.tick).toBe(completed.tick + 900);
    expect(second.text).not.toBe(started.text);
  });

  test("a staggered boss takes x1.5 damage for 4 s through the normal chain, then the status ends", () => {
    const d = start();
    toPhase(d, 2);
    const started = d.until("DoomSpellStarted", 2000);
    const before = boss(d).hpM;
    d.type(started.text);
    expect(boss(d).staggerUntil).not.toBeNull();
    d.state.enc?.pending.push({
      tick: d.state.tick + 1,
      kind: "auto",
      targetId: boss(d).id,
      crit: false,
    });
    const ev = d.step(2);
    const h = d.ofType("Hit", ev)[0];
    // 10 ATK sword, boss has no weaknesses: 10 x 1.5 stagger = 15 (a boss shield point would not change damage)
    expect(h?.damageM).toBe(15_000);
    expect(before - boss(d).hpM).toBeGreaterThanOrEqual(15_000);
    const until = boss(d).staggerUntil as number;
    d.step(until - d.state.tick + 1);
    expect(d.ofType("StatusEnded").some((e) => e.status === "stagger")).toBe(true);
    expect(boss(d).staggerUntil).toBeNull();
    expect(d.view().enemies[0]?.statuses.some((s) => s.id === "stagger")).toBe(false);
  });

  test("failure: 15% of PAR HP to the hero, the deadline resolves the spell, the next cast is doomEveryS later", () => {
    const d = start();
    toPhase(d, 2);
    const started = d.until("DoomSpellStarted", 2000);
    const ev = d.step(started.deadlineTick - d.state.tick + 1);
    expect(d.ofType("DoomSpellFailed", ev)).toEqual([
      expect.objectContaining({
        tick: started.deadlineTick,
        plateId: started.plateId,
        damage: parHit / 1000,
      }),
    ]);
    expect(d.ofType("HeroDamaged", ev)[0]).toMatchObject({
      cause: "doom",
      damage: 15,
      hpAfter: 85,
    });
    expect(d.ofType("PlateRemoved", ev)[0]).toMatchObject({
      plateId: started.plateId,
      reason: "expired",
    });
    expect(doomPlate(d)).toBeUndefined();
    expect(bs(d).nextDoomTick).toBe(started.deadlineTick + 900);
    expect(d.state.run.stats.hitsTaken).toBe(1); // a Doom failure is a hit that dealt HP damage (untouched counter)
  });

  test("D14: failure is non-lethal. At 1 HP it deals nothing; near death it stops at 1 HP", () => {
    const d = start();
    toPhase(d, 2);
    d.state.run.heroHpM = 9000;
    let s = d.until("DoomSpellStarted", 2000);
    let ev = d.step(s.deadlineTick - d.state.tick + 1);
    expect(d.ofType("DoomSpellFailed", ev)[0]?.damage).toBe(9); // 8.999 shown as 9: the clamp leaves 1 milli
    expect(d.state.run.heroHpM).toBe(1);
    expect(d.ofType("HeroDowned")).toHaveLength(0);
    // at 1 HP: no damage, no HeroDamaged, no Second Wind
    s = d.until("DoomSpellStarted", 2000);
    ev = d.step(s.deadlineTick - d.state.tick + 1);
    expect(d.ofType("DoomSpellFailed", ev)[0]?.damage).toBe(0);
    expect(d.ofType("HeroDamaged", ev)).toHaveLength(0);
    expect(d.state.run.heroHpM).toBe(1);
    expect(d.state.phase === "combat" || d.state.phase === "bossBreather").toBe(true);
    expect(d.ofType("HeroDowned")).toHaveLength(0);
  });

  test("zen: the script never hurts the hero (Doom failure and rubble misses deal 0)", () => {
    const d = start({}, { difficulty: "zen" });
    toPhase(d, 2);
    const s = d.until("DoomSpellStarted", 2000);
    d.step(s.deadlineTick - d.state.tick + 1);
    expect(d.state.run.heroHpM).toBe(d.state.run.heroMaxHpM);
    expect(last(d, "DoomSpellFailed").damage).toBe(0);
  });

  test("the 33% gate holds until minDoomSpells have resolved (D16), then P2 -> P3 on the resolving tick", () => {
    const d = start();
    toPhase(d, 2);
    const b = boss(d);
    b.hpM = b.gateHpM as number; // fully damaged already
    d.step(10);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(1); // only 1 -> 2
    expect(d.view().boss?.holding).toBe("doom");
    // a hero hit deals nothing at the gate
    d.state.enc?.pending.push({
      tick: d.state.tick + 1,
      kind: "auto",
      targetId: b.id,
      crit: false,
    });
    expect(d.ofType("Hit", d.step(2))[0]?.damageM).toBe(0);
    const first = d.until("DoomSpellStarted", 2000);
    d.step(20);
    d.type(first.text); // success #1
    expect(bs(d).doomsResolved).toBe(1);
    d.step(5);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(1);
    expect(d.view().boss).toMatchObject({ doomsResolved: 1, minDoomSpells: 2, holding: "doom" });
    const second = d.until("DoomSpellStarted", 2000);
    const ev = d.step(second.deadlineTick - d.state.tick + 1); // failure #2 resolves it
    const fail = d.ofType("DoomSpellFailed", ev)[0] as EventOf<"DoomSpellFailed">;
    const change = d.ofType("BossPhaseChanged", ev)[0] as EventOf<"BossPhaseChanged">;
    expect([change.from, change.to, change.tick]).toEqual([2, 3, fail.tick]);
    expect(d.state.phase).toBe("bossBreather");
  });

  test("a Doom Spell still active when the gate opens must resolve first; the gate then opens", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 1 } });
    toPhase(d, 2);
    const s = d.until("DoomSpellStarted", 2000);
    boss(d).hpM = boss(d).gateHpM as number;
    d.step(30);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(1);
    expect(doomPlate(d)).toBeDefined();
    d.type(s.text);
    d.step(2);
    expect(d.ofType("BossPhaseChanged")).toHaveLength(2);
  });

  test("the doom plate is targetable by first letter with the other plates distinct, and its timer is not paused by Frost Lock", () => {
    const d = start();
    toPhase(d, 2);
    const b = boss(d);
    const scheduled = bs(d).nextDoomTick;
    // arm a boss attack and freeze it for 600 ticks: the impact slips, the Doom Spell does not
    b.cycleStart = d.state.tick;
    b.nextImpact = d.state.tick + 300;
    b.windupShown = false;
    freezeEnemy(d.state, b, 600, "frostLock", () => {});
    const started = d.until("DoomSpellStarted", 2000);
    expect(started.tick).toBe(scheduled); // on schedule
    expect(d.ofType("EnemyAttack")).toHaveLength(0); // the freeze holds the impact
    const letters = d.plates().map((p) => p.text.charAt(0).toLowerCase());
    expect(new Set(letters).size).toBe(letters.length);
    const ev = d.step(started.deadlineTick - d.state.tick + 1);
    expect(d.ofType("DoomSpellFailed", ev)[0]?.tick).toBe(started.deadlineTick); // exactly the unfrozen deadline
    expect(b.frozenUntil === null || b.frozenUntil > started.deadlineTick - 700).toBe(true);
  });

  test("Frost Lock does not shift the doom schedule: the first cast is exactly doomEveryTicks after the breather", () => {
    const d = start();
    toPhase(d, 2);
    const t0 = last(d, "BossPhaseChanged").breatherUntilTick;
    freezeEnemy(d.state, boss(d), 1200, "frostLock", () => {});
    const s = d.until("DoomSpellStarted", 2000);
    expect(s.tick).toBe(t0 + BOSS.phase2.doomEveryTicks);
  });
});

describe("phase 3: Falling Rubble and the Finisher", () => {
  const MG = BOSS.phase3.minigame;

  test("P2 -> P3 at 33%: MinigameStarted, first word after the first-spawn delay, lanes and fall time", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const t0 = last(d, "BossPhaseChanged").breatherUntilTick;
    expect(d.ofType("MinigameStarted")[0]).toMatchObject({
      enemyId: boss(d).id,
      kind: "fallingRubble",
      lanes: 3,
    });
    expect(boss(d).gateHpM).toBe(1);
    expect(boss(d).nextImpact).toBeNull(); // the boss's own attacks are suspended
    expect(d.view().minigame).toEqual({ lanes: 3, cleared: 0, missed: 0 });
    expect(d.view().boss?.gateHpFrac).toBeNull();
    const w = d.until("MinigameWordSpawned", 2000);
    expect(w.tick).toBe(t0 + K.MINIGAME_FIRST_SPAWN_T);
    expect(w.landTick).toBe(w.tick + MG.fallTicks);
    expect(RUBBLE).toContain(w.text);
    expect(d.view().plates.find((p) => p.id === w.plateId)).toMatchObject({
      kind: "minigame",
      lane: w.lane,
      expiresAtTick: w.landTick,
      totalTicks: MG.fallTicks,
    });
    // words keep coming every spawnEveryTicks, each in a free lane, never sharing a first letter
    d.step(MG.spawnEveryTicks * 3 + 1);
    const spawned = d.ofType("MinigameWordSpawned");
    expect(spawned.length).toBeGreaterThanOrEqual(3);
    expect(spawned[1]?.tick).toBe(w.tick + MG.spawnEveryTicks);
    const letters = d.plates().map((p) => p.text.charAt(0).toLowerCase());
    expect(new Set(letters).size).toBe(letters.length);
  });

  test("clear: typing a falling word hits the boss for clearAtkMult x ATK (untyped, no shield)", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const w = d.until("MinigameWordSpawned", 2000);
    const hp = boss(d).hpM;
    const ev = d.type(w.text);
    expect(d.ofType("MinigameWordCleared", ev)[0]).toMatchObject({
      plateId: w.plateId,
      lane: w.lane,
    });
    const h = d.ofType("Hit", ev).find((x) => x.kind === "minigame");
    expect(h).toMatchObject({ origin: "minigame", damageType: null, weak: false, damageM: 20_000 }); // 2.0 x 10 ATK
    expect(hp - boss(d).hpM).toBeGreaterThanOrEqual(20_000);
    expect(d.view().minigame?.cleared).toBe(1);
    expect(d.state.run.stats.damageByOriginM.minigame).toBe(20_000);
  });

  test("miss: a word that lands costs the hero missHitM; the counters and events follow", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const w = d.until("MinigameWordSpawned", 2000);
    const ev = d.step(w.landTick - d.state.tick + 1);
    expect(d.ofType("MinigameWordMissed", ev)[0]).toMatchObject({
      plateId: w.plateId,
      lane: w.lane,
      damage: 5,
    });
    expect(d.ofType("HeroDamaged", ev)[0]).toMatchObject({
      cause: "minigame",
      damage: 5,
      hpAfter: 95,
    });
    expect(
      d.ofType("PlateRemoved", ev).some((e) => e.plateId === w.plateId && e.reason === "expired"),
    ).toBe(true);
    expect(d.view().minigame?.missed).toBe(1);
    expect(d.state.run.stats.hitsTaken).toBe(1);
  });

  test("a rubble miss can down the hero: Second Wind, then the falling words come back with their remaining time", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    d.until("MinigameWordSpawned", 2000);
    d.step(MG.spawnEveryTicks); // two words in flight
    const inFlight =
      d.state.enc?.boss?.rubble.map((r) => ({ text: r.text, lane: r.lane, land: r.landTick })) ??
      [];
    expect(inFlight.length).toBe(2);
    const nextSpawn = bs(d).nextSpawnTick as number;
    d.state.run.heroHpM = 3000; // the first word to land (5 HP) kills
    const t = d.state.tick;
    d.step((inFlight[0]?.land ?? 0) - t + 1);
    expect(d.state.phase).toBe("secondWind");
    expect(d.ofType("HeroDowned")).toHaveLength(1);
    // the second word is out of play during the freeze
    expect(d.plates().map((p) => p.kind)).toEqual(["secondWind"]);
    d.step(100); // 100 ticks of Second Wind prompt
    const sw = d.plates()[0]?.text ?? "";
    d.type(sw);
    expect(d.state.phase).toBe("combat");
    const delta = d.ofType("SecondWindSucceeded")[0]?.tick as number;
    const frozen = delta - (inFlight[0]?.land as number);
    const back = d.plates().filter((p) => p.kind === "minigame");
    // the surviving word is back (a word whose spawn was due at the freeze may spawn right after it)
    const again = back.find((p) => p.text === inFlight[1]?.text);
    expect(again?.expiresAtTick).toBe((inFlight[1]?.land as number) + frozen);
    expect(again?.lane).toBe(inFlight[1]?.lane);
    // the spawn timer froze too: it moved by exactly the freeze (plus one period when the due spawn fired right after)
    expect([0, MG.spawnEveryTicks]).toContain(
      (bs(d).nextSpawnTick as number) - (nextSpawn + frozen),
    );
    expect(d.state.run.secondWindUsed).toBe(true);
  });

  test("the Finisher appears only after the words in flight have landed once the boss is at 1 milli", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const w = d.until("MinigameWordSpawned", 2000);
    boss(d).hpM = 1;
    d.step(5);
    expect(d.ofType("FinisherShown")).toHaveLength(0); // a word is still falling
    expect(d.ofType("MinigameWordSpawned")).toHaveLength(1); // no new spawns at the gate
    const ev = d.type(w.text); // clearing the last word ends the wave
    d.step(2);
    expect(d.ofType("MinigameWordCleared", ev)).toHaveLength(1);
    const ended = d.ofType("MinigameEnded")[0];
    expect(ended).toMatchObject({ cleared: 1, missed: 0 });
    const shown = d.ofType("FinisherShown")[0];
    expect(shown?.text).toBe(FINISHER);
    expect(ended && shown && ended.tick <= shown.tick).toBe(true);
    expect(d.plates()).toHaveLength(1);
    expect(d.plates()[0]).toMatchObject({ kind: "finisher", isTarget: true, expiresAtTick: null });
  });

  test("Finisher completion kills the boss: FinisherCompleted, EnemyDeath{finisher}, EncounterCleared, then LevelCleared", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    boss(d).hpM = 1;
    d.step(3);
    expect(d.ofType("FinisherShown")).toHaveLength(1);
    d.step(2000); // no timer: nothing happens while the hero waits
    expect(d.state.phase).toBe("combat");
    const ev = d.type(FINISHER);
    expect(d.ofType("FinisherCompleted", ev)).toHaveLength(1);
    expect(d.ofType("EnemyDeath", ev)[0]).toMatchObject({ isBoss: true, byKind: "finisher" });
    d.step(1);
    expect(d.ofType("EncounterCleared")).toHaveLength(1);
    d.step(K.REWARD_T + 2);
    expect(d.state.phase).toBe("cleared");
    expect(d.all.at(-1)?.type).toBe("LevelCleared");
  });
});

describe("Second Wind during each phase freezes the boss script", () => {
  /** Arms an unblocked boss hit on the next tick (the hero must be weak enough to go down). */
  const killShot = (d: Driver): void => {
    const b = boss(d);
    d.state.run.heroHpM = 1000;
    b.hitM = 50_000;
    b.cycleStart = d.state.tick;
    b.nextImpact = d.state.tick + 1;
    b.windupShown = true;
    b.guardResult = null;
    b.intervalTicks = 10_000_000;
  };

  test("phase 1: the encounter resumes in phase 1 with the boss and its gate intact", () => {
    const d = start();
    killShot(d);
    d.step(2);
    expect(d.state.phase).toBe("secondWind");
    d.step(60);
    d.type(d.plates()[0]?.text ?? "");
    expect(d.state.phase).toBe("combat");
    expect(bs(d).phase).toBe(1);
    expect(boss(d).gateHpM).toBe(mulBp(BOSS.hpM, 6600));
    expect(d.ofType("SecondWindSucceeded")).toHaveLength(1);
    expect(d.view().plates.filter((p) => p.kind === "word")).toHaveLength(1);
    expect(d.state.run.heroHpM).toBe(mulBp(100_000, K.SECOND_WIND_HP_BP));
  });

  test("phase 2: an active Doom Spell keeps its text and its remaining time; the next-cast timer is frozen too", () => {
    const d = start();
    toPhase(d, 2);
    const s = d.until("DoomSpellStarted", 2000);
    d.step(40);
    const left = (bs(d).doom?.deadline as number) - d.state.tick;
    killShot(d);
    d.step(2);
    expect(d.state.phase).toBe("secondWind");
    expect(d.plates().map((p) => p.kind)).toEqual(["secondWind"]);
    d.step(200);
    d.type(d.plates()[0]?.text ?? "");
    expect(d.state.phase).toBe("combat");
    const plate = doomPlate(d);
    expect(plate?.text).toBe(s.text);
    // the same remaining time as at the moment the hero went down (one tick after `left` was read)
    const resumed = d.ofType("SecondWindSucceeded")[0]?.tick as number;
    expect((plate?.expiresAtTick as number) - resumed).toBe(left - 1);
    expect(d.view().doom?.plateId).toBe(plate?.id);
    // ... and it still resolves on its (shifted) deadline
    const ev = d.step((plate?.expiresAtTick as number) - d.state.tick + 1);
    expect(d.ofType("DoomSpellFailed", ev)).toHaveLength(1);
    expect(d.ofType("DoomSpellStarted")).toHaveLength(1); // not re-announced after the freeze
  });

  test("phase 2: Second Wind between casts delays the next Doom Spell by the freeze", () => {
    const d = start();
    toPhase(d, 2);
    d.step(300);
    const before = bs(d).nextDoomTick as number;
    killShot(d);
    d.step(2);
    d.step(150);
    const t = d.state.tick;
    d.type(d.plates()[0]?.text ?? "");
    const frozen =
      (d.ofType("SecondWindSucceeded")[0]?.tick as number) -
      (d.ofType("HeroDowned")[0]?.tick as number);
    expect(t).toBeGreaterThan(0);
    expect(bs(d).nextDoomTick).toBe(before + frozen);
  });

  test("a failed Second Wind ends the boss level as defeated", () => {
    const d = start();
    killShot(d);
    d.step(2 + K.SECOND_WIND_T + 2);
    expect(d.state.phase).toBe("failed");
    expect(d.all.at(-1)).toMatchObject({ type: "LevelFailed", reason: "defeated" });
  });
});

describe("boss attacks and the Finisher", () => {
  test("a Break that ends after the Finisher is shown does not resume the boss's attacks (the finisher plate stays)", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const b = boss(d);
    b.hpM = 1;
    b.brokenUntil = d.state.tick + 40; // Broken while the Finisher appears
    b.intervalTicks = 30; // would attack almost at once if the cycle were restarted
    d.step(3);
    expect(d.ofType("FinisherShown")).toHaveLength(1);
    d.step(200);
    expect(d.ofType("BreakEnded")).toHaveLength(1);
    expect(d.ofType("EnemyAttackWindup")).toHaveLength(0);
    expect(b.nextImpact).toBeNull();
    expect(d.plates().map((p) => p.kind)).toEqual(["finisher"]);
  });

  test("phase 3: the boss's own attack cycle is suspended, even after a Break", () => {
    const d = start({ phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } });
    toPhase(d, 3);
    const b = boss(d);
    b.intervalTicks = 30;
    b.brokenUntil = d.state.tick + 10;
    d.step(100);
    expect(d.ofType("BreakEnded")).toHaveLength(1);
    expect(b.nextImpact).toBeNull();
    expect(d.ofType("EnemyAttackWindup")).toHaveLength(0);
  });

  test("phases 1 and 2: the boss attacks with guard words like any enemy", () => {
    const d = new Driver(bossLevel(), 5, {}, mkLoadout()).toCombat();
    d.until("GuardWordShown", 5000);
    d.until("EnemyAttack", 5000);
    expect(d.ofType("EnemyAttack")[0]?.enemyId).toBe(boss(d).id);
  });
});

describe("determinism and plates", () => {
  test("the whole boss script is deterministic per seed", () => {
    const run = (): string => {
      const d = start();
      toPhase(d, 2);
      d.step(2000);
      return JSON.stringify(d.all);
    };
    expect(run()).toBe(run());
  });

  test("an empty doom or minigame pool falls back to a word with a free first letter", () => {
    const d = start({}, {}, { doom: [], minigame: [] });
    toPhase(d, 2);
    const s = d.until("DoomSpellStarted", 2000);
    expect(s.text.endsWith(K.DOOM_FALLBACK_TAIL)).toBe(true);
    const letters = d.plates().map((p) => p.text.charAt(0).toLowerCase());
    expect(new Set(letters).size).toBe(letters.length);
  });
});

describe("T6.1 BALANCE.BOSS_SCRIPT_PACE_SCALE: the boss script's timers follow the pace factor", () => {
  const MG = BOSS.phase3.minigame;
  const pf = (pace: number): number => PACE_FACTOR_BP[pace - K.PACE_MIN] as number;

  test("the knob is on, and pace 35 (factor 1) keeps the authored ticks", () => {
    expect(K.BOSS_SCRIPT_PACE_SCALE).toBe(true);
    expect(pf(35)).toBe(10_000);
  });

  test.each([20, 35, 75])("pace %i: Doom cadence x max(1, factor)", (pace) => {
    const d = start({}, { pace });
    toPhase(d, 2);
    const t0 = last(d, "BossPhaseChanged").breatherUntilTick;
    const want = mulBp(BOSS.phase2.doomEveryTicks, Math.max(10_000, pf(pace)));
    expect(bs(d).nextDoomTick).toBe(t0 + want);
    expect(doomEveryTicks(d.state, BOSS)).toBe(want);
    if (pace === 20) expect(want).toBe(1331); // 900 x 1.4795: a slow typist keeps a real damage window between spells
    if (pace === 75) expect(want).toBe(900); // never shorter than authored
  });

  test.each([20, 35, 75])(
    "pace %i: Falling Rubble first spawn, period and fall time x factor",
    (pace) => {
      const d = start(
        { phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 0 } },
        { pace },
      );
      toPhase(d, 3);
      const t0 = last(d, "BossPhaseChanged").breatherUntilTick;
      const w = d.until("MinigameWordSpawned", 4000);
      const fall = mulBp(MG.fallTicks, pf(pace));
      const every = mulBp(MG.spawnEveryTicks, pf(pace));
      expect(w.tick).toBe(t0 + mulBp(K.MINIGAME_FIRST_SPAWN_T, pf(pace)));
      expect(w.landTick).toBe(w.tick + fall);
      expect(d.view().plates.find((p) => p.id === w.plateId)?.totalTicks).toBe(fall);
      expect([rubbleFallTicks(d.state, BOSS), rubbleSpawnTicks(d.state, BOSS)]).toEqual([
        fall,
        every,
      ]);
      d.step(every + 1);
      expect(d.ofType("MinigameWordSpawned")[1]?.tick).toBe(w.tick + every);
      if (pace === 20) expect(fall).toBe(Math.floor((MG.fallTicks * 14_795) / 10_000)); // x 1.4795
      if (pace === 75) expect(fall).toBe(Math.floor((MG.fallTicks * 6000) / 10_000)); // x 0.6 (clamp)
    },
  );
});

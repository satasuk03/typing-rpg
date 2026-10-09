// T1.4: the 6 active skills, the 8 passives and the weapon archetype signatures, with hand-computed numbers.
// Hero in these fixtures: tier-1 C+0 gear -> 10 ATK, 100 HP. Skill numbers: BALANCE.SKILLS (-35..40% vs doc 01, C3).
import { describe, expect, test } from "vitest";
import { critChanceBp } from "../src/attack.ts";
import { K } from "../src/balance.ts";
import { scheduleAttack } from "../src/guard.ts";
import type {
  ActiveSkillId,
  EventOf,
  Loadout,
  PassiveId,
  ResolvedEnemy,
  ResolvedLevel,
  SimEvent,
} from "../src/index.ts";
import type { EncounterState, EnemyState } from "../src/state.ts";
import { Driver, ENEMIES, mkLoadout, type mkOptions, mkSimpleDef } from "./typingHarness.ts";

const PLAIN: ResolvedEnemy = {
  ...(ENEMIES.slime as ResolvedEnemy),
  id: "plain",
  weaknesses: [],
  shield: 0,
};
const SHIELDED: ResolvedEnemy = { ...PLAIN, id: "shielded", weaknesses: ["slash"], shield: 2 };
const ENEMY_SET = { ...ENEMIES, plain: PLAIN, shielded: SHIELDED };

/** One-encounter level; hero 100 HP / 10 ATK, enemy hit 5, HP pool 300 split evenly. */
const lvl = (ids: string[], over: Partial<ResolvedLevel> = {}): ResolvedLevel =>
  mkSimpleDef(ids, { current: ["apple", "bird", "cat", "door"] }, { enemies: ENEMY_SET, ...over });

const kit = (
  actives: [ActiveSkillId | null, ActiveSkillId | null],
  passives: [PassiveId | null, PassiveId | null, PassiveId | null] = [null, null, null],
  archetype: "sword" | "dagger" | "staff" | "hammer" = "sword",
  modes: ["smart" | "asap", "smart" | "asap"] = ["smart", "smart"],
): Loadout => ({ ...mkLoadout(archetype), actives, passives, activeModes: modes });

const drive = (
  def: ResolvedLevel,
  loadout: Loadout,
  opts: Parameters<typeof mkOptions>[0] = {},
): Driver => new Driver(def, 11, opts, loadout).toCombat();

const enemy = (d: Driver, i = 0): EnemyState => {
  const e = d.state.enc?.enemies[i];
  if (e === undefined) throw new Error("no enemy");
  return e;
};
const enc = (d: Driver): EncounterState => d.state.enc as EncounterState;
const arm = (d: Driver, e: EnemyState, inTicks: number): void => {
  e.cycleStart = d.state.tick;
  scheduleAttack(d.state, e, d.state.tick + inTicks);
};
/** Marks slot `slot` fully charged (as if its charge had been typed in). */
const prime = (d: Driver, slot: 0 | 1): void => {
  const id = d.state.run.loadout.actives[slot] as ActiveSkillId;
  d.state.run.skillChargeM[slot] = K.SKILL_CHARGE_M[id];
  d.state.run.skillReady[slot] = true;
};
const queueAuto = (d: Driver, inTicks = 1): void => {
  const target = enc(d).enemies.find((e) => e.alive) as EnemyState;
  enc(d).pending.push({
    tick: d.state.tick + inTicks,
    kind: "auto",
    targetId: target.id,
    crit: false,
  });
};
const word = (d: Driver): SimEvent[] => d.type(d.plates()[0]?.text ?? "");
/** Acquires the first plate, types a wrong key, then finishes the word: an imperfect completion with one typo. */
const sloppyWord = (d: Driver): SimEvent[] => {
  const text = d.plates()[0]?.text ?? "";
  const out = [...d.key(text.charAt(0)), ...d.step(), ...d.key("1"), ...d.step()];
  out.push(...d.type(text.slice(1)));
  return out;
};
const passives = (d: Driver, from?: readonly SimEvent[]) => d.ofType("PassiveTriggered", from);

const SKILL_IMPACT = K.SKILL_IMPACT_T; // 24 ticks

describe("balance: skill constants", () => {
  test("charge in milli-words, mults in bp, ticks at 60 Hz", () => {
    expect(K.SKILL_CHARGE_M.fireball).toBe(10_000);
    expect(K.FIREBALL_ATK_BP).toBe(13_000);
    expect(K.FIREBALL_BURN_T).toBe(360);
    expect(K.FIREBALL_BURN_PER_TICK_BP).toBe(500);
    expect(K.SLASH_WAVE_ATK_BP).toBe(9000);
    expect(K.PIERCING_ATK_BP).toBe(15_000);
    expect(K.FROST_FREEZE_T).toBe(240);
    expect(K.MENDING_HEAL_BP).toBe(2500);
    expect(K.SKILL_PER5_FROM_CHAPTER).toBe(10);
  });
});

describe("skill charge (doc 01 §2.3, C17)", () => {
  test("a perfect word charges 1.5 words, an imperfect one 1 (T1: per word, whatever its length)", () => {
    const d = drive(lvl(["plain"]), kit(["fireball", "aegis"]), { difficulty: "zen" });
    word(d);
    expect(d.state.run.skillChargeM).toEqual([1500, 1500]);
    expect(d.view().skills).toEqual([
      { slot: 0, id: "fireball", chargeFrac: 0.15, ready: false, mode: "smart" },
      { slot: 1, id: "aegis", chargeFrac: 0.125, ready: false, mode: "smart" }, // 1.5 / 12 (T6.1)
    ]);
    sloppyWord(d);
    expect(d.state.run.skillChargeM).toEqual([2500, 2500]);
  });

  test("from word tier T4 (chapter 10) a plate charges per 5 chars: perfect len x 0.2 x 1.5 words", () => {
    const d = drive(lvl(["plain"], { chapter: 10 }), kit(["fireball", null]), {
      difficulty: "zen",
    });
    const len = (d.plates()[0]?.text ?? "").length;
    word(d);
    expect(d.state.run.skillChargeM[0]).toBe(len * 300); // len x 200 milli-words x 1.5
    expect(d.state.run.skillChargeM[1]).toBe(0); // an empty slot does not charge
  });

  test("Staff charges skills x1.5: a perfect word is 2.25 words", () => {
    const d = drive(lvl(["plain"]), kit(["fireball", null], [null, null, null], "staff"), {
      difficulty: "zen",
    });
    word(d);
    expect(d.state.run.skillChargeM[0]).toBe(2250);
  });

  test("reaching the cost emits SkillCharged once, the view shows ready, and the skill casts next tick", () => {
    const d = drive(lvl(["plain"]), kit(["fireball", null]), { difficulty: "zen" });
    d.state.run.skillChargeM[0] = 9000;
    const ev = word(d);
    expect(d.ofType("SkillCharged", ev)).toEqual([
      { type: "SkillCharged", tick: expect.any(Number), slot: 0, skillId: "fireball" },
    ]);
    const cast = d.ofType("SkillCast");
    expect(cast).toHaveLength(1);
    expect(d.state.run.skillChargeM[0]).toBe(10_500 - 10_000); // overflow carries over
    expect(d.view().skills[0]).toMatchObject({ ready: false, chargeFrac: 0.05 });
  });
});

describe("active skills", () => {
  test("Fireball: 1.3 x ATK fire hit, then burn 0.05 x ATK per second for 6 s, all tagged origin skill", () => {
    const d = drive(lvl(["plain"]), kit(["fireball", null]), { difficulty: "zen" });
    prime(d, 0);
    d.step();
    const cast = d.ofType("SkillCast")[0] as EventOf<"SkillCast">;
    expect(cast).toMatchObject({ slot: 0, skillId: "fireball", targetIds: [enemy(d).id] });
    expect(cast.impactTick).toBe(cast.tick + SKILL_IMPACT);
    const from = d.all.length;
    d.step(SKILL_IMPACT);
    const impact = d.ofType("Hit", d.all.slice(from))[0];
    expect(impact).toMatchObject({
      kind: "skill",
      origin: "skill",
      skillId: "fireball",
      damageType: "fire",
      damageM: 13_000, // 10 ATK x 1.3
      hpAfter: 287,
      crit: false,
    });
    const burn = d.ofType("StatusApplied").find((s) => s.status === "burn");
    expect(burn).toMatchObject({ targetId: enemy(d).id, origin: "skill", skillId: "fireball" });
    expect(burn?.untilTick).toBe((impact?.tick as number) + K.FIREBALL_BURN_T);
    expect(d.view().enemies[0]?.statuses).toEqual([{ id: "burn", ticksLeft: 359, stacks: 1 }]);
    d.step(360);
    const dots = d.ofType("Hit").filter((h) => h.kind === "dot");
    expect(dots).toHaveLength(6); // once per second
    for (const h of dots)
      expect(h).toMatchObject({
        origin: "skill",
        skillId: "fireball",
        damageM: 500,
        damageType: null,
      });
    expect(d.ofType("StatusEnded").some((s) => s.status === "burn")).toBe(true);
    expect(enemy(d).hpM).toBe(300_000 - 13_000 - 6 * 500); // 284 HP
    expect(d.state.run.stats.damageByOriginM.skill).toBe(16_000); // burn is attributed to the skill
    expect(d.state.run.stats.damageBySkillM.fireball).toBe(16_000);
    expect(d.state.run.stats.damageByOriginM.weapon).toBe(0);
    expect(d.state.run.stats.skillsCast).toBe(1);
  });

  test("Fireball on a fire-weak enemy is x1.3 (13 x 1.3 = 16.9) and a burning target that dies ends its burn", () => {
    const bat = { ...PLAIN, id: "firebat", weaknesses: ["fire" as const] };
    const d = drive(
      lvl(["firebat"], { enemies: { ...ENEMY_SET, firebat: bat } }),
      kit(["fireball", null]),
      { difficulty: "zen" },
    );
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    expect(d.ofType("Hit")[0]).toMatchObject({ weak: true, damageM: 16_900 });
    enemy(d).hpM = 400; // the next burn tick kills
    d.step(60);
    const last = d.ofType("Hit").at(-1);
    expect(last).toMatchObject({ kind: "dot", killed: true });
    expect(d.ofType("StatusEnded").some((s) => s.status === "burn")).toBe(true);
    expect(enemy(d).dots).toEqual([]);
  });

  test("Aegis: casts as a guard word appears and grants AEGIS_BARRIER_HITS (1 since T6.1) barrier hit that absorbs the next attack", () => {
    const d = drive(lvl(["plain"]), kit(["aegis", null]));
    const e = enemy(d);
    arm(d, e, 300);
    prime(d, 0);
    d.step(100);
    expect(d.ofType("SkillCast")).toHaveLength(0); // no telegraph yet: smart waits
    d.until("GuardWordShown");
    expect(d.ofType("SkillCast")).toHaveLength(1); // same tick as the windup
    d.step(SKILL_IMPACT);
    expect(K.AEGIS_BARRIER_HITS).toBe(1);
    expect(d.ofType("StatusApplied").find((s) => s.status === "barrier")).toMatchObject({
      targetId: 0,
      stacks: 1,
      skillId: "aegis",
    });
    expect(d.view().hero.barrierCharges).toBe(1);
    d.until("EnemyAttack");
    expect(d.ofType("EnemyAttack")[0]).toMatchObject({ outcome: "barrier", damage: 0 });
    expect(d.state.run.heroHpM).toBe(100_000);
    expect(d.state.run.barrier).toBe(0);
    expect(d.ofType("StatusEnded").some((s) => s.status === "barrier" && s.targetId === 0)).toBe(
      true,
    );
  });

  test("Aegis never stacks past the barrier cap", () => {
    const d = drive(
      lvl(["plain"]),
      kit(["aegis", null], [null, null, null], "sword", ["asap", "smart"]),
      {
        difficulty: "zen",
      },
    );
    d.state.run.barrier = K.BARRIER_CAP - 1;
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    expect(d.state.run.barrier).toBe(K.BARRIER_CAP);
  });

  test("Slash Wave: waits for a crowd, then hits every enemy for 0.9 x ATK", () => {
    const solo = drive(lvl(["plain"]), kit(["slashWave", null]), { difficulty: "zen" });
    prime(solo, 0);
    solo.step(120);
    expect(solo.ofType("SkillCast")).toHaveLength(0); // one enemy: smart keeps waiting, the charge is kept
    expect(solo.view().skills[0]?.ready).toBe(true);

    const d = drive(lvl(["plain", "plain"]), kit(["slashWave", null]), { difficulty: "zen" });
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    const cast = d.ofType("SkillCast")[0] as EventOf<"SkillCast">;
    expect(cast.targetIds).toEqual([enemy(d, 0).id, enemy(d, 1).id]);
    const hits = d.ofType("Hit");
    expect(hits).toHaveLength(2);
    for (const [i, h] of hits.entries())
      expect(h).toMatchObject({
        kind: "skill",
        skillId: "slashWave",
        damageType: "slash",
        damageM: 9000, // 10 ATK x 0.9
        hpAfter: 141, // 150 - 9
        hitIndex: i,
        hitCount: 2,
      });
    expect(d.state.run.stats.damageBySkillM.slashWave).toBe(18_000);
  });

  test("Slash Wave in ASAP mode casts at a single enemy", () => {
    const d = drive(
      lvl(["plain"]),
      kit(["slashWave", null], [null, null, null], "sword", ["asap", "smart"]),
      { difficulty: "zen" },
    );
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    expect(d.ofType("Hit")[0]).toMatchObject({ skillId: "slashWave", damageM: 9000, hitCount: 1 });
  });

  test("Piercing Thrust: 1.5 x ATK to the focus and it cracks 2 shield points even without the weakness", () => {
    const d = drive(lvl(["shielded"]), kit(["piercingThrust", null]), { difficulty: "zen" });
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    expect(d.ofType("Hit")[0]).toMatchObject({
      kind: "skill",
      skillId: "piercingThrust",
      damageType: "pierce",
      weak: false, // slash is the weakness; pierce is not
      damageM: 15_000, // 10 ATK x 1.5
    });
    expect(d.ofType("ShieldDamaged")[0]).toMatchObject({ shield: 0, shieldMax: 2 });
    expect(d.ofType("Break")).toHaveLength(1); // one thrust empties a 2-point shield
    expect(d.ofType("WeaknessRevealed")).toHaveLength(0);
  });

  test("Mending Light: smart casts below 60% HP and heals 25% of max HP", () => {
    const d = drive(lvl(["plain"]), kit(["mendingLight", null]), { difficulty: "zen" });
    d.state.run.heroHpM = 70_000;
    prime(d, 0);
    d.step(60);
    expect(d.ofType("SkillCast")).toHaveLength(0); // 70% is not hurt enough
    d.state.run.heroHpM = 50_000;
    d.step(1 + SKILL_IMPACT);
    expect(d.ofType("HeroHealed")[0]).toMatchObject({ cause: "skill", amount: 25, hpAfter: 75 });
    expect(d.state.run.heroHpM).toBe(75_000);
  });

  test("Mending Light is capped at max HP, and ASAP mode casts as soon as the hero is hurt at all", () => {
    const d = drive(
      lvl(["plain"]),
      kit(["mendingLight", null], [null, null, null], "sword", ["asap", "smart"]),
      { difficulty: "zen" },
    );
    d.state.run.heroHpM = 90_000;
    prime(d, 0);
    d.step(1 + SKILL_IMPACT);
    expect(d.ofType("HeroHealed")[0]).toMatchObject({ amount: 10, hpAfter: 100 });
  });

  test("Frost Lock: casts as an attack winds up and holds every enemy's gauge for 4 s", () => {
    const d = drive(lvl(["plain"]), kit(["frostLock", null]));
    const e = enemy(d);
    arm(d, e, 300);
    const planned = e.nextImpact as number;
    prime(d, 0);
    d.until("GuardWordShown");
    const cast = d.ofType("SkillCast")[0] as EventOf<"SkillCast">;
    expect(cast).toMatchObject({ skillId: "frostLock", targetIds: [e.id] });
    d.step(SKILL_IMPACT);
    const freeze = d.ofType("StatusApplied").find((s) => s.status === "freeze");
    expect(freeze).toMatchObject({ targetId: e.id, skillId: "frostLock" });
    expect(freeze?.untilTick).toBe(cast.impactTick + 240);
    expect(d.view().enemies[0]?.statuses[0]).toMatchObject({ id: "freeze" });
    const attack = d.until("EnemyAttack");
    expect(attack.tick).toBe(planned + 240); // delayed by exactly 240 ticks
    expect(d.ofType("StatusEnded").some((s) => s.status === "freeze")).toBe(true);
    expect(e.frozenUntil).toBeNull();
  });

  test("Frost Lock holds a shown guard word's deadline too (the plate's timer strip moves with it)", () => {
    const d = drive(lvl(["plain"]), kit(["frostLock", null]));
    const e = enemy(d);
    arm(d, e, 300);
    prime(d, 0);
    d.until("GuardWordShown");
    const before = d.plates().find((p) => p.kind === "guard")?.expiresAtTick as number;
    d.step(SKILL_IMPACT + 240 - 1);
    const after = d.plates().find((p) => p.kind === "guard")?.expiresAtTick as number;
    expect(after).toBe(before + 239); // one shift per tick since the freeze landed
  });
});

describe("passives", () => {
  test("Clean Cut: +10% crit chance on the next auto-attack after a perfect word, and PassiveTriggered", () => {
    const d = drive(lvl(["plain"]), kit([null, null], ["cleanCut", null, null]), {
      difficulty: "zen",
    });
    expect(critChanceBp(enc(d), d.state.run)).toBe(500); // nothing typed: BASE_CRIT only
    word(d);
    // 5% + 15% x (1 perfect / 1 word) + 10% Clean Cut
    expect(critChanceBp(enc(d), d.state.run)).toBe(500 + 1500 + 1000);
    const plain = drive(lvl(["plain"]), kit([null, null]), { difficulty: "zen" });
    word(plain);
    expect(critChanceBp(enc(plain), plain.state.run)).toBe(500 + 1500);
    // an imperfect last word switches it off again
    enc(d).atbM = 0; // keep the gauge from filling (an attack would reset the crit counters)
    sloppyWord(d);
    expect(d.state.run.lastWordPerfect).toBe(false);
    expect(critChanceBp(enc(d), d.state.run)).toBe(500 + 750); // 1 perfect of 2 words
    // the trigger event rides with the auto-attack
    enc(d).atbM = 0;
    word(d); // a perfect word again
    expect(d.state.run.lastWordPerfect).toBe(true);
    enc(d).atbM = 99_000;
    const ev = word(d); // its first char fills the gauge: the attack launches with the bonus
    const atk = d.ofType("AutoAttack", ev)[0];
    expect(atk).toBeDefined();
    expect(passives(d, ev).filter((p) => p.passiveId === "cleanCut")).toHaveLength(1);
  });

  test("Steady Hands: the first typo of the encounter does not crack the combo; the second does", () => {
    const d = drive(lvl(["plain"]), kit([null, null], [null, "steadyHands", null]), {
      difficulty: "zen",
      comboMode: "gentle",
    });
    d.state.run.combo = 8;
    const ev1 = sloppyWord(d);
    expect(d.ofType("Typo", ev1)[0]).toMatchObject({
      penalty: "forgiven",
      comboBefore: 8,
      combo: 8,
    });
    expect(passives(d, ev1)[0]).toMatchObject({ passiveId: "steadyHands" });
    expect(d.state.run.combo).toBe(8); // the imperfect completion leaves it unchanged
    const ev2 = sloppyWord(d);
    expect(d.ofType("Typo", ev2)[0]).toMatchObject({ penalty: "halved", comboBefore: 8, combo: 4 });
    expect(passives(d, ev2)).toHaveLength(0);
    expect(enc(d).steadyLeft).toBe(0);
  });

  test("Steady Hands in strict mode also forgives the -5 ATB", () => {
    const d = drive(lvl(["plain"]), kit([null, null], ["steadyHands", null, null]), {
      difficulty: "zen",
      comboMode: "strict",
    });
    enc(d).atbM = 20_000;
    const text = d.plates()[0]?.text ?? "";
    d.key(text.charAt(0)); // +8 ATB -> 28
    d.key("1");
    expect(enc(d).atbM).toBe(28_000);
  });

  test("Iron Will: a block takes 0.15 x the hit (0.75 of 5, T6.1) and fires PassiveTriggered", () => {
    const d = drive(lvl(["plain"]), kit([null, null], [null, null, "ironWill"]));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.key(g.text.charAt(0));
    d.key("1"); // typo -> block
    d.step();
    d.type(g.text.slice(1));
    d.until("EnemyAttack");
    // the event shows a display integer (0.75 rounds up to 1); the HP below is exact
    expect(d.ofType("EnemyAttack")[0]).toMatchObject({ outcome: "blocked", damage: 1 });
    expect(d.state.run.heroHpM).toBe(100_000 - 750);
    expect(passives(d)).toEqual([
      { type: "PassiveTriggered", tick: expect.any(Number), passiveId: "ironWill", targetId: e.id },
    ]);
  });

  test("Riposte: a perfect parry counters for 150% ATK (15) and fires PassiveTriggered", () => {
    const d = drive(lvl(["plain"]), kit([null, null], ["riposte", null, null]));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    d.until("EnemyAttack");
    const counter = d.ofType("Hit").find((h) => h.kind === "counter");
    expect(counter).toMatchObject({ origin: "counter", damageM: 15_000 });
    expect(passives(d)[0]).toMatchObject({ passiveId: "riposte", targetId: e.id });
  });

  test("Opening Gambit: every encounter starts with the ATB gauge at 50", () => {
    const d = new Driver(
      lvl(["plain"]),
      11,
      { difficulty: "zen" },
      kit([null, null], [null, null, null]),
    );
    d.toCombat();
    expect(passives(d)).toHaveLength(0);
    expect(enc(d).atbM).toBe(0);
    const g = new Driver(
      lvl(["plain"]),
      11,
      { difficulty: "zen" },
      kit([null, null], ["openingGambit", null, null]),
    ).toCombat();
    expect(enc(g).atbM).toBe(50_000);
    expect(g.view().hero.atbFrac).toBe(0.5);
    expect(passives(g)).toEqual([
      { type: "PassiveTriggered", tick: 0, passiveId: "openingGambit", targetId: null },
    ]);
  });

  test("Bulwark Streak: reaching combo 10 (and 20) conjures a one-hit barrier; 11 does not", () => {
    const d = drive(lvl(["plain"]), kit([null, null], ["bulwarkStreak", null, null]), {
      difficulty: "zen",
    });
    d.state.run.combo = 8;
    const ev = word(d);
    expect(d.state.run.combo).toBe(9);
    expect(d.state.run.barrier).toBe(0);
    const ev2 = word(d);
    expect(d.state.run.combo).toBe(10);
    expect(d.state.run.barrier).toBe(1);
    expect(d.ofType("StatusApplied", ev2).find((s) => s.status === "barrier")).toMatchObject({
      stacks: 1,
      skillId: null,
    });
    expect(passives(d, ev)).toHaveLength(0);
    expect(passives(d, ev2)[0]).toMatchObject({ passiveId: "bulwarkStreak" });
    word(d); // combo 11
    expect(d.state.run.barrier).toBe(1);
    d.state.run.combo = 19;
    word(d);
    expect(d.state.run.barrier).toBe(2);
  });

  test("Last Stand: below 30% HP every ATB point is x1.4 (8 -> 11.2 per char); once per low-HP spell", () => {
    const d = drive(lvl(["plain"]), kit([null, null], [null, null, "lastStand"]), {
      difficulty: "zen",
    });
    d.state.run.heroHpM = 30_000; // exactly 30% is not below
    const text = d.plates()[0]?.text ?? "";
    let ev = d.key(text.charAt(0));
    expect(d.ofType("CharCorrect", ev)[0]?.atbGainM).toBe(8000);
    d.state.run.heroHpM = 29_000;
    ev = d.key(text.charAt(1));
    expect(d.ofType("CharCorrect", ev)[0]?.atbGainM).toBe(11_200); // 8 x 1.4
    ev = d.key(text.charAt(2));
    expect(d.ofType("CharCorrect", ev)[0]?.atbGainM).toBe(11_200);
    expect(passives(d)).toHaveLength(1);
    d.state.run.heroHpM = 80_000; // healed: the edge re-arms
    d.key(text.charAt(3) || "x");
    d.state.run.heroHpM = 10_000;
    d.type(d.plates()[0]?.text ?? "");
    expect(passives(d).length).toBeGreaterThanOrEqual(2);
  });

  test("Comeback: after a typo cracks the combo, the next perfect word wins back half of what was lost", () => {
    const d = drive(lvl(["plain"]), kit([null, null], [null, null, "comeback"]), {
      difficulty: "zen",
      comboMode: "gentle",
    });
    d.state.run.combo = 8;
    sloppyWord(d); // gentle: 8 -> 4 (lost 4); the imperfect completion adds nothing
    expect(d.state.run.combo).toBe(4);
    expect(d.state.run.comebackLost).toBe(4);
    const ev = word(d);
    // 4 + 1 (perfect word) + 2 (half of 4 lost)
    expect(d.ofType("WordCompleted", ev)[0]?.combo).toBe(7);
    expect(d.state.run.combo).toBe(7);
    expect(passives(d, ev)[0]).toMatchObject({ passiveId: "comeback" });
    word(d);
    expect(d.state.run.combo).toBe(8); // only once
  });
});

describe("weapon archetype signatures", () => {
  test("Hammer: a surviving hit knocks the target's attack timer back 30% of an interval", () => {
    const d = drive(lvl(["plain"]), mkLoadoutOf("hammer"));
    const e = enemy(d);
    arm(d, e, 800);
    const planned = e.nextImpact as number;
    expect(e.intervalTicks).toBe(540);
    queueAuto(d);
    d.step(2);
    const h = d.ofType("Hit")[0];
    expect(h).toMatchObject({ kind: "auto", damageM: 22_000, atbKnockback: true }); // 10 ATK x 2.2
    expect(e.nextImpact).toBe(planned + 162); // floor(540 x 0.3)
    expect(d.view().enemies[0]?.atbFrac).toBeLessThan(0.01);
  });

  test("Hammer: no knockback once the guard word is shown, on a killing blow, or for other weapons", () => {
    const d = drive(lvl(["plain"]), mkLoadoutOf("hammer"));
    const e = enemy(d);
    arm(d, e, 200);
    d.until("GuardWordShown");
    const planned = e.nextImpact as number;
    queueAuto(d);
    d.step(2);
    expect(d.ofType("Hit")[0]?.atbKnockback).toBe(false);
    expect(e.nextImpact).toBe(planned);

    const k = drive(lvl(["plain"]), mkLoadoutOf("hammer"));
    enemy(k).hpM = 5000;
    queueAuto(k);
    k.step(2);
    expect(k.ofType("Hit")[0]).toMatchObject({ killed: true, atbKnockback: false });

    const s = drive(lvl(["plain"]), mkLoadoutOf("sword"));
    const se = enemy(s);
    arm(s, se, 800);
    const sp = se.nextImpact as number;
    queueAuto(s);
    s.step(2);
    expect(s.ofType("Hit")[0]?.atbKnockback).toBe(false);
    expect(se.nextImpact).toBe(sp);
  });

  test("Dagger: every 3rd attack makes the target bleed 0.1 x ATK per second for 4 s, tagged origin weapon", () => {
    const d = drive(lvl(["plain"]), mkLoadoutOf("dagger"), { difficulty: "zen" });
    for (let i = 0; i < 2; i++) {
      queueAuto(d);
      d.step(2);
    }
    expect(d.ofType("StatusApplied")).toHaveLength(0);
    queueAuto(d);
    d.step(2);
    const bleed = d.ofType("StatusApplied")[0];
    expect(bleed).toMatchObject({
      status: "bleed",
      origin: "weapon",
      skillId: null,
      targetId: enemy(d).id,
    });
    d.step(240);
    const dots = d.ofType("Hit").filter((h) => h.kind === "dot");
    expect(dots).toHaveLength(4);
    for (const h of dots)
      expect(h).toMatchObject({ origin: "weapon", skillId: null, damageM: 1000 });
    expect(d.ofType("StatusEnded").some((s) => s.status === "bleed")).toBe(true);
    // 3 attacks x 2 hits x 4.5 = 27, plus 4 bleed ticks of 1: all weapon origin, none skill
    expect(d.state.run.stats.damageByOriginM.weapon).toBe(27_000 + 4000);
    expect(d.state.run.stats.damageByOriginM.skill).toBe(0);
    expect(enemy(d).hpM).toBe(300_000 - 31_000);
    // the 4th attack does not bleed again; the 6th does
    for (let i = 0; i < 3; i++) {
      queueAuto(d);
      d.step(2);
    }
    expect(d.ofType("StatusApplied")).toHaveLength(2);
  });

  test("Sword: a perfect parry adds +1 combo on top of the perfect word (Staff x1.5 charge: see skill charge)", () => {
    const d = drive(lvl(["plain"]), mkLoadoutOf("sword"));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    expect(d.state.run.combo).toBe(2);
  });
});

describe("TutorialCue (L1-1)", () => {
  test("target, atb, combo, skill and guard fire once each, in the moment they apply", () => {
    const d = new Driver(
      lvl(["plain"]),
      5,
      { tutorial: true },
      kit(["fireball", "aegis"], [null, null, null]),
    ).toCombat();
    const cues = (): string[] => d.ofType("TutorialCue").map((c) => c.cue);
    expect(cues()).toEqual(["target"]); // typing is live
    d.state.run.combo = 4;
    word(d); // first char pays ATB, the perfect word reaches combo 5, then the skills charge
    expect(cues()).toEqual(["target", "atb", "combo", "skill"]);
    word(d);
    word(d);
    d.until("GuardWordShown"); // the tutorial hold lifts after 3 words
    word(d);
    expect(cues()).toEqual(["target", "atb", "combo", "skill", "guard"]);
  });

  test("no cues without options.tutorial", () => {
    const d = drive(lvl(["plain"]), kit(["fireball", null]), { difficulty: "zen" });
    word(d);
    expect(d.ofType("TutorialCue")).toHaveLength(0);
  });
});

function mkLoadoutOf(a: "sword" | "dagger" | "staff" | "hammer"): Loadout {
  return mkLoadout(a);
}

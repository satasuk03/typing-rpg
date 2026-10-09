// T1.3 combat: damage chain, chips, auto-attack, crit, enemy impacts (block/parry), shields/weakness/BREAK, HP carry-over,
// walk heal, Second Wind, revive hook, phase-gate clamp. Rules: docs/interfaces.md §3.3, doc 01 §1.3-1.8.
import { describe, expect, test } from "vitest";
import { critChanceBp, launchAutoAttack } from "../src/attack.ts";
import { K } from "../src/balance.ts";
import { resolveDamage } from "../src/combat.ts";
import { scheduleAttack } from "../src/guard.ts";
import {
  applyInput,
  chance,
  deriveRng,
  type EventOf,
  type ResolvedEnemy,
  type ResolvedLevel,
  type SimEvent,
  step,
} from "../src/index.ts";
import type { EnemyState } from "../src/state.ts";
import {
  BOSS,
  Driver,
  ENEMIES,
  mkDef,
  mkLoadout,
  type mkOptions,
  mkSimpleDef,
} from "./typingHarness.ts";

const PLAIN: ResolvedEnemy = {
  ...(ENEMIES.slime as ResolvedEnemy),
  id: "plain",
  weaknesses: [],
  shield: 0,
};
const SHIELDED: ResolvedEnemy = {
  ...(ENEMIES.slime as ResolvedEnemy),
  id: "shielded",
  weaknesses: ["slash"],
  shield: 2,
};
const WEAKNOSHIELD: ResolvedEnemy = { ...PLAIN, id: "weak", weaknesses: ["slash"] };
const ENEMY_SET = { ...ENEMIES, plain: PLAIN, shielded: SHIELDED, weak: WEAKNOSHIELD };

/** One-encounter level; hero 100 HP / 10 ATK (T1 C+0), enemy hit 5 HP. */
function lvl(
  ids: string[],
  over: Partial<ResolvedLevel> = {},
  hp = { poolM: 300_000, hitM: 5000 },
  pool: string[] = ["apple", "bird", "cat", "door"],
): ResolvedLevel {
  return mkSimpleDef(ids, { current: pool }, { enemies: ENEMY_SET, ...over }, 1, hp);
}
const drive = (
  def: ResolvedLevel,
  opts: Parameters<typeof mkOptions>[0] = {},
  loadout = mkLoadout(),
): Driver => new Driver(def, 11, opts, loadout).toCombat();

const enemy = (d: Driver, i = 0): EnemyState => {
  const e = d.state.enc?.enemies[i];
  if (e === undefined) throw new Error("no enemy");
  return e;
};
/** Schedules an enemy attack `inTicks` from now (the guard word shows guardTicks before it). */
const arm = (d: Driver, e: EnemyState, inTicks: number): void => {
  e.cycleStart = d.state.tick;
  scheduleAttack(d.state, e, d.state.tick + inTicks);
};
/** Types the first plate's word, perfectly. */
const word = (d: Driver): SimEvent[] => d.type(d.plates()[0]?.text ?? "");
const hit = (d: Driver, from?: readonly SimEvent[]) => d.ofType("Hit", from);
const queueAuto = (d: Driver, crit: boolean, inTicks = 1): void => {
  const enc = d.state.enc;
  if (enc === null) throw new Error("no enc");
  const target = enc.enemies.find((e) => e.alive);
  if (target === undefined) throw new Error("no target");
  enc.pending.push({ tick: d.state.tick + inTicks, kind: "auto", targetId: target.id, crit });
};

describe("damage chain (interfaces §3.3, normative order, floor at every mulBp step)", () => {
  const spec = (baseM: number, crit = false) => ({
    kind: "auto" as const,
    origin: "weapon" as const,
    skillId: null,
    damageType: "slash" as const,
    baseM,
    crit,
    hitIndex: 0,
    hitCount: 1,
  });

  test("crit x1.5, weak x1.3, broken x1.8, staggered x1.5 apply in that order with a floor each", () => {
    const d = drive(lvl(["weak"]));
    const e = enemy(d);
    // baseM 7: crit 10 (10.5), weak 13 (13.0), broken 23 (23.4), staggered 34 (34.5); a single combined x5.265 would give 36
    expect(resolveDamage(d.state, e, spec(7, true)).dmgM).toBe(13);
    e.brokenUntil = d.state.tick + 100;
    expect(resolveDamage(d.state, e, spec(7, true)).dmgM).toBe(23);
    e.staggerUntil = d.state.tick + 100;
    expect(resolveDamage(d.state, e, spec(7, true)).dmgM).toBe(34);
    expect(resolveDamage(d.state, e, spec(10_000, false))).toMatchObject({
      dmgM: 10_000 * 1.3 * 1.8 * 1.5,
    }); // 35_100 x 1.5
  });

  test("clean multiples: 10 ATK sword hit = 10; crit 15; crit+weak 19.5; +broken 35.1", () => {
    const d = drive(lvl(["weak"]));
    const e = enemy(d);
    expect(resolveDamage(d.state, e, spec(10_000)).dmgM).toBe(13_000);
    expect(resolveDamage(d.state, e, spec(10_000, true)).dmgM).toBe(19_500);
    e.brokenUntil = d.state.tick + 100;
    expect(resolveDamage(d.state, e, spec(10_000, true)).dmgM).toBe(35_100);
  });

  test("damage is at least 1 milli, and never exceeds the HP above a phase gate", () => {
    const d = drive(lvl(["plain"]));
    const e = enemy(d);
    expect(resolveDamage(d.state, e, spec(0)).dmgM).toBe(1);
    e.gateHpM = e.hpM - 500;
    expect(resolveDamage(d.state, e, spec(10_000)).dmgM).toBe(500);
    e.hpM = e.gateHpM;
    expect(resolveDamage(d.state, e, spec(10_000)).dmgM).toBe(0);
  });

  test("an untyped hit (chip) is never weak", () => {
    const d = drive(lvl(["weak"]));
    expect(
      resolveDamage(d.state, enemy(d), {
        ...spec(10_000),
        damageType: null,
        kind: "chip",
        origin: "chip",
      }),
    ).toMatchObject({ weak: false, dmgM: 10_000 });
  });
});

describe("Word Strike chips (doc 01 §1.3)", () => {
  test("a perfect word chips 25% ATK, an imperfect one 15%; origin chip, untyped", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    const a = word(d);
    expect(hit(d, a)[0]).toMatchObject({
      kind: "chip",
      origin: "chip",
      damageType: null,
      damageM: 2500,
      weak: false,
      crit: false,
      killed: false,
    });
    const t = d.plates()[0]?.text ?? "";
    d.key(t.charAt(0));
    d.step();
    d.key("1"); // typo: imperfect word
    d.step();
    const b = d.type(t.slice(1));
    expect(hit(d, b)[0]?.damageM).toBe(1500);
  });

  test("chips never remove shield points, even on a weak enemy", () => {
    const d = drive(lvl(["shielded"]), { difficulty: "zen" });
    for (let i = 0; i < 4; i++) d.type(d.plates()[0]?.text ?? "");
    expect(enemy(d).shield).toBe(2);
    expect(d.ofType("ShieldDamaged")).toHaveLength(0);
  });

  test("ruling: a completed guard plate also chips, after the typed block/parry outcome", () => {
    const d = drive(lvl(["plain"]));
    arm(d, enemy(d), 300);
    const shown = d.until("GuardWordShown");
    const ev = d.type(shown.text);
    const seq = ev
      .map((e) => e.type)
      .filter(
        (t) =>
          ![
            "CharCorrect",
            "TargetAcquired",
            "KeyStreakTierChanged",
            "BurstWpm",
            "ComboTierChanged",
          ].includes(t),
      );
    expect(seq.slice(0, 4)).toEqual(["WordCompleted", "GuardWordTyped", "PlateRemoved", "Hit"]);
    expect(hit(d, ev)[0]).toMatchObject({ kind: "chip", damageM: 2500 });
    expect(d.ofType("GuardWordTyped", ev)[0]?.result).toBe("parry");
    expect(seq.at(-1)).toBe("PlateShown"); // the fresh word plate comes last
  });
});

describe("auto-attack (doc 01 §2, interfaces §3.3 D10 / D12)", () => {
  test("a full gauge emits AtbFilled, then AutoAttack, and the Hit lands ATTACK_IMPACT_T ticks later", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    let atk: EventOf<"AutoAttack"> | undefined;
    for (let i = 0; i < 12 && atk === undefined; i++) {
      const ev = d.type(d.plates()[0]?.text ?? "");
      atk = d.ofType("AutoAttack", ev)[0];
      if (atk !== undefined) {
        const types = ev.map((e) => e.type);
        expect(types.indexOf("AtbFilled")).toBeLessThan(types.indexOf("AutoAttack"));
      }
    }
    if (atk === undefined) throw new Error("no auto-attack");
    expect(atk.impactTick - (d.state.tick - 1)).toBeLessThanOrEqual(K.ATTACK_IMPACT_T);
    expect(atk).toMatchObject({ archetype: "sword", hits: 1 });
    const hitsBefore = hit(d).filter((h) => h.kind === "auto").length;
    expect(hitsBefore).toBe(0);
    while (d.state.tick <= atk.impactTick) d.step();
    const h = hit(d).find((x) => x.kind === "auto");
    expect(h).toMatchObject({ origin: "weapon", damageType: "slash", hitIndex: 0, hitCount: 1 });
    expect(h?.tick).toBe(atk.impactTick);
    expect(d.state.run.stats.autoAttacks).toBe(1);
  });

  test("weapon archetypes: sword 1 x 1.0, dagger 2 x 0.45, staff 1 x 0.8, hammer 1 x 2.2 of ATK", () => {
    const want: Record<string, { hits: number; each: number; type: string }> = {
      sword: { hits: 1, each: 10_000, type: "slash" },
      dagger: { hits: 2, each: 4500, type: "pierce" },
      staff: { hits: 1, each: 8000, type: "arcane" },
      hammer: { hits: 1, each: 22_000, type: "blunt" },
    };
    for (const arch of ["sword", "dagger", "staff", "hammer"] as const) {
      const d = drive(lvl(["plain"]), { difficulty: "zen" }, mkLoadout(arch));
      queueAuto(d, false);
      const ev = d.step(2);
      const hs = hit(d, ev).filter((h) => h.kind === "auto");
      const w = want[arch] as { hits: number; each: number; type: string };
      expect(hs).toHaveLength(w.hits);
      for (const [i, h] of hs.entries()) {
        expect(h).toMatchObject({
          damageM: w.each,
          damageType: w.type,
          hitIndex: i,
          hitCount: w.hits,
        });
      }
    }
  });

  test("a crit multiplies every hit of the attack by 1.5", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" }, mkLoadout("dagger"));
    queueAuto(d, true);
    const hs = hit(d, d.step(2));
    expect(hs.map((h) => [h.damageM, h.crit])).toEqual([
      [6750, true],
      [6750, true],
    ]);
  });

  test("the auto-attack re-aims at the focus when its target died before the impact", () => {
    const d = drive(lvl(["plain", "plain"]), { difficulty: "zen" });
    const [a, b] = [enemy(d, 0), enemy(d, 1)];
    queueAuto(d, false, 3);
    const pend = d.state.enc?.pending[0];
    if (pend === undefined) throw new Error("setup");
    pend.targetId = a.id;
    a.hpM = 0;
    a.alive = false;
    d.state.enc!.focusEnemyId = b.id;
    const hs = hit(d, d.step(4));
    expect(hs[0]?.targetId).toBe(b.id);
  });

  test("the attack whiffs (no Hit) when no enemy is left alive", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    queueAuto(d, false, 2);
    const e = enemy(d);
    e.alive = false;
    e.hpM = 0;
    expect(hit(d, d.step(3))).toHaveLength(0);
  });

  test("overflow carries over (cap 30) and a second attack can follow", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    d.state.enc!.atbM = 95_000;
    const ev = word(d);
    const filled = d.ofType("AtbFilled", ev)[0];
    expect(filled?.overflowM).toBeLessThanOrEqual(K.ATB_OVERFLOW_CAP_M);
    expect(d.ofType("AutoAttack", ev)).toHaveLength(1);
  });
});

describe("crit chance (D10)", () => {
  const enc = (words: number, perfect: number) =>
    ({ critWords: words, critPerfect: perfect }) as never;
  test("BASE_CRIT 5% with no words since the last attack", () => {
    expect(critChanceBp(enc(0, 0))).toBe(500);
  });
  test("5% + 15% x perfect share: 0/4 -> 5%, 3/4 -> 16.25%, 4/4 -> 20%", () => {
    expect(critChanceBp(enc(4, 0))).toBe(500);
    expect(critChanceBp(enc(4, 3))).toBe(500 + 1125);
    expect(critChanceBp(enc(4, 4))).toBe(2000);
    expect(critChanceBp(enc(3, 1))).toBe(500 + 500); // floor(1500 / 3) = 500
  });
  test("counters reset at each attack and are counted before the word's own ATB can fill the gauge", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    word(d); // ~62 ATB: no attack yet
    expect(d.state.enc).toMatchObject({ critWords: 1, critPerfect: 1 });
    (d.state.enc as NonNullable<typeof d.state.enc>).atbM = 99_000;
    word(d); // this word's chars fill the gauge mid-word; the attack launches with the words done so far
    expect(d.ofType("AutoAttack")).toHaveLength(1);
    expect(d.state.enc).toMatchObject({ critWords: 1, critPerfect: 1 }); // reset at the launch, then this word counted
    (d.state.enc as NonNullable<typeof d.state.enc>).atbM = 0;
  });
  test("the crit roll always draws exactly one value from the combat stream, even with nothing to hit", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    const e = d.state.enc as NonNullable<typeof d.state.enc>;
    const mirror = deriveRng(11, "combat", 0);
    expect(e.combatRng).toEqual(mirror);
    launchAutoAttack(d.state, () => {});
    chance(mirror, 500);
    expect(e.combatRng).toEqual(mirror);
    (e.enemies[0] as EnemyState).alive = false; // no target: the roll still draws, no AutoAttack
    const out: SimEvent[] = [];
    launchAutoAttack(d.state, (x) => out.push(x));
    chance(mirror, 500);
    expect(out).toEqual([]);
    expect(e.combatRng).toEqual(mirror);
  });
});

describe("enemy attacks (doc 01 §1.6-1.7)", () => {
  const impact = (d: Driver, e: EnemyState) => {
    const at = e.nextImpact ?? 0;
    while (d.state.tick <= at) d.step();
  };

  test("ignored: full damage to the hero, then the plate reverts to a normal word", () => {
    const d = drive(lvl(["plain"]));
    const e = enemy(d);
    arm(d, e, 200);
    d.until("GuardWordShown");
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    expect(d.ofType("EnemyAttack", ev)[0]).toMatchObject({ outcome: "hit", damage: 5 });
    expect(d.ofType("HeroDamaged", ev)[0]).toMatchObject({
      cause: "attack",
      damage: 5,
      hpAfter: 95,
      blocked: false,
    });
    expect(d.state.run.heroHpM).toBe(95_000);
    expect(d.state.run.stats.hitsTaken).toBe(1);
    expect(d.plates()[0]?.kind).toBe("word");
  });

  test("block (imperfect guard word): damage x0.2", () => {
    const d = drive(lvl(["plain"]));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.key(g.text.charAt(0));
    d.key("1"); // typo -> block
    d.step();
    d.type(g.text.slice(1));
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    expect(d.ofType("EnemyAttack", ev)[0]).toMatchObject({ outcome: "blocked", damage: 1 });
    expect(d.ofType("GuardBlocked", ev)[0]?.damage).toBe(1);
    expect(d.ofType("HeroDamaged", ev)[0]).toMatchObject({ blocked: true });
    expect(d.state.run.heroHpM).toBe(100_000 - 1000);
    expect(d.state.run.stats.blocks).toBe(1);
  });

  test("perfect parry: 0 damage, counter Hit 50% ATK after GuardParried, +10 ATB", () => {
    const d = drive(lvl(["plain"]));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    const atb = d.state.enc!.atbM;
    const hpBefore = e.hpM;
    const from = d.all.length;
    impact(d, e);
    const ev = d.all.slice(from);
    const order = ev
      .map((x) => x.type)
      .filter((t) => ["EnemyAttack", "GuardParried", "Hit", "HeroDamaged"].includes(t));
    expect(order.slice(0, 3)).toEqual(["EnemyAttack", "GuardParried", "Hit"]);
    expect(d.ofType("EnemyAttack", ev)[0]).toMatchObject({ outcome: "parried", damage: 0 });
    expect(d.ofType("GuardParried", ev)[0]?.counterDamage).toBe(5);
    expect(hit(d, ev)[0]).toMatchObject({
      kind: "counter",
      origin: "counter",
      damageM: 5000,
      damageType: "slash",
    });
    expect(e.hpM).toBe(hpBefore - 5000);
    expect(d.ofType("HeroDamaged", ev)).toHaveLength(0);
    expect(d.state.run.heroHpM).toBe(100_000);
    expect(d.state.enc!.atbM - atb).toBe(K.PARRY_ATB_M);
    expect(d.state.run.stats.perfectParries).toBe(1);
  });

  test("a counter on a weak enemy is x1.3 and chips the shield", () => {
    const d = drive(lvl(["shielded"]));
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    impact(d, e);
    expect(hit(d).find((h) => h.kind === "counter")).toMatchObject({ damageM: 6500, weak: true });
    expect(e.shield).toBe(1);
  });

  test("the next attack is a full interval later; interval = base x PACE_FACTOR (pace 70 -> x0.6156)", () => {
    for (const [pace, mult] of [
      [35, 10_000],
      [70, 6156],
    ] as const) {
      const d = drive(lvl(["plain"]), {}, mkLoadout());
      const dd = new Driver(lvl(["plain"]), 3, { pace }).toCombat();
      void d;
      const e = enemy(dd);
      expect(e.intervalTicks).toBe(Math.floor((540 * mult) / 10_000));
    }
  });

  test("zen: enemies never attack", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    d.step(3000);
    expect(d.ofType("EnemyAttack")).toHaveLength(0);
    expect(d.state.run.heroHpM).toBe(100_000);
  });

  test("a barrier absorbs one unparried hit", () => {
    const d = drive(lvl(["plain"]));
    d.state.run.barrier = 1;
    const e = enemy(d);
    arm(d, e, 200);
    impact(d, e);
    expect(d.ofType("EnemyAttack")[0]).toMatchObject({ outcome: "barrier", damage: 0 });
    expect(d.state.run.heroHpM).toBe(100_000);
    expect(d.state.run.barrier).toBe(0);
  });

  test("Iron Will blocks to x0.1 and Riposte counters at 150%", () => {
    const lo = { ...mkLoadout(), passives: ["ironWill", "riposte", null] as never };
    const d = drive(lvl(["plain"]), {}, lo);
    const e = enemy(d);
    arm(d, e, 300);
    const g = d.until("GuardWordShown");
    d.type(g.text);
    impact(d, e);
    expect(hit(d).find((h) => h.kind === "counter")?.damageM).toBe(15_000);
    const d2 = drive(lvl(["plain"]), {}, lo);
    const e2 = enemy(d2);
    arm(d2, e2, 300);
    const g2 = d2.until("GuardWordShown");
    d2.key(g2.text.charAt(0));
    d2.key("1");
    d2.step();
    d2.type(g2.text.slice(1));
    impact(d2, e2);
    expect(d2.state.run.heroHpM).toBe(100_000 - 500);
  });

  test("tutorial: enemies hold their attacks until 3 words are typed", () => {
    const d = new Driver(lvl(["plain"]), 5, { tutorial: true }).toCombat();
    d.step(2000);
    expect(d.ofType("GuardWordShown")).toHaveLength(0);
    for (let i = 0; i < 3; i++) d.type(d.plates()[0]?.text ?? "");
    d.until("GuardWordShown");
  });
});

describe("weakness, shield and BREAK (D11)", () => {
  test("sequencing: reveal once, shield 2 -> 1 -> 0, Break x1.8, shield refills when it ends", () => {
    const d = drive(lvl(["shielded"]));
    const e = enemy(d);
    e.hpM = e.maxHpM = 400_000;
    arm(d, e, 400);
    queueAuto(d, false);
    const a = d.step(2);
    expect(a.map((x) => x.type)).toEqual(["Hit", "WeaknessRevealed", "ShieldDamaged"]);
    expect(hit(d, a)[0]).toMatchObject({ damageM: 13_000, weak: true, broken: false });
    expect(d.ofType("ShieldDamaged", a)[0]).toMatchObject({ shield: 1, shieldMax: 2 });
    queueAuto(d, false);
    const b = d.step(2);
    expect(b.map((x) => x.type)).toEqual(["Hit", "ShieldDamaged", "Break"]); // no second WeaknessRevealed
    expect(d.ofType("Break", b)[0]?.untilTick).toBe(d.state.tick - 1 + K.BREAK_T);
    expect(e.shield).toBe(0);
    expect(e.brokenUntil).not.toBeNull();
    // the Break cancelled the attack timer
    expect(e.nextImpact).toBeNull();
    expect(d.view().enemies[0]).toMatchObject({ pose: "broken", shield: 0 });
    // a hit during the Break: weak x1.3 x broken x1.8, no new shield damage
    queueAuto(d, false);
    const c = d.step(2);
    expect(hit(d, c)[0]).toMatchObject({ damageM: 23_400, weak: true, broken: true });
    expect(d.ofType("ShieldDamaged", c)).toHaveLength(0);
    d.step(K.BREAK_T);
    expect(d.ofType("BreakEnded")).toHaveLength(1);
    expect(e.shield).toBe(2);
    expect(e.brokenUntil).toBeNull();
    // the attack timer restarted from a full interval
    expect(e.nextImpact).not.toBeNull();
    expect((e.nextImpact ?? 0) - e.cycleStart).toBe(e.intervalTicks);
  });

  test("a crit removes 2 shield points: one hit breaks a 2-shield enemy", () => {
    const d = drive(lvl(["shielded"]));
    queueAuto(d, true);
    const ev = d.step(2);
    expect(d.ofType("ShieldDamaged", ev)[0]?.shield).toBe(0);
    expect(d.ofType("Break", ev)).toHaveLength(1);
  });

  test("a hit of another damage type does not touch the shield (and is not weak)", () => {
    const d = drive(lvl(["shielded"]), {}, mkLoadout("hammer")); // blunt vs weak:slash
    queueAuto(d, false);
    const ev = d.step(2);
    expect(hit(d, ev)[0]).toMatchObject({ weak: false, damageM: 22_000 });
    expect(d.ofType("ShieldDamaged", ev)).toHaveLength(0);
    expect(d.ofType("WeaknessRevealed", ev)).toHaveLength(0);
  });

  test("a weak enemy without shield takes x1.3 but never breaks", () => {
    const d = drive(lvl(["weak"]));
    queueAuto(d, true);
    const ev = d.step(2);
    expect(hit(d, ev)[0]).toMatchObject({ damageM: 19_500, weak: true });
    expect(d.ofType("WeaknessRevealed", ev)).toHaveLength(1);
    expect(d.ofType("ShieldDamaged", ev)).toHaveLength(0);
    expect(d.ofType("Break", ev)).toHaveLength(0);
  });

  test("Break cancels a shown guard word: the plate becomes a normal word and the impact never lands", () => {
    const d = drive(lvl(["shielded"]));
    const e = enemy(d);
    arm(d, e, 300);
    d.until("GuardWordShown");
    const guard = d.plates().find((p) => p.kind === "guard");
    d.key(guard?.text.charAt(0) ?? "");
    queueAuto(d, true);
    const ev = d.step(2);
    expect(d.ofType("TargetDropped", ev)[0]?.reason).toBe("plateChanged");
    expect(d.ofType("PlateRemoved", ev)[0]).toMatchObject({ reason: "replaced" });
    expect(d.ofType("PlateShown", ev)[0]).toMatchObject({
      kind: "word",
      replacesPlateId: guard?.id,
    });
    d.step(300);
    expect(d.ofType("EnemyAttack")).toHaveLength(0);
    expect(d.state.run.heroHpM).toBe(100_000);
  });
});

describe("kills and phase gates", () => {
  test("an auto-attack can kill: Hit{killed}, EnemyDeath{byKind: auto}", () => {
    const d = drive(lvl(["plain", "plain"], {}, { poolM: 60_000, hitM: 5000 }), {
      difficulty: "zen",
    });
    enemy(d).hpM = 3000;
    queueAuto(d, false);
    const ev = d.step(2);
    expect(hit(d, ev)[0]).toMatchObject({ killed: true, damageM: 3000, hpAfter: 0 });
    expect(d.ofType("EnemyDeath", ev)[0]?.byKind).toBe("auto");
  });

  test("a gated enemy cannot be pushed past its gate by anything; reaching a non-final gate is not a Finisher", () => {
    const d = drive(lvl(["plain"]), { difficulty: "zen" });
    const e = enemy(d);
    e.gateHpM = e.maxHpM - 4000;
    queueAuto(d, true);
    queueAuto(d, true);
    const ev = d.step(2);
    expect(hit(d, ev).map((h) => h.damageM)).toEqual([4000, 0]);
    expect(e.hpM).toBe(e.gateHpM);
    expect(e.alive).toBe(true);
    expect(d.ofType("FinisherShown")).toHaveLength(0);
    // chips obey the gate as well
    const c = word(d);
    expect(hit(d, c)[0]?.damageM).toBe(0);
  });

  test("a boss stops at 1 milli (the final gate) and the Finisher is shown", () => {
    const d = drive(
      mkDef({ segments: [{ kind: "boss", bossId: "ruinGolem" }], boss: { ...BOSS, hpM: 3000 } }),
      {
        difficulty: "zen",
      },
    );
    queueAuto(d, true);
    queueAuto(d, true);
    const ev = d.step(2);
    expect(hit(d, ev).map((h) => h.damageM)).toEqual([2999, 0]);
    expect(d.ofType("FinisherShown", ev)).toHaveLength(1);
    expect(enemy(d).hpM).toBe(1);
  });
});

describe("hero HP: carry-over and walk heal (doc 01 §1.8)", () => {
  const twoEnc = (heal: boolean): ResolvedLevel =>
    mkDef({
      isBoss: false,
      boss: null,
      enemies: ENEMY_SET,
      segments: [
        {
          kind: "encounter",
          name: "A",
          hpPoolM: 2000,
          gruntHitM: 5000,
          waves: [[{ enemyId: "plain", gimmick: null }]],
        },
        { kind: "walk", ticks: 60, heal },
        {
          kind: "encounter",
          name: "B",
          hpPoolM: 300_000,
          gruntHitM: 5000,
          waves: [[{ enemyId: "plain", gimmick: null }]],
        },
      ],
      words: { ...mkDef().words, current: ["apple", "bird", "cat", "door"] },
    });

  test("the walk heals +25% max HP at WalkStarted (capped at max)", () => {
    const d = new Driver(twoEnc(true), 4, { difficulty: "zen" });
    d.toCombat();
    d.state.run.heroHpM = 50_000;
    word(d); // 2.5 HP chip kills the 2 HP enemy
    const ev = d.step(K.REWARD_T + 2);
    const ws = d.ofType("WalkStarted", ev)[0];
    expect(ws?.heals).toBe(true);
    expect(d.ofType("HeroHealed", ev)[0]).toMatchObject({
      cause: "walk",
      amount: 25,
      hpAfter: 75,
      maxHp: 100,
    });
    expect(types(ev).indexOf("WalkStarted")).toBeLessThan(types(ev).indexOf("HeroHealed"));
    expect(d.state.run.heroHpM).toBe(75_000);
  });

  test("the heal is capped at max HP and emits nothing when already full", () => {
    const d = new Driver(twoEnc(true), 4, { difficulty: "zen" }).toCombat();
    d.state.run.heroHpM = 90_000;
    word(d);
    const ev = d.step(K.REWARD_T + 2);
    expect(d.ofType("HeroHealed", ev)[0]?.amount).toBe(10);
    const full = new Driver(twoEnc(true), 4, { difficulty: "zen" }).toCombat();
    full.type("apple");
    expect(full.ofType("HeroHealed", full.step(K.REWARD_T + 2))).toHaveLength(0);
  });

  test("a walk without heal does not heal; HP carries into the next encounter", () => {
    const d = new Driver(twoEnc(false), 4, { difficulty: "zen" }).toCombat();
    d.state.run.heroHpM = 50_000;
    word(d);
    d.step(K.REWARD_T + 60 + K.ENCOUNTER_INTRO_T + 5);
    expect(d.ofType("HeroHealed")).toHaveLength(0);
    expect(d.state.enc?.index).toBe(1);
    expect(d.state.run.heroHpM).toBe(50_000);
  });

  test("hero stats come from the loadout: T2 U+5 gear scales ATK and max HP", () => {
    const lo = mkLoadout();
    lo.weapon = { ...lo.weapon, tier: 2, rarity: "U", upgrade: 5 };
    const d = new Driver(lvl(["plain"]), 1, {}, lo);
    expect(d.state.run.heroAtkM).toBe(21_168); // 1.4 x 1.12 x 1.35 = 2.1168
  });
});

const types = (ev: readonly SimEvent[]): string[] => ev.map((e) => e.type);

describe("Second Wind (D17)", () => {
  /** A hero one hit from death facing a single plain enemy. */
  const dying = (opts: Parameters<typeof mkOptions>[0] = {}): Driver => {
    const d = drive(lvl(["plain"], {}, { poolM: 300_000, hitM: 5000 }), opts);
    d.state.run.heroHpM = 3000;
    arm(d, enemy(d), 200);
    return d;
  };
  const killHero = (d: Driver): SimEvent[] => {
    const e = enemy(d);
    const out: SimEvent[] = [];
    while (d.state.phase === "combat" && d.state.tick <= (e.nextImpact ?? 0) + 5)
      out.push(...d.step());
    return out;
  };

  test("HP 0 -> HeroDowned + SecondWindStarted; the encounter freezes with one exclusive sentence plate", () => {
    const d = dying();
    const ev = killHero(d);
    expect(
      types(ev.slice(ev.findIndex((e) => e.type === "EnemyAttack"))).filter((t) =>
        ["EnemyAttack", "HeroDamaged", "HeroDowned", "PlateShown", "SecondWindStarted"].includes(t),
      ),
    ).toEqual(["EnemyAttack", "HeroDamaged", "HeroDowned", "PlateShown", "SecondWindStarted"]);
    expect(d.ofType("HeroDowned", ev)[0]?.secondWindAvailable).toBe(true);
    const sw = d.ofType("SecondWindStarted", ev)[0];
    expect(sw?.text).toBe(K.SECOND_WIND_FALLBACK_TEXT);
    expect(sw?.deadlineTick).toBe(d.state.tick - 1 + K.SECOND_WIND_T);
    expect(d.state.phase).toBe("secondWind");
    expect(d.plates()).toHaveLength(1);
    expect(d.plates()[0]).toMatchObject({ kind: "secondWind", isTarget: true });
    expect(d.view().secondWind).toMatchObject({ totalTicks: K.SECOND_WIND_T });
    expect(d.view().hero).toMatchObject({ pose: "downed", secondWindAvailable: false });
    // frozen: no attacks for the whole window
    d.step(K.SECOND_WIND_T - 5);
    expect(d.ofType("EnemyAttack")).toHaveLength(1);
    expect(d.state.run.activeTicks).toBeLessThan(400);
  });

  test("success: type the sentence -> HeroHealed 30%, SecondWindSucceeded, combat resumes with fresh plates and timers", () => {
    const d = dying();
    killHero(d);
    const frozenAt = d.state.tick;
    d.step(100);
    const ev = d.type(K.SECOND_WIND_FALLBACK_TEXT);
    expect(d.ofType("HeroHealed", ev)[0]).toMatchObject({
      cause: "secondWind",
      amount: 30,
      hpAfter: 30,
      maxHp: 100,
    });
    expect(d.ofType("SecondWindSucceeded", ev)[0]).toMatchObject({ hpAfter: 30 });
    expect(d.state.phase).toBe("combat");
    expect(d.state.run.heroHpM).toBe(30_000);
    expect(d.plates()).toHaveLength(1);
    expect(d.plates()[0]?.kind).toBe("word");
    const e = enemy(d);
    expect(e.nextImpact).toBe(d.state.tick - 1 + e.intervalTicks);
    expect(frozenAt).toBeLessThan(d.state.tick);
    expect(d.view().hero.secondWindAvailable).toBe(false);
  });

  test("a second death in the same level is always LevelFailed{defeated}, with HeroDowned{secondWindAvailable: false}", () => {
    const d = dying();
    killHero(d);
    d.type(K.SECOND_WIND_FALLBACK_TEXT);
    d.state.run.heroHpM = 1000;
    arm(d, enemy(d), 200);
    const ev = killHero(d);
    expect(d.ofType("HeroDowned", ev)[0]?.secondWindAvailable).toBe(false);
    expect(d.ofType("SecondWindStarted", ev)).toHaveLength(0);
    expect(ev.at(-1)).toMatchObject({ type: "LevelFailed", reason: "defeated" });
    expect(d.state.phase).toBe("failed");
  });

  test("failure: the deadline passes -> SecondWindFailed then LevelFailed{defeated}; result reports the Second Wind", () => {
    const d = dying();
    killHero(d);
    const ev = d.step(K.SECOND_WIND_T + 2);
    expect(types(ev).filter((t) => t === "SecondWindFailed" || t === "LevelFailed")).toEqual([
      "SecondWindFailed",
      "LevelFailed",
    ]);
    expect(d.state.phase).toBe("failed");
    const r = d.state.run;
    expect(r.failReason).toBe("defeated");
    expect(r.secondWindUsed).toBe(true);
  });

  test("failed level keeps floor(gold x 50%)", () => {
    const d = dying();
    d.state.run.goldCollected = 101;
    killHero(d);
    const ev = d.step(K.SECOND_WIND_T + 2);
    expect(d.ofType("LevelFailed", ev)[0]?.goldKept).toBe(50);
  });

  test("a wrong key during Second Wind is a typo and does not advance; Escape cannot drop the plate", () => {
    const d = dying();
    killHero(d);
    d.key("z");
    expect(d.ofType("Typo")[0]).toBeDefined();
    expect(d.key("Escape")).toEqual([]);
    expect(d.plates()[0]?.isTarget).toBe(true);
  });

  test("hook: with allowExternalRevive a failed Second Wind waits in 'downed'; revive restores 50%; otherwise it is ignored", () => {
    const d = dying({ allowExternalRevive: true });
    killHero(d);
    const ev = d.step(K.SECOND_WIND_T + 2);
    expect(d.state.phase).toBe("downed");
    expect(d.ofType("LevelFailed", ev)).toHaveLength(0);
    d.step(50);
    const rv = applyInput(d.state, { tick: d.state.tick, cmd: "revive", source: "gem" });
    expect(rv.map((e) => e.type).slice(0, 2)).toEqual(["HeroHealed", "Revived"]);
    expect(d.state.run.heroHpM).toBe(50_000);
    expect(d.state.phase).toBe("combat");
    expect(d.plates()).toHaveLength(1);
    // without the option the command is a no-op
    const n = dying();
    killHero(n);
    expect(applyInput(n.state, { tick: n.state.tick, cmd: "revive", source: "gem" })).toEqual([]);
    expect(n.state.phase).toBe("secondWind");
  });
});

describe("determinism", () => {
  test("the same inputs replay to identical state hashes with combat on", () => {
    const run = (): string => {
      const d = drive(lvl(["shielded", "plain"]), {});
      for (let i = 0; i < 6; i++) d.type(d.plates()[0]?.text ?? "");
      d.step(1500);
      return JSON.stringify(d.state);
    };
    expect(run()).toBe(run());
    void step;
  });
});

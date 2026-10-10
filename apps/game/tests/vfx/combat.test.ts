/**
 * T2.3 combat VFX units: the pure parameter functions, the pooled primitives (bounce / spin additions, fixed
 * sizes), and the whole director fed 10,000 synthetic events at every intensity setting (no throw, nothing grows).
 */
import type { SimEvent } from "@hd2d/sim";
import { PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createLightingUniforms, LightRig } from "../../src/render/lighting";
import { FxKind } from "../../src/render/materials/fx";
import type { RenderWorld } from "../../src/render/RenderWorld";
import { ArcPool } from "../../src/render/vfx/combat/ArcPool";
import { CombatFx } from "../../src/render/vfx/combat/CombatFx";
import {
  arcFor,
  CHEST_STYLE,
  coinCount,
  dissolveCount,
  glowK,
  motionK,
  SKILL_STYLE,
  scaled,
} from "../../src/render/vfx/combat/params";
import { newQuadSpec, QuadPool } from "../../src/render/vfx/combat/QuadPool";
import { newSpec, PooledParticles, resetSpec } from "../../src/render/vfx/PooledParticles";

function fakeWorld(): RenderWorld {
  const lighting = createLightingUniforms();
  return {
    scene: new Scene(),
    lighting,
    lights: new LightRig(lighting),
    camera: { shake() {}, camera: new PerspectiveCamera() },
    sprites: { black: {} },
    source: { has: () => false },
  } as unknown as RenderWorld;
}

describe("combat params", () => {
  it("scaled(): x k x q, at least 1 while k > 0, 0 at k = 0", () => {
    const s = { k: 1, q: 1, reducedFlash: false, reducedMotion: false };
    expect(scaled(40, s)).toBe(40);
    expect(scaled(40, { ...s, k: 0.5, q: 0.55 })).toBe(11);
    expect(scaled(2, { ...s, k: 0.1, q: 0.55 })).toBe(1);
    expect(scaled(40, { ...s, k: 0 })).toBe(0);
  });

  it("glowK halves under reduced flash only for bright flashes; motionK is 0 under reduced motion", () => {
    const s = { k: 1, q: 1, reducedFlash: true, reducedMotion: true };
    expect(glowK(s, true)).toBeCloseTo(0.5);
    expect(glowK(s, false)).toBeCloseTo(1);
    expect(glowK({ ...s, k: 0 })).toBe(0);
    expect(motionK({ effectsIntensity: 1, reducedMotion: true })).toBe(0);
    expect(motionK({ effectsIntensity: 0.5, reducedMotion: false })).toBe(0.5);
  });

  it("every weapon archetype has its own look: arcs for blades and hammer, a bolt for the staff", () => {
    expect(arcFor("sword", 0)).not.toBeNull();
    expect(arcFor("sword", 4)).toEqual(arcFor("sword", 1));
    expect(arcFor("dagger", 0)?.w).toBeLessThan((arcFor("sword", 0) as { w: number }).w);
    expect(arcFor("hammer", 0)?.w).toBeGreaterThan((arcFor("sword", 0) as { w: number }).w);
    expect(arcFor("staff", 0)).toBeNull();
  });

  it("chest tiers escalate: beam, burst, light and coins grow; Gold adds rays, Mythic adds a rune circle", () => {
    const t = [CHEST_STYLE.Wooden, CHEST_STYLE.Iron, CHEST_STYLE.Gold, CHEST_STYLE.Mythic];
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1] as (typeof t)[number];
      const b = t[i] as (typeof t)[number];
      expect(b.beam).toBeGreaterThan(a.beam);
      expect(b.burst).toBeGreaterThan(a.burst);
      expect(b.lightPeak).toBeGreaterThan(a.lightPeak);
      expect(b.coins).toBeGreaterThan(a.coins);
      expect(b.width).toBeGreaterThan(a.width);
    }
    expect(CHEST_STYLE.Gold.rays && !CHEST_STYLE.Wooden.rays && !CHEST_STYLE.Iron.rays).toBe(true);
    expect(CHEST_STYLE.Mythic.rune && !CHEST_STYLE.Gold.rune).toBe(true);
  });

  it("coin and dissolve counts are bounded", () => {
    expect(coinCount(0, "encounter")).toBe(14);
    expect(coinCount(100000, "encounter")).toBe(72);
    expect(coinCount(240, "passive")).toBeLessThan(coinCount(240, "encounter"));
    expect(dissolveCount(true, 3)).toBeLessThanOrEqual(170);
    expect(dissolveCount(false, 2)).toBeLessThanOrEqual(110);
    expect(dissolveCount(true, 1.6)).toBeGreaterThan(dissolveCount(false, 1.6));
  });

  it("all seven skills have a distinct colour identity", () => {
    const ids = Object.keys(SKILL_STYLE);
    expect(ids.length).toBe(7);
    const keys = new Set(
      ids.map((i) => JSON.stringify((SKILL_STYLE as Record<string, { core: number[] }>)[i]?.core)),
    );
    expect(keys.size).toBe(7);
  });
});

describe("pooled primitives", () => {
  it("PooledParticles bounce and spin: a bouncing coin keeps y >= 0 and flips", () => {
    const p = new PooledParticles(16, true, new Scene());
    const s = resetSpec(newSpec());
    s.y = 1;
    s.vy = 4;
    s.life = 3;
    s.grav = 14;
    s.bounce = 0.4;
    s.spin = 12;
    p.emit(s);
    let minY = 1;
    for (let i = 0; i < 120; i++) {
      p.update(1 / 60);
      p.upload();
      const a = (
        p.mesh.geometry as unknown as { attributes: Record<string, { array: Float32Array }> }
      ).attributes;
      minY = Math.min(minY, a.iPos?.array[1] as number);
    }
    expect(minY).toBeGreaterThanOrEqual(0.029);
    const sz = (
      p.mesh.geometry as unknown as { attributes: Record<string, { array: Float32Array }> }
    ).attributes.iSz;
    expect(Math.abs(sz?.array[3] as number)).toBeGreaterThan(0);
    p.dispose();
  });

  it("QuadPool and ArcPool: 10,000 spawns never grow the scene or exceed the pool", () => {
    const w = fakeWorld();
    const quads = new QuadPool(w, FxKind.Star, 6);
    const arcs = new ArcPool(w, 5);
    const before = w.scene.children.length;
    const q = newQuadSpec();
    for (let i = 0; i < 10000; i++) {
      q.s0 = 1;
      q.s1 = 3;
      q.life = 0.3;
      quads.spawn(q);
      arcs.fire(
        0,
        1,
        0,
        {
          r: 1,
          w: 0.5,
          a0: 1,
          sweep: -3,
          rx: 0,
          ry: 0,
          rz: 0,
          dur: 0.08,
          tail: 0.24,
          intensity: 1,
        },
        [1, 1, 1],
        [1, 1, 1],
      );
      if (i % 7 === 0) {
        quads.update(1 / 60);
        arcs.update(1 / 60);
      }
      expect(quads.live).toBeLessThanOrEqual(6);
      expect(arcs.live).toBeLessThanOrEqual(5);
    }
    expect(w.scene.children.length).toBe(before);
    for (let i = 0; i < 120; i++) {
      quads.update(1 / 60);
      arcs.update(1 / 60);
    }
    expect(quads.live).toBe(0);
    expect(arcs.live).toBe(0);
  });
});

/** A stream of every combat event the director handles, against a fake stage. */
function stream(n: number): SimEvent[] {
  const out: SimEvent[] = [];
  const t = 0;
  const base = (e: object): SimEvent => ({ tick: t, ...e }) as SimEvent;
  const hit = (o: object): SimEvent =>
    base({
      type: "Hit",
      sourceId: 0,
      targetId: 1,
      kind: "auto",
      origin: "weapon",
      skillId: null,
      damageType: "slash",
      damage: 5,
      damageM: 5,
      hpAfter: 5,
      maxHp: 10,
      crit: false,
      weak: false,
      broken: false,
      atbKnockback: false,
      hitIndex: 0,
      hitCount: 2,
      killed: false,
      ...o,
    });
  const kit: SimEvent[] = [
    base({
      type: "AutoAttack",
      targetId: 1,
      archetype: "sword",
      hits: 2,
      impactTick: 18,
      crit: false,
    }),
    base({
      type: "AutoAttack",
      targetId: 1,
      archetype: "staff",
      hits: 1,
      impactTick: 18,
      crit: false,
    }),
    hit({}),
    hit({ crit: true, weak: true, hitIndex: 1 }),
    hit({ kind: "chip", origin: "chip" }),
    hit({ kind: "counter", origin: "counter" }),
    hit({ kind: "dot", origin: "skill", damageType: "fire" }),
    hit({ kind: "skill", origin: "skill", skillId: "fireball", damageType: "fire" }),
    hit({ kind: "skill", origin: "skill", skillId: "slashWave" }),
    hit({ kind: "skill", origin: "skill", skillId: "piercingThrust" }),
    base({ type: "WeaknessRevealed", enemyId: 1, damageType: "fire" }),
    base({ type: "ShieldDamaged", enemyId: 1, shield: 1, shieldMax: 3 }),
    base({ type: "Break", enemyId: 1, untilTick: 99 }),
    base({
      type: "StatusApplied",
      targetId: 1,
      status: "freeze",
      untilTick: 9,
      stacks: 1,
      origin: "skill",
      skillId: "frostLock",
    }),
    base({
      type: "StatusApplied",
      targetId: 0,
      status: "barrier",
      untilTick: null,
      stacks: 1,
      origin: "skill",
      skillId: "aegis",
    }),
    base({ type: "StatusEnded", targetId: 1, status: "freeze" }),
    ...(
      ["fireball", "slashWave", "piercingThrust", "frostLock", "mendingLight", "aegis"] as const
    ).map((skillId) =>
      base({ type: "SkillCast", slot: 0, skillId, targetIds: [1, 2], impactTick: 24 }),
    ),
    base({ type: "EnemyAttackWindup", enemyId: 1, impactTick: 60, heavy: true }),
    base({ type: "EnemyAttack", enemyId: 1, outcome: "hit", damage: 5 }),
    base({ type: "EnemyAttack", enemyId: 1, outcome: "barrier", damage: 0 }),
    base({ type: "GuardBlocked", enemyId: 1, damage: 0 }),
    base({ type: "GuardParried", enemyId: 1, counterDamage: 4 }),
    base({ type: "EnemyDeath", enemyId: 1, defId: "x", isBoss: false, byKind: "auto" }),
    base({ type: "HeroHealed", cause: "skill", amount: 5, hpAfter: 9, maxHp: 10 }),
    base({ type: "HeroDowned", secondWindAvailable: true }),
    base({ type: "PassiveTriggered", passiveId: "riposte", targetId: null }),
    base({ type: "SecondWindSucceeded", hpAfter: 5, maxHp: 10 }),
    ...(["Wooden", "Iron", "Gold", "Mythic"] as const).map((tier) =>
      base({ type: "ChestDropped", tier, encounterIndex: 0, enemyId: 1 }),
    ),
    base({ type: "GoldGained", amount: 300, source: "encounter", total: 300 }),
    base({
      type: "BossIntroStarted",
      enemyId: 1,
      bossId: "b",
      name: "B",
      title: "T",
      untilTick: 200,
    }),
    base({ type: "BossPhaseChanged", enemyId: 1, from: 1, to: 2, breatherUntilTick: 50 }),
    base({ type: "DoomSpellStarted", enemyId: 1, plateId: 1, text: "d", deadlineTick: 600 }),
    base({ type: "DoomSpellCompleted", enemyId: 1, plateId: 1, staggerUntilTick: 100 }),
    base({ type: "DoomSpellFailed", enemyId: 1, plateId: 1, damage: 3 }),
    base({ type: "MinigameWordMissed", plateId: 1, lane: 0, damage: 2 }),
  ];
  for (let i = 0; i < n; i++) out.push(kit[i % kit.length] as SimEvent);
  return out;
}

function runDirector(
  settings: { effectsIntensity: number; reducedFlash: boolean; reducedMotion: boolean },
  tier: number,
): { fx: CombatFx; world: RenderWorld; cap: number } {
  const world = fakeWorld();
  const add = new PooledParticles(576, true, world.scene);
  const norm = new PooledParticles(192, false, world.scene);
  const fx = new CombatFx({
    world,
    anchors: {
      hero: (o) => {
        o.x = 0;
        o.z = 0;
      },
      enemy: (_id, o) => {
        o.x = 5;
        o.y = 1.3;
        o.z = 0;
        return true;
      },
    },
    shared: { add, norm },
    getView: () => null,
    heroSnapshot: () => null,
    enemyInfo: (_id, o) => {
      o.frame = null;
      o.scale = 1.4;
      o.x = 5;
      o.y = 0;
      o.z = 0;
      o.height = 2.4;
      return true;
    },
    rim: () => {},
    postFlash: () => {},
  });
  fx.setSettings(settings, tier);
  fx.viaCallbacks = false;
  const before = world.scene.children.length;
  const sink = fx as unknown as Record<string, (e: SimEvent) => void>;
  const names: Record<string, string> = {
    AutoAttack: "autoAttack",
    Hit: "hit",
    WeaknessRevealed: "weaknessRevealed",
    ShieldDamaged: "shieldDamaged",
    Break: "breakStarted",
    StatusApplied: "statusApplied",
    StatusEnded: "statusEnded",
    SkillCast: "skillCast",
    EnemyAttackWindup: "windup",
    EnemyAttack: "enemyAttack",
    GuardBlocked: "guardBlocked",
    GuardParried: "guardParried",
    EnemyDeath: "enemyDeath",
    HeroHealed: "heroHealed",
    HeroDowned: "heroDowned",
    PassiveTriggered: "passive",
    SecondWindSucceeded: "secondWindSucceeded",
    ChestDropped: "chestDropped",
    GoldGained: "goldGained",
    BossIntroStarted: "bossIntro",
    BossPhaseChanged: "bossPhase",
    DoomSpellStarted: "doomStarted",
    DoomSpellCompleted: "doomCompleted",
    DoomSpellFailed: "doomFailed",
    MinigameWordMissed: "minigameMissed",
  };
  let i = 0;
  for (const e of stream(10000)) {
    const m = names[e.type];
    if (m) sink[m]?.call(fx, e);
    if (i++ % 3 === 0) {
      fx.update(1 / 60);
      add.update(1 / 60);
      norm.update(1 / 60);
      add.upload();
      norm.upload();
    }
    if (add.count > 576 || norm.count > 192) throw new Error("pool overflow");
  }
  expect(world.scene.children.length).toBe(before);
  return { fx, world, cap: 576 };
}

describe("CombatFx director", () => {
  it("handles 10,000 events at full intensity without growing the scene or the pools", () => {
    const { fx } = runDirector(
      { effectsIntensity: 1, reducedFlash: false, reducedMotion: false },
      0,
    );
    const d = fx.diagnostics();
    expect(d.poolA).toBeLessThanOrEqual(576);
    expect(d.lights).toBeLessThanOrEqual(3);
  });

  it("at effectsIntensity 0 it emits nothing (information layer only)", () => {
    const { fx } = runDirector(
      { effectsIntensity: 0, reducedFlash: false, reducedMotion: false },
      0,
    );
    for (let i = 0; i < 300; i++) fx.update(1 / 60);
    const d = fx.diagnostics();
    expect(d.arcs).toBe(0);
    expect(d.lights).toBe(0);
  });

  it("reduced flash / reduced motion / quality 2 all run clean", () => {
    runDirector({ effectsIntensity: 1, reducedFlash: true, reducedMotion: true }, 2);
    runDirector({ effectsIntensity: 0.4, reducedFlash: true, reducedMotion: false }, 1);
  });

  it("clear() drops everything in flight", () => {
    const { fx } = runDirector(
      { effectsIntensity: 1, reducedFlash: false, reducedMotion: false },
      0,
    );
    fx.clear();
    const d = fx.diagnostics();
    expect(d.arcs + d.ghosts + d.projectiles + d.lights).toBe(0);
  });
});

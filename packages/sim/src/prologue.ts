// Prologue "The Unwriting" (interfaces v2.2 §3.7, §14): resolvePrologue / prologueRunConfig plus the integer surge helper.
// Everything here is gated on ResolvedLevel.prologue; story levels never reach it (§14.1). No RNG, no wall clock.
import type { BossDef, ContentBundle, EnemyDef } from "@hd2d/content";
import { K } from "./balance.ts";
import { SimError } from "./errors.ts";
import { BP, bp, milli, mulDiv } from "./fixed.ts";
import { canonicalContentJson, fnv1a32 } from "./hash.ts";
import { parArmorBp, parHpM } from "./meta/index.ts";
import { resolveBoss, resolveEnemy, resolveRef, ticks } from "./resolve.ts";
import type { EncounterState } from "./state.ts";
import type {
  LevelOptions,
  LevelState,
  Loadout,
  PrologueRunConfig,
  ResolvedEnemy,
  ResolvedLevel,
  ResolvedPrologue,
  ResolvedSegment,
} from "./types.ts";

/** §3.7.1: the prologue as a ResolvedLevel. Throws SimError on a missing or malformed `bundle.prologue`. */
export function resolvePrologue(bundle: ContentBundle): ResolvedLevel {
  const p = bundle.prologue;
  if (p === undefined) throw new SimError("resolvePrologue: bundle has no prologue");
  const enemyDef = (id: string): EnemyDef => {
    const d = bundle.enemies.find((e) => e.id === id);
    if (d === undefined) throw new SimError(`resolvePrologue: unknown enemy ${id}`);
    return d;
  };
  const enemies: Record<string, ResolvedEnemy> = {};
  const addEnemy = (id: string): void => {
    if (enemies[id] === undefined) enemies[id] = resolveEnemy(enemyDef(id));
  };
  const kinds = p.segments.map((s) => s.kind);
  const bossCount = kinds.filter((k) => k === "boss").length;
  if (bossCount !== 1 || kinds[kinds.length - 1] !== "boss")
    throw new SimError("resolvePrologue: need exactly one boss segment, and it must be last");
  if (!kinds.includes("encounter")) throw new SimError("resolvePrologue: no encounter segment");
  const seen: { boss: BossDef | null; gruntHitM: number | null } = { boss: null, gruntHitM: null };
  const segments: ResolvedSegment[] = p.segments.map((s): ResolvedSegment => {
    if (s.kind === "walk") return { kind: "walk", ticks: ticks(s.seconds), heal: s.heal };
    if (s.kind === "boss") {
      const b = bundle.bosses.find((x) => x.id === s.bossId);
      if (b === undefined) throw new SimError(`resolvePrologue: unknown boss ${s.bossId}`);
      seen.boss = b;
      addEnemy(b.enemyId);
      for (const r of b.phase1.adds) addEnemy(r.enemy);
      return { kind: "boss", bossId: b.id };
    }
    for (const wave of s.encounter.waves) for (const r of wave) addEnemy(r.enemy);
    seen.gruntHitM = milli(s.encounter.gruntHit);
    return {
      kind: "encounter",
      name: s.encounter.name,
      hpPoolM: milli(s.encounter.hp),
      gruntHitM: milli(s.encounter.gruntHit),
      attackPowerBp: bp(s.encounter.attackPower),
      waves: s.encounter.waves.map((w) => w.map(resolveRef)),
    };
  });
  const bossDef = seen.boss;
  if (bossDef === null) throw new SimError("resolvePrologue: no boss segment");
  if (bossDef.phase3.minigame.kind !== "fallingRubble")
    throw new SimError("resolvePrologue: the boss minigame must be fallingRubble");
  const lens = p.words.map((w) => w.length);
  const prologue: ResolvedPrologue = {
    kitActives: p.kit.actives.map((a) => a.id),
    kitStartChargeM: p.kit.actives.map((a) =>
      mulDiv(K.SKILL_CHARGE_M[a.id], a.startChargePct, 100),
    ),
    kitPassives: [...p.kit.passives],
    chargeMultBp: bp(p.chargeMult),
    castGapTicks: Math.max(1, ticks(p.castGapS)),
    forceAfterTicks: ticks(p.forceAfterS),
    heroHpFloorBp: p.heroHpFloorPct * 100,
    surge: {
      encounterAfterTicks: ticks(p.surge.encounterAfterS),
      bossAfterTicks: ticks(p.surge.bossAfterS),
      doubleEveryTicks: Math.max(1, ticks(p.surge.doubleEveryS)),
      maxMultBp: p.surge.maxMult * BP,
    },
    bossMinTicks: ticks(p.bossMinS),
  };
  return {
    levelId: p.id,
    chapter: 1,
    index: 0,
    isBoss: true,
    contentVersion: fnv1a32(canonicalContentJson(bundle)).toString(16).padStart(8, "0"),
    segments,
    enemies,
    boss: resolveBoss(bossDef, seen.gruntHitM),
    words: {
      current: [...p.words],
      review: [],
      biome: [],
      weak: [],
      guard: [...p.guardWords],
      doom: [],
      finisher: [],
      secondWind: [],
      minigame: [],
    },
    tierMixBp: { current: 10_000, review: 0, biome: 0, weak: 0 },
    plateLength: [Math.min(...lens), Math.max(...lens)],
    goldTotal: 0,
    parArmorBp: parArmorBp(1),
    parHpM: parHpM(1),
    star3: { kind: "noSkills" },
    parRefTicks: 0,
    tutorial: false,
    foldSentences: true,
    prologue,
  };
}

/** §3.7.1: everything createLevel/replay need for a prologue run. The player's settings are deliberately not applied. */
export function prologueRunConfig(bundle: ContentBundle): PrologueRunConfig {
  const p = bundle.prologue;
  if (p === undefined) throw new SimError("prologueRunConfig: bundle has no prologue");
  const g = p.gear;
  const loadout: Loadout = {
    weapon: { archetype: g.archetype, tier: g.tier, rarity: g.rarity, upgrade: g.upgrade },
    armor: { tier: g.tier, rarity: g.rarity, upgrade: g.upgrade },
    charm: { tier: g.tier, rarity: g.rarity, upgrade: g.upgrade },
    actives: [null, null],
    activeModes: ["smart", "smart"],
    passives: [null, null, null],
  };
  const options: LevelOptions = {
    pace: p.pace,
    difficulty: "standard",
    comboMode: "gentle",
    caseMode: "auto",
    autoUnlockAfterTypos: 0,
    firstClear: false,
    frontierChapter: 1,
    goldMultBp: 0,
    allowExternalRevive: false,
    tutorial: false,
  };
  return { def: resolvePrologue(bundle), loadout, seed: p.seed, options };
}

/**
 * §3.7.5: the hero-damage surge multiplier in bp for the current encounter (BP before `after` combat ticks, then x2 at
 * `after` and every `doubleEveryTicks` after it, capped at maxMultBp). A loop, no `**`. Story levels never call this.
 */
export function surgeBp(state: Readonly<LevelState>): number {
  const pro = state.run.def.prologue;
  const rs = state.run.prologue;
  const enc = state.enc as EncounterState | null;
  if (pro === undefined || rs === undefined || enc === null) return BP;
  const after = enc.isBoss ? pro.surge.bossAfterTicks : pro.surge.encounterAfterTicks;
  const c = rs.combatTicks;
  if (c < after) return BP;
  const k = 1 + Math.floor((c - after) / pro.surge.doubleEveryTicks);
  let m = BP;
  for (let i = 0; i < k && m < pro.surge.maxMultBp; i++) m = Math.min(2 * m, pro.surge.maxMultBp);
  return m;
}

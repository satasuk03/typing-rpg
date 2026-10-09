// Level fixtures for the reference bot.
//  1. economyFixtureLevel: built from economy_sim.py's Chapter 1 level_spec (encounter composition, HP pool, grunt hit,
//     9 s base interval), read from the Python dump tests/fixtures/economy-reference.json. Shieldless, weaknessless grunts
//     so the result is comparable with the Python model.
//  2. contentLevel: a minimal LevelDef -> ResolvedLevel for NORMAL levels of the real content bundle (a test helper, not
//     T1.6's resolveLevel: no boss, no gimmicks, no SRS, no tutorial cues).
import {
  CONTENT_VERSION,
  type ContentBundle,
  contentBundle,
  type EnemyDef,
  type LevelDef,
  type WordEntry,
} from "@hd2d/content";
import {
  bp,
  levelGold,
  milli,
  mulBp,
  parHpM,
  type ResolvedEnemy,
  type ResolvedLevel,
  type ResolvedSegment,
  resolveStar3,
} from "../../src/index.ts";
import reference from "../fixtures/economy-reference.json" with { type: "json" };
import { mkLoadout } from "../typingHarness.ts";

/** The ch1 starter kit (content/data/skills.ts): Fireball + Aegis, Clean Cut + Steady Hands + Iron Will. */
export function starterLoadout(archetype: "sword" | "dagger" | "staff" | "hammer" = "sword") {
  const l = mkLoadout(archetype);
  l.actives = ["fireball", "aegis"];
  l.passives = ["cleanCut", "steadyHands", "ironWill"];
  return l;
}

const T = 60;
const ticks = (s: number): number => Math.round(s * T);

interface PySpec {
  enc_hp: number;
  grunt_hit: number;
  boss: boolean;
  encs: { kind: string; mons: number[][] }[];
}
const SPECS = reference.ref.level_specs_ch1 as unknown as Record<string, PySpec>;

const plateWords = (
  pred: (w: WordEntry) => boolean,
  bundle: ContentBundle = contentBundle,
): string[] => bundle.words.filter((w) => w.uses.includes("plate") && pred(w)).map((w) => w.text);
const usesWords = (use: WordEntry["uses"][number]): string[] =>
  contentBundle.words.filter((w) => w.uses.includes(use)).map((w) => w.text);

const GRUNT: ResolvedEnemy = {
  id: "grunt",
  archetype: "grunt",
  baseIntervalTicks: ticks(9),
  heavy: false,
  plateLength: [3, 5],
  weaknesses: [],
  shield: 0,
  hpWeightBp: 10_000,
  hitWeightBp: 10_000,
};

/** Chapter 1 level `n` (1..9) of economy_sim, with the sim's walk/intro timings. */
export function economyFixtureLevel(n: number, hpScaleBp = 10_000): ResolvedLevel {
  const spec = SPECS[String(n)];
  if (spec === undefined || spec.boss) throw new Error(`no normal economy spec for level ${n}`);
  const segments: ResolvedSegment[] = [];
  spec.encs.forEach((e, i) => {
    segments.push({ kind: "walk", ticks: ticks(i === 0 ? 7 : 8), heal: i > 0 });
    segments.push({
      kind: "encounter",
      name: `enc${i + 1}`,
      hpPoolM: mulBp(milli(e.mons.reduce((a, m) => a + (m[0] as number), 0)), hpScaleBp),
      gruntHitM: milli(e.mons[0]?.[1] ?? 0),
      waves: [e.mons.map(() => ({ enemyId: "grunt", gimmick: null }))],
    });
  });
  return baseDef(`py-ch1-l${n}`, n, segments, { grunt: GRUNT }, "forest");
}

function baseDef(
  levelId: string,
  index: number,
  segments: ResolvedSegment[],
  enemies: Record<string, ResolvedEnemy>,
  biome: string,
  plateLength: [number, number] = [3, 5],
): ResolvedLevel {
  const tier1 = plateWords((w) => w.tier === 1 && w.kind === "word" && !w.biomes.length);
  return {
    levelId,
    chapter: 1,
    index,
    isBoss: false,
    contentVersion: CONTENT_VERSION,
    segments,
    enemies,
    boss: null,
    words: {
      current: tier1,
      review: [],
      biome: plateWords((w) => w.biomes.includes(biome as never)),
      weak: [],
      guard: usesWords("guard"),
      doom: [],
      finisher: [],
      secondWind: usesWords("secondWind"),
      minigame: [],
    },
    tierMixBp: { current: 6000, review: 2000, biome: 1500, weak: 500 },
    plateLength,
    goldTotal: levelGold(1, Math.min(index, 10)),
    parHpM: parHpM(1),
    star3: { kind: "noSkills" },
    parRefTicks: 0,
    tutorial: false,
    foldSentences: true, // Chapter 1 (BALANCE.SENTENCE_FOLD_CASE_MAX_CHAPTER)
  };
}

const resolveEnemy = (d: EnemyDef): ResolvedEnemy => ({
  id: d.id,
  archetype: d.archetype,
  baseIntervalTicks: ticks(d.baseIntervalS),
  heavy: d.heavy,
  plateLength: d.plateLength,
  weaknesses: d.weaknesses,
  shield: d.shield,
  hpWeightBp: bp(d.hpWeight),
  hitWeightBp: bp(d.hitWeight),
});

/** Real content level (normal levels only), e.g. "ch1-l05". */
export function contentLevel(id: string): ResolvedLevel {
  const lv: LevelDef | undefined = contentBundle.levels.find((l) => l.id === id);
  if (lv === undefined || lv.kind === "boss")
    throw new Error(`contentLevel: ${id} not a normal level`);
  const enemies: Record<string, ResolvedEnemy> = {};
  const segments: ResolvedSegment[] = lv.segments.map((s): ResolvedSegment => {
    if (s.kind === "walk") return { kind: "walk", ticks: ticks(s.seconds), heal: s.heal };
    if (s.kind === "boss") throw new Error("boss segment");
    for (const w of s.encounter.waves)
      for (const r of w) {
        const d = contentBundle.enemies.find((e) => e.id === r.enemy);
        if (d === undefined) throw new Error(`unknown enemy ${r.enemy}`);
        enemies[d.id] = resolveEnemy(d);
      }
    return {
      kind: "encounter",
      name: s.encounter.name,
      hpPoolM: milli(s.encounter.hp),
      gruntHitM: milli(s.encounter.gruntHit),
      waves: s.encounter.waves.map((w) => w.map((r) => ({ enemyId: r.enemy, gimmick: null }))),
    };
  });
  const def = baseDef(lv.id, lv.index, segments, enemies, lv.biome, lv.plateLength);
  def.star3 = resolveStar3(lv.star3);
  def.parRefTicks = ticks(lv.parRefS);
  return def;
}

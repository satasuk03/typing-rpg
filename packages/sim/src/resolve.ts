// resolveLevel (docs/interfaces.md §3, §6): content LevelDef + bundle -> the integer ResolvedLevel the sim consumes.
// Deterministic given (bundle contents, levelId, ctx). Seconds become ticks (Math.round(s x 60)), HP/hit become milli, bp
// for ratios. T1.5 ships the full mapping (normal and boss levels, gimmick refs, boss script); T1.6 owns the SRS weak-word
// scheduling and any further pool curation (plateLength filtering of the pools is still a T1.6 item).
import type {
  BossDef,
  ContentBundle,
  EnemyDef,
  EnemyRef,
  LevelDef,
  WordEntry,
} from "@hd2d/content";
import { K } from "./balance.ts";
import { SimError } from "./errors.ts";
import { bp, milli, mulDiv } from "./fixed.ts";
import { canonicalContentJson, fnv1a32 } from "./hash.ts";
import { levelGold, parArmorBp, parHpM, resolveStar3 } from "./meta/index.ts";
import { TICK_HZ } from "./time.ts";
import type {
  ResolvedBoss,
  ResolvedEnemy,
  ResolvedEnemyRef,
  ResolvedLevel,
  ResolvedSegment,
} from "./types.ts";

const ticks = (s: number): number => Math.round(s * TICK_HZ);

// v2.0: attackPowerBp / elite are ABSENT unless the ref sets them (Ch1 hashes must not change, §13.1).
const resolveRef = (r: EnemyRef): ResolvedEnemyRef => ({
  enemyId: r.enemy,
  gimmick: r.gimmick ?? null,
  ...(r.attackPower !== undefined ? { attackPowerBp: bp(r.attackPower) } : {}),
  ...(r.elite === true ? { elite: true as const } : {}),
});

const resolveEnemy = (d: EnemyDef): ResolvedEnemy => ({
  id: d.id,
  archetype: d.archetype,
  baseIntervalTicks: ticks(d.baseIntervalS),
  heavy: d.heavy,
  plateLength: [d.plateLength[0], d.plateLength[1]],
  weaknesses: [...d.weaknesses],
  shield: d.shield,
  hpWeightBp: bp(d.hpWeight),
  hitWeightBp: bp(d.hitWeight),
  ...(d.heal !== undefined
    ? {
        heal: {
          everyTicks: ticks(d.heal.everyS),
          fracBp: bp(d.heal.frac),
          maxTargets: d.heal.maxTargets,
          maxHeals: d.heal.maxHeals,
        },
      }
    : {}),
});

function resolveBoss(b: BossDef, levelGruntHitM: number | null): ResolvedBoss {
  const mg = b.phase3.minigame;
  if (mg.kind !== "fallingRubble") throw new Error("riddle minigame: not implemented (T1.3)");
  const hpM = milli(b.hp);
  const hitM = milli(b.hit);
  return {
    id: b.id,
    name: b.name,
    title: b.title,
    enemyId: b.enemyId,
    hpM,
    hitM,
    attackPowerBp: bp(b.attackPower),
    plateLength: [b.plateLength[0], b.plateLength[1]],
    phase1: {
      endAtHpBp: bp(b.phase1.endAtHpPct / 100),
      adds: b.phase1.adds.map(resolveRef),
      // T1.5 ruling: the adds are their EnemyDefs scaled by the level's encounter scaling. Their pool is the economy_sim's
      // BOSS_ADDS_HP_ENC (0.5 encounter units) of the boss's BOSS_HP_ENC (3.2): 752.9 x 0.5 / 3.2 = 117.6 at L10, i.e. 58.8
      // HP per add on average (the sim's two equal adds). The hit base is the level's own encounter gruntHit.
      addsHpPoolM: mulDiv(hpM, K.BOSS_ADDS_HP_NUM, K.BOSS_ADDS_HP_DEN),
      addsGruntHitM: levelGruntHitM ?? mulDiv(hitM, 10_000, K.BOSS_HIT_MULT_BP),
      addsAttackPowerBp: bp(b.phase1.addsAttackPower),
    },
    phase2: {
      endAtHpBp: bp(b.phase2.endAtHpPct / 100),
      doomEveryTicks: ticks(b.phase2.doomEveryS),
      minDoomSpells: b.phase2.minDoomSpells,
    },
    phase3: {
      minigame: {
        kind: mg.kind,
        lanes: mg.lanes,
        spawnEveryTicks: ticks(mg.spawnEveryS),
        fallTicks: ticks(mg.fallS),
        clearAtkMultBp: bp(mg.clearAtkMult),
        missHitM: milli(mg.missHit),
      },
      finisherText: b.phase3.finisherText,
    },
    breatherTicks: ticks(b.breatherS),
    introTicks: ticks(b.introS),
  };
}

const textsOf = (words: readonly WordEntry[], pred: (w: WordEntry) => boolean): string[] => {
  const out: string[] = [];
  for (const w of words) if (pred(w) && !out.includes(w.text)) out.push(w.text);
  return out;
};

/** Deterministic given (bundle contents, levelId, ctx). Fixtures are keyed on (contentVersion, levelId, ctx). */
export function resolveLevel(
  bundle: ContentBundle,
  levelId: string,
  ctx: { dueWeakWords: string[] },
): ResolvedLevel {
  const lv: LevelDef | undefined = bundle.levels.find((l) => l.id === levelId);
  if (lv === undefined) throw new SimError(`resolveLevel: unknown level ${levelId}`);
  const enemyDefs = (id: string): EnemyDef => {
    const d = bundle.enemies.find((e) => e.id === id);
    if (d === undefined) throw new SimError(`resolveLevel: unknown enemy ${id} in ${levelId}`);
    return d;
  };
  const enemies: Record<string, ResolvedEnemy> = {};
  const addEnemy = (id: string): void => {
    if (enemies[id] === undefined) enemies[id] = resolveEnemy(enemyDefs(id));
  };
  const seen: { boss: BossDef | null; gruntHitM: number | null } = { boss: null, gruntHitM: null };
  const segments: ResolvedSegment[] = lv.segments.map((s): ResolvedSegment => {
    if (s.kind === "walk") return { kind: "walk", ticks: ticks(s.seconds), heal: s.heal };
    if (s.kind === "boss") {
      const b = bundle.bosses.find((x) => x.id === s.bossId);
      if (b === undefined) throw new SimError(`resolveLevel: unknown boss ${s.bossId}`);
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
  // T1.6: plate pools keep only words whose length fits the level's plateLength (an all-filtered pool falls back to
  // the unfiltered one so a mis-tuned range can never leave a tier empty).
  const [lenLo, lenHi] = lv.plateLength;
  const fits = (w: WordEntry): boolean => w.text.length >= lenLo && w.text.length <= lenHi;
  // v2.0 pool scoping by WordEntry.chapter ("introduced in", absent = 1): sentence pools take an exact chapter match,
  // every other pool takes chapter <= the level's. So nothing authored for Ch2 can reach a Ch1 level (§13.1, D39).
  const chapterOf = (w: WordEntry): number => w.chapter ?? 1;
  const upToChapter = (w: WordEntry): boolean => chapterOf(w) <= lv.chapter;
  const exactChapter = (w: WordEntry): boolean => chapterOf(w) === lv.chapter;
  const plateWords = (pred: (w: WordEntry) => boolean): string[] => {
    const all = textsOf(bundle.words, (w) => w.uses.includes("plate") && upToChapter(w) && pred(w));
    const ok = textsOf(
      bundle.words,
      (w) => w.uses.includes("plate") && upToChapter(w) && pred(w) && fits(w),
    );
    return ok.length > 0 ? ok : all;
  };
  const usesWords = (use: WordEntry["uses"][number], sentence: boolean): string[] =>
    textsOf(
      bundle.words,
      (w) => w.uses.includes(use) && (sentence ? exactChapter(w) : upToChapter(w)),
    );
  const reviewBiomes = lv.reviewBiomes;
  // SRS weak words (the 5% weak share): ctx.dueWeakWords are SRS keys in due order (srsDue). Each becomes the authored
  // plate text of its bundle entry; unknown keys (content changed), non-plate entries and words outside the level's
  // plateLength are skipped. De-duplicated, due order kept.
  const weak: string[] = [];
  for (const key of ctx.dueWeakWords) {
    const entry = bundle.words.find(
      (w) =>
        w.kind === "word" &&
        w.uses.includes("plate") &&
        upToChapter(w) &&
        (w.key === key || w.key === key.toLowerCase()),
    );
    if (entry !== undefined && fits(entry) && !weak.includes(entry.text)) weak.push(entry.text);
  }
  const boss = seen.boss === null ? null : resolveBoss(seen.boss, seen.gruntHitM);
  return {
    levelId: lv.id,
    chapter: lv.chapter,
    index: lv.index,
    isBoss: lv.kind === "boss",
    contentVersion: fnv1a32(canonicalContentJson(bundle)).toString(16).padStart(8, "0"),
    segments,
    enemies,
    boss,
    words: {
      current: plateWords(
        (w) => w.tier === lv.wordTier && w.kind === "word" && w.biomes.length === 0,
      ),
      // v2.0: a level with reviewBiomes reviews those biomes' plate words at any tier (Ch2: the Ch1 biome words).
      review: plateWords(
        reviewBiomes === undefined
          ? (w) => w.tier < lv.wordTier && w.kind === "word" && w.biomes.length === 0
          : (w) => w.kind === "word" && w.biomes.some((b) => reviewBiomes.includes(b)),
      ),
      biome: plateWords((w) => w.biomes.includes(lv.biome)),
      weak,
      guard: usesWords("guard", false),
      doom: usesWords("doom", true),
      finisher: usesWords("finisher", true),
      secondWind: usesWords("secondWind", true),
      minigame: usesWords("minigame", true),
    },
    tierMixBp: {
      current: lv.tierMix.current * 100,
      review: lv.tierMix.review * 100,
      biome: lv.tierMix.biome * 100,
      weak: lv.tierMix.weak * 100,
    },
    plateLength: [lv.plateLength[0], lv.plateLength[1]],
    goldTotal: levelGold(lv.chapter, lv.index),
    parArmorBp: parArmorBp(lv.chapter),
    parHpM: parHpM(lv.chapter),
    star3: resolveStar3(lv.star3),
    parRefTicks: ticks(lv.parRefS),
    tutorial: lv.tutorial,
    foldSentences: lv.chapter <= K.SENTENCE_FOLD_CASE_MAX_CHAPTER,
  };
}

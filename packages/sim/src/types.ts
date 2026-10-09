// Published contract types (docs/interfaces.md v1.1 §3, §3.1 and the type parts of §8).
// Types only, plus NEW_PITY. Functions live in api.ts / resolve.ts / replay.ts (stubs until T1.2+).
import type { DamageType, GearSlot, Rarity, StarChallenge, WeaponArchetype } from "@hd2d/content";
import type { ChestTier, HitOrigin, PlateKind, SimEvent } from "./events.ts";
import type { Bp, Milli } from "./fixed.ts";
import type { EncounterState, RunState } from "./state.ts";
import type { Tick } from "./time.ts";
import type { SIM_VERSION } from "./version.ts";

export type ActiveSkillId =
  | "slashWave"
  | "piercingThrust"
  | "fireball"
  | "frostLock"
  | "mendingLight"
  | "aegis";
export type PassiveId =
  | "cleanCut"
  | "bulwarkStreak"
  | "steadyHands"
  | "riposte"
  | "ironWill"
  | "openingGambit"
  | "lastStand"
  | "comeback";
export type CastMode = "smart" | "asap";
export type ComboMode = "gentle" | "strict" | "zen";
export type Difficulty = "story" | "standard" | "hard" | "zen"; // zen: enemies never attack
export type Gimmick = "fading" | "scrambled";

export interface GearStats {
  tier: number;
  rarity: Rarity;
  upgrade: number;
}
/** Flattened, sim-ready loadout. Built by buildLoadout (§8) or parLoadout (tools). */
export interface Loadout {
  weapon: GearStats & { archetype: WeaponArchetype };
  armor: GearStats;
  charm: GearStats;
  actives: [ActiveSkillId | null, ActiveSkillId | null];
  activeModes: [CastMode, CastMode];
  passives: [PassiveId | null, PassiveId | null, PassiveId | null];
}

export interface LevelOptions {
  pace: number; // integer net WPM; createLevel clamps to 15..120. Locked for the level.
  difficulty: Difficulty;
  comboMode: ComboMode;
  caseMode: "auto" | "strict";
  autoUnlockAfterTypos: 0 | 3; // beginner auto-unlock (doc 01 §1.2); 0 = off
  firstClear: boolean; // chest odds 30% vs 15%, boss chest 100% vs 50%
  frontierChapter: number; // chest gear tier
  goldMultBp: Bp; // replay/stale/soft-cap multiplier from meta; 10_000 on first clear
  allowExternalRevive: boolean; // slice: false (gem revive hook)
  tutorial: boolean; // L1-1: TutorialCue events, gentler first guard (BALANCE.TUTORIAL_*)
}

// ---- Resolved (sim-input) data: integers only, produced by resolveLevel/resolveTrial ----
export interface ResolvedEnemyRef {
  enemyId: string;
  gimmick: Gimmick | null;
}
export type ResolvedSegment =
  | { kind: "walk"; ticks: number; heal: boolean }
  | {
      kind: "encounter";
      name: string;
      hpPoolM: Milli;
      gruntHitM: Milli;
      waves: ResolvedEnemyRef[][];
    }
  | { kind: "boss"; bossId: string };
export interface ResolvedEnemy {
  id: string;
  archetype: "grunt" | "brute" | "speedster" | "boss";
  baseIntervalTicks: number;
  heavy: boolean;
  plateLength: [min: number, max: number];
  weaknesses: DamageType[];
  shield: number;
  hpWeightBp: Bp;
  hitWeightBp: Bp; // enemy HP = hpPoolM * hpWeightBp / Σ weights in its wave; hit = gruntHitM * hitWeightBp / BP
}
export interface ResolvedBoss {
  id: string;
  name: string;
  title: string;
  enemyId: string;
  hpM: Milli;
  hitM: Milli;
  plateLength: [min: number, max: number];
  phase1: {
    endAtHpBp: Bp;
    adds: ResolvedEnemyRef[];
    /**
     * T1.5 (additive, optional). The adds' total HP pool and their grunt-hit base: each add gets
     * `addsHpPoolM x hpWeight / sum(hpWeights)` HP and `addsGruntHitM x hitWeight` per hit (the same rule as a normal
     * encounter, so the adds are the referenced EnemyDefs scaled by the level's encounter scaling). resolveLevel sets
     * them (pool = boss HP x 0.5/3.2 = economy_sim BOSS_ADDS_HP_ENC; hit = the level's encounter gruntHit). When absent the
     * sim derives the pool from the boss HP and the hit from `hitM / BOSS_HIT_MULT`.
     */
    addsHpPoolM?: Milli;
    addsGruntHitM?: Milli;
  };
  phase2: { endAtHpBp: Bp; doomEveryTicks: number; minDoomSpells: number };
  phase3: {
    minigame: {
      kind: "fallingRubble";
      lanes: number;
      spawnEveryTicks: number;
      fallTicks: number;
      clearAtkMultBp: Bp;
      missHitM: Milli;
    };
    finisherText: string;
  };
  breatherTicks: number;
  introTicks: number;
}
export interface ResolvedLevel {
  levelId: string;
  chapter: number;
  index: number;
  isBoss: boolean;
  contentVersion: string;
  segments: ResolvedSegment[];
  enemies: Record<string, ResolvedEnemy>; // by EnemyDef.id (lookup only; never iterated for logic)
  boss: ResolvedBoss | null;
  words: {
    current: string[];
    review: string[];
    biome: string[];
    weak: string[]; // weak = SRS due list for this attempt
    guard: string[];
    doom: string[];
    finisher: string[];
    secondWind: string[];
    minigame: string[];
  };
  tierMixBp: { current: Bp; review: Bp; biome: Bp; weak: Bp }; // 6000/2000/1500/500; an empty pool's weight goes to current
  plateLength: [min: number, max: number];
  goldTotal: number; // levelGold(chapter, index); options.goldMultBp applies on top
  parHpM: Milli; // computeHeroStats(parLoadout(chapter)).maxHp (Doom Spell damage base)
  star3: StarChallenge;
  parRefTicks: number;
  tutorial: boolean;
}

export interface Snapshot<S> {
  simVersion: typeof SIM_VERSION;
  state: S;
}

export interface ReplayResult<S, R> {
  finalState: S;
  events: SimEvent[];
  hash: string;
  result: R | null;
}

export interface ResolvedTrial {
  trialId: string;
  durationTicks: number;
  passages: string[];
  contentVersion: string;
}

export interface TrialResult {
  correctChars: number;
  typos: number; // spaces count as chars (D25)
  wpmX100: number; // floor(correctChars * 60 * 100 * TICK_HZ / (5 * durationTicks)) = correctChars*20 for 60 s
  accuracyBp: Bp; // floor(correct * BP / (correct + typos)); BP if no keys
  durationTicks: number;
}

export type LevelPhase =
  | "walk" // auto-walk segment; keys ignored
  | "encounterIntro" // enemies enter, "Ready… Type!"; keys ignored until typingFromTick
  | "bossIntro" // keys ignored
  | "combat" // typing live
  | "bossBreather" // 2 s phase-transition breather; keys ignored
  | "secondWind" // only the Second Wind plate accepts keys; encounter frozen
  | "downed" // awaiting a 'revive' command (only if allowExternalRevive)
  | "rewards" // post-encounter loot burst; keys ignored
  | "cleared"
  | "failed"; // terminal

export interface LevelState {
  kind: "level";
  simVersion: 1;
  tick: Tick;
  seed: number;
  phase: LevelPhase;
  phaseUntil: Tick | null;
  segmentIndex: number;
  nextId: number; // id allocator for enemies (>= 1) and plates
  run: RunState; // whole level: hero HP, combo + latch, keyStreak, skill charge, stats, gold, chests, word results
  enc: EncounterState | null; // current encounter: enemies, plates, target, focus, ATB, encounter rng streams, boss script
}
export interface TrialState {
  kind: "trial";
  simVersion: 1;
  tick: Tick;
  seed: number;
  // ---- sim-internal (trial.ts); plain data ----
  trialId: string;
  durationTicks: number;
  passage: string;
  started: boolean; // true after the first accepted key (the client clock origin, D25)
  typedIndex: number; // chars [0, typedIndex) are typed; stop-on-error: a typo does not advance it
  correctChars: number;
  typos: number;
  keyStreak: number;
  keyStreakTier: 0 | 1 | 2 | 3 | 4;
  lastTypoTick: number; // -1 = none
}
/** Sim-internal shapes (plain data); real definitions live in state.ts (T1.2). Re-exported under the contract names. */
export type { EncounterState, RunState } from "./state.ts";

// ---- §8 shared meta types ----
export interface CachePity {
  sinceRare: number;
  sinceEpic: number;
  sinceLegendary: number;
}
export const NEW_PITY: CachePity = { sinceRare: 0, sinceEpic: 0, sinceLegendary: 0 };
export interface GearRoll {
  slot: GearSlot;
  tier: number;
  rarity: Rarity;
  archetype: WeaponArchetype | null;
}
export interface ChestContents {
  tier: ChestTier;
  gold: number;
  gear: GearRoll | null;
  caches: number;
  gemsUncredited: number;
}

// ---- loadouts (used by the client, tools/balance and tools/bot) ----
/** Structural subset of the save blob (SaveBlob from @hd2d/shared is assignable to it; shared has a type test). */
export interface LoadoutSource {
  inventory: { gear: readonly { uid: number; defId: string; rarity: Rarity; upgrade: number }[] };
  equipped: { weapon: number; armor: number; charm: number };
  loadout: {
    actives: readonly [string | null, string | null];
    activeModes: readonly [CastMode, CastMode];
    passives: readonly [string | null, string | null, string | null];
  };
}

export interface SrsEntry {
  box: 1 | 2 | 3 | 4 | 5;
  due: number;
  lapses: number;
}
export interface SrsState {
  levelsPlayed: number;
  entries: Record<string, SrsEntry>;
  mastered: string[];
}

export interface WordResult {
  wordKey: string;
  text: string;
  kind: PlateKind;
  perfect: boolean;
  typos: number;
  wpm: number;
}
export interface LevelResult {
  levelId: string;
  outcome: "cleared" | "failed";
  failReason: "defeated" | "abandoned" | "timeout" | null;
  durationTicks: number;
  activeTicks: number;
  gold: number;
  chests: ChestContents[];
  stats: {
    correctChars: number;
    typos: number;
    wordsCompleted: number;
    perfectWords: number;
    maxCombo: number;
    maxKeyStreak: number;
    netWpmX100: number;
    accuracyBp: Bp;
    hitsTaken: number;
    blocks: number;
    perfectParries: number;
    autoAttacks: number;
    skillsCast: number;
    secondWindUsed: boolean;
    damageByOriginM: Record<HitOrigin, number>; // skill share = skill / Σ (T1.4 AC)
    /** T1.4 (additive): actual HP removed by each active skill, burn included (per-skill tuning, T6.1). */
    damageBySkillM?: Record<ActiveSkillId, number>;
  };
  words: WordResult[]; // every completed or typo'd word/guard plate, in order
}

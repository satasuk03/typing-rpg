import type { DamageType, GearSlot, Rarity, WeaponArchetype } from "@hd2d/content";
import type { Tick } from "./time.ts";
import type { ActiveSkillId, CachePity, PassiveId, TrialResult } from "./types.ts";

export type EntityId = number;
export type PlateId = number;
export type PlateKind =
  | "word"
  | "guard"
  | "doom"
  | "minigame"
  | "finisher"
  | "secondWind"
  | "trial";
export type ComboTier = 0 | 1 | 2 | 3 | 4; // mechanical: none, bronze 5, silver 15, gold 30, radiant 50 (perfect words)
export type KeyStreakTier = 0 | 1 | 2 | 3 | 4; // VFX: white, gold 10, ember 25, azure 50, prismatic 100 (correct keys)
export type HitKind = "auto" | "chip" | "skill" | "counter" | "dot" | "minigame" | "finisher";
/** What a damage instance is attributed to (skill-share metric). DoT inherits its applier: bleed -> weapon, burn -> skill. */
export type HitOrigin = "weapon" | "chip" | "skill" | "counter" | "minigame" | "finisher";
export type StatusId = "burn" | "bleed" | "freeze" | "stagger" | "barrier";
export type ChestTier = "Wooden" | "Iron" | "Gold" | "Mythic";
export type TargetDropReason =
  | "escape"
  | "autoUnlock"
  | "plateChanged"
  | "ownerDied"
  | "phaseChanged";

type Ev<T extends string, P extends object = Record<never, never>> = { type: T; tick: Tick } & P;

export type SimEvent =
  // ---- flow ----
  | Ev<
      "LevelStarted",
      { levelId: string; chapter: number; isBossLevel: boolean; encounterCount: number }
    >
  | Ev<"WalkStarted", { segmentIndex: number; untilTick: Tick; heals: boolean }>
  | Ev<"WalkEnded", { segmentIndex: number }>
  | Ev<
      "EncounterStarted",
      {
        encounterIndex: number;
        name: string;
        isBoss: boolean;
        waveCount: number;
        typingFromTick: Tick;
      }
    >
  | Ev<"WaveStarted", { encounterIndex: number; waveIndex: number; enemyIds: EntityId[] }>
  | Ev<
      "EnemySpawned",
      {
        enemyId: EntityId;
        defId: string;
        slot: number;
        maxHp: number;
        isBoss: boolean;
        shieldMax: number;
      }
    >
  | Ev<"EncounterCleared", { encounterIndex: number; durationTicks: number }>
  | Ev<"LevelCleared", { levelId: string; durationTicks: number; gold: number }>
  | Ev<"LevelFailed", { reason: "defeated" | "abandoned" | "timeout"; goldKept: number }>
  | Ev<"TutorialCue", { cue: "target" | "atb" | "guard" | "skill" | "combo" }>
  // ---- plates & typing (plateId + index locate the letter; keyStreakTier drives colour, combo drives aura) ----
  | Ev<
      "PlateShown",
      {
        plateId: PlateId;
        ownerId: EntityId | null;
        kind: PlateKind;
        text: string;
        display: string;
        lane: number | null;
        replacesPlateId: PlateId | null;
      }
    >
  | Ev<
      "PlateRemoved",
      {
        plateId: PlateId;
        reason: "completed" | "replaced" | "ownerDied" | "expired" | "phaseEnded";
      }
    >
  | Ev<"TargetAcquired", { plateId: PlateId; ownerId: EntityId | null }>
  | Ev<"TargetDropped", { plateId: PlateId; ownerId: EntityId | null; reason: TargetDropReason }>
  | Ev<
      "CharCorrect",
      {
        plateId: PlateId;
        ownerId: EntityId | null;
        kind: PlateKind;
        index: number;
        char: string;
        isLast: boolean;
        combo: number;
        comboTier: ComboTier;
        keyStreak: number;
        keyStreakTier: KeyStreakTier;
        atbGainM: number;
      }
    >
  | Ev<
      "Typo",
      {
        plateId: PlateId | null;
        ownerId: EntityId | null;
        kind: PlateKind | null;
        index: number;
        expected: string | null;
        got: string;
        comboBefore: number;
        combo: number;
        keyStreakBefore: number;
        penalty: "halved" | "reset" | "none" | "latched" | "forgiven";
      }
    >
  | Ev<
      "WordCompleted",
      {
        plateId: PlateId;
        ownerId: EntityId | null;
        kind: PlateKind;
        text: string;
        wordKey: string;
        perfect: boolean;
        swift: boolean;
        atbGainM: number;
        combo: number;
      }
    >
  | Ev<
      "SentenceWordDone",
      { plateId: PlateId; kind: PlateKind; wordIndex: number; wordCount: number }
    > // projectile per word (T2.6)
  | Ev<"ComboTierChanged", { from: ComboTier; to: ComboTier; combo: number }>
  | Ev<"KeyStreakTierChanged", { from: KeyStreakTier; to: KeyStreakTier; keyStreak: number }>
  | Ev<"BurstWpm", { wpm: number; band: "swift" | "blazing" }>
  // ---- defense ----
  | Ev<"EnemyAttackWindup", { enemyId: EntityId; impactTick: Tick; heavy: boolean }>
  | Ev<
      "GuardWordShown",
      { enemyId: EntityId; plateId: PlateId; text: string; impactTick: Tick; spanTicks: number }
    >
  | Ev<
      "GuardWordTyped",
      { enemyId: EntityId; plateId: PlateId; perfect: boolean; result: "block" | "parry" }
    >
  | Ev<"GuardBlocked", { enemyId: EntityId; damage: number }>
  | Ev<"GuardParried", { enemyId: EntityId; counterDamage: number }> // the counter itself is Hit{kind:"counter"}
  // ---- ATB & hero offense ----
  | Ev<"AtbFilled", { overflowM: number }>
  | Ev<
      "AutoAttack",
      {
        targetId: EntityId;
        archetype: WeaponArchetype;
        hits: number;
        impactTick: Tick;
        crit: boolean;
      }
    >
  | Ev<
      "Hit",
      {
        sourceId: EntityId;
        targetId: EntityId;
        kind: HitKind;
        origin: HitOrigin;
        skillId: ActiveSkillId | null;
        damageType: DamageType | null;
        damage: number;
        damageM: number;
        hpAfter: number;
        maxHp: number;
        crit: boolean;
        weak: boolean;
        broken: boolean;
        atbKnockback: boolean;
        hitIndex: number;
        hitCount: number;
        killed: boolean;
      }
    >
  | Ev<"WeaknessRevealed", { enemyId: EntityId; damageType: DamageType }>
  | Ev<"ShieldDamaged", { enemyId: EntityId; shield: number; shieldMax: number }>
  | Ev<"Break", { enemyId: EntityId; untilTick: Tick }>
  | Ev<"BreakEnded", { enemyId: EntityId }>
  | Ev<
      "StatusApplied",
      {
        targetId: EntityId;
        status: StatusId;
        untilTick: Tick | null;
        stacks: number;
        origin: HitOrigin | null;
        skillId: ActiveSkillId | null;
      }
    >
  | Ev<"StatusEnded", { targetId: EntityId; status: StatusId }>
  | Ev<"FocusChanged", { enemyId: EntityId | null }>
  // ---- enemy offense & hero state ----
  | Ev<
      "EnemyAttack",
      { enemyId: EntityId; outcome: "hit" | "blocked" | "parried" | "barrier"; damage: number }
    >
  | Ev<
      "HeroDamaged",
      {
        sourceId: EntityId | null;
        cause: "attack" | "doom" | "minigame";
        damage: number;
        hpAfter: number;
        maxHp: number;
        blocked: boolean;
      }
    >
  | Ev<
      "HeroHealed",
      {
        cause: "walk" | "skill" | "phase" | "secondWind" | "revive" | "passive";
        amount: number;
        hpAfter: number;
        maxHp: number;
      }
    >
  | Ev<"EnemyDeath", { enemyId: EntityId; defId: string; isBoss: boolean; byKind: HitKind }>
  | Ev<"HeroDowned", { secondWindAvailable: boolean }>
  | Ev<"SecondWindStarted", { plateId: PlateId; text: string; deadlineTick: Tick }>
  | Ev<"SecondWindSucceeded", { hpAfter: number; maxHp: number }>
  | Ev<"SecondWindFailed">
  | Ev<"Revived", { source: "gem" | "feather"; hpAfter: number }> // hook; never emitted in the slice
  // ---- skills ----
  | Ev<"SkillCharged", { slot: 0 | 1; skillId: ActiveSkillId }>
  | Ev<
      "SkillCast",
      { slot: 0 | 1; skillId: ActiveSkillId; targetIds: EntityId[]; impactTick: Tick }
    >
  | Ev<"PassiveTriggered", { passiveId: PassiveId; targetId: EntityId | null }>
  // ---- gimmicks ----
  | Ev<"WordFaded", { plateId: PlateId; enemyId: EntityId }>
  | Ev<"WordScrambled", { plateId: PlateId; enemyId: EntityId; display: string }>
  | Ev<"WordUnscrambled", { plateId: PlateId; enemyId: EntityId }>
  // ---- boss ----
  | Ev<
      "BossIntroStarted",
      { enemyId: EntityId; bossId: string; name: string; title: string; untilTick: Tick }
    >
  | Ev<
      "BossPhaseChanged",
      { enemyId: EntityId; from: 1 | 2 | 3; to: 1 | 2 | 3; breatherUntilTick: Tick }
    >
  | Ev<
      "DoomSpellStarted",
      { enemyId: EntityId; plateId: PlateId; text: string; deadlineTick: Tick }
    >
  | Ev<"DoomSpellCompleted", { enemyId: EntityId; plateId: PlateId; staggerUntilTick: Tick }>
  | Ev<"DoomSpellFailed", { enemyId: EntityId; plateId: PlateId; damage: number }>
  | Ev<"MinigameStarted", { enemyId: EntityId; kind: "fallingRubble"; lanes: number }>
  | Ev<"MinigameWordSpawned", { plateId: PlateId; text: string; lane: number; landTick: Tick }>
  | Ev<"MinigameWordCleared", { plateId: PlateId; lane: number }>
  | Ev<"MinigameWordMissed", { plateId: PlateId; lane: number; damage: number }>
  | Ev<"MinigameEnded", { cleared: number; missed: number }>
  | Ev<"FinisherShown", { enemyId: EntityId; plateId: PlateId; text: string }>
  | Ev<"FinisherCompleted", { enemyId: EntityId; plateId: PlateId }>
  // ---- rewards ----
  | Ev<"GoldGained", { amount: number; source: "encounter" | "passive"; total: number }>
  | Ev<"ChestDropped", { tier: ChestTier; encounterIndex: number; enemyId: EntityId | null }>
  // ---- trial ----
  | Ev<"TrialStarted", { trialId: string; durationTicks: number; passageLength: number }>
  | Ev<"TrialEnded", { result: TrialResult }>;

export const ALL_EVENT_TYPES = [
  "LevelStarted",
  "WalkStarted",
  "WalkEnded",
  "EncounterStarted",
  "WaveStarted",
  "EnemySpawned",
  "EncounterCleared",
  "LevelCleared",
  "LevelFailed",
  "TutorialCue",
  "PlateShown",
  "PlateRemoved",
  "TargetAcquired",
  "TargetDropped",
  "CharCorrect",
  "Typo",
  "WordCompleted",
  "SentenceWordDone",
  "ComboTierChanged",
  "KeyStreakTierChanged",
  "BurstWpm",
  "EnemyAttackWindup",
  "GuardWordShown",
  "GuardWordTyped",
  "GuardBlocked",
  "GuardParried",
  "AtbFilled",
  "AutoAttack",
  "Hit",
  "WeaknessRevealed",
  "ShieldDamaged",
  "Break",
  "BreakEnded",
  "StatusApplied",
  "StatusEnded",
  "FocusChanged",
  "EnemyAttack",
  "HeroDamaged",
  "HeroHealed",
  "EnemyDeath",
  "HeroDowned",
  "SecondWindStarted",
  "SecondWindSucceeded",
  "SecondWindFailed",
  "Revived",
  "SkillCharged",
  "SkillCast",
  "PassiveTriggered",
  "WordFaded",
  "WordScrambled",
  "WordUnscrambled",
  "BossIntroStarted",
  "BossPhaseChanged",
  "DoomSpellStarted",
  "DoomSpellCompleted",
  "DoomSpellFailed",
  "MinigameStarted",
  "MinigameWordSpawned",
  "MinigameWordCleared",
  "MinigameWordMissed",
  "MinigameEnded",
  "FinisherShown",
  "FinisherCompleted",
  "GoldGained",
  "ChestDropped",
  "TrialStarted",
  "TrialEnded",
] as const satisfies readonly SimEvent["type"][];

export type SimEventType = (typeof ALL_EVENT_TYPES)[number];
export type EventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;
// Compile-time exhaustiveness: fails to typecheck if the union gains a type the array lacks.
type MissingEventTypes = Exclude<SimEvent["type"], SimEventType>;
export const EVENT_TYPES_EXHAUSTIVE: [MissingEventTypes] extends [never]
  ? true
  : MissingEventTypes = true;

/** T2.3: level/eventBindings.ts must provide a full map (missing keys = type error). */
export type EventHandlers = { [K in SimEventType]: (e: EventOf<K>) => void };

// ---- Meta events: produced by §8 meta functions (cache-opening screen), not by the level stream. No tick. ----
export type MetaEvent =
  | {
      type: "CacheRolled";
      rarity: Rarity;
      slot: GearSlot;
      tier: number;
      archetype: WeaponArchetype | null;
      guaranteed: "none" | "rare" | "epic" | "legendary";
      pity: CachePity;
    }
  | { type: "ChestOpened"; tier: ChestTier; gold: number; gearCount: number; caches: number }
  | { type: "GearUpgraded"; gearUid: number; upgrade: number; cost: number };
export const ALL_META_EVENT_TYPES = [
  "CacheRolled",
  "ChestOpened",
  "GearUpgraded",
] as const satisfies readonly MetaEvent["type"][];

import type { MusicState, Sfx, SfxParams } from "./types";

/**
 * Event -> audio binding table (T2.5; T2.3 merges this into level/eventBindings.ts).
 * Local structural event type so this module does not depend on @hd2d/sim (interfaces.md v1.1 is in flux).
 */
export interface AudioEventLike {
  type: string;
  [k: string]: unknown;
}

/** The slice of AudioEngine that bindings need (lets tests pass a recorder). */
export interface AudioApi {
  play(id: Sfx, params?: SfxParams): unknown;
  setMusicState(state: MusicState): void;
}

export type AudioHandler = (e: AudioEventLike, a: AudioApi) => void;

/** Copy of interfaces.md section 4 `ALL_EVENT_TYPES` (sim events). Keep in sync on interface bumps. */
export const KNOWN_SIM_EVENTS = [
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
] as const;

/** Copy of interfaces.md section 4 `ALL_META_EVENT_TYPES`. */
export const KNOWN_META_EVENTS = ["CacheRolled", "ChestOpened", "GearUpgraded"] as const;

export const KNOWN_EVENTS: readonly string[] = [...KNOWN_SIM_EVENTS, ...KNOWN_META_EVENTS];

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/** Sim events that intentionally make no sound (visual/HUD only). Together with the table they cover every event. */
export const AUDIO_SILENT_EVENTS: readonly string[] = [
  "LevelStarted",
  "WalkEnded",
  "WaveStarted",
  "EnemySpawned",
  "LevelFailed",
  "TutorialCue",
  "PlateShown",
  "PlateRemoved",
  "TargetAcquired",
  "TargetDropped",
  "ComboTierChanged", // streak-tier sting is fired from CharCorrect (per-key streak 10/25/50/100, PO decision)
  "BurstWpm",
  "GuardWordShown",
  "GuardWordTyped",
  "AtbFilled",
  "WeaknessRevealed",
  "ShieldDamaged",
  "BreakEnded",
  "StatusApplied",
  "StatusEnded",
  "FocusChanged",
  "EnemyAttack",
  "SkillCharged",
  "PassiveTriggered",
  "WordFaded",
  "WordScrambled",
  "WordUnscrambled",
  "BossPhaseChanged",
  "MinigameStarted",
  "MinigameWordSpawned",
  "MinigameEnded",
  "FinisherShown",
  "SecondWindStarted",
  "SecondWindFailed",
  "Revived",
  "TrialStarted",
  "CacheRolled",
  "GearUpgraded",
];

/** Table-driven bindings: event type string -> handler. */
export const AUDIO_BINDINGS: Readonly<Record<string, AudioHandler>> = {
  // flow / music state
  WalkStarted: (_e, a) => a.setMusicState("walk"),
  EncounterStarted: (e, a) => {
    if (e.isBoss === true) a.setMusicState("boss");
    else {
      a.setMusicState("battle");
      a.play("encounter");
    }
  },
  EncounterCleared: (_e, a) => a.setMusicState("walk"),
  LevelCleared: (_e, a) => {
    a.setMusicState("victory");
    a.play("victory");
  },
  TrialEnded: (_e, a) => a.play("levelUp"),

  // typing
  CharCorrect: (e, a) => a.play("key", { streak: num(e.streak) }),
  Typo: (_e, a) => a.play("typo"),
  WordCompleted: (e, a) =>
    a.play(e.perfect === true ? "perfectWord" : "wordComplete", { count: num(e.combo) }),
  SentenceWordDone: (_e, a) => a.play("wordComplete"),
  MinigameWordCleared: (_e, a) => a.play("wordComplete"),
  MinigameWordMissed: (_e, a) => a.play("heroHurt"),

  // defense
  EnemyAttackWindup: (e, a) => a.play("enemyWindup", { heavy: e.heavy === true }),
  GuardBlocked: (_e, a) => a.play("guard"),
  GuardParried: (_e, a) => a.play("parry"),
  HeroDamaged: (e, a) => {
    if (e.blocked !== true) a.play("heroHurt");
  },
  HeroDowned: (_e, a) => a.play("heroHurt", { heavy: true }),
  HeroHealed: (_e, a) => a.play("heal"),
  SecondWindSucceeded: (_e, a) => a.play("heal"),

  // offense
  AutoAttack: (e, a) => a.play("slash", { heavy: e.crit === true }),
  Hit: (e, a) => a.play(e.crit === true ? "crit" : "hit", { heavy: e.killed === true }),
  Break: (_e, a) => a.play("break"),
  EnemyDeath: (e, a) => a.play("enemyDeath", { boss: e.isBoss === true }),
  SkillCast: (e, a) => a.play(e.skillId === "fireball" ? "skillFire" : "skillMagic"),
  FinisherCompleted: (_e, a) => a.play("crit"),

  // boss
  BossIntroStarted: (_e, a) => {
    a.play("bossIntro");
    a.setMusicState("boss");
  },
  DoomSpellStarted: (_e, a) => a.play("enemyWindup", { heavy: true }),
  DoomSpellCompleted: (_e, a) => a.play("break"),
  DoomSpellFailed: (_e, a) => a.play("heroHurt", { heavy: true }),

  // rewards
  GoldGained: (_e, a) => a.play("coin", { count: 6 }),
  ChestDropped: (_e, a) => a.play("chestLand"),
  ChestOpened: (_e, a) => {
    a.play("chestOpen");
    a.play("coin");
  },
};

/** Dispatch one event; unknown/silent events are ignored. Returns true when a handler ran. */
export function dispatchAudioEvent(e: AudioEventLike, api: AudioApi): boolean {
  const h = AUDIO_BINDINGS[e.type];
  if (!h) return false;
  h(e, api);
  return true;
}

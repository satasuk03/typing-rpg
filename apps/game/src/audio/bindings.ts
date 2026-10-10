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
  /** Ch2 (T3.3), optional so test recorders and older callers keep working. */
  setBossPhase?(phase: 1 | 2 | 3): void;
  setBossFreed?(freed: boolean): void;
  setWhisper?(on: boolean): void;
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
  "EnemyHealed", // interfaces v2.0
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
  "RiddleStarted", // interfaces v2.0
  "RiddleLeafPicked", // interfaces v2.0
  "RiddleResolved", // interfaces v2.0
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
  "LevelFailed",
  "TutorialCue",
  "PlateShown",
  "PlateRemoved",
  "TargetAcquired",
  "TargetDropped",
  "ComboTierChanged", // word-combo tier (5/15/30/50): silent; the key-streak sting is the only tier cue
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
  "SkillCharged",
  "PassiveTriggered",
  "WordFaded",
  "WordScrambled",
  "WordUnscrambled",
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

/**
 * Ch2 (T3.3): enemy kind by entity id, filled from `EnemySpawned.defId` so later events that only carry an
 * `enemyId` (attack, death, phase change, Hush Spell) can pick the right creature sound. Ch1 enemies (slimes,
 * bats, goblins, golem...) match none of these kinds, so Ch1 audio is untouched.
 */
type Ch2Kind = "wisp" | "shade" | "moth" | "toad" | "wolf" | "willow";
const CH2_KINDS: readonly Ch2Kind[] = ["wisp", "shade", "moth", "toad", "wolf", "willow"];
const kindOf = new Map<number, Ch2Kind>();
const kindFor = (id: unknown): Ch2Kind | undefined =>
  typeof id === "number" ? kindOf.get(id) : undefined;
let lastHeal = { source: -1, tick: -1 };

/** Test hook: forget remembered enemies and the heal de-dupe state. */
export function resetAudioBindingState(): void {
  kindOf.clear();
  lastHeal = { source: -1, tick: -1 };
}

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
  LevelCleared: (e, a) => {
    a.setMusicState("victory");
    // Ch2 finale (L10): the bell-voiced chapter sting (delayed internally so the Willow's sigh lands first).
    a.play(e.levelId === "ch2-l10" ? "chapterSting" : "victory");
  },
  TrialEnded: (_e, a) => a.play("levelUp"),

  // typing
  // Ch2: a capital typed exactly (`shifted`, Ch2+ only) gets the deeper-click accent instead of the plain key.
  CharCorrect: (e, a) =>
    a.play(e.shifted === true ? "capitalKey" : "key", { streak: num(e.keyStreak) }),
  KeyStreakTierChanged: (e, a) => {
    if (num(e.to) > num(e.from)) a.play("tierUp", { tier: num(e.to) });
  },
  Typo: (e, a) => a.play("typo", { heavy: e.kind === "guard" }),
  WordCompleted: (e, a) =>
    a.play(e.perfect === true ? "perfectWord" : "wordComplete", { count: num(e.combo) }),
  SentenceWordDone: (_e, a) => a.play("wordComplete"),
  MinigameWordCleared: (_e, a) => a.play("wordComplete"),
  MinigameWordMissed: (_e, a) => a.play("heroHurt"),

  // Ch2 enemies (T3.3). Spawn: a creature cue per kind; an elite adds the wolf howl telegraph.
  EnemySpawned: (e, a) => {
    const def = typeof e.defId === "string" ? e.defId : "";
    const kind = CH2_KINDS.find((k) => def.includes(k));
    if (kind) kindOf.set(num(e.enemyId), kind);
    if (e.elite === true) a.play("wolfHowl");
    else if (kind === "wisp") a.play("wispChime");
    else if (kind === "shade") a.play("shadeHiss");
    else if (kind === "moth") a.play("mothFlutter");
    else if (kind === "willow") a.play("willowCreak");
  },
  // The impact of a toad slam / wolf bite (Ch1 attacks stay silent here; their windup and HeroDamaged cover them).
  EnemyAttack: (e, a) => {
    const k = kindFor(e.enemyId);
    if (k === "toad") a.play("toadSplash");
    else if (k === "wolf") a.play("wolfBite");
  },
  // A healer cast heals every other enemy at once: one chime per (source, tick), not per target.
  EnemyHealed: (e, a) => {
    const source = num(e.sourceId);
    const tick = num(e.tick);
    if (lastHeal.source === source && lastHeal.tick === tick) return;
    lastHeal = { source, tick };
    a.play("healChime");
  },

  // Riddle of Leaves (Willow phase 3)
  RiddleStarted: (_e, a) => a.play("leafRustle"),
  RiddleLeafPicked: (e, a) => a.play("leafPick", { pan: (num(e.lane) - 1) * 0.5 }),
  RiddleResolved: (e, a) => {
    if (e.outcome === "right") a.play("riddleRight");
    else if (e.outcome === "timeout") a.play("riddleTimeout");
    else a.play("riddleWrong");
  },

  // defense
  EnemyAttackWindup: (e, a) => {
    a.play("enemyWindup", { heavy: e.heavy === true });
    if (kindFor(e.enemyId) === "toad") a.play("toadCroak"); // the ribbit telegraphs the slam
  },
  GuardBlocked: (e, a) => a.play("guard", { leak: num(e.leakDamage) > 0 }),
  GuardParried: (e, a) => a.play("parry", { leak: num(e.leakDamage) > 0 }),
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
  EnemyDeath: (e, a) => {
    const k = kindFor(e.enemyId);
    kindOf.delete(num(e.enemyId));
    if (k === "willow") {
      // The Willow is freed, not destroyed: a warm sigh and the theme resolves to major (no shatter).
      a.setWhisper?.(false);
      a.setBossFreed?.(true);
      a.play("willowSigh");
    } else a.play("enemyDeath", { boss: e.isBoss === true });
  },
  SkillCast: (e, a) => a.play(e.skillId === "fireball" ? "skillFire" : "skillMagic"),
  FinisherCompleted: (_e, a) => a.play("crit"),

  // boss
  BossIntroStarted: (_e, a) => {
    a.play("bossIntro");
    a.setMusicState("boss");
  },
  // Willow phase change: a leaf storm and a creak, and the grove theme follows the phase.
  BossPhaseChanged: (e, a) => {
    if (kindFor(e.enemyId) !== "willow") return;
    a.play("leafStorm");
    a.play("willowCreak");
    const to = num(e.to);
    if (to === 1 || to === 2 || to === 3) a.setBossPhase?.(to);
  },
  DoomSpellStarted: (e, a) => {
    a.play("enemyWindup", { heavy: true });
    if (kindFor(e.enemyId) === "willow") a.setWhisper?.(true); // held until the Hush Spell ends
  },
  DoomSpellCompleted: (_e, a) => {
    a.setWhisper?.(false);
    a.play("break");
  },
  DoomSpellFailed: (_e, a) => {
    a.setWhisper?.(false);
    a.play("heroHurt", { heavy: true });
  },

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

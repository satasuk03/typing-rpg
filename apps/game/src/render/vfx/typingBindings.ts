/**
 * The typing-VFX event -> effect binding table (spec §11), as data. Every sim event the typing VFX react to
 * is listed with the layers that handle it:
 *
 *   hud    `TypingHudFx.onEvent`     (HUD canvas: pops, sparks, glyphs, orbs, rings, shatter)
 *   world  `TypingWorldFx.onEvent`   (diorama: aura, barrier, bolts, cinematic, lights, camera)
 *   queue  `TypingFxHandle.onEvent`  (the presentation queue: deferral, holds, flush)
 *
 * `tests/vfx/bindingCoverage.test.ts` reads the three sources and asserts that every row has a `case` (or, for
 * the queue, a branch) in each layer it names, that every key is a real sim event type, and that none of the
 * events the spec lists is missing. A new typing effect without a row here, or a row without code, fails.
 */
import type { SimEventType } from "@hd2d/sim";

export type TypingLayer = "hud" | "world" | "queue";

export const TYPING_BINDINGS: Readonly<Partial<Record<SimEventType, readonly TypingLayer[]>>> = {
  // per key and typing state
  TargetAcquired: ["hud"],
  CharCorrect: ["hud", "world"],
  Typo: ["hud", "world"],
  KeyStreakTierChanged: ["hud", "world"],
  ComboTierChanged: ["world"],
  BurstWpm: ["hud"],
  // word complete
  WordCompleted: ["hud", "world"],
  Hit: ["queue"],
  PlateRemoved: ["hud", "world"],
  SentenceWordDone: ["hud"],
  // ATB
  AtbFilled: ["hud", "world"],
  AutoAttack: ["world"],
  // guard
  GuardWordShown: ["hud", "world"],
  GuardWordTyped: ["hud", "world"],
  GuardBlocked: ["world"],
  GuardParried: ["world"],
  EnemyAttack: ["hud", "world"],
  // finisher
  FinisherShown: ["world"],
  FinisherCompleted: ["hud", "world", "queue"],
  EnemyDeath: ["world", "queue"],
  // level flow
  LevelStarted: ["hud", "world", "queue"],
  EncounterCleared: ["world", "queue"],
  LevelCleared: ["hud", "world", "queue"],
  LevelFailed: ["hud", "world", "queue"],
};

/** The events spec §11 lists as typing-relevant: each must have a binding row. */
export const SPEC_TYPING_EVENTS: readonly SimEventType[] = [
  "TargetAcquired",
  "CharCorrect",
  "Typo",
  "KeyStreakTierChanged",
  "ComboTierChanged",
  "BurstWpm",
  "WordCompleted",
  "Hit",
  "PlateRemoved",
  "SentenceWordDone",
  "AtbFilled",
  "AutoAttack",
  "GuardWordShown",
  "GuardWordTyped",
  "GuardBlocked",
  "GuardParried",
  "EnemyAttack",
  "FinisherShown",
  "FinisherCompleted",
  "EncounterCleared",
  "LevelCleared",
  "LevelFailed",
];

import { describe, expect, expectTypeOf, test } from "vitest";
import {
  ALL_EVENT_TYPES,
  type ALL_META_EVENT_TYPES,
  dispatchEvent,
  dispatchEvents,
  EVENT_TYPES_EXHAUSTIVE,
  type EventHandlers,
  type EventOf,
  type MetaEvent,
  type SimEvent,
  type SimEventType,
} from "../src/index.ts";

/** A FULL handler map: if the event union gains a member, this stops compiling until it is added here. */
const noop: EventHandlers = {
  LevelStarted: () => {},
  WalkStarted: () => {},
  WalkEnded: () => {},
  EncounterStarted: () => {},
  WaveStarted: () => {},
  EnemySpawned: () => {},
  EncounterCleared: () => {},
  LevelCleared: () => {},
  LevelFailed: () => {},
  TutorialCue: () => {},
  PlateShown: () => {},
  PlateRemoved: () => {},
  TargetAcquired: () => {},
  TargetDropped: () => {},
  CharCorrect: () => {},
  Typo: () => {},
  WordCompleted: () => {},
  SentenceWordDone: () => {},
  ComboTierChanged: () => {},
  KeyStreakTierChanged: () => {},
  BurstWpm: () => {},
  EnemyAttackWindup: () => {},
  GuardWordShown: () => {},
  GuardWordTyped: () => {},
  GuardBlocked: () => {},
  GuardParried: () => {},
  AtbFilled: () => {},
  AutoAttack: () => {},
  Hit: () => {},
  WeaknessRevealed: () => {},
  ShieldDamaged: () => {},
  Break: () => {},
  BreakEnded: () => {},
  StatusApplied: () => {},
  StatusEnded: () => {},
  FocusChanged: () => {},
  EnemyAttack: () => {},
  HeroDamaged: () => {},
  HeroHealed: () => {},
  EnemyDeath: () => {},
  HeroDowned: () => {},
  SecondWindStarted: () => {},
  SecondWindSucceeded: () => {},
  SecondWindFailed: () => {},
  Revived: () => {},
  SkillCharged: () => {},
  SkillCast: () => {},
  PassiveTriggered: () => {},
  WordFaded: () => {},
  WordScrambled: () => {},
  WordUnscrambled: () => {},
  BossIntroStarted: () => {},
  BossPhaseChanged: () => {},
  DoomSpellStarted: () => {},
  DoomSpellCompleted: () => {},
  DoomSpellFailed: () => {},
  MinigameStarted: () => {},
  MinigameWordSpawned: () => {},
  MinigameWordCleared: () => {},
  MinigameWordMissed: () => {},
  MinigameEnded: () => {},
  FinisherShown: () => {},
  FinisherCompleted: () => {},
  GoldGained: () => {},
  ChestDropped: () => {},
  TrialStarted: () => {},
  TrialEnded: () => {},
};

describe("event union exhaustiveness (type-level)", () => {
  test("every SimEvent type is in ALL_EVENT_TYPES, and vice versa", () => {
    expectTypeOf<SimEvent["type"]>().toEqualTypeOf<SimEventType>();
    expectTypeOf(EVENT_TYPES_EXHAUSTIVE).toEqualTypeOf<true>();
    expect(EVENT_TYPES_EXHAUSTIVE).toBe(true);
  });
  test("EventOf narrows to the member", () => {
    expectTypeOf<EventOf<"Hit">["damageM"]>().toEqualTypeOf<number>();
    expectTypeOf<EventOf<"SecondWindFailed">["type"]>().toEqualTypeOf<"SecondWindFailed">();
  });
  test("a partial handler map does not compile", () => {
    // @ts-expect-error missing keys
    const partial: EventHandlers = { Hit: () => {} };
    expect(partial).toBeDefined();
  });
  test("a handler receives the narrowed event type", () => {
    const h: Pick<EventHandlers, "Hit"> = {
      Hit: (e) => {
        expectTypeOf(e.type).toEqualTypeOf<"Hit">();
        expectTypeOf(e.origin).not.toBeAny();
      },
    };
    expect(h).toBeDefined();
  });
  test("meta events have their own union and list", () => {
    expectTypeOf<MetaEvent["type"]>().toEqualTypeOf<(typeof ALL_META_EVENT_TYPES)[number]>();
  });
});

describe("event type list (runtime)", () => {
  test("no duplicates", () => {
    expect(new Set(ALL_EVENT_TYPES).size).toBe(ALL_EVENT_TYPES.length);
  });
  test("the full handler map has exactly one handler per type", () => {
    expect(Object.keys(noop).sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });
});

describe("dispatch", () => {
  test("routes each event to the handler of its type, in order", () => {
    const seen: string[] = [];
    const handlers: EventHandlers = {
      ...noop,
      LevelStarted: (e) => seen.push(`start:${e.levelId}`),
      WalkEnded: (e) => seen.push(`walk:${e.segmentIndex}`),
    };
    const events: SimEvent[] = [
      {
        type: "LevelStarted",
        tick: 0,
        levelId: "ch1-l1",
        chapter: 1,
        isBossLevel: false,
        encounterCount: 2,
      },
      { type: "WalkEnded", tick: 5, segmentIndex: 0 },
      { type: "SecondWindFailed", tick: 6 },
    ];
    dispatchEvents(handlers, events);
    expect(seen).toEqual(["start:ch1-l1", "walk:0"]);
    dispatchEvent(handlers, events[1] as SimEvent);
    expect(seen.length).toBe(3);
  });
});

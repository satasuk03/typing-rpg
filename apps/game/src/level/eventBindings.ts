/**
 * Event bindings (plan T2.3 / T3.1): ONE table mapping every `SimEventType` to what each presentation layer does.
 *
 *   SimEvent --> BINDINGS[type] --> { render action | HUD push | audio handler | hooks }
 *
 * - The table type `{ [K in SimEventType]: EventBinding<K> }` makes a missing key a compile error, and
 *   `tests/level/bindings.test.ts` enumerates `ALL_EVENT_TYPES` at runtime as well.
 * - `render`: world-side action (actors, camera shake / punch, hit-stop, slow-mo): the stage's own motion.
 * - `fx`: the combat VFX library (T2.3, `render/vfx/combat/`): arcs, particles, quads, lights, markers. Every event is
 *   either bound here or carries `fxNone`, the reason it has no combat effect (typing events belong to T2.6, plates
 *   and gauges to the HUD, state to LevelView). `tests/vfx/combatBindings.test.ts` enforces that.
 * - `hud`: "push" = `Hud.pushEvent` has a case for it (pops, banners, plate FX); "none" = the HUD ignores it.
 * - `audio`: "bound" = `AUDIO_BINDINGS[type]` exists (audio/bindings.ts is the single audio table), "silent" = it is
 *   intentionally silent (`AUDIO_SILENT_EVENTS`). Derived from the audio table so the two can never disagree.
 * - `silent`: required when an event has no render action, no HUD push and no audio: the reason it is intentionally
 *   not presented (usually "state is read from LevelView").
 * - Hook points: `EventRouter.register(types, fn)` runs AFTER the built-in actions. The typing VFX chunk (T2.6 A,
 *   `hud/fx/typing/**`) registers through `EventRouter.registerTypingFx(fn)`; T2.3's VFX library registers per type.
 *
 * Nothing here reads or mutates sim state: handlers only get the event and the sinks.
 */
import type { EventOf, SimEvent, SimEventType } from "@hd2d/sim";
import { AUDIO_BINDINGS, type AudioApi, dispatchAudioEvent } from "../audio/bindings";
import type { CombatFxSink } from "../render/vfx/combat/CombatFx";

// ---------------------------------------------------------------------------------------------- sinks

/** World-side actions the bindings may trigger (implemented by `LevelStage`). */
export interface RenderActions {
  walkStarted(tick: number, untilTick: number): void;
  encounterStarted(index: number): void;
  encounterCleared(): void;
  /** `elite` (v2.0 `EnemySpawned.elite`): the gold-rimmed sprite variant at x1.08 (T3.2); the aura is the combat VFX's. */
  spawnEnemy(id: number, defId: string, slot: number, isBoss: boolean, elite?: boolean): void;
  enemyHit(id: number, strength: number): void;
  enemyAttack(id: number): void;
  enemyDied(id: number): void;
  heroHurt(strength?: number): void;
  heroAttack(targetId: number | null): void;
  heroCast(): void;
  heroGuard(): void;
  /** Camera shake (seconds, magnitude). */
  shake(sec: number, mag: number): void;
  /** FOV punch + chromatic aberration + radial zoom. */
  punch(punch: number, ca: number, zoom: number): void;
  /** Render-only time dilation: never touches the sim clock. */
  hitStop(sec: number): void;
  slowMo(scale: number, sec: number): void;
}

/** DOM overlay hooks (screens.ts). */
export interface UiActions {
  hint(text: string, sec: number, cue?: "target" | "atb" | "combo" | "skill" | "guard"): void;
  secondWind(on: boolean): void;
}

export interface HudSink {
  pushEvent(e: SimEvent): void;
}

export interface Sinks {
  render: RenderActions;
  hud: HudSink;
  /** null = audio disabled (tests, `&audio=0`). */
  audio: AudioApi | null;
  ui: UiActions;
  /** The combat VFX library (T2.3). Absent in tests and when effects are off. */
  fx?: CombatFxSink;
}

export type BindingCtx = Pick<Sinks, "render" | "ui" | "fx">;

export interface EventBinding<K extends SimEventType> {
  render?: (e: EventOf<K>, c: BindingCtx) => void;
  /** Combat VFX (T2.3), run right after `render`. */
  fx?: (e: EventOf<K>, c: BindingCtx) => void;
  /** Required when `fx` is absent: why the event has no combat effect. */
  fxNone?: string;
  hud: "push" | "none";
  audio: "bound" | "silent";
  /** Why the event is intentionally not presented anywhere (required when nothing else is set). */
  silent?: string;
}

export type BindingTable = { [K in SimEventType]: EventBinding<K> };

// ---------------------------------------------------------------------------------------------- the table

/** Events `Hud.pushEvent` has a case for (hud/hud.ts). Kept next to the table; the HUD test asserts reaction. */
const HUD_HANDLED: ReadonlySet<string> = new Set([
  "LevelStarted",
  "EncounterStarted",
  "WaveStarted",
  "BossIntroStarted",
  "LevelCleared",
  "LevelFailed",
  "HeroDowned",
  "SecondWindStarted",
  "CharCorrect",
  "Typo",
  "WordCompleted",
  "PlateRemoved",
  "Hit",
  "Break",
  "WeaknessRevealed",
  "GuardBlocked",
  "GuardParried",
  "HeroDamaged",
  "HeroHealed",
  "SkillCast",
  "GoldGained",
  "AtbFilled",
  "ComboTierChanged",
  "KeyStreakTierChanged",
]);

const hudOf = (t: SimEventType): "push" | "none" => (HUD_HANDLED.has(t) ? "push" : "none");
const audioOf = (t: SimEventType): "bound" | "silent" => (t in AUDIO_BINDINGS ? "bound" : "silent");

function b<K extends SimEventType>(
  type: K,
  extra: {
    render?: EventBinding<K>["render"];
    fx?: EventBinding<K>["fx"];
    fxNone?: string;
    silent?: string;
  } = {},
): EventBinding<K> {
  return { hud: hudOf(type), audio: audioOf(type), ...extra };
}

const STATE = "state is read from LevelView each frame";

export const BINDINGS: BindingTable = {
  // ---- flow ----
  LevelStarted: b("LevelStarted", {
    fxNone:
      "a new attempt clears every in-flight effect (CombatFx.clear / TypingWorldFx.clear); nothing to play",
  }),
  WalkStarted: b("WalkStarted", {
    render: (e, c) => c.render.walkStarted(e.tick, e.untilTick),
    fxNone: "the walk is the stage's hero and camera motion, not an effect",
  }),
  WalkEnded: b("WalkEnded", {
    silent: "the next EncounterStarted places the hero",
    fxNone: "the next EncounterStarted places the hero",
  }),
  EncounterStarted: b("EncounterStarted", {
    render: (e, c) => c.render.encounterStarted(e.encounterIndex),
    fxNone: "the stage places the hero; the encounter banner is HUD",
  }),
  WaveStarted: b("WaveStarted", {
    fxNone: "enemies arrive through EnemySpawned; the wave banner is HUD",
  }),
  EnemySpawned: b("EnemySpawned", {
    render: (e, c) => c.render.spawnEnemy(e.enemyId, e.defId, e.slot, e.isBoss, e.elite === true),
    fxNone:
      "the stage slides the enemy in; the boss entrance is BossIntroStarted; the elite aura (T3.2) is driven per frame by EnemyView.elite",
  }),
  EncounterCleared: b("EncounterCleared", {
    render: (_e, c) => c.render.encounterCleared(),
    fxNone: "the rewards have their own events (ChestDropped, GoldGained)",
  }),
  LevelCleared: b("LevelCleared", {
    fxNone: "the victory pose is the stage's; the banner and results are HUD / screens",
  }),
  LevelFailed: b("LevelFailed", {
    render: (_e, c) => c.render.slowMo(0.3, 1.2),
    fxNone: "the slow-mo is the render column; the defeat banner and results are HUD / screens",
  }),
  TutorialCue: b("TutorialCue", {
    render: (e, c) => c.ui.hint(TUTORIAL_TEXT[e.cue], 6, e.cue),
    fxNone: "a DOM hint (UiActions.hint), not a world effect",
  }),

  // ---- plates & typing (HUD + typing VFX hook) ----
  PlateShown: b("PlateShown", {
    silent: `plates are drawn from LevelView.plates (${STATE})`,
    fxNone: "plates are HUD objects (PlateView), not world effects",
  }),
  PlateRemoved: b("PlateRemoved", {
    fxNone: "plates are HUD objects (PlateView), not world effects",
  }),
  TargetAcquired: b("TargetAcquired", {
    silent: "target highlight comes from PlateView.isTarget",
    fxNone: "plates are HUD objects (PlateView), not world effects",
  }),
  TargetDropped: b("TargetDropped", {
    silent: "target highlight comes from PlateView.isTarget",
    fxNone: "plates are HUD objects (PlateView), not world effects",
  }),
  CharCorrect: b("CharCorrect", {
    fxNone:
      "typing VFX (T2.6) owns this event; the Hush Spell capital accent on CharCorrect.shifted (T3.2, CapitalAccent) runs inside the typing handle",
  }),
  Typo: b("Typo", { fxNone: "typing VFX (T2.6) owns this event" }),
  WordCompleted: b("WordCompleted", { fxNone: "typing VFX (T2.6) owns this event" }),
  SentenceWordDone: b("SentenceWordDone", { fxNone: "typing VFX (T2.6) owns this event" }),
  ComboTierChanged: b("ComboTierChanged", { fxNone: "typing VFX (T2.6) owns this event" }),
  KeyStreakTierChanged: b("KeyStreakTierChanged", { fxNone: "typing VFX (T2.6) owns this event" }),
  BurstWpm: b("BurstWpm", {
    silent: "no presentation in the slice (stats panel shows burst WPM)",
    fxNone: "no presentation in the slice (the stats panel shows burst WPM)",
  }),

  // ---- defense ----
  EnemyAttackWindup: b("EnemyAttackWindup", { fx: (e, c) => c.fx?.windup(e) }),
  GuardWordShown: b("GuardWordShown", {
    silent: `the guard plate arrives via PlateShown (${STATE})`,
    fxNone: "the guard plate is HUD; the barrier preview is T2.6 (GuardBarrier)",
  }),
  GuardWordTyped: b("GuardWordTyped", {
    render: (_e, c) => c.render.heroGuard(),
    fxNone: "the barrier snap is T2.6 (GuardBarrier)",
  }),
  GuardBlocked: b("GuardBlocked", {
    render: (_e, c) => {
      c.render.heroGuard();
      c.render.shake(0.18, 0.5);
    },
    fx: (e, c) => c.fx?.guardBlocked(e),
  }),
  GuardParried: b("GuardParried", {
    render: (_e, c) => {
      c.render.heroGuard();
      c.render.hitStop(0.07);
      c.render.punch(0.8, 0.003, 0.012);
    },
    fx: (e, c) => c.fx?.guardParried(e),
  }),

  // ---- ATB & hero offense ----
  AtbFilled: b("AtbFilled", { fxNone: "typing VFX (T2.6) owns this event" }),
  AutoAttack: b("AutoAttack", {
    render: (e, c) => c.render.heroAttack(e.targetId),
    fx: (e, c) => c.fx?.autoAttack(e),
  }),
  Hit: b("Hit", {
    render: (e, c) => {
      if (e.targetId === 0) return;
      const strong = e.crit || e.kind === "skill" || e.kind === "finisher";
      c.render.enemyHit(
        e.targetId,
        strong ? 1 : e.kind === "chip" || e.kind === "dot" ? 0.12 : 0.7,
      );
      if (e.kind === "chip" || e.kind === "dot") return;
      c.render.shake(e.crit ? 0.3 : 0.15, e.crit ? 1 : 0.5);
      if (e.crit) {
        c.render.hitStop(0.06);
        c.render.punch(0.8, 0.003, 0.012);
      } else if (e.killed) c.render.hitStop(0.05);
    },
    fx: (e, c) => c.fx?.hit(e),
  }),
  WeaknessRevealed: b("WeaknessRevealed", { fx: (e, c) => c.fx?.weaknessRevealed(e) }),
  ShieldDamaged: b("ShieldDamaged", {
    fx: (e, c) => c.fx?.shieldDamaged(e),
  }),
  Break: b("Break", {
    render: (e, c) => {
      c.render.enemyHit(e.enemyId, 1);
      c.render.hitStop(0.1);
      c.render.shake(0.4, 1.2);
      c.render.punch(1.2, 0.004, 0.02);
    },
    fx: (e, c) => c.fx?.breakStarted(e),
  }),
  BreakEnded: b("BreakEnded", {
    silent: "pose returns to idle from EnemyView.pose",
    fxNone: "the pose returns to idle from EnemyView.pose; there is nothing to play",
  }),
  StatusApplied: b("StatusApplied", {
    fx: (e, c) => c.fx?.statusApplied(e),
  }),
  StatusEnded: b("StatusEnded", {
    fx: (e, c) => c.fx?.statusEnded(e),
  }),
  FocusChanged: b("FocusChanged", {
    silent: "focus ring comes from EnemyView.isFocus",
    fxNone: "the focus ring is HUD (EnemyView.isFocus)",
  }),

  // ---- enemy offense & hero state ----
  EnemyAttack: b("EnemyAttack", {
    render: (e, c) => c.render.enemyAttack(e.enemyId),
    fx: (e, c) => c.fx?.enemyAttack(e),
  }),
  HeroDamaged: b("HeroDamaged", {
    render: (e, c) => {
      if (e.blocked) return;
      c.render.heroHurt(1);
      c.render.shake(0.3, e.cause === "attack" ? 0.8 : 1.1);
    },
    fxNone:
      "shown by the cause: the EnemyAttack lunge, DoomSpellFailed or MinigameWordMissed (flash and shake are the render column)",
  }),
  HeroHealed: b("HeroHealed", { fx: (e, c) => c.fx?.heroHealed(e) }),
  // v2.0 healer (T3.2): the green beam, motes, pop and target rim flash; the "+N" pop and HP-bar fill are the HUD's
  EnemyHealed: b("EnemyHealed", { fx: (e, c) => c.fx?.enemyHealed(e) }),
  EnemyDeath: b("EnemyDeath", {
    render: (e, c) => {
      c.render.enemyDied(e.enemyId);
      if (e.isBoss) {
        c.render.hitStop(0.16);
        c.render.slowMo(0.3, 0.9);
        c.render.punch(1.5, 0.006, 0.03);
        c.render.shake(0.8, 1.6);
      } else c.render.hitStop(0.06);
    },
    fx: (e, c) => c.fx?.enemyDeath(e),
  }),
  HeroDowned: b("HeroDowned", {
    render: (_e, c) => {
      c.render.heroHurt(1);
      c.render.slowMo(0.35, 0.7);
    },
    fx: (e, c) => c.fx?.heroDowned(e),
  }),
  SecondWindStarted: b("SecondWindStarted", {
    render: (_e, c) => c.ui.secondWind(true),
    fxNone: "the countdown plate and overlay are HUD / screens; the payoff is SecondWindSucceeded",
  }),
  SecondWindSucceeded: b("SecondWindSucceeded", {
    render: (_e, c) => c.ui.secondWind(false),
    fx: (e, c) => c.fx?.secondWindSucceeded(e),
  }),
  SecondWindFailed: b("SecondWindFailed", {
    render: (_e, c) => c.ui.secondWind(false),
    fxNone: "LevelFailed follows with its own slow-mo",
  }),
  Revived: b("Revived", {
    silent: "hook only; never emitted in the slice",
    fxNone: "hook only; never emitted in the slice",
  }),

  // ---- skills ----
  SkillCharged: b("SkillCharged", {
    silent: "ready state comes from SkillView.ready",
    fxNone: "the ready state is HUD (SkillView.ready); the cast is SkillCast",
  }),
  SkillCast: b("SkillCast", {
    render: (_e, c) => c.render.heroCast(),
    fx: (e, c) => c.fx?.skillCast(e),
  }),
  PassiveTriggered: b("PassiveTriggered", { fx: (e, c) => c.fx?.passive(e) }),

  // ---- gimmicks ----
  WordFaded: b("WordFaded", {
    silent: "PlateView.faded drives the plate",
    fxNone: "PlateView.faded drives the plate",
  }),
  WordScrambled: b("WordScrambled", {
    silent: "PlateView.display drives the plate",
    fxNone: "PlateView.display drives the plate",
  }),
  WordUnscrambled: b("WordUnscrambled", {
    silent: "PlateView.display drives the plate",
    fxNone: "PlateView.display drives the plate",
  }),

  // ---- boss ----
  BossIntroStarted: b("BossIntroStarted", {
    render: (_e, c) => {
      c.render.shake(0.8, 1);
      c.render.punch(1, 0.004, 0.02);
    },
    fx: (e, c) => c.fx?.bossIntro(e),
  }),
  BossPhaseChanged: b("BossPhaseChanged", {
    render: (_e, c) => {
      c.render.shake(0.9, 1.4);
      c.render.punch(1, 0.004, 0.02);
    },
    fx: (e, c) => c.fx?.bossPhase(e),
  }),
  DoomSpellStarted: b("DoomSpellStarted", {
    render: (_e, c) => c.render.shake(0.5, 0.6),
    fx: (e, c) => c.fx?.doomStarted(e),
  }),
  DoomSpellCompleted: b("DoomSpellCompleted", {
    render: (_e, c) => {
      c.render.hitStop(0.08);
      c.render.punch(0.8, 0.003, 0.012);
    },
    fx: (e, c) => c.fx?.doomCompleted(e),
  }),
  DoomSpellFailed: b("DoomSpellFailed", {
    render: (_e, c) => {
      c.render.heroHurt(1);
      c.render.shake(0.7, 1.5);
    },
    fx: (e, c) => c.fx?.doomFailed(e),
  }),
  MinigameStarted: b("MinigameStarted", {
    silent: "rubble lanes are HUD plates (PlateView.lane)",
    fxNone: "the rubble lanes are HUD plates (PlateView.lane)",
  }),
  MinigameWordSpawned: b("MinigameWordSpawned", {
    silent: "rubble lanes are HUD plates (PlateView.lane)",
    fxNone: "the rubble lanes are HUD plates (PlateView.lane)",
  }),
  MinigameWordCleared: b("MinigameWordCleared", {
    render: (_e, c) => c.render.shake(0.12, 0.4),
    fxNone:
      "the rock is a HUD plate and its clear pop is the HUD's; the shake is the render column",
  }),
  MinigameWordMissed: b("MinigameWordMissed", {
    render: (_e, c) => {
      c.render.heroHurt(1);
      c.render.shake(0.4, 1);
    },
    fx: (e, c) => c.fx?.minigameMissed(e),
  }),
  MinigameEnded: b("MinigameEnded", {
    silent: "the finisher plate follows",
    fxNone: "the finisher plate follows",
  }),
  // v2.0 Riddle of Leaves (T3.2): the panel and the leaf plates are HUD (LevelView.minigame.riddle, PlateView); the world
  // side is the three drifting leaves, the pick highlight and the bloom / wither. The Willow's `riddle` face comes from the
  // minigame kind in the stage; the hero's hit on a wrong / timed-out riddle is HeroDamaged (cause "minigame").
  RiddleStarted: b("RiddleStarted", { fx: (e, c) => c.fx?.riddleStarted(e) }),
  RiddleLeafPicked: b("RiddleLeafPicked", { fx: (e, c) => c.fx?.riddleLeafPicked(e) }),
  RiddleResolved: b("RiddleResolved", { fx: (e, c) => c.fx?.riddleResolved(e) }),
  FinisherShown: b("FinisherShown", {
    render: (_e, c) => c.render.slowMo(0.55, 0.5),
    fxNone: "the finisher cinematic (T2.6 FinisherCinematic) owns the scene",
  }),
  FinisherCompleted: b("FinisherCompleted", {
    render: (_e, c) => {
      c.render.hitStop(0.12);
      c.render.punch(1.5, 0.006, 0.03);
    },
    // Ch1: the cinematic (T2.6 FinisherCinematic) draws the arcs, camera push and landing. Ch2 adds the freed-Willow
    // finale on the Willow only (a no-op for every other boss).
    fx: (e, c) => c.fx?.finisherCompleted(e),
  }),

  // ---- rewards ----
  GoldGained: b("GoldGained", { fx: (e, c) => c.fx?.goldGained(e) }),
  ChestDropped: b("ChestDropped", {
    silent: "listed on the results screen; chest pop-up is T3.2",
    fx: (e, c) => c.fx?.chestDropped(e),
  }),

  // ---- trial (never in a level stream) ----
  TrialStarted: b("TrialStarted", {
    silent: "Typing Trial events are not produced by a level",
    fxNone: "Typing Trial events are not produced by a level",
  }),
  TrialEnded: b("TrialEnded", {
    silent: "Typing Trial events are not produced by a level",
    fxNone: "Typing Trial events are not produced by a level",
  }),
};

const TUTORIAL_TEXT: Record<EventOf<"TutorialCue">["cue"], string> = {
  target: "Type the first letter of a word to lock on, then finish it.",
  atb: "Each correct letter fills your attack gauge.",
  guard: "A red guard word appears before an enemy strikes. Type it to block.",
  skill: "Charged skills fire on their own. Keep typing.",
  combo: "Finish words without typos to build a combo.",
};

// ---------------------------------------------------------------------------------------------- router

/** Events the typing-feel VFX chunk (T2.6 A) cares about. */
export const TYPING_EVENT_TYPES = [
  "CharCorrect",
  "Typo",
  "WordCompleted",
  "SentenceWordDone",
  "ComboTierChanged",
  "KeyStreakTierChanged",
  "BurstWpm",
  "PlateShown",
  "PlateRemoved",
  "TargetAcquired",
  "TargetDropped",
] as const satisfies readonly SimEventType[];

export type EventHook = (e: SimEvent, sinks: Sinks) => void;

/** Applies the binding table to an event batch and runs registered hooks. One router per play session. */
export class EventRouter {
  private readonly hooks = new Map<string, EventHook[]>();
  private readonly any: EventHook[] = [];

  constructor(readonly sinks: Sinks) {}

  /** Register a hook for specific event types (or "*" for all). Returns an unsubscribe function. */
  register(types: readonly SimEventType[] | "*", fn: EventHook): () => void {
    if (types === "*") {
      this.any.push(fn);
      return () => {
        const i = this.any.indexOf(fn);
        if (i >= 0) this.any.splice(i, 1);
      };
    }
    for (const t of types) {
      const list = this.hooks.get(t) ?? [];
      list.push(fn);
      this.hooks.set(t, list);
    }
    return () => {
      for (const t of types) {
        const list = this.hooks.get(t);
        const i = list ? list.indexOf(fn) : -1;
        if (list && i >= 0) list.splice(i, 1);
      }
    };
  }

  /** The T2.6 chunk-A entry point: `router.registerTypingFx((e, sinks) => ...)`. */
  registerTypingFx(fn: EventHook): () => void {
    return this.register(TYPING_EVENT_TYPES, fn);
  }

  /**
   * The presentation gate (T2.6 `TypingFxHandle.onEvent`): runs for EVERY event, in order, BEFORE any binding. It
   * returns false for an event that must be presented later (a chip hit, or an event queued behind one); the
   * owner then hands it back through `present(e)` when it is due. The typing VFX see the event first either way.
   */
  setPresentationGate(fn: ((e: SimEvent) => boolean) | null): void {
    this.gate = fn;
  }
  private gate: ((e: SimEvent) => boolean) | null = null;

  dispatch(events: readonly SimEvent[]): void {
    const gate = this.gate;
    for (const e of events) if (!gate || gate(e)) this.present(e);
  }

  /** Run the bindings and hooks for one event now (events the gate held back come back through here). */
  present(e: SimEvent): void {
    const s = this.sinks;
    const binding = BINDINGS[e.type] as EventBinding<SimEventType>;
    (binding.render as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, s);
    (binding.fx as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, s);
    if (binding.hud === "push") s.hud.pushEvent(e);
    if (binding.audio === "bound" && s.audio) dispatchAudioEvent(e, s.audio);
    const list = this.hooks.get(e.type);
    if (list) for (const h of list) h(e, s);
    for (const h of this.any) h(e, s);
  }
}

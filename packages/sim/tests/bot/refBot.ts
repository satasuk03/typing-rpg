// Reference bot (T1.3): a small deterministic sim-level typist. QA builds the full tools/bot later; this one is meant to
// be reused. It reads getView() only, presses keys through applyInput, and never touches sim internals.
//
// Model (parameters come from economy_sim.py, no free tuning):
//  - Keystroke rate: the correct-char rate is `wpm` (net WPM x 5 / 60 chars/s), so a keystroke comes every
//    720 x accuracy / wpm ticks (typos are extra keystrokes), jittered +-15% from the seeded RNG.
//  - Combat typing efficiency COMBAT_TYPING_EFF = 0.82 (economy_sim): after each completed plate the bot waits
//    len x interval x (1/0.82 - 1) ticks (reading and target switching).
//  - Accuracy: every keystroke is wrong with probability 1 - accuracy. A typo is a real wrong key (a stray key when no
//    plate is locked is chosen so it never matches a plate's first letter).
//  - Guard behaviour: a guard plate is noticed `reactionTicks` after it appears; the bot attempts it with probability
//    `guardAttempt` (default 1 = "correct guard behaviour"), dropping the current target with Escape when more than 2
//    letters remain on it.
//  - Plate choice: the focus enemy's word plate first (focus fire, as economy_sim assumes), else the first word plate.
import {
  applyInput,
  below,
  createLevel,
  deriveRng,
  getResult,
  getView,
  type LevelOptions,
  type LevelResult,
  type LevelState,
  type Loadout,
  type PlateView,
  type ResolvedLevel,
  type RngState,
  type SimEvent,
  step,
} from "../../src/index.ts";

export interface BotParams {
  /** Target net WPM (correct chars / 5 / min). */
  wpm: number;
  /** Probability that a keystroke is correct (economy_sim accuracy = correct / all keystrokes). */
  accuracy: number;
  /** COMBAT_TYPING_EFF: share of time spent actually typing (default 0.82, economy_sim). */
  efficiency?: number;
  /** Probability of attempting a guard word that appeared (default 1). */
  guardAttempt?: number;
  /** Ticks before the bot notices a new guard plate (default 15 = 0.25 s). */
  reactionTicks?: number;
  /** Safety stop (default: level timeout). */
  maxTicks?: number;
}

export interface BotRun {
  state: LevelState;
  events: SimEvent[];
  inputs: { tick: number; key: string }[];
  result: LevelResult | null;
  /** AutoAttack events per encounter (index = encounter order). */
  attacksPerEncounter: number[];
  /** Ticks spent in "combat" phase per encounter. */
  combatTicksPerEncounter: number[];
}

const STRAY = "qzxjkvw";

export function runBot(
  def: ResolvedLevel,
  loadout: Loadout,
  seed: number,
  options: LevelOptions,
  p: BotParams,
): BotRun {
  const rng: RngState = deriveRng(seed, "meta", 0xb07);
  const eff = p.efficiency ?? 0.82;
  const guardAttempt = p.guardAttempt ?? 1;
  const reaction = p.reactionTicks ?? 15;
  const baseInterval = (720 * p.accuracy) / p.wpm;
  const state = createLevel(def, loadout, seed, options);
  const events: SimEvent[] = [];
  const inputs: { tick: number; key: string }[] = [];
  const attacksPerEncounter: number[] = [];
  const combatTicksPerEncounter: number[] = [];
  const decided = new Map<number, boolean>(); // guard plate id -> attempt?
  let nextKey = 0;
  const maxTicks = p.maxTicks ?? 72_000;

  const collect = (ev: SimEvent[]): void => {
    for (const e of ev) {
      events.push(e);
      if (e.type === "EncounterStarted") {
        attacksPerEncounter.push(0);
        combatTicksPerEncounter.push(0);
      }
      if (e.type === "AutoAttack")
        attacksPerEncounter[attacksPerEncounter.length - 1] =
          (attacksPerEncounter[attacksPerEncounter.length - 1] ?? 0) + 1;
    }
  };
  const interval = (): number =>
    Math.max(1, Math.round(baseInterval * (0.85 + below(rng, 31) / 100)));
  const press = (key: string): SimEvent[] => {
    inputs.push({ tick: state.tick, key });
    const ev = applyInput(state, { tick: state.tick, key });
    collect(ev);
    return ev;
  };
  const wantsGuard = (pl: PlateView): boolean => {
    let d = decided.get(pl.id);
    if (d === undefined) {
      d = below(rng, 10_000) < Math.round(guardAttempt * 10_000);
      decided.set(pl.id, d);
    }
    return d;
  };
  const noticed = (pl: PlateView, tick: number): boolean =>
    pl.expiresAtTick === null || pl.totalTicks === null
      ? true
      : tick >= pl.expiresAtTick - pl.totalTicks + reaction;

  const act = (): void => {
    const v = getView(state);
    const plates = v.plates;
    const target = plates.find((x) => x.isTarget);
    const guard = plates.find((x) => x.kind === "guard" && noticed(x, state.tick) && wantsGuard(x));
    // T1.5: a Doom Spell is urgent like a guard word (a deadline), falling-rubble words are typed soonest-landing first
    const doom = plates.find((x) => x.kind === "doom" && noticed(x, state.tick));
    const urgent = guard ?? doom;
    const rubble = plates
      .filter((x) => x.kind === "minigame")
      .sort((x, y) => (x.expiresAtTick ?? 0) - (y.expiresAtTick ?? 0))[0];
    let pick: PlateView | undefined;
    if (v.phase === "secondWind") {
      pick = plates.find((x) => x.kind === "secondWind");
    } else if (target !== undefined) {
      if (
        urgent !== undefined &&
        target.kind !== "guard" &&
        target.kind !== "doom" &&
        target.kind !== "finisher" &&
        target.text.length - target.typedIndex > 2
      ) {
        press("Escape");
        nextKey = state.tick + interval();
        return;
      }
      pick = target;
    } else if (urgent !== undefined) {
      pick = urgent;
    } else if (rubble !== undefined) {
      pick = rubble;
    } else {
      const words = plates.filter((x) => x.kind === "word");
      pick = words.find((x) => x.ownerId === v.focusEnemyId) ?? words[0];
    }
    if (pick === undefined) {
      nextKey = state.tick + 3;
      return;
    }
    const want = pick.text.charAt(pick.typedIndex);
    const iv = interval();
    if (below(rng, 10_000) >= Math.round(p.accuracy * 10_000)) {
      // typo: a wrong key. Without a lock, avoid accidentally locking another plate.
      const first = new Set(plates.map((x) => x.text.charAt(0).toLowerCase()));
      let wrong = "";
      if (target !== undefined) wrong = want === "e" ? "r" : "e";
      else wrong = [...STRAY].find((c) => !first.has(c)) ?? "";
      if (wrong !== "") {
        press(wrong);
        nextKey = state.tick + iv;
        return;
      }
    }
    const ev = press(want);
    const done = ev.some((e) => e.type === "WordCompleted");
    nextKey = state.tick + iv + (done ? Math.round(pick.text.length * iv * (1 / eff - 1)) : 0);
  };

  while (state.phase !== "cleared" && state.phase !== "failed" && state.tick < maxTicks) {
    if ((state.phase === "combat" || state.phase === "secondWind") && state.tick >= nextKey) act();
    if (state.phase === "combat" && combatTicksPerEncounter.length > 0)
      combatTicksPerEncounter[combatTicksPerEncounter.length - 1] =
        (combatTicksPerEncounter[combatTicksPerEncounter.length - 1] ?? 0) + 1;
    collect(step(state, 1));
  }
  return {
    state,
    events,
    inputs,
    result: getResult(state),
    attacksPerEncounter,
    combatTicksPerEncounter,
  };
}

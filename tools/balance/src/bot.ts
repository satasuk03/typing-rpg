// Persona bot: plays one level of the real sim (packages/sim) through applyInput/step/getView only.
// The keystroke model is the reference bot's (packages/sim/tests/bot/refBot.ts), with economy_sim's persona inputs:
//  - keystrokes every 720 x accuracy / wpm ticks (+-15% jitter), so the correct-char rate is the net WPM;
//  - COMBAT_TYPING_EFF 0.82: after each finished plate the bot pauses len x interval x (1/0.82 - 1) (reading, switching);
//  - every keystroke is a typo with probability 1 - accuracy (a real wrong key, stop-on-error);
//  - guard words: noticed 0.25 s after they appear and attempted with the attempt's guard probability (economy_sim guard);
//    the current target is dropped with Escape when it still has more than 2 letters left;
//  - Doom Spells are urgent like guard words; falling rubble is typed soonest-landing first; focus fire otherwise.
import {
  applyInput,
  below,
  createLevel,
  deriveRng,
  getResult,
  getView,
  type HitOrigin,
  type LevelOptions,
  type LevelResult,
  type Loadout,
  type PlateView,
  type ResolvedLevel,
  type RngState,
  type SimEvent,
  step,
} from "@hd2d/sim";
import { type Attempt, COMBAT_TYPING_EFF } from "./personas.ts";
import { LEVEL_END_S } from "./pymodel.ts";

const STRAY = "qzxjkvw";
const ORIGINS: readonly HitOrigin[] = [
  "weapon",
  "chip",
  "skill",
  "counter",
  "minigame",
  "finisher",
];

export interface RunRecord {
  levelId: string;
  index: number;
  isBoss: boolean;
  seed: number;
  attempt: Attempt;
  cleared: boolean;
  failReason: string | null;
  /** Sim time from LevelStarted to the end (intro, walks, wave intros, combat, rewards, boss breathers), seconds. */
  simS: number;
  /** Ticks the sim spent in the "combat" phase (typing live), seconds. */
  combatS: number;
  /** economy_sim "active" time: simS + LEVEL_END_S (the results screen the sim does not model), seconds. */
  activeS: number;
  encounters: number;
  autoAttacks: number;
  dmgByOrigin: Record<HitOrigin, number>;
  dmgBySkill: Record<string, number>;
  gold: number;
  levelGold: number;
  chestGold: number;
  chests: number;
  hitsTaken: number;
  dmgTaken: { attack: number; doom: number; minigame: number };
  guardShown: number;
  guardAttempted: number;
  blocked: number;
  parried: number;
  /** Enemy attack impacts by outcome (EnemyAttack events). */
  attacks: { hit: number; blocked: number; parried: number; barrier: number };
  secondWind: boolean;
  doomStarted: number;
  doomFailed: number;
  rubbleSpawned: number;
  rubbleMissed: number;
  /** Boss level only: seconds of [pre-boss, phase 1, phase 2, phase 3 + finisher] (from the boss intro). */
  bossPhaseS: number[] | null;
  netWpm: number;
  accuracy: number;
}

export interface PlayArgs {
  def: ResolvedLevel;
  loadout: Loadout;
  seed: number;
  attempt: Attempt;
  options: LevelOptions;
  reactionTicks?: number;
}

export function playLevel(a: PlayArgs): RunRecord {
  const { def, attempt } = a;
  const rng: RngState = deriveRng(a.seed, "meta", 0xb07);
  const reaction = a.reactionTicks ?? 15;
  const baseInterval = (720 * attempt.acc) / attempt.wpm;
  const state = createLevel(def, a.loadout, a.seed, a.options);
  const decided = new Map<number, boolean>();
  let nextKey = 0;
  const maxTicks = 72_000;

  const rec = {
    guardShown: 0,
    blocked: 0,
    parried: 0,
    autoAttacks: 0,
    encounters: 0,
    dmgTaken: { attack: 0, doom: 0, minigame: 0 },
    doomStarted: 0,
    doomFailed: 0,
    rubbleSpawned: 0,
    rubbleMissed: 0,
    secondWind: false,
    attacks: { hit: 0, blocked: 0, parried: 0, barrier: 0 },
  };
  let bossIntro: number | null = null;
  const phaseTicks: number[] = [];
  let endTick = 0;

  const collect = (ev: readonly SimEvent[]): void => {
    for (const e of ev) {
      switch (e.type) {
        case "EncounterStarted":
          rec.encounters++;
          break;
        case "GuardWordShown":
          rec.guardShown++;
          break;
        case "GuardBlocked":
          rec.blocked++;
          break;
        case "GuardParried":
          rec.parried++;
          break;
        case "EnemyAttack":
          rec.attacks[e.outcome]++;
          break;
        case "HeroDamaged":
          rec.dmgTaken[e.cause] += e.damage;
          break;
        case "DoomSpellStarted":
          rec.doomStarted++;
          break;
        case "DoomSpellFailed":
          rec.doomFailed++;
          break;
        case "MinigameWordSpawned":
          rec.rubbleSpawned++;
          break;
        case "MinigameWordMissed":
          rec.rubbleMissed++;
          break;
        case "SecondWindStarted":
          rec.secondWind = true;
          break;
        case "BossIntroStarted":
          bossIntro = e.tick;
          break;
        case "BossPhaseChanged":
          phaseTicks.push(e.tick);
          break;
        case "LevelCleared":
        case "LevelFailed":
          endTick = e.tick;
          break;
        default:
          break;
      }
    }
  };
  const interval = (): number =>
    Math.max(1, Math.round(baseInterval * (0.85 + below(rng, 31) / 100)));
  const press = (key: string): SimEvent[] => {
    const ev = applyInput(state, { tick: state.tick, key });
    collect(ev);
    return ev;
  };
  const wantsGuard = (pl: PlateView): boolean => {
    let d = decided.get(pl.id);
    if (d === undefined) {
      d = below(rng, 10_000) < Math.round(attempt.guardAttempt * 10_000);
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
    if (below(rng, 10_000) >= Math.round(attempt.acc * 10_000)) {
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
    nextKey =
      state.tick +
      iv +
      (done ? Math.round(pick.text.length * iv * (1 / COMBAT_TYPING_EFF - 1)) : 0);
  };

  while (state.phase !== "cleared" && state.phase !== "failed" && state.tick < maxTicks) {
    if ((state.phase === "combat" || state.phase === "secondWind") && state.tick >= nextKey) act();
    collect(step(state, 1));
  }
  const res = getResult(state) as LevelResult;
  if (endTick === 0) endTick = state.tick;
  const dmgByOrigin = {} as Record<HitOrigin, number>;
  for (const o of ORIGINS) dmgByOrigin[o] = (res.stats.damageByOriginM[o] ?? 0) / 1000;
  const dmgBySkill: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.stats.damageBySkillM ?? {})) dmgBySkill[k] = v / 1000;
  const chestGold = res.chests.reduce((s, c) => s + c.gold, 0);
  let bossPhaseS: number[] | null = null;
  if (def.isBoss && bossIntro !== null) {
    const marks = [0, bossIntro, ...phaseTicks, endTick];
    bossPhaseS = [];
    for (let i = 1; i < marks.length; i++)
      bossPhaseS.push(((marks[i] as number) - (marks[i - 1] as number)) / 60);
  }
  const simS = res.durationTicks / 60;
  return {
    levelId: def.levelId,
    index: def.index,
    isBoss: def.isBoss,
    seed: a.seed,
    attempt,
    cleared: res.outcome === "cleared",
    failReason: res.failReason,
    simS,
    combatS: res.activeTicks / 60,
    activeS: simS + LEVEL_END_S,
    encounters: rec.encounters,
    autoAttacks: res.stats.autoAttacks,
    dmgByOrigin,
    dmgBySkill,
    gold: res.gold + chestGold,
    levelGold: res.gold,
    chestGold,
    chests: res.chests.length,
    hitsTaken: res.stats.hitsTaken,
    dmgTaken: rec.dmgTaken,
    guardShown: rec.guardShown,
    guardAttempted: [...decided.values()].filter(Boolean).length,
    blocked: rec.blocked,
    parried: rec.parried,
    attacks: rec.attacks,
    secondWind: rec.secondWind,
    doomStarted: rec.doomStarted,
    doomFailed: rec.doomFailed,
    rubbleSpawned: rec.rubbleSpawned,
    rubbleMissed: rec.rubbleMissed,
    bossPhaseS,
    netWpm: res.stats.netWpmX100 / 100,
    accuracy: res.stats.accuracyBp / 10_000,
  };
}

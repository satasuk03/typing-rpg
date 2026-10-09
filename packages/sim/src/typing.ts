// Typing engine (T1.2): plates, first-letter targeting, per-char advance, typos, Escape, completion, combo, key streak,
// ATB charge, live stats. Rules: docs/interfaces.md §3.3 and docs/brainstorm/01-combat-and-levels.md §1.
// Enemy-side consequences of a completed plate (chip hit, death, replacement plate) go through TypingHooks (level.ts).
import { launchAutoAttack } from "./attack.ts";
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import type {
  ComboTier,
  EntityId,
  KeyStreakTier,
  PlateId,
  PlateKind,
  TargetDropReason,
} from "./events.ts";
import { BP, mulBp } from "./fixed.ts";
import type { SimKey } from "./input.ts";
import { emitPassive, hasPassive, lastStandMultBp, tutorialCue } from "./passives.ts";
import type { EncounterState, PlateState, RunState } from "./state.ts";
import { grantBarrier } from "./statuses.ts";
import type { Gimmick, LevelState } from "./types.ts";
import { firstLetter, plateFolds } from "./words.ts";

export interface TypingHooks {
  /** Called after a plate was completed and removed (WordCompleted/PlateRemoved already emitted). */
  onPlateCompleted(state: LevelState, plate: PlateState, emit: Emit): void;
}

// ---------------------------------------------------------------- tiers & multipliers

export const comboTierOf = (combo: number): ComboTier => {
  let t = 0;
  for (const th of K.COMBO_TIERS) if (combo >= th) t++;
  return t as ComboTier;
};
export const keyStreakTierOf = (streak: number): KeyStreakTier => {
  let t = 0;
  for (const th of K.KEY_STREAK_TIERS) if (streak >= th) t++;
  return t as KeyStreakTier;
};
/** ComboMult = 1 + COMBO_PER x min(combo, COMBO_CAP), in basis points (<= 15_000 with the defaults). */
export const comboMultBp = (combo: number): number =>
  BP + K.COMBO_PER_BP * Math.min(combo, K.COMBO_CAP);

export const isExclusiveKind = (k: PlateKind): boolean => k === "secondWind" || k === "finisher";
/** Only word and guard plates pay ATB (secondWind, finisher, doom and minigame plates do not; kept in T1.5). */
const paysAtb = (k: PlateKind): boolean => k === "word" || k === "guard";

// ---------------------------------------------------------------- plate management

export function findPlate(enc: EncounterState, id: PlateId | null): PlateState | null {
  if (id === null) return null;
  return enc.plates.find((p) => p.id === id) ?? null;
}

/** Case-folded first letters of every visible plate except `exceptId` (all plates are targetable by first letter). */
export function visibleFirstLetters(
  enc: EncounterState,
  exceptId: PlateId | null = null,
): string[] {
  const out: string[] = [];
  for (const p of enc.plates) {
    if (p.id === exceptId) continue;
    out.push(firstLetter(p.text));
    // a scrambled plate's first VISIBLE letter must stay distinct too (gimmicks never break the rule, T1.5)
    if (p.scrambled) out.push(firstLetter(p.display));
  }
  return out;
}

export interface PlateSpec {
  ownerId: EntityId | null;
  kind: PlateKind;
  text: string;
  replacesPlateId?: PlateId | null;
  expiresAt?: number | null;
  totalTicks?: number | null;
  lane?: number | null;
  /** T1.5 gimmicks: the scrambled text to show (default: the text), the carried gimmick and the Fading word's fade tick. */
  display?: string;
  gimmick?: Gimmick | null;
  fadeAt?: number | null;
}

/** Adds a plate and emits PlateShown. Exclusive kinds are auto-targeted (TargetAcquired). The caller guarantees letter uniqueness. */
export function addPlate(state: LevelState, spec: PlateSpec, emit: Emit): PlateState {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const plate: PlateState = {
    id: state.nextId++,
    ownerId: spec.ownerId,
    kind: spec.kind,
    text: spec.text,
    display: spec.display ?? spec.text,
    fold: plateFolds(spec.text, run.options.caseMode),
    typed: 0,
    perfect: true,
    typos: 0,
    lastTypoTick: null,
    penalized: false,
    maxPaid: 0,
    paidChars: 0,
    paidAtbM: 0,
    tFirst: null,
    shownTick: state.tick,
    expiresAt: spec.expiresAt ?? null,
    totalTicks: spec.totalTicks ?? null,
    lane: spec.lane ?? null,
    wordsDone: 0,
    gimmick: spec.gimmick ?? null,
    fadeAt: spec.fadeAt ?? null,
    faded: false,
    scrambled: spec.display !== undefined && spec.display !== spec.text,
  };
  enc.plates.push(plate);
  emit({
    type: "PlateShown",
    tick: state.tick,
    plateId: plate.id,
    ownerId: plate.ownerId,
    kind: plate.kind,
    text: plate.text,
    display: plate.display,
    lane: plate.lane,
    replacesPlateId: spec.replacesPlateId ?? null,
  });
  if (isExclusiveKind(plate.kind)) {
    enc.targetPlateId = plate.id;
    emit({ type: "TargetAcquired", tick: state.tick, plateId: plate.id, ownerId: plate.ownerId });
  }
  return plate;
}

export function removePlate(
  state: LevelState,
  plate: PlateState,
  reason: "completed" | "replaced" | "ownerDied" | "expired" | "phaseEnded",
  emit: Emit,
): void {
  const enc = state.enc as EncounterState;
  const i = enc.plates.indexOf(plate);
  if (i >= 0) enc.plates.splice(i, 1);
  if (enc.targetPlateId === plate.id) enc.targetPlateId = null;
  emit({ type: "PlateRemoved", tick: state.tick, plateId: plate.id, reason });
}

/** Drops the target (if any) with a reason, resetting that plate's progress but keeping `perfect` and `maxPaid` (B1). */
export function dropTarget(state: LevelState, reason: TargetDropReason, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const plate = findPlate(enc, enc.targetPlateId);
  if (plate === null) return;
  enc.targetPlateId = null;
  plate.typed = 0;
  plate.tFirst = null;
  emit({
    type: "TargetDropped",
    tick: state.tick,
    plateId: plate.id,
    ownerId: plate.ownerId,
    reason,
  });
}

// ---------------------------------------------------------------- ATB

/** Adds ATB; on full emits AtbFilled, keeps the overflow up to the cap and launches the auto-attack (attack.ts). */
export function addAtb(state: LevelState, gainM: number, emit: Emit): void {
  const enc = state.enc as EncounterState;
  enc.atbM += gainM;
  if (enc.atbM >= K.ATB_FULL_M) {
    const overflow = Math.min(enc.atbM - K.ATB_FULL_M, K.ATB_OVERFLOW_CAP_M);
    enc.atbM = overflow;
    emit({ type: "AtbFilled", tick: state.tick, overflowM: overflow });
    launchAutoAttack(state, emit);
  }
}

// ---------------------------------------------------------------- tier bookkeeping

function setCombo(state: LevelState, combo: number, emit: Emit): void {
  const run = state.run;
  const from = run.comboTier;
  run.combo = combo;
  if (combo > run.stats.maxCombo) run.stats.maxCombo = combo;
  const to = comboTierOf(combo);
  if (to !== from) {
    run.comboTier = to;
    emit({ type: "ComboTierChanged", tick: state.tick, from, to, combo });
    if (to >= 1) tutorialCue(state, "combo", emit);
  }
}

function setKeyStreak(state: LevelState, streak: number, emit: Emit): void {
  const run = state.run;
  const from = run.keyStreakTier;
  run.keyStreak = streak;
  if (streak > run.stats.maxKeyStreak) run.stats.maxKeyStreak = streak;
  const to = keyStreakTierOf(streak);
  if (to !== from) {
    run.keyStreakTier = to;
    emit({ type: "KeyStreakTierChanged", tick: state.tick, from, to, keyStreak: streak });
  }
}

/** Public hook for T1.3/T1.4 (e.g. Sword parry bonus, Bulwark Streak): add to the mechanical combo with tier events. */
export function addCombo(state: LevelState, delta: number, emit: Emit): void {
  setCombo(state, Math.max(0, state.run.combo + delta), emit);
}

// ---------------------------------------------------------------- key handling

const matches = (plate: PlateState, index: number, key: string): boolean => {
  const want = plate.text.charAt(index);
  return plate.fold ? want.toLowerCase() === key.toLowerCase() : want === key;
};

/** Applies one key while the encounter is live. A no-op outside "combat"/"secondWind" phases. */
export function handleKey(state: LevelState, key: SimKey, hooks: TypingHooks, emit: Emit): void {
  if (state.phase !== "combat" && state.phase !== "secondWind") return;
  const enc = state.enc;
  if (enc === null) return;
  const target = findPlate(enc, enc.targetPlateId);

  if (key === "Escape") {
    if (target !== null && !isExclusiveKind(target.kind)) dropTarget(state, "escape", emit);
    return;
  }
  if (target !== null) {
    if (target.typed < target.text.length && matches(target, target.typed, key)) {
      correctChar(state, target, hooks, emit);
    } else {
      typo(state, target, key, emit);
    }
    return;
  }
  // no target: a space is ignored; a first letter acquires; anything else is a stray typo
  if (key === " ") return;
  const hit = enc.plates.find((p) => !isExclusiveKind(p.kind) && matches(p, 0, key));
  if (hit === undefined) {
    typo(state, null, key, emit);
    return;
  }
  enc.targetPlateId = hit.id;
  emit({ type: "TargetAcquired", tick: state.tick, plateId: hit.id, ownerId: hit.ownerId });
  correctChar(state, hit, hooks, emit);
}

function correctChar(state: LevelState, plate: PlateState, hooks: TypingHooks, emit: Emit): void {
  const run = state.run;
  const tick = state.tick;
  const idx = plate.typed;
  const isLast = idx === plate.text.length - 1;

  run.strayLatch = false;
  run.wrongStreak = 0;
  run.stats.correctChars++;
  if (idx === 0) plate.tFirst = tick;
  if (plate.scrambled) {
    // Scrambled word: the right first letter unlocks the plate (it unscrambles for good)
    plate.scrambled = false;
    plate.display = plate.text;
    if (plate.ownerId !== null)
      emit({ type: "WordUnscrambled", tick, plateId: plate.id, enemyId: plate.ownerId });
  }

  // ATB: pay once per index (anti-farm, B1)
  let gainM = 0;
  if (paysAtb(plate.kind) && idx >= plate.maxPaid) {
    gainM = mulBp(K.WEAPONS[run.loadout.weapon.archetype].charChargeM, comboMultBp(run.combo));
    gainM = mulBp(gainM, lastStandMultBp(state, emit)); // Last Stand: +40% ATB charge at low HP
    plate.paidChars++;
    plate.paidAtbM += gainM;
  }
  if (idx >= plate.maxPaid) plate.maxPaid = idx + 1;
  plate.typed = idx + 1;

  const streak = run.keyStreak + 1;
  const streakTier = keyStreakTierOf(streak);
  emit({
    type: "CharCorrect",
    tick,
    plateId: plate.id,
    ownerId: plate.ownerId,
    kind: plate.kind,
    index: idx,
    char: plate.text.charAt(idx),
    isLast,
    combo: run.combo,
    comboTier: run.comboTier,
    keyStreak: streak,
    keyStreakTier: streakTier,
    atbGainM: gainM,
  });
  setKeyStreak(state, streak, emit);
  burst(state, emit);
  if (gainM > 0) {
    tutorialCue(state, "atb", emit);
    addAtb(state, gainM, emit);
  }

  // sentence words: a finished word inside a multi-word plate (space typed, or the last char)
  if (plate.text.includes(" ") && (plate.text.charAt(idx) === " " || isLast)) {
    const words = plate.text.split(" ");
    emit({
      type: "SentenceWordDone",
      tick,
      plateId: plate.id,
      kind: plate.kind,
      wordIndex: plate.wordsDone,
      wordCount: words.length,
    });
    plate.wordsDone++;
  }

  if (isLast) completePlate(state, plate, hooks, emit);
}

/** BurstWpm over the last BURST_CHARS correct chars; cooldown BURST_COOLDOWN_T; bands relative to Pace (D30). */
function burst(state: LevelState, emit: Emit): void {
  const run = state.run;
  const t = state.tick;
  run.burstTicks.push(t);
  if (run.burstTicks.length > K.BURST_CHARS) run.burstTicks.shift();
  const n = run.burstTicks.length;
  if (n < 2) {
    run.burstWpm = 0;
    return;
  }
  const span = Math.max(1, t - (run.burstTicks[0] as number));
  const wpm = Math.floor(((n - 1) * 720) / span);
  run.burstWpm = wpm;
  if (n < K.BURST_CHARS) return;
  if (run.lastBurstTick !== null && t - run.lastBurstTick < K.BURST_COOLDOWN_T) return;
  const pace = run.options.pace;
  let band: "swift" | "blazing" | null = null;
  if (wpm * BP >= pace * K.BURST_BLAZING_BP) band = "blazing";
  else if (wpm * BP >= pace * K.SWIFT_THRESHOLD_BP) band = "swift";
  if (band !== null) {
    run.lastBurstTick = t;
    emit({ type: "BurstWpm", tick: t, wpm, band });
  }
}

function typo(state: LevelState, plate: PlateState | null, got: string, emit: Emit): void {
  const run = state.run;
  const enc = state.enc as EncounterState;
  const tick = state.tick;
  const comboBefore = run.combo;
  const keyStreakBefore = run.keyStreak;
  run.stats.typos++;
  run.wrongStreak++;
  if (plate !== null) {
    plate.perfect = false;
    plate.typos++;
    plate.lastTypoTick = tick;
  }
  const mode = run.options.comboMode;
  let penalty: "halved" | "reset" | "none" | "latched" | "forgiven" = "none";
  let newCombo = comboBefore;
  let steady = false;
  if (mode !== "zen") {
    const latched = plate !== null ? plate.penalized : run.strayLatch;
    if (latched) {
      penalty = "latched";
    } else {
      if (plate !== null) plate.penalized = true;
      else run.strayLatch = true;
      if (enc.steadyLeft > 0 && hasPassive(run, "steadyHands")) {
        // Steady Hands: the first typo of each encounter does not crack the combo (nor cost ATB in strict mode)
        enc.steadyLeft--;
        penalty = "forgiven";
        steady = true;
      } else if (mode === "gentle") {
        newCombo = Math.floor(comboBefore / 2);
        penalty = "halved";
      } else {
        newCombo = 0;
        penalty = "reset";
        enc.atbM = Math.max(0, enc.atbM - K.STRICT_TYPO_ATB_M);
      }
    }
  }
  emit({
    type: "Typo",
    tick,
    plateId: plate === null ? null : plate.id,
    ownerId: plate === null ? null : plate.ownerId,
    kind: plate === null ? null : plate.kind,
    index: plate === null ? 0 : plate.typed,
    expected: plate === null ? null : plate.text.charAt(plate.typed),
    got,
    comboBefore,
    combo: newCombo,
    keyStreakBefore,
    penalty,
  });
  if (steady) emitPassive(state, "steadyHands", null, emit);
  setKeyStreak(state, 0, emit);
  if (newCombo !== comboBefore) {
    if (hasPassive(run, "comeback")) run.comebackLost += comboBefore - newCombo;
    setCombo(state, newCombo, emit);
  }

  // beginner auto-unlock: N consecutive wrong keys drop the lock (doc 01 §1.2)
  const n = run.options.autoUnlockAfterTypos;
  if (n > 0 && plate !== null && run.wrongStreak >= n && !isExclusiveKind(plate.kind)) {
    run.wrongStreak = 0;
    dropTarget(state, "autoUnlock", emit);
  }
}

function completePlate(state: LevelState, plate: PlateState, hooks: TypingHooks, emit: Emit): void {
  const run = state.run;
  const tick = state.tick;
  const perfect = plate.perfect;
  const len = plate.text.length;
  const wordWpm = Math.floor(((len - 1) * 720) / Math.max(1, tick - (plate.tFirst ?? tick)));
  const swift =
    plate.kind === "word" && perfect && wordWpm * BP >= run.options.pace * K.SWIFT_THRESHOLD_BP;

  let bonusM = 0;
  if (paysAtb(plate.kind)) {
    const w = K.WEAPONS[run.loadout.weapon.archetype];
    bonusM = perfect ? mulBp(w.wordBonusM, K.PERFECT_ATB_MULT_BP) : w.wordBonusM;
    if (perfect) bonusM += mulBp(plate.paidAtbM, K.PERFECT_CHAR_BONUS_BP);
    if (swift) bonusM += K.SWIFT_ATB_M;
    bonusM = mulBp(bonusM, lastStandMultBp(state, emit));
  }

  run.stats.wordsCompleted++;
  if (perfect) run.stats.perfectWords++;
  if (paysAtb(plate.kind)) {
    run.lastWordPerfect = perfect; // Clean Cut
    // crit share since the last auto-attack (D10); counted BEFORE this word's ATB can fill the gauge
    const enc = state.enc as EncounterState;
    enc.critWords++;
    if (perfect) enc.critPerfect++;
  }
  // mechanical combo: a Perfect completion is +1 (a Sword Perfect Parry +1 more); imperfect leaves it unchanged
  let combo = run.combo;
  let comeback = false;
  if (perfect) {
    combo += 1;
    if (plate.kind === "guard" && run.loadout.weapon.archetype === "sword") combo += 1;
    if (run.comebackLost > 0 && hasPassive(run, "comeback")) {
      // Comeback: the next perfect word wins back half the combo a typo cost
      combo += mulBp(run.comebackLost, K.COMEBACK_RESTORE_BP);
      run.comebackLost = 0;
      comeback = true;
    }
  }
  const wordKey = plate.text.toLowerCase();
  run.words.push({
    wordKey,
    text: plate.text,
    kind: plate.kind,
    perfect,
    typos: plate.typos,
    wpm: wordWpm,
  });
  emit({
    type: "WordCompleted",
    tick,
    plateId: plate.id,
    ownerId: plate.ownerId,
    kind: plate.kind,
    text: plate.text,
    wordKey,
    perfect,
    swift,
    atbGainM: bonusM,
    combo,
  });
  if (plate.kind === "guard" && plate.ownerId !== null) {
    emit({
      type: "GuardWordTyped",
      tick,
      enemyId: plate.ownerId,
      plateId: plate.id,
      perfect,
      result: perfect ? "parry" : "block",
    });
  }
  removePlate(state, plate, "completed", emit);
  const comboBefore = run.combo;
  if (combo !== run.combo) setCombo(state, combo, emit);
  if (comeback) emitPassive(state, "comeback", null, emit);
  if (
    hasPassive(run, "bulwarkStreak") &&
    Math.floor(combo / K.BULWARK_EVERY_COMBO) > Math.floor(comboBefore / K.BULWARK_EVERY_COMBO)
  ) {
    // Bulwark Streak: every 10 combo conjures a one-hit barrier
    grantBarrier(state, K.BULWARK_BARRIER_HITS, null, null, emit);
    emitPassive(state, "bulwarkStreak", null, emit);
  }
  if (bonusM > 0) addAtb(state, bonusM, emit);
  hooks.onPlateCompleted(state, plate, emit);
}

// ---------------------------------------------------------------- live stats (integer math)

/** Net WPM x100 = floor(correctChars x 60 x 100 x TICK_HZ / (5 x activeTicks)) = correctChars x 72_000 / activeTicks. */
export const netWpmX100 = (run: RunState): number =>
  Math.floor((run.stats.correctChars * 72_000) / Math.max(1, run.activeTicks));

/** floor(correct x BP / (correct + typos)); BP when no keys. */
export const accuracyBp = (run: RunState): number => {
  const total = run.stats.correctChars + run.stats.typos;
  return total === 0 ? BP : Math.floor((run.stats.correctChars * BP) / total);
};

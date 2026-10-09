// Level runtime for the "typing-only" slice (T1.2): segment flow, encounters of plates with attack timers, getView and
// getResult. Combat numbers (HP/damage/ATB attacks/skills/boss script) arrive in T1.3-T1.6; every stub is marked "STUB".
// Tick processing order: docs/interfaces.md §3.2 (inputs are applied first, then step runs steps 1-7 for the tick).
import type { WeaponArchetype } from "@hd2d/content";
import { type Emit, emitTo } from "./bus.ts";
import { SimError } from "./errors.ts";
import type { EntityId, HitOrigin, SimEvent } from "./events.ts";
import { BP, type Milli, mulDiv, toDisplay } from "./fixed.ts";
import {
  cancelAttack,
  enemyDef,
  type ImpactResolver,
  initAttack,
  scheduleAttack,
  stepEnemyAttacks,
} from "./guard.ts";
import { deepClone } from "./hash.ts";
import type { SimInput } from "./input.ts";
import { below, deriveRng } from "./rng.ts";
import type { EncounterState, EnemyState, PlateState, RunState } from "./state.ts";
import type {
  LevelOptions,
  LevelPhase,
  LevelResult,
  LevelState,
  Loadout,
  ResolvedLevel,
} from "./types.ts";
import {
  accuracyBp,
  addAtb,
  addPlate,
  comboMultBp,
  dropTarget,
  findPlate,
  handleKey,
  netWpmX100,
  removePlate,
  type TypingHooks,
  visibleFirstLetters,
} from "./typing.ts";
import { TK } from "./typingBalance.ts";
import type { EnemyPose, EnemyView, HeroPose, LevelView, PlateView } from "./view.ts";
import { pickPlateWord, RECENT_LIMIT } from "./words.ts";

const WEAPON_DAMAGE_TYPE: Readonly<
  Record<WeaponArchetype, "slash" | "pierce" | "arcane" | "blunt">
> = {
  sword: "slash",
  dagger: "pierce",
  staff: "arcane",
  hammer: "blunt",
};

const isTerminal = (s: Readonly<LevelState>): boolean =>
  s.phase === "cleared" || s.phase === "failed";

// ---------------------------------------------------------------- create

export function createLevel(
  def: ResolvedLevel,
  loadout: Loadout,
  seed: number,
  options: LevelOptions,
): LevelState {
  if (def.segments.length === 0) throw new SimError("createLevel: level has no segments");
  if (!Number.isSafeInteger(seed)) throw new SimError("createLevel: seed must be an integer");
  const pace = Math.min(TK.AUTO_PACE_MAX, Math.max(TK.AUTO_PACE_MIN, Math.round(options.pace)));
  const run: RunState = {
    def: structuredPlain(def),
    loadout: structuredPlain(loadout),
    options: { ...structuredPlain(options), pace },
    started: false,
    phaseStart: 0,
    combo: 0,
    comboTier: 0,
    keyStreak: 0,
    keyStreakTier: 0,
    strayLatch: false,
    wrongStreak: 0,
    stats: {
      correctChars: 0,
      typos: 0,
      wordsCompleted: 0,
      perfectWords: 0,
      maxCombo: 0,
      maxKeyStreak: 0,
      blocks: 0,
      perfectParries: 0,
      hitsTaken: 0,
      autoAttacks: 0,
      chipDamageM: 0,
    },
    activeTicks: 0,
    words: [],
    burstTicks: [],
    burstWpm: 0,
    lastBurstTick: null,
    heroMaxHpM: TK.HERO_HP0_M,
    heroHpM: TK.HERO_HP0_M,
    guardsShown: 0,
    encountersStarted: 0,
    endTick: null,
    failReason: null,
  };
  return {
    kind: "level",
    simVersion: 1,
    tick: 0,
    seed,
    phase: "walk",
    phaseUntil: 0,
    segmentIndex: 0,
    nextId: 1,
    run,
    enc: null,
  };
}

const structuredPlain = <T>(v: T): T => deepClone(v);

// ---------------------------------------------------------------- public step/input

export function applyInput(state: LevelState, input: SimInput): SimEvent[] {
  if (isTerminal(state)) return [];
  if (input.tick !== state.tick) {
    throw new SimError(`applyInput: input.tick ${input.tick} !== state.tick ${state.tick}`);
  }
  const out: SimEvent[] = [];
  const emit = emitTo(out);
  if ("cmd" in input) {
    if (input.cmd === "abandon") failLevel(state, "abandoned", emit);
    return out; // "revive" is a hook for T1.3 (allowExternalRevive); a no-op in the typing-only slice
  }
  handleKey(state, input.key, HOOKS, emit);
  return out;
}

export function step(state: LevelState, n = 1): SimEvent[] {
  if (!Number.isInteger(n) || n < 0) throw new SimError(`step: bad n ${n}`);
  const out: SimEvent[] = [];
  const emit = emitTo(out);
  for (let i = 0; i < n && !isTerminal(state); i++) stepOne(state, emit);
  return out;
}

function stepOne(state: LevelState, emit: Emit): void {
  const run = state.run;
  const t = state.tick;
  if (!run.started) {
    run.started = true;
    emit({
      type: "LevelStarted",
      tick: t,
      levelId: run.def.levelId,
      chapter: run.def.chapter,
      isBossLevel: run.def.isBoss,
      encounterCount: run.def.segments.filter((s) => s.kind !== "walk").length,
    });
    enterSegment(state, 0, emit);
  } else {
    if (state.phase === "combat") run.activeTicks++;
    // steps 1-2 (statuses, hero impacts): T1.3. Step 3: enemy timers.
    if (state.phase === "combat" && state.enc !== null)
      stepEnemyAttacks(state, resolveImpactStub, emit);
    // step 7: deaths, wave/encounter/segment transitions
    transitions(state, emit);
  }
  if (!isTerminal(state) && t + 1 >= TK.LEVEL_TIMEOUT_T) failLevel(state, "timeout", emit);
  state.tick = t + 1;
}

function transitions(state: LevelState, emit: Emit): void {
  const t = state.tick;
  for (let guard = 0; guard < 16 && !isTerminal(state); guard++) {
    const enc = state.enc;
    if (state.phase === "combat" && enc !== null) {
      if (enc.finisherShown || enc.enemies.some((e) => e.alive)) return;
      if (!enc.isBoss && enc.waveIndex + 1 < enc.waveCount) {
        spawnNextWave(state, emit);
        return;
      }
      emit({
        type: "EncounterCleared",
        tick: t,
        encounterIndex: enc.index,
        durationTicks: t - enc.startTick,
      });
      setPhase(state, "rewards", t + TK.REWARD_T);
      return;
    }
    if (state.phaseUntil === null || t < state.phaseUntil) return;
    switch (state.phase) {
      case "walk":
        emit({ type: "WalkEnded", tick: t, segmentIndex: state.segmentIndex });
        enterSegment(state, state.segmentIndex + 1, emit);
        break;
      case "encounterIntro":
      case "bossIntro":
        setPhase(state, "combat", null);
        break;
      case "rewards":
        enterSegment(state, state.segmentIndex + 1, emit);
        break;
      default:
        return;
    }
  }
}

function setPhase(state: LevelState, phase: LevelPhase, until: number | null): void {
  state.phase = phase;
  state.phaseUntil = until;
  state.run.phaseStart = state.tick;
}

function failLevel(
  state: LevelState,
  reason: "abandoned" | "timeout" | "defeated",
  emit: Emit,
): void {
  state.run.failReason = reason;
  state.run.endTick = state.tick;
  setPhase(state, "failed", null);
  emit({ type: "LevelFailed", tick: state.tick, reason, goldKept: 0 });
}

// ---------------------------------------------------------------- segments & encounters

function enterSegment(state: LevelState, idx: number, emit: Emit): void {
  const run = state.run;
  const t = state.tick;
  state.segmentIndex = idx;
  const seg = run.def.segments[idx];
  if (seg === undefined) {
    run.endTick = t;
    setPhase(state, "cleared", null);
    emit({ type: "LevelCleared", tick: t, levelId: run.def.levelId, durationTicks: t, gold: 0 });
    return;
  }
  if (seg.kind === "walk") {
    setPhase(state, "walk", t + seg.ticks);
    emit({
      type: "WalkStarted",
      tick: t,
      segmentIndex: idx,
      untilTick: t + seg.ticks,
      heals: seg.heal,
    });
    return;
  }
  startEncounter(state, emit);
}

function startEncounter(state: LevelState, emit: Emit): void {
  const run = state.run;
  const t = state.tick;
  const seg = run.def.segments[state.segmentIndex];
  if (seg === undefined || seg.kind === "walk")
    throw new SimError("startEncounter: not an encounter segment");
  const isBoss = seg.kind === "boss";
  const boss = isBoss ? run.def.boss : null;
  if (isBoss && boss === null) throw new SimError("boss segment without def.boss");
  const index = run.encountersStarted++;
  const typingFrom = t + (boss !== null ? boss.introTicks : TK.ENCOUNTER_INTRO_T);
  const enc: EncounterState = {
    index,
    isBoss,
    startTick: t,
    typingFromTick: typingFrom,
    waveIndex: -1,
    waveCount: seg.kind === "encounter" ? seg.waves.length : 1,
    enemies: [],
    plates: [],
    targetPlateId: null,
    focusEnemyId: null,
    atbM: 0, // hero ATB resets each encounter (D18); Opening Gambit is T1.4
    wordsRng: deriveRng(state.seed, "words", index),
    aiRng: deriveRng(state.seed, "enemyAi", index),
    combatRng: deriveRng(state.seed, "combat", index),
    gimmickRng: deriveRng(state.seed, "gimmick", index),
    recent: [],
    finisherShown: false,
  };
  state.enc = enc;
  setPhase(state, isBoss ? "bossIntro" : "encounterIntro", typingFrom);
  emit({
    type: "EncounterStarted",
    tick: t,
    encounterIndex: index,
    name: seg.kind === "encounter" ? seg.name : (boss as NonNullable<typeof boss>).name,
    isBoss,
    waveCount: enc.waveCount,
    typingFromTick: typingFrom,
  });
  spawnNextWave(state, emit);
  if (boss !== null) {
    const be = enc.enemies[0] as EnemyState;
    emit({
      type: "BossIntroStarted",
      tick: t,
      enemyId: be.id,
      bossId: boss.id,
      name: boss.name,
      title: boss.title,
      untilTick: typingFrom,
    });
  }
}

function spawnNextWave(state: LevelState, emit: Emit): void {
  const run = state.run;
  const enc = state.enc as EncounterState;
  const t = state.tick;
  const seg = run.def.segments[state.segmentIndex];
  if (seg === undefined || seg.kind === "walk") throw new SimError("spawnNextWave: bad segment");
  enc.waveIndex++;
  const boss = run.def.boss;
  const refs =
    seg.kind === "boss"
      ? [{ enemyId: (boss as NonNullable<typeof boss>).enemyId, gimmick: null }]
      : (seg.waves[enc.waveIndex] ?? []);
  let weightSum = 0;
  for (const r of refs) weightSum += enemyDef(state, r.enemyId).hpWeightBp;
  const spawned: EnemyState[] = [];
  refs.forEach((r, slot) => {
    const def = enemyDef(state, r.enemyId);
    const isBossEnemy = seg.kind === "boss";
    const maxHpM = isBossEnemy
      ? (boss as NonNullable<typeof boss>).hpM
      : Math.max(
          1000,
          mulDiv((seg as { hpPoolM: Milli }).hpPoolM, def.hpWeightBp, Math.max(1, weightSum)),
        );
    spawned.push({
      id: state.nextId++,
      defId: r.enemyId,
      slot,
      isBoss: isBossEnemy,
      alive: true,
      hpM: maxHpM,
      maxHpM,
      plateId: null,
      spawnTick: t,
      intervalTicks: 0,
      cycleStart: t,
      nextImpact: null,
      guardTicks: 0,
      windupShown: false,
      guardResult: null,
      wordsDone: 0,
    });
  });
  for (const e of spawned) enc.enemies.push(e);
  emit({
    type: "WaveStarted",
    tick: t,
    encounterIndex: enc.index,
    waveIndex: enc.waveIndex,
    enemyIds: spawned.map((e) => e.id),
  });
  for (const e of spawned) {
    emit({
      type: "EnemySpawned",
      tick: t,
      enemyId: e.id,
      defId: e.defId,
      slot: e.slot,
      maxHp: toDisplay(e.maxHpM),
      isBoss: e.isBoss,
      shieldMax: enemyDef(state, e.defId).shield,
    });
  }
  for (const e of spawned) assignWordPlate(state, e, emit);
  for (const e of spawned) {
    const p = below3000(enc);
    initAttack(state, e, p);
  }
  if (enc.focusEnemyId === null && spawned[0] !== undefined) {
    enc.focusEnemyId = spawned[0].id;
    emit({ type: "FocusChanged", tick: t, enemyId: spawned[0].id });
  }
}

const below3000 = (enc: EncounterState): number =>
  below(enc.aiRng, TK.INITIAL_ENEMY_ATB_MAX_BP + 1);

/** Assigns a fresh word plate (distinct first letter among visible plates) to an enemy. */
function assignWordPlate(state: LevelState, enemy: EnemyState, emit: Emit): PlateState {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const boss = run.def.boss;
  const lengthRange =
    enemy.isBoss && boss !== null ? boss.plateLength : enemyDef(state, enemy.defId).plateLength;
  const word = pickPlateWord(run.def, enc.wordsRng, {
    forbidden: visibleFirstLetters(enc),
    recent: enc.recent,
    lengthRange,
  });
  enc.recent.push(word);
  while (enc.recent.length > RECENT_LIMIT) enc.recent.shift();
  const plate = addPlate(state, { ownerId: enemy.id, kind: "word", text: word }, emit);
  enemy.plateId = plate.id;
  return plate;
}

// ---------------------------------------------------------------- enemy-side consequences of plates (STUBs for T1.3+)

const HOOKS: TypingHooks = {
  onPlateCompleted(state, plate, emit) {
    const enc = state.enc as EncounterState;
    const enemy =
      plate.ownerId === null ? null : (enc.enemies.find((e) => e.id === plate.ownerId) ?? null);
    if (enemy === null) return;
    if (plate.kind === "guard") {
      // the normal word returns as a fresh plate; block/parry resolves at impact
      enemy.guardResult = plate.perfect ? "parry" : "block";
      if (enemy.alive) assignWordPlate(state, enemy, emit);
      return;
    }
    if (plate.kind === "finisher") {
      emit({ type: "FinisherCompleted", tick: state.tick, enemyId: enemy.id, plateId: plate.id });
      killEnemy(state, enemy, "finisher", emit);
      return;
    }
    if (plate.kind !== "word") return;
    enemy.wordsDone++;
    if (enc.focusEnemyId !== enemy.id) {
      enc.focusEnemyId = enemy.id;
      emit({ type: "FocusChanged", tick: state.tick, enemyId: enemy.id });
    }
    // STUB word strike: kills after STUB_WORDS_TO_KILL words (T1.3: CHIP_NORMAL/PERFECT x ATK, phase gates, shields)
    const words = enemy.isBoss ? TK.STUB_WORDS_TO_KILL_BOSS : TK.STUB_WORDS_TO_KILL;
    const chipM = Math.ceil(enemy.maxHpM / words);
    const lethal = enemy.hpM - chipM <= 0;
    const dmgM = lethal && enemy.isBoss ? enemy.hpM - 1 : Math.min(chipM, enemy.hpM);
    enemy.hpM -= dmgM;
    state.run.stats.chipDamageM += dmgM;
    const killed = lethal && !enemy.isBoss;
    emit({
      type: "Hit",
      tick: state.tick,
      sourceId: 0,
      targetId: enemy.id,
      kind: "chip",
      origin: "chip",
      skillId: null,
      damageType: null,
      damage: toDisplay(dmgM),
      damageM: dmgM,
      hpAfter: toDisplay(enemy.hpM),
      maxHp: toDisplay(enemy.maxHpM),
      crit: false,
      weak: false,
      broken: false,
      atbKnockback: false,
      hitIndex: 0,
      hitCount: 1,
      killed,
    });
    if (killed) {
      killEnemy(state, enemy, "chip", emit);
    } else if (lethal && enemy.isBoss) {
      showFinisher(state, enemy, emit); // STUB boss: finisher sentence plate (exclusive, auto-targeted)
    } else {
      assignWordPlate(state, enemy, emit);
    }
  },
};

function showFinisher(state: LevelState, boss: EnemyState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const def = state.run.def.boss as NonNullable<ResolvedLevel["boss"]>;
  enc.finisherShown = true;
  cancelAttack(boss);
  if (enc.targetPlateId !== null) dropTarget(state, "phaseChanged", emit);
  for (const p of [...enc.plates]) removePlate(state, p, "phaseEnded", emit);
  boss.plateId = null;
  const plate = addPlate(
    state,
    { ownerId: boss.id, kind: "finisher", text: def.phase3.finisherText },
    emit,
  );
  boss.plateId = plate.id;
  emit({
    type: "FinisherShown",
    tick: state.tick,
    enemyId: boss.id,
    plateId: plate.id,
    text: plate.text,
  });
}

function killEnemy(
  state: LevelState,
  enemy: EnemyState,
  byKind: "chip" | "finisher",
  emit: Emit,
): void {
  const enc = state.enc as EncounterState;
  enemy.alive = false;
  enemy.hpM = 0;
  cancelAttack(enemy);
  enc.finisherShown = false;
  emit({
    type: "EnemyDeath",
    tick: state.tick,
    enemyId: enemy.id,
    defId: enemy.defId,
    isBoss: enemy.isBoss,
    byKind,
  });
  const own = findPlate(enc, enemy.plateId);
  if (own !== null) {
    if (enc.targetPlateId === own.id) dropTarget(state, "ownerDied", emit);
    removePlate(state, own, "ownerDied", emit);
  }
  enemy.plateId = null;
  if (enc.focusEnemyId === enemy.id) {
    const next = enc.enemies.find((e) => e.alive);
    enc.focusEnemyId = next === undefined ? null : next.id;
    emit({ type: "FocusChanged", tick: state.tick, enemyId: enc.focusEnemyId });
  }
}

/**
 * STUB impact (T1.3 replaces): no damage is dealt. Emits the outcome the typing decided (blocked/parried/hit) with 0
 * damage, pays the parry ATB, reverts an ignored guard plate to a normal word, and reschedules the next cycle.
 */
const resolveImpactStub: ImpactResolver = (state, enemy, emit) => {
  const enc = state.enc as EncounterState;
  const run = state.run;
  const t = state.tick;
  const outcome =
    enemy.guardResult === "parry" ? "parried" : enemy.guardResult === "block" ? "blocked" : "hit";
  emit({ type: "EnemyAttack", tick: t, enemyId: enemy.id, outcome, damage: 0 });
  if (outcome === "parried") {
    emit({ type: "GuardParried", tick: t, enemyId: enemy.id, counterDamage: 0 });
    run.stats.perfectParries++;
    addAtb(state, TK.PARRY_ATB_M, emit);
  } else if (outcome === "blocked") {
    emit({ type: "GuardBlocked", tick: t, enemyId: enemy.id, damage: 0 });
    run.stats.blocks++;
  } else {
    run.stats.hitsTaken++;
    const guardPlate = findPlate(enc, enemy.plateId);
    if (guardPlate !== null && guardPlate.kind === "guard") {
      if (enc.targetPlateId === guardPlate.id) dropTarget(state, "plateChanged", emit);
      removePlate(state, guardPlate, "expired", emit);
      assignWordPlate(state, enemy, emit);
    }
  }
  enemy.cycleStart = t;
  enemy.windupShown = false;
  enemy.guardResult = null;
  enemy.nextImpact = null;
  scheduleAttack(state, enemy, t + enemy.intervalTicks);
};

// ---------------------------------------------------------------- view & result

export function getView(state: Readonly<LevelState>): LevelView {
  const run = state.run;
  const enc = state.enc;
  const t = state.tick;
  const arch = run.loadout.weapon.archetype;
  const plates: PlateView[] = (enc?.plates ?? []).map((p) => ({
    id: p.id,
    ownerId: p.ownerId,
    kind: p.kind,
    text: p.text,
    display: p.display,
    typedIndex: p.typed,
    isTarget: enc !== null && enc.targetPlateId === p.id,
    faded: false,
    hadTypo: !p.perfect,
    lastTypoTick: p.lastTypoTick,
    lane: p.lane,
    expiresAtTick: p.expiresAt,
    totalTicks: p.totalTicks,
  }));
  const enemies: EnemyView[] = (enc?.enemies ?? []).map((e) => {
    const plate = findPlate(enc as EncounterState, e.plateId);
    const isGuard = plate !== null && plate.kind === "guard";
    const span = e.nextImpact === null ? 0 : e.nextImpact - e.cycleStart;
    const pose: EnemyPose = !e.alive
      ? "dead"
      : e.windupShown
        ? "windup"
        : t < (enc as EncounterState).typingFromTick
          ? "enter"
          : "idle";
    const def = run.def.enemies[e.defId];
    return {
      id: e.id,
      defId: e.defId,
      slot: e.slot,
      isBoss: e.isBoss,
      alive: e.alive,
      hp: e.hpM / 1000,
      maxHp: e.maxHpM / 1000,
      hpFrac: e.maxHpM === 0 ? 0 : e.hpM / e.maxHpM,
      atbFrac:
        e.nextImpact === null || span <= 0
          ? 0
          : Math.min(1, Math.max(0, (t - e.cycleStart) / span)),
      plateId: e.plateId,
      isGuard,
      guardTicksLeft: isGuard && e.nextImpact !== null ? Math.max(0, e.nextImpact - t) : 0,
      guardTotalTicks: isGuard && plate !== null ? (plate.totalTicks ?? 0) : 0,
      guardResult: e.guardResult,
      shield: def === undefined ? 0 : def.shield,
      shieldMax: def === undefined ? 0 : def.shield,
      weaknesses: (def?.weaknesses ?? []).map((type) => ({ type, revealed: false })),
      brokenTicksLeft: 0,
      statuses: [],
      isFocus: (enc as EncounterState).focusEnemyId === e.id,
      pose,
      poseSinceTick: e.spawnTick,
    };
  });
  const heroPose: HeroPose =
    state.phase === "walk"
      ? "walk"
      : state.phase === "cleared"
        ? "victory"
        : state.phase === "failed"
          ? "downed"
          : "idle";
  const span = state.phaseUntil === null ? 0 : state.phaseUntil - run.phaseStart;
  const bossEnemy = enc?.isBoss ? enc.enemies[0] : undefined;
  const bossDef = run.def.boss;
  return {
    tick: t,
    phase: state.phase,
    phaseProgress:
      state.phaseUntil === null || span <= 0
        ? 0
        : Math.min(1, Math.max(0, (t - run.phaseStart) / span)),
    levelId: run.def.levelId,
    chapter: run.def.chapter,
    isBossLevel: run.def.isBoss,
    encounterIndex: enc === null ? null : enc.index,
    encounterCount: run.def.segments.filter((s) => s.kind !== "walk").length,
    waveIndex: enc === null ? null : enc.waveIndex,
    hero: {
      hp: run.heroHpM / 1000,
      maxHp: run.heroMaxHpM / 1000,
      hpFrac: run.heroHpM / run.heroMaxHpM,
      atbFrac: enc === null ? 0 : Math.min(1, enc.atbM / TK.ATB_FULL_M),
      archetype: arch,
      weaponDamageType: WEAPON_DAMAGE_TYPE[arch],
      barrierCharges: 0,
      statuses: [],
      secondWindAvailable: true,
      pose: heroPose,
      poseSinceTick: run.phaseStart,
    },
    enemies,
    plates,
    targetPlateId: enc === null ? null : enc.targetPlateId,
    focusEnemyId: enc === null ? null : enc.focusEnemyId,
    combo: run.combo,
    comboTier: run.comboTier,
    comboMult: comboMultBp(run.combo) / BP,
    comboMode: run.options.comboMode,
    keyStreak: run.keyStreak,
    keyStreakTier: run.keyStreakTier,
    skills: [],
    passives: run.loadout.passives.filter((p): p is NonNullable<typeof p> => p !== null),
    boss:
      bossEnemy !== undefined && bossDef !== null
        ? {
            enemyId: bossEnemy.id,
            name: bossDef.name,
            title: bossDef.title,
            phase: 1,
            gateHpFrac: null,
          }
        : null,
    doom: null,
    minigame: null,
    secondWind: null,
    stats: {
      netWpm: netWpmX100(run) / 100,
      accuracy: accuracyBp(run),
      burstWpm: run.burstWpm,
      elapsedTicks: t,
      activeTicks: run.activeTicks,
    },
    goldCollected: 0,
  };
}

/** Non-null once terminal. T1.6 adds gold, chests and the reward rolls; this reports the typing stats. */
export function getResult(state: Readonly<LevelState>): LevelResult | null {
  if (!isTerminal(state)) return null;
  const run = state.run;
  const origins: Record<HitOrigin, number> = {
    weapon: 0,
    chip: run.stats.chipDamageM,
    skill: 0,
    counter: 0,
    minigame: 0,
    finisher: 0,
  };
  return {
    levelId: run.def.levelId,
    outcome: state.phase === "cleared" ? "cleared" : "failed",
    failReason: run.failReason,
    durationTicks: run.endTick ?? state.tick,
    activeTicks: run.activeTicks,
    gold: 0,
    chests: [],
    stats: {
      correctChars: run.stats.correctChars,
      typos: run.stats.typos,
      wordsCompleted: run.stats.wordsCompleted,
      perfectWords: run.stats.perfectWords,
      maxCombo: run.stats.maxCombo,
      maxKeyStreak: run.stats.maxKeyStreak,
      netWpmX100: netWpmX100(run),
      accuracyBp: accuracyBp(run),
      hitsTaken: run.stats.hitsTaken,
      blocks: run.stats.blocks,
      perfectParries: run.stats.perfectParries,
      autoAttacks: run.stats.autoAttacks,
      skillsCast: 0,
      secondWindUsed: false,
      damageByOriginM: origins,
    },
    words: run.words.map((w) => ({ ...w })),
  };
}

export type { EntityId };

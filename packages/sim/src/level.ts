// Level runtime: segment flow, encounters, getView and getResult. Typing rules live in typing.ts, combat in combat.ts,
// the Ruin Golem script in boss.ts and the typing gimmicks in gimmick.ts. Rewards (T1.6) plug in at the level end.
// Tick processing order: docs/interfaces.md §3.2 (inputs are applied first, then step runs steps 1-7 for the tick).
import type { WeaponArchetype } from "@hd2d/content";
import { K } from "./balance.ts";
import {
  bossHold,
  clearRubble,
  completeDoom,
  endBreather,
  gateFor,
  initBossState,
  stepBoss,
} from "./boss.ts";
import { type Emit, emitTo } from "./bus.ts";
import {
  chipHit,
  expireBreaks,
  expireStaggers,
  externalRevive,
  guardLeakBp,
  resolveHeroImpacts,
  resolveImpact,
  secondWindFailed,
  secondWindSucceeded,
  walkHeal,
} from "./combat.ts";
import { assignWordPlate, enemyById, killEnemy } from "./encounter.ts";
import { SimError } from "./errors.ts";
import type { HitOrigin, SimEvent } from "./events.ts";
import { BP, type Milli, mulBp, mulDiv, toDisplay } from "./fixed.ts";
import { failLevel, isTerminal, setPhase } from "./flow.ts";
import { stepGimmicks } from "./gimmick.ts";
import { enemyDef, holdAttacks, initAttack, stepEnemyAttacks } from "./guard.ts";
import { deepClone } from "./hash.ts";
import type { SimInput } from "./input.ts";
import { openChest, rollEncounterChest } from "./meta/chests.ts";
import { computeHeroStats, guardRatingBp } from "./meta/loadout.ts";
import { emitPassive, hasPassive, tutorialCue } from "./passives.ts";
import { below, deriveRng } from "./rng.ts";
import { chargeSkills, checkSkillCasts, resolveSkillImpacts, tickDots } from "./skills.ts";
import type { EncounterState, EnemyState, RunState } from "./state.ts";
import { stepFreezes } from "./statuses.ts";
import type {
  Gimmick,
  LevelOptions,
  LevelResult,
  LevelState,
  Loadout,
  ResolvedLevel,
} from "./types.ts";
import {
  accuracyBp,
  comboMultBp,
  findPlate,
  handleKey,
  netWpmX100,
  type TypingHooks,
} from "./typing.ts";
import type {
  EnemyPose,
  EnemyView,
  HeroPose,
  LevelView,
  PlateView,
  SkillView,
  StatusView,
} from "./view.ts";

const WEAPON_DAMAGE_TYPE: Readonly<
  Record<WeaponArchetype, "slash" | "pierce" | "arcane" | "blunt">
> = {
  sword: "slash",
  dagger: "pierce",
  staff: "arcane",
  hammer: "blunt",
};

// ---------------------------------------------------------------- create

export function createLevel(
  def: ResolvedLevel,
  loadout: Loadout,
  seed: number,
  options: LevelOptions,
): LevelState {
  if (def.segments.length === 0) throw new SimError("createLevel: level has no segments");
  if (!Number.isSafeInteger(seed)) throw new SimError("createLevel: seed must be an integer");
  const pace = Math.min(K.PACE_MAX, Math.max(K.PACE_MIN, Math.round(options.pace)));
  const hero = computeHeroStats(loadout);
  const run: RunState = {
    def: deepClone(def),
    loadout: deepClone(loadout),
    options: { ...deepClone(options), pace },
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
      damageByOriginM: { weapon: 0, chip: 0, skill: 0, counter: 0, minigame: 0, finisher: 0 },
      damageBySkillM: {
        slashWave: 0,
        piercingThrust: 0,
        fireball: 0,
        frostLock: 0,
        mendingLight: 0,
        aegis: 0,
      },
      skillsCast: 0,
    },
    activeTicks: 0,
    words: [],
    burstTicks: [],
    burstWpm: 0,
    lastBurstTick: null,
    heroAtkM: hero.atk,
    heroMaxHpM: hero.maxHp,
    heroHpM: hero.maxHp,
    barrier: 0,
    skillChargeM: [0, 0],
    skillReady: [false, false],
    weaponAttacks: 0,
    lastWordPerfect: false,
    comebackLost: 0,
    lastStandOn: false,
    cues: [],
    secondWindUsed: false,
    goldCollected: 0,
    chests: [],
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
    else externalRevive(state, input.source, emit); // gem/feather hook: a no-op unless options.allowExternalRevive
    return out;
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
    if (state.phase === "combat" && state.enc !== null) {
      expireBreaks(state, emit); // step 1: timers and statuses (break, stagger, freeze)
      expireStaggers(state, emit);
      stepFreezes(state, emit);
      resolveHeroImpacts(state, emit); // step 2: scheduled hero impacts: auto-attacks, then skills, then DoT ticks
      resolveSkillImpacts(state, emit);
      tickDots(state, emit);
      if (run.options.tutorial && run.stats.wordsCompleted < K.TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS)
        holdAttacks(state); // tutorial: enemies hold their attacks until the hero has typed a few words
      stepEnemyAttacks(state, resolveImpact, emit); // step 3: enemy timers
      if (state.phase === "combat") {
        stepGimmicks(state, emit); // step 4: gimmick timers (Fading words)
        stepBoss(state, emit); // step 5: boss script (doom deadline, rubble, phase gates)
      }
      if (state.phase === "combat") checkSkillCasts(state, emit); // step 6: auto-cast
    }
    // step 7: deaths, wave/encounter/segment transitions
    transitions(state, emit);
  }
  if (!isTerminal(state) && t + 1 >= K.LEVEL_TIMEOUT_T) failLevel(state, "timeout", emit);
  state.tick = t + 1;
}

/** Pays this encounter's share of the level gold and rolls its chest (T1.6). The `loot` stream is derived here, at roll time. */
function payEncounter(state: LevelState, enc: EncounterState, emit: Emit): void {
  const run = state.run;
  const n = run.def.segments.filter((s) => s.kind !== "walk").length;
  const total = mulBp(run.def.goldTotal, run.options.goldMultBp);
  const share = Math.floor(total / n);
  const amount = enc.index === n - 1 ? total - share * (n - 1) : share;
  run.goldCollected += amount;
  emit({
    type: "GoldGained",
    tick: state.tick,
    amount,
    source: "encounter",
    total: run.goldCollected,
  });
  const loot = deriveRng(state.seed, "loot", enc.index);
  const tier = rollEncounterChest(loot, { boss: enc.isBoss, firstClear: run.options.firstClear });
  if (tier === null) return;
  run.chests.push(
    openChest(loot, tier, {
      chapter: run.def.chapter,
      frontierChapter: run.options.frontierChapter,
      firstClear: run.options.firstClear,
      equippedArchetype: run.loadout.weapon.archetype,
    }),
  );
  emit({ type: "ChestDropped", tick: state.tick, tier, encounterIndex: enc.index, enemyId: null });
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
      payEncounter(state, enc, emit);
      setPhase(state, "rewards", t + K.REWARD_T);
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
        tutorialCue(state, "target", emit);
        break;
      case "rewards":
        enterSegment(state, state.segmentIndex + 1, emit);
        break;
      case "bossBreather":
        endBreather(state, emit);
        break;
      case "secondWind":
        secondWindFailed(state, emit);
        break;
      default:
        return;
    }
  }
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
    emit({
      type: "LevelCleared",
      tick: t,
      levelId: run.def.levelId,
      durationTicks: t,
      gold: run.goldCollected,
    });
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
    if (seg.heal) walkHeal(state, emit);
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
  const typingFrom = t + (boss !== null ? boss.introTicks : K.ENCOUNTER_INTRO_T);
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
    atbM: hasPassive(run, "openingGambit") ? K.OPENING_GAMBIT_ATB_M : 0, // resets each encounter (D18); Opening Gambit starts at 50
    pending: [],
    critWords: 0,
    critPerfect: 0,
    frozenAt: null,
    wordsRng: deriveRng(state.seed, "words", index),
    aiRng: deriveRng(state.seed, "enemyAi", index),
    combatRng: deriveRng(state.seed, "combat", index),
    gimmickRng: deriveRng(state.seed, "gimmick", index),
    boss: null,
    recent: [],
    finisherShown: false,
    steadyLeft: K.STEADY_FORGIVEN,
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
  if (hasPassive(run, "openingGambit")) emitPassive(state, "openingGambit", null, emit);
  spawnNextWave(state, emit);
  if (boss !== null) {
    const be = enc.enemies[0] as EnemyState;
    enc.boss = initBossState(state, enc.enemies);
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
  const bossSeg = seg.kind === "boss";
  if (bossSeg && boss === null) throw new SimError("boss segment without def.boss");
  // A boss wave is [boss, ...adds]: the boss is slot 0 (enemies[0] everywhere), its phase-1 adds follow.
  // Boss adds (orchestrator ruling, T1.5): BossDef carries no add stats, so an add is its EnemyDef scaled by the level's
  // encounter scaling, exactly like a normal wave: HP = addsPool x hpWeight / sum(add hpWeights), hit = addsGruntHit x
  // hitWeight. resolveLevel sets addsPool = boss HP x BOSS_ADDS_HP_ENC / BOSS_HP_ENC (0.5 / 3.2 = 117.6 at L10, i.e. 58.8 per add
  // on average, the economy_sim add HP: two equal adds of 0.5 x 235.3 / 2) and addsGruntHit = the level's encounter gruntHit.
  const refs: { enemyId: string; gimmick: Gimmick | null }[] =
    boss !== null && bossSeg
      ? [{ enemyId: boss.enemyId, gimmick: null }, ...boss.phase1.adds]
      : ((seg as { waves: { enemyId: string; gimmick: Gimmick | null }[][] }).waves[
          enc.waveIndex
        ] ?? []);
  const firstAdd = bossSeg ? 1 : 0; // refs[firstAdd..] share the pool
  let weightSum = 0;
  for (let i = firstAdd; i < refs.length; i++)
    weightSum += enemyDef(state, (refs[i] as { enemyId: string }).enemyId).hpWeightBp;
  const addsPoolM =
    boss === null
      ? 0
      : (boss.phase1.addsHpPoolM ?? mulDiv(boss.hpM, K.BOSS_ADDS_HP_NUM, K.BOSS_ADDS_HP_DEN));
  const addsHitM =
    boss === null ? 0 : (boss.phase1.addsGruntHitM ?? mulDiv(boss.hitM, BP, K.BOSS_HIT_MULT_BP));
  const spawned: EnemyState[] = [];
  refs.forEach((r, slot) => {
    const def = enemyDef(state, r.enemyId);
    const isBossEnemy = bossSeg && slot === 0;
    const b = boss as NonNullable<typeof boss>;
    const maxHpM = isBossEnemy
      ? b.hpM
      : bossSeg
        ? Math.max(1000, mulDiv(addsPoolM, def.hpWeightBp, Math.max(1, weightSum)))
        : Math.max(
            1000,
            mulDiv((seg as { hpPoolM: Milli }).hpPoolM, def.hpWeightBp, Math.max(1, weightSum)),
          );
    const hitM = isBossEnemy
      ? b.hitM
      : bossSeg
        ? mulBp(addsHitM, def.hitWeightBp)
        : mulBp((seg as { gruntHitM: Milli }).gruntHitM, def.hitWeightBp);
    spawned.push({
      id: state.nextId++,
      defId: r.enemyId,
      slot,
      isBoss: isBossEnemy,
      gimmick: r.gimmick,
      alive: true,
      hpM: maxHpM,
      maxHpM,
      hitM,
      attackPowerBp: isBossEnemy
        ? b.attackPowerBp
        : bossSeg
          ? (b.phase1.addsAttackPowerBp ?? BP)
          : (seg as { attackPowerBp: number }).attackPowerBp,
      shield: def.shield,
      shieldMax: def.shield,
      revealed: [],
      brokenUntil: null,
      staggerUntil: null,
      // the boss starts behind its phase-1 gate (66%); boss.ts moves the gate at each phase change (33%, then 1 milli)
      gateHpM: isBossEnemy ? gateFor(b, maxHpM, 1) : null,
      plateId: null,
      spawnTick: t,
      intervalTicks: 0,
      cycleStart: t,
      nextImpact: null,
      guardTicks: 0,
      windupShown: false,
      guardResult: null,
      wordsDone: 0,
      dots: [],
      frozenUntil: null,
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
      shieldMax: e.shieldMax,
    });
  }
  for (const e of spawned) assignWordPlate(state, e, emit);
  for (const e of spawned) {
    const p = below(enc.aiRng, K.INITIAL_ENEMY_ATB_MAX_BP + 1);
    initAttack(state, e, p);
  }
  // a boss wave starts focused on its first add (economy_sim kills the adds first); otherwise on the first enemy
  const first = bossSeg && spawned[1] !== undefined ? spawned[1] : spawned[0];
  if (enc.focusEnemyId === null && first !== undefined) {
    enc.focusEnemyId = first.id;
    emit({ type: "FocusChanged", tick: t, enemyId: first.id });
  }
}

// ---------------------------------------------------------------- consequences of completed plates

const HOOKS: TypingHooks = {
  onPlateCompleted(state, plate, emit) {
    const enc = state.enc as EncounterState;
    if (plate.kind === "secondWind") {
      secondWindSucceeded(state, emit);
      return;
    }
    chargeSkills(state, plate, emit); // every completed word/guard plate charges both skills
    if (plate.kind === "doom") {
      completeDoom(state, plate, emit);
      return;
    }
    if (plate.kind === "minigame") {
      clearRubble(state, plate, emit);
      return;
    }
    const enemy = enemyById(enc, plate.ownerId);
    if (enemy === null) return;
    if (plate.kind === "guard") {
      // Block / parry resolves at impact. The completed guard plate also deals its chip (orchestrator ruling):
      // WordCompleted, GuardWordTyped (the typed outcome), PlateRemoved, then Hit{chip}, then the fresh word plate.
      enemy.guardResult = plate.perfect ? "parry" : "block";
      chipHit(state, enemy, plate.perfect, emit);
      if (enemy.alive && !enc.finisherShown) assignWordPlate(state, enemy, emit);
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
    chipHit(state, enemy, plate.perfect, emit);
    if (enemy.alive && !enc.finisherShown) assignWordPlate(state, enemy, emit);
  },
};

// ---------------------------------------------------------------- view & result

const enemyStatuses = (e: Readonly<EnemyState>, t: number): StatusView[] => {
  const out: StatusView[] = e.dots.map((d) => ({
    id: d.status,
    ticksLeft: Math.max(0, d.untilTick - t),
    stacks: 1,
  }));
  if (e.staggerUntil !== null)
    out.push({ id: "stagger", ticksLeft: Math.max(0, e.staggerUntil - t), stacks: 1 });
  if (e.frozenUntil !== null)
    out.push({ id: "freeze", ticksLeft: Math.max(0, e.frozenUntil - t), stacks: 1 });
  return out;
};

const skillViews = (state: Readonly<LevelState>): SkillView[] => {
  const run = state.run;
  const out: SkillView[] = [];
  for (const slot of [0, 1] as const) {
    const id = run.loadout.actives[slot];
    if (id === null) continue;
    out.push({
      slot,
      id,
      chargeFrac: Math.min(1, run.skillChargeM[slot] / K.SKILL_CHARGE_M[id]),
      ready: run.skillReady[slot],
      mode: run.loadout.activeModes[slot],
    });
  }
  return out;
};

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
    faded: p.faded,
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
      : e.brokenUntil !== null
        ? "broken"
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
      attackPowerBp: mulBp(state.run.def.parArmorBp, e.attackPowerBp),
      leakBp: guardLeakBp(state, e),
      shield: e.shield,
      shieldMax: e.shieldMax,
      weaknesses: (def?.weaknesses ?? []).map((type) => ({
        type,
        revealed: e.revealed.includes(type),
      })),
      brokenTicksLeft: e.brokenUntil === null ? 0 : Math.max(0, e.brokenUntil - t),
      statuses: enemyStatuses(e, t),
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
        : state.phase === "failed" || state.phase === "secondWind" || state.phase === "downed"
          ? "downed"
          : enc !== null && enc.pending.some((p) => p.kind === "skill")
            ? "cast"
            : enc !== null && enc.pending.length > 0
              ? "attack"
              : "idle";
  const span = state.phaseUntil === null ? 0 : state.phaseUntil - run.phaseStart;
  const bossEnemy = enc?.isBoss ? enc.enemies[0] : undefined;
  const bossDef = run.def.boss;
  const swPlate = (enc?.plates ?? []).find((p) => p.kind === "secondWind");
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
      atbFrac: enc === null ? 0 : Math.min(1, enc.atbM / K.ATB_FULL_M),
      archetype: arch,
      weaponDamageType: WEAPON_DAMAGE_TYPE[arch],
      barrierCharges: run.barrier,
      guardRatingBp: guardRatingBp(run.loadout),
      statuses: run.barrier > 0 ? [{ id: "barrier", ticksLeft: null, stacks: run.barrier }] : [],
      secondWindAvailable: !run.secondWindUsed,
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
    skills: skillViews(state),
    passives: run.loadout.passives.filter((p): p is NonNullable<typeof p> => p !== null),
    boss:
      bossEnemy !== undefined && bossDef !== null
        ? {
            enemyId: bossEnemy.id,
            name: bossDef.name,
            title: bossDef.title,
            phase: enc?.boss?.phase ?? 1,
            gateHpFrac:
              bossEnemy.gateHpM === null || (enc?.boss?.phase ?? 1) === 3
                ? null
                : bossEnemy.gateHpM / bossEnemy.maxHpM,
            // T1.5 (additive): for the phase pips and the "why is my damage 0" hint
            gates: [bossDef.phase1.endAtHpBp / BP, bossDef.phase2.endAtHpBp / BP],
            holding: bossHold(enc as EncounterState, bossDef),
            doomsResolved: enc?.boss?.doomsResolved ?? 0,
            minDoomSpells: bossDef.phase2.minDoomSpells,
          }
        : null,
    doom:
      enc?.boss?.doom != null && enc.boss.doom.plateId !== null
        ? {
            plateId: enc.boss.doom.plateId,
            ticksLeft: Math.max(0, enc.boss.doom.deadline - t),
            totalTicks: enc.boss.doom.totalTicks,
          }
        : null,
    minigame:
      enc?.boss != null && bossDef !== null && enc.boss.phase === 3
        ? {
            lanes: bossDef.phase3.minigame.lanes,
            cleared: enc.boss.cleared,
            missed: enc.boss.missed,
          }
        : null,
    secondWind:
      swPlate === undefined || state.phaseUntil === null
        ? null
        : {
            plateId: swPlate.id,
            ticksLeft: Math.max(0, state.phaseUntil - t),
            totalTicks: K.SECOND_WIND_T,
          },
    stats: {
      netWpm: netWpmX100(run) / 100,
      accuracy: accuracyBp(run),
      burstWpm: run.burstWpm,
      elapsedTicks: t,
      activeTicks: run.activeTicks,
    },
    goldCollected: run.goldCollected,
  };
}

/** Non-null once terminal. T1.6 adds the reward rolls (chests, gold payout); this reports the combat and typing stats. */
export function getResult(state: Readonly<LevelState>): LevelResult | null {
  if (!isTerminal(state)) return null;
  const run = state.run;
  const origins: Record<HitOrigin, number> = { ...run.stats.damageByOriginM };
  return {
    levelId: run.def.levelId,
    outcome: state.phase === "cleared" ? "cleared" : "failed",
    failReason: run.failReason,
    durationTicks: run.endTick ?? state.tick,
    activeTicks: run.activeTicks,
    gold:
      state.phase === "cleared" ? run.goldCollected : mulBp(run.goldCollected, K.FAIL_GOLD_KEEP_BP),
    chests: run.chests.map((c) => ({ ...c, gear: c.gear === null ? null : { ...c.gear } })),
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
      skillsCast: run.stats.skillsCast,
      secondWindUsed: run.secondWindUsed,
      damageByOriginM: origins,
      damageBySkillM: { ...run.stats.damageBySkillM },
    },
    words: run.words.map((w) => ({ ...w })),
  };
}

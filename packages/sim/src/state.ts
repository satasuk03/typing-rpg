// Sim-internal state shapes (plain JSON; docs/interfaces.md §1.4, §3.1). Not part of the published contract beyond
// "plain data": consumers read getView() only. Everything here is integers, strings, booleans, null, arrays, objects.
import type { DamageType } from "@hd2d/content";
import type {
  ComboTier,
  EntityId,
  HitOrigin,
  KeyStreakTier,
  PlateId,
  PlateKind,
} from "./events.ts";
import type { RngState } from "./rng.ts";
import type { Tick } from "./time.ts";
import type {
  ActiveSkillId,
  ChestContents,
  Gimmick,
  LevelOptions,
  Loadout,
  ResolvedLevel,
  WordResult,
} from "./types.ts";

export interface PlateState {
  id: PlateId;
  ownerId: EntityId | null;
  kind: PlateKind;
  text: string;
  display: string;
  fold: boolean; // compare case-insensitively (caseMode "auto" and no uppercase in text)
  typed: number; // chars [0, typed) are typed in the current attempt
  perfect: boolean; // no typo yet (kept across Escape, B1)
  typos: number;
  lastTypoTick: Tick | null;
  penalized: boolean; // combo typo penalty already taken on this plate (D8)
  maxPaid: number; // anti-farm: chars at index < maxPaid pay no ATB again (B1)
  paidChars: number;
  paidAtbM: number; // sum of per-char ATB paid on this plate
  tFirst: Tick | null; // tick of char index 0 in the current attempt
  shownTick: Tick;
  expiresAt: Tick | null;
  totalTicks: number | null;
  lane: number | null;
  wordsDone: number; // sentence words finished (for SentenceWordDone)
  /** T1.5: the owner's typing gimmick this plate carries (word plates of gimmick enemies only). */
  gimmick: Gimmick | null;
  fadeAt: Tick | null; // Fading word: the tick the letters fade (null once faded or for other plates)
  faded: boolean;
  /** Scrambled word: the scrambled `display` is shown until the first correct letter unlocks it (then display == text). */
  scrambled: boolean;
}

export interface EnemyState {
  id: EntityId;
  defId: string;
  slot: number;
  isBoss: boolean;
  gimmick: Gimmick | null; // Fading / Scrambled word plates (T1.5), from the level's EnemyRef
  alive: boolean;
  hpM: number;
  maxHpM: number;
  attackPowerBp: number; // v1.9: Attack Power P as a multiple (bp) of the chapter par armor score
  hitM: number; // damage of one unhindered attack (gruntHit x hitWeight, or the boss hit)
  shield: number; // shield points left (0 while Broken or for shieldless enemies)
  shieldMax: number;
  revealed: DamageType[]; // weaknesses already unveiled (WeaknessRevealed is a one-shot per type)
  brokenUntil: Tick | null; // Break window end; the attack timer is suspended while set
  staggerUntil: Tick | null; // Doom Spell stagger (T1.5): x DOOM_STAGGER_DMG_MULT damage while set
  gateHpM: number | null; // phase gate: damage cannot take HP below this floor (boss phases, T1.5)
  plateId: PlateId | null;
  spawnTick: Tick;
  intervalTicks: number;
  cycleStart: Tick;
  nextImpact: Tick | null; // null = no attack scheduled (zen, broken, boss phases, dead)
  guardTicks: number; // guard span for the scheduled impact
  windupShown: boolean; // guard word shown for the scheduled impact
  guardResult: "block" | "parry" | null; // typed, waiting for impact
  wordsDone: number;
  dots: DotState[]; // burn / bleed (at most one of each), ticked every DOT_TICK_T (T1.4)
  frozenUntil: Tick | null; // Frost Lock: the attack timer (and a shown guard word) is held until this tick (T1.4)
  // ---- v2.0 (§3.5, §13.1): absent on non-healers / non-elites, so Ch1 state hashes do not change ----
  elite?: true; // elite tag (presentation; the ref's attackPower is the danger)
  nextHealTick?: Tick; // healer: the next heal's due tick
  healsDone?: number; // healer: effective heals so far this encounter (vs maxHeals)
}

/** A damage-over-time status. Origin is inherited from the applier: bleed -> weapon, burn -> skill (skill-share metric). */
export interface DotState {
  status: "burn" | "bleed";
  origin: HitOrigin;
  skillId: ActiveSkillId | null;
  untilTick: Tick;
  nextTick: Tick;
  perTickM: number;
}

/** A hero attack in flight: resolves when the tick reaches `tick` (ATTACK_IMPACT_T after AutoAttack). */
export type PendingHit =
  | { tick: Tick; kind: "auto"; targetId: EntityId; crit: boolean }
  /** An auto-cast skill in flight (T1.4): its effect lands at `tick` (SKILL_IMPACT_T after SkillCast). */
  | {
      tick: Tick;
      kind: "skill";
      slot: 0 | 1;
      skillId: ActiveSkillId;
      targetId: EntityId | null;
      crit: false;
    };

/** A Falling Rubble word in flight (T1.5). The plate is re-shown after a Second Wind, so the entry owns the timing. */
export interface RubbleWord {
  plateId: PlateId | null; // null while a Second Wind has removed the plate
  text: string;
  lane: number;
  landTick: Tick;
}

/** Ruin Golem script state (T1.5): phases, Doom Spells, the Falling Rubble minigame and the finisher. */
export interface BossState {
  enemyId: EntityId;
  phase: 1 | 2 | 3;
  addIds: EntityId[];
  /** Phase 2: tick the next Doom Spell starts; null while one is active or outside phase 2. */
  nextDoomTick: Tick | null;
  doom: { plateId: PlateId | null; text: string; deadline: Tick; totalTicks: number } | null;
  doomsResolved: number; // success or failure
  doomsStarted: number;
  /** Phase 3 (the minigame): next spawn tick, words in flight, counters. */
  nextSpawnTick: Tick | null;
  rubble: RubbleWord[];
  cleared: number;
  missed: number;
  minigameActive: boolean;
  lastDoomText: string | null; // anti-repeat for consecutive Doom Spells
  rng: RngState; // the `boss` stream (doom sentences, rubble words and lanes)
}

export interface EncounterState {
  index: number; // encounter counter (encounter + boss segments), 0-based
  isBoss: boolean;
  startTick: Tick;
  typingFromTick: Tick;
  waveIndex: number;
  waveCount: number;
  enemies: EnemyState[]; // current + dead of this encounter, stable slot order
  plates: PlateState[];
  targetPlateId: PlateId | null;
  focusEnemyId: EntityId | null;
  atbM: number;
  pending: PendingHit[]; // scheduled hero impacts (step 2 of the tick)
  critWords: number; // plates completed since the last auto-attack (crit share, D10)
  critPerfect: number; // ... of which perfect
  frozenAt: Tick | null; // Second Wind / downed freeze start (timers shift on resume)
  wordsRng: RngState;
  aiRng: RngState;
  combatRng: RngState;
  gimmickRng: RngState;
  boss: BossState | null; // boss encounters only (T1.5)
  recent: string[]; // recently assigned plate texts (anti-repeat)
  finisherShown: boolean;
  steadyLeft: number; // Steady Hands: forgiven typos left this encounter
}

export interface RunStats {
  correctChars: number;
  typos: number;
  wordsCompleted: number;
  perfectWords: number;
  maxCombo: number;
  maxKeyStreak: number;
  blocks: number;
  perfectParries: number;
  hitsTaken: number;
  autoAttacks: number;
  damageByOriginM: Record<HitOrigin, number>; // actual HP removed, by origin (skill-share metric)
  damageBySkillM: Record<ActiveSkillId, number>; // ... of which each active skill (burn included), for tuning
  skillsCast: number;
}

export interface RunState {
  def: ResolvedLevel;
  loadout: Loadout;
  options: LevelOptions; // pace clamped
  started: boolean;
  phaseStart: Tick; // tick the current phase began (view phaseProgress)
  combo: number;
  comboTier: ComboTier;
  keyStreak: number;
  keyStreakTier: KeyStreakTier;
  strayLatch: boolean; // stray typo already penalized since the last correct char
  wrongStreak: number; // consecutive wrong keys (auto-unlock)
  stats: RunStats;
  activeTicks: number;
  words: WordResult[];
  burstTicks: number[]; // ticks of the last <= BURST_CHARS correct chars
  burstWpm: number;
  lastBurstTick: Tick | null;
  heroAtkM: number; // computeHeroStats(loadout).atk
  heroMaxHpM: number;
  heroHpM: number;
  barrier: number; // absorb-the-next-hit charges (Aegis / Bulwark Streak, T1.4)
  skillChargeM: [number, number]; // per active slot, in milli-words (persists across the level, D18)
  skillReady: [boolean, boolean]; // charge >= need (waiting for its cast condition)
  weaponAttacks: number; // resolved auto-attack impacts (Dagger: every 3rd applies Bleed)
  lastWordPerfect: boolean; // the last completed word/guard plate was perfect (Clean Cut)
  comebackLost: number; // combo lost to typo penalties since the last perfect word (Comeback)
  lastStandOn: boolean; // HP below the Last Stand threshold (edge for PassiveTriggered)
  cues: string[]; // TutorialCue ids already emitted (options.tutorial)
  secondWindUsed: boolean;
  goldCollected: number; // level gold paid so far (per EncounterCleared); failLevel keeps FAIL_GOLD_KEEP of it
  chests: ChestContents[]; // chests dropped so far, contents rolled at drop on the `loot` stream
  guardsShown: number;
  encountersStarted: number;
  endTick: Tick | null;
  failReason: "defeated" | "abandoned" | "timeout" | null;
}

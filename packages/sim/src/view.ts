import type { DamageType, WeaponArchetype } from "@hd2d/content";
import type { ComboTier, EntityId, KeyStreakTier, PlateId, PlateKind, StatusId } from "./events.ts";
import type { Tick } from "./time.ts";
import type { ActiveSkillId, CastMode, ComboMode, LevelPhase, PassiveId } from "./types.ts";

export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type HeroPose =
  | "walk"
  | "idle"
  | "attack"
  | "cast"
  | "hurt"
  | "guard"
  | "downed"
  | "victory";
export type EnemyPose = "enter" | "idle" | "windup" | "attack" | "hurt" | "broken" | "dead";

export interface PlateView {
  id: PlateId;
  ownerId: EntityId | null;
  kind: PlateKind;
  text: string; // the answer
  display: string; // what to draw (== text unless scrambled and not yet unlocked)
  typedIndex: number; // chars [0, typedIndex) are typed (gold); text[typedIndex] is the next letter
  isTarget: boolean;
  faded: boolean; // fading gimmick: draw only typed chars + blanks (the gimmick overrides the next-letter rule)
  hadTypo: boolean; // current attempt is not perfect
  lastTypoTick: Tick | null;
  lane: number | null; // minigame lane; null for other plates
  expiresAtTick: Tick | null; // guard impact / doom deadline / minigame landing / riddle deadline / second wind deadline
  totalTicks: number | null; // for timer strips
  /** v2.0: the plate compares case-exactly (PlateState.fold === false). Set only when true. */
  exactCase?: boolean;
  /** v2.0 ⇧ cue: exactCase && text[typedIndex] is an uppercase A-Z (untargeted plates too, §3.3). Set only when true. */
  shiftNext?: boolean;
}
export interface StatusView {
  id: StatusId;
  ticksLeft: number | null;
  stacks: number;
}
export interface EnemyView {
  id: EntityId;
  defId: string;
  slot: number;
  isBoss: boolean;
  alive: boolean;
  hp: number;
  maxHp: number;
  hpFrac: number;
  atbFrac: number; // progress from cycle start to impact
  plateId: PlateId | null;
  isGuard: boolean;
  guardTicksLeft: number;
  guardTotalTicks: number;
  guardResult: "block" | "parry" | null; // typed, waiting for impact
  /** v1.9: Attack Power P in score bp (par armor score x the enemy's attackPower). Compare with hero.guardRatingBp. */
  attackPowerBp?: number;
  /** v1.9: guard leak preview in bp (0..GUARD_LEAK_CAP_BP 5000): the share of this enemy's hit a typed guard lets through. 0 = no cracked-shield badge. */
  leakBp?: number;
  elite?: boolean; // v2.0: gold name tag (set only when true)
  /** v2.0 ✚ badge + charge ring (healers only). ticksLeft null = paused (Broken / Frost Lock) or no heals left. */
  healer?: { ticksLeft: number | null; totalTicks: number; healsLeft: number | null }; // healsLeft null = unlimited
  shield: number;
  shieldMax: number;
  weaknesses: { type: DamageType; revealed: boolean }[];
  brokenTicksLeft: number;
  statuses: StatusView[];
  isFocus: boolean;
  pose: EnemyPose;
  poseSinceTick: Tick;
}
export interface HeroView {
  hp: number;
  maxHp: number;
  hpFrac: number;
  atbFrac: number;
  archetype: WeaponArchetype;
  weaponDamageType: DamageType;
  barrierCharges: number;
  /** v1.9: Guard Rating G in score bp = the equipped armor item score (10000 = 1.0). */
  guardRatingBp?: number;
  statuses: StatusView[];
  secondWindAvailable: boolean;
  pose: HeroPose;
  poseSinceTick: Tick;
}
export interface SkillView {
  slot: 0 | 1;
  id: ActiveSkillId;
  chargeFrac: number;
  ready: boolean;
  mode: CastMode;
}
export interface LevelView {
  tick: Tick;
  phase: LevelPhase;
  phaseProgress: number; // 0..1 for timed phases (walk dolly, intros, breather)
  levelId: string;
  chapter: number;
  isBossLevel: boolean;
  encounterIndex: number | null;
  encounterCount: number;
  waveIndex: number | null;
  hero: HeroView;
  enemies: EnemyView[]; // current encounter, stable slot order, dead ones kept with alive=false
  plates: PlateView[]; // every visible plate incl. doom/minigame/finisher/second wind
  targetPlateId: PlateId | null;
  focusEnemyId: EntityId | null;
  combo: number;
  comboTier: ComboTier;
  comboMult: number;
  comboMode: ComboMode; // mechanical
  keyStreak: number;
  keyStreakTier: KeyStreakTier; // VFX colour tiers
  skills: SkillView[];
  passives: PassiveId[];
  boss: {
    enemyId: EntityId;
    name: string;
    title: string;
    phase: 1 | 2 | 3;
    gateHpFrac: number | null;
    /** T1.5 (additive, optional so existing mocks still typecheck; the sim always sets them): the HP fractions of the phase gates (e.g. [0.66, 0.33]) for the phase pips. */
    gates?: number[];
    /** T1.5 (additive): why the boss is clamped at its gate right now ("adds" alive, or a Doom Spell still owed/active). */
    holding?: "adds" | "doom" | null;
    doomsResolved?: number;
    minDoomSpells?: number;
  } | null;
  doom: { plateId: PlateId; ticksLeft: number; totalTicks: number } | null;
  minigame: {
    lanes: number;
    cleared: number;
    missed: number;
    kind?: "fallingRubble" | "riddle"; // v2.0 (absent = fallingRubble)
    riddle?: RiddleView | null; // v2.0: present iff kind === "riddle"; null between riddles (gap) and after the last
  } | null;
  secondWind: { plateId: PlateId; ticksLeft: number; totalTicks: number } | null;
  stats: {
    netWpm: number;
    /** Basis points (0..10000), same as accuracyBp: floor(correct*BP/(correct+typos)); BP if no keys yet. */
    accuracy: number;
    burstWpm: number;
    elapsedTicks: number;
    activeTicks: number;
  };
  goldCollected: number;
}
/** v2.0 riddle panel (§3.6). The HUD draws `clue` in its own panel, never over the leaf plates (readability invariant). */
export interface RiddleView {
  riddleIndex: number;
  riddleCount: number;
  clue: string;
  leafPlateIds: [PlateId, PlateId, PlateId]; // lane order 0..2 (the plates themselves are in `plates`, kind "minigame")
  ticksLeft: number;
  totalTicks: number;
  last: { outcome: "right" | "wrong" | "timeout"; answerText: string } | null; // previous riddle's result (bloom/wither, panel line)
}
export interface TrialView {
  tick: Tick;
  started: boolean;
  ticksLeft: number;
  passage: string;
  typedIndex: number;
  keyStreak: number;
  keyStreakTier: KeyStreakTier;
  lastTypoTick: Tick | null;
  netWpm: number;
  /** Basis points (0..10000), same as accuracyBp: floor(correct*BP/(correct+typos)); BP if no keys yet. */
  accuracy: number;
  done: boolean;
}

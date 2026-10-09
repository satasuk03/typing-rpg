// The single parameter table (docs/interfaces.md §7). Keys copy the `docs/brainstorm/sim/economy_sim.py` variable names
// exactly (a `// py:` comment names the Python source group; TS-only keys are marked). Values are human-readable floats
// (seconds, HP points, ratios). `deriveConstants` converts them ONCE at module init into the integer constants `K.*`
// (suffix _BP basis points, _M milli-points, _T ticks). Game logic uses only `K` and tables.generated.ts: never BALANCE.
// A test diffs every ported key against a dump of the Python module (tests/fixtures/economy-reference.json).
import type { DamageType, Rarity } from "@hd2d/content";
import type { ChestTier } from "./events.ts";
import { type Bp, bp, type Milli, milli } from "./fixed.ts";
import { TICK_HZ } from "./time.ts";
import type { ActiveSkillId } from "./types.ts";

export const BALANCE = {
  // ---- py: Story structure / Non-typing time (tools/balance level generator; the sim only reads WALK/REWARD/INTRO) ----
  CHAPTERS: 30,
  LEVELS_PER_CH: 10,
  TWO_ENCOUNTER_LEVELS: 20,
  ENC_SIZES_EARLY: [
    [1, 2],
    [2, 2],
    [1, 3],
  ],
  ENC_SIZES_MID: [
    [2, 2, 3],
    [1, 3, 3],
    [2, 3, 2],
  ],
  ENC_SIZES_LATE: [
    [2, 3, 3],
    [3, 2, 4],
    [2, 4, 3],
  ],
  LEVEL_INTRO_S: 7,
  WALK_S: 8,
  REWARD_S: 5,
  LEVEL_END_S: 10,
  BOSS_EXTRA_S: 30,
  // ---- py: Combat (01 doc section 2) ----
  ATB_FULL: 100,
  WEAPON: { name: "Sword", char_charge: 8.0, word_bonus: 10.0, atk_mult: 1.0 }, // py WEAPON; = WEAPONS.sword (parity test)
  PERFECT_ATB_MULT: 1.25,
  SWIFT_ATB: 5.0,
  COMBO_PER: 0.02,
  COMBO_CAP: 25,
  CHIP_NORMAL: 0.15,
  CHIP_PERFECT: 0.25,
  BASE_CRIT: 0.05,
  PERFECT_CRIT_BONUS: 0.15,
  CRIT_MULT: 1.5,
  PERFECT_SKILL_CHARGE: 1.5,
  HERO_ATK0: 10.0,
  HERO_HP0: 100.0,
  WALK_HEAL: 0.25,
  PHASE_HEAL: 0.1,
  BLOCK_MULT: 0.2,
  ENEMY_BASE_INTERVAL: 9.0,
  BOSS_BASE_INTERVAL: 10.0,
  PACE_REF: 35.0,
  PACE_EXP: 0.7,
  PACE_CLAMP: [0.6, 1.8],
  HP_PACE_EXP: 0.0,
  PRESET_INTERVAL_MULT: { story: 1.4, standard: 1.0, hard: 1.0, zen: 1.0 }, // py: scalar 1.0 (= Standard)
  SECOND_WIND_HP: 0.3,
  PREMIUM_REVIVE_HP: 0.5,
  DOOM_DMG: 0.15,
  BOSS_HIT_MULT: 2.4,
  // ---- py: Enemy authoring (par curve) -- tools/balance only (generates EncounterDef.hp / gruntHit) ----
  ENC_TTK_S: 36.0,
  SAW_HP_STEP: 0.02,
  SAW_ATK_STEP: 0.025,
  DMG_FRAC: [
    [1, 0.4],
    [3, 0.65],
    [6, 0.85],
    [10, 0.95],
    [30, 1.0],
  ],
  BOSS_WAVE_ENC: 1,
  BOSS_HP_ENC: 3.2,
  BOSS_ADDS_HP_ENC: 0.5,
  BOSS_ENC_DMG: [
    [1, 1.4],
    [3, 2.0],
    [6, 2.7],
    [10, 3.0],
  ],
  DOOM_SPELLS: 2.5,
  REF_WPM: [
    [1, 35.0],
    [10, 37.0],
    [20, 39.5],
    [30, 42.0],
  ],
  REF_ACC: [
    [1, 0.92],
    [10, 0.925],
    [30, 0.935],
  ],
  REF_GUARD: [
    [1, 0.6],
    [10, 0.62],
    [30, 0.66],
  ],
  // ---- py: Gear ----
  SLOTS: ["weapon", "armor", "charm"],
  TIER_GROWTH: 1.4,
  RARITIES: ["C", "U", "R", "E", "L"],
  RARITY_MULT: { C: 1.0, U: 1.12, R: 1.25, E: 1.4, L: 1.6 },
  RARITY_UPG_CAP: { C: 5, U: 7, R: 11, E: 13, L: 15 },
  UPG_STEP: 0.07,
  SHOP_RARITY_PRICE: { C: 1.0, U: 2.2, R: 5.0 },
  VALUE_RARITY_PRICE: { C: 1.0, U: 2.2, R: 5.0, E: 8.0, L: 12.0 },
  PRICE_T1: 1150,
  PRICE_GROWTH: 1.405,
  UPG_COST_BASE: 0.25,
  UPG_COST_GROWTH: 1.3,
  SALVAGE_RATE: 0.25,
  UPG_TRANSFER: 0.5,
  BOSS_NEXT_TIER_DROP: "C",
  DROP_SALVAGE_RATE: 0.1,
  PAR_RARITY: "U",
  PAR_RARITY_BY_CH: { 1: "C", 2: "C" },
  PAR_UPG: { 1: 0, 2: 2, 3: 3 },
  PAR_UPG_DEFAULT: 5,
  // ---- py: Gold ----
  GOLD_L1: 100,
  GOLD_GROWTH_CH: 1.125,
  GOLD_IN_CH_STEP: 0.03,
  BOSS_GOLD_MULT: 3.0,
  REPLAY_GOLD_MULT: 0.4,
  STALE_REPLAY_MULT: 0.5,
  REPLAY_SOFTCAP_PER_DAY: 40,
  REPLAY_SOFTCAP_MULT: 0.25,
  FAIL_GOLD_KEEP: 0.5,
  STAR_GOLD: 0.2,
  SATCHEL_PRICE_GU: 25,
  STAR2_ACC: [
    [10, 0.9],
    [20, 0.93],
    [30, 0.95],
  ],
  STAR2_RELATIVE: true,
  STAR2_REL_MARGIN: 0.0,
  STAR2_REL_CLAMP: [0.88, 0.97],
  STAR_CHEST: { 10: "Iron", 20: "Gold", 30: "Gold" },
  // ---- py: Chests ----
  CHEST_P_ENCOUNTER: 0.3,
  CHEST_P_ENCOUNTER_REPLAY: 0.15,
  CHEST_TIER_NORMAL: { Wooden: 0.72, Iron: 0.24, Gold: 0.035, Mythic: 0.005 },
  CHEST_TIER_BOSS: { Wooden: 0.0, Iron: 0.55, Gold: 0.38, Mythic: 0.07 },
  BOSS_CHEST_REPLAY_P: 0.5,
  CHEST: {
    Wooden: { gold: 0.5, gear: 0.1, rar: { C: 0.8, U: 0.2 }, gems: 0 },
    Iron: { gold: 1.0, gear: 0.35, rar: { C: 0.4, U: 0.45, R: 0.15 }, gems: 0 },
    Gold: { gold: 2.5, gear: 0.0, rar: {}, gems: 5 }, // v2: gear -> CACHE_FROM_CHEST (py keeps the old rar table)
    Mythic: { gold: 6.0, gear: 0.0, rar: {}, gems: 20 },
  },
  CHEST_GEAR_TIER_DOWN_P: 0.3,
  // ---- py: Gear Caches (v2) ----
  CACHE_GOLD_GU: 14,
  CACHE_GEM_PRICE: 50,
  CACHE_GEM_DAILY_CAP: 1,
  CACHE_ODDS: { C: 0.4, U: 0.33, R: 0.2, E: 0.06, L: 0.01 },
  CACHE_PITY_RARE: 8,
  CACHE_PITY_EPIC: 30,
  CACHE_PITY_LEG: 120,
  CACHE_FROM_CHEST: { Wooden: 0, Iron: 0, Gold: 1, Mythic: 2 },
  CACHE_FROM_STAR30: 1,
  CACHE_FROM_WEEKLY: 2,

  // ======== TS-only (NOT in economy_sim; tools/balance parity ignores or models them) ========
  CACHE_SLOT_ODDS: { weapon: 1, armor: 1, charm: 1 }, // uniform weights (published)
  CACHE_ARCHETYPE_ODDS: { equipped: 0.4, other_each: 0.2 }, // PO 2026-10-09 (published, fixed)
  WEAPONS: {
    // doc 01 §2.2 (the Sword row = py WEAPON)
    sword: { char_charge: 8, word_bonus: 10, atk_mult: 1.0, hits: 1, damage_type: "slash" },
    dagger: {
      char_charge: 11,
      word_bonus: 6,
      atk_mult: 0.45,
      hits: 2,
      damage_type: "pierce",
      bleed_every: 3,
      bleed_s: 4, // T1.4 (TS-only): doc 01 gives no numbers; bleed ~4% of dagger DPS, weapon origin
      bleed_atk_mult_per_s: 0.1,
    },
    staff: {
      char_charge: 6,
      word_bonus: 8,
      atk_mult: 0.8,
      hits: 1,
      damage_type: "arcane",
      skill_charge_mult: 1.5,
    },
    hammer: {
      char_charge: 5,
      word_bonus: 14,
      atk_mult: 2.2,
      hits: 1,
      damage_type: "blunt",
      atb_knockback: 0.3,
    },
  },
  ATB_OVERFLOW_CAP: 30,
  STRICT_TYPO_ATB: 5,
  SWIFT_THRESHOLD: 1.3,
  BURST_BANDS: { swift: 1.3, blazing: 1.6 },
  BURST_CHARS: 16,
  BURST_COOLDOWN_S: 5,
  COMBO_TIERS: [5, 15, 30, 50], // mechanical (perfect words)
  KEY_STREAK_TIERS: [10, 25, 50, 100], // VFX colour tiers (correct keys), PO 2026-10-09
  GUARD_S: 2.5,
  GUARD_MIN_S: 1.5,
  STORY_GUARD_BONUS_S: 1.0,
  TELEGRAPH_STAGGER_S: 0.8,
  INITIAL_ENEMY_ATB_MAX: 0.3,
  PARRY_COUNTER: 0.5,
  PARRY_ATB: 10,
  IRON_WILL_BLOCK_MULT: 0.1,
  RIPOSTE_COUNTER: 1.5,
  WEAK_MULT: 1.3,
  BREAK_DMG_MULT: 1.8,
  BREAK_S: 4.5,
  DMG_VARIANCE: 0.0,
  ATTACK_IMPACT_S: 0.3,
  SKILL_IMPACT_S: 0.4,
  ENCOUNTER_INTRO_S: 2.0,
  SECOND_WIND_S: 8.0,
  DOOM_TIMER_PACE_EFF: 0.8,
  DOOM_TIMER_BONUS_S: 2.0,
  DOOM_STAGGER_S: 4.0,
  DOOM_STAGGER_DMG_MULT: 1.5,
  SKILL_CHARGE_PER_5_CHARS_FROM_TIER: 4, // C17 (word tier T4 = chapters 10-12: tier = ceil(chapter / 3))
  BARRIER_CAP: 3, // T1.4 (TS-only): barrier charges (Aegis, Bulwark Streak) never stack past this
  DOT_TICK_S: 1, // T1.4 (TS-only): burn / bleed damage lands once per second
  SKILLS: {
    // doc 01 §3.1 with ~-40% damage (C3); T1.4 owns the behaviour. Fireball is -35% (2.0x -> 1.3x): at the strict -40% (1.2x)
    // the bot's skill share (skill / sum of all origins, counters included) measured 14.6-14.9% on the ch1 fixture, l05, below
    // the 15% floor; Python's own share (16.4%, counters not modelled) is reproduced either way. Burn rate (0.05 ATK/s) is
    // not in doc 01; it barely moves the share (targets often die before the burn ends).
    slashWave: {
      charge: 8,
      atk_mult_all: 0.9,
      damage_type: "slash",
      cast: "whenEnemiesAtLeast",
      min_enemies: 2,
    },
    piercingThrust: {
      charge: 6,
      atk_mult: 1.5,
      damage_type: "pierce",
      shield_hits: 2,
      cast: "asap",
    },
    fireball: {
      charge: 10,
      atk_mult: 1.3,
      damage_type: "fire",
      burn_s: 6,
      burn_atk_mult_per_s: 0.05,
      cast: "asap",
    },
    frostLock: { charge: 9, freeze_s: 4, damage_type: "ice", cast: "whenTelegraph" },
    mendingLight: { charge: 12, heal: 0.25, cast: "whenHpBelow", hp_below: 0.6 },
    aegis: { charge: 10, barrier_hits: 2, cast: "whenTelegraph" },
  },
  PASSIVES: {
    cleanCut: { crit_bonus: 0.1 },
    bulwarkStreak: { every_combo: 10, barrier_hits: 1 },
    steadyHands: { forgiven_per_encounter: 1 },
    riposte: { counter: 1.5 },
    ironWill: { block_mult: 0.1 },
    openingGambit: { start_atb: 50 },
    lastStand: { hp_below: 0.3, atb_mult: 1.4 },
    comeback: { restore_frac: 0.5 },
  },
  TUTORIAL_FIRST_GUARD_MULT: 2.0,
  TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS: 3,
  MAX_LEVEL_S: 1200,
  TRIAL_DURATION_S: 60,
  SENTENCE_FOLD_CASE_MAX_CHAPTER: 1, // PO: Ch1 sentence plates fold case (lowercase / Shift+letter both count); later chapters are exact
  // TS-only structure constants (not tunables in the economy sim)
  PACE_MIN: 15, // createLevel clamps pace to PACE_MIN..PACE_MAX (also the PACE_FACTOR_BP table range)
  PACE_MAX: 120,
  RECENT_WORDS: 6, // word assignment anti-repeat window
  SECOND_WIND_FALLBACK_TEXT: "I will not give up", // used when the level's secondWind pool is empty
  // T1.5 (TS-only): typing gimmicks and boss structure
  FADE_DELAY_S: 1.5, // Fading word: the plate's letters fade this long after it appears (doc 01 4.1 "Ghost")
  DOOM_FALLBACK_TAIL: " and the old stones fall", // Doom Spell text built as <free-letter word> + tail when the pool is empty
  MINIGAME_FIRST_SPAWN_S: 2.6, // Falling Rubble: delay before the first word (the spawn period afterwards comes from the BossDef)
  // T6.1 (TS-only, rule knob): the boss script's timers follow the enemy-interval pace factor (bossPlates.ts): rubble
  // spawn / first spawn / fall x factor, Doom cadence x max(1, factor). false = T1.5 behaviour (authored ticks at any pace).
  // Why: at 20 WPM the authored 2.6 s / 7 s rubble outpaced the typist (35% of words missed, 67% Second Winds, 37% boss
  // clears) and Doom Spells (no ATB) ate phase 2 (docs/balance-ch1.md).
  BOSS_SCRIPT_PACE_SCALE: true,
} as const;

const ticks = (s: number): number => Math.round(s * TICK_HZ);

export interface WeaponStats {
  charChargeM: Milli;
  wordBonusM: Milli;
  /** Per-hit multiplier of hero ATK for an auto-attack (doc 01 §2.2 "Attack"). */
  atkMultBp: Bp;
  hits: number;
  damageType: DamageType;
  /** Signature knobs kept for T1.4 (bleed every N-th attack, staff skill-charge multiplier, hammer ATB knockback). */
  bleedEvery: number;
  bleedT: number;
  bleedPerTickBp: Bp;
  skillChargeMultBp: Bp;
  atbKnockbackBp: Bp;
}

type WeaponKey = keyof typeof BALANCE.WEAPONS;
type WeaponSrc = {
  char_charge: number;
  word_bonus: number;
  atk_mult: number;
  hits: number;
  damage_type: DamageType;
  bleed_every?: number;
  bleed_s?: number;
  bleed_atk_mult_per_s?: number;
  skill_charge_mult?: number;
  atb_knockback?: number;
};

const weapon = (w: WeaponSrc): WeaponStats => ({
  charChargeM: milli(w.char_charge),
  wordBonusM: milli(w.word_bonus),
  atkMultBp: bp(w.atk_mult),
  hits: w.hits,
  damageType: w.damage_type,
  bleedEvery: w.bleed_every ?? 0,
  bleedT: ticks(w.bleed_s ?? 0),
  bleedPerTickBp: bp((w.bleed_atk_mult_per_s ?? 0) * BALANCE.DOT_TICK_S),
  skillChargeMultBp: bp(w.skill_charge_mult ?? 1),
  atbKnockbackBp: bp(w.atb_knockback ?? 0),
});

const rarityBp = (m: Readonly<Record<Rarity, number>>): Readonly<Record<Rarity, Bp>> => ({
  C: bp(m.C),
  U: bp(m.U),
  R: bp(m.R),
  E: bp(m.E),
  L: bp(m.L),
});

const RARITY_ORDER = ["C", "U", "R", "E", "L"] as const satisfies readonly Rarity[];
const CHEST_TIER_ORDER = [
  "Wooden",
  "Iron",
  "Gold",
  "Mythic",
] as const satisfies readonly ChestTier[];
const bpRec = <K extends string>(
  m: Readonly<Partial<Record<K, number>>>,
  order: readonly K[],
): Readonly<Record<K, Bp>> => {
  const out = {} as Record<K, Bp>;
  for (const k of order) out[k] = bp(m[k] ?? 0);
  return out;
};

export interface ChestSpec {
  goldBp: Bp; // x Gold Unit of the level's chapter
  gearBp: Bp; // chance of a gear drop (Wooden / Iron only)
  rar: Readonly<Record<Rarity, Bp>>;
  gems: number;
  caches: number;
}
const chestSpec = (
  c: { gold: number; gear: number; rar: Readonly<Partial<Record<Rarity, number>>>; gems: number },
  caches: number,
): ChestSpec => ({
  goldBp: bp(c.gold),
  gearBp: bp(c.gear),
  rar: bpRec(c.rar, RARITY_ORDER),
  gems: c.gems,
  caches,
});

/** Converts the human-readable table into integer constants. Runs once, at module init. */
function deriveConstants(B: typeof BALANCE) {
  const W = B.WEAPONS;
  const weapons: Readonly<Record<WeaponKey, WeaponStats>> = {
    sword: weapon(W.sword),
    dagger: weapon(W.dagger),
    staff: weapon(W.staff),
    hammer: weapon(W.hammer),
  };
  return {
    // ---- time / structure ----
    TICK_HZ,
    ENCOUNTER_INTRO_T: ticks(B.ENCOUNTER_INTRO_S),
    REWARD_T: ticks(B.REWARD_S),
    LEVEL_TIMEOUT_T: ticks(B.MAX_LEVEL_S), // asserted equal to replay.ts MAX_LEVEL_TICKS in a test
    SENTENCE_FOLD_CASE_MAX_CHAPTER: B.SENTENCE_FOLD_CASE_MAX_CHAPTER,
    PACE_MIN: B.PACE_MIN,
    PACE_MAX: B.PACE_MAX,
    RECENT_WORDS: B.RECENT_WORDS,
    // ---- ATB / typing ----
    ATB_FULL_M: milli(B.ATB_FULL),
    ATB_OVERFLOW_CAP_M: milli(B.ATB_OVERFLOW_CAP),
    PERFECT_ATB_MULT_BP: bp(B.PERFECT_ATB_MULT),
    /** interfaces §3.3: perfect words also pay (PERFECT_ATB_MULT - 1) x the chars' ATB. */
    PERFECT_CHAR_BONUS_BP: bp(B.PERFECT_ATB_MULT) - bp(1),
    SWIFT_ATB_M: milli(B.SWIFT_ATB),
    STRICT_TYPO_ATB_M: milli(B.STRICT_TYPO_ATB),
    COMBO_PER_BP: bp(B.COMBO_PER),
    COMBO_CAP: B.COMBO_CAP,
    COMBO_TIERS: B.COMBO_TIERS as readonly number[],
    KEY_STREAK_TIERS: B.KEY_STREAK_TIERS as readonly number[],
    SWIFT_THRESHOLD_BP: bp(B.SWIFT_THRESHOLD),
    BURST_SWIFT_BP: bp(B.BURST_BANDS.swift),
    BURST_BLAZING_BP: bp(B.BURST_BANDS.blazing),
    BURST_CHARS: B.BURST_CHARS,
    BURST_COOLDOWN_T: ticks(B.BURST_COOLDOWN_S),
    PARRY_ATB_M: milli(B.PARRY_ATB),
    WEAPONS: weapons,
    // ---- skills (T1.4): charge in milli-words; damage skills are mulBp(heroAtk, atkMultBp) ----
    PERFECT_SKILL_CHARGE_BP: bp(B.PERFECT_SKILL_CHARGE),
    SKILL_PER5_FROM_CHAPTER: (B.SKILL_CHARGE_PER_5_CHARS_FROM_TIER - 1) * 3 + 1,
    BARRIER_CAP: B.BARRIER_CAP,
    DOT_TICK_T: ticks(B.DOT_TICK_S),
    SKILL_CHARGE_M: {
      slashWave: milli(B.SKILLS.slashWave.charge),
      piercingThrust: milli(B.SKILLS.piercingThrust.charge),
      fireball: milli(B.SKILLS.fireball.charge),
      frostLock: milli(B.SKILLS.frostLock.charge),
      mendingLight: milli(B.SKILLS.mendingLight.charge),
      aegis: milli(B.SKILLS.aegis.charge),
    } as Readonly<Record<ActiveSkillId, Milli>>,
    SLASH_WAVE_ATK_BP: bp(B.SKILLS.slashWave.atk_mult_all),
    SLASH_WAVE_MIN_ENEMIES: B.SKILLS.slashWave.min_enemies,
    PIERCING_ATK_BP: bp(B.SKILLS.piercingThrust.atk_mult),
    PIERCING_SHIELD_HITS: B.SKILLS.piercingThrust.shield_hits,
    FIREBALL_ATK_BP: bp(B.SKILLS.fireball.atk_mult),
    FIREBALL_BURN_T: ticks(B.SKILLS.fireball.burn_s),
    FIREBALL_BURN_PER_TICK_BP: bp(B.SKILLS.fireball.burn_atk_mult_per_s * B.DOT_TICK_S),
    FROST_FREEZE_T: ticks(B.SKILLS.frostLock.freeze_s),
    MENDING_HEAL_BP: bp(B.SKILLS.mendingLight.heal),
    MENDING_HP_BELOW_BP: bp(B.SKILLS.mendingLight.hp_below),
    AEGIS_BARRIER_HITS: B.SKILLS.aegis.barrier_hits,
    // ---- passives (T1.4) ----
    CLEAN_CUT_CRIT_BP: bp(B.PASSIVES.cleanCut.crit_bonus),
    BULWARK_EVERY_COMBO: B.PASSIVES.bulwarkStreak.every_combo,
    BULWARK_BARRIER_HITS: B.PASSIVES.bulwarkStreak.barrier_hits,
    STEADY_FORGIVEN: B.PASSIVES.steadyHands.forgiven_per_encounter,
    OPENING_GAMBIT_ATB_M: milli(B.PASSIVES.openingGambit.start_atb),
    LAST_STAND_HP_BELOW_BP: bp(B.PASSIVES.lastStand.hp_below),
    LAST_STAND_ATB_MULT_BP: bp(B.PASSIVES.lastStand.atb_mult),
    COMEBACK_RESTORE_BP: bp(B.PASSIVES.comeback.restore_frac),
    // ---- guard / enemy timers ----
    GUARD_T: ticks(B.GUARD_S),
    GUARD_MIN_T: ticks(B.GUARD_MIN_S),
    STORY_GUARD_BONUS_T: ticks(B.STORY_GUARD_BONUS_S),
    TELEGRAPH_STAGGER_T: ticks(B.TELEGRAPH_STAGGER_S),
    TUTORIAL_FIRST_GUARD_MULT_BP: bp(B.TUTORIAL_FIRST_GUARD_MULT),
    TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS: B.TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS,
    INITIAL_ENEMY_ATB_MAX_BP: bp(B.INITIAL_ENEMY_ATB_MAX),
    PRESET_INTERVAL_MULT_BP: {
      story: bp(B.PRESET_INTERVAL_MULT.story),
      standard: bp(B.PRESET_INTERVAL_MULT.standard),
      hard: bp(B.PRESET_INTERVAL_MULT.hard),
      zen: bp(B.PRESET_INTERVAL_MULT.zen),
    } as Readonly<Record<string, Bp>>,
    BOSS_BASE_INTERVAL_T: ticks(B.BOSS_BASE_INTERVAL),
    ENEMY_BASE_INTERVAL_T: ticks(B.ENEMY_BASE_INTERVAL),
    // ---- damage ----
    HERO_ATK0_M: milli(B.HERO_ATK0),
    HERO_HP0_M: milli(B.HERO_HP0),
    CHIP_NORMAL_BP: bp(B.CHIP_NORMAL),
    CHIP_PERFECT_BP: bp(B.CHIP_PERFECT),
    BASE_CRIT_BP: bp(B.BASE_CRIT),
    PERFECT_CRIT_BONUS_BP: bp(B.PERFECT_CRIT_BONUS),
    CRIT_MULT_BP: bp(B.CRIT_MULT),
    WEAK_MULT_BP: bp(B.WEAK_MULT),
    BREAK_DMG_MULT_BP: bp(B.BREAK_DMG_MULT),
    BREAK_T: ticks(B.BREAK_S),
    BLOCK_MULT_BP: bp(B.BLOCK_MULT),
    IRON_WILL_BLOCK_MULT_BP: bp(B.IRON_WILL_BLOCK_MULT),
    PARRY_COUNTER_BP: bp(B.PARRY_COUNTER),
    RIPOSTE_COUNTER_BP: bp(B.RIPOSTE_COUNTER),
    ATTACK_IMPACT_T: ticks(B.ATTACK_IMPACT_S),
    SKILL_IMPACT_T: ticks(B.SKILL_IMPACT_S),
    DOOM_DMG_BP: bp(B.DOOM_DMG),
    DOOM_STAGGER_T: ticks(B.DOOM_STAGGER_S),
    DOOM_STAGGER_DMG_MULT_BP: bp(B.DOOM_STAGGER_DMG_MULT),
    // ---- hero HP ----
    WALK_HEAL_BP: bp(B.WALK_HEAL),
    PHASE_HEAL_BP: bp(B.PHASE_HEAL),
    SECOND_WIND_T: ticks(B.SECOND_WIND_S),
    // ---- T1.5: gimmicks and boss ----
    FADE_DELAY_T: ticks(B.FADE_DELAY_S),
    /** Doom Spell timer: chars / (pace_cps x DOOM_TIMER_PACE_EFF) + DOOM_TIMER_BONUS_S (doc 01 4.2), in integer ticks. */
    DOOM_TIMER_PACE_EFF_BP: bp(B.DOOM_TIMER_PACE_EFF),
    DOOM_TIMER_BONUS_T: ticks(B.DOOM_TIMER_BONUS_S),
    /** Boss adds' HP pool = boss HP x BOSS_ADDS_HP_ENC / BOSS_HP_ENC (economy_sim: 0.5 of the 3.2 encounter-units boss). */
    BOSS_ADDS_HP_NUM: Math.round(B.BOSS_ADDS_HP_ENC * 1000),
    BOSS_ADDS_HP_DEN: Math.round(B.BOSS_HP_ENC * 1000),
    BOSS_HIT_MULT_BP: bp(B.BOSS_HIT_MULT),
    DOOM_FALLBACK_TAIL: B.DOOM_FALLBACK_TAIL as string,
    MINIGAME_FIRST_SPAWN_T: ticks(B.MINIGAME_FIRST_SPAWN_S),
    BOSS_SCRIPT_PACE_SCALE: B.BOSS_SCRIPT_PACE_SCALE as boolean,
    SECOND_WIND_HP_BP: bp(B.SECOND_WIND_HP),
    PREMIUM_REVIVE_HP_BP: bp(B.PREMIUM_REVIVE_HP),
    FAIL_GOLD_KEEP_BP: bp(B.FAIL_GOLD_KEEP),
    // ---- chests, caches, gold, stars (T1.6) ----
    RARITY_ORDER,
    CHEST_TIER_ORDER,
    CHEST_P_ENCOUNTER_BP: bp(B.CHEST_P_ENCOUNTER),
    CHEST_P_ENCOUNTER_REPLAY_BP: bp(B.CHEST_P_ENCOUNTER_REPLAY),
    BOSS_CHEST_REPLAY_BP: bp(B.BOSS_CHEST_REPLAY_P),
    CHEST_TIER_NORMAL_BP: bpRec(B.CHEST_TIER_NORMAL, CHEST_TIER_ORDER),
    CHEST_TIER_BOSS_BP: bpRec(B.CHEST_TIER_BOSS, CHEST_TIER_ORDER),
    CHEST_GEAR_TIER_DOWN_BP: bp(B.CHEST_GEAR_TIER_DOWN_P),
    CHEST: {
      Wooden: chestSpec(B.CHEST.Wooden, B.CACHE_FROM_CHEST.Wooden),
      Iron: chestSpec(B.CHEST.Iron, B.CACHE_FROM_CHEST.Iron),
      Gold: chestSpec(B.CHEST.Gold, B.CACHE_FROM_CHEST.Gold),
      Mythic: chestSpec(B.CHEST.Mythic, B.CACHE_FROM_CHEST.Mythic),
    } as Readonly<Record<ChestTier, ChestSpec>>,
    CACHE_ODDS_BP: bpRec(B.CACHE_ODDS, RARITY_ORDER),
    CACHE_PITY_RARE: B.CACHE_PITY_RARE,
    CACHE_PITY_EPIC: B.CACHE_PITY_EPIC,
    CACHE_PITY_LEG: B.CACHE_PITY_LEG,
    CACHE_GOLD_GU: B.CACHE_GOLD_GU,
    /** Slot weights (weapon, armor, charm) as given; the published slot bp is derived from them. */
    CACHE_SLOT_W: B.CACHE_SLOT_ODDS as Readonly<Record<"weapon" | "armor" | "charm", number>>,
    CACHE_ARCH_EQUIPPED_BP: bp(B.CACHE_ARCHETYPE_ODDS.equipped),
    CACHE_ARCH_OTHER_BP: bp(B.CACHE_ARCHETYPE_ODDS.other_each),
    REPLAY_GOLD_MULT_BP: bp(B.REPLAY_GOLD_MULT),
    STALE_REPLAY_MULT_BP: bp(B.STALE_REPLAY_MULT),
    REPLAY_SOFTCAP_PER_DAY: B.REPLAY_SOFTCAP_PER_DAY,
    REPLAY_SOFTCAP_MULT_BP: bp(B.REPLAY_SOFTCAP_MULT),
    STAR_GOLD_BP: bp(B.STAR_GOLD),
    STAR2_REL_MARGIN_BP: bp(B.STAR2_REL_MARGIN),
    STAR2_CLAMP_LO_BP: bp(B.STAR2_REL_CLAMP[0]),
    STAR2_CLAMP_HI_BP: bp(B.STAR2_REL_CLAMP[1]),
    SHOP_RARITY_PRICE_BP: bpRec(B.SHOP_RARITY_PRICE, ["C", "U", "R"] as const),
    VALUE_RARITY_PRICE_BP: bpRec(B.VALUE_RARITY_PRICE, RARITY_ORDER),
    SALVAGE_RATE_BP: bp(B.SALVAGE_RATE),
    DROP_SALVAGE_RATE_BP: bp(B.DROP_SALVAGE_RATE),
    UPG_TRANSFER_BP: bp(B.UPG_TRANSFER),
    PACE_DEFAULT: B.PACE_REF,
    // ---- gear ----
    UPG_STEP_BP: bp(B.UPG_STEP),
    RARITY_MULT_BP: rarityBp(B.RARITY_MULT),
    RARITY_UPG_CAP: B.RARITY_UPG_CAP as Readonly<Record<Rarity, number>>,
    PAR_RARITY: B.PAR_RARITY as Rarity,
    PAR_RARITY_BY_CH: B.PAR_RARITY_BY_CH as Readonly<Record<number, Rarity>>,
    PAR_UPG: B.PAR_UPG as Readonly<Record<number, number>>,
    PAR_UPG_DEFAULT: B.PAR_UPG_DEFAULT,
    // ---- text ----
    SECOND_WIND_FALLBACK_TEXT: B.SECOND_WIND_FALLBACK_TEXT as string,
  } as const;
}

export const K = deriveConstants(BALANCE);

// D31: there is no damage variance in v1 (a tunable, but the chain has no random step); a non-zero value is a bug.
if (BALANCE.DMG_VARIANCE !== 0)
  throw new Error("DMG_VARIANCE must be 0 (D31): the damage chain has no variance step");

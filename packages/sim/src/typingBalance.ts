// Typing-engine constants (T1.2). PLACEHOLDER home until T1.3 ports economy_sim.py into balance.ts (docs/interfaces.md §7):
// names and values here copy the §7 BALANCE keys, converted ONCE at module init into integer units.
// T1.3: fold these into BALANCE/K and delete this file (keep the K names).
import type { WeaponArchetype } from "@hd2d/content";
import { type Bp, bp, type Milli, milli } from "./fixed.ts";
import { TICK_HZ } from "./time.ts";

const ticks = (s: number): number => Math.round(s * TICK_HZ);

export interface WeaponTyping {
  charChargeM: Milli;
  wordBonusM: Milli;
}
const WEAPON_TYPING: Readonly<Record<WeaponArchetype, WeaponTyping>> = {
  sword: { charChargeM: milli(8), wordBonusM: milli(10) },
  dagger: { charChargeM: milli(11), wordBonusM: milli(6) },
  staff: { charChargeM: milli(6), wordBonusM: milli(8) },
  hammer: { charChargeM: milli(5), wordBonusM: milli(14) },
};
export const weaponTyping = (a: WeaponArchetype): WeaponTyping => WEAPON_TYPING[a];

export const TK = {
  ATB_FULL_M: milli(100),
  ATB_OVERFLOW_CAP_M: milli(30),
  PERFECT_ATB_MULT_BP: bp(1.25),
  PERFECT_CHAR_BONUS_BP: bp(0.25), // doc interfaces §3.3: + 0.25 x sum of chars paid, when perfect
  SWIFT_ATB_M: milli(5),
  STRICT_TYPO_ATB_M: milli(5),
  COMBO_PER_BP: bp(0.02),
  COMBO_CAP: 25,
  COMBO_TIERS: [5, 15, 30, 50] as readonly number[],
  KEY_STREAK_TIERS: [10, 25, 50, 100] as readonly number[],
  SWIFT_THRESHOLD_BP: bp(1.3),
  BURST_BLAZING_BP: bp(1.6),
  BURST_CHARS: 16,
  BURST_COOLDOWN_T: ticks(5),
  PARRY_ATB_M: milli(10),
  // ---- guard (doc 01 §1.7 / interfaces §3.3 D13) ----
  GUARD_T: ticks(2.5),
  GUARD_MIN_T: ticks(1.5),
  STORY_GUARD_BONUS_T: ticks(1),
  TELEGRAPH_STAGGER_T: ticks(0.8),
  TUTORIAL_FIRST_GUARD_MULT_BP: bp(2.0),
  INITIAL_ENEMY_ATB_MAX_BP: bp(0.3),
  // ---- typing-only enemy stub (T1.3 replaces with real intervals/damage) ----
  PRESET_INTERVAL_MULT_BP: { story: bp(1.4), standard: bp(1), hard: bp(1), zen: bp(1) } as Readonly<
    Record<string, Bp>
  >,
  ENCOUNTER_INTRO_T: ticks(2),
  REWARD_T: ticks(5),
  BREATHER_T: ticks(2),
  HERO_HP0_M: milli(100),
  /** Stub: an enemy dies after this many completed word plates (T1.3 replaces with chip damage vs HP). */
  STUB_WORDS_TO_KILL: 3,
  STUB_WORDS_TO_KILL_BOSS: 6,
  LEVEL_TIMEOUT_T: ticks(1200), // BALANCE.MAX_LEVEL_S; asserted equal to replay.ts MAX_LEVEL_TICKS in a test
  // ---- word assignment ----
  RECENT_WORDS: 6,
  AUTO_PACE_MIN: 15,
  AUTO_PACE_MAX: 120,
} as const;

/** Last-resort plate words, one per letter, so a plate can ALWAYS be assigned a free first letter. */
export const FALLBACK_WORDS: readonly string[] = [
  "apple",
  "bread",
  "cloud",
  "dream",
  "eagle",
  "flame",
  "grass",
  "heart",
  "ivory",
  "jewel",
  "knife",
  "lemon",
  "moon",
  "night",
  "ocean",
  "pearl",
  "queen",
  "river",
  "stone",
  "tiger",
  "umber",
  "vine",
  "water",
  "xenon",
  "yield",
  "zebra",
];

// A port of economy_sim.py's analytic Chapter 1 combat model (typing_combat + level overhead), so the runner can say what
// the Python model predicts for OUR content (same encounter HP, same structure) next to what the real sim measures.
// Chapter 1 only: word tier 1 (4.2 chars, speed factor 1 - 0.015 x 0.2, accuracy penalty 0.0025 x 0.2), par gear ATK 10.
import { computeHeroStats, parLoadout } from "@hd2d/sim";
import { COMBAT_TYPING_EFF } from "./personas.ts";

const LN = 4.2;
const SF = 1 - 0.015 * (LN - 4);
const AD = 0.0025 * (LN - 4);
const CHAR_CHARGE = 8;
const WORD_BONUS = 10;
const PERFECT_ATB_MULT = 1.25;
const SWIFT_ATB = 5;
const SWIFT_RATE = 0.12;
const COMBO_PER = 0.02;
const COMBO_CAP = 25;
const CHIP_NORMAL = 0.15;
const CHIP_PERFECT = 0.25;
const BASE_CRIT = 0.05;
const PERFECT_CRIT_BONUS = 0.15;
const CRIT_MULT = 1.5;
const SKILL_DMG_PER_CHARGE = 0.12;
const PERFECT_SKILL_CHARGE = 1.5;
export const PAR_ATK_CH1 = 10;

/** economy_sim level_overhead_s: intro 7 + walk 8 per later encounter + reward 5 per encounter + level end 10 (+30 boss). */
export const LEVEL_INTRO_S = 7;
export const WALK_S = 8;
export const REWARD_S = 5;
export const LEVEL_END_S = 10;
export const BOSS_EXTRA_S = 30;

const comboCache = new Map<number, number>();
function comboMeanMult(pPerfect: number): number {
  const key = Math.round(pPerfect * 1000);
  const hit = comboCache.get(key);
  if (hit !== undefined) return hit;
  const n = 80;
  let pi = new Array<number>(n + 1).fill(0);
  pi[0] = 1;
  for (let it = 0; it < 400; it++) {
    const nxt = new Array<number>(n + 1).fill(0);
    pi.forEach((pr, k) => {
      if (pr === 0) return;
      nxt[Math.min(k + 1, n)] = (nxt[Math.min(k + 1, n)] as number) + pr * pPerfect;
      nxt[k >> 1] = (nxt[k >> 1] as number) + pr * (1 - pPerfect);
    });
    pi = nxt;
  }
  let m = 0;
  pi.forEach((pr, k) => {
    m += pr * (1 + COMBO_PER * Math.min(k, COMBO_CAP));
  });
  comboCache.set(key, m);
  return m;
}

export interface PyCombat {
  dpsPerAtk: number;
  skillShare: number;
  attacksPs: number;
  pPerfect: number;
}

/** economy_sim.typing_combat(wpm_net, acc, chapter 1). */
export function typingCombat(wpm: number, acc: number): PyCombat {
  const accE = Math.max(0.6, Math.min(0.995, acc - AD));
  const wpmE = wpm * SF;
  const ccps = ((wpmE * 5) / 60) * COMBAT_TYPING_EFF;
  const tWord = LN / ccps;
  const p = accE ** LN;
  const cm = comboMeanMult(p);
  const atb =
    (WORD_BONUS + LN * CHAR_CHARGE * cm) * (1 + (PERFECT_ATB_MULT - 1) * p) +
    SWIFT_ATB * SWIFT_RATE * p;
  const attacksPs = atb / 100 / tWord;
  const crit = BASE_CRIT + PERFECT_CRIT_BONUS * p;
  const basic = attacksPs * (1 + crit * (CRIT_MULT - 1));
  const chip = (CHIP_NORMAL + (CHIP_PERFECT - CHIP_NORMAL) * p) / tWord;
  const skill = ((1 + (PERFECT_SKILL_CHARGE - 1) * p) / tWord) * SKILL_DMG_PER_CHARGE;
  return {
    dpsPerAtk: basic + chip + skill,
    skillShare: skill / (basic + chip + skill),
    attacksPs,
    pPerfect: p,
  };
}

/**
 * economy_sim's par ATK of a chapter (hero_stats at the par build). Ch1 is the literal 10 (byte-identical Ch1 report);
 * later chapters read the sim's computeHeroStats(parLoadout(c)) (Ch2: T1 Common +2 = 12.2, CH2_PLAN §4.1). Word tier 1
 * (LN 4.2) holds for Ch1-3 (doc 01 §5.1), so the rest of the model is unchanged.
 */
export const parAtk = (chapter = 1): number =>
  chapter === 1 ? PAR_ATK_CH1 : computeHeroStats(parLoadout(chapter)).atk / 1000;

/** Python-model active time (s) of a level with `hp` total HP to chew through and `encounters` fights. */
export function pyActiveSeconds(
  hp: number,
  encounters: number,
  boss: boolean,
  wpm: number,
  acc: number,
  chapter = 1,
): number {
  const dps = typingCombat(wpm, acc).dpsPerAtk * parAtk(chapter);
  const overhead =
    LEVEL_INTRO_S +
    WALK_S * (encounters - 1) +
    REWARD_S * encounters +
    LEVEL_END_S +
    (boss ? BOSS_EXTRA_S : 0);
  return hp / dps + overhead;
}

/**
 * economy_sim level_spec enc_hp: ENC_TTK_S 36 s x reference DPS (35 WPM, 92%, par ATK of the chapter) x (1 + 0.02 (p-1)).
 * Ch1: 199.4 at L1; Ch2 (ATK 12.2): 243 at L1 (the authored 244, CH2_PLAN §4.1).
 */
export function pyEncounterHp(index: number, chapter = 1): number {
  return 36 * typingCombat(35, 0.92).dpsPerAtk * parAtk(chapter) * (1 + 0.02 * (index - 1));
}

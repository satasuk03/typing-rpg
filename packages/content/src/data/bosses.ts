import { BossDef } from "../schemas.ts";
import { WILLOW_FINISHER_TEXT } from "./biome-grove.ts";
import { RUIN_GOLEM_FINISHER_TEXT } from "./boss.ts";
import { knobsFor } from "./knobs.ts";
import { BOSS_ATTACK_POWER, bossLevelHit } from "./levels-ch1.ts";

/**
 * The Ruin Golem (doc 01 section 4.2 three-phase template, interfaces 3.4 and D14-D16).
 *  - hp / hit: economy_sim level_spec(10): boss HP = 3.2 encounters of HP (752.9), hit solved so the boss encounter
 *    does BOSS_ENC_DMG(1) = 1.4x a normal encounter's damage (7.98).
 *  - phase 1 adds: the sim's two adds (BOSS_ADDS_HP_ENC 0.5 encounters of HP in total). The boss chooses adds with one
 *    chapter gimmick (doc 01 4.2): one scrambled Goblin Scout and one Cave Bat.
 *  - phase 2 Doom Spell: sentences come from the T4.1 `doom` pool; failure costs 15% of par HP (BALANCE.DOOM_DMG).
 *    doomEveryS 16 s gives about 2.5 spells in the ~45 s the reference typist spends in the 66-33% band (DOOM_SPELLS 2.5).
 *  - phase 3 Falling Rubble: words from the T4.1 `minigame` pool (3-6 letters), then the finisher (no timer).
 */
export const RUIN_GOLEM: BossDef = BossDef.parse({
  id: "ruin-golem",
  name: "Ruin Golem",
  title: "Warden of the Hollow",
  enemyId: "ruin-golem",
  hp: 752.9,
  hit: bossLevelHit(7.98), // T6.1: x BOSS_LEVEL_HIT_MULT (levels.ts)
  attackPower: BOSS_ATTACK_POWER,
  plateLength: [4, 7],
  phase1: {
    addsAttackPower: BOSS_ATTACK_POWER,
    endAtHpPct: 66,
    adds: [{ enemy: "goblin-scout", gimmick: "scrambled" }, { enemy: "cave-bat" }],
  },
  phase2: { endAtHpPct: 33, doomEveryS: 16, minDoomSpells: 2 },
  phase3: {
    minigame: {
      kind: "fallingRubble",
      lanes: 3,
      spawnEveryS: 2.6,
      fallS: 7,
      clearAtkMult: 1.2,
      missHit: 6,
    },
    finisherText: RUIN_GOLEM_FINISHER_TEXT,
  },
  breatherS: 2,
  introS: 4,
});

const k2 = knobsFor(2);
const r2 = (x: number): number => Math.round(x * 100) / 100;
/** The Willow's hit: plan 4.1's 12.8 x BOSS_LEVEL_HIT_MULT of Ch2 (knobs.ts). */
const WILLOW_HIT = r2(12.8 * k2.bossLevelHitMult);
/** Ch2 par ATK (T1 Common +2, plan 4.1) and the riddle count: clearAtkMult x ATK x count = the 33% HP band. */
const CH2_PAR_ATK = 12.2;
const WILLOW_HP = 923;
const RIDDLES = 5;

/**
 * The Whispering Willow, "Keeper of the Hush" (CH2_PLAN 1.4, interfaces 13). T5.1 numbers (docs/balance-ch2.md §5).
 *  - hp 923 / hit 12.8: plan 4.1 (Ch2 par HP 121.7, BOSS_ENC_DMG 1.7). The hit is x BOSS_LEVEL_HIT_MULT of Ch2 (knobs.ts).
 *  - attackPower 1.30 (Willow), adds 1.25 (plan 4.3); the adds are one fading Hush Shade and one Moth Mender (heals adds only).
 *  - phase 2 Hush Spells: exact-case sentences from biome-grove.ts HUSH_SPELLS, failure costs 15% of par HP. doomEveryS 14
 *    (T5.1, was 16): a fast typist's phase 2 sits at the minDoomSpells floor, and the reading-bound riddle phase already
 *    makes the Willow longer than the Golem for them (Fast boss 3.23 -> 3.12 min).
 *  - phase 3 Riddle of Leaves: 5 riddles (PO ruling 2026-10-10), then WILLOW_FINISHER_TEXT. Reading test:
 *    clearAtkMult = 33% band / (5 x par ATK) = 5.0, so 5 right answers take the band; a wrong answer or timeout costs
 *    missHit = 0.75 of the Willow's hit.
 *    Timer = readS + answerS = 15 s at pace 35, x the boss-script pace factor (0.6 at 75 WPM -> 9 s, 1.48 at 20 -> 22 s).
 *    T5.1: was 10 s, which timed out 2 of 3 riddles at 75 WPM once clue reading is modelled (clues are 6-17 words, and the
 *    factor shrinks the timer with TYPING pace, not reading pace). 15 s covers the longest clue + longest answer for a
 *    150-wpm reader at 75 WPM. gapS 1.5 -> 1.
 */
export const WHISPERING_WILLOW: BossDef = BossDef.parse({
  id: "whispering-willow",
  name: "Whispering Willow",
  title: "Keeper of the Hush",
  enemyId: "whispering-willow",
  hp: WILLOW_HP,
  hit: WILLOW_HIT,
  attackPower: k2.bossAttackPower,
  plateLength: [4, 8],
  phase1: {
    addsAttackPower: k2.bossAddsAttackPower,
    endAtHpPct: 66,
    adds: [{ enemy: "hush-shade", gimmick: "fading" }, { enemy: "moth-mender" }],
  },
  phase2: { endAtHpPct: 33, doomEveryS: 14, minDoomSpells: 2 },
  phase3: {
    minigame: {
      kind: "riddle",
      count: RIDDLES,
      leaves: 3,
      readS: 9,
      answerS: 6,
      gapS: 1,
      clearAtkMult: Math.round(((WILLOW_HP * 0.33) / (RIDDLES * CH2_PAR_ATK)) * 10) / 10,
      missHit: r2(0.75 * WILLOW_HIT),
      lengthRange: [3, 8],
    },
    finisherText: WILLOW_FINISHER_TEXT,
  },
  breatherS: 2,
  introS: 4,
});

export const BOSSES: BossDef[] = [RUIN_GOLEM, WHISPERING_WILLOW];

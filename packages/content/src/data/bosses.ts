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

/**
 * The Whispering Willow, "Keeper of the Hush" (CH2_PLAN 1.4, interfaces 13). Placeholder-sane numbers; T5.1 tunes them.
 *  - hp 923 / hit 12.8: plan 4.1 (Ch2 par HP 121.7, BOSS_ENC_DMG 1.7). The hit is x BOSS_LEVEL_HIT_MULT of Ch2 (knobs.ts).
 *  - attackPower 1.30 (Willow), adds 1.25 (plan 4.3); the adds are one fading Hush Shade and one Moth Mender (heals adds only).
 *  - phase 2 Hush Spells: exact-case sentences from biome-grove.ts HUSH_SPELLS, one every 16 s, failure costs 15% of par HP.
 *  - phase 3 Riddle of Leaves: 5 riddles (PO ruling 2026-10-10), then WILLOW_FINISHER_TEXT. Reading test: clearAtkMult is set so
 *    5 right answers take the 33% band; a wrong answer or timeout costs missHit (0.75 of the boss hit).
 *    Timer = readS + answerS = 10 s at pace 35, x the boss-script pace factor.
 */
export const WHISPERING_WILLOW: BossDef = BossDef.parse({
  id: "whispering-willow",
  name: "Whispering Willow",
  title: "Keeper of the Hush",
  enemyId: "whispering-willow",
  hp: 923,
  hit: Math.round(12.8 * k2.bossLevelHitMult * 100) / 100,
  attackPower: k2.bossAttackPower,
  plateLength: [4, 8],
  phase1: {
    addsAttackPower: k2.bossAddsAttackPower,
    endAtHpPct: 66,
    adds: [{ enemy: "hush-shade", gimmick: "fading" }, { enemy: "moth-mender" }],
  },
  phase2: { endAtHpPct: 33, doomEveryS: 16, minDoomSpells: 2 },
  phase3: {
    minigame: {
      kind: "riddle",
      count: 5,
      leaves: 3,
      readS: 4,
      answerS: 6,
      gapS: 1.5,
      clearAtkMult: 5,
      missHit: 9.6,
      lengthRange: [3, 8],
    },
    finisherText: WILLOW_FINISHER_TEXT,
  },
  breatherS: 2,
  introS: 4,
});

export const BOSSES: BossDef[] = [RUIN_GOLEM, WHISPERING_WILLOW];

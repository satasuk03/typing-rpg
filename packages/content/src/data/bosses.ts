import { BossDef } from "../schemas.ts";
import { RUIN_GOLEM_FINISHER_TEXT } from "./boss.ts";
import { bossLevelHit } from "./levels.ts";

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
  plateLength: [4, 7],
  phase1: {
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

export const BOSSES: BossDef[] = [RUIN_GOLEM];

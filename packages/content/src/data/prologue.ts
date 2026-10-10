import { PrologueDef } from "../schemas.ts";

/**
 * The Prologue "The Unwriting" (docs/PROLOGUE_PLAN.md, interfaces v2.2 §3.7 and §14.2). One object, not a LevelDef:
 * levels drive the map, unlocks and balance cells, none of which the prologue touches.
 * All prologue numbers live here (never in balance.ts). They are STARTING VALUES from plan §2.1; P1.3 tunes them with the bot.
 *
 *  - segments: one "Servants" encounter of two waves (shade, wisp, shade / wisp, shade, wisp), then Nul + 2 adds.
 *    No walks (the cold open and the boss intro cover the pacing), no gimmicks, no elites (brand-new players, no Reveal).
 *    Encounter hp is a per-wave pool. A Legendary tier 3 +5 sword is ~3.7x the par-gear score, so the pools are sized for
 *    ~8 s a wave and ~13 s of boss damage to the 35% gate at 40 WPM (about 40 s of typing in all).
 *  - kit: the 6 Ch1 actives in story (theft) order, no Reveal, falling start charges (Fireball 100 = the first word casts it),
 *    and all 9 passives.
 *  - words: A1 plate words, lowercase 3-5 letters, light / magic / courage themed, many distinct first letters.
 *    guardWords: 16 defensive words with 16 distinct first letters, none shared with the plate list.
 */
export const PROLOGUE_WORDS: string[] = [
  "sun",
  "star",
  "hope",
  "fire",
  "wind",
  "gold",
  "rain",
  "moon",
  "light",
  "brave",
  "glow",
  "spark",
  "flame",
  "beam",
  "dawn",
  "bold",
  "wand",
  "fish",
  "spell",
  "charm",
  "magic",
  "hero",
  "heart",
  "sword",
  "blade",
  "shine",
  "ray",
  "wish",
  "dream",
  "true",
  "sky",
  "cast",
  "song",
  "word",
  "wing",
  "soar",
  "glad",
  "kind",
  "tale",
  "lamp",
  "key",
  "run",
  "big",
  "ward",
  "red",
  "pure",
  "wise",
  "bird",
  "gem",
  "life",
  "tree",
  "love",
  "joy",
  "owl",
  "home",
  "quest",
  "fly",
  "faith",
  "ice",
  "best",
];

export const PROLOGUE_GUARD_WORDS: string[] = [
  "block",
  "dodge",
  "guard",
  "hold",
  "jump",
  "keep",
  "lock",
  "move",
  "push",
  "rest",
  "safe",
  "turn",
  "wait",
  "cover",
  "away",
  "fast",
];

export const PROLOGUE = PrologueDef.parse({
  id: "prologue",
  layoutId: "prologue",
  biome: "ruins",
  pace: 25,
  seed: 0x0a11ce,
  words: PROLOGUE_WORDS,
  guardWords: PROLOGUE_GUARD_WORDS,
  segments: [
    {
      kind: "encounter",
      encounter: {
        name: "Servants",
        hp: 150,
        gruntHit: 4,
        attackPower: 1,
        waves: [
          [{ enemy: "hush-shade" }, { enemy: "lantern-wisp" }, { enemy: "hush-shade" }],
          [{ enemy: "lantern-wisp" }, { enemy: "hush-shade" }, { enemy: "lantern-wisp" }],
        ],
      },
    },
    { kind: "boss", bossId: "nul" },
  ],
  kit: {
    actives: [
      { id: "fireball", startChargePct: 100 },
      { id: "aegis", startChargePct: 80 },
      { id: "slashWave", startChargePct: 60 },
      { id: "piercingThrust", startChargePct: 45 },
      { id: "mendingLight", startChargePct: 30 },
      { id: "frostLock", startChargePct: 15 },
    ],
    passives: [
      "cleanCut",
      "steadyHands",
      "ironWill",
      "openingGambit",
      "bulwarkStreak",
      "riposte",
      "lastStand",
      "comeback",
      "calmMind",
    ],
  },
  gear: { archetype: "sword", tier: 3, rarity: "L", upgrade: 5 },
  chargeMult: 2.5,
  castGapS: 1.5,
  forceAfterS: 4,
  heroHpFloorPct: 25,
  surge: { encounterAfterS: 18, bossAfterS: 20, doubleEveryS: 4, maxMult: 16 },
  bossMinS: 12,
});

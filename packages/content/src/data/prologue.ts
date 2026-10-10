import { PrologueDef } from "../schemas.ts";

/**
 * The Prologue "The Unwriting" (docs/PROLOGUE_PLAN.md, interfaces v2.2 §3.7 and §14.2). One object, not a LevelDef:
 * levels drive the map, unlocks and balance cells, none of which the prologue touches.
 * All prologue numbers live here (never in balance.ts). P1.3 tuned them with `pnpm bot --prologue` (tools/bot/src/prologue.ts).
 * Tuned numbers (power fantasy: the hero stays above 50% HP for most of the run): pace 30 (long guard windows), encounter hp
 * 1250 per wave, gruntHit 90, attackPower 16 (guard leak at its cap), castGapS 2.0, surge 16/18 s doubling every 3 s (bounds
 * the 20 WPM run), bossMinS 20. Nul (bosses.ts / enemies.ts): hp 4800, hit 380, interval 3 s, shield 9.
 * Mending Light only casts once the hero has lost HP (sim rule), and barriers plus guard words let 40/75 WPM typists take no
 * damage at all, so it is gated only on runs where the hero was hurt (tools/bot/src/prologue.ts).
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
  pace: 30,
  seed: 0x0a11ce,
  words: PROLOGUE_WORDS,
  guardWords: PROLOGUE_GUARD_WORDS,
  segments: [
    {
      kind: "encounter",
      encounter: {
        name: "Servants",
        hp: 1250,
        gruntHit: 90,
        attackPower: 16,
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
  castGapS: 2.0,
  forceAfterS: 4,
  heroHpFloorPct: 25,
  surge: { encounterAfterS: 16, bossAfterS: 18, doubleEveryS: 3, maxMult: 16 },
  bossMinS: 20,
});

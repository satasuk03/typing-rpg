// A self-contained Whispering Willow level for the sim tests, the golden replays and the Chromium parity bundle (T1.3).
// Real Willow tuning is T4.3/T5.1: every number here is a placeholder. The word lists are literal (not read from the
// content bundle), so editing Ch2 vocabulary can never churn the golden hashes. Pure and deterministic.
import type {
  ResolvedBoss,
  ResolvedEnemy,
  ResolvedLevel,
  ResolvedRiddleWord,
} from "../src/index.ts";
import { BOSS, ENEMIES, mkDef } from "./typingHarness.ts";

export const WILLOW_FINISHER = "Rest now, Willow, and let the words go home.";

/** Exact-case Hush Spells (the Ch2 doom pool shape: capitals, punctuation, 28-60 chars). */
export const HUSH_SPELLS = [
  "Hush now, Ember Knight, and forget your name.",
  "Every word you own will fade into the mist.",
  "Sleep beneath my leaves, little Knight.",
  "The Hush is kind, so let your voice go quiet.",
];

/** 14 riddle words: initials repeat (o, m, t) so decoy selection has to skip same-letter words. */
export const RIDDLES: ResolvedRiddleWord[] = [
  { text: "lantern", clue: "a light you carry in the dark" },
  { text: "owl", clue: "a bird that hunts at night" },
  { text: "moth", clue: "a small insect that loves a flame" },
  { text: "root", clue: "the part of a tree under the ground" },
  { text: "leaf", clue: "a flat green part of a tree" },
  { text: "bark", clue: "the rough skin of a tree" },
  { text: "acorn", clue: "the nut of an oak tree" },
  { text: "fern", clue: "a green plant with feathery leaves" },
  { text: "dew", clue: "tiny drops of water on grass in the morning" },
  { text: "nest", clue: "a home that a bird builds" },
  { text: "oak", clue: "a big tree with strong wood" },
  { text: "moss", clue: "soft green stuff on stones" },
  { text: "thorn", clue: "a sharp point on a rose stem" },
  { text: "twig", clue: "a very small branch" },
];

export const WILLOW_ENEMIES: Record<string, ResolvedEnemy> = {
  ...ENEMIES,
  shade: { ...(ENEMIES.slime as ResolvedEnemy), id: "shade", hpWeightBp: 10_000 },
  mender: {
    ...(ENEMIES.slime as ResolvedEnemy),
    id: "mender",
    heal: { everyTicks: 420, fracBp: 2000, maxTargets: 2, maxHeals: 0 },
  },
  willow: { ...(ENEMIES.golem as ResolvedEnemy), id: "willow" },
};

/** A placeholder Willow: phase 1 optionally has a fading Shade and a Mender, phase 2 Hush Spells, phase 3 the riddles. */
export function willowBoss(withAdds: boolean, over: Partial<ResolvedBoss> = {}): ResolvedBoss {
  return {
    ...BOSS,
    id: "willow",
    name: "Whispering Willow",
    title: "Keeper of the Hush",
    enemyId: "willow",
    hpM: 300_000,
    hitM: 12_000,
    attackPowerBp: 13_000,
    phase1: withAdds
      ? {
          endAtHpBp: 6600,
          adds: [
            { enemyId: "shade", gimmick: "fading" },
            { enemyId: "mender", gimmick: null },
          ],
          addsHpPoolM: 60_000,
          addsGruntHitM: 4000,
          addsAttackPowerBp: 12_500,
        }
      : { endAtHpBp: 6600, adds: [] },
    phase2: { endAtHpBp: 3300, doomEveryTicks: 600, minDoomSpells: 2 },
    phase3: {
      minigame: {
        kind: "riddle",
        count: 5,
        leaves: 3,
        readTicks: 180,
        answerTicks: 300,
        gapTicks: 90,
        clearAtkMultBp: 30_000,
        missHitM: 6000,
        lengthRange: [3, 8],
      },
      finisherText: WILLOW_FINISHER,
    },
    breatherTicks: 120,
    introTicks: 120,
    ...over,
  };
}

/** A boss-only Chapter 2 level (exact-case sentences: foldSentences false). */
export function willowDef(
  withAdds = false,
  over: Partial<ResolvedLevel> = {},
  bossOver: Partial<ResolvedBoss> = {},
): ResolvedLevel {
  const base = mkDef();
  return mkDef({
    levelId: "willow-fx",
    chapter: 2,
    index: 10,
    segments: [{ kind: "boss", bossId: "willow" }],
    boss: willowBoss(withAdds, bossOver),
    enemies: WILLOW_ENEMIES,
    parArmorBp: 11_400,
    foldSentences: false,
    riddles: RIDDLES,
    words: {
      ...base.words,
      doom: HUSH_SPELLS,
      finisher: [WILLOW_FINISHER],
      secondWind: ["Stay awake, Knight."],
    },
    ...over,
  });
}

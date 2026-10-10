/** Tunable validator limits. Sources: docs/brainstorm/01 section 5.1/1.7/4.2 and docs/interfaces.md section 6. */
export const CONFIG = {
  /** Plate word length bands per tier (doc 01 section 5.1: T1 3-5, T2 up to 7, T3 6-10). */
  tierBands: { 1: [3, 5], 2: [3, 7], 3: [6, 10] } as Record<number, [number, number]>,
  /** Guard words: tier 1 and at most 5 letters (interfaces section 6; doc 01 section 1.7: 3-5 letters). */
  guard: { maxLen: 5, minLen: 3, tier: 1, minCount: 30, minDistinctInitials: 20 },
  /** Boss sentence bands in characters (doc 01 section 4.2 timers; interfaces D17: 8 s Second Wind). */
  doom: { minLen: 28, maxLen: 60, minCount: 12, minDistinctInitials: 8 },
  finisher: { minLen: 12, maxLen: 60, minCount: 3 },
  secondWind: { minLen: 10, maxLen: 24, minCount: 8, minDistinctInitials: 6 },
  minigame: { minLen: 3, maxLen: 6, minCount: 16, minDistinctInitials: 12 },
  /** Pool coverage: at least this many first letters must have at least this many words (T1 and T2). */
  coverage: { minLetters: 15, minWordsPerLetter: 5 },
  /** Biome vocab size (doc 01 section 5.2: 60-120 themed words; the task asks for 60-100). */
  biome: { min: 60, max: 100, minDistinctInitials: 12 },
  /** Distinct first letters needed per level: max visible plates + guard swaps. */
  feasibility: { guardSwaps: 2, bossVisiblePlates: 4, defaultVisiblePlates: 4 },
  /** Chapter 2 vocabulary (CH2_PLAN 3.2): per-biome pools, plate bands, sentence pools and the Riddle of Leaves. */
  ch2: {
    biomes: ["hushwood", "fen", "grove"] as const,
    minPool: 60,
    /** Plate length bands (levels reach 3-8 letters late in the chapter): each needs minInitialsPerBand first letters. */
    bands: [
      [3, 5],
      [4, 6],
      [5, 7],
      [6, 8],
    ] as readonly (readonly [number, number])[],
    minInitialsPerBand: 12,
    sentenceMin: { doom: 16, finisher: 3, secondWind: 10, intro: 3 } as Record<string, number>,
    introLen: [12, 60] as [number, number],
    riddleMaxLen: 10,
    riddle: { minCount: 48, minInitials: 10 },
  },
  /** Word-entry text limits. */
  maxDefinitionLen: 80,
  /** Typing Trial (interfaces D25 and TrialDef). */
  trial: {
    minPassages: 30,
    minChars: 1600,
    maxChars: 2400,
    avgWordLen: [3.9, 5.0] as [number, number],
    punctDensity: [0.012, 0.05] as [number, number],
    /** Max allowed (max - min) across the pool: keeps difficulty comparable. */
    maxAvgWordLenSpread: 0.8,
    maxPunctSpread: 0.025,
  },
} as const;

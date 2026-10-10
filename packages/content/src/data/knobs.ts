// Per-chapter authoring knobs (docs/interfaces.md §13.6, plan S2). Authoring-time constants: tools/balance solves them,
// levels-chN.ts and bosses.ts multiply the authored numbers by them. The sim never reads this table (D40).

export interface ChapterKnobs {
  /** x encounter HP of L1-L9. */
  encHpMult: number;
  /** x gruntHit of L1-L9 (Ch2: solved WITH guard leak on, at par gear, plan §4.3). */
  hitMult: number;
  /** x every hit of L10 (its waves' gruntHit, which the adds use, and the boss hit). */
  bossLevelHitMult: number;
  /** EncounterDef.attackPower of L1-L9 and of the L10 waves (x par armor). */
  gruntAttackPower: number;
  /** EnemyRef.attackPower of elite refs; null = the chapter has no elites. */
  eliteAttackPower: number | null;
  /** BossDef.attackPower. */
  bossAttackPower: number;
  /** BossDef.phase1.addsAttackPower. */
  bossAddsAttackPower: number;
}

export const CHAPTER_KNOBS: Readonly<Record<number, ChapterKnobs>> = {
  // PINNED: these are the Ch1 levels.ts / bosses.ts values; a test asserts them (Ch1 byte-identity, §13.1).
  1: {
    encHpMult: 1.2,
    hitMult: 1.34,
    bossLevelHitMult: 1.15,
    gruntAttackPower: 1,
    eliteAttackPower: null,
    bossAttackPower: 1.25,
    bossAddsAttackPower: 1.25,
  },
  // Ch2: the P values are from the plan (§1.3, §4.3). The three multipliers are solved on the real sim in T5.1
  // (docs/balance-ch2.md §4): encHpMult 1.2 -> 1.1 (reference 12.6 -> 11.6 auto-attacks per encounter), hitMult 1.25 -> 1.05
  // (with levels-ch2.ts HIT_SHAPE: reference damage = 1.00x the DMG_FRAC budget, leak on, par gear), bossLevelHitMult
  // 0.9 -> 0.71 (Beginner Willow first-try clear, 1000 seeds, inside the PO window 75-90% under BOTH bot gimmick models:
  // free reading ~88%, realistic reading ~77%).
  2: {
    encHpMult: 1.1,
    hitMult: 1.05,
    bossLevelHitMult: 0.71,
    gruntAttackPower: 1.07,
    eliteAttackPower: 1.25,
    bossAttackPower: 1.3,
    bossAddsAttackPower: 1.25,
  },
};

/** Throws on a chapter with no row (no silent fallback to Ch1 numbers). */
export function knobsFor(chapter: number): ChapterKnobs {
  const k = CHAPTER_KNOBS[chapter];
  if (k === undefined) throw new Error(`knobsFor: no CHAPTER_KNOBS row for chapter ${chapter}`);
  return k;
}

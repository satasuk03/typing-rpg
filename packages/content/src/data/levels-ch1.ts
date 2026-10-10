import type { Biome, EncounterDef, EnemyRef, Gimmick, Segment, StarChallenge } from "../schemas.ts";
import { LevelDef } from "../schemas.ts";
import { knobsFor } from "./knobs.ts";

/**
 * Chapter 1 levels. Ids, names, biomes, encounter counts, slot counts and waves follow the world layouts in
 * apps/game/src/assets/levels/ch1-lNN.json (tools/content checks this).
 *
 * Numbers (docs/brainstorm/02 section 4 + sim/economy_sim.py level_spec, tier mix per doc 01 5.1):
 *  - encounter hp  = ENC_TTK_S (36 s) x reference DPS x (1 + 0.02 (p-1)): 199.4 at L1 up to 231.3 at L9 (sim table: 199-231).
 *    L10 is the boss level: the sim has one add wave (235) plus the boss encounter; the layout has 5 pre-boss waves, so the
 *    wave pools are 75 and 65 (total 345 vs the sim's 235 + 118 for the adds).
 *  - gruntHit      = solved per level so that the whole level costs the reference typist (35 WPM, 92%, par gear) the same
 *    damage the sim budgets (DMG_FRAC 0.40 x par HP x saw). The layouts hold more enemies than the sim's 2-encounter
 *    pattern, so the per-hit value is lower than the sim table (3.9-7.6 vs 8.1-9.8). T6.1 scales them by HIT_MULT below.
 *  - T6.1: normal levels (L1-L9) use hp() / hit() / parRef(): the authored analytic values above times the global knobs
 *    ENC_HP_MULT / HIT_MULT, measured on the real sim (docs/balance-ch1.md, `pnpm balance`). L10 keeps its authored values.
 *  - parRefS       = the 35-WPM reference typist's active time: sum of encounter HP / reference DPS (5.54 HP/s) + 2 s intro per wave
 *    (+ boss HP, 2.5 Doom Spells of ~50 chars at 2.4 chars/s, the finisher and the intro on L10).
 *  - plateLength   = wide enough that every biome pool stays feasible (T4.1: biome words reach 6-10 letters; the bands are
 *    3-5 on the tutorial, 3-6 or 3-7 after, and every band keeps >= 12 distinct first letters in each biome).
 *  - star3         = the rotating third-star challenge (doc 01 6.3); par time scales with the player's own pace.
 */

const ms = (g?: Gimmick): EnemyRef => ref("moss-slime", g);
const mu = (g?: Gimmick): EnemyRef => ref("murk-slime", g);
const bt = (g?: Gimmick): EnemyRef => ref("cave-bat", g);
const gs = (g?: Gimmick): EnemyRef => ref("goblin-scout", g);
const gr = (g?: Gimmick): EnemyRef => ref("goblin-raider", g);
function ref(enemy: string, gimmick?: Gimmick): EnemyRef {
  return gimmick === undefined ? { enemy } : { enemy, gimmick };
}

/**
 * T6.1 knob: x encounter HP of the normal levels. The authored pools give economy_sim's reference typist a 36 s x saw
 * time-to-kill on the ANALYTIC model; on the real sim (weakness x1.3, shield BREAK x1.8, parry counters, Clean Cut crits:
 * PO 2026-10-09 "keep them, retune HP") the same typist kills ~20% faster. 1.2 restores the authored TTK on average over
 * L1-L9 (and ~11-12 auto-attacks per encounter at 35 WPM, plan §9).
 */
export const ENC_HP_MULT = knobsFor(1).encHpMult; // 1.2 (pinned in knobs.ts CHAPTER_KNOBS[1])
/**
 * T6.1 knob: x grunt hit of the normal levels, solved on the real sim (`pnpm --filter @hd2d/balance solve-hits --global`)
 * so that the reference typist with a build economy_sim can model (no Aegis, no Iron Will: its guard has no barrier and
 * blocks take 20%) takes the authored budget, DMG_FRAC 0.40 x par HP x (1 + 0.025 (p-1)) per level, summed over L1-L9.
 * The starter kit's Aegis and Iron Will then show up as damage below the budget, which is their value.
 */
export const HIT_MULT = knobsFor(1).hitMult; // 1.34
/**
 * T6.1 knob (PO 2026-10-09 "add some risk"): x every hit of the boss level L10 (its waves' gruntHit, which the phase-1 adds
 * also use, and the Ruin Golem's hit in bosses.ts). With the weaker starter kit (Aegis 12 / 1 barrier, Iron Will 0.15) the
 * 20 WPM Beginner's first-try boss clear lands at ~85% (target 80-90%); the Aegis/Iron Will knobs alone cannot get there
 * (even no Aegis at all gives ~96%).
 */
export const BOSS_LEVEL_HIT_MULT = knobsFor(1).bossLevelHitMult; // 1.15 // v1.9: 1.3 -> 1.15 pays for the Ruin Golem and L10 adds guard leak (doc suggested 1.235; the measured 86% needs 1.15, see balance-ch1.md)
/** v1.9 guard leak: Attack Power P (x par armor) of the Ruin Golem and its phase-1 adds: 20% leak at par gear, 3% at +3, 0 at +5. */
export const BOSS_ATTACK_POWER = knobsFor(1).bossAttackPower; // 1.25
const r1 = (x: number): number => Math.round(x * 100) / 100;
/** L10 hits: authored value x BOSS_LEVEL_HIT_MULT. */
export const bossLevelHit = (authored: number): number => r1(authored * BOSS_LEVEL_HIT_MULT);
const hp = (authored: number): number => r1(authored * ENC_HP_MULT);
const hit = (authored: number): number => r1(authored * HIT_MULT);
/** parRefS from the authored value: its HP part (sum HP / 5.54 HP/s) scales with ENC_HP_MULT, the 2 s wave intros do not. */
const parRef = (authored: number, waves: number): number =>
  Math.round(((authored - 2 * waves) * ENC_HP_MULT + 2 * waves) * 10) / 10;

const walk = (first: boolean): Segment => ({
  kind: "walk",
  seconds: first ? 7 : 8, // BALANCE.LEVEL_INTRO_S 7 for the opening walk, WALK_S 8 between fights
  heal: !first,
});
const enc = (name: string, hp: number, gruntHit: number, ...waves: EnemyRef[][]): Segment => ({
  kind: "encounter",
  encounter: {
    name,
    hp,
    gruntHit,
    attackPower: knobsFor(1).gruntAttackPower,
    waves,
  } satisfies EncounterDef,
});

/** walk, enc, walk, enc, ... (heal on every walk after the first). */
function chain(encounters: Segment[], tail?: Segment): Segment[] {
  const out: Segment[] = [];
  encounters.forEach((e, i) => {
    out.push(walk(i === 0), e);
  });
  if (tail) out.push(walk(false), tail);
  return out;
}

interface Spec {
  index: number;
  name: string;
  biome: Biome;
  plateLength: [number, number];
  segments: Segment[];
  star3: StarChallenge;
  parRefS: number;
  tutorial?: boolean;
  kind?: "normal" | "boss";
}

function level(s: Spec): LevelDef {
  const id = `ch1-l${String(s.index).padStart(2, "0")}`;
  return LevelDef.parse({
    id,
    chapter: 1,
    index: s.index,
    name: s.name,
    biome: s.biome,
    layoutId: id,
    kind: s.kind ?? "normal",
    wordTier: 1,
    tierMix: { current: 60, review: 20, biome: 15, weak: 5 },
    plateLength: s.plateLength,
    segments: s.segments,
    star3: s.star3,
    parRefS: s.parRefS,
    tutorial: s.tutorial ?? false,
  });
}

export const LEVELS_CH1: LevelDef[] = [
  // L1: tutorial. 2 encounters (2 + 3 slots). Gentle streak goal.
  level({
    index: 1,
    name: "Sunlit Glade",
    biome: "forest",
    plateLength: [3, 5],
    tutorial: true,
    parRefS: parRef(76, 2),
    star3: { kind: "streak", combo: 8 },
    segments: chain([
      enc("Glade Path", hp(199.4), hit(7.6), [ms(), ms()]),
      enc("Mossy Clearing", hp(199.4), hit(7.6), [ms(), mu(), ms()]),
    ]),
  }),
  // L2: 2 encounters (3 + 3). Bats arrive.
  level({
    index: 2,
    name: "Whispering Wood",
    biome: "forest",
    plateLength: [3, 6],
    parRefS: parRef(77.4, 2),
    star3: { kind: "parTime", slack: 1.2 },
    segments: chain([
      enc("Mushroom Hollow", hp(203.4), hit(6.88), [ms(), mu(), ms()]),
      enc("Firefly Bend", hp(203.4), hit(6.88), [mu(), bt(), ms()]),
    ]),
  }),
  // L3: first 3-encounter level.
  level({
    index: 3,
    name: "Amber Edge",
    biome: "forest",
    plateLength: [3, 6],
    parRefS: parRef(118.3, 3),
    star3: { kind: "untouched", maxHits: 4 },
    segments: chain([
      enc("Fallen Leaves", hp(207.4), hit(3.95), [ms(), bt(), mu()]),
      enc("Hollow Log", hp(207.4), hit(3.95), [mu(), ms(), bt()]),
      enc("Broken Columns", hp(207.4), hit(3.95), [bt(), mu(), ms()]),
    ]),
  }),
  // L4: ruins. Goblin Scouts arrive; the Fading word debuts alone in encounter 2.
  level({
    index: 4,
    name: "Ember Gate",
    biome: "ruins",
    plateLength: [3, 6],
    parRefS: parRef(120.5, 3),
    star3: { kind: "guardian", parries: 3 },
    segments: chain([
      enc("Torch Line", hp(211.3), hit(4.46), [ms(), gs(), bt()]),
      enc("The Fading Sign", hp(211.3), hit(4.46), [bt(), gs("fading"), mu()]),
      enc("Gatehouse Yard", hp(211.3), hit(4.46), [gs(), bt(), gs()]),
    ]),
  }),
  // L5: Goblin Raider (Brute) debuts in encounter 3.
  level({
    index: 5,
    name: "Overgrown Court",
    biome: "ruins",
    plateLength: [3, 6],
    parRefS: parRef(122.6, 3),
    star3: { kind: "streak", combo: 15 },
    segments: chain([
      enc("Ivy Arches", hp(215.3), hit(4.48), [mu(), gs(), ms()]),
      enc("Fountain Steps", hp(215.3), hit(4.48), [gs(), bt(), mu("fading")]),
      enc("Raider Camp", hp(215.3), hit(4.48), [gr(), bt(), ms()]),
    ]),
  }),
  // L6: the Scrambled word debuts alone in encounter 2.
  level({
    index: 6,
    name: "Moonlit Colonnade",
    biome: "ruins",
    plateLength: [3, 7],
    parRefS: parRef(124.8, 3),
    star3: { kind: "noSkills" },
    segments: chain([
      enc("Pillar Walk", hp(219.3), hit(3.85), [gs(), bt(), ms()]),
      enc("Whispering Stones", hp(219.3), hit(3.85), [mu(), gs("scrambled"), bt()]),
      enc("Torchlit Hall", hp(219.3), hit(3.85), [gr(), ms(), bt()]),
    ]),
  }),
  // L7: both gimmicks in the level, never in the same encounter yet.
  level({
    index: 7,
    name: "The Descent",
    biome: "ruins",
    plateLength: [3, 7],
    parRefS: parRef(127, 3),
    star3: { kind: "parTime", slack: 1.1 },
    segments: chain([
      enc("Last Columns", hp(223.3), hit(4.46), [gs(), gr(), bt()]),
      enc("Stair of Fading", hp(223.3), hit(4.46), [gs("fading"), bt(), mu()]),
      enc("Cave Mouth", hp(223.3), hit(4.46), [gr(), gs("scrambled"), bt()]),
    ]),
  }),
  // L8: cave. First encounter with both gimmicks together (the encounter limit is 2 distinct gimmicks).
  level({
    index: 8,
    name: "Crystal Gallery",
    biome: "cave",
    plateLength: [3, 6],
    parRefS: parRef(129.1, 3),
    star3: { kind: "guardian", parries: 5 },
    segments: chain([
      enc("Glow Shelf", hp(227.3), hit(4.96), [bt(), mu(), bt()]),
      enc("Crystal Vault", hp(227.3), hit(4.96), [gs("fading"), bt("scrambled"), gr()]),
      enc("Echo Chamber", hp(227.3), hit(4.96), [gr(), bt(), mu()]),
    ]),
  }),
  // L9: the hardest normal level (sim: L9 = 1.45x L1 in HP x hit).
  level({
    index: 9,
    name: "Fungal Warren",
    biome: "cave",
    plateLength: [3, 7],
    parRefS: parRef(131.3, 3),
    star3: { kind: "untouched", maxHits: 3 },
    segments: chain([
      enc("Spore Run", hp(231.3), hit(4.18), [mu(), ms(), gs()]),
      enc("Mushroom Maze", hp(231.3), hit(4.18), [bt("scrambled"), gr(), ms("fading")]),
      enc("Drip Gallery", hp(231.3), hit(4.18), [gs("fading"), gr(), bt("scrambled")]),
    ]),
  }),
  // L10: boss level. Layout: 2 waves, 3 waves, then the Ruin Golem.
  level({
    index: 10,
    name: "Golem Hollow",
    biome: "hollow",
    kind: "boss",
    plateLength: [3, 7],
    parRefS: 295.5,
    star3: { kind: "guardian", parries: 6 },
    segments: chain(
      [
        enc("Approach Cave", 75, bossLevelHit(5.28), [gs(), mu()], [gr(), bt(), ms()]),
        enc(
          "Rune Ring",
          65,
          bossLevelHit(5.28),
          [bt(), bt(), mu()],
          [gs(), gs(), bt()],
          [gr(), gs("fading"), mu("scrambled")],
        ),
      ],
      { kind: "boss", bossId: "ruin-golem" },
    ),
  }),
];

/** The reference pace the par times are authored for (BALANCE.PACE_REF / REF_WPM at chapter 1). */
export const CH1_REF_WPM = 35;

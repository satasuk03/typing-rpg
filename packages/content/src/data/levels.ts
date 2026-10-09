import type { Biome, EncounterDef, EnemyRef, Gimmick, Segment, StarChallenge } from "../schemas.ts";
import { LevelDef } from "../schemas.ts";

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
 *    pattern, so the per-hit value is lower than the sim table (3.9-7.6 vs 8.1-9.8). T6.1 retunes.
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

const walk = (first: boolean): Segment => ({
  kind: "walk",
  seconds: first ? 7 : 8, // BALANCE.LEVEL_INTRO_S 7 for the opening walk, WALK_S 8 between fights
  heal: !first,
});
const enc = (name: string, hp: number, gruntHit: number, ...waves: EnemyRef[][]): Segment => ({
  kind: "encounter",
  encounter: { name, hp, gruntHit, waves } satisfies EncounterDef,
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

export const LEVELS: LevelDef[] = [
  // L1: tutorial. 2 encounters (2 + 3 slots). Gentle streak goal.
  level({
    index: 1,
    name: "Sunlit Glade",
    biome: "forest",
    plateLength: [3, 5],
    tutorial: true,
    parRefS: 76,
    star3: { kind: "streak", combo: 8 },
    segments: chain([
      enc("Glade Path", 199.4, 7.6, [ms(), ms()]),
      enc("Mossy Clearing", 199.4, 7.6, [ms(), mu(), ms()]),
    ]),
  }),
  // L2: 2 encounters (3 + 3). Bats arrive.
  level({
    index: 2,
    name: "Whispering Wood",
    biome: "forest",
    plateLength: [3, 6],
    parRefS: 77.4,
    star3: { kind: "parTime", slack: 1.2 },
    segments: chain([
      enc("Mushroom Hollow", 203.4, 6.88, [ms(), mu(), ms()]),
      enc("Firefly Bend", 203.4, 6.88, [mu(), bt(), ms()]),
    ]),
  }),
  // L3: first 3-encounter level.
  level({
    index: 3,
    name: "Amber Edge",
    biome: "forest",
    plateLength: [3, 6],
    parRefS: 118.3,
    star3: { kind: "untouched", maxHits: 4 },
    segments: chain([
      enc("Fallen Leaves", 207.4, 3.95, [ms(), bt(), mu()]),
      enc("Hollow Log", 207.4, 3.95, [mu(), ms(), bt()]),
      enc("Broken Columns", 207.4, 3.95, [bt(), mu(), ms()]),
    ]),
  }),
  // L4: ruins. Goblin Scouts arrive; the Fading word debuts alone in encounter 2.
  level({
    index: 4,
    name: "Ember Gate",
    biome: "ruins",
    plateLength: [3, 6],
    parRefS: 120.5,
    star3: { kind: "guardian", parries: 3 },
    segments: chain([
      enc("Torch Line", 211.3, 4.46, [ms(), gs(), bt()]),
      enc("The Fading Sign", 211.3, 4.46, [bt(), gs("fading"), mu()]),
      enc("Gatehouse Yard", 211.3, 4.46, [gs(), bt(), gs()]),
    ]),
  }),
  // L5: Goblin Raider (Brute) debuts in encounter 3.
  level({
    index: 5,
    name: "Overgrown Court",
    biome: "ruins",
    plateLength: [3, 6],
    parRefS: 122.6,
    star3: { kind: "streak", combo: 15 },
    segments: chain([
      enc("Ivy Arches", 215.3, 4.48, [mu(), gs(), ms()]),
      enc("Fountain Steps", 215.3, 4.48, [gs(), bt(), mu("fading")]),
      enc("Raider Camp", 215.3, 4.48, [gr(), bt(), ms()]),
    ]),
  }),
  // L6: the Scrambled word debuts alone in encounter 2.
  level({
    index: 6,
    name: "Moonlit Colonnade",
    biome: "ruins",
    plateLength: [3, 7],
    parRefS: 124.8,
    star3: { kind: "noSkills" },
    segments: chain([
      enc("Pillar Walk", 219.3, 3.85, [gs(), bt(), ms()]),
      enc("Whispering Stones", 219.3, 3.85, [mu(), gs("scrambled"), bt()]),
      enc("Torchlit Hall", 219.3, 3.85, [gr(), ms(), bt()]),
    ]),
  }),
  // L7: both gimmicks in the level, never in the same encounter yet.
  level({
    index: 7,
    name: "The Descent",
    biome: "ruins",
    plateLength: [3, 7],
    parRefS: 127,
    star3: { kind: "parTime", slack: 1.1 },
    segments: chain([
      enc("Last Columns", 223.3, 4.46, [gs(), gr(), bt()]),
      enc("Stair of Fading", 223.3, 4.46, [gs("fading"), bt(), mu()]),
      enc("Cave Mouth", 223.3, 4.46, [gr(), gs("scrambled"), bt()]),
    ]),
  }),
  // L8: cave. First encounter with both gimmicks together (the encounter limit is 2 distinct gimmicks).
  level({
    index: 8,
    name: "Crystal Gallery",
    biome: "cave",
    plateLength: [3, 6],
    parRefS: 129.1,
    star3: { kind: "guardian", parries: 5 },
    segments: chain([
      enc("Glow Shelf", 227.3, 4.96, [bt(), mu(), bt()]),
      enc("Crystal Vault", 227.3, 4.96, [gs("fading"), bt("scrambled"), gr()]),
      enc("Echo Chamber", 227.3, 4.96, [gr(), bt(), mu()]),
    ]),
  }),
  // L9: the hardest normal level (sim: L9 = 1.45x L1 in HP x hit).
  level({
    index: 9,
    name: "Fungal Warren",
    biome: "cave",
    plateLength: [3, 7],
    parRefS: 131.3,
    star3: { kind: "untouched", maxHits: 3 },
    segments: chain([
      enc("Spore Run", 231.3, 4.18, [mu(), ms(), gs()]),
      enc("Mushroom Maze", 231.3, 4.18, [bt("scrambled"), gr(), ms("fading")]),
      enc("Drip Gallery", 231.3, 4.18, [gs("fading"), gr(), bt("scrambled")]),
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
        enc("Approach Cave", 75, 5.28, [gs(), mu()], [gr(), bt(), ms()]),
        enc(
          "Rune Ring",
          65,
          5.28,
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

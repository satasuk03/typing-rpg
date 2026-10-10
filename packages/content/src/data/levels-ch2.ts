import type { Biome, EncounterDef, EnemyRef, Gimmick, Segment, StarChallenge } from "../schemas.ts";
import { LevelDef } from "../schemas.ts";
import { knobsFor } from "./knobs.ts";

/**
 * Chapter 2 levels "The Hushwood" (CH2_PLAN 3.1). Ids, names, biomes, encounter counts, wave counts and slot counts follow the
 * world layouts apps/game/src/assets/levels/ch2-lNN.json (tools/content checks this). Chapter 2 has no stubs any more.
 *
 * Authored numbers (plan 4.1, docs/brainstorm/02 section 4 at the Ch2 par build T1/1/1 Common +2):
 *  - encounter hp = 244 at L1 .. 284 at L9, +5 per level (the same 36 s time-to-kill as Ch1: the par DPS is 1.22x higher).
 *  - gruntHit     = the Ch1 per-level authored hit (same encounter structure) x 1.6 (= the damage budget ratio
 *    DMG_FRAC 0.525 x par HP 121.7 / (0.40 x 100)), then x HIT_MULT of knobsFor(2). Placeholders: T5.1 re-solves them on the real
 *    sim WITH the guard leak on (plan 4.3).
 *  - parRefS      = sum of encounter HP / 6.78 HP/s (the Ch2 reference DPS) + 2 s per wave, HP part x ENC_HP_MULT of Ch2.
 *  - L10: two outer waves (3 slots each) then the Whispering Willow (boss arena slot 0, adds in slots 1-3).
 *  - grunts carry the encounter attackPower (P 1.07); Gloom Wolf refs are `elite` with attackPower P 1.25 (knobs.ts).
 *  - reviewBiomes: the Ch1 biome words (forest, ruins, cave) are the review tier (plan 3.1).
 * Debut beats follow plan 3.1: each new thing debuts alone with a banner (healer L2, elite L4, brute L5).
 */
const k = knobsFor(2);

function ref(enemy: string, gimmick?: Gimmick): EnemyRef {
  return gimmick === undefined ? { enemy } : { enemy, gimmick };
}
const wi = (g?: Gimmick): EnemyRef => ref("lantern-wisp", g);
const sh = (g?: Gimmick): EnemyRef => ref("hush-shade", g);
const mo = (): EnemyRef => ref("moth-mender");
const to = (g?: Gimmick): EnemyRef => ref("mire-toad", g);
const mu = (): EnemyRef => ref("murk-slime");
const bt = (): EnemyRef => ref("cave-bat");
/** Gloom Wolf: the elite (name tag, P 1.25). */
const wo = (): EnemyRef => {
  const p = k.eliteAttackPower;
  if (p === null) throw new Error("knobsFor(2) has no elite attack power");
  return { enemy: "gloom-wolf", attackPower: p, elite: true };
};

const r1 = (x: number): number => Math.round(x * 100) / 100;
const hp = (authored: number): number => r1(authored * k.encHpMult);
const hit = (authored: number): number => r1(authored * 1.6 * k.hitMult);
const bossHit = (authored: number): number => r1(authored * 1.6 * k.bossLevelHitMult);
/** Reference DPS at the Ch2 par build (HP 244 / 36 s TTK). */
const REF_DPS = 6.78;
const parRef = (encounterHp: number[], waves: number): number =>
  Math.round(((encounterHp.reduce((a, b) => a + b, 0) / REF_DPS) * k.encHpMult + 2 * waves) * 10) /
  10;

const walk = (first: boolean): Segment => ({
  kind: "walk",
  seconds: first ? 7 : 8,
  heal: !first,
});
const enc = (name: string, hpPool: number, gruntHit: number, ...waves: EnemyRef[][]): Segment => ({
  kind: "encounter",
  encounter: {
    name,
    hp: hpPool,
    gruntHit,
    attackPower: k.gruntAttackPower,
    waves,
  } satisfies EncounterDef,
});
function chain(encounters: Segment[], tail?: Segment): Segment[] {
  const out: Segment[] = [];
  encounters.forEach((e, i) => {
    out.push(walk(i === 0), e);
  });
  if (tail) out.push(walk(false), tail);
  return out;
}

/** Authored encounter HP of Ln (1..9): 244 + 5 (n - 1). */
const encHp = (n: number): number => 244 + 5 * (n - 1);
/** Ch1 per-level authored grunt hit (levels-ch1.ts), the structural base of the Ch2 values. */
const BASE_HIT = [7.6, 6.88, 3.95, 4.46, 4.48, 3.85, 4.46, 4.96, 4.18] as const;
const H = (n: number): number => hit(BASE_HIT[n - 1] as number);
const E = (n: number): number => hp(encHp(n));
const P = (n: number, encounters: number): number =>
  parRef(
    Array.from({ length: encounters }, () => encHp(n)),
    encounters,
  );

interface Spec {
  index: number;
  name: string;
  biome: Biome;
  plateLength: [number, number];
  segments: Segment[];
  star3: StarChallenge;
  parRefS: number;
  kind?: "normal" | "boss";
}

function level(s: Spec): LevelDef {
  const id = `ch2-l${String(s.index).padStart(2, "0")}`;
  return LevelDef.parse({
    id,
    chapter: 2,
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
    tutorial: false,
    reviewBiomes: ["forest", "ruins", "cave"],
  });
}

export const LEVELS_CH2: LevelDef[] = [
  // L1: the sawtooth dip. 2 encounters (2 + 3 slots). The typed intro card (Shift lesson) is the app's; wisps and shades meet gently.
  level({
    index: 1,
    name: "Moonward Trail",
    biome: "hushwood",
    plateLength: [3, 5],
    parRefS: P(1, 2),
    star3: { kind: "streak", combo: 10 },
    segments: chain([
      enc("Moonlit Gate", E(1), H(1), [wi(), mu()]),
      enc("Lantern Bend", E(1), H(1), [wi(), sh(), bt()]),
    ]),
  }),
  // L2: the Moth Mender debuts alone in encounter 2 (healer banner, "kill the Mender first").
  level({
    index: 2,
    name: "Lantern Path",
    biome: "hushwood",
    plateLength: [3, 6],
    parRefS: P(2, 2),
    star3: { kind: "parTime", slack: 1.2 },
    segments: chain([
      enc("Hanging Lights", E(2), H(2), [wi(), sh(), mu()]),
      enc("The Mender's Perch", E(2), H(2), [mo(), wi(), sh()]),
    ]),
  }),
  // L3: Fading review (the Shade carries it in encounter 2).
  level({
    index: 3,
    name: "Hollow Oaks",
    biome: "hushwood",
    plateLength: [3, 6],
    parRefS: P(3, 3),
    star3: { kind: "untouched", maxHits: 4 },
    segments: chain([
      enc("Root Arch", E(3), H(3), [wi(), bt(), mu()]),
      enc("Fading Hollow", E(3), H(3), [sh("fading"), wi(), mo()]),
      enc("Mushroom Ring", E(3), H(3), [sh(), bt(), wi()]),
    ]),
  }),
  // L4: the Gloom Wolf (elite) debuts alone as the last encounter. Banner: "Armor below this foe's power".
  level({
    index: 4,
    name: "Owl's Rest",
    biome: "hushwood",
    plateLength: [3, 6],
    parRefS: P(4, 3),
    star3: { kind: "guardian", parries: 4 },
    segments: chain([
      enc("Moss Curtain", E(4), H(4), [wi(), sh(), mo()]),
      enc("Waystone Clearing", E(4), H(4), [sh(), wi(), bt()]),
      enc("The Howling Roost", E(4), H(4), [wo(), sh(), wi()]),
    ]),
  }),
  // L5: the Mire Toad (brute) debuts in encounter 3.
  level({
    index: 5,
    name: "Mirewater Edge",
    biome: "fen",
    plateLength: [3, 6],
    parRefS: P(5, 3),
    star3: { kind: "streak", combo: 15 },
    segments: chain([
      enc("Reed Boardwalk", E(5), H(5), [sh(), wi(), mu()]),
      enc("Lily Shallows", E(5), H(5), [mo(), wi(), sh()]),
      enc("Toad Hollow", E(5), H(5), [to(), wi(), sh()]),
    ]),
  }),
  // L6: Healer + gimmick: encounter 2 pairs the Mender with a Scrambled Wisp.
  level({
    index: 6,
    name: "Sunken Shrine",
    biome: "fen",
    plateLength: [3, 7],
    parRefS: P(6, 3),
    star3: { kind: "noSkills" },
    segments: chain([
      enc("Drowned Steps", E(6), H(6), [wi(), sh(), bt()]),
      enc("Whispering Columns", E(6), H(6), [mo(), wi("scrambled"), sh()]),
      enc("Shrine Floor", E(6), H(6), [to(), sh(), wi()]),
    ]),
  }),
  // L7: both gimmicks in the level, never in the same encounter; the Wolf closes it.
  level({
    index: 7,
    name: "Reedmaze",
    biome: "fen",
    plateLength: [3, 7],
    parRefS: P(7, 3),
    star3: { kind: "parTime", slack: 1.1 },
    segments: chain([
      enc("Tall Reeds", E(7), H(7), [sh("fading"), wi(), to()]),
      enc("Crooked Turn", E(7), H(7), [wi("scrambled"), mo(), sh()]),
      enc("Maze Heart", E(7), H(7), [wo(), sh(), wi()]),
    ]),
  }),
  // L8: peak gimmick density: encounter 2 has both gimmicks (the limit is 2) plus a Mender in 4 slots.
  level({
    index: 8,
    name: "Firefly Crossing",
    biome: "fen",
    plateLength: [3, 7],
    parRefS: P(8, 3),
    star3: { kind: "guardian", parries: 5 },
    segments: chain([
      enc("Stilt Lanterns", E(8), H(8), [wi(), sh(), to()]),
      enc("Firefly Swarm", E(8), H(8), [mo(), sh("fading"), wi("scrambled"), to()]),
      enc("Far Bank", E(8), H(8), [to(), wi(), mo()]),
    ]),
  }),
  // L9: the hardest normal level, two elites across the level.
  level({
    index: 9,
    name: "Weeping Reach",
    biome: "fen",
    plateLength: [3, 8],
    parRefS: P(9, 3),
    star3: { kind: "untouched", maxHits: 3 },
    segments: chain([
      enc("Sunken Boughs", E(9), H(9), [sh("fading"), to(), wi()]),
      enc("Weeping Pool", E(9), H(9), [wo(), sh("fading"), wi("scrambled")]),
      enc("The Last Reed", E(9), H(9), [wo(), to(), mo(), sh()]),
    ]),
  }),
  // L10: boss level. Layout: wave (wisp, shade, mender), wave (wolf, toad, shade fading), then the Willow.
  level({
    index: 10,
    name: "Willow's Heart",
    biome: "grove",
    kind: "boss",
    plateLength: [3, 8],
    parRefS: 296,
    star3: { kind: "guardian", parries: 6 },
    segments: chain(
      [
        enc("Outer Grove", 205, bossHit(5.28), [wi(), sh(), mo()]),
        enc("Lantern Ring", 215, bossHit(5.28), [wo(), to(), sh("fading")]),
      ],
      { kind: "boss", bossId: "whispering-willow" },
    ),
  }),
];

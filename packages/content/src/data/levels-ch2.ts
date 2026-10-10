import type { EnemyRef, Segment } from "../schemas.ts";
import { LevelDef } from "../schemas.ts";
import { knobsFor } from "./knobs.ts";

/**
 * Chapter 2 levels.
 *
 * LEVELS_CH2 is EMPTY until T4.3 authors the real Hushwood levels (plan §3.1) together with their world layouts
 * (apps/game/src/assets/levels/ch2-lNN.json). Until then the shipped bundle stays Ch1-only, so `tools/content validate`
 * (which wants a layout per level) and the game map are unaffected.
 *
 * CH2_STUB_LEVELS are PLACEHOLDERS (T1.1) so `pnpm balance --chapter 2` and `pnpm bot --chapter 2` have something to run:
 * Ch1 enemies only, a flat 244 -> 284 HP ramp (plan §4.1), the Ch2 knob table (placeholder multipliers until T5.1) and
 * the Ch2 grunt Attack Power. L10 is a plain 3-encounter level, NOT the Willow: the riddle boss is T1.3/T4.3. They are
 * only ever added to a bundle by the tools (`withCh2Stubs`), never shipped. Delete them when T4.3 lands.
 */
export const LEVELS_CH2: LevelDef[] = [];

const k = knobsFor(2);
const r1 = (x: number): number => Math.round(x * 100) / 100;
const ref = (enemy: string): EnemyRef => ({ enemy });

const STUB_BIOME = [
  "hushwood",
  "hushwood",
  "hushwood",
  "hushwood",
  "fen",
  "fen",
  "fen",
  "fen",
  "fen",
  "grove",
] as const;
const STUB_POOLS: EnemyRef[][] = [
  [ref("moss-slime"), ref("cave-bat")],
  [ref("murk-slime"), ref("cave-bat"), ref("moss-slime")],
  [ref("goblin-scout"), ref("cave-bat"), ref("murk-slime")],
  [ref("goblin-raider"), ref("cave-bat"), ref("goblin-scout")],
];

function stubLevel(index: number): LevelDef {
  const id = `ch2-l${String(index).padStart(2, "0")}`;
  const n = index <= 2 ? 2 : 3;
  const authoredHp = 244 + (40 * (index - 1)) / 8; // 244 at L1 .. 284 at L9 (L10 reuses the L9 value)
  const hp = r1(Math.min(authoredHp, 284) * k.encHpMult);
  const gruntHit = r1(4.5 * (index === 10 ? k.bossLevelHitMult : k.hitMult));
  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    segments.push({ kind: "walk", seconds: i === 0 ? 7 : 8, heal: i !== 0 });
    segments.push({
      kind: "encounter",
      encounter: {
        name: `Stub ${index}-${i + 1}`,
        hp,
        gruntHit,
        attackPower: k.gruntAttackPower,
        waves: [STUB_POOLS[(index + i) % STUB_POOLS.length] as EnemyRef[]],
      },
    });
  }
  return LevelDef.parse({
    id,
    chapter: 2,
    index,
    name: `Ch2 stub ${index}`,
    biome: STUB_BIOME[index - 1],
    layoutId: id,
    kind: "normal",
    wordTier: 1,
    tierMix: { current: 60, review: 20, biome: 15, weak: 5 },
    plateLength: index === 1 ? [3, 5] : index < 5 ? [3, 6] : index < 9 ? [3, 7] : [3, 8],
    segments,
    star3: { kind: "streak", combo: 10 },
    parRefS: Math.round(((n * hp) / 5.54 + 2 * n + 8 * n) * 10) / 10,
    tutorial: false,
    reviewBiomes: ["forest", "ruins", "cave"],
  });
}

/** Placeholder Ch2 levels ch2-l01..ch2-l10 for the tools (see the file header). Not part of the shipped bundle. */
export const CH2_STUB_LEVELS: LevelDef[] = Array.from({ length: 10 }, (_, i) => stubLevel(i + 1));

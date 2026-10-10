// A self-contained prologue ("The Unwriting") fixture for the sim tests, the golden replay and the Chromium parity bundle (P1.1).
// P1.2 writes the real packages/content/src/data/prologue.ts; every number and word here is a test placeholder, and the bundle
// is built by spreading contentBundle and OVERRIDING prologue / the Nul rows, so the real data can land without touching tests.
// Pure and deterministic (no wall clock, no Math.random).
import { BossDef, type ContentBundle, contentBundle, EnemyDef, PrologueDef } from "@hd2d/content";
import {
  applyInput,
  below,
  createLevel,
  deriveRng,
  getView,
  type LevelOptions,
  type LevelState,
  type Loadout,
  prologueRunConfig,
  type ResolvedLevel,
  resolvePrologue,
  type SimEvent,
  type SimInput,
  step,
} from "../src/index.ts";

const WORDS = [
  "ash",
  "bay",
  "cove",
  "dawn",
  "echo",
  "fog",
  "glen",
  "hush",
  "isle",
  "jet",
  "keep",
  "lark",
  "mire",
  "nook",
  "opal",
  "peak",
  "quay",
  "reed",
  "silk",
  "tarn",
  "umber",
  "veil",
  "wren",
  "yarn",
  "zinc",
  "arch",
  "bone",
  "crow",
  "dusk",
  "elm",
  "fern",
  "gale",
  "hawk",
  "iris",
  "jade",
  "kelp",
  "loom",
  "moth",
  "nest",
  "onyx",
  "pine",
  "rust",
];
const GUARD = [
  "bar",
  "cap",
  "dig",
  "end",
  "fin",
  "gap",
  "hit",
  "ice",
  "jab",
  "key",
  "log",
  "map",
  "net",
];

const enemy = (over: Record<string, unknown>) =>
  EnemyDef.parse({
    name: "x",
    spriteId: "x",
    baseIntervalS: 9,
    plateLength: [3, 5],
    weaknesses: ["slash"],
    shield: 1,
    ...over,
  });

export const NUL_ENEMY = enemy({
  id: "nul",
  name: "Nul",
  archetype: "boss",
  spriteId: "nul",
  baseIntervalS: 10,
  heavy: true,
});
const PGRUNT = enemy({ id: "pgrunt", archetype: "grunt", baseIntervalS: 8 });
const PWISP = enemy({
  id: "pwisp",
  archetype: "speedster",
  baseIntervalS: 5,
  weaknesses: ["fire"],
});

export const nulBoss = (hit = 18): BossDef =>
  BossDef.parse({
    id: "nul",
    name: "Nul",
    title: "The Silent King",
    enemyId: "nul",
    hp: 600,
    hit,
    plateLength: [3, 5],
    phase1: {
      endAtHpPct: 35,
      adds: [{ enemy: "pgrunt", gimmick: "fading" }, { enemy: "pwisp" }],
    },
    phase2: { endAtHpPct: 20, doomEveryS: 10, minDoomSpells: 1 }, // placeholders: unreachable on the prologue
    phase3: {
      minigame: {
        kind: "fallingRubble",
        lanes: 3,
        spawnEveryS: 2,
        fallS: 4,
        clearAtkMult: 2,
        missHit: 5,
      },
      finisherText: "the ink runs dry",
    },
  });
export const NUL_BOSS = nulBoss();

const KIT_ACTIVES = [
  { id: "fireball", startChargePct: 100 },
  { id: "aegis", startChargePct: 80 },
  { id: "slashWave", startChargePct: 60 },
  { id: "piercingThrust", startChargePct: 40 },
  { id: "mendingLight", startChargePct: 20 },
  { id: "frostLock", startChargePct: 0 },
] as const;
const KIT_PASSIVES = [
  "cleanCut",
  "bulwarkStreak",
  "steadyHands",
  "riposte",
  "ironWill",
  "openingGambit",
  "lastStand",
  "comeback",
  "calmMind",
] as const;

/** The plan's starting numbers (docs/PROLOGUE_PLAN.md §2.1) with small test HP pools. */
export function prologueDef(over: Record<string, unknown> = {}): PrologueDef {
  return PrologueDef.parse({
    id: "prologue",
    layoutId: "prologue",
    biome: "ruins",
    pace: 25,
    seed: 777,
    words: WORDS,
    guardWords: GUARD,
    segments: [
      { kind: "walk", seconds: 2, heal: false },
      {
        kind: "encounter",
        encounter: {
          name: "Ruined Gate",
          hp: 40,
          gruntHit: 10,
          waves: [[{ enemy: "pgrunt" }], [{ enemy: "pgrunt" }, { enemy: "pwisp" }]],
        },
      },
      { kind: "walk", seconds: 2, heal: false },
      { kind: "boss", bossId: "nul" },
    ],
    kit: { actives: [...KIT_ACTIVES], passives: [...KIT_PASSIVES] },
    gear: { archetype: "sword", tier: 3, rarity: "L", upgrade: 5 },
    chargeMult: 2.5,
    castGapS: 1.5,
    forceAfterS: 4,
    heroHpFloorPct: 25,
    surge: { encounterAfterS: 18, bossAfterS: 20, doubleEveryS: 4, maxMult: 16 },
    bossMinS: 12,
    ...over,
  });
}

/** contentBundle with the fixture prologue and Nul rows (and no dependency on P1.2's real data). */
export function prologueBundle(over: Record<string, unknown> = {}, bossHit = 18): ContentBundle {
  const base = contentBundle;
  const drop = new Set(["nul", "pgrunt", "pwisp"]);
  return {
    ...base,
    enemies: [...base.enemies.filter((e) => !drop.has(e.id)), NUL_ENEMY, PGRUNT, PWISP],
    bosses: [...base.bosses.filter((b) => b.id !== "nul"), nulBoss(bossHit)],
    prologue: prologueDef(over),
  };
}

export interface PrologueRun {
  def: ResolvedLevel;
  loadout: Loadout;
  seed: number;
  options: LevelOptions;
}
export function prologueRun(over: Record<string, unknown> = {}, bossHit = 18): PrologueRun {
  const cfg = prologueRunConfig(prologueBundle(over, bossHit));
  // the real bundle changes with every content edit: pin the version so state hashes (run.def is hashed) stay stable
  cfg.def.contentVersion = "prologue-fixture";
  return cfg;
}

// ---------------------------------------------------------------- a tiny scripted typist (reads getView only)

export type Typist = "perfect" | "typos" | "random" | "idle";

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

/**
 * Drives a prologue run through the public API and records the inputs. `everyTicks` = ticks between two keystrokes.
 * "perfect" types the next letter of the locked plate (or the first letter of the first word plate); "typos" always presses
 * a letter that matches nothing; "random" mixes both and an occasional Escape; "idle" presses nothing.
 */
export function playPrologue(
  run: PrologueRun,
  typist: Typist,
  opts: {
    everyTicks?: number;
    maxTicks?: number;
    seed?: number;
    onTick?: (s: LevelState, ev: SimEvent[]) => void;
  } = {},
): { state: LevelState; events: SimEvent[]; inputs: SimInput[] } {
  const every = opts.everyTicks ?? 10;
  const maxTicks = opts.maxTicks ?? 60 * 240;
  const state = createLevel(run.def, run.loadout, run.seed, run.options);
  const rng = deriveRng(opts.seed ?? run.seed, "meta", 0x9e);
  const events: SimEvent[] = [];
  const inputs: SimInput[] = [];
  for (let t = 0; t < maxTicks && state.phase !== "cleared" && state.phase !== "failed"; t++) {
    if (typist !== "idle" && t % every === 0 && state.phase === "combat") {
      const v = getView(state);
      const target = v.plates.find((p) => p.isTarget);
      const word =
        v.plates.find((p) => p.kind === "guard") ?? v.plates.find((p) => p.kind === "word");
      const next =
        target !== undefined ? target.text.charAt(target.typedIndex) : (word?.text.charAt(0) ?? "");
      const bad = (): string => {
        const used = new Set(
          target !== undefined ? [next] : v.plates.map((p) => p.text.charAt(0).toLowerCase()),
        );
        const free = [...ALPHA].filter((c) => !used.has(c));
        return free[below(rng, free.length)] ?? "q";
      };
      let key = next;
      if (typist === "typos") key = bad();
      else if (typist === "random") {
        const r = below(rng, 10);
        key = r < 5 ? next : r < 9 ? bad() : "Escape";
      }
      if (key !== "") {
        const input: SimInput = { tick: t, key };
        inputs.push(input);
        const e1 = applyInput(state, input);
        events.push(...e1);
        opts.onTick?.(state, e1);
      }
    }
    const e2 = step(state, 1);
    events.push(...e2);
    opts.onTick?.(state, e2);
  }
  return { state, events, inputs };
}

export { resolvePrologue };

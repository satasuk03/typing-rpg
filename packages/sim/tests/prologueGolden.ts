// Golden prologue replays (P1.1), shared by the Node determinism test and the Chromium parity bundle (node-tests/browser-entry.ts),
// so this file must stay pure and deterministic. A scripted typist (tests/prologueFixture.ts) plays the fixture prologue; the
// recorded inputs are replayed through replay() and must reproduce the same final state and event stream.
import { canonicalJson, fnv1a32, replay } from "../src/index.ts";
import { type PrologueRun, playPrologue, prologueRun, type Typist } from "./prologueFixture.ts";

export const PROLOGUE_GOLDEN_SCENARIOS = [
  "perfect-clear",
  "random-clear",
  "idle-3000",
  "typos-hard-floor",
] as const;
type Scenario = (typeof PROLOGUE_GOLDEN_SCENARIOS)[number];

export interface PrologueGolden {
  state: string;
  events: string;
  inputs: number;
  endTick: number;
  outcome: string;
  /** Tick of PrologueClimax, or -1. */
  climaxTick: number;
  skillsCast: number;
  heroHpM: number;
}

const HARD = [
  { kind: "walk", seconds: 2, heal: false },
  {
    kind: "encounter",
    encounter: {
      name: "Doom",
      hp: 200,
      gruntHit: 3000,
      waves: [[{ enemy: "pgrunt" }], [{ enemy: "pgrunt" }, { enemy: "pwisp" }]],
    },
  },
  { kind: "boss", bossId: "nul" },
];

const SCENARIOS: Record<
  Scenario,
  { run: () => PrologueRun; typist: Typist; every: number; seed: number; until?: number }
> = {
  "perfect-clear": { run: () => prologueRun(), typist: "perfect", every: 8, seed: 11 },
  "random-clear": { run: () => prologueRun(), typist: "random", every: 7, seed: 12 },
  "idle-3000": { run: () => prologueRun(), typist: "idle", every: 1, seed: 13, until: 3000 },
  "typos-hard-floor": {
    run: () => prologueRun({ segments: HARD }, 3000),
    typist: "typos",
    every: 5,
    seed: 14,
    until: 3000,
  },
};

export function prologueGolden(name: Scenario): PrologueGolden {
  const sc = SCENARIOS[name];
  const run = sc.run();
  const played = playPrologue(run, sc.typist, {
    everyTicks: sc.every,
    seed: sc.seed,
    maxTicks: sc.until ?? 60 * 240,
  });
  const res = replay(run.def, run.loadout, run.seed, run.options, played.inputs, {
    collectEvents: true,
    ...(sc.until !== undefined ? { untilTick: sc.until } : {}),
  });
  const climax = res.events.find((e) => e.type === "PrologueClimax");
  return {
    state: res.hash,
    events: fnv1a32(canonicalJson(res.events)).toString(16).padStart(8, "0"),
    inputs: played.inputs.length,
    endTick: res.finalState.tick,
    outcome: res.result?.outcome ?? "none",
    climaxTick: climax?.tick ?? -1,
    skillsCast: res.finalState.run.stats.skillsCast,
    heroHpM: res.finalState.run.heroHpM,
  };
}

export const prologueGoldens = (): Record<string, PrologueGolden> => {
  const out: Record<string, PrologueGolden> = {};
  for (const n of PROLOGUE_GOLDEN_SCENARIOS) out[n] = prologueGolden(n);
  return out;
};

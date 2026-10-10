// Golden replays of the Whispering Willow fixture (T1.3), shared by the Node determinism test and the Chromium parity bundle
// (node-tests/browser-entry.ts), so this file must stay pure and deterministic. The reference bot plays the whole boss:
// phase-1 adds (a fading Shade and a healing Mender), exact-case Hush Spells, five riddles, the finisher; the recorded
// inputs are replayed through replay().
import { canonicalJson, fnv1a32, replay } from "../src/index.ts";
import { runBot } from "./bot/refBot.ts";
import type { CombatGolden } from "./typingGolden.ts";
import { mkLoadout, mkOptions } from "./typingHarness.ts";
import { willowDef } from "./willowFixture.ts";

export const WILLOW_GOLDEN_SCENARIOS = ["willow-45wpm", "willow-25wpm-wrong"] as const;
type Scenario = (typeof WILLOW_GOLDEN_SCENARIOS)[number];

export interface WillowGolden extends CombatGolden {
  riddlesRight: number;
  riddlesWrong: number;
  riddlesTimeout: number;
}

const RUN: Record<
  Scenario,
  {
    seed: number;
    pace: number;
    wpm: number;
    accuracy: number;
    riddleAccuracy: number;
    guardAttempt: number;
  }
> = {
  // a clean typist who always reads the leaves correctly
  "willow-45wpm": {
    seed: 4242,
    pace: 45,
    wpm: 45,
    accuracy: 0.95,
    riddleAccuracy: 1,
    guardAttempt: 1,
  },
  // a slow, sloppy typist who guesses some of the riddles wrong
  "willow-25wpm-wrong": {
    seed: 4243,
    pace: 25,
    wpm: 25,
    accuracy: 0.9,
    riddleAccuracy: 0.6,
    guardAttempt: 0.6,
  },
};

export function willowGolden(name: Scenario): WillowGolden {
  const r = RUN[name];
  const def = willowDef(true);
  const loadout = mkLoadout("sword");
  const options = mkOptions({ pace: r.pace });
  const bot = runBot(def, loadout, r.seed, options, {
    wpm: r.wpm,
    accuracy: r.accuracy,
    riddleAccuracy: r.riddleAccuracy,
    guardAttempt: r.guardAttempt,
    maxTicks: 72_000,
  });
  const res = replay(def, loadout, r.seed, options, bot.inputs);
  const outcomes = res.events.flatMap((e) => (e.type === "RiddleResolved" ? [e.outcome] : []));
  return {
    state: res.hash,
    events: fnv1a32(canonicalJson(res.events)).toString(16).padStart(8, "0"),
    inputs: bot.inputs.length,
    endTick: res.finalState.tick,
    outcome: res.result?.outcome ?? "none",
    autoAttacks: res.result?.stats.autoAttacks ?? 0,
    secondWindUsed: res.result?.stats.secondWindUsed ?? false,
    skillsCast: res.result?.stats.skillsCast ?? 0,
    riddlesRight: outcomes.filter((o) => o === "right").length,
    riddlesWrong: outcomes.filter((o) => o === "wrong").length,
    riddlesTimeout: outcomes.filter((o) => o === "timeout").length,
  };
}

export const willowGoldens = (): Record<string, WillowGolden> => {
  const out: Record<string, WillowGolden> = {};
  for (const n of WILLOW_GOLDEN_SCENARIOS) out[n] = willowGolden(n);
  return out;
};

// Golden replays of scripted typing sessions on the fixture level. Shared by the Node determinism test and the
// Chromium parity bundle (node-tests/browser-entry.ts), so it must stay pure and deterministic.
import { canonicalJson, fnv1a32, replay } from "../src/index.ts";
import { mkDef, mkLoadout, mkOptions, scriptedSession } from "./typingHarness.ts";

export const TYPING_GOLDEN_SEEDS = [1, 42, 2024, 0xdeadbeef] as const;

export interface TypingGolden {
  /** fnv1a32 hash of the final LevelState (the sim's own `hash`). */
  state: string;
  /** fnv1a32(canonicalJson(events)) over the whole event stream. */
  events: string;
  inputs: number;
  endTick: number;
  outcome: string;
}

export function typingGolden(seed: number): TypingGolden {
  const def = mkDef();
  const { inputs } = scriptedSession(seed, def);
  const res = replay(def, mkLoadout(), seed, mkOptions(), inputs);
  return {
    state: res.hash,
    events: fnv1a32(canonicalJson(res.events)).toString(16).padStart(8, "0"),
    inputs: inputs.length,
    endTick: res.finalState.tick,
    outcome: res.result?.outcome ?? "none",
  };
}

export const typingGoldens = (): Record<string, TypingGolden> => {
  const out: Record<string, TypingGolden> = {};
  for (const s of TYPING_GOLDEN_SEEDS) out[String(s)] = typingGolden(s);
  return out;
};

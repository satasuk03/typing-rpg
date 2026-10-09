// Typing Trial fixtures: a synthetic pool and scripted typing sessions. Shared by the unit tests, the golden replay and
// the Node/Chromium parity bundle, so it must stay pure and deterministic (no wall clock, no Math.random).
import {
  below,
  createTrial,
  deriveRng,
  encodeLog,
  fnv1a32,
  type LoggedInput,
  msToTick,
  type ResolvedTrial,
  replayTrial,
  type SimInput,
  tickStartMs,
} from "../src/index.ts";

const WORDS =
  "the quick brown fox jumps over a lazy dog while Typing, practice; makes perfect!".split(" ");
const mkPassage = (salt: number): string => {
  const r = deriveRng(salt, "meta");
  const out: string[] = [];
  let len = 0;
  while (len < 1700) {
    const w = WORDS[below(r, WORDS.length)] as string;
    out.push(w);
    len += w.length + 1;
  }
  return out.join(" ");
};

export const mkTrialDef = (): ResolvedTrial => ({
  trialId: "test_trial",
  durationTicks: 3600,
  passages: [mkPassage(11), mkPassage(22), mkPassage(33), mkPassage(44)],
  contentVersion: "00000000",
});

/** A typist: gaps of 1..gapMax ticks between keys; typoPct% of keys are a wrong letter first. Runs until `endTick`. */
export function scriptedTrialSession(
  def: ResolvedTrial,
  seed: number,
  opts: { gapMax?: number; typoPct?: number; endTick?: number } = {},
): { inputs: SimInput[]; log: LoggedInput[] } {
  const gapMax = opts.gapMax ?? 6;
  const typoPct = opts.typoPct ?? 8;
  const endTick = opts.endTick ?? def.durationTicks + 120;
  const passage = createTrial(def, seed).passage;
  const r = deriveRng(seed, "meta", 7);
  const inputs: SimInput[] = [];
  const log: LoggedInput[] = [];
  const push = (tick: number, key: string): void => {
    const ms = tick === 0 ? 0 : tickStartMs(tick);
    inputs.push({ tick: msToTick(ms), key });
    log.push({ ms, input: { tick: msToTick(ms), key } });
  };
  let tick = 0;
  for (let i = 0; i < passage.length && tick < endTick; ) {
    if (below(r, 100) < typoPct) {
      push(tick, "#");
      tick += 1 + below(r, gapMax);
      if (tick >= endTick) break;
    }
    push(tick, passage.charAt(i));
    i++;
    tick += 1 + below(r, gapMax);
  }
  return { inputs, log };
}

export interface TrialGolden {
  hash: string;
  log: string; // fnv1a32 of the hdk1 bytes
  correctChars: number;
  typos: number;
  wpmX100: number;
  accuracyBp: number;
  inputs: number;
}

export const TRIAL_GOLDEN_SEEDS = [1, 42, 2024, 0xdeadbeef] as const;

export function trialGolden(seed: number): TrialGolden {
  const def = mkTrialDef();
  const { inputs, log } = scriptedTrialSession(def, seed);
  const res = replayTrial(def, seed, inputs);
  const r = res.result;
  if (r === null) throw new Error("trial did not terminate");
  return {
    hash: res.hash,
    log: fnv1a32(Array.from(encodeLog(log)).join(","))
      .toString(16)
      .padStart(8, "0"),
    correctChars: r.correctChars,
    typos: r.typos,
    wpmX100: r.wpmX100,
    accuracyBp: r.accuracyBp,
    inputs: inputs.length,
  };
}

export const trialGoldens = (): Record<string, TrialGolden> => {
  const out: Record<string, TrialGolden> = {};
  for (const s of TRIAL_GOLDEN_SEEDS) out[String(s)] = trialGolden(s);
  return out;
};

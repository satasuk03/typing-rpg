// Anti-cheat building blocks for the Worker (T5.2): decode an hdk1 log with TRIAL_LOG_LIMITS and re-simulate it.
import { LogError } from "./errors.ts";
import { decodeLog, type LoggedInput, TRIAL_LOG_LIMITS } from "./logcodec.ts";
import { replayTrial } from "./replay.ts";
import { trialScore } from "./trial.ts";
import type { ResolvedTrial, TrialResult } from "./types.ts";

export { trialScore };

export interface TrialResim {
  result: TrialResult;
  /** hash of the final TrialState (the claimed `finalHash`). */
  hash: string;
  score: number;
}

/** Fields of ClaimedTrialResult (docs/interfaces.md §9). */
export interface ClaimedTrial {
  correctChars: number;
  typos: number;
  wpmX100: number;
  accuracyBp: number;
  finalHash: string;
}

/** Step 5 of the submit pipeline: decodeLog with TRIAL_LOG_LIMITS, first dtMs === 0, only key/abandon inputs. Throws LogError. */
export function decodeTrialLog(bytes: Uint8Array): LoggedInput[] {
  const entries = decodeLog(bytes, TRIAL_LOG_LIMITS);
  const first = entries[0];
  if (first !== undefined && first.ms !== 0) throw new LogError("first record must have dtMs 0");
  for (const e of entries) {
    if ("cmd" in e.input && e.input.cmd !== "abandon") {
      throw new LogError("unexpected command in trial log");
    }
  }
  return entries;
}

/** Decode (with limits) and re-sim. Pure and deterministic across Node/Workers/browsers. Throws LogError on a bad log. */
export function resimTrialLog(def: ResolvedTrial, seed: number, bytes: Uint8Array): TrialResim {
  const entries = decodeTrialLog(bytes);
  const res = replayTrial(
    def,
    seed,
    entries.map((e) => e.input),
    { collectEvents: false },
  );
  if (res.result === null) throw new LogError("trial did not terminate"); // unreachable: replayTrial steps to durationTicks
  return { result: res.result, hash: res.hash, score: trialScore(res.result) };
}

/** Step 7: names of the claimed fields that differ from the re-sim; empty = accepted. */
export function trialClaimMismatches(resim: TrialResim, claimed: ClaimedTrial): string[] {
  const out: string[] = [];
  if (claimed.correctChars !== resim.result.correctChars) out.push("correctChars");
  if (claimed.typos !== resim.result.typos) out.push("typos");
  if (claimed.wpmX100 !== resim.result.wpmX100) out.push("wpmX100");
  if (claimed.accuracyBp !== resim.result.accuracyBp) out.push("accuracyBp");
  if (claimed.finalHash !== resim.hash) out.push("finalHash");
  return out;
}

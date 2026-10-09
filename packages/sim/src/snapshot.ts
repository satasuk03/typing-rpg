import { SimError } from "./errors.ts";
import { deepClone } from "./hash.ts";
import type { LevelState, Snapshot, TrialState } from "./types.ts";
import { SIM_VERSION } from "./version.ts";

export function snapshot<S extends LevelState | TrialState>(state: S): Snapshot<S> {
  return { simVersion: SIM_VERSION, state: deepClone(state) };
}

/** Throws SimError on a version mismatch. */
export function restore<S extends LevelState | TrialState>(snap: Snapshot<S>): S {
  if (snap.simVersion !== SIM_VERSION) {
    throw new SimError(`snapshot simVersion ${snap.simVersion} !== SIM_VERSION ${SIM_VERSION}`);
  }
  return deepClone(snap.state);
}

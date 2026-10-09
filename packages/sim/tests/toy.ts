// A toy sim used to prove the kernel end to end (rng, hash, replay runner) before the real combat rules exist.
// It is shared by the Node tests and the browser parity bundle, so it must stay pure and deterministic.
import { TYPABLE_CHARS } from "@hd2d/content";
import {
  below,
  deriveRng,
  type Emit,
  emitTo,
  hashPlain,
  nextU32,
  type ReplayDriver,
  type RngState,
  runReplay,
  type SimEvent,
  type SimInput,
  type TrialState,
} from "../src/index.ts";

export const TOY_DURATION_TICKS = 600;

/** Shaped like a TrialState so the public hash/snapshot/restore typings accept it. */
export type ToyState = TrialState & { rng: RngState; acc: number; keys: number; log: number[] };

export function createToy(seed: number): ToyState {
  // The toy is a bare kernel fixture: it has none of the real TrialState fields (T5.1), so the object is cast. Its
  // golden hashes (fixtures/golden-replay.json) depend on this exact shape.
  return {
    kind: "trial",
    simVersion: 1,
    tick: 0,
    seed,
    rng: deriveRng(seed, "trial"),
    acc: 0,
    keys: 0,
    log: [],
  } as unknown as ToyState;
}

const terminal = (s: ToyState): boolean => s.tick >= TOY_DURATION_TICKS;

export function toyApply(s: ToyState, input: SimInput): SimEvent[] {
  if (terminal(s)) return [];
  if (input.tick !== s.tick) throw new Error("toy: input.tick !== state.tick");
  const out: SimEvent[] = [];
  const emit: Emit = emitTo(out);
  if ("key" in input) {
    const code = input.key === "Escape" ? 0 : input.key.charCodeAt(0);
    s.acc = (s.acc * 31 + code * (below(s.rng, 1000) + 1)) % 1000003;
    s.keys += 1;
    if (s.log.length < 16) s.log.push(code);
    emit({ type: "FocusChanged", tick: s.tick, enemyId: null });
  }
  return out;
}

export function toyStep(s: ToyState, n: number): SimEvent[] {
  for (let i = 0; i < n && !terminal(s); i++) {
    s.acc = (s.acc * 31 + (nextU32(s.rng) % 1000)) % 1000003;
    s.tick += 1;
  }
  return [];
}

export const toyDriver = (seed: number): ReplayDriver<ToyState, { acc: number; keys: number }> => ({
  create: () => createToy(seed),
  applyInput: toyApply,
  step: toyStep,
  tickOf: (s) => s.tick,
  isTerminal: terminal,
  result: (s) => (terminal(s) ? { acc: s.acc, keys: s.keys } : null),
  maxTick: TOY_DURATION_TICKS,
});

/** Deterministic pseudo-typing input stream (monotonic ticks; some keys land past the end, some are Escapes). */
export function toyInputs(seed: number, count = 400): SimInput[] {
  const r = deriveRng(seed, "meta");
  const out: SimInput[] = [];
  let tick = 0;
  for (let i = 0; i < count; i++) {
    tick += below(r, 4);
    const key =
      below(r, 20) === 0 ? "Escape" : (TYPABLE_CHARS[below(r, TYPABLE_CHARS.length)] as string);
    out.push({ tick, key });
  }
  return out;
}

export function toyReplayHash(seed: number): string {
  const res = runReplay(toyDriver(seed), toyInputs(seed), { collectEvents: false });
  return hashPlain(res.finalState);
}

export const GOLDEN_SEEDS = [1, 42, 0xdeadbeef, 123456789] as const;
export const goldenHashes = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const s of GOLDEN_SEEDS) out[String(s)] = toyReplayHash(s);
  return out;
};

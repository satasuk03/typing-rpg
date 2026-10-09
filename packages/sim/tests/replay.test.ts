import { describe, expect, test } from "vitest";
import {
  hashPlain,
  type ReplayDriver,
  replay,
  replayTrial,
  runReplay,
  SimError,
  type SimInput,
} from "../src/index.ts";
import { createToy, TOY_DURATION_TICKS, toyApply, toyDriver, toyInputs, toyStep } from "./toy.ts";

const k = (tick: number, key: string): SimInput => ({ tick, key });

describe("replay runner (toy sim)", () => {
  test("steps to each input's tick, applies it, and returns {finalState, events, hash, result}", () => {
    const res = runReplay(toyDriver(5), [k(0, "a"), k(3, "b"), k(3, "c"), k(10, "d")]);
    expect(res.finalState.tick).toBe(TOY_DURATION_TICKS);
    expect(res.finalState.keys).toBe(4);
    expect(res.events.filter((e) => e.type === "FocusChanged")).toHaveLength(4);
    expect(res.hash).toBe(hashPlain(res.finalState));
    expect(res.result).toEqual({ acc: res.finalState.acc, keys: 4 });
  });

  test("same-tick inputs apply in log order", () => {
    const a = runReplay(toyDriver(5), [k(2, "a"), k(2, "b")]);
    const b = runReplay(toyDriver(5), [k(2, "b"), k(2, "a")]);
    expect(a.hash).not.toBe(b.hash);
  });

  test("replay equals manual stepping", () => {
    const inputs = toyInputs(9, 50);
    const manual = createToy(9);
    for (const i of inputs) {
      if (manual.tick >= TOY_DURATION_TICKS) break;
      if (i.tick > manual.tick) toyStep(manual, i.tick - manual.tick);
      if (manual.tick >= TOY_DURATION_TICKS) break;
      toyApply(manual, i);
    }
    toyStep(manual, TOY_DURATION_TICKS);
    expect(runReplay(toyDriver(9), inputs).hash).toBe(hashPlain(manual));
  });

  test("terminal-state input cutoff: inputs at/after the end are ignored, not errors", () => {
    const base = runReplay(toyDriver(7), [k(5, "a")]);
    const tail = runReplay(toyDriver(7), [
      k(5, "a"),
      k(TOY_DURATION_TICKS, "b"),
      k(TOY_DURATION_TICKS, "c"),
      k(TOY_DURATION_TICKS + 500, "d"),
    ]);
    expect(tail.hash).toBe(base.hash);
    expect(tail.finalState.keys).toBe(1);
    expect(tail.events).toEqual(base.events);
  });

  test("input one tick before the end still counts", () => {
    const r = runReplay(toyDriver(7), [k(TOY_DURATION_TICKS - 1, "z")]);
    expect(r.finalState.keys).toBe(1);
  });

  test("throws on non-monotonic ticks, even after a terminal state", () => {
    expect(() => runReplay(toyDriver(1), [k(5, "a"), k(4, "b")])).toThrow(SimError);
    expect(() => runReplay(toyDriver(1), [k(TOY_DURATION_TICKS + 5, "a"), k(3, "b")])).toThrow(
      SimError,
    );
    expect(() => runReplay(toyDriver(1), [k(-1, "a")])).toThrow(SimError);
    expect(() => runReplay(toyDriver(1), [k(1.5, "a")])).toThrow(SimError);
  });

  test("untilTick stops stepping early and ignores later inputs", () => {
    const r = runReplay(toyDriver(2), [k(10, "a"), k(50, "b")], { untilTick: 20 });
    expect(r.finalState.tick).toBe(20);
    expect(r.finalState.keys).toBe(1);
    expect(r.result).toBeNull();
  });

  test("untilTick can never exceed the driver's maxTick", () => {
    const r = runReplay(toyDriver(2), [], { untilTick: 10_000_000 });
    expect(r.finalState.tick).toBe(TOY_DURATION_TICKS);
  });

  test("collectEvents: false keeps the same hash and drops events", () => {
    const inputs = toyInputs(3, 100);
    const a = runReplay(toyDriver(3), inputs);
    const b = runReplay(toyDriver(3), inputs, { collectEvents: false });
    expect(b.events).toEqual([]);
    expect(b.hash).toBe(a.hash);
  });

  test("no inputs: runs to the end", () => {
    const r = runReplay(toyDriver(4), []);
    expect(r.finalState.tick).toBe(TOY_DURATION_TICKS);
    expect(r.result).not.toBeNull();
  });

  test("a driver that becomes terminal early is never stepped again", () => {
    let calls = 0;
    const d: ReplayDriver<{ t: number }, number> = {
      create: () => ({ t: 0 }),
      applyInput: () => [],
      step: (s, n) => {
        calls++;
        s.t = Math.min(s.t + n, 3);
        return [];
      },
      tickOf: (s) => s.t,
      isTerminal: (s) => s.t >= 3,
      result: (s) => s.t,
      maxTick: 100,
    };
    const r = runReplay(d, [k(1, "a"), k(5, "b"), k(6, "c")]);
    expect(r.finalState.t).toBe(3);
    expect(calls).toBe(2); // step to 1, then step to 5 (clamped to 3 -> terminal); nothing after
  });
});

describe("public replay entry points", () => {
  test("replay()/replayTrial() are wired to the (not yet implemented) level/trial sims", () => {
    // T1.2 / T5.1 replace the stubs; until then the wiring must fail loudly rather than return garbage.
    expect(() =>
      replayTrial(
        { trialId: "t", durationTicks: 3600, passages: ["a"], contentVersion: "00000000" },
        1,
        [],
      ),
    ).toThrow(/not implemented/);
    expect(() => replay({} as never, {} as never, 1, {} as never, [])).toThrow(); // level sim exists since T1.2
  });
});

import { contentBundle } from "@hd2d/content";
import { describe, expect, test } from "vitest";
import {
  applyTrialInput,
  below,
  createTrial,
  decodeTrialLog,
  deriveRng,
  encodeLog,
  getTrialResult,
  getTrialView,
  hash,
  LogError,
  type LoggedInput,
  msToTick,
  type ResolvedTrial,
  replayTrial,
  resimTrialLog,
  resolveTrial,
  SimError,
  type SimInput,
  stepTrial,
  tickStartMs,
  trialClaimMismatches,
  trialScore,
} from "../src/index.ts";
import golden from "./fixtures/golden-trial.json" with { type: "json" };
import {
  mkTrialDef,
  scriptedTrialSession,
  TRIAL_GOLDEN_SEEDS,
  trialGolden,
  trialGoldens,
} from "./trialHarness.ts";

const def = mkTrialDef();
const SEED = 42;
const passageOf = (d: ResolvedTrial, seed: number): string => createTrial(d, seed).passage;
/** Type `text` one char per tick starting at tick `from` via the replay runner. */
const typeAt = (text: string, from = 0, gap = 1): SimInput[] =>
  [...text].map((key, i) => ({ tick: from + i * gap, key }));
const ev = (state: ReturnType<typeof createTrial>, inputs: SimInput[]) => {
  const out = [];
  for (const i of inputs) {
    out.push(...stepTrial(state, i.tick - state.tick));
    out.push(...applyTrialInput(state, i));
  }
  return out;
};
const toLog = (inputs: SimInput[]): LoggedInput[] =>
  inputs.map((i) => ({ ms: i.tick === 0 ? 0 : tickStartMs(i.tick), input: i }));

describe("Trial rules", () => {
  test("the clock starts on the first key: not started before it, TrialStarted fires once on it", () => {
    const s = createTrial(def, SEED);
    expect(getTrialView(s).started).toBe(false);
    expect(getTrialView(s).ticksLeft).toBe(3600);
    const p = passageOf(def, SEED);
    const events = ev(s, typeAt(p.slice(0, 3)));
    expect(events.filter((e) => e.type === "TrialStarted")).toEqual([
      {
        type: "TrialStarted",
        tick: 0,
        trialId: "test_trial",
        durationTicks: 3600,
        passageLength: p.length,
      },
    ]);
    expect(getTrialView(s).started).toBe(true);
  });

  test("Escape and abandon commands never start the clock or change the result", () => {
    const s = createTrial(def, SEED);
    expect(applyTrialInput(s, { tick: 0, key: "Escape" })).toEqual([]);
    expect(applyTrialInput(s, { tick: 0, cmd: "abandon" })).toEqual([]);
    expect(getTrialView(s).started).toBe(false);
  });

  test("the run ends at exactly durationTicks (60 s = 3600 ticks) and emits TrialEnded once", () => {
    const s = createTrial(def, SEED);
    expect(stepTrial(s, 3599)).toEqual([]);
    expect(getTrialView(s).done).toBe(false);
    expect(getTrialResult(s)).toBeNull();
    const end = stepTrial(s, 5); // clamped at the end
    expect(s.tick).toBe(3600);
    expect(end.map((e) => e.type)).toEqual(["TrialEnded"]);
    expect(getTrialView(s).done).toBe(true);
    expect(getTrialView(s).ticksLeft).toBe(0);
    expect(stepTrial(s, 10)).toEqual([]);
    expect(s.tick).toBe(3600);
  });

  test("a key at tick >= durationTicks does not count; a key at tick 3599 does", () => {
    const p = passageOf(def, SEED);
    const a = replayTrial(def, SEED, [...typeAt(p.slice(0, 5)), { tick: 3599, key: p.charAt(5) }]);
    expect(a.result?.correctChars).toBe(6);
    const b = replayTrial(def, SEED, [
      ...typeAt(p.slice(0, 5)),
      { tick: 3600, key: p.charAt(5) },
      { tick: 3601, key: p.charAt(5) },
    ]);
    expect(b.result?.correctChars).toBe(5);
    expect(b.result?.typos).toBe(0);
    // direct application at the end tick is also ignored
    const s = createTrial(def, SEED);
    stepTrial(s, 3600);
    expect(applyTrialInput(s, { tick: 3600, key: p.charAt(0) })).toEqual([]);
    expect(s.correctChars).toBe(0);
  });

  test("stop-on-error: a wrong key is a typo, the cursor stays, and the same char must be typed", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    ev(s, [
      { tick: 0, key: p.charAt(0) },
      { tick: 1, key: "#" },
      { tick: 2, key: "#" },
    ]);
    expect(s.typedIndex).toBe(1);
    expect(s.typos).toBe(2);
    expect(s.correctChars).toBe(1);
    expect(getTrialView(s).lastTypoTick).toBe(2);
    ev(s, [{ tick: 3, key: p.charAt(1) }]); // continuing with the NEXT char after the typo target... is the target itself
    expect(s.typedIndex).toBe(2);
    // typing the char after the expected one is a typo, not a skip
    const t = createTrial(def, SEED);
    const skip = ev(t, [{ tick: 0, key: p.charAt(1) === p.charAt(0) ? "#" : p.charAt(1) }]);
    expect(skip.some((e) => e.type === "Typo")).toBe(true);
    expect(t.typedIndex).toBe(0);
  });

  test("a typo at tier 1 resets the key streak to 0 (and its tier); correct keys build it", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    const events = ev(s, typeAt(p.slice(0, 12)));
    expect(s.keyStreak).toBe(12);
    expect(getTrialView(s).keyStreakTier).toBe(1);
    expect(events.filter((e) => e.type === "KeyStreakTierChanged")).toHaveLength(1);
    const after = ev(s, [{ tick: 12, key: "#" }]);
    expect(s.keyStreak).toBe(0);
    expect(after.map((e) => e.type)).toEqual(["Typo", "KeyStreakTierChanged"]);
    expect(getTrialView(s).keyStreakTier).toBe(0);
  });

  test("a typo drops the key streak one tier: 30 (T2) -> 10 (T1), then 10 -> 0; the score inputs are unaffected", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    ev(s, typeAt(p.slice(0, 30)));
    expect(getTrialView(s).keyStreakTier).toBe(2);
    const e1 = ev(s, [{ tick: 30, key: "#" }]);
    expect(s.keyStreak).toBe(10);
    expect(e1.filter((e) => e.type === "KeyStreakTierChanged")).toMatchObject([
      { from: 2, to: 1, keyStreak: 10 },
    ]);
    ev(s, [{ tick: 31, key: "#" }]);
    expect(s.keyStreak).toBe(0);
    expect(s.typos).toBe(2);
  });

  test("spaces are typed characters: they count as correct chars, and a missing space is a typo", () => {
    const p = passageOf(def, SEED);
    const sp = p.indexOf(" ");
    expect(sp).toBeGreaterThan(0);
    const r = replayTrial(def, SEED, typeAt(p.slice(0, sp + 1)));
    expect(r.result?.correctChars).toBe(sp + 1);
    expect(r.result?.typos).toBe(0);
    // skipping the space and typing the next letter is a typo
    const skip = replayTrial(def, SEED, typeAt(p.slice(0, sp) + p.charAt(sp + 1)));
    expect(skip.result?.correctChars).toBe(sp);
    expect(skip.result?.typos).toBe(1);
  });

  test("comparison is case-sensitive and exact", () => {
    const d: ResolvedTrial = { ...def, passages: [`Ab${"c".repeat(1600)}`] };
    const r = replayTrial(d, 1, [
      { tick: 0, key: "a" },
      { tick: 1, key: "A" },
      { tick: 2, key: "B" },
      { tick: 3, key: "b" },
    ]);
    expect(r.result).toMatchObject({ correctChars: 2, typos: 2 });
  });

  test("WPM, accuracy and score: hand-computed cases", () => {
    const p = passageOf(def, SEED);
    // 600 correct + 30 typos: wpmX100 = 600 * 20 = 12000 (= 120 WPM); acc = floor(600 * 10000 / 630) = 9523
    const inputs: SimInput[] = [];
    let t = 0;
    for (let i = 0; i < 600; i++) {
      inputs.push({ tick: t, key: p.charAt(i) });
      if (i % 20 === 0) inputs.push({ tick: t, key: "#" }); // 30 typos
      t += 5;
    }
    const r = replayTrial(def, SEED, inputs).result;
    expect(r).toEqual({
      correctChars: 600,
      typos: 30,
      wpmX100: 12000,
      accuracyBp: 9523,
      durationTicks: 3600,
    });
    expect(trialScore(r as NonNullable<typeof r>)).toBe(12000 * 10000 + 9523);
    // 1 correct + 2 typos: 20 wpmX100, acc floor(10000/3) = 3333
    const small = replayTrial(def, SEED, [
      { tick: 0, key: p.charAt(0) },
      { tick: 1, key: "#" },
      { tick: 2, key: "#" },
    ]).result;
    expect(small).toMatchObject({ correctChars: 1, typos: 2, wpmX100: 20, accuracyBp: 3333 });
    expect(trialScore(small as NonNullable<typeof small>)).toBe(20 * 10000 + 3333);
    // no keys: 0 wpm, accuracy = BP
    expect(replayTrial(def, SEED, []).result).toMatchObject({
      correctChars: 0,
      typos: 0,
      wpmX100: 0,
      accuracyBp: 10000,
    });
    // a 30 s variant exercises the general formula: floor(c * 60 * 100 * 60 / (5 * 1800)) = c * 40
    const half = replayTrial({ ...def, durationTicks: 1800 }, SEED, typeAt(p.slice(0, 7))).result;
    expect(half?.wpmX100).toBe(7 * 40);
  });

  test("live view: netWpm, accuracy and typedIndex follow the typing", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    ev(s, [...typeAt(p.slice(0, 60), 0, 1), { tick: 60, key: "#" }]);
    const v = getTrialView(s);
    expect(v.typedIndex).toBe(60);
    expect(v.passage).toBe(p);
    expect(v.netWpm).toBe(Math.floor((60 * 720) / 60)); // 60 chars in 1 s = 720 wpm
    expect(v.accuracy).toBe(Math.floor((60 * 10000) / 61));
    expect(v.lastTypoTick).toBe(60);
  });

  test("the passage is chosen deterministically from the seed and the pool", () => {
    const expected = (seed: number): string =>
      def.passages[below(deriveRng(seed, "trial"), def.passages.length)] as string;
    for (const seed of [0, 1, 42, 99, 0xdeadbeef]) {
      expect(passageOf(def, seed)).toBe(expected(seed));
      expect(passageOf(def, seed)).toBe(passageOf(def, seed));
    }
    const picks = new Set<string>();
    for (let s = 0; s < 64; s++) picks.add(passageOf(def, s));
    expect(picks.size).toBe(def.passages.length); // every passage is reachable
    // a different pool order gives a different pick for some seed (the pool matters)
    const rev = { ...def, passages: [...def.passages].reverse() };
    expect([...Array(16).keys()].some((s) => passageOf(rev, s) !== passageOf(def, s))).toBe(true);
  });

  test("terminal state ignores further input (no events, no state change, no throw)", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    ev(s, typeAt(p.slice(0, 4)));
    stepTrial(s, 3600);
    const before = hash(s);
    expect(applyTrialInput(s, { tick: 3600, key: p.charAt(4) })).toEqual([]);
    expect(applyTrialInput(s, { tick: 4000, key: "#" })).toEqual([]);
    expect(applyTrialInput(s, { tick: 3600, cmd: "abandon" })).toEqual([]);
    expect(hash(s)).toBe(before);
    expect(stepTrial(s, 100)).toEqual([]);
    expect(hash(s)).toBe(before);
  });

  test("applyTrialInput throws on a tick mismatch (programming error), like applyInput", () => {
    const s = createTrial(def, SEED);
    expect(() => applyTrialInput(s, { tick: 5, key: "a" })).toThrow(SimError);
  });

  test("replayTrial throws on non-monotonic input ticks and never consumes keys past the end", () => {
    expect(() =>
      replayTrial(def, SEED, [
        { tick: 3, key: "a" },
        { tick: 2, key: "b" },
      ]),
    ).toThrow(SimError);
  });

  test("state stays plain data: snapshot-able and hashable at every step", () => {
    const p = passageOf(def, SEED);
    const s = createTrial(def, SEED);
    ev(s, typeAt(p.slice(0, 20), 0, 2));
    expect(hash(s)).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("resolveTrial and the real content pool", () => {
  const trial = contentBundle.trials[0];
  test("resolves the bundle's trial: 3600 ticks, the full pool, contentVersion", () => {
    expect(trial).toBeDefined();
    const r = resolveTrial(contentBundle, (trial as NonNullable<typeof trial>).id);
    expect(r.durationTicks).toBe(3600);
    expect(r.passages.length).toBeGreaterThanOrEqual(30);
    expect(r.passages.every((p) => p.length >= 1600)).toBe(true);
    expect(r.contentVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(() => resolveTrial(contentBundle, "nope")).toThrow(SimError);
  });

  test("the seed spreads over the real pool and every real passage is typable char by char", () => {
    const r = resolveTrial(contentBundle, (trial as NonNullable<typeof trial>).id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) seen.add(passageOf(r, seed));
    expect(seen.size).toBeGreaterThan(r.passages.length * 0.8);
    for (const p of r.passages.slice(0, 5)) {
      const res = replayTrial({ ...r, passages: [p] }, 1, typeAt(p.slice(0, 1000), 0, 3));
      expect(res.result).toMatchObject({ correctChars: 1000, typos: 0, accuracyBp: 10000 });
    }
  });
});

describe("replayTrial determinism and golden fixtures", () => {
  test("the same log gives an identical result and hash across 200 replays", () => {
    const { inputs } = scriptedTrialSession(def, 7);
    const first = replayTrial(def, 7, inputs, { collectEvents: false });
    for (let i = 0; i < 200; i++) {
      const again = replayTrial(def, 7, inputs, { collectEvents: false });
      expect(again.hash).toBe(first.hash);
      expect(again.result).toEqual(first.result);
    }
  });

  test("a live tick-by-tick run ends in the same state and events as the replay runner", () => {
    const { inputs } = scriptedTrialSession(def, 11);
    const live = createTrial(def, 11);
    const liveEvents = ev(live, inputs);
    liveEvents.push(...stepTrial(live, 3600));
    const res = replayTrial(def, 11, inputs);
    expect(res.hash).toBe(hash(live));
    expect(res.events).toEqual(liveEvents);
    expect(res.result).toEqual(getTrialResult(live));
  });

  test("scripted sessions replay to the committed golden fixture (shared with the Chromium parity test)", () => {
    expect(trialGoldens()).toEqual(golden.goldens);
    expect(Object.keys(golden.goldens).sort()).toEqual(TRIAL_GOLDEN_SEEDS.map(String).sort());
  });

  test("different seeds give different hashes", () => {
    expect(trialGolden(1).hash).not.toBe(trialGolden(42).hash);
  });
});

describe("anti-cheat building blocks (resimTrialLog)", () => {
  const seed = 2024;
  const base = scriptedTrialSession(def, seed, { endTick: 3600 });
  const bytes = encodeLog(base.log);
  const honest = resimTrialLog(def, seed, bytes);
  const claimOf = (r: typeof honest) => ({ ...r.result, finalHash: r.hash });

  test("decodes with TRIAL_LOG_LIMITS and re-sims to {result, hash} equal to replayTrial", () => {
    const direct = replayTrial(def, seed, base.inputs);
    expect(honest.result).toEqual(direct.result);
    expect(honest.hash).toBe(direct.hash);
    expect(honest.score).toBe(trialScore(honest.result));
    expect(trialClaimMismatches(honest, claimOf(honest))).toEqual([]);
  });

  test("a tampered claimed score/result is detected: each altered field is named", () => {
    const c = claimOf(honest);
    expect(trialClaimMismatches(honest, { ...c, correctChars: c.correctChars + 1 })).toEqual([
      "correctChars",
    ]);
    expect(trialClaimMismatches(honest, { ...c, typos: 0 })).toContain("typos");
    expect(trialClaimMismatches(honest, { ...c, wpmX100: c.wpmX100 + 20 })).toEqual(["wpmX100"]);
    expect(trialClaimMismatches(honest, { ...c, accuracyBp: 10000 })).toEqual(["accuracyBp"]);
    expect(trialClaimMismatches(honest, { ...c, finalHash: "00000000" })).toEqual(["finalHash"]);
  });

  test("a tampered log (one key changed) re-sims to a different result or hash", () => {
    const log = base.log.map((e) => ({ ...e }));
    const i = log.findIndex((e) => "key" in e.input && e.input.key !== "#");
    log[i] = {
      ms: (log[i] as LoggedInput).ms,
      input: { tick: (log[i] as LoggedInput).input.tick, key: "#" },
    };
    const forged = resimTrialLog(def, seed, encodeLog(log));
    expect(forged.hash).not.toBe(honest.hash);
    expect(trialClaimMismatches(forged, claimOf(honest)).length).toBeGreaterThan(0);
  });

  test("altered timings within 60 s that keep the same key sequence give the same result (expected, §10 / M7)", () => {
    // The sim is time-insensitive inside the window: only key order and "before/after the end" matter. WPM caps are the
    // heuristics' job (step 8), not the re-sim's. Here every key moves to a different tick (still < 3600).
    const retimed = base.log.map((e, i) => {
      const ms = i === 0 ? 0 : Math.min(59_000, Math.floor((e.ms * 3) / 5) + i);
      return { ms, input: { tick: msToTick(ms), key: (e.input as { key: string }).key } };
    });
    expect(retimed.map((e) => e.ms)).not.toEqual(base.log.map((e) => e.ms));
    const r = resimTrialLog(def, seed, encodeLog(retimed));
    expect(r.result).toEqual(honest.result);
    // The state hash covers everything in TrialState, including lastTypoTick (a view field), so it differs ONLY by that.
    const a = replayTrial(
      def,
      seed,
      retimed.map((e) => e.input),
    ).finalState;
    const b = replayTrial(def, seed, base.inputs).finalState;
    expect({ ...a, lastTypoTick: 0 }).toEqual({ ...b, lastTypoTick: 0 });
  });

  test("timings that push keys past 60 s change the result", () => {
    const stretched = base.log
      .map((e) => ({ ms: Math.min(59_999, e.ms * 2), key: (e.input as { key: string }).key }))
      .map((e) => ({ ms: e.ms, input: { tick: msToTick(e.ms), key: e.key } }));
    // 2x slower: the keys at ms*2 > 59_999 are clamped... instead build keys really past the end via the log limit
    const r = resimTrialLog(def, seed, encodeLog(stretched));
    expect(r.result.correctChars + r.result.typos).toBe(base.log.length);
    // keys at ms 59_999 (tick 3599) count; shifting the last 10 keys to 60_000 (tick 3600) drops them
    const tail = base.log.map((e, i) => {
      if (i < base.log.length - 10) return e;
      return {
        ms: 60_000,
        input: { tick: msToTick(60_000), key: (e.input as { key: string }).key },
      };
    });
    const cut = resimTrialLog(def, seed, encodeLog(tail));
    expect(cut.result.correctChars + cut.result.typos).toBe(base.log.length - 10);
    expect(cut.hash).not.toBe(honest.hash);
    expect(cut.result).not.toEqual(honest.result);
  });

  test("a log over the limits or with a non-zero first record is rejected before the re-sim", () => {
    const tooMany = Array.from({ length: 3001 }, (_, i) => ({
      ms: i,
      input: { tick: msToTick(i), key: "a" },
    }));
    expect(() => resimTrialLog(def, seed, encodeLog(tooMany))).toThrow(LogError);
    const late = [{ ms: 5, input: { tick: msToTick(5), key: "a" } }];
    expect(() => decodeTrialLog(encodeLog(late))).toThrow(LogError);
    const past = [
      { ms: 0, input: { tick: 0, key: "a" } },
      { ms: 60_001, input: { tick: msToTick(60_001), key: "a" } },
    ];
    expect(() => resimTrialLog(def, seed, encodeLog(past))).toThrow(LogError);
    expect(() => decodeTrialLog(new Uint8Array([1, 2, 3]))).toThrow(LogError);
  });

  test("abandon commands in the log are accepted by the decoder and ignored by the sim; revive is rejected", () => {
    const a = [
      { ms: 0, input: { tick: 0, key: passageOf(def, seed).charAt(0) } },
      { ms: 100, input: { tick: msToTick(100), cmd: "abandon" as const } },
    ];
    expect(resimTrialLog(def, seed, encodeLog(a)).result.correctChars).toBe(1);
    const rev = [{ ms: 0, input: { tick: 0, cmd: "revive" as const, source: "gem" as const } }];
    expect(() => decodeTrialLog(encodeLog(rev))).toThrow(LogError);
  });
});

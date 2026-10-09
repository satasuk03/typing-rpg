// Property test (T1.2 AC): seeded, random keys and random spawn/attack timings.
// Invariants at every tick: visible plates never share a (case-folded) first letter, including across guard swaps and wave
// spawns; PlateShown/PlateRemoved events reconstruct exactly the view's plate set; events are never emitted out of tick order.
import { describe, expect, test } from "vitest";
import {
  below,
  deriveRng,
  type ResolvedEnemy,
  type ResolvedLevel,
  type ResolvedSegment,
  type RngState,
  type SimEvent,
} from "../src/index.ts";
import { firstLetter } from "../src/words.ts";
import { BOSS, Driver, mkDef } from "./typingHarness.ts";

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

function randomWord(r: RngState, letters: number): string {
  const len = 2 + below(r, 8);
  let w = "";
  for (let i = 0; i < len; i++) w += ALPHA.charAt(below(r, letters));
  // sometimes capitalised or sentence-like, to exercise case folding and typed spaces
  const roll = below(r, 12);
  if (roll === 0) w = w.charAt(0).toUpperCase() + w.slice(1);
  if (roll === 1 && w.length > 4) w = `${w.slice(0, 2)} ${w.slice(2)}`;
  return w;
}

function randomDef(seed: number): ResolvedLevel {
  const r = deriveRng(seed, "meta", 1);
  const letters = 2 + below(r, 25); // 2..26 distinct possible first letters: forces collisions on small values
  const pool = (max: number): string[] =>
    Array.from({ length: below(r, max + 1) }, () => randomWord(r, letters));
  const enemies: Record<string, ResolvedEnemy> = {};
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) {
    const id = `e${i}`;
    const minLen = 2 + below(r, 3);
    enemies[id] = {
      id,
      archetype: "grunt",
      baseIntervalTicks: 40 + below(r, 500),
      heavy: below(r, 2) === 0,
      plateLength: [minLen, minLen + below(r, 6)],
      weaknesses: [],
      shield: 0,
      hpWeightBp: 10_000,
      hitWeightBp: 10_000,
    };
    ids.push(id);
  }
  enemies[BOSS.enemyId] = { ...(enemies.e0 as ResolvedEnemy), id: BOSS.enemyId, archetype: "boss" };
  const segments: ResolvedSegment[] = [];
  const encCount = 1 + below(r, 3);
  for (let i = 0; i < encCount; i++) {
    if (below(r, 2) === 0) segments.push({ kind: "walk", ticks: below(r, 200), heal: false });
    const waves = Array.from({ length: 1 + below(r, 3) }, () =>
      Array.from({ length: 1 + below(r, 6) }, () => ({
        enemyId: ids[below(r, ids.length)] as string,
        gimmick: null,
      })),
    );
    segments.push({
      kind: "encounter",
      name: `E${i}`,
      hpPoolM: 20_000 + below(r, 300_000),
      gruntHitM: 1000,
      waves,
    });
  }
  const hasBoss = below(r, 3) === 0;
  if (hasBoss) segments.push({ kind: "boss", bossId: BOSS.id });
  const def = mkDef({
    isBoss: hasBoss,
    boss: hasBoss ? BOSS : null,
    enemies,
    segments,
    words: {
      current: pool(30),
      review: pool(10),
      biome: pool(10),
      weak: pool(4),
      guard: pool(8),
      doom: [],
      finisher: [],
      secondWind: [],
      minigame: [],
    },
  });
  return def;
}

interface Stats {
  runs: number;
  ticks: number;
  keys: number;
  events: number;
  guardSwaps: number;
  maxVisible: number;
  cleared: number;
  failed: number;
}

function runOne(seed: number, stats: Stats): void {
  const def = randomDef(seed);
  const r = deriveRng(seed, "meta", 2);
  const d = new Driver(def, seed, {
    pace: 15 + below(r, 106),
    difficulty: (["story", "standard", "hard", "zen"] as const)[below(r, 4)] as "story",
    comboMode: (["gentle", "strict", "zen"] as const)[below(r, 3)] as "gentle",
    caseMode: below(r, 4) === 0 ? "strict" : "auto",
    autoUnlockAfterTypos: below(r, 2) === 0 ? 3 : 0,
    tutorial: below(r, 5) === 0,
  });

  const live = new Map<number, string>(); // plateId -> first letter, rebuilt from events
  let lastTick = -1;
  let cursor = 0;
  const consume = (opTick: number): void => {
    for (; cursor < d.all.length; cursor++) {
      const e = d.all[cursor] as SimEvent;
      // events never go back in time, and never carry a tick later than the one being processed
      expect(e.tick).toBeGreaterThanOrEqual(lastTick);
      expect(e.tick).toBeLessThanOrEqual(opTick);
      lastTick = e.tick;
      stats.events++;
      if (e.type === "PlateRemoved") {
        expect(live.delete(e.plateId)).toBe(true);
      } else if (e.type === "PlateShown") {
        const f = firstLetter(e.text);
        for (const other of live.values()) expect(other).not.toBe(f); // distinct at the moment of showing
        live.set(e.plateId, f);
        if (e.kind === "guard") stats.guardSwaps++;
        stats.maxVisible = Math.max(stats.maxVisible, live.size);
      }
    }
  };
  const check = (): void => {
    const v = d.view();
    const letters = v.plates.map((p) => firstLetter(p.text));
    expect(new Set(letters).size).toBe(letters.length);
    expect(v.plates.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      [...live.keys()].sort((a, b) => a - b),
    );
    // a locked target always exists in the plate list
    if (v.targetPlateId !== null) expect(v.plates.some((p) => p.id === v.targetPlateId)).toBe(true);
  };

  const terminal = (): boolean => d.state.phase === "cleared" || d.state.phase === "failed";
  const keyPool = "abcdefghijklmnopqrstuvwxyzABCDEF ,.";
  for (let op = 0; op < 1500 && !terminal(); op++) {
    // random key (biased toward useful ones so plates actually complete)
    const v = d.view();
    const roll = below(r, 100);
    let key: string;
    const target = v.plates.find((p) => p.isTarget);
    if (roll < 4) key = "Escape";
    else if (roll < 18) key = keyPool.charAt(below(r, keyPool.length));
    else if (target !== undefined) key = target.text.charAt(target.typedIndex);
    else if (v.plates.length > 0)
      key = (v.plates[below(r, v.plates.length)] as { text: string }).text.charAt(0);
    else key = ALPHA.charAt(below(r, 26));
    d.key(key);
    stats.keys++;
    consume(d.state.tick);
    check();
    // random timing: advance 0..60 ticks one tick at a time, checking every tick
    const n = below(r, 4) === 0 ? below(r, 60) : below(r, 6);
    for (let i = 0; i < n && !terminal(); i++) {
      d.step(1);
      stats.ticks++;
      consume(d.state.tick - 1);
      check();
    }
  }
  stats.runs++;
  if (d.state.phase === "cleared") stats.cleared++;
  if (d.state.phase === "failed") stats.failed++;
}

describe("property: distinct first letters and ordered events", () => {
  test("seeded random keys and spawn/attack timings (>= 10,000 steps): no two visible words share a first letter at any tick, events stay in tick order", () => {
    const stats: Stats = {
      runs: 0,
      ticks: 0,
      keys: 0,
      events: 0,
      guardSwaps: 0,
      maxVisible: 0,
      cleared: 0,
      failed: 0,
    };
    for (let seed = 1; seed <= 120; seed++) runOne((seed * 2654435761) % 0xffffffff, stats);
    expect(stats.ticks + stats.keys).toBeGreaterThanOrEqual(10_000);
    expect(stats.guardSwaps).toBeGreaterThan(50); // guard swaps were genuinely exercised
    expect(stats.maxVisible).toBeGreaterThanOrEqual(5);
    // stats are asserted loosely so the numbers can be quoted in reports
    expect(stats.runs).toBe(120);
  });

  test("the same seed reproduces the same randomized run exactly", () => {
    const a: Stats = {
      runs: 0,
      ticks: 0,
      keys: 0,
      events: 0,
      guardSwaps: 0,
      maxVisible: 0,
      cleared: 0,
      failed: 0,
    };
    const b = { ...a };
    runOne(777, a);
    runOne(777, b);
    expect(a).toEqual(b);
  });
});

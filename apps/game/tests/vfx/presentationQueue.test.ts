import type { SimEvent } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import {
  CHIP_DELAY_MS,
  entityOf,
  flushesQueue,
  PresentationQueue,
} from "../../src/render/vfx/PresentationQueue";

// minimal event builders (only the fields the queue reads)
const hit = (target: number, kind: "chip" | "auto" = "chip", tick = 0): SimEvent =>
  ({ type: "Hit", tick, targetId: target, kind, sourceId: 0 }) as unknown as SimEvent;
const death = (id: number, tick = 0): SimEvent =>
  ({
    type: "EnemyDeath",
    tick,
    enemyId: id,
    defId: "x",
    isBoss: false,
    byKind: "chip",
  }) as SimEvent;
const brk = (id: number): SimEvent =>
  ({ type: "Break", tick: 0, enemyId: id, untilTick: 9 }) as SimEvent;
const cleared = (): SimEvent =>
  ({ type: "EncounterCleared", tick: 0, encounterIndex: 0, durationTicks: 1 }) as SimEvent;

function collect(q: PresentationQueue, now: number): SimEvent[] {
  const out: SimEvent[] = [];
  q.flush(now, (e) => out.push(e));
  return out;
}

describe("PresentationQueue (spec 5.4)", () => {
  it("defers a chip by CHIP_DELAY_MS and presents it before the same enemy's EnemyDeath", () => {
    const q = new PresentationQueue();
    const chip = hit(5);
    const dead = death(5);
    expect(q.gate(chip, 1000)).toBe(true);
    // the killing blow's EnemyDeath arrives the same tick: gated behind the chip
    expect(q.gate(dead, 1000)).toBe(true);
    expect(collect(q, 1000 + CHIP_DELAY_MS - 1)).toEqual([]);
    const out = collect(q, 1000 + CHIP_DELAY_MS + 100);
    expect(out).toEqual([chip, dead]);
    expect(q.count).toBe(0);
  });

  it("presents the chip at its own time and the death 16 ms later (causal order, never inverted)", () => {
    const q = new PresentationQueue();
    const chip = hit(2);
    const dead = death(2);
    q.gate(chip, 0);
    q.gate(dead, 0);
    expect(collect(q, CHIP_DELAY_MS)).toEqual([chip]);
    expect(collect(q, CHIP_DELAY_MS + 15)).toEqual([]);
    expect(collect(q, CHIP_DELAY_MS + 16)).toEqual([dead]);
  });

  it("gates Break / Hit / Shield events of the same enemy but not other enemies or typing events", () => {
    const q = new PresentationQueue();
    const chip = hit(1);
    q.gate(chip, 0);
    expect(q.gate(brk(1), 10)).toBe(true);
    expect(q.gate(hit(1, "auto"), 10)).toBe(true);
    expect(q.gate(death(2), 10)).toBe(false);
    expect(q.gate({ type: "CharCorrect", tick: 0 } as unknown as SimEvent, 10)).toBe(false);
    expect(q.gate({ type: "Typo", tick: 0 } as unknown as SimEvent, 10)).toBe(false);
    const out = collect(q, 5000);
    expect(out[0]).toBe(chip);
    expect(out).toHaveLength(3);
  });

  it("keeps per-entity order when several events queue behind a chip", () => {
    const q = new PresentationQueue();
    const events = [hit(7), brk(7), hit(7, "auto"), death(7)];
    for (const e of events) q.gate(e, 0);
    expect(collect(q, 10_000)).toEqual(events);
  });

  it("does not defer a chip when the delay is 0 (effects intensity 0)", () => {
    const q = new PresentationQueue();
    expect(q.gate(hit(3), 0, 0)).toBe(false);
    expect(q.count).toBe(0);
  });

  it("EncounterCleared / LevelCleared / LevelFailed flush everything in order", () => {
    const q = new PresentationQueue();
    const a = hit(1);
    const b = death(1);
    const c = hit(2);
    q.gate(a, 0);
    q.gate(b, 0);
    q.gate(c, 5);
    expect(flushesQueue(cleared())).toBe(true);
    expect(flushesQueue({ type: "LevelFailed" } as unknown as SimEvent)).toBe(true);
    expect(flushesQueue({ type: "LevelCleared" } as unknown as SimEvent)).toBe(true);
    expect(flushesQueue(a)).toBe(false);
    const out: SimEvent[] = [];
    q.flushAll((e) => out.push(e));
    // time order: chip(1) at 380, chip(2) at 385, death(1) at 396
    expect(out).toEqual([a, c, b]);
    expect(q.count).toBe(0);
  });

  it("allocates nothing after construction: 10,000 deferrals never exceed the 64 slots", () => {
    const q = new PresentationQueue();
    for (let i = 0; i < 10_000; i++) q.defer(hit(i % 50), i);
    expect(q.count).toBeLessThanOrEqual(64);
    const out = collect(q, 1e9);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(q.count).toBe(0);
  });

  it("entityOf names the enemy of each gated event type", () => {
    expect(entityOf(hit(9))).toBe(9);
    expect(entityOf(death(4))).toBe(4);
    expect(entityOf(brk(3))).toBe(3);
    expect(entityOf({ type: "FocusChanged", tick: 0, enemyId: null } as SimEvent)).toBe(-1);
    expect(entityOf({ type: "CharCorrect" } as unknown as SimEvent)).toBe(-1);
  });
});

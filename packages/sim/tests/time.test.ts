import { describe, expect, test } from "vitest";
import {
  CLIENT_LAG_TICKS,
  MAX_CATCHUP_TICKS,
  msToTick,
  TICK_HZ,
  tickStartMs,
} from "../src/index.ts";

describe("tick clock", () => {
  test("constants", () => {
    expect(TICK_HZ).toBe(60);
    expect(CLIENT_LAG_TICKS).toBe(3);
    expect(MAX_CATCHUP_TICKS).toBe(600);
  });
  test("msToTick known points (60 Hz = 16.667 ms)", () => {
    expect(msToTick(0)).toBe(0);
    expect(msToTick(16)).toBe(0);
    expect(msToTick(17)).toBe(1);
    expect(msToTick(50)).toBe(3);
    expect(msToTick(1000)).toBe(60);
    expect(msToTick(60_000)).toBe(3600);
    expect(msToTick(1_200_000)).toBe(72_000);
  });
  test("tickStartMs known points", () => {
    expect(tickStartMs(0)).toBe(0);
    expect(tickStartMs(1)).toBe(17);
    expect(tickStartMs(2)).toBe(34);
    expect(tickStartMs(3)).toBe(50);
    expect(tickStartMs(60)).toBe(1000);
  });
  test("round trip: msToTick(tickStartMs(t)) === t and tickStartMs is the first such ms", () => {
    for (let t = 0; t <= 80_000; t++) {
      const ms = tickStartMs(t);
      expect(msToTick(ms)).toBe(t);
      if (t > 0) expect(msToTick(ms - 1)).toBe(t - 1);
    }
  });
  test("tickStartMs(msToTick(ms)) <= ms and msToTick is monotonic over every ms in 2 minutes", () => {
    let prev = 0;
    for (let ms = 0; ms <= 120_000; ms++) {
      const t = msToTick(ms);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(tickStartMs(t)).toBeLessThanOrEqual(ms);
      prev = t;
    }
  });
});

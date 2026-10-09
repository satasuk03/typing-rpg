import { describe, expect, test } from "vitest";
import {
  decodeLog,
  encodeLog,
  LEVEL_LOG_LIMITS,
  LogError,
  type LoggedInput,
  type LogLimits,
  msToTick,
  TRIAL_LOG_LIMITS,
} from "../src/index.ts";

const key = (ms: number, k: string): LoggedInput => ({ ms, input: { tick: msToTick(ms), key: k } });
const wide: LogLimits = { maxEvents: 1_000_000, maxTotalMs: 4_000_000_000 };

describe("hdk1 log codec", () => {
  test("wire format golden bytes", () => {
    const bytes = encodeLog([key(0, "a"), key(150, "Escape"), key(151, " ")]);
    // HDK1 | count 3 | (dt 0, 'a'-31=66) | (dt 150 -> 0x96 0x01, 0) | (dt 1, ' '-31=1)
    expect(Array.from(bytes)).toEqual([0x48, 0x44, 0x4b, 0x31, 3, 0, 66, 0x96, 0x01, 0, 1, 1]);
  });
  test("empty log", () => {
    const bytes = encodeLog([]);
    expect(Array.from(bytes)).toEqual([0x48, 0x44, 0x4b, 0x31, 0]);
    expect(decodeLog(bytes, TRIAL_LOG_LIMITS)).toEqual([]);
  });
  test("round trip: all printable ASCII, Escape, and commands", () => {
    const entries: LoggedInput[] = [];
    let ms = 0;
    for (let c = 32; c <= 126; c++) {
      ms += 7 + (c % 5);
      entries.push(key(ms, String.fromCharCode(c)));
    }
    ms += 100;
    entries.push(key(ms, "Escape"));
    entries.push({ ms, input: { tick: msToTick(ms), cmd: "abandon" } });
    entries.push({ ms: ms + 1, input: { tick: msToTick(ms + 1), cmd: "revive", source: "gem" } });
    entries.push({
      ms: ms + 2,
      input: { tick: msToTick(ms + 2), cmd: "revive", source: "feather" },
    });
    const decoded = decodeLog(encodeLog(entries), LEVEL_LOG_LIMITS);
    expect(decoded).toEqual(entries);
  });
  test("round trip with large gaps and same-ms records (varint widths)", () => {
    const entries = [
      key(0, "x"),
      key(0, "y"),
      key(127, "z"),
      key(128, "a"),
      key(16_384, "b"),
      key(1_000_000, "c"),
    ];
    expect(decodeLog(encodeLog(entries), LEVEL_LOG_LIMITS)).toEqual(entries);
  });
  test("decoded ticks are derived with msToTick", () => {
    const d = decodeLog(encodeLog([key(1234, "q")]), TRIAL_LOG_LIMITS);
    expect(d[0]?.input.tick).toBe(msToTick(1234));
  });

  test("encode rejects non-monotonic ms", () => {
    expect(() => encodeLog([key(10, "a"), key(9, "b")])).toThrow(LogError);
  });
  test("encode rejects input.tick !== msToTick(ms)", () => {
    expect(() => encodeLog([{ ms: 100, input: { tick: 0, key: "a" } }])).toThrow(LogError);
  });
  test("encode rejects unencodable keys and bad ms", () => {
    expect(() => encodeLog([key(0, "é")])).toThrow(LogError);
    expect(() => encodeLog([key(0, "ab")])).toThrow(LogError);
    expect(() => encodeLog([{ ms: 1.5, input: { tick: 0, key: "a" } }])).toThrow(LogError);
    expect(() => encodeLog([{ ms: -1, input: { tick: 0, key: "a" } }])).toThrow(LogError);
  });

  test("decode rejects bad magic and empty input", () => {
    expect(() => decodeLog(new Uint8Array([1, 2, 3, 4, 0]), wide)).toThrow(/magic/);
    expect(() => decodeLog(new Uint8Array(), wide)).toThrow(LogError);
    expect(() => decodeLog(new Uint8Array([0x48, 0x44, 0x4b]), wide)).toThrow(LogError);
  });
  test("decode rejects truncated data and trailing bytes", () => {
    const ok = encodeLog([key(0, "a"), key(10, "b")]);
    expect(() => decodeLog(ok.slice(0, ok.length - 1), wide)).toThrow(LogError);
    expect(() => decodeLog(new Uint8Array([...ok, 0]), wide)).toThrow(/trailing/);
  });
  test("decode rejects bad codes", () => {
    const base = [0x48, 0x44, 0x4b, 0x31, 1, 0];
    for (const code of [96, 150, 199, 203, 255]) {
      const bytes =
        code >= 128 ? [...base, (code % 128) + 128, Math.floor(code / 128)] : [...base, code];
      expect(() => decodeLog(Uint8Array.from(bytes), wide), String(code)).toThrow(/bad code/);
    }
  });
  test("decode rejects overlong, non-canonical and >= 2^32 varints", () => {
    const head = [0x48, 0x44, 0x4b, 0x31];
    expect(() =>
      decodeLog(Uint8Array.from([...head, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), wide),
    ).toThrow(/5 bytes/);
    expect(() => decodeLog(Uint8Array.from([...head, 0x81, 0x00]), wide)).toThrow(/canonical/);
    expect(() => decodeLog(Uint8Array.from([...head, 0xff, 0xff, 0xff, 0xff, 0x7f]), wide)).toThrow(
      /2\^32/,
    );
  });
  test("limits: count > maxEvents is rejected before reading records", () => {
    const entries = Array.from({ length: 11 }, (_, i) => key(i * 20, "a"));
    const bytes = encodeLog(entries);
    expect(() => decodeLog(bytes, { maxEvents: 10, maxTotalMs: 60_000 })).toThrow(/maxEvents/);
    expect(decodeLog(bytes, { maxEvents: 11, maxTotalMs: 60_000 })).toHaveLength(11);
  });
  test("limits: a huge claimed count with no data is rejected, not looped over", () => {
    const bytes = Uint8Array.from([0x48, 0x44, 0x4b, 0x31, 0xff, 0xff, 0xff, 0xff, 0x0f]);
    expect(() => decodeLog(bytes, TRIAL_LOG_LIMITS)).toThrow(/maxEvents/);
  });
  test("limits: cumulative ms > maxTotalMs is rejected (oversized trial log)", () => {
    const bytes = encodeLog([key(0, "a"), key(30_000, "b"), key(60_001, "c")]);
    expect(() => decodeLog(bytes, TRIAL_LOG_LIMITS)).toThrow(/cumulative ms/);
    expect(decodeLog(bytes, LEVEL_LOG_LIMITS)).toHaveLength(3);
    const edge = encodeLog([key(60_000, "c")]);
    expect(decodeLog(edge, TRIAL_LOG_LIMITS)).toHaveLength(1);
  });
  test("limits: the trial limit of 3000 events", () => {
    const entries = Array.from({ length: 3001 }, (_, i) => key(i * 10, "a"));
    expect(() => decodeLog(encodeLog(entries), TRIAL_LOG_LIMITS)).toThrow(/maxEvents/);
    expect(decodeLog(encodeLog(entries.slice(0, 3000)), TRIAL_LOG_LIMITS)).toHaveLength(3000);
  });
  test("limit constants match the doc", () => {
    expect(TRIAL_LOG_LIMITS).toEqual({ maxEvents: 3000, maxTotalMs: 60_000 });
    expect(LEVEL_LOG_LIMITS).toEqual({ maxEvents: 50_000, maxTotalMs: 1_200_000 });
  });
});

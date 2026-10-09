import { describe, expect, test } from "vitest";
import {
  canonicalContentJson,
  canonicalJson,
  deepClone,
  fnv1a32,
  hash,
  hashPlain,
  restore,
  SIM_VERSION,
  SimError,
  snapshot,
} from "../src/index.ts";
import { createToy, type ToyState } from "./toy.ts";

/** Independent FNV-1a 32 via BigInt, over UTF-16 code units (low byte, then high byte). */
function fnvRef(s: string): number {
  let h = 0x811c9dc5n;
  for (let i = 0; i < s.length; i++) {
    const u = BigInt(s.charCodeAt(i));
    for (const byte of [u & 0xffn, u >> 8n]) {
      h ^= byte;
      h = (h * 0x01000193n) & 0xffffffffn;
    }
  }
  return Number(h);
}

describe("fnv1a32", () => {
  test("golden values", () => {
    expect(fnv1a32("")).toBe(2166136261);
    expect(fnv1a32("a")).toBe(723832900);
    expect(fnv1a32("foobar")).toBe(2728334074);
    expect(fnv1a32("words")).toBe(817913728);
  });
  test("matches an independent BigInt implementation, including non-ASCII", () => {
    for (const s of ["", "x", "hello world", "é", "日本語", "😀 emoji", "\u0000￿"]) {
      expect(fnv1a32(s)).toBe(fnvRef(s));
    }
  });
});

describe("canonicalJson", () => {
  test("sorts keys by code unit, no whitespace, recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] }, B: 0 })).toBe(
      '{"B":0,"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
  });
  test("key order does not depend on insertion order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  test("accepts null, booleans, strings, arrays, null-prototype objects", () => {
    expect(canonicalJson([null, true, false, 'x"y', []])).toBe('[null,true,false,"x\\"y",[]]');
    const o = Object.create(null) as Record<string, number>;
    o.k = 1;
    expect(canonicalJson(o)).toBe('{"k":1}');
  });
  test("-0 prints as 0", () => {
    expect(canonicalJson([-0, 0])).toBe("[0,0]");
  });
  test("rejects floats, NaN, Infinity and unsafe integers", () => {
    for (const v of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, -(2 ** 53)]) {
      expect(() => canonicalJson({ v })).toThrow(SimError);
    }
  });
  test("rejects non-plain data", () => {
    class Foo {
      x = 1;
    }
    const sym = Symbol("s");
    const bad: unknown[] = [
      undefined,
      { u: undefined },
      () => 1,
      sym,
      10n,
      new Map(),
      new Set(),
      Object.create({ inherited: 1 }),
      new Foo(),
      new Uint8Array(2),
      /re/,
      { [sym]: 1 },
      Object.assign(new Array(3), { 0: 1, 2: 3 }), // sparse: hole at index 1
    ];
    for (const v of bad) expect(() => canonicalJson(v), String(v)).toThrow(SimError);
  });
  test("rejects cycles and __proto__ keys", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalJson(a)).toThrow(/cycle/);
    expect(() => canonicalJson(JSON.parse('{"__proto__": 1}'))).toThrow(/__proto__/);
  });
  test("a shared (non-cyclic) reference is fine", () => {
    const shared = { n: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"n":1},"b":{"n":1}}');
  });
});

describe("canonicalContentJson", () => {
  test("allows finite decimals, prints with Number#toString", () => {
    expect(canonicalContentJson({ b: 1.5, a: [0.1, 2] })).toBe('{"a":[0.1,2],"b":1.5}');
  });
  test("still rejects NaN, Infinity and non-plain data", () => {
    expect(() => canonicalContentJson({ v: Number.NaN })).toThrow();
    expect(() => canonicalContentJson({ v: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalContentJson(new Map())).toThrow();
    expect(() => canonicalContentJson({ u: undefined })).toThrow();
  });
});

describe("deepClone", () => {
  test("produces an equal, fully independent copy", () => {
    const src = { a: [1, { b: 2 }], s: "x", n: null, t: true };
    const copy = deepClone(src);
    expect(copy).toEqual(src);
    expect(copy).not.toBe(src);
    expect(copy.a).not.toBe(src.a);
    (copy.a[1] as { b: number }).b = 99;
    expect((src.a[1] as { b: number }).b).toBe(2);
  });
  test("asserts plain data exactly like canonicalJson", () => {
    for (const v of [{ f: 1.5 }, { u: undefined }, new Map(), [() => 1], { n: Number.NaN }]) {
      expect(() => deepClone(v)).toThrow(SimError);
    }
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => deepClone(a)).toThrow(/cycle/);
  });
  test("normalizes -0 to 0 and keeps canonical form identical", () => {
    const c = deepClone({ z: -0 });
    expect(Object.is(c.z, 0)).toBe(true);
    expect(canonicalJson(c)).toBe(canonicalJson({ z: -0 }));
  });
  test("clones null-prototype objects into plain objects", () => {
    const o = Object.create(null) as Record<string, number>;
    o.k = 1;
    expect(deepClone(o)).toEqual({ k: 1 });
  });
});

describe("hash / snapshot / restore", () => {
  test("hash is 8 lowercase hex chars and equals fnv1a32 of the canonical json", () => {
    const s = createToy(7);
    const h = hash(s);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(h).toBe(fnv1a32(canonicalJson(s)).toString(16).padStart(8, "0"));
    expect(hashPlain(s)).toBe(h);
  });
  test("hash changes when state changes", () => {
    const s = createToy(7);
    const h0 = hash(s);
    s.acc += 1;
    expect(hash(s)).not.toBe(h0);
  });
  test("snapshot/restore round-trips and is independent of the original", () => {
    const s: ToyState = createToy(3);
    s.acc = 5;
    const snap = snapshot(s);
    expect(snap.simVersion).toBe(SIM_VERSION);
    s.acc = 6;
    s.rng[0] = 1;
    const back = restore(snap);
    expect(back.acc).toBe(5);
    expect(hash(back)).not.toBe(hash(s));
    back.rng[1] = 123;
    expect(snap.state.rng[1]).not.toBe(123);
  });
  test("restore throws on a version mismatch", () => {
    const snap = snapshot(createToy(1));
    expect(() => restore({ ...snap, simVersion: 2 as unknown as typeof SIM_VERSION })).toThrow(
      /simVersion/,
    );
  });
  test("snapshot throws on non-plain state", () => {
    const s = createToy(1) as ToyState & { bad?: unknown };
    s.bad = new Map();
    expect(() => snapshot(s)).toThrow(SimError);
  });
});

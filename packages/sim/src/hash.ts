import { SimError } from "./errors.ts";
import { cmpStr } from "./fixed.ts";
import type { LevelState, TrialState } from "./types.ts";

type Mode = "state" | "content";

/** Plain = null prototype, or a prototype that is itself a root (Object.prototype of any realm). Rejects classes, Map, Set, Date... */
const isPlainObject = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === null || Object.getPrototypeOf(proto) === null;
};

function checkNumber(n: number, mode: Mode, path: string): void {
  if (mode === "state") {
    if (!Number.isSafeInteger(n)) throw new SimError(`non-safe-integer number at ${path}: ${n}`);
  } else if (!Number.isFinite(n)) {
    throw new SimError(`non-finite number at ${path}: ${n}`);
  }
}

/** Own enumerable string keys in cmpStr order; throws on symbols and `__proto__`. */
function plainKeys(v: object, path: string): string[] {
  if (Object.getOwnPropertySymbols(v).length > 0) throw new SimError(`symbol key at ${path}`);
  const keys = Object.keys(v);
  if (keys.includes("__proto__")) throw new SimError(`__proto__ key at ${path}`);
  return keys.sort(cmpStr);
}

function canon(v: unknown, mode: Mode, path: string, stack: object[]): string {
  switch (typeof v) {
    case "string":
      return JSON.stringify(v);
    case "boolean":
      return v ? "true" : "false";
    case "number":
      checkNumber(v, mode, path);
      return String(v === 0 ? 0 : v); // -0 prints as 0
    case "object": {
      if (v === null) return "null";
      if (stack.includes(v)) throw new SimError(`cycle at ${path}`);
      stack.push(v);
      let out: string;
      if (Array.isArray(v)) {
        const parts: string[] = [];
        for (let i = 0; i < v.length; i++) {
          if (!(i in v)) throw new SimError(`sparse array at ${path}[${i}]`);
          parts.push(canon(v[i], mode, `${path}[${i}]`, stack));
        }
        out = `[${parts.join(",")}]`;
      } else {
        if (!isPlainObject(v)) throw new SimError(`non-plain object at ${path}`);
        const rec = v as Record<string, unknown>;
        const parts: string[] = [];
        for (const k of plainKeys(v, path)) {
          parts.push(`${JSON.stringify(k)}:${canon(rec[k], mode, `${path}.${k}`, stack)}`);
        }
        out = `{${parts.join(",")}}`;
      }
      stack.pop();
      return out;
    }
    default:
      throw new SimError(`unsupported ${typeof v} at ${path}`);
  }
}

/** Sorted keys (cmpStr), no whitespace. Throws on non-safe-integer numbers, NaN, undefined, functions, non-plain objects. */
export function canonicalJson(v: unknown): string {
  return canon(v, "state", "$", []);
}

/** Same, but finite non-integer numbers are allowed and printed with Number#toString. For CONTENT_VERSION only (content has decimals). */
export function canonicalContentJson(v: unknown): string {
  return canon(v, "content", "$", []);
}

function clone(v: unknown, path: string, stack: object[]): unknown {
  switch (typeof v) {
    case "string":
    case "boolean":
      return v;
    case "number":
      checkNumber(v, "state", path);
      return v === 0 ? 0 : v; // normalizes -0 to 0, matching canonicalJson
    case "object": {
      if (v === null) return null;
      if (stack.includes(v)) throw new SimError(`cycle at ${path}`);
      stack.push(v);
      let out: unknown;
      if (Array.isArray(v)) {
        const arr: unknown[] = [];
        for (let i = 0; i < v.length; i++) {
          if (!(i in v)) throw new SimError(`sparse array at ${path}[${i}]`);
          arr.push(clone(v[i], `${path}[${i}]`, stack));
        }
        out = arr;
      } else {
        if (!isPlainObject(v)) throw new SimError(`non-plain object at ${path}`);
        const rec = v as Record<string, unknown>;
        const obj: Record<string, unknown> = {};
        for (const k of plainKeys(v, path)) obj[k] = clone(rec[k], `${path}.${k}`, stack);
        out = obj;
      }
      stack.pop();
      return out;
    }
    default:
      throw new SimError(`unsupported ${typeof v} at ${path}`);
  }
}

/** Plain-JSON deep copy. Asserts plain data exactly as canonicalJson does (throws on violations). */
export function deepClone<T>(v: T): T {
  return clone(v, "$", []) as T;
}

/** FNV-1a 32 over UTF-16 code units, low byte then high byte of each unit. Offset 0x811c9dc5, prime 0x01000193 via Math.imul. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    h = Math.imul(h ^ (u & 0xff), 0x01000193);
    h = Math.imul(h ^ (u >>> 8), 0x01000193);
  }
  return h >>> 0;
}

/** 8 lowercase hex chars of fnv1a32(canonicalJson(state)). */
export function hash(state: LevelState | TrialState): string {
  return hashPlain(state);
}

/** Same as `hash` for any plain-data state (used by the toy state in kernel tests and by the replay runner). */
export function hashPlain(state: unknown): string {
  return fnv1a32(canonicalJson(state)).toString(16).padStart(8, "0");
}

// hdk1 keystroke log codec (docs/interfaces.md §9.3). Pure bytes; deflate-raw and base64 live in @hd2d/shared.
import { LogError } from "./errors.ts";
import type { SimInput } from "./input.ts";
import { msToTick } from "./time.ts";

export interface LoggedInput {
  ms: number;
  input: SimInput;
} // invariant: input.tick === msToTick(ms)
export interface LogLimits {
  maxEvents: number;
  maxTotalMs: number;
}
export const TRIAL_LOG_LIMITS: LogLimits = { maxEvents: 3000, maxTotalMs: 60_000 };
export const LEVEL_LOG_LIMITS: LogLimits = { maxEvents: 50_000, maxTotalMs: 1_200_000 };

const MAGIC = [0x48, 0x44, 0x4b, 0x31] as const; // "HDK1"
const TWO_32 = 4294967296;
const CODE_ESCAPE = 0;
const CODE_ABANDON = 200;
const CODE_REVIVE_GEM = 201;
const CODE_REVIVE_FEATHER = 202;

function pushVarint(out: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= TWO_32) {
    throw new LogError(`varint out of range: ${value}`);
  }
  let v = value;
  while (v >= 128) {
    out.push((v % 128) + 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function inputToCode(input: SimInput): number {
  if ("cmd" in input) {
    if (input.cmd === "abandon") return CODE_ABANDON;
    return input.source === "gem" ? CODE_REVIVE_GEM : CODE_REVIVE_FEATHER;
  }
  if (input.key === "Escape") return CODE_ESCAPE;
  if (input.key.length === 1) {
    const c = input.key.charCodeAt(0);
    if (c >= 32 && c <= 126) return c - 31;
  }
  throw new LogError(`unencodable key: ${JSON.stringify(input.key)}`);
}

/** Throws LogError if ms is non-monotonic or input.tick !== msToTick(ms). */
export function encodeLog(entries: readonly LoggedInput[]): Uint8Array {
  const out: number[] = [...MAGIC];
  pushVarint(out, entries.length);
  let prev = 0;
  for (const e of entries) {
    if (!Number.isSafeInteger(e.ms) || e.ms < prev) {
      throw new LogError(`non-monotonic or invalid ms: ${e.ms} after ${prev}`);
    }
    if (e.input.tick !== msToTick(e.ms)) {
      throw new LogError(`input.tick ${e.input.tick} !== msToTick(${e.ms}) = ${msToTick(e.ms)}`);
    }
    pushVarint(out, e.ms - prev);
    pushVarint(out, inputToCode(e.input));
    prev = e.ms;
  }
  return Uint8Array.from(out);
}

/** Reads an unsigned LEB128 (<= 5 bytes, < 2^32, canonical form only). Returns [value, nextOffset]. */
function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let scale = 1;
  for (let i = 0; i < 5; i++) {
    const b = bytes[offset + i];
    if (b === undefined) throw new LogError("truncated varint");
    value += (b & 0x7f) * scale;
    if ((b & 0x80) === 0) {
      if (i > 0 && b === 0) throw new LogError("non-canonical varint");
      if (value >= TWO_32) throw new LogError("varint >= 2^32");
      return [value, offset + i + 1];
    }
    scale *= 128;
  }
  throw new LogError("varint longer than 5 bytes");
}

function codeToInput(code: number, ms: number): SimInput {
  const tick = msToTick(ms);
  if (code === CODE_ESCAPE) return { tick, key: "Escape" };
  if (code >= 1 && code <= 95) return { tick, key: String.fromCharCode(code + 31) };
  if (code === CODE_ABANDON) return { tick, cmd: "abandon" };
  if (code === CODE_REVIVE_GEM) return { tick, cmd: "revive", source: "gem" };
  if (code === CODE_REVIVE_FEATHER) return { tick, cmd: "revive", source: "feather" };
  throw new LogError(`bad code: ${code}`);
}

/** Throws LogError: bad magic/varint/code, count > maxEvents, cumulative ms > maxTotalMs, trailing bytes. */
export function decodeLog(bytes: Uint8Array, limits: LogLimits): LoggedInput[] {
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new LogError("bad magic");
  }
  let [count, off] = readVarint(bytes, MAGIC.length);
  if (count > limits.maxEvents)
    throw new LogError(`count ${count} > maxEvents ${limits.maxEvents}`);
  const out: LoggedInput[] = [];
  let ms = 0;
  while (count-- > 0) {
    let dt: number;
    let code: number;
    [dt, off] = readVarint(bytes, off);
    [code, off] = readVarint(bytes, off);
    ms += dt;
    if (ms > limits.maxTotalMs) throw new LogError(`cumulative ms ${ms} > ${limits.maxTotalMs}`);
    out.push({ ms, input: codeToInput(code, ms) });
  }
  if (off !== bytes.length) throw new LogError("trailing bytes");
  return out;
}

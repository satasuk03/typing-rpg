// Test kit: an app bound to a real local D1/KV, a movable clock, and a generator of REAL keystroke logs
// produced by driving @hd2d/sim (human-like jittered IKIs, a few typos).
import { CONTENT_VERSION, contentBundle } from "@hd2d/content";
import { encodeLogWire } from "@hd2d/shared";
import {
  createTrial,
  encodeLog,
  type LoggedInput,
  msToTick,
  replayTrial,
  resolveTrial,
  SIM_VERSION,
} from "@hd2d/sim";
import { createApp } from "../src/app.ts";
import type { Env } from "../src/lib/env.ts";
import { noopLimiter, type RateLimiter } from "../src/lib/ratelimit.ts";

// biome-ignore lint/suspicious/noExplicitAny: test-side parsed JSON
export type J = any;

export interface Clock {
  t: number;
}

export function makeClient(env: Env, clock: Clock, limiter: RateLimiter = noopLimiter) {
  const app = createApp({ now: () => clock.t, limiter });
  return async (
    method: string,
    path: string,
    o: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: J; headers: Headers; raw: string }> => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.token) headers.Authorization = `Bearer ${o.token}`;
    if (o.body !== undefined) headers["content-type"] = "application/json";
    const res = await app.request(
      path,
      { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) },
      env,
    );
    const raw = await res.text();
    let body: J = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body, headers: res.headers, raw };
  };
}
export type Client = ReturnType<typeof makeClient>;

export async function signup(
  api: Client,
): Promise<{ token: string; refresh: string; userId: string }> {
  const r = await api("POST", "/auth/anon", {
    body: { deviceId: crypto.randomUUID(), deviceSecret: newDeviceSecret() },
  });
  if (r.status !== 200) throw new Error(`signup failed ${r.status} ${r.raw}`);
  return { token: r.body.accessToken, refresh: r.body.refreshToken, userId: r.body.userId };
}

export interface Ticket {
  runId: string;
  trialId: string;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  simVersion: number;
  contentVersion: string;
  sig: string;
}

export async function startRun(api: Client, token: string): Promise<Ticket> {
  const r = await api("POST", "/runs/start", {
    token,
    body: { mode: "trial", boardId: "trial_wpm" },
  });
  if (r.status !== 200) throw new Error(`start failed ${r.status} ${r.raw}`);
  return r.body;
}

export const passageOf = (t: Ticket): string =>
  createTrial(resolveTrial(contentBundle, t.trialId), t.seed).passage;

// deterministic PRNG (tests only)
export function mulberry32(a: number): () => number {
  let s = a;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Human-like IKIs: log-normal around `meanMs` (CV about 0.35), floor 55 ms, plus typos (wrong key, then the right one). */
export function humanKeys(passage: string, seed: number, wpm = 60, typoRate = 0.03): LoggedInput[] {
  const rnd = mulberry32(seed);
  const meanMs = 60_000 / (wpm * 5);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const out: LoggedInput[] = [];
  let ms = 0;
  let i = 0;
  const push = (key: string) => out.push({ ms, input: { tick: msToTick(ms), key } });
  push(passage.charAt(i++)); // first key at ms 0
  for (;;) {
    const iki = Math.max(55, Math.round(meanMs * Math.exp(0.33 * gauss() - 0.05)));
    if (ms + iki > 59_800 || i >= passage.length) break;
    ms += iki;
    if (rnd() < typoRate) {
      push(passage.charAt(i) === "q" ? "z" : "q"); // wrong key (stop-on-error: cursor stays)
      const iki2 = Math.max(55, Math.round(meanMs * Math.exp(0.33 * gauss())));
      if (ms + iki2 > 59_800) break;
      ms += iki2;
    }
    push(passage.charAt(i++));
  }
  return out;
}

/** Exactly `n` correct keys (no typos) with wide uniform IKI jitter: passes every heuristic (a clean human-like run). */
export function jitterKeys(
  passage: string,
  n: number,
  seed: number,
  min = 60,
  span = 170,
): LoggedInput[] {
  const rnd = mulberry32(seed);
  const out: LoggedInput[] = [];
  let ms = 0;
  for (let i = 0; i < n; i++) {
    out.push({ ms, input: { tick: msToTick(ms), key: passage.charAt(i) } });
    ms += min + Math.floor(rnd() * span);
  }
  return out;
}

/** Perfectly correct typing with a fixed IKI (a macro). */
export function constantKeys(passage: string, ikiMs: number, maxKeys = 1500): LoggedInput[] {
  const out: LoggedInput[] = [];
  for (let i = 0; i < Math.min(maxKeys, passage.length); i++) {
    const ms = i * ikiMs;
    if (ms > 59_800) break;
    out.push({ ms, input: { tick: msToTick(ms), key: passage.charAt(i) } });
  }
  return out;
}

export const deflateRawB64 = encodeLogWire;

export const newDeviceSecret = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export interface Submission {
  runId: string;
  sig: string;
  logFormat: "hdk1";
  log: string;
  eventCount: number;
  claimed: {
    correctChars: number;
    typos: number;
    wpmX100: number;
    accuracyBp: number;
    finalHash: string;
  };
  simVersion: number;
  contentVersion: string;
  clientVersion: string;
  timerResolutionMs: number;
}

/** What an honest client sends: the claim is the sim's own result for exactly this log. */
export async function buildSubmission(t: Ticket, entries: LoggedInput[]): Promise<Submission> {
  const def = resolveTrial(contentBundle, t.trialId);
  const rs = replayTrial(
    def,
    t.seed,
    entries.map((e) => e.input),
    { collectEvents: false },
  );
  const r = rs.result;
  if (!r) throw new Error("no result");
  return {
    runId: t.runId,
    sig: t.sig,
    logFormat: "hdk1",
    log: await deflateRawB64(encodeLog(entries)),
    eventCount: entries.length,
    claimed: {
      correctChars: r.correctChars,
      typos: r.typos,
      wpmX100: r.wpmX100,
      accuracyBp: r.accuracyBp,
      finalHash: rs.hash,
    },
    simVersion: SIM_VERSION,
    contentVersion: CONTENT_VERSION,
    clientVersion: "test",
    timerResolutionMs: 1,
  };
}

export const submit = (api: Client, token: string, s: Submission, key: string = s.runId) =>
  api("POST", "/runs/submit", { token, body: s, headers: { "Idempotency-Key": key } });

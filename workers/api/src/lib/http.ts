import type { Context } from "hono";
import { type AccessClaims, verifyJwt } from "./crypto.ts";
import type { Env } from "./env.ts";
import { ApiError } from "./errors.ts";
import type { Bucket, RateLimiter } from "./ratelimit.ts";

export interface Deps {
  /** Epoch ms. Injectable so tests can move the clock (ticket expiry, the 60 s Trial duration check). */
  now: () => number;
  limiter: RateLimiter;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { deps: Deps; user: AccessClaims | null };
};
export type Ctx = Context<AppEnv>;

const MIN_SECRET_CHARS = 32;

/** L3: both secrets present, >= 32 chars, distinct, and no dev-only- placeholder outside ENV=local. */
export function secretOf(env: Env, name: "JWT_SECRET" | "TICKET_SECRET"): string {
  const jwt = env.JWT_SECRET;
  const ticket = env.TICKET_SECRET;
  const bad = (why: string) => new ApiError("internal", `server misconfigured: ${why}`);
  for (const [n, v] of [
    ["JWT_SECRET", jwt],
    ["TICKET_SECRET", ticket],
  ] as const) {
    if (!v) throw bad(`${n} is not configured`);
    if (v.length < MIN_SECRET_CHARS) throw bad(`${n} must be at least ${MIN_SECRET_CHARS} chars`);
    if (v.startsWith("dev-only-") && env.ENV !== "local") {
      throw bad(`${n} is a dev placeholder (only allowed with ENV=local)`);
    }
  }
  if (jwt === ticket) throw bad("JWT_SECRET and TICKET_SECRET must differ");
  return (name === "JWT_SECRET" ? jwt : ticket) as string;
}

/** Bearer auth. `required: false` yields null when no Authorization header is present (a bad token still 401s). */
export async function authenticate(c: Ctx, required: boolean): Promise<AccessClaims | null> {
  const h = c.req.header("Authorization");
  if (!h) {
    if (required) throw new ApiError("unauthorized", "missing bearer token");
    return null;
  }
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) throw new ApiError("unauthorized", "malformed Authorization header");
  const r = await verifyJwt(
    secretOf(c.env, "JWT_SECRET"),
    m[1] as string,
    Math.floor(c.get("deps").now() / 1000),
  );
  if (!r.ok) {
    throw r.reason === "expired"
      ? new ApiError("token_expired", "access token expired")
      : new ApiError("unauthorized", "invalid access token");
  }
  return r.claims;
}

export async function rateLimit(c: Ctx, bucket: Bucket, key: string): Promise<void> {
  if (!(await c.get("deps").limiter.allow(c.env, bucket, key))) {
    throw new ApiError("rate_limited", "too many requests");
  }
}

/** Reads + validates a JSON body against a zod schema from @hd2d/shared (any object with safeParse). */
export async function parseBody<T>(
  c: Ctx,
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: unknown[] } };
  },
  maxChars: number,
  pre?: (raw: unknown) => void,
): Promise<T> {
  // L1: refuse on Content-Length before reading anything, and cap chunked bodies while streaming.
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maxChars) {
    throw new ApiError("payload_too_large", "request body too large");
  }
  const text = await readCapped(c.req.raw.body, maxChars);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "body is not valid JSON");
  }
  pre?.(raw);
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new ApiError("bad_request", "invalid request body", r.error.issues.slice(0, 5));
  return r.data;
}

/** Reads a request body as UTF-8 text, aborting once more than `maxBytes` have arrived. */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError("payload_too_large", "request body too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const ch of chunks) {
    all.set(ch, o);
    o += ch.length;
  }
  return new TextDecoder().decode(all);
}

/** Schedule background work after the response (waitUntil); where no ExecutionContext exists (unit tests) await it. */
export async function defer(c: Ctx, work: Promise<unknown>): Promise<void> {
  const safe = work.catch((e) => console.error("deferred task failed", e));
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    await safe;
  }
}

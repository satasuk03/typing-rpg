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

export function secretOf(env: Env, name: "JWT_SECRET" | "TICKET_SECRET"): string {
  const v = env[name];
  if (!v) throw new ApiError("internal", `${name} is not configured`);
  return v;
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
  const text = await c.req.text();
  if (text.length > maxChars) throw new ApiError("payload_too_large", "request body too large");
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

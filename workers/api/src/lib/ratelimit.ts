// Rate limiting behind an interface: the Workers Rate Limiting bindings in production, no-op or in-memory in tests.
import type { Env } from "./env.ts";
import { ApiError } from "./errors.ts";

export type Bucket = "auth" | "save" | "run" | "lb";

export interface RateLimiter {
  /** true = allowed. */
  allow(env: Env, bucket: Bucket, key: string): Promise<boolean>;
}

const BINDING = { auth: "RL_AUTH", save: "RL_SAVE", run: "RL_RUN", lb: "RL_LB" } as const;

/**
 * Uses the wrangler.toml [[ratelimits]] binding. FAILS CLOSED: a missing binding throws (500) unless the
 * operator explicitly sets RATE_LIMIT_DISABLED=1 (local/test only).
 */
export const bindingLimiter: RateLimiter = {
  async allow(env, bucket, key) {
    const b = env[BINDING[bucket]];
    if (!b) {
      if (env.RATE_LIMIT_DISABLED === "1") return true;
      throw new ApiError("internal", `rate limiter binding ${BINDING[bucket]} is not configured`);
    }
    return (await b.limit({ key: `${bucket}:${key}` })).success;
  },
};

export const noopLimiter: RateLimiter = { allow: async () => true };

/** Fixed-window in-memory limiter (tests; per-isolate in production would be useless, so not used there). */
export function memoryLimiter(
  limits: Partial<Record<Bucket, number>>,
  windowMs = 60_000,
  now: () => number = () => Date.now(),
): RateLimiter {
  const hits = new Map<string, { start: number; n: number }>();
  return {
    async allow(_env, bucket, key) {
      const limit = limits[bucket];
      if (limit === undefined) return true;
      const k = `${bucket}:${key}`;
      const t = now();
      const h = hits.get(k);
      if (!h || t - h.start >= windowMs) {
        hits.set(k, { start: t, n: 1 });
        return true;
      }
      h.n++;
      return h.n <= limit;
    },
  };
}

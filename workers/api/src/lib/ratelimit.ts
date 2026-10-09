// Rate limiting behind an interface: the Workers Rate Limiting bindings in production, no-op or in-memory in tests.
import type { Env } from "./env.ts";

export type Bucket = "auth" | "save" | "run";

export interface RateLimiter {
  /** true = allowed. */
  allow(env: Env, bucket: Bucket, key: string): Promise<boolean>;
}

const BINDING = { auth: "RL_AUTH", save: "RL_SAVE", run: "RL_RUN" } as const;

/** Uses the wrangler.toml [[ratelimits]] binding; allows everything when the binding is absent. */
export const bindingLimiter: RateLimiter = {
  async allow(env, bucket, key) {
    const b = env[BINDING[bucket]];
    if (!b) return true;
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

// KV top-100 leaderboard cache (rebuilt by the 60 s cron and when a new score enters the top 100).
import { leaderboardTop } from "../db/index.ts";
import { BOARD_ID, type Env, periodKeyFor, type Scope } from "./env.ts";

export const TOP_N = 100;
const TTL_S = 300; // safety net: if the cron dies the cache expires and readers fall back to live D1

export interface CachedEntry {
  rank: number;
  /** random public id (users.public_id), never the internal user id. */
  publicId: string;
  displayName: string;
  wpmX100: number;
  accuracyBp: number;
  achievedAt: number;
}
export interface CachedTop {
  periodKey: string;
  updatedAt: number;
  top: CachedEntry[];
}

export const cacheKey = (periodKey: string): string => `lb:${BOARD_ID}:${periodKey}`;

export async function buildTop(env: Env, scope: Scope, now: number): Promise<CachedTop> {
  const periodKey = periodKeyFor(env, scope);
  const rows = await leaderboardTop(env.DB, { boardId: BOARD_ID, periodKey, limit: TOP_N });
  return {
    periodKey,
    updatedAt: now,
    top: rows.map((r) => ({
      rank: r.rank,
      publicId: r.public_id ?? "unknown",
      displayName: r.display_name,
      wpmX100: r.wpm_x100,
      accuracyBp: r.accuracy_bp,
      achievedAt: r.achieved_at,
    })),
  };
}

export async function rebuildTopCache(env: Env, scope: Scope, now: number): Promise<CachedTop> {
  const built = await buildTop(env, scope, now);
  await env.LB_CACHE.put(cacheKey(built.periodKey), JSON.stringify(built), {
    expirationTtl: TTL_S,
  });
  return built;
}

export async function rebuildAllTopCaches(env: Env, now: number): Promise<void> {
  await Promise.all([rebuildTopCache(env, "season", now), rebuildTopCache(env, "all", now)]);
}

/**
 * Cached top-100. On a KV miss serve a live D1 result WITHOUT writing KV (L2): rebuilds belong to the cron and to
 * waitUntil after a qualifying submit, so an anonymous reader can never trigger KV writes.
 */
export async function readTop(env: Env, scope: Scope, now: number): Promise<CachedTop> {
  const hit = await env.LB_CACHE.get<CachedTop>(cacheKey(periodKeyFor(env, scope)), "json");
  if (hit) return hit;
  return buildTop(env, scope, now);
}

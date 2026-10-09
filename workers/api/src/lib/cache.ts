// KV top-100 leaderboard cache (rebuilt by the 60 s cron and when a new score enters the top 100).
import { leaderboardTop } from "../db/index.ts";
import { BOARD_ID, type Env, periodKeyFor, type Scope } from "./env.ts";

export const TOP_N = 100;
const TTL_S = 300; // safety net: if the cron dies the cache expires and readers fall back to live D1

export interface CachedEntry {
  rank: number;
  userId: string;
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
      userId: r.user_id,
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

/** Cached top-100, or a live build (written back) on a cache miss. */
export async function readTop(env: Env, scope: Scope, now: number): Promise<CachedTop> {
  const hit = await env.LB_CACHE.get<CachedTop>(cacheKey(periodKeyFor(env, scope)), "json");
  if (hit) return hit;
  return rebuildTopCache(env, scope, now);
}

import { LbTrialQuery } from "@hd2d/shared";
import { Hono } from "hono";
import type { RankedEntry } from "../db/index.ts";
import { leaderboardAround, leaderboardMe } from "../db/index.ts";
import { readTop } from "../lib/cache.ts";
import { BOARD_ID, periodKeyFor } from "../lib/env.ts";
import { ApiError } from "../lib/errors.ts";
import { type AppEnv, authenticate } from "../lib/http.ts";

export const lbRoutes = new Hono<AppEnv>();

const entry = (r: RankedEntry, me: string | null) => ({
  rank: r.rank,
  userId: r.user_id,
  displayName: r.display_name,
  wpmX100: r.wpm_x100,
  accuracyBp: r.accuracy_bp,
  achievedAt: r.achieved_at,
  isMe: r.user_id === me,
});

// Top-100 comes from KV (60 s cron); `me` and `around` are live D1 reads. Anonymous callers get top only.
lbRoutes.get("/trial", async (c) => {
  const q = LbTrialQuery.safeParse(c.req.query());
  if (!q.success) throw new ApiError("bad_request", "invalid query", q.error.issues.slice(0, 5));
  const user = await authenticate(c, q.data.around === "me");
  const uid = user?.sub ?? null;
  const now = c.get("deps").now();
  const cached = await readTop(c.env, q.data.scope, now);
  const periodKey = periodKeyFor(c.env, q.data.scope);

  let me = null;
  let around: ReturnType<typeof entry>[] | undefined;
  if (uid) {
    const mine = await leaderboardMe(c.env.DB, { boardId: BOARD_ID, periodKey, userId: uid });
    me = mine ? entry(mine, uid) : null;
    if (q.data.around === "me") {
      const rows = await leaderboardAround(c.env.DB, { boardId: BOARD_ID, periodKey, userId: uid });
      around = rows.map((r) => entry(r, uid));
    }
  }
  return c.json({
    scope: q.data.scope,
    periodKey,
    updatedAt: cached.updatedAt,
    top: cached.top.map((e) => ({ ...e, isMe: e.userId === uid })),
    me,
    ...(around ? { around } : {}),
  });
});

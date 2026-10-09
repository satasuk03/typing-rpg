import { LbTrialQuery } from "@hd2d/shared";
import { Hono } from "hono";
import { getUserById, leaderboardWindowOk } from "../db/index.ts";
import { type CachedEntry, readTop, TOP_N } from "../lib/cache.ts";
import { BOARD_ID, periodKeyFor } from "../lib/env.ts";
import { ApiError } from "../lib/errors.ts";
import { type AppEnv, authenticate, rateLimit } from "../lib/http.ts";
import { rankOfBest, standingOf } from "../lib/standing.ts";

export const lbRoutes = new Hono<AppEnv>();

type Entry = CachedEntry & { isMe: boolean };

// Top-100 comes from KV (60 s cron). `me` / `around` are live D1 reads. Anonymous callers get the top list only.
// The owner's view merges in their own best, INCLUDING a shadow (flagged) best at its predicted rank (H1); nobody
// else's shadow entry is ever visible.
lbRoutes.get("/trial", async (c) => {
  await rateLimit(c, "lb", c.req.header("CF-Connecting-IP") ?? "local"); // L2
  const q = LbTrialQuery.safeParse(c.req.query());
  if (!q.success) throw new ApiError("bad_request", "invalid query", q.error.issues.slice(0, 5));
  const claims = await authenticate(c, q.data.around === "me");
  const now = c.get("deps").now();
  const cached = await readTop(c.env, q.data.scope, now);
  const periodKey = periodKeyFor(c.env, q.data.scope);

  let top: Entry[] = cached.top.map((e) => ({ ...e, isMe: false }));
  let me: Entry | null = null;
  let around: Entry[] | undefined;

  const self = claims ? await getUserById(c.env.DB, claims.sub) : null;
  if (claims && self) {
    const myPublic = self.public_id ?? self.id;
    top = top.map((e) => ({ ...e, isMe: e.publicId === myPublic }));
    const st = await standingOf(c.env.DB, { boardId: BOARD_ID, periodKey, userId: self.id });
    if (st.kind === "best") {
      const rank = await rankOfBest(
        c.env.DB,
        { boardId: BOARD_ID, periodKey, userId: self.id },
        st.best,
      );
      const mine: Entry = {
        rank,
        publicId: myPublic,
        displayName: self.display_name,
        wpmX100: st.best.wpm_x100,
        accuracyBp: st.best.accuracy_bp,
        achievedAt: st.best.achieved_at,
        isMe: true,
      };
      me = mine;
      // top: replace any stale own row with the effective best at its rank (only if it is inside the top N)
      const others = top.filter((e) => e.publicId !== myPublic);
      if (rank <= TOP_N) {
        others.splice(rank - 1, 0, mine);
        top = others.slice(0, TOP_N).map((e, i) => ({ ...e, rank: i + 1 }));
      } else {
        top = others;
      }
      if (q.data.around === "me") {
        const radius = 10;
        const offset = Math.max(0, rank - 1 - radius);
        const rows = await leaderboardWindowOk(c.env.DB, {
          boardId: BOARD_ID,
          periodKey,
          excludeUserId: self.id,
          offset,
          limit: radius * 2 + 1,
        });
        const asEntry = (r: (typeof rows)[number]): Entry => ({
          rank: 0,
          publicId: r.public_id ?? "unknown",
          displayName: r.display_name,
          wpmX100: r.wpm_x100,
          accuracyBp: r.accuracy_bp,
          achievedAt: r.achieved_at,
          isMe: false,
        });
        const list = rows.map(asEntry);
        list.splice(rank - 1 - offset, 0, mine);
        around = list.slice(0, radius * 2 + 1).map((e, i) => ({ ...e, rank: offset + i + 1 }));
      }
    }
  }
  return c.json({
    scope: q.data.scope,
    periodKey,
    updatedAt: cached.updatedAt,
    top,
    me,
    ...(around ? { around } : {}),
  });
});

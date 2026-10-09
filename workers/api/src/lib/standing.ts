// The owner's view of their own standing (H1). A user's "effective best" is the better of their public ('ok') row and
// their shadow row (best flagged run). pb/rank in submit responses and the owner's /lb views are computed from it, so a
// flagged run and an ok run with the same score are indistinguishable to the client.
import { getLeaderboardEntry, getShadowEntry, predictRank } from "../db/index.ts";

export interface EffectiveBest {
  score: number;
  wpm_x100: number;
  accuracy_bp: number;
  achieved_at: number;
  /** true when the best is a shadow (flagged) run. Server-side only: never expose. */
  shadow: boolean;
}

export type Standing =
  | { kind: "none" }
  | { kind: "removed" } // moderation removed the public row: not ranked
  | { kind: "best"; best: EffectiveBest; okScore: number | null };

export async function standingOf(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string },
): Promise<Standing> {
  const [ok, sh] = await Promise.all([getLeaderboardEntry(db, q), getShadowEntry(db, q)]);
  if (ok?.status === "removed") return { kind: "removed" };
  const okRow = ok && ok.status === "ok" ? ok : null;
  if (!okRow && !sh) return { kind: "none" };
  if (sh && (!okRow || sh.score > okRow.score)) {
    return {
      kind: "best",
      best: { ...sh, shadow: true },
      okScore: okRow?.score ?? null,
    };
  }
  const o = okRow as NonNullable<typeof okRow>;
  return { kind: "best", best: { ...o, shadow: false }, okScore: o.score };
}

/** Rank the effective best holds among OTHER users' public rows. */
export function rankOfBest(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string },
  best: EffectiveBest,
): Promise<number> {
  return predictRank(db, { ...q, score: best.score, achievedAt: best.achieved_at });
}

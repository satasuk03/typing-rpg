// Cron housekeeping (runs next to the KV cache rebuild every minute).

export interface SweepResult {
  expiredRuns: number;
  deletedReplays: number;
}

/**
 * - Open tickets past `expires_at` become `expired` (frees the one-open-ticket slot and keeps the table honest).
 *   Uses idx_runs_open_expiry. A late submit of such a run then gets 409 run_already_submitted (no stored log hash).
 * - Run replays past their 90-day TTL are deleted (idx_run_replays_expiry).
 */
export async function sweepExpired(db: D1Database, now: number): Promise<SweepResult> {
  const [runs, replays] = await db.batch([
    db
      .prepare(
        "UPDATE runs SET status = 'expired', error_code = 'run_expired' WHERE status = 'open' AND expires_at < ?1",
      )
      .bind(now),
    db.prepare("DELETE FROM run_replays WHERE expires_at < ?1").bind(now),
  ]);
  return {
    expiredRuns: runs?.meta.changes ?? 0,
    deletedReplays: replays?.meta.changes ?? 0,
  };
}

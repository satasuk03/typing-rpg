// Thin prepared-statement layer over D1. No HTTP, no crypto, no clock, no randomness here:
// callers (T5.2) pass ids, nonces, hashes and `now` in. `*Stmt` builders return a D1PreparedStatement so the
// API can compose them into one db.batch() (a single transaction); the plain functions run one operation.

import type {
  FlagReviewState,
  FlagSeverity,
  LbStatus,
  RankedEntry,
  RefreshTokenRow,
  RunMode,
  RunRow,
  RunStatus,
  SaveRevisionRow,
  SaveRow,
  UserRow,
} from "./types.ts";

const SAVE_HISTORY_KEEP = 5; // enforced by trigger trg_save_revisions_prune (migration 0002)

export { SAVE_HISTORY_KEEP };

// ---------------------------------------------------------------- users / devices

export function insertUserStmt(
  db: D1Database,
  u: {
    id: string;
    displayName: string;
    friendCode: string;
    ageBand?: UserRow["age_band"];
    region?: string | null;
    publicId?: string | null;
    now: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO users (id, display_name, friend_code, age_band, region, created_at, public_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(
      u.id,
      u.displayName,
      u.friendCode,
      u.ageBand ?? "unknown",
      u.region ?? null,
      u.now,
      u.publicId ?? null,
    );
}

export function insertDeviceStmt(
  db: D1Database,
  deviceId: string,
  userId: string,
  now: number,
  secretHash: string | null = null,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO devices (device_id, user_id, created_at, last_seen_at, device_secret_hash) VALUES (?1, ?2, ?3, ?3, ?4)",
    )
    .bind(deviceId, userId, now, secretHash);
}

/** The device's owner plus the stored sha256(deviceSecret) hex (null for pre-0006 devices). */
export async function getDeviceWithUser(
  db: D1Database,
  deviceId: string,
): Promise<{ user: UserRow; secretHash: string | null } | null> {
  const r = await db
    .prepare(
      `SELECT u.*, d.device_secret_hash AS device_secret_hash FROM devices d JOIN users u ON u.id = d.user_id
       WHERE d.device_id = ?1 AND u.deleted_at IS NULL`,
    )
    .bind(deviceId)
    .first<UserRow & { device_secret_hash: string | null }>();
  if (!r) return null;
  const { device_secret_hash, ...user } = r;
  return { user, secretHash: device_secret_hash };
}

export function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db
    .prepare("SELECT * FROM users WHERE id = ?1 AND deleted_at IS NULL")
    .bind(userId)
    .first<UserRow>();
}

/** The caller's own row for a board-period regardless of status (incl. 'removed'), for PB / rank prediction. */
export function getLeaderboardEntry(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string },
): Promise<{
  score: number;
  wpm_x100: number;
  accuracy_bp: number;
  achieved_at: number;
  status: LbStatus;
} | null> {
  return db
    .prepare(
      "SELECT score, wpm_x100, accuracy_bp, achieved_at, status FROM leaderboard_entries WHERE board_id = ?1 AND period_key = ?2 AND user_id = ?3",
    )
    .bind(q.boardId, q.periodKey, q.userId)
    .first<{
      score: number;
      wpm_x100: number;
      accuracy_bp: number;
      achieved_at: number;
      status: LbStatus;
    }>();
}

/** 1 + the number of OTHER users' 'ok' rows that would rank ahead of `score` achieved at `achievedAt`. */
export async function predictRank(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string; score: number; achievedAt: number },
): Promise<number> {
  const c = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leaderboard_entries WHERE board_id = ?1 AND period_key = ?2 AND status = 'ok'
         AND user_id <> ?3 AND (score > ?4 OR (score = ?4 AND achieved_at <= ?5))`,
    )
    .bind(q.boardId, q.periodKey, q.userId, q.score, q.achievedAt)
    .first<{ n: number }>();
  return (c?.n ?? 0) + 1;
}

export function getUserByDevice(db: D1Database, deviceId: string): Promise<UserRow | null> {
  return db
    .prepare(
      "SELECT u.* FROM devices d JOIN users u ON u.id = d.user_id WHERE d.device_id = ?1 AND u.deleted_at IS NULL",
    )
    .bind(deviceId)
    .first<UserRow>();
}

// ---------------------------------------------------------------- refresh tokens

export function insertRefreshTokenStmt(
  db: D1Database,
  t: {
    tokenHash: string;
    userId: string;
    deviceId: string | null;
    familyId: string;
    now: number;
    expiresAt: number;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO refresh_tokens (token_hash, user_id, device_id, family_id, parent_hash, issued_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)`,
    )
    .bind(t.tokenHash, t.userId, t.deviceId, t.familyId, t.now, t.expiresAt);
}

export type RotateResult =
  | { status: "ok"; userId: string; deviceId: string | null; familyId: string; graceReplay?: true }
  | { status: "invalid" } // unknown or expired -> 401 refresh_invalid
  | { status: "reused" }; // already rotated/revoked -> family revoked -> 401 refresh_reused

/**
 * Exchange `oldHash` for `newHash` (same family). One batch = one transaction: mark the old token rotated
 * (only if still live) and insert the child guarded on that mark. Presenting an already-rotated or revoked
 * token revokes the whole family, EXCEPT inside the grace window: the same parent presented again within `graceMs`
 * of its rotation, asking for the same (deterministically derived) child, while that child is still unused and
 * the family is live, is answered `ok` + `graceReplay` (a lost-response retry, not theft).
 */
export async function rotateRefreshToken(
  db: D1Database,
  a: { oldHash: string; newHash: string; now: number; expiresAt: number; graceMs?: number },
): Promise<RotateResult> {
  const mark = db
    .prepare(
      `UPDATE refresh_tokens SET rotated_at = ?3, replaced_by = ?2
       WHERE token_hash = ?1 AND rotated_at IS NULL AND revoked_at IS NULL AND expires_at > ?3`,
    )
    .bind(a.oldHash, a.newHash, a.now);
  const child = db
    .prepare(
      `INSERT INTO refresh_tokens (token_hash, user_id, device_id, family_id, parent_hash, issued_at, expires_at)
       SELECT ?2, user_id, device_id, family_id, ?1, ?3, ?4 FROM refresh_tokens
       WHERE token_hash = ?1 AND replaced_by = ?2 AND rotated_at = ?3
         AND NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE token_hash = ?2)`,
    )
    .bind(a.oldHash, a.newHash, a.now, a.expiresAt);
  const [m] = await db.batch([mark, child]);
  const old = await db
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?1")
    .bind(a.oldHash)
    .first<RefreshTokenRow>();
  if (m && m.meta.changes === 1 && old) {
    return { status: "ok", userId: old.user_id, deviceId: old.device_id, familyId: old.family_id };
  }
  if (!old) return { status: "invalid" };
  if (
    a.graceMs !== undefined &&
    old.revoked_at === null &&
    old.rotated_at !== null &&
    a.now - old.rotated_at <= a.graceMs &&
    old.replaced_by === a.newHash
  ) {
    const child = await db
      .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?1")
      .bind(a.newHash)
      .first<RefreshTokenRow>();
    if (
      child &&
      child.rotated_at === null &&
      child.revoked_at === null &&
      child.expires_at > a.now
    ) {
      return {
        status: "ok",
        userId: old.user_id,
        deviceId: old.device_id,
        familyId: old.family_id,
        graceReplay: true,
      };
    }
  }
  if (old.rotated_at !== null || old.revoked_at !== null) {
    await revokeRefreshFamily(db, old.family_id, a.now);
    return { status: "reused" };
  }
  return { status: "invalid" }; // expired
}

export async function revokeRefreshFamily(
  db: D1Database,
  familyId: string,
  now: number,
): Promise<number> {
  const r = await db
    .prepare(
      "UPDATE refresh_tokens SET revoked_at = ?2 WHERE family_id = ?1 AND revoked_at IS NULL",
    )
    .bind(familyId, now)
    .run();
  return r.meta.changes;
}

// ---------------------------------------------------------------- saves

export function getSave(db: D1Database, userId: string): Promise<SaveRow | null> {
  return db.prepare("SELECT * FROM saves WHERE user_id = ?1").bind(userId).first<SaveRow>();
}

export function listSaveRevisions(
  db: D1Database,
  userId: string,
): Promise<D1Result<SaveRevisionRow>> {
  return db
    .prepare("SELECT * FROM save_revisions WHERE user_id = ?1 ORDER BY revision DESC")
    .bind(userId)
    .all<SaveRevisionRow>();
}

export type PutSaveResult =
  | { ok: true; revision: number; updatedAt: number }
  | { ok: false; conflict: true; server: SaveRow | null };

/**
 * If-Match semantics. `expectedRevision` 0 means "no save exists yet". On success the new revision is
 * expectedRevision + 1 and the superseded row is archived to save_revisions (trigger keeps the last 5).
 * On mismatch nothing is written and the current server row is returned for the 409 body.
 */
export async function putSave(
  db: D1Database,
  p: {
    userId: string;
    expectedRevision: number;
    blobB64: string;
    summaryJson: string;
    now: number;
  },
): Promise<PutSaveResult> {
  const next = p.expectedRevision + 1;
  let changes: number;
  if (p.expectedRevision === 0) {
    const r = await db
      .prepare(
        `INSERT INTO saves (user_id, revision, blob_b64, summary, updated_at) VALUES (?1, 1, ?2, ?3, ?4)
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(p.userId, p.blobB64, p.summaryJson, p.now)
      .run();
    changes = r.meta.changes;
  } else {
    // Archive + update share the same (user_id, revision) predicate, so both apply or neither does.
    const archive = db
      .prepare(
        `INSERT INTO save_revisions (user_id, revision, blob_b64, summary, created_at)
         SELECT user_id, revision, blob_b64, summary, updated_at FROM saves WHERE user_id = ?1 AND revision = ?2`,
      )
      .bind(p.userId, p.expectedRevision);
    const update = db
      .prepare(
        `UPDATE saves SET revision = ?3, blob_b64 = ?4, summary = ?5, updated_at = ?6
         WHERE user_id = ?1 AND revision = ?2`,
      )
      .bind(p.userId, p.expectedRevision, next, p.blobB64, p.summaryJson, p.now);
    const [, u] = await db.batch([archive, update]);
    changes = u ? u.meta.changes : 0;
  }
  if (changes === 1) return { ok: true, revision: next, updatedAt: p.now };
  return { ok: false, conflict: true, server: await getSave(db, p.userId) };
}

// ---------------------------------------------------------------- runs

export interface NewRun {
  id: string;
  userId: string;
  mode: RunMode;
  boardId: string;
  trialId: string;
  seed: number;
  issuedAt: number;
  expiresAt: number;
  simVersion: number;
  contentVersion: string;
  sig: string;
  periodKey?: string | null;
}

/** Abandon the user's previous open ticket (same mode) and insert the new one, atomically. */
export async function createRun(db: D1Database, r: NewRun): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE runs SET status = 'abandoned' WHERE user_id = ?1 AND mode = ?2 AND status = 'open'",
      )
      .bind(r.userId, r.mode),
    db
      .prepare(
        `INSERT INTO runs (id, user_id, mode, board_id, trial_id, seed, issued_at, expires_at, sim_version, content_version, sig, period_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      )
      .bind(
        r.id,
        r.userId,
        r.mode,
        r.boardId,
        r.trialId,
        r.seed,
        r.issuedAt,
        r.expiresAt,
        r.simVersion,
        r.contentVersion,
        r.sig,
        r.periodKey ?? null,
      ),
  ]);
}

/**
 * Per-user, per-period ticket counters (M1). `consumed` = runs that were actually submitted (any terminal verdict);
 * abandoned/expired/open tickets do NOT advance it, so abandoning never rerolls the passage.
 */
export async function runCounters(
  db: D1Database,
  q: { userId: string; periodKey: string },
): Promise<{ consumed: number; abandoned: number; total: number }> {
  const r = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('accepted','flagged','rejected') THEN 1 ELSE 0 END), 0) AS consumed,
         COALESCE(SUM(CASE WHEN status IN ('abandoned','expired') THEN 1 ELSE 0 END), 0) AS abandoned,
         COUNT(*) AS total
       FROM runs WHERE user_id = ?1 AND mode = 'trial' AND period_key = ?2`,
    )
    .bind(q.userId, q.periodKey)
    .first<{ consumed: number; abandoned: number; total: number }>();
  return r ?? { consumed: 0, abandoned: 0, total: 0 };
}

export async function hasOpenFlag(
  db: D1Database,
  q: { userId: string; reasonCode: string },
): Promise<boolean> {
  const r = await db
    .prepare(
      "SELECT 1 AS x FROM flags WHERE user_id = ?1 AND reason_code = ?2 AND review_state = 'open' LIMIT 1",
    )
    .bind(q.userId, q.reasonCode)
    .first();
  return r !== null;
}

export function getRun(db: D1Database, runId: string): Promise<RunRow | null> {
  return db.prepare("SELECT * FROM runs WHERE id = ?1").bind(runId).first<RunRow>();
}

export interface RunTransition {
  runId: string;
  status: Exclude<RunStatus, "open" | "abandoned">; // accepted | flagged | rejected | expired
  now: number;
  /** Fresh random value per request. */
  submitNonce: string;
  logSha256?: string | null;
  errorCode?: string | null;
  /** JSON string: the success body or the error envelope (replayed verbatim on idempotent resubmits). */
  response?: string | null;
  clientVersion?: string | null;
  timerResolutionMs?: number | null;
  verified?: { wpmX100: number; accuracyBp: number; score: number } | null;
}

/** The idempotency primitive: only an `open` run can transition. `changes === 0` means another request won. */
export function transitionRunStmt(db: D1Database, t: RunTransition): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE runs SET status = ?2, submitted_at = ?3, submit_nonce = ?4, log_sha256 = ?5, error_code = ?6,
         response = ?7, client_version = ?8, timer_resolution_ms = ?9,
         verified_wpm_x100 = ?10, verified_accuracy_bp = ?11, verified_score = ?12
       WHERE id = ?1 AND status = 'open'`,
    )
    .bind(
      t.runId,
      t.status,
      t.now,
      t.submitNonce,
      t.logSha256 ?? null,
      t.errorCode ?? null,
      t.response ?? null,
      t.clientVersion ?? null,
      t.timerResolutionMs ?? null,
      t.verified?.wpmX100 ?? null,
      t.verified?.accuracyBp ?? null,
      t.verified?.score ?? null,
    );
}

/** Returns true iff this call performed the transition (false => lost the race / already submitted). */
export async function transitionRun(db: D1Database, t: RunTransition): Promise<boolean> {
  const r = await transitionRunStmt(db, t).run();
  return r.meta.changes === 1;
}

export interface LbUpsert {
  boardId: string;
  periodKey: string;
  userId: string;
  runId: string;
  wpmX100: number;
  accuracyBp: number;
  achievedAt: number;
  /** 'ok' for accepted runs, 'flagged' for shadow-flagged runs. */
  status: Extract<LbStatus, "ok" | "flagged">;
  submitNonce: string;
}

/**
 * PB upsert guarded by the run's submit_nonce (so only the request that won the transition writes).
 * Replacement rules (existing = the stored row):
 *  - never touch a 'removed' row;
 *  - 'ok' run: replaces if higher score, or if the existing row is a shadow 'flagged' one;
 *  - 'flagged' run: replaces only an existing 'flagged' row with a lower score (it never displaces an 'ok' PB).
 */
export function upsertLeaderboardStmt(db: D1Database, e: LbUpsert): D1PreparedStatement {
  const score = e.wpmX100 * 10_000 + e.accuracyBp;
  return db
    .prepare(
      `INSERT INTO leaderboard_entries (board_id, period_key, user_id, score, wpm_x100, accuracy_bp, run_id, status, achieved_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
       WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?7 AND submit_nonce = ?10)
       ON CONFLICT(board_id, period_key, user_id) DO UPDATE SET
         score = excluded.score, wpm_x100 = excluded.wpm_x100, accuracy_bp = excluded.accuracy_bp,
         run_id = excluded.run_id, status = excluded.status, achieved_at = excluded.achieved_at
       WHERE leaderboard_entries.status <> 'removed' AND CASE excluded.status
         WHEN 'ok' THEN (leaderboard_entries.status = 'flagged' OR excluded.score > leaderboard_entries.score)
         ELSE (leaderboard_entries.status = 'flagged' AND excluded.score > leaderboard_entries.score)
       END`,
    )
    .bind(
      e.boardId,
      e.periodKey,
      e.userId,
      score,
      e.wpmX100,
      e.accuracyBp,
      e.runId,
      e.status,
      e.achievedAt,
      e.submitNonce,
    );
}

export interface ShadowUpsert {
  boardId: string;
  periodKey: string;
  userId: string;
  runId: string;
  wpmX100: number;
  accuracyBp: number;
  achievedAt: number;
  submitNonce: string;
}

/** Owner-only best of FLAGGED runs (H1). Replaces only a lower score; guarded by the run's submit_nonce. */
export function upsertShadowStmt(db: D1Database, e: ShadowUpsert): D1PreparedStatement {
  const score = e.wpmX100 * 10_000 + e.accuracyBp;
  return db
    .prepare(
      `INSERT INTO leaderboard_shadow (board_id, period_key, user_id, score, wpm_x100, accuracy_bp, run_id, achieved_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
       WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?7 AND submit_nonce = ?9)
       ON CONFLICT(board_id, period_key, user_id) DO UPDATE SET
         score = excluded.score, wpm_x100 = excluded.wpm_x100, accuracy_bp = excluded.accuracy_bp,
         run_id = excluded.run_id, achieved_at = excluded.achieved_at
       WHERE excluded.score > leaderboard_shadow.score`,
    )
    .bind(
      e.boardId,
      e.periodKey,
      e.userId,
      score,
      e.wpmX100,
      e.accuracyBp,
      e.runId,
      e.achievedAt,
      e.submitNonce,
    );
}

export interface ShadowRow {
  score: number;
  wpm_x100: number;
  accuracy_bp: number;
  achieved_at: number;
}

export function getShadowEntry(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string },
): Promise<ShadowRow | null> {
  return db
    .prepare(
      "SELECT score, wpm_x100, accuracy_bp, achieved_at FROM leaderboard_shadow WHERE board_id = ?1 AND period_key = ?2 AND user_id = ?3",
    )
    .bind(q.boardId, q.periodKey, q.userId)
    .first<ShadowRow>();
}

/** Public ('ok') rows in rank order, skipping `excludeUserId`, for splicing the owner's shadow entry in (H1). */
export async function leaderboardWindowOk(
  db: D1Database,
  q: {
    boardId: string;
    periodKey: string;
    excludeUserId: string;
    offset: number;
    limit: number;
  },
): Promise<Omit<RankedEntry, "rank">[]> {
  const r = await db
    .prepare(
      `${RANK_SELECT} WHERE e.board_id = ?1 AND e.period_key = ?2 AND e.status = 'ok' AND e.user_id <> ?3
       ${ORDER} LIMIT ?4 OFFSET ?5`,
    )
    .bind(q.boardId, q.periodKey, q.excludeUserId, q.limit, q.offset)
    .all<Omit<RankedEntry, "rank">>();
  return r.results;
}

export function insertRunReplayStmt(
  db: D1Database,
  r: { runId: string; logB64: string; expiresAt: number; submitNonce: string },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO run_replays (run_id, log_b64, expires_at)
       SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?1 AND submit_nonce = ?4)
       ON CONFLICT(run_id) DO NOTHING`,
    )
    .bind(r.runId, r.logB64, r.expiresAt, r.submitNonce);
}

/**
 * Race-safe submit persistence (interfaces §10 M8): transition + PB upserts + replay + flags in one batch.
 * Returns false if the conditional UPDATE changed 0 rows (caller re-reads the run and answers per step 2a).
 */
export async function persistRunResult(
  db: D1Database,
  a: {
    transition: RunTransition;
    leaderboard?: Omit<LbUpsert, "submitNonce" | "runId">[];
    shadow?: Omit<ShadowUpsert, "submitNonce" | "runId">[];
    replay?: { logB64: string; expiresAt: number };
    flags?: Omit<NewFlag, "guard">[];
  },
): Promise<boolean> {
  const { transition: t } = a;
  const stmts: D1PreparedStatement[] = [transitionRunStmt(db, t)];
  for (const e of a.leaderboard ?? [])
    stmts.push(upsertLeaderboardStmt(db, { ...e, runId: t.runId, submitNonce: t.submitNonce }));
  for (const e of a.shadow ?? [])
    stmts.push(upsertShadowStmt(db, { ...e, runId: t.runId, submitNonce: t.submitNonce }));
  if (a.replay)
    stmts.push(
      insertRunReplayStmt(db, { runId: t.runId, submitNonce: t.submitNonce, ...a.replay }),
    );
  for (const f of a.flags ?? [])
    stmts.push(insertFlagStmt(db, { ...f, guard: { runId: t.runId, submitNonce: t.submitNonce } }));
  const res = await db.batch(stmts);
  return res[0]?.meta.changes === 1;
}

// ---------------------------------------------------------------- leaderboard reads

const RANK_SELECT = `SELECT e.board_id, e.period_key, e.user_id, e.score, e.wpm_x100, e.accuracy_bp, e.run_id, e.status,
  e.achieved_at, u.display_name, u.public_id FROM leaderboard_entries e JOIN users u ON u.id = e.user_id`;
const ORDER = "ORDER BY e.score DESC, e.achieved_at ASC, e.user_id ASC";

/** Public top-N: 'ok' rows only. */
export async function leaderboardTop(
  db: D1Database,
  q: { boardId: string; periodKey: string; limit: number },
): Promise<RankedEntry[]> {
  const r = await db
    .prepare(
      `${RANK_SELECT} WHERE e.board_id = ?1 AND e.period_key = ?2 AND e.status = 'ok' ${ORDER} LIMIT ?3`,
    )
    .bind(q.boardId, q.periodKey, q.limit)
    .all<Omit<RankedEntry, "rank">>();
  return r.results.map((row, i) => ({ ...row, rank: i + 1 }));
}

/** The caller's own entry (ok or flagged) with its rank among 'ok' rows (a flagged entry is ranked as if visible). */
export async function leaderboardMe(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string },
): Promise<RankedEntry | null> {
  const row = await db
    .prepare(
      `${RANK_SELECT} WHERE e.board_id = ?1 AND e.period_key = ?2 AND e.user_id = ?3 AND e.status <> 'removed'`,
    )
    .bind(q.boardId, q.periodKey, q.userId)
    .first<Omit<RankedEntry, "rank">>();
  if (!row) return null;
  const c = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM leaderboard_entries WHERE board_id = ?1 AND period_key = ?2 AND status = 'ok'
         AND (score > ?3 OR (score = ?3 AND (achieved_at < ?4 OR (achieved_at = ?4 AND user_id < ?5))))`,
    )
    .bind(q.boardId, q.periodKey, row.score, row.achieved_at, row.user_id)
    .first<{ n: number }>();
  return { ...row, rank: (c?.n ?? 0) + 1 };
}

/**
 * Me +- `radius` (default 10) in the owner's view: all 'ok' rows plus the owner's own flagged row.
 * Other users' flagged rows never appear. Empty if the user has no entry.
 */
export async function leaderboardAround(
  db: D1Database,
  q: { boardId: string; periodKey: string; userId: string; radius?: number },
): Promise<RankedEntry[]> {
  const radius = q.radius ?? 10;
  const me = await leaderboardMe(db, q);
  if (!me) return [];
  const offset = Math.max(0, me.rank - 1 - radius);
  const r = await db
    .prepare(
      `${RANK_SELECT} WHERE e.board_id = ?1 AND e.period_key = ?2 AND (e.status = 'ok' OR (e.status = 'flagged' AND e.user_id = ?3))
       ${ORDER} LIMIT ?4 OFFSET ?5`,
    )
    .bind(q.boardId, q.periodKey, q.userId, radius * 2 + 1, offset)
    .all<Omit<RankedEntry, "rank">>();
  return r.results.map((row, i) => ({ ...row, rank: offset + i + 1 }));
}

// ---------------------------------------------------------------- flags

export interface NewFlag {
  id: string;
  runId: string | null;
  userId: string;
  reasonCode: string;
  severity: FlagSeverity;
  detailsJson?: string | null;
  now: number;
  reviewState?: FlagReviewState;
  /** If set, the row is only inserted when that run's submit_nonce matches (race-safe batches). */
  guard?: { runId: string; submitNonce: string };
}

export function insertFlagStmt(db: D1Database, f: NewFlag): D1PreparedStatement {
  const cols = "(id, run_id, user_id, reason_code, severity, details, review_state, created_at)";
  const state = f.reviewState ?? "open";
  if (f.guard) {
    return db
      .prepare(
        `INSERT INTO flags ${cols} SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         WHERE EXISTS (SELECT 1 FROM runs WHERE id = ?9 AND submit_nonce = ?10)`,
      )
      .bind(
        f.id,
        f.runId,
        f.userId,
        f.reasonCode,
        f.severity,
        f.detailsJson ?? null,
        state,
        f.now,
        f.guard.runId,
        f.guard.submitNonce,
      );
  }
  return db
    .prepare(`INSERT INTO flags ${cols} VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(f.id, f.runId, f.userId, f.reasonCode, f.severity, f.detailsJson ?? null, state, f.now);
}

export async function insertFlag(db: D1Database, f: Omit<NewFlag, "guard">): Promise<void> {
  await insertFlagStmt(db, f).run();
}

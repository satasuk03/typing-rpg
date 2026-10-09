// Typed row shapes for the D1 schema (migrations/0001..0005). Column names are snake_case as stored.

export type RunStatus = "open" | "accepted" | "flagged" | "rejected" | "expired" | "abandoned";
export type RunMode = "trial" | "boss_weekly";
export type LbStatus = "ok" | "flagged" | "removed";
export type FlagSeverity = "info" | "review" | "shadow";
export type FlagReviewState = "open" | "confirmed" | "dismissed";

export interface UserRow {
  id: string;
  display_name: string;
  friend_code: string;
  age_band: "u13" | "13_17" | "adult" | "unknown";
  region: string | null;
  flags: number;
  created_at: number;
  deleted_at: number | null;
  public_id: string | null;
}

export interface DeviceRow {
  device_id: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
}

export interface RefreshTokenRow {
  token_hash: string;
  user_id: string;
  device_id: string | null;
  family_id: string;
  parent_hash: string | null;
  issued_at: number;
  expires_at: number;
  rotated_at: number | null;
  replaced_by: string | null;
  revoked_at: number | null;
}

export interface SaveRow {
  user_id: string;
  revision: number;
  blob_b64: string;
  summary: string; // JSON
  updated_at: number;
}

export interface SaveRevisionRow {
  user_id: string;
  revision: number;
  blob_b64: string;
  summary: string;
  created_at: number;
}

export interface RunRow {
  id: string;
  user_id: string;
  mode: RunMode;
  board_id: string;
  trial_id: string;
  seed: number;
  issued_at: number;
  expires_at: number;
  sim_version: number;
  content_version: string;
  sig: string;
  status: RunStatus;
  submitted_at: number | null;
  log_sha256: string | null;
  submit_nonce: string | null;
  error_code: string | null;
  response: string | null; // JSON: stored success body or error envelope
  client_version: string | null;
  timer_resolution_ms: number | null;
  verified_wpm_x100: number | null;
  verified_accuracy_bp: number | null;
  verified_score: number | null;
  period_key: string | null;
}

export interface LeaderboardEntryRow {
  board_id: string;
  period_key: string;
  user_id: string;
  score: number;
  wpm_x100: number;
  accuracy_bp: number;
  run_id: string;
  status: LbStatus;
  achieved_at: number;
}

/** A ranked leaderboard row joined with the user's display name. */
export interface RankedEntry extends LeaderboardEntryRow {
  rank: number;
  display_name: string;
  /** random public id (users.public_id); the only identifier leaderboards expose. */
  public_id: string | null;
}

export interface FlagRow {
  id: string;
  run_id: string | null;
  user_id: string;
  reason_code: string;
  severity: FlagSeverity;
  details: string | null; // JSON
  review_state: FlagReviewState;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
}

export interface GemLedgerRow {
  id: string;
  user_id: string;
  bucket: "paid" | "free";
  delta: number;
  kind: "purchase" | "grant" | "spend" | "refund" | "chargeback" | "adjust";
  source_type: "purchase" | "reward" | "box" | "shop" | "revive" | "admin";
  source_id: string;
  idempotency_key: string;
  memo: string | null;
  created_at: number;
}

export interface PurchaseRow {
  id: string;
  user_id: string;
  sku: string;
  gems: number;
  amount_cents: number;
  currency: string;
  provider: "paddle" | "stripe";
  provider_ref: string | null;
  status: "pending" | "completed" | "refunded" | "charged_back" | "failed";
  created_at: number;
  updated_at: number;
}

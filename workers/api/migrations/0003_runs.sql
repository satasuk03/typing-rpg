-- 0003: run tickets (seed issuance + anti-cheat state machine, interfaces.md §10).
CREATE TABLE runs (
  id                   TEXT PRIMARY KEY,         -- runId
  user_id              TEXT NOT NULL REFERENCES users(id),
  mode                 TEXT NOT NULL CHECK (mode IN ('trial','boss_weekly')),
  board_id             TEXT NOT NULL,            -- 'trial_wpm'
  trial_id             TEXT NOT NULL,
  seed                 INTEGER NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  issued_at            INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL,
  sim_version          INTEGER NOT NULL,
  content_version      TEXT NOT NULL,
  sig                  TEXT NOT NULL,            -- base64url HMAC ticket signature
  status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','accepted','flagged','rejected','expired','abandoned')),
  submitted_at         INTEGER,
  log_sha256           TEXT,                     -- hex sha256 of the submitted log (idempotent replay match)
  submit_nonce         TEXT,                     -- random per winning request; guards PB/replay inserts
  error_code           TEXT,                     -- ErrorCode when rejected/expired
  response             TEXT,                     -- stored JSON response (success body or error envelope)
  client_version       TEXT,
  timer_resolution_ms  REAL,
  verified_wpm_x100    INTEGER,                  -- from the RE-SIM only; claimed numbers are never stored
  verified_accuracy_bp INTEGER,
  verified_score       INTEGER
) STRICT;

-- One OPEN trial ticket per user (interfaces §9.2). POST /runs/start abandons the old one in the same batch.
CREATE UNIQUE INDEX uq_runs_one_open_trial ON runs(user_id) WHERE status = 'open' AND mode = 'trial';
CREATE INDEX idx_runs_user_issued ON runs(user_id, issued_at DESC);
CREATE INDEX idx_runs_open_expiry ON runs(expires_at) WHERE status = 'open';   -- expiry sweeps

-- Replay logs for top-1000 or flagged runs (90 day TTL; swept by cron on expires_at).
CREATE TABLE run_replays (
  run_id      TEXT PRIMARY KEY REFERENCES runs(id),
  log_b64     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_run_replays_expiry ON run_replays(expires_at);

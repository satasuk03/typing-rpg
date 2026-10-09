-- 0007: API security review fixes (H1, M1/L7, L6).

-- L6: random public id shown on leaderboards instead of the internal user id (which is the JWT `sub`).
ALTER TABLE users ADD COLUMN public_id TEXT;
UPDATE users SET public_id = lower(hex(randomblob(12))) WHERE public_id IS NULL;
CREATE UNIQUE INDEX uq_users_public_id ON users(public_id);

-- L7 / M1: the period (season) the ticket was issued in; the run is credited to that period at submit.
ALTER TABLE runs ADD COLUMN period_key TEXT;
CREATE INDEX idx_runs_user_period ON runs(user_id, period_key, status);

-- H1: the owner's best FLAGGED (shadow) run per board-period, kept apart from the public leaderboard so a flagged
-- run never changes what pb/rank the owner is told. leaderboard_entries now only holds public ('ok') rows (and
-- moderation 'removed' rows); the owner's own views merge this table in.
CREATE TABLE leaderboard_shadow (
  board_id      TEXT NOT NULL,
  period_key    TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  score         INTEGER NOT NULL,
  wpm_x100      INTEGER NOT NULL CHECK (wpm_x100 >= 0),
  accuracy_bp   INTEGER NOT NULL CHECK (accuracy_bp BETWEEN 0 AND 10000),
  run_id        TEXT NOT NULL REFERENCES runs(id),
  achieved_at   INTEGER NOT NULL,
  PRIMARY KEY (board_id, period_key, user_id),
  CHECK (score = wpm_x100 * 10000 + accuracy_bp)
) STRICT;
CREATE INDEX idx_shadow_user ON leaderboard_shadow(user_id);
CREATE INDEX idx_shadow_run ON leaderboard_shadow(run_id);

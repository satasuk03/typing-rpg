-- 0004: leaderboards + anti-cheat flags.
-- score = wpm_x100 * 10000 + accuracy_bp (interfaces §9.2). Higher wins; ties go to the earlier achieved_at.
CREATE TABLE leaderboard_entries (
  board_id      TEXT NOT NULL,                   -- 'trial_wpm'
  period_key    TEXT NOT NULL,                   -- 'all' | 'S1' ...
  user_id       TEXT NOT NULL REFERENCES users(id),
  score         INTEGER NOT NULL,
  wpm_x100      INTEGER NOT NULL CHECK (wpm_x100 >= 0),
  accuracy_bp   INTEGER NOT NULL CHECK (accuracy_bp BETWEEN 0 AND 10000),
  run_id        TEXT NOT NULL REFERENCES runs(id),
  -- 'ok' public; 'flagged' shadow (visible to owner only); 'removed' (moderation) visible to nobody.
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','flagged','removed')),
  achieved_at   INTEGER NOT NULL,
  PRIMARY KEY (board_id, period_key, user_id),   -- one personal best per user per board-period
  CHECK (score = wpm_x100 * 10000 + accuracy_bp)
) STRICT;

-- Top-N and rank counting: equality prefix + status, then the exact ordering. user_id makes ties total.
CREATE INDEX idx_lb_rank ON leaderboard_entries(board_id, period_key, status, score DESC, achieved_at ASC, user_id ASC);
-- Moderation / "my entries" lookups and user deletion.
CREATE INDEX idx_lb_user ON leaderboard_entries(user_id);
CREATE INDEX idx_lb_run ON leaderboard_entries(run_id);

CREATE TABLE flags (
  id            TEXT PRIMARY KEY,
  run_id        TEXT REFERENCES runs(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  reason_code   TEXT NOT NULL,                   -- e.g. 'sustained_wpm','iki_cv','fast_share','quantized','jank','perfect','pb_jump'
  severity      TEXT NOT NULL CHECK (severity IN ('info','review','shadow')),  -- shadow = hides the leaderboard row
  details       TEXT,                            -- JSON heuristic values (kept for threshold tuning)
  review_state  TEXT NOT NULL DEFAULT 'open' CHECK (review_state IN ('open','confirmed','dismissed')),
  reviewed_by   TEXT,
  reviewed_at   INTEGER,
  created_at    INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_flags_review ON flags(review_state, created_at);   -- review queue
CREATE INDEX idx_flags_user ON flags(user_id, created_at);
CREATE INDEX idx_flags_run ON flags(run_id);

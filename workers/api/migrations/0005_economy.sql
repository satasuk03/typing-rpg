-- 0005: economy tables. Empty in the vertical slice; created now so later work needs no rewrite.

-- Append-only gem ledger (one signed row per movement). Balance = SUM(delta) per (user, bucket).
CREATE TABLE gem_ledger (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  bucket           TEXT NOT NULL CHECK (bucket IN ('paid','free')),
  delta            INTEGER NOT NULL CHECK (delta <> 0),
  kind             TEXT NOT NULL CHECK (kind IN ('purchase','grant','spend','refund','chargeback','adjust')),
  source_type      TEXT NOT NULL CHECK (source_type IN ('purchase','reward','box','shop','revive','admin')),
  source_id        TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL UNIQUE,         -- duplicate credit/spend attempts fail on this
  memo             TEXT,
  created_at       INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_gem_ledger_user ON gem_ledger(user_id, created_at);
CREATE INDEX idx_gem_ledger_source ON gem_ledger(source_type, source_id);

CREATE TRIGGER trg_gem_ledger_no_update BEFORE UPDATE ON gem_ledger
BEGIN SELECT RAISE(ABORT, 'gem_ledger is append-only'); END;
CREATE TRIGGER trg_gem_ledger_no_delete BEFORE DELETE ON gem_ledger
BEGIN SELECT RAISE(ABORT, 'gem_ledger is append-only'); END;

CREATE TABLE purchases (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  sku           TEXT NOT NULL,
  gems          INTEGER NOT NULL CHECK (gems > 0),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency      TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('paddle','stripe')),
  provider_ref  TEXT UNIQUE,                     -- provider transaction/session id
  status        TEXT NOT NULL CHECK (status IN ('pending','completed','refunded','charged_back','failed')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_purchases_user ON purchases(user_id, created_at);

-- 0001: identity. Timestamps are integer epoch-ms. IDs are caller-generated (ULID) TEXT.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  friend_code   TEXT NOT NULL UNIQUE,
  age_band      TEXT NOT NULL DEFAULT 'unknown' CHECK (age_band IN ('u13','13_17','adult','unknown')),
  region        TEXT,
  flags         INTEGER NOT NULL DEFAULT 0,      -- bitmask: 1 lb_banned, 2 spend_locked
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
) STRICT;

-- One row per anonymous device id; POST /auth/anon looks the user up here.
CREATE TABLE devices (
  device_id     TEXT PRIMARY KEY,                -- client UUID
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_devices_user ON devices(user_id);

-- Opaque refresh tokens, stored as SHA-256 hex. Rotated on every use.
--   family_id   : constant across a rotation chain; reuse of a rotated token revokes the family.
--   parent_hash : the token this one replaced (NULL for the first token of a family).
--   rotated_at / replaced_by : set when this token has been exchanged for a new one.
CREATE TABLE refresh_tokens (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  device_id    TEXT REFERENCES devices(device_id),
  family_id    TEXT NOT NULL,
  parent_hash  TEXT,
  issued_at    INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  rotated_at   INTEGER,
  replaced_by  TEXT,
  revoked_at   INTEGER
) STRICT;
CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_expiry ON refresh_tokens(expires_at);

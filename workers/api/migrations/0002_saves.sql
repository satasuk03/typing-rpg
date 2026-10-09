-- 0002: saves. The blob is stored opaquely as the base64 wire string (gzip JSON, decoded <= 256 KiB).
-- `saves` holds the CURRENT revision; `save_revisions` holds superseded revisions (rollback).
-- The app copies the old current row into save_revisions in the same batch as the revision-checked UPDATE.
CREATE TABLE saves (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  revision    INTEGER NOT NULL CHECK (revision >= 1),
  blob_b64    TEXT NOT NULL,
  summary     TEXT NOT NULL,                     -- JSON SaveSummary
  updated_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE save_revisions (
  user_id     TEXT NOT NULL REFERENCES users(id),
  revision    INTEGER NOT NULL,
  blob_b64    TEXT NOT NULL,
  summary     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,                  -- when this revision was written
  PRIMARY KEY (user_id, revision)
) STRICT;

-- Pruning: keep only the last 5 superseded revisions per user (trigger, so no app code can forget).
CREATE TRIGGER trg_save_revisions_prune
AFTER INSERT ON save_revisions
BEGIN
  DELETE FROM save_revisions WHERE user_id = NEW.user_id AND revision <= NEW.revision - 5;
END;

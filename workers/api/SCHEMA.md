# D1 schema (T5.1)

Migrations: `migrations/0001..0005_*.sql` (wrangler applies them in order). All tables are `STRICT`; timestamps are integer epoch-ms; ids are caller-generated TEXT (ULID/UUID); enums are `CHECK` constraints; foreign keys are declared (D1 enforces them). Typed rows and prepared queries: `src/db/`.

```
users 1--* devices
users 1--* refresh_tokens (family_id chain, parent_hash)
users 1--1 saves ; users 1--* save_revisions (last 5 superseded)
users 1--* runs 1--0..1 run_replays
users 1--* leaderboard_entries (PK board,period,user) --> runs (the PB run)
users 1--* flags --> runs
users 1--* gem_ledger (append-only) ; users 1--* purchases
```

## Tables, keys, indexes

### users (0001)
PK `id`; UNIQUE `friend_code`. `age_band` CHECK u13/13_17/adult/unknown. `flags` bitmask (1 lb_banned, 2 spend_locked), soft-delete `deleted_at`.

### devices (0001)
PK `device_id` (client UUID) -> `user_id`. Index `idx_devices_user(user_id)`: list/merge a user's devices. Lookup by device id uses the PK (`POST /auth/anon`).

### refresh_tokens (0001)
PK `token_hash` (SHA-256 hex; plaintext never stored). `family_id`, `parent_hash`, `rotated_at`/`replaced_by` (set when exchanged), `revoked_at`.
- `idx_refresh_family(family_id)`: revoke the whole family on reuse.
- `idx_refresh_user(user_id)`: revoke all on logout/delete.
- `idx_refresh_expiry(expires_at)`: purge sweep.

Rotation is one batch: conditional `UPDATE ... WHERE rotated_at IS NULL AND revoked_at IS NULL AND expires_at > now` plus a child `INSERT ... SELECT` guarded on that mark. Presenting a rotated/revoked token revokes the family (`reused`).

### saves / save_revisions (0002)
`saves` PK `user_id` = the CURRENT revision (`blob_b64` is the base64 wire string, stored opaquely; <= 256 KiB decoded is enforced by the API). `save_revisions` PK `(user_id, revision)` = superseded revisions for rollback. `putSave` archives the old row and updates `WHERE user_id=? AND revision=?` in one batch (If-Match; 0 changes = conflict). **Pruning:** trigger `trg_save_revisions_prune` (AFTER INSERT) deletes `revision <= NEW.revision - 5`, so the last 5 superseded revisions (plus the current one) are retained and no app code can forget.

### runs (0003)
Ticket + verdict. `status` CHECK open/accepted/flagged/rejected/expired/abandoned (interfaces §10). `submit_nonce`, `log_sha256`, `error_code`, `response` (stored JSON replayed on idempotent resubmits), `verified_*` (re-sim values only), `sim_version`, `content_version`.
- `uq_runs_one_open_trial` UNIQUE `(user_id) WHERE status='open' AND mode='trial'`: one open Trial ticket per user, enforced by the DB.
- `idx_runs_user_issued(user_id, issued_at DESC)`: history / rate context.
- `idx_runs_open_expiry(expires_at) WHERE status='open'`: expiry sweeps.

### run_replays (0003)
PK `run_id`. Log kept for top-1000 or flagged runs; `idx_run_replays_expiry(expires_at)` for the 90-day TTL sweep.

### leaderboard_entries (0004)
PK `(board_id, period_key, user_id)`: one personal best per user per board-period. `score` CHECK = `wpm_x100*10000 + accuracy_bp`. `status`: `ok` public, `flagged` shadow (owner only), `removed` (nobody).
- `idx_lb_rank(board_id, period_key, status, score DESC, achieved_at, user_id)`: covers top-N (`status='ok'` prefix + ordered scan) and rank counting (`COUNT` of better rows). `user_id` makes ties a total order. Ordering: higher score, then earlier `achieved_at`, then `user_id`.
- `idx_lb_user(user_id)`, `idx_lb_run(run_id)`: moderation / user deletion / run lookup.

Visibility: `leaderboardTop` = `ok` only. `leaderboardMe` = own `ok` or `flagged` row; rank = 1 + number of `ok` rows ahead. `leaderboardAround` = the `ok` rows plus the caller's own flagged row, window rank-10..rank+10 (clamped at the top).

PB upsert (`upsertLeaderboardStmt`), guarded by `EXISTS(run.submit_nonce = ?)`: never touches `removed`; an `ok` run replaces a higher-score-less row or any `flagged` row; a `flagged` run only replaces a lower `flagged` row (never displaces an `ok` PB).

### flags (0004)
PK `id`; `reason_code`, `severity` (info/review/shadow), `details` JSON (heuristic values for threshold tuning), `review_state` (open/confirmed/dismissed), reviewer fields.
- `idx_flags_review(review_state, created_at)`: review queue.
- `idx_flags_user(user_id, created_at)`: per-user history (e.g. PB-jump comparison).
- `idx_flags_run(run_id)`: join from a run.

### gem_ledger, purchases (0005; empty in the slice)
`gem_ledger`: append-only signed movements (`bucket` paid/free, `delta <> 0`), UNIQUE `idempotency_key`, triggers abort UPDATE/DELETE. Indexes `(user_id, created_at)` (history/balance) and `(source_type, source_id)` (audit by purchase/reward). `purchases`: UNIQUE `provider_ref` (webhook dedupe), index `(user_id, created_at)`.

## Security-review additions (0006, 0007)
- `devices.device_secret_hash` (0006): sha256 of the client's 256-bit device secret; `/auth/anon` for a known device id needs the matching secret.
- `users.public_id` (0007, unique): random id shown on leaderboards instead of `users.id`.
- `runs.period_key` (0007): season key fixed at `/runs/start`; the run is credited to it at submit. The per-user ticket sequence (`n`) is the count of `accepted|flagged|rejected` runs for (user, period).
- `leaderboard_shadow` (0007): owner-only best of FLAGGED runs per board-period. `leaderboard_entries` only receives `ok` runs now (and moderation `removed`). pb/rank for the owner use the better of the two rows, so the shadow flag is not observable from responses.

## Notes
- Doc 03's double-entry ledger (accounts/tx/entries) was simplified to a single append-only `gem_ledger` per the T5.1 brief; a later migration may add accounts without rewriting this one.
- Blobs/logs are base64 TEXT, not BLOB: D1 returns BLOB columns as number arrays, and the wire format is already base64.
- CHECK enums cannot be altered in SQLite: adding a run mode/status needs a table-rebuild migration.
- Tests: `tests/db.test.ts` runs the real SQL files against local workerd D1 (via wrangler `getPlatformProxy`, in-memory). `@cloudflare/vitest-pool-workers` peers vitest ^4 and the repo is on vitest 5, so it is not used.

# TODO: after the Chapter I slice

The slice is done: every DoD line is met and the PO signed off on "typing feels juicy" on 2026-10-10. These items are for a later session. For context, read `docs/HANDOFF.md` and `docs/STATUS.md`.

## Needs the PO
- **Deploy the backend.**
  - **Cloudflare IDs:** create the D1 database and the KV namespace, then replace the placeholder `database_id` and KV id in `workers/api/wrangler.toml`.
  - **Secrets:** `wrangler secret put JWT_SECRET` and `wrangler secret put TICKET_SECRET`.
  - **CORS:** set `ALLOWED_ORIGINS`.
  - **Game build:** set `VITE_API_URL`. Until then the game runs local-only (IndexedDB save, no requests).
- **Turnstile:** verify the anti-bot check against the real deployment.
- **Word blocklist:** a human reviews it before release.

## Cleanup round (no PO input needed)
- **Journal translations:** add them to the SaveBlob (`journal.notes`). This needs a `@hd2d/shared` schema bump and an interfaces.md entry.
- **New Game reset:** New Game resets only the local save, so a cloud merge can bring old progress back. Reset or tombstone the cloud save too.
- **Visual nits:**
  - P3-3: the title screen's "Press any key" pulse should stay at alpha 0.55–1.0 and get a 2 px dark stroke (`src/app/screens/title.ts`).
  - In crowded frames a small enemy's BREAK pop can sit about 290 px from its head; the 160 px clamp only applies to the boss.
  - An enemy's own white hit-flash sprite lasts a few frames on cave hits; the W5 glare probe doesn't count it.
- **Lint:** fix the one Biome warning, an optional chain in `hud/plates.ts` `getPlateLabelRectInto`.

## Next big step
- Chapter 2 content and systems, per `docs/IMPLEMENTATION_PLAN.md` and the brainstorm docs.

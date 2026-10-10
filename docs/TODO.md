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

## Cleanup round
Done on 2026-10-10. Save v2 (journal notes, New Game `resetEpoch`), L10 hollow vocab, stale docs, visual nits, and the HUD lint fix are all merged.
- **Lint:** about 63 Biome warnings remain outside the HUD (`level/bot.ts`, `render/post/pipeline.ts`, …). They don't fail the check.
- **New Game:** there's no e2e test for New Game → reload (unit tests cover it). Two devices that each reset offline from the same epoch tie and merge normally (see interfaces v1.8).

## PO feedback 2026-10-10 (done)
- The title logo now reads "Typing Adventure" in pixel art. The skill icons are now 16×16 pixel art.
- **Guard leak (option G, `docs/qa/block-chance-analysis.md`).** Typed guards always work. A stronger attack leaks `clamp(1 − armor/attack, 0, 50%)`.
  - In Ch1 only the Golem and its adds leak (P = 1.25× par). `BOSS_LEVEL_HIT_MULT` went 1.3 → 1.15.
  - The HUD shows a cracked-shield badge, a crimson leak pop, and a hint on the results screen.
- **For Ch2:** set grunt attack power around 1.07× par and elites/bosses 1.25–1.35×. Re-solve `HIT_MULT` per chapter. Check that par−3 upgrades land near 1.3× the damage budget.

## Next big step
- Chapter 2 content and systems, per `docs/IMPLEMENTATION_PLAN.md` and the brainstorm docs.

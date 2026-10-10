# TODO: after the Chapter I slice

The slice is done: every DoD line is met and the PO signed off on "typing feels juicy" on 2026-10-10. These items are for a later session. For context, read `docs/HANDOFF.md` and `docs/STATUS.md`.

## Needs the PO
- **Frontend:** deployed on 2026-10-10. Every push to `main` deploys it to https://satasuk03.github.io/typing-rpg/ (`.github/workflows/deploy-pages.yml`). The workflow runs typecheck, lint and unit tests first. It is local-only: there is no `VITE_API_URL`, so saves stay in IndexedDB and there's no leaderboard.
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
  - Reachable fix: armor +3 costs 1,148 gold in Gear; L1-L9 first-clear gold with 1 star each is about 1,210, so the Golem leak drops from 20% to 3% (test in `apps/game/tests/app/ops.test.ts`).
- **For Ch2:** set grunt attack power around 1.07× par and elites/bosses 1.25–1.35×. Re-solve `HIT_MULT` per chapter. Check that par−3 upgrades land near 1.3× the damage budget.

## PO feedback 2026-10-10: starter kit
- **Done 2026-10-10.** New players start with Fireball + Clean Cut. Aegis unlocks at L1, Steady Hands at L4 and Iron Will at L6. Iron Will's text now states its real effect. A content rule enforces the kit.

## Ch2 art backlog
- **The single source is now `docs/qa/ch2-review-1.md`** (R2, 2026-10-10): 3 P1, 12 P2, 23 P3. It supersedes the per-task lists that used to be here.
- **After the variety pass** (`docs/qa/ch2-variety/`):
  - ~~Hushwood L3 and L4 read close to L1~~: done. L3 is now the heaviest Ch2 level (uncapped p95 14.0 ms vs the 16.8 budget), so include it in the perf re-measure. The L3 hero is dim at battle:2.
  - L6's shrine gate is cut by the top of the frame.
  - L7's reed wall looks coarse up close.
- **Ch1 flipped-normal fix:** this proposal is tracked there too (`docs/qa/ch2-t2.1/proposal-ch1-flipped-normal.jpg`).

## Tech debt
- **Re-measure on a quiet machine with no agents running.** `apps/game/tests/hud/typingPerf.spec.ts` read 0.65 ms/key against the 0.45 budget during T3.1, but `main` read 0.649 under the same load, so no regression is proven. Get a quiet-machine number before Ch2 sign-off.
- **Ch2 HUD follow-ups:** the 250 ms slide-in for the riddle panel, gold trim on elite-owned plates, and possibly a ✚ pulse on the healer's word plate (art §5).
- The `tools/content` validator has no riddle-boss pool rule yet; it's only a comment. T4.3 should add it.
- `tools/balance/src/gear.ts` copies the sim's upgrade-step rule and the `guardLeakBp` formula, because the sim exports neither. Export them from `packages/sim` and have the tool import them, so they can't drift.

## Next big step
- Chapter 2 content and systems, per `docs/IMPLEMENTATION_PLAN.md` and the brainstorm docs.

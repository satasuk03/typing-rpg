# Status — Chapter I vertical slice

Maintained by the orchestrator. One line per task: owner · state · AC evidence.

| Task | Owner (model) | State | AC evidence |
|---|---|---|---|
| T0.1 Repo bootstrap | Platform (sonnet) | **done** (merged e4834d3) | install/typecheck/lint/test/build/bot/balance exit 0; e2e smoke 1 passed; `pnpm dev` serves; api `/health` → `{"ok":true}` (re-verified on main) |
| T0.2 `scripts/check.sh` gate | Platform (sonnet) | **done** | CHECK PASS on main; determinism 1000-run test; purity guard (Biome + Math.random grep) shown failing on violation |
| interfaces.md | Deep reasoner (opus) + Reviewer (opus) | **done: v1.1 approved & merged** | all review items applied; code blocks typecheck (tsc 7, zod 4); re-check with `node docs/tools/extract-interface-blocks.mjs docs/interfaces.md <dir>` |
| T1.1 Sim kernel + publish contracts | Sim (sonnet) | in progress | — |
| T2.1 Render core | Render (sonnet) | **done** (merged, 94a9857) | side-by-sides `apps/game/tests/render/__shots__/side-by-side/*-1280x720.png` (all 4 biomes match the POC; checked by orchestrator after 1 rework); render specs 19/19; CHECK PASS; perf (SwiftShader, indicative only): tier 2 ≈45% of tier 0 cost. Gap: real-GPU fps not yet measured |
| T2.2 World from data | Render (sonnet) | in progress | — |
| T2.5 Audio | Audio (sonnet) | **done** (merged 04fbc98) | 51 unit tests; audio Playwright spec green; `play('key')` p95 0.1 ms (headless); bindings synced to interfaces v1.1 (drift test). **Needs PO listen pass:** `apps/game/src/audio/LISTEN_CHECKLIST.md` at `?scene=audio-test` |
| T5.1 D1 schema + migrations | Backend (sonnet) | in progress | — |

## Notes
- Stack pins: three 0.186.1, vite 8.3.4, typescript 7.0.2 (native tsc), vitest 5.0.3, playwright 1.64.0, biome 2.5.15, hono 4.13.13, wrangler 4.149.0, zod 4.
- Biome excludes `poc/` and `docs/` (POC html is reference-only).
- Agent worktrees branch from the first commit, not main HEAD — briefs must tell agents to `git merge main` first.

## PO decisions log
- 2026-10-09: Combo = hybrid. Mechanics use perfect-word combo (5/15/30/50); VFX colour tiers use per-key streak (10/25/50/100).
- 2026-10-09: Gear Cache weapon type favours the equipped archetype at 40%, with 20% for each other type. Fixed and published.
- 2026-10-09: Typing Trial requires typed spaces (standard WPM).
- 2026-10-09: Keep weakness/shield/BREAK; retune encounter HP in T6.1.

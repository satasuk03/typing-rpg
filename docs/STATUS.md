# Status — Chapter I vertical slice

Maintained by the orchestrator. One line per task: owner · state · AC evidence.

| Task | Owner (model) | State | AC evidence |
|---|---|---|---|
| T0.1 Repo bootstrap | Platform (sonnet) | **done** (merged e4834d3) | install/typecheck/lint/test/build/bot/balance exit 0; e2e smoke 1 passed; `pnpm dev` serves; api `/health` → `{"ok":true}` (re-verified on main) |
| T0.2 `scripts/check.sh` gate | Platform (sonnet) | **done** | CHECK PASS on main; determinism 1000-run test; purity guard (Biome + Math.random grep) shown failing on violation |
| interfaces.md | Deep reasoner (opus) | in progress | — |

## Notes
- Stack pins: three 0.186.1, vite 8.3.4, typescript 7.0.2 (native tsc), vitest 5.0.3, playwright 1.64.0, biome 2.5.15, hono 4.13.13, wrangler 4.149.0, zod 4.
- Biome excludes `poc/` and `docs/` (POC html is reference-only).
- Agent worktrees branch from the first commit, not main HEAD — briefs must tell agents to `git merge main` first.

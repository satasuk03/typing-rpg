# Orchestrator handoff — Chapter I vertical slice

For the next orchestrator session. Read this, then `docs/STATUS.md` (task table, rulings, PO decisions, open items), then `docs/IMPLEMENTATION_PLAN.md` §5–§8 as needed. Don't re-read whole brainstorm docs; the decisions are captured below and in STATUS.

## Where things stand (2026-10-09)

**Git:** `main` is pushed to `origin` (github.com/satasuk03/typing-rpg) as of b6f3bb3 (PO-approved). History contains ~26 MB of old PNG contact sheets from commit 64b4ef0; don't rewrite pushed history without the PO's OK. Agent worktrees branch locally; merge into `main`, then push only when the PO asks.

**Every Definition-of-Done line in plan §1 is met on `main`:**

| DoD line | Evidence |
|---|---|
| Bots clear all 10 levels at 20/40/75 WPM within ±15% of targets | `pnpm bot` (in `scripts/check.sh` as `--quick`), `pnpm balance` (31/31 cells PASS, 200 seeds), `docs/balance-ch1.md` |
| 60 fps @1080p tier 0; tier 2 ≥ 45 fps at 4× CPU throttle | Real Metal (M4 Pro): p95 16.8 ms at all tiers, incl. typing + combat VFX. Retina tier 2 throttled fixed. `docs/perf.md` |
| Zero console errors in a full Ch1 run | `apps/game/tests/perf/full-run.spec.ts` on Metal, L1→L10, 0 errors (15.3 min) |
| Save survives reload + second browser | `pnpm --filter game test:net` (vs real `wrangler dev`), `apps/game/tests/app/save.spec.ts` |
| Leaderboard accepts legit, rejects forged | net e2e + `workers/api/tests/{api,security}.test.ts` |

**Milestones:** M0–M6 done, including both T6.3 polish rounds (HUD H1/H2, level data, world W). What's left is PO sign-off and small polish leftovers.

**Gate:** `bash scripts/check.sh` → CHECK PASS (~1,330 tests: typecheck, Biome lint, vitest, content validate, sim determinism, sim purity, Node↔Chromium parity, bot quick).

## Session 2026-10-10 summary
- Quiet re-measure done (`docs/perf.md`). The first typingPerf reading of 0.74 came from a stale dev server on port 5173: **always pass a unique `PW_PORT`**.
- Merged: Opus review round 2 (`docs/qa/t6.3-review-2.md`, with a round-3 check appended), HUD perf batching, H3 HUD keep-out, W3/W4/W5 world glare and shape fixes, the orb keep-out leak fix, and the PO streak rule (typo drops one tier, interfaces v1.7).
- **PO signed off "juicy" (T2.6) on 2026-10-10.** Remaining: minor leftovers are P3-3 (the title pulse), the small-enemy BREAK pop offset in crowded frames, and the enemy sprite white hit-flash.

## Remaining work (in priority order)

1. **PO sign-off "typing feels juicy" (T2.6 AC)** — not yet given. Point the PO at `pnpm dev` → `http://localhost:5173/?scene=play&level=ch1-l05` (add `&wpm-bot=60` to watch) and the sheets in `apps/game/tests/vfx/__shots__/sheets/*.jpg`. Apply their feedback.
2. **T6.3 leftovers** (all backlog rounds are merged; these are what the last reviews still saw):
   - Boss intro: the Golem reads washed white with sparkle motes during the intro card (`apps/game/tests/vfx/__shots__/metal-l10-boss-intro.png`; that still predates the H1 merge, so re-capture on main first: the HUD should be hidden there now).
   - Fireball + auto-slash on the bright forest still make a large white glare blob next to the hero (`metal-real-skillcast.png`).
   - Parry hex shards and the BREAK ring are barely visible.
   - `tests/level/typing-fx.spec.ts` L10 flaked once on the "pop/tag covers a letter" HUD invariant (passed on re-run): investigate on a quiet machine. (Ch2 L10 "letter outside its plate" flake root-caused and fixed: a wrapped line's trailing space cell lay up to one cell past the plate frame; see `tests/hud/plateWrap.test.ts`. The Ch1 "pop/tag" flake is a different invariant and is still unexplained.)
   - Metal-only specs: run `*.metal.ts` with `apps/game/tests/vfx/playwright.metal.config.ts` (the default configs skip them).
   - A good next step is a second Opus art review on Metal captures of `main` to confirm the backlog is closed and decide on PO sign-off material.
3. **Re-measure on a quiet machine** (no agents running): `apps/game/tests/hud/typingPerf.spec.ts` (budget 0.45 ms/key amortised; it fails only under load) and `typingSettings.spec.ts`. Also re-run `pnpm --filter game exec playwright test -c tests/perf/playwright.config.ts frame-budget` once.
4. **Known small gaps** (STATUS "Open items"): journal translations not in SaveBlob (needs a `@hd2d/shared` schema bump, `journal.notes`); New Game resets only local save (cloud merge may resurrect progress); no "hollow" vocab for L10 (validator warning); Turnstile not verified; `generate.mjs` for levels is stale (JSON is source of truth); spec §10.2 pool sizes outdated (A 576 / B 192).
5. **Deployment** (not done; ask the PO first): D1 `database_id` and KV id in `workers/api/wrangler.toml` are placeholders; secrets via `wrangler secret put JWT_SECRET` / `TICKET_SECRET`; set `ALLOWED_ORIGINS`; the game's API is off by default (`?api=<url>` or `VITE_API_URL`).

## How the orchestration was run (keep doing this)

- **Policy (CLAUDE.md):** workers on Sonnet, design/review/balance analysis on Opus (`deep-reasoner`), **max 3 agents at once**, no orchestration skills — Agent tool directly with `isolation: "worktree"`.
- **Every brief** says: `git merge main` first, ownership paths, what *not* to touch (name the concurrently running agents' files), concrete AC with evidence, commit on branch with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, don't merge.
- **Review before merge:** read the agent's stills yourself (Read tool) — several "very close" claims were wrong; check repo weight (squash-merge and convert to JPEG when an agent commits tens of MB of PNGs); then `git merge --no-ff` and run `scripts/check.sh` on main; update `docs/STATUS.md`; commit.
- **Contract changes** go into `docs/interfaces.md` changelog (now v1.6) — agents propose, the orchestrator records/approves.
- **Visual/art reviews** by an Opus agent capturing on real Metal produced the best feedback (`docs/qa/t6.3-polish-backlog.md`).

## Environment gotchas

- The RTK hook rewrites `git` → `rtk git`, which is blocked inside worktrees: use **`/usr/bin/git`**. `pnpm exec biome` can crash under RTK; use `./node_modules/.bin/biome` or `rtk proxy …`.
- Real GPU in Playwright: `channel: "chromium"`, args `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (see `apps/game/tests/perf/playwright.config.ts`); default headless is SwiftShader (~3 fps, numbers meaningless).
- Agents share ports and CPU: give each Playwright run a **unique port**; under load (load avg 30–50) timing tests flake — re-run alone before calling it a regression. Don't edit `src/` during a running Playwright session (Vite HMR reloads the page).
- Dev routes (`apps/game/src/main.ts`): `?scene=play&level=ch1-lXX[&wpm-bot=N][&onboard=0][&tier=][&fx=0][&demo=1]`, `?scene=level&id=…&pose=…`, `?scene=hud-test`, `?scene=typing-vfx`, `?scene=audio-test`, `?scene=trial`, `?scene=render-test`. Default route boots the title screen.
- Merged agent worktrees live in `.claude/worktrees/` (gitignored); remove merged ones with `git worktree remove --force` + `git branch -D` (locked ones belong to running/just-stopped agents).

## Browser spec list (Playwright, run from `apps/game`)

Always pass a unique port (`PW_PORT`, `LEVEL_PORT`, `PERF_PORT`, `APP_PORT`). Config files: `tests/app/`, `tests/hud/`, `tests/level/`, `tests/perf/` each have `playwright.config.ts`; run as `./node_modules/.bin/playwright test -c tests/<dir>/playwright.config.ts [file]`.

| Spec | What | Cost / notes |
|---|---|---|
| `tests/hud/readability.spec.ts`, `guardLeakHud.spec.ts`, `ch2Hud.spec.ts` | HUD readability, leak badge, Ch2 HUD invariants | in `scripts/check.sh` (~15 s) |
| `tests/level/typing-fx-ch2.spec.ts` (+ shared `tests/level/fxProbe.ts`) | **Required pre-sign-off run, not in check.sh** (about 5 min on Metal, far too slow for the gate): real-runner readability sweep of `ch2-l01`, `ch2-l05`, `ch2-l10` (Hush Spells, riddles, finisher): HUD invariants incl. "letter outside its plate", next-letter contrast, 0 console errors. Run `LEVEL_GL=metal LEVEL_PORT=<port> ./node_modules/.bin/playwright test -c tests/level/playwright.config.ts typing-fx-ch2`. Use Metal: on SwiftShader the bot loses the Willow, so the sentence/riddle phases are not exercised. Regression for the L10 flake: `tests/hud/plateWrap.test.ts` (unit, in check.sh) |
| `tests/app/chapter.spec.ts` | **Ch1 only** (ids filtered to chapter 1 since T3.4): fresh profile, title to CHAPTER COMPLETE, 75 WPM bot, real time | ~15 min, SwiftShader, opt-in |
| `tests/app/ch2Flow.spec.ts` | Ch2 map tabs, unlock moment, Ignore-capitals, intro card (typed with Shift, then skipped) | fast |
| `tests/perf/full-run.spec.ts` | Ch1 L1-L10 in one page, 0 console errors, Metal | ~15 min, opt-in |
| `tests/perf/ch2-levels.spec.ts` (T5.2) | wpm-bot on `ch2-l01`, `ch2-l05`, `ch2-l10` (the Willow: phases, Hush Spells, riddles, finisher), 0 console errors, Metal | ~5 min |
| `tests/perf/full-ch1-ch2.spec.ts` (T5.2) | **Full Ch1 -> Ch2 run**: fresh profile + real save, Ch1 L1-L10, Chapter II unlock moment, Ch2 intro card (real Shift presses), Ch2 L1-L10, 0 console errors, Metal | 32.4 min wall on Metal (all 20 levels cleared first try, 0 errors), opt-in, not in check.sh |
| `tests/perf/frame-budget.spec.ts`, `soak.spec.ts`, `context-loss.spec.ts` | frame budget, soak, WebGL context loss | Metal |

The wpm-bot (`src/level/bot.ts`) sends the sim's next character verbatim, capitals included: the sim reads `event.key`, so exact-case sentence plates (Hush Spells, finisher, Second Wind) need no Shift event. Only the DOM intro card (`#intro-line`) is typed by the specs with real Shift presses.
`pnpm bot` gates all 20 levels (Ch1 then Ch2, each chapter with its own targets and boss); `--chapter 1|2` runs one.

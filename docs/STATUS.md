# Status — Chapter I vertical slice

Maintained by the orchestrator. One line per task: owner · state · AC evidence.

| Task | Owner (model) | State | AC evidence |
|---|---|---|---|
| T0.1 Repo bootstrap | Platform (sonnet) | **done** (merged e4834d3) | install/typecheck/lint/test/build/bot/balance exit 0; e2e smoke 1 passed; `pnpm dev` serves; api `/health` → `{"ok":true}` (re-verified on main) |
| T0.2 `scripts/check.sh` gate | Platform (sonnet) | **done** | CHECK PASS on main; determinism 1000-run test; purity guard (Biome + Math.random grep) shown failing on violation |
| interfaces.md | Deep reasoner (opus) + Reviewer (opus) | **done: v1.1 approved & merged** | all review items applied; code blocks typecheck (tsc 7, zod 4); re-check with `node docs/tools/extract-interface-blocks.mjs docs/interfaces.md <dir>` |
| T1.1 Sim kernel + publish contracts | Sim (sonnet) | **done** (merged f8c4acc) | 1000-run determinism; Node vs Chromium hashes equal golden fixture (now in check.sh); RNG, streams, canonical hash, deepClone, log codec, replay runner tested (254 tests total); purity guard bans approx Math.*, **, localeCompare, Intl, structuredClone (26 guard tests). Sim API functions are throwing stubs until T1.2+ |
| T2.1 Render core | Render (sonnet) | **done** (merged, 94a9857) | side-by-sides `apps/game/tests/render/__shots__/side-by-side/*-1280x720.png` (all 4 biomes match the POC; checked by orchestrator after 1 rework); render specs 19/19; CHECK PASS; perf (SwiftShader, indicative only): tier 2 ≈45% of tier 0 cost. Gap: real-GPU fps not yet measured |
| T2.2 World from data | Render (sonnet) | **done** (merged 31f9791) | 10 LDtk-subset layouts, WorldBuilder with no coordinate literals, validator tests; contact sheet `apps/game/tests/render/__shots__/levels-contact-sheet.png` reviewed by orchestrator. **T6.3 polish backlog:** L9 too dark (hero low contrast), L10 reads orange not violet, L8–L10 similar in walk pose |
| T2.5 Audio | Audio (sonnet) | **done** (merged 04fbc98) | 51 unit tests; audio Playwright spec green; `play('key')` p95 0.1 ms (headless); bindings synced to interfaces v1.1 (drift test). **Needs PO listen pass:** `apps/game/src/audio/LISTEN_CHECKLIST.md` at `?scene=audio-test` |
| T5.1 D1 schema + migrations | Backend (sonnet) | **done** (merged 43eaca3) | 5 STRICT migrations apply clean + idempotent; 15 api tests on real local D1 via `getPlatformProxy` (save If-Match + keep-5, one-open-trial index, idempotent transition, LB around-me + flagged shadow rank, gem ledger append-only, refresh family revocation). Decisions for T5.2: blobs stored as base64 TEXT; flagged owner shadow rank; tie-break achieved_at then user_id |
| T1.1a Contracts published | Sim (sonnet) | **merged early** (2f68711) | events.ts, view.ts, types.ts, content + shared schemas on main; CHECK PASS |
| T2.4 HUD (mock events) | UI (sonnet) | **done** (merged 284b5e2, after 1 rework) | readability sweeps (4 scenarios × 40/90 WPM, every 0.1 s): no plate overlap, ≥14 px, contrast ≥4.5, no pop/banner over a live letter; self-hosted OFL fonts, no external requests; works over the real renderer (`?scene=hud-test&backdrop=world`); 0.37 ms/frame |
| T2.6 Typing VFX: design spec | Art/VFX director (opus) | **done** (ac7396d) | `docs/vfx/typing-vfx-spec.md`: numbers for every effect, readability pixel test, budgets, binding table, 3 chunks |
| T2.6 chunk A: keystroke (HUD) | VFX (sonnet) | in progress | — |
| T1.2 Typing engine | Sim (sonnet) | **done** (merged 9c34986) | 82 rule-named typing tests; property test 120 levels / 697k ticks / 7k guard swaps: no shared first letters, events in tick order; golden typing replays + Chromium parity |
| T1.3 Combat | Sim (sonnet) | **done** (merged 9050770); target re-checked in T1.4 | BALANCE ported, keys diffed against a Python dump; formulas cross-checked (hero stats ch1–30, pace table, prices, gold, ATB 62.5/72.5); 46 combat tests; Chromium parity incl. combat replays. Ref bot 35 WPM/94% × 24 seeds: 12.7 auto-attacks/enc without skills (rate 0.331/s vs Python 0.326/s; HP assumes a 16.4% skill share, and removing it gives 10.7). Real L5/L9 155 s / 162 s (in the 2:45 window) |
| T1.5 Enemies, gimmicks, Ruin Golem | Sim (sonnet) | **done** (merged 60b0e77) | 27 boss phase tests, 12 gimmick tests, property test with gimmicks + boss (763k ticks, no letter collisions); `resolveLevel` implemented; latent Break-after-finisher bug fixed. Boss bot: 40 WPM 100% clear in 4.16 min ✓; 75 WPM 100% in 2.7 min (target 3.4); **20 WPM 63% clear in 9.4 min (target ≥50%, 5.4 min): rubble pacing not scaled by pace** |
| T1.6 Rewards, caches, stars, SRS | Sim (sonnet) | in progress | — |
| T3.1 Level runner (playable levels) | Integration (sonnet) | in progress | — |
| T1.4 Skills + passives | Sim (sonnet) | **done** (merged 7c14f87) | 31 effect tests (6 actives, 8 passives, 4 archetypes, tutorial cues); bot 35 WPM × 24 seeds, starter kit: skill share 15.9% / 15.6% / 16.8% (fixture / L5 / L9), auto-attacks per encounter 10.44 / 9.54 / 10.19 (target ≈11 ±15%: closed); Fireball at −35% (logged for T6.1); interfaces v1.3 records the contract additions |
| T4.1 Word data + validator | Content (sonnet) | **done** (merged 9d96839) | 1089 entries (T1 491, T2 331, biome 76/71/67, guard 43, boss text), 31 trial passages (1605–1730 chars, tight difficulty spread); validator in check.sh, CONTENT_VERSION 70d9cd08; orchestrator sampled definitions + passages. Blocklist needs human review before release |
| T4.2 Level/enemy/gear/skill data | Content (sonnet) | **done** (merged 9df36fb) | 6 enemies, Ruin Golem, 10 levels fit to layout anchors, 12 gear, 6 actives + 8 passives; validator cross-checks layouts, sprite + sfx ids; CONTENT_VERSION 9d21ae83. Encounter HP keeps the sim's 36 s TTK (L3–L9 ≈ 2:40); grunt hit 3.85–7.6 solved to the sim damage budget (T6.1 retune). Warning: no 'hollow' vocab for L10 |
| Trial sim mode | Sim (sonnet) | **done** (merged 73a99a8) | 28 trial tests (clock on first key, 3600-tick cutoff, stop-on-error, score formula hand-checked); golden + Chromium parity; anti-cheat helpers `resimTrialLog` / `trialClaimMismatches`; 3000-event re-sim median 0.29 ms |
| T5.2 API + anti-cheat | Backend (sonnet) | **merged** (723a921); security follow-up in progress | 40 integration + 7 heuristics tests on real local D1: forged result → 422 `resim_mismatch` with nothing written; forged timing (5 ms / constant IKIs) → shadow-flagged, owner-only; replay byte-identical, concurrent submits → one write; refresh reuse revokes the family; KV top-100 cron. **Follow-up done** (8ce43e0): device-secret auth (sha256 only, constant-time, no existence oracle), shared `compress.ts`, save 404, status table in interfaces v1.2, expiry/TTL sweep. 560 tests. **Opus security review done:** no ship-blockers, no injection, no auth bypass, no fake scores. **All fixed** (bfb115c, interfaces v1.4): flagged/ok responses identical (test), shadow table, per-user seed sequence + abandon_rate flag, CORS allowlist, fail-closed limits, body cap, JWT aud, 10 s refresh grace, publicId, period key on run, headers. 66 api tests |
| T5.3 Client net layer + Trial screen | Backend (sonnet) | **done** (merged 7b4d8d3) | save merge helpers (400-case property test: idempotent, no lost chests, gold never summed); auth/sync/trial unit tests; **e2e vs real wrangler dev (orchestrator re-ran, 3/3):** legit 60 s Trial accepted + on the board with server WPM = client WPM; save persists across reload + second browser; forged claim → 422 shown in UI. Run with `pnpm --filter game test:net` |

## Notes
- Stack pins: three 0.186.1, vite 8.3.4, typescript 7.0.2 (native tsc), vitest 5.0.3, playwright 1.64.0, biome 2.5.15, hono 4.13.13, wrangler 4.149.0, zod 4.
- Biome excludes `poc/` and `docs/` (POC html is reference-only).
- Agent worktrees branch from the first commit, not main HEAD — briefs must tell agents to `git merge main` first.

## Open items for later tasks
- T1.5 (ruled): adds use the EnemyDef stats scaled to ≈58.8 HP in L10; `doomEveryS` counts from the previous Doom's resolution; Frost Lock delays attacks only, not Doom or phase timers; `untouched` counts hits that dealt HP damage.
- T1.6: `resolveLevel` must filter pools by level `plateLength`; `unlockLevel` = first clear unlocks.
- Content: add 'hollow' vocab for L10; skill text placeholders `{heal}` / `{hits}`; gear and skill icon art ids are placeholders.
- **T6.1 balance (key risks):** normal-level active time at 40/75 WPM is 1.3 / 0.65 min against §9's 2.4–3.0 / 1.7–2.2 (much too fast); 20 WPM boss 9.4 min with rubble misses 43% (scale spawn/fall by pace); 75 WPM boss 2.7 min against 3.4; Fireball −35%.
- T6.3: L9 too dark, L10 orange instead of violet.

## Orchestrator rulings
- `LevelView.stats.accuracy` / `TrialView.accuracy` are basis points (0..10000).
- The game makes no runtime third-party requests (fonts self-hosted).

- Chip hits apply on any plate, guard plates included (doc 01 §1.3). Event order: GuardBlocked/Parried, then Hit{chip}.

- T2.6 implementer may edit `hud/{plates,fx,hud}.ts` and `render/ambient/particles.ts` (spec §14). T2.3 hooks are no-op callbacks until T2.3 lands.

- Chip on a guard plate fires at completion (WordCompleted → GuardWordTyped → PlateRemoved → Hit{chip}); block/parry resolve at impact. Chips are untyped: never weak, never touch shields, but get the BREAK multiplier.
- 2:45 ±15% applies to 3-encounter levels; L1–L2 (2 encounters) target ≈1:45, matching the Python.

## PO decisions log
- 2026-10-09: Combo = hybrid. Mechanics use perfect-word combo (5/15/30/50); VFX colour tiers use per-key streak (10/25/50/100).
- 2026-10-09: Gear Cache weapon type favours the equipped archetype at 40%, with 20% for each other type. Fixed and published.
- 2026-10-09: Typing Trial requires typed spaces (standard WPM).
- 2026-10-09: Keep weakness/shield/BREAK; retune encounter HP in T6.1.

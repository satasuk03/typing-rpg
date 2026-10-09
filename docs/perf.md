# Perf and robustness (T6.4)

GPU: `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)`, Chromium new headless, 1920x1080.
Specs: `apps/game/tests/perf/` (`pnpm exec playwright test -c tests/perf/playwright.config.ts <frame-budget|soak|context-loss|full-run>`).
Each spec fails unless the WebGL renderer string matches Apple/Metal. Env: PERF_DPR, PERF_UNCAPPED, SOAK_MINUTES, PERF_LEVELS.
Caveats: typing VFX chunk C was not yet on main; other agents ran GPU tests on the same machine during some runs.

## Frame budget (bot 60 WPM, combat frames only, 120 warm-up frames dropped)
Vsync-locked (DPR 1): every case p95 16.7-16.8 ms (rAF quantizes to 16.67), CPU/frame avg about 1 ms. Assertions use 0.5 ms slack.
Throttled 4x tier 2: L05 p95 16.7 (max 33.4), L10 p95 16.8 (p99 33.3) -> PASS (< 22.2 + 0.5 slack).

Uncapped (vsync off, true cost), DPR 1: avg / p95 / max ms, calls
| level | tier | throttle | avg | p95 | max | cpu avg | draw calls |
|---|---|---|---|---|---|---|---|
| l05 | 0 | 1x | 4.5 | 9.1 | 437.7 (one hitch) | 3.44 | 120 |
| l05 | 1 | 1x | 2.3 | 4.0 | 7.3 | 1.64 | 119 |
| l05 | 2 | 1x | 1.7 | 3.0 | 12.7 | 1.15 | 111 |
| l05 | 2 | 4x | 8.4 | 19.9 | 111.2 | 4.68 | 111 |
| l10 | 0 | 1x | 4.6 | 7.0 | 13.7 | 3.66 | 74 |
| l10 | 1 | 1x | 2.6 | 4.4 | 8.3 | 1.84 | 72 |
| l10 | 2 | 1x | 1.9 | 3.7 | 8.3 | 1.33 | 65 |
| l10 | 2 | 4x | 5.1 | 8.0 | 30.3 | 3.04 | 65 |

DPR 2 (extra data, internal width still capped at 1920): vsync-locked tier 0/1/2 p95 16.8; tier 2 with 4x throttle is NOT within budget
(L05 avg 21.9 p95 33.4; L10 avg 26.0 p95 83.3); uncapped tier 0 avg 3.9-4.9 ms. Likely the 3840x2160 HUD 2D canvas on a throttled CPU (not profiled; HUD is not in this task's paths).
Raw JSON: tests/perf/out/ (gitignored).

## Soak (30 min, ch1-l05 looped with restart, tier 0)
CSV (every 2.5 min of 61 samples, columns: min, heapMB, three geometries, textures, programs, live framebuffers, GL textures, scene meshes):
0,33.8,106,72,14,20,76,465 | 2.5,34.8,331,144,14,20,148,474 | 5,34.9,331,144,14,20,148,474 | 10,35.2,332,147,14,20,151,474 | 15,35.6,332,147,14,20,151,474 | 20,35.9,332,147,14,20,151,474 | 25,35.9,332,147,14,20,151,474 | 30,36.4,332,147,14,20,151,474
Verdict: no leak. Geometry/texture counts rise only during the first pass over the level (three counts a geometry when first drawn, sprite frames build lazily), then are flat
(one lazy +3 textures at 8.5 min). Programs, render targets, meshes flat. JS heap 33.8 -> 36.4 MB (+7.4%, under 10%; slow creep of about 0.05 MB/min after min 5, worth a watch).
The spec treats the first restart as the end of warm-up. The 5 min default run passes.

## Context loss
`WEBGL_lose_context` lose mid-combat, then restore: sim paused during the loss (tick frozen), resumed after restore, picture restored, programs/textures/geometries back to pre-loss counts,
level finished "cleared", zero errors; only warning besides three's is an unrelated audio one (`Oscillator.frequency.setValueAtTime value 29669.4 outside nominal range`, audio owner).

## Fixes made
- `render/post/pipeline.ts` + `RenderWorld.ts`: after context restore, old render targets are forgotten instead of disposed (disposing dead handles spammed 36 "delete: object does not belong to this context" GL warnings).
- `level/session.ts` (shared file, 9 lines): pauses the sim on context lost (RendererHooks, reason "overlay") and resumes on restore.
- `index.html`: `<link rel="icon" href="data:,">` removed a favicon 404 console error on every load.

## Full Ch1 run (L1-L10, 75 WPM, one page)
Spec: `tests/perf/full-run.spec.ts`. RESULT PENDING at commit time (run was still in progress); see report.

## Open issues outside my paths
- `pnpm lint` has 10 errors in render/vfx and RenderWorld (noUnusedPrivateClassMembers, noNonNullAssertion); scripts/check.sh stops at lint. Not from this task.
- DPR 2 throttled HUD cost (above); audio oscillator warning.

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
(L05 avg 21.9 p95 33.4; L10 avg 26.0 p95 83.3); uncapped tier 0 avg 3.9-4.9 ms. Fixed, see "DPR 2 fix" below.
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
- (resolved, see below) DPR 2 throttled HUD cost; audio oscillator warning.

## DPR 2 fix (tier 2, 4x CPU throttle) and audio clamp
Profile (frame-budget probe now records `hud` = hud.render ms and `gl` = world.render ms per frame, shown in the PERF row):
at DPR 2 tier 2 throttled, JS cost was small (cpu avg 6.1 ms: hud 2.7, gl 2.4) yet p95 was 50 ms. The WebGL side already respects the tier
(`QUALITY_TIERS[2].maxDpr = 1`, scale 0.64, width capped at 1920), so the extra cost is the HUD 2D canvas: it ignored the tier and always used
min(2, DPR), a 3840x2160 backing store that is rasterized and composited every frame. It is GPU/compositor bound, not JS bound, so caching panels
or removing shadowBlur would not have moved it.
Fix: `HUD_MAX_DPR = [2, 1.5, 1]` per tier in `hud/hud.ts`; `Hud.setQuality` re-applies the backing-store size and `PlaySession.attach` passes the world's tier
(one line in `level/session.ts`). Tier 0 is unchanged (DPR 2, crisp); tier 2 matches the WebGL cap (a HUD at 1.5 was tried first: L05 p95 33.4, L10 p95 66.6, still failing).
Results, tier 2 with 4x throttle, vsync-locked, Metal, real GPU, machine under load from other agents (load average about 18):
| case | before p95 / avg | after p95 / avg |
|---|---|---|
| L05 DPR 2 | 33.4 / 21.9 (50.0 / 23.6 in the instrumented rerun) | 16.8 / 16.7 |
| L10 DPR 2 | 83.3 / 26.0 | 16.8 / 17.3 |
| L05 DPR 1 | 16.7 | 16.8 / 16.8 (unchanged) |
| L10 DPR 1 | 16.8 | 16.8 / 17.0 (one loaded run hit p95 33.3 at the 95th-percentile boundary; the rerun passed) |
The frame-budget spec now asserts the throttled tier 2 budget (p95 < 22.2 + 0.5) at both DPR 1 and DPR 2: run `PERF_DPR=2 pnpm exec playwright test -c tests/perf/playwright.config.ts frame-budget`.
Tier 0/1 at DPR 2 are not asserted and keep the full or 1.5x HUD resolution.

Audio: the `29669.4 Hz` warning came from high bell partials and tier-up arpeggio notes (`bell` ratios up to 8.93 on notes near MIDI 100+). `Synth.osc`, the noise
filter ramp and the lowpass corner now clamp through `clampHz` to [20, 20000] Hz at the source. `tests/audio/frequency-range.test.ts` sweeps every Sfx id x streak 0..200 x tier 1..4 x boss/heavy
against a recording fake AudioContext and fails if any oscillator or filter frequency leaves the range (verified to fail with the clamp removed).


## Full Chapter 1 run on main (orchestrator, 2026-10-09)

`tests/perf/full-run.spec.ts`, Metal, 75 WPM bot, L1→L10 in one session, with all typing VFX (T2.6 chunk C) and onboarding merged:

| Level | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Result | cleared 57 s | cleared 53 s | cleared 84 s | cleared 95 s | cleared 84 s | cleared 87 s | cleared 87 s | cleared 83 s | cleared 93 s | cleared 162 s |

**Zero console errors and zero unhandled rejections** (1 passed, 15.3 min). DoD line: PASS.

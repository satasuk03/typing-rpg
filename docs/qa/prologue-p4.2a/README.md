# P4.2 WP-A: prologue VFX / world polish, evidence

Real Metal (Apple M4 Pro, Chromium `--use-angle=metal`), the REAL prologue session, `bot-seed=7`, wpm-bot 45, 1920x1080 for the numbers.
Before = `main` at the start of WP-A, after = this branch. Part A / C frames are parked with `__play.proSeek(t)`, Part B is live.

Reproduce: `WPA_OUT=<dir> WPA_W=1920 WPA_H=1080 APP_PORT=5465 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueWpaStills`
(`WPA_PARTS=A|B|C` limits the parts); single cues: `tests/vfx/prologue-wpa.metal.ts`; hitch: `tests/perf/prologue-hitch.spec.ts`.

## Stills (before | after, JPEG < 200 KB)
`p1-1-grade-boss-fight`, `p1-1-grade-partA-crane`, `p1-2-frost-lock-nul`, `p1-4-combat-leftovers`, `p1-6-collapse`, `p1-7-theft`,
`p1-8-ember-sword`, `p1-11-fog-knight`, `p2-boss-intro-tear`, `p2-2-sky-ink`, `p2-6-catch-fireball`, `p1-5-gate-vortex` (the gate letters are WP-B's
`gateDarken` duration), and `contact-sheet.jpg` (16 keyframes, after).

## Numbers (same method as the review: 320x180 downsample, luma with sRGB decode)
| target | before | after |
|---|---|---|
| P1-1 Part B battle p50 (<= 0.10) | 0.23 | 0.08 - 0.09 |
| P1-1 Part B dark px % (>= 25) | 10 - 12 | 25 - 30 |
| P1-1 arch opening p95 (>= 0.6) | 0.98 | 0.98 |
| P1-1 Nul mask : cloak (>= 6) | 4.3 (review) | 5.3 (partial) |
| P1-2 cloak luma frozen vs unfrozen (<= +10%) | +49..116% (review); lower cloak 0.027 vs 0.065 | 0.0128 frozen vs 0.0108 unfrozen (+0.002 abs) |
| P1-11 knight body : fog at 37.0 s (>= 2.5) | 1.23 | 1.6 (partial; the fog now peaks in the wide) |
| first-frame hitch, tier 2 4x throttle | 66.6 ms (prewarm off) | 33.3 ms (one dropped frame); tier 0: none (16.8) |

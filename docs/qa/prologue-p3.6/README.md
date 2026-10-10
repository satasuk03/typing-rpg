# P3.6 Prologue timeline + integration: QA evidence

Real Metal (Apple M4 Pro, Chromium `--use-angle=metal`), 1280x720, from the REAL prologue session (fresh profile -> Start). Stills are JPEG
under 200 KB. `contact-sheet.jpg` is the 16 plan §6 keyframes.

## Reproduce
```
APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueStills        # 16 keyframes + extras + boss timing
APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueContactSheet  # the sheet
APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueFullRun       # the full real run
```
Part A / C frames are parked on a timeline time with `window.__play.proSeek(t)` (a pure seek of the same cutscene player; no sound). Part B frames
are taken live while the wpm-bot plays.

## The 16 keyframes (plan §6)
| still | what |
|---|---|
| `a1-crane` | A 2.5 s high crane, the knight walking up the road, aura held at tier 2 |
| `a2-ink-drips` | A 6.0 s ink pools open, drips rise, the camera settles toward the battle pose |
| `b1-first-fireball` | B the first word fires Fireball (real session, bot 45 WPM) |
| `b2-slash-wave-crowd` | B Slash Wave on the 3-enemy crowd |
| `b3-boss-intro-card` | B2 NUL / THE SILENT KING card, Nul steps out of the tear |
| `b4-max-surge-aura` | B surge x16 (a 9 WPM bot, in the second servant wave) |
| `c01-catch` .. `c10b-ember` | C 0.3 catch, 2.0 mask push, 8.0 knight flare, 11.5 ink line, 15.2 theft 3, 19.9 theft 6, 21.0 collapse + kneel, 23.5 colour swirl, 33.0 vortex + fog, 42.5 shards + ember (`c10a-shards` is the shards in flight) |

Extras (`x-*`): the opening black + caption, Nul's first line, the line plates, the rise into the tear (two frames), the gate going dark, theft 1, the end caption.

## Numbers
- `boss-segment-40wpm.txt`, `boss-segment-75wpm.txt`: BossIntro end -> PrologueClimax = 21.1 s (40 WPM) and 20.0 s (75 WPM) of sim time (`bossMinS` 20 per encounter, as ruled), the intro 4.0 s.
- `full-run-metal.txt`: fresh profile -> A -> B (wpm-bot 40) -> C -> story -> calibrate -> L1, audio on, 0 console errors.
- Part C: 54.5 s of timeline + the line holds = about 74 s at the minimum reading time (a `line` cue holds the whole timeline clock).

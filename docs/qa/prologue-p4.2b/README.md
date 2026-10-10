# P4.2 WP-B: prologue UI, HUD and timeline polish, evidence

Real Metal (Apple M4 Pro, Chromium `--use-angle=metal`), the REAL prologue session (fresh profile, Start), `bot-seed=7`, wpm-bot 45, 1920x1080 for the
stills and numbers. **Before** = `main` at `1afb92d` (WP-A merged), **after** = this branch. Part A and C frames are parked with `__play.proSeek(t)`;
Part B is live. Review: `docs/qa/prologue-review-1.md` (§3, §4, §5 WP-B, the orchestrator rulings).

Reproduce:
```
WPB_OUT=<dir> APP_PORT=5469 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueWpbStills   # stills + probes.json
PACING_OUT=<dir> PACING_WPM=75 APP_PORT=5469 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologuePacing   # live Part C film strip
PRO_OUT=<dir> APP_PORT=5469 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueFullRun     # A / B / C wall times, 0 console errors
```
`WPB_A` / `WPB_C` (JSON) set the seek times, so the same spec shot `main` with the old timeline (before) and this branch (after).

## What changed
- **Overlay lines (interfaces v2.2.3, the pacing fix).** `line` cues take `mode: "gate" | "overlay"` (default gate). An overlay line never stops the timeline
  clock: it shows for its minimum reading time from its `at`; Space/Enter only fades it out early; `validate()` rejects overlapping windows. The prologue
  uses overlay everywhere, the shots that carry a line creep (fov / dist), and Part C is retimed to the review §4 schedule (57.0 s timeline).
- **Grimoire** only from the ink line (13.2 s) to `passivesDim` + 1.0 s, in the dialogue lane (bottom centre, 1.25x), hidden while any line is up; passive row has
  12x12 pixel icons. **Pops / PARRY / BREAK tags / combo ring** are cleared at the climax. **Pops on Nul** anchor at his cloak side (x + 0.9 m, 2.3 m up), the mask
  rect is a 12 px keep-out for pops and tags (WEAK on the crown included). "? ?" weakness slots and shield pips are hidden under the grunts in prologue mode.
- **Camera:** collapse push-in (22.8 -> 23.2 s, dist 13, fov 24), the wide shots pulled in (dist 24), the rise at dist 22, the Part A crane reframed.
  **Recoil:** the knight takes a 150 ms `hurt` frame on every theft departure, on the same beat as the icon shatter.
- **Ember, shards, hand:** the HUD ember follows the palm texel of the current hero frame (reach / kneel / rise tables), 8 px core (12 px at 1080p) with a 70 px halo
  (105 px); the two shards are warm-rimmed 32 px icons (Fireball, Clean Cut) with a falling trail from above the hand over 1.9 s that merge into the ember (it swells).
- **Nul's entrance:** letterbox bars (0.1 H each), Nul steps out of the tear's mouth (2.4 m eased drop, 0.6 -> 1.6 s), the name card is delayed to 1.8 s and sits under his hem
  (0.84 H). **Knight fill light:** a prologue-gated warm fill (cools and dims with the colour drain, so the ember stays the one warm light).
- Others: gate stays dark (the `gateDarken` cue runs to the end), swirl spirals across the whole cloak, end caption at 0.17 H, dialogue box fits its text (min 40% W, no
  "SPACE" hint for overlay lines), encounter-1 slots moved +2 m (`prologue.json` + `WORD_GATE.slots`), dev route `?scene=prologue&part=cutscene` plays the real timelines.

## Numbers against the review targets
| item | status | number vs target | still |
|---|---|---|---|
| **P1-10** pacing | done | Part A **7.9 s** (target about 8); Part C **57.6 s** to the story card, 57.2 s to the end of the timeline (target <= 58, was 74.2); Part B 53.2 s at 40 WPM, 48.2 s at 75 WPM. Live film strip at 75 WPM: **min frame diff 4.6% per second (target > 3%), 0 static seconds of 57, timeline clock flat 0.0 s** (was 18.5 s frozen) | `pacing-75wpm.txt`, `full-run-metal.txt` |
| **P1-3** Grimoire | done | Grimoire rect x actor boxes: before up to **55,007 px2** on Nul (mask push) and 13,824 px2 on the knight (flare); after **0 px2** at every keyframe where it shows (13.2 -> 23.8 s, every theft beat), hidden elsewhere | `p1-3-grimoire-lane` |
| **P1-4** HUD leftovers | done (HUD half) | pops, PARRY / BREAK tags, combo ring gone on the first cutscene frame (target 300 ms); the Aegis bubble and rune circles are WP-A's and are gone in the same stills | `p1-4-combat-leftovers` |
| **P1-9** pops off the mask | done | prologue-fx at 40 and 90 WPM on the real session: **0 pop / tag over the mask** in 160 and 146 mask samples; pops anchor at the cloak side | `p1-9-pops-off-the-mask` |
| **P1-5** gate stays dark | done | `gateDarken` now runs to the end of Part C (unit test pins it); no lit glyph at 36.3 s and 54 s (before: every glyph lit again at 32.1 s) | `p1-5-gate-stays-dark` |
| **P1-6** push-in (camera) | done | knight **37.5 - 38.5% of H** in the collapse shot (target >= 22%, was 18.2%); the rings, pillar and smoke are WP-A's | `p1-6-collapse-push-in` |
| **P1-7** recoil | done (cue) | 6 recoils of 150 ms, each on the `kitShatter` beat; the knight's sword drops in the 16.05 / 16.12 s frames (streams and arrival are WP-A's) | `p1-7-theft-recoil` |
| **P1-8** ember and shards | done | ember centre **1 px** from the palm centre at 46.5 s (target <= 8 px; was 130 px); core 12 px, halo 105 px at 1080p; shard icons 48 px at 1080p, fall 1.9 s (>= 1.5), Fireball and Clean Cut recognisable | `p1-8-shards-ember` |
| hero-dark regression | done | knight face luma (24x28 px box on the projected face, 31 Part B frames, sRGB-decoded luma): **median 0.279** (target >= 0.25; was 0.039); Part A crane 0.329. The fill is prologue-gated, story silhouette specs unaffected | `p1-hero-fill-light` |
| **P1-11** fog (cue) | moved | the fog cue starts at 33.0 s so it peaks in the rise shot (36.2 s) and is back to 0.016 by 38 s, before the close-up (39.5 s); the ratio is R2's to judge | `p1-11-fog` |
| **P2-3** entrance | done | bars 0.1 H, card delayed to 1.8 s under the hem (0.84 H), 2.4 m lift 0.6 -> 1.6 s (tear lens and violet circle are WP-A's) | `p2-3-boss-intro` |
| **P2-1** crane | done | the whole arch in frame, arch top at 20% of H (sky above), knight 14% of H at 4.0 s, no foreground block in frame | `p2-1-crane` |
| **P2-7** swirl | done | six spirals cross the full cloak trapezoid (cores scale with the sprite, 6-sample trails, halos on every second mote, pulses while Nul speaks) | `contact-sheet` (26.8 s) |
| **P2-8 / P2-14** camera | done | rise at dist 22 / y 3.6 / pitch 14; Nul **31 - 32% of H** on "No more stories" and 72% on "Now the world will be quiet" (target >= 18%) | `contact-sheet` |
| **P2-12, P2-13, P3-4, P3-5, P3-7** | done | passive pixel icons; caption 0.17 H; no "? ?" chips; fitted dialogue box; dev route | `contact-sheet` |
| **P2-10** slots | done | encounter-1 slots +2 m (first Shade 7 m from the knight); the first Fireball is in flight at +90 ms and lands at +180 ms | `contact-sheet` (B first Fireball) |
| **P3-2** ink line | left as is | the review calls it fine as is | |

## Gates (all on Metal unless noted)
| gate | result |
|---|---|
| `tests/level/prologue-fx.spec.ts` (not edited) | **0 violations at 40 and 90 WPM**, 0 console errors (`readability-prologue-fx.txt`) |
| `tests/perf/prologue.spec.ts` (not edited) | tier 0: p95 **16.8 ms** in Parts A, B, C; tier 2 with 4x throttle: p95 **16.7 - 16.8 ms** (<= 22.2) (`perf-prologue-metal.txt`) |
| `tests/app/prologueFlow.spec.ts` (not edited) | **11 / 11** |
| full real run (audio on) | 0 console errors, 0 in-app errors (`full-run-metal.txt`) |
| `tests/hud/prologueHud.spec.ts` | 4 / 4 |

## Stills (JPEG, before left | after right)
`p1-3-grimoire-lane`, `p1-4-combat-leftovers`, `p1-5-gate-stays-dark`, `p1-6-collapse-push-in`, `p1-7-theft-recoil`, `p1-8-shards-ember`, `p1-9-pops-off-the-mask`,
`p1-hero-fill-light`, `p1-11-fog`, `p2-1-crane`, `p2-3-boss-intro`; `contact-sheet.jpg` is the new 16 keyframes (1920x1080 sheet from the 1920 stills: A 4.0 / 6.4, B first Fireball,
boss fight, intro 1.3 and 3.2 s, C 0.3 / 3.6 / 10.4 / 14.5 / 18.9 / 23.6 / 24.5 / 26.8 / 37.5 / 46.5 s).

## Notes
- `prologueFlow.spec.ts` needed no change: it waits on phases and the story route, not on line holds.
- Part C measured by the pacing spec (58.4 s) includes its once-a-second screenshot loop and the 400 ms handover; `prologueFullRun` (no instrumentation) is the reference (57.6 s).
- The old dev-route specs (`tests/cutscene/cutscene.spec.ts`) now pass `tl=test` because the default route plays the real timelines.

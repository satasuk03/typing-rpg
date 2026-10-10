# Cutscene engine (P3.1)

Data-driven, presentation-only, seekable, skippable. Contract: `docs/interfaces.md` v2.2 §14.4. The real prologue
timelines are `timelines/prologue.ts` (P3.6: Part A `OPEN_TIMELINE`, Part C `UNWRITING_TIMELINE`, plan §2 and
`docs/vfx/prologue-art-direction.md` §2.3 / §4 / §5); `testTimeline.ts` is only a small engine test.

| File | What |
|---|---|
| `types.ts` | `Timeline`, `Cue` (camera, actor, vfx, sfx, music, mood, hud, line, startPlay, end), `StageDirector`, `CutsceneState`, `EvalEnv`, `Registries`. |
| `timeline.ts` | Pure, Node-tested: `evaluate(tl, t, lineClock, env)`, `endState`, `validate`, `cuesBetween`, `simulateParticles`, `lineHoldMs`. |
| `player.ts` | `CutscenePlayer`: presentation clock, line gate, input guard, skip, seek. Drives the world only through `StageDirector`. |
| `testTimeline.ts` | The dev/test timeline (camera, mood blend, hero walk, one line). |

## Rules
- **Pure in t.** `evaluate` has no clocks and no RNG. Camera moves that overlap continue from the pose the earlier ease is
  at (no pop). Shake is a deterministic function of `t`. Particles integrate at a fixed 1/60 s step from the cue start with
  a seed from `hashSeed(id, at, cueIndex)` (`ActiveVfx.seed`), so `seek(t)` reproduces them.
- **Timeline time vs wall time.** `t` is timeline time. A `line` cue holds `t` at its `at` for `max(2200, 1200 + 60 * chars)` ms
  of presentation time (or until Space/Enter), then `t` continues. `evaluate` shows the line only when `lineClock >= 0`.
- **Input.** Only Space/Enter release a line (`player.key(e.key)`); letter keys never do. All input is ignored for
  `INPUT_GUARD_MS` = 1500 ms after `start()` and after `climax()`. `pause()` freezes the clock and the guard (blur, hidden,
  pause menu: the caller wires it). Hold-Esc skip UI is P3.5's: it calls `skip()`.
- **Skip.** `skip()` jumps to `endState` (everything applied, nothing in flight, no line). Still emits `startPlay`/`end` cues that
  were not reached, then `onSkip` and `onEnd`.
- **Edge cues** (sfx, music, hud, vfx starts, line, startPlay, end) go to `CueSink.onCue` exactly once on the tick that crosses
  them; `seek` fires none.
- **Reduced motion** (`EvalEnv.reducedMotion`): camera moves are cuts, no shake. `effectsIntensity` scales shake.
- **Validation.** `validate(tl, registries?)` returns a list of problems: unknown vfx/sfx/anim ids, unsorted cues, cues past
  `durationMs`, camera overlap with ease `cut`, lines over 8 words, words over 10 letters (or off an injected A2 list), bad
  ranges, more than one `startPlay`.

## The seam (`level/stage.ts`)
`LevelStage.director()` returns a `StageDirector`. It is additive: the stage fields it sets are all null until a player calls it,
so story levels behave identically. While `setCameraOverride(pose)` is set the stage hard-snaps the camera to that pose each frame;
`setMood(m)` is applied after the level's per-x mood; `setActorState("hero", ...)` offsets/hides the hero and `setHeroAnim` picks the
cutscene frames (unknown anims fall back to idle until P2.3's sheet lands). P3.1 added `setActorState` to the interface.

## Dev route
`?scene=prologue&part=cutscene[&tl=open|unwriting|test]&t=<ms>&freeze=1[&lc=<ms>][&id=<level>][&reduced=1]` (`src/dev/prologueScene.ts`) renders the exact
frame. P4.2 (P3-7): by default it plays the REAL timelines on the Word Gate layout (`tl=open` = Part A then Part C; `tl=unwriting` = Part C
alone); `tl=test` or any `id=` plays the small TEST timeline over a ruins level. Without `freeze` it plays live. Tests: `src/cutscene/cutscene.test.ts` (Node) and
`tests/cutscene/cutscene.spec.ts` (`CUTSCENE_PORT=5409 pnpm exec playwright test -c tests/cutscene/playwright.config.ts`, Metal).

## P3.6: the real timelines and how the session plays them
- **Authoring rule (P4.2 WP-B: overlay lines, interfaces v2.2.3).** A `line` cue is `mode: "gate"` (default: it holds the timeline clock and
  every scripted cue, VFX and camera ease with it) or `mode: "overlay"`: the clock never stops, the HUD shows the line for
  `lineHoldMs(text)` from its `at`, and Space/Enter only fades it out early (`CutscenePlayer.key`). `validate()` rejects an overlay
  window that overlaps the next line or runs past `durationMs`, which guarantees the minimum reading time by construction. The
  prologue uses overlay everywhere, so Part C is 57.0 s (58 s on the wall) and Part A 8.0 s, every shot that carries a line creeps (fov /
  dist) over it, and no frame is static for more than 1.5 s (a unit test checks the camera gaps).
- **Cue fields added in P3.6** (all optional, additive): `music` `drone: number | null` (MIDI note / release), `swell: true`,
  `motif: "spark" | "sparkEnd"`; `sfx` `count` / `boss` (the `SfxParams` the prologue voices read: theft slot, letter / glyph index,
  speaker); `hud` `{ id: "fade", to }` (a linear black fade over the cue's `dur`, `HudState.fade`); `NulAnim` `"reach"`.
- **Routing** (`level/session.ts`): `sfx` / `line` (a `lineBlip`) / `music` cues go to the engine (`applyMusicCue`, `musicDrone`,
  `musicSwell`, `musicMotif`); `CutsceneState.vfx` + `moodBlend` go to `PrologueFx` (`attachPrologueFx`); `hud` state goes to the
  P3.3 `PrologueHud` (`setCutscene`, anchors from the stage projection, `worldKeepOuts` -> `PrologueFx.keepOutRects`); the `boss`
  actor posing Nul (anim, the rise into the tear, hidden) goes to `LevelStage.setBossCutscene`; the `prop:prop.prologue.sword` actor
  shows / hides the sword prop; the `fade` is a black post flash; the `catchFireball` cue is a 160 ms hit-stop of the world and
  the cutscene clock.
- **Stills.** `window.__play.proSeek(tMs, lineClockMs?, jumped?)` parks Part A or C on a timeline time (pure seek, no sound);
  `proSeek(-1)` lets it play on. Used by `tests/app/prologueStills.metal.ts`.

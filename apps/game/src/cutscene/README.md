# Cutscene engine (P3.1)

Data-driven, presentation-only, seekable, skippable. Contract: `docs/interfaces.md` v2.2 §14.4. The real prologue
timelines are P3.6's; `testTimeline.ts` is only a small engine test.

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
`?scene=prologue&part=cutscene&t=<ms>&freeze=1[&lc=<ms>][&id=ch1-l04][&reduced=1]` (`src/dev/prologueScene.ts`) renders the exact frame
(standalone setup: hero at the layout `start` anchor). Without `freeze` it plays live. Tests: `src/cutscene/cutscene.test.ts` (Node) and
`tests/cutscene/cutscene.spec.ts` (`CUTSCENE_PORT=5409 pnpm exec playwright test -c tests/cutscene/playwright.config.ts`, Metal).

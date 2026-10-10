# P3.2 Prologue VFX: QA evidence

Worker: VFX (P3.2). Spec: `docs/vfx/prologue-art-direction.md` §3. All captures are real Metal (M4 Pro, Chromium channel `chromium`,
`--use-angle=metal`), 1280x720, 0 console errors.

## How to see a cue

```
pnpm dev
http://localhost:5173/?scene=prologue&part=vfx&cue=<id>&age=<ms>&freeze=1
```
`cue` = any `PrologueVfxId` (`inkRise skyTear hushBolt ward surgeAura catchFireball inkWrite theftStream auraCollapse gateDarken
letterVortex silenceFog ember`) or `skyTearClose`, `clusterB`, `clusterC`, `partB`. Without `freeze=1` the cue loops live. Params:
`&p.<name>=<value>` (e.g. `p.k=3` theft index, `p.mult=16` surge, `p.hit=60` ward ripple), `&cam=wide|two|mask|palm|hero|gate|sky|boss|vortex`,
`&blend=0..1` (mood toward UNWRITTEN), `&tier=0|1|2`, `&k=<effectsIntensity>`, `&reducedFlash=1`. `part=vfx` is routed from
`src/dev/prologueScene.ts` (a 5-line edit there, noted below); everything else lives in `src/render/vfx/prologue/`.

Run the evidence specs (unique port):
```
PW_PORT=5441 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts prologue-p32 prologue-partB
```

## Stills (one per cue, JPEG < 200 KB) and sheets

| cue | still(s) |
|---|---|
| `inkRise` | `inkRise.jpg` |
| `skyTear` | `skyTear-open.jpg`, `skyTear-close.jpg` |
| `hushBolt` | `hushBolt-flight.jpg`, `hushBolt-impact.jpg` |
| `ward` | `ward.jpg`, `ward-ripple.jpg` |
| `surgeAura` (HeroAura) | `surgeAura-x2.jpg`, `surgeAura-x16.jpg` |
| `catchFireball` | `catchFireball-hold.jpg`, `-grey.jpg`, `-crumble.jpg` |
| `inkWrite` | `inkWrite.jpg` |
| `theftStream` x6 | `theftStream-1-fireball.jpg`, `-3-slashwave.jpg`, `-6-frost.jpg` (all six are one renderer, `p.k` = 1..6) |
| `auraCollapse` (HeroAura) | `auraCollapse-narrow.jpg`, `auraCollapse-snap.jpg` |
| `gateDarken` | `gateDarken.jpg` (gate + runestones) |
| `letterVortex` | `letterVortex.jpg` |
| `silenceFog` | `silenceFog.jpg` |
| `ember` | `ember.jpg` |
| clusters | `clusterB-densest.jpg`, `clusterC-densest.jpg` |
| Part B composite (real HUD + bot) | `partB-maxfx.jpg` |

Contact sheets: `sheet-1.jpg` (ink / tear / bolt / ward / surge), `sheet-2.jpg` (catch / write / theft / collapse), `sheet-3.jpg`
(gate / vortex / fog / ember / clusters).

## Determinism (the same cue at the same age, captured twice)

`determinism.txt`: all 24 stills, two separate page loads: **0.0000%** of pixels differ (strict: RGB sum > 6). In-page re-seek
(seek away and back, the cutscene `seek` path), perceptual tolerance (RGB sum > 48, as the P3.1 cutscene spec): worst
**0.0105%**. The cues are closed-form functions of (seed, age): `AnalyticParticles` keeps no simulation state, so there is nothing to replay.
The aura cues (`surgeAura`, `auraCollapse`, `clusterB`) are excluded from the in-page re-seek row only: they settle 130 frames and
that also advances the world's ambient dust by 2 s per seek (0.5-0.8%). Their page-load pair is 0.0000%.

## Keep-out and readability (Part B at max FX)

`partB-keepout.txt` (`?scene=prologue&part=vfx&cue=partB`): the real Hud with the mock sim driver, a wpm-90 bot at the pinned tier-4
streak, the real typing VFX, every Part B cue at once (ink pools, sky tear, Nul's ink lances through the real `EnemyAttack` sink,
the ward, the x16 surge aura) over the Word Gate, 24 s, a sample every 0.5 s:
- HUD invariants (`checkSnapshot`: next letter legible, ring / cell contrast, no pop or tag over a letter, no letter outside its plate):
  **0 violations in 48 samples**.
- World light the cues add inside every plate rect inflated by 40 px (render with the cues vs without, same frame): max
  **0.19 luma** on a single pixel, worst-sample mean **0.006**. The 40 px keep-out gate checked 1761 bright spawns and dimmed 39.
- Honest limit: the real prologue session does not exist yet (P3.5), so this is the `fxProbe` pattern on the mock driver, not the real
  runner. The HUD canvas is a separate layer above WebGL, so a world effect can't change a plate's own contrast by construction;
  the delta test is the check that nothing bright sits next to a plate.

## Perf (Metal, 1280x720)

`partB-perf.txt`: the whole Part B (HUD + wpm-90 bot + typing VFX + every Part B cue), tier 0: avg 16.67 ms, **p95 16.70 ms**, max
16.80 ms over 900 frames (vsync-bound; the 60 Hz floor is 16.67). `perf-clusters.txt`: `clusterB` tier 0 p95 16.80 ms, `clusterC`
(vortex 96 live letters + fog cards + ash + gate darken + closing tear + a theft stream + ink sparks) tier 0 p95 16.70 ms, tier 2
p95 16.80 ms. Cost of the layer: 5 extra draw calls (additive batch, normal batch, glyph batch, ink cards, plus <= 20 fx quads).
The 4x-throttle tier-2 number is P4.1's.

## Story levels unchanged

`HeroAura` gets prologue modes only through `setPrologue()` / `setCollapse()`, which no story level calls; the extra terms are
`x 1`, `+ 0` and `vK = 1` for a story aura. `eventBindings` gets one new optional column (`prologue`) that is a no-op without a
`Sinks.prologue`. Evidence: `metal-ch1-unchanged` run from a clone of the branch with `HeroAura.ts` and `eventBindings.ts` reverted to
`main` ("before") and from the branch ("after"), two runs each:
- the deterministic typing VFX scene (`typing-vfx`, wpm 90, tier 4, intensity 1): the four PNGs have the **same md5**
  (`e93602d0c5...`): byte-identical;
- the real-runner L05 frames (slash, crit) are not repeatable run to run (they advance on real time): the noise floor between two
  `before` runs is 34% / 40% of pixels, so they only show the combat stays intact; the typing scene is the byte-identity proof.
Tracked `__shots__` were not rewritten (the evidence stills went to a scratch dir; `git status` is clean outside this task's files).

## Tuning log (numbers changed from the spec; the orchestrator can log them in the spec's §8)

On a 1280x720 two-shot a 0.05-0.1 m particle is 3-6 px and the world's additive gain on this bright dusk is 0.6, so the spec's sizes
read as nothing. Changed after Metal captures (all colours, timings and counts are as specified):
- Particle / quad **sizes** about x2 (ink drips 0.075 -> 0.13, theft motes 0.05-0.13 -> 0.3-0.75 plus a velocity streak per mote, the bolt head
  glow 0.5 -> 1.5 m, ink-write sparks 0.055 -> 0.1, ember glow, vortex letters 0.42 -> 0.72 m at radius 2.8 -> 0.9 m instead of 1.8 -> 0.6).
- `inkRise`: the pool disc draws 1.25x the radius (the add is 1.1 m wide), a violet underglow, rim ring intensity 1.0 -> 1.8.
- `skyTear`: a dark violet **lens** (normal blend) behind the additive beams. An additive slit on the bright sun reads as a pale
  smear; the dark lens makes it a hole. Beam intensity 1.1 -> 1.6.
- `hushBolt`: a bright violet core streak along the dark body, a star on the head.
- `ember`: a small 0.34 m glow quad and a 1.1 m halo in addition to the point light (the world half alone is invisible in UNWRITTEN, where
  `sat` 0.15 greys it; the real ember is the HUD half, P3.3).
- `gateDarken`: 41 gate glyphs (not 44), so 4.9 s. The runestone columns go dark with the sweep (left stones at once, right stones at the end).

## What is not done / for the next owners

- **Session wiring.** `attachPrologueFx` (`src/render/vfx/prologue/attach.ts`) is the `attachCombatFx` equivalent: P3.5 calls it in
  prologue mode (`router.sinks.prologue`, `typing.handle.worldFx.aura`), and P3.6 passes `CutsceneState.vfx` + `moodBlend` to `update`.
  I did not touch `session.ts` / `screens.ts` / `app/**`. Until then the bindings are live but have no sink, and nothing in the game builds a
  `PrologueFx` (story levels are untouched by construction).
- **Sprite rise on spawn** (`inkRise`: the add rises from y -1.2): `inkRiseOffsetY(ageMs)` is exported for the stage; `stage.ts` is not mine.
- **Sword prop on the fall beat** (`prop.prologue.sword` at the `sword` anchor): a stage / timeline job (P3.6); the dev scene supports `levelScene`'s `&sword=1`.
- **Sun glows**: dimmed in `PrologueFx.frame(dt, scripted, moodBlend)` (`sunDim(blend)` = rays/1.5 scaling) by finding the two layout glow quads at
  the gate. It follows `CutsceneState.moodBlend`, so the dim is as stepwise as the theft ramp.
- **Camera shakes and `BladeGlow` gutter** of `auraCollapse` belong to the timeline's camera cues and to `BladeGlow.ts` (not in my write list).
- **`catchFireball` hit-stop 160 ms** is the timeline's (time dilation is the player's clock); the Fireball projectile the combat library
  draws is not killed by `PrologueClimax` (that needs `combat/`): the cue draws its own frozen Fireball at the palm.
- **Fog density** (`silenceFog`) and **vignette / flash pulses** are returned in `PrologueFx.out` / applied by `applyPost`; the host applies
  `out.fogDensity` to the mood fog (the dev scene does this, `attachPrologueFx` does the post part).
- The collapse cue must stay active to the end of Part C (give it a long `dur`): the aura stays dark while it runs.

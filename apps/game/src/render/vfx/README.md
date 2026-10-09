# Typing VFX, world side (T2.6 Chunk B)

Spec: `docs/vfx/typing-vfx-spec.md` (§3.2 aura, §5 word complete, §7 ATB filled, §10 budgets). This folder is the
WORLD half and the single hook the level runner registers. The HUD half lives in `hud/fx/typing/`.

```
sim events ──► TypingFxHandle.onEvent(e) ─┬─► TypingHudFx   (HUD canvas: letter pop, sparks, streaks, shatter, rings...)
                                          ├─► TypingWorldFx (diorama: aura, blade, lights, camera, post flash, time-slow)
                                          └─► PresentationQueue (holds back chip hits + events gated behind them)
```

## Wiring (level runner / `eventBindings.ts`)

```ts
import { createTypingFx } from "../render/vfx/TypingFxHandle";

const fx = createTypingFx({
  hud,                       // the Hud instance
  world,                     // the RenderWorld
  anchors: {                 // where things are in the world (world units, action plane z = 0)
    hero(out)        { out.x = heroX; out.z = heroZ; },
    enemy(id, out)   { /* centre of that enemy's body */ return true; },
  },
  seed,                      // presentation PRNG seed (captures are reproducible)
  quality: world.qualityTier,
  callbacks: {               // T2.3 hooks: every one defaults to a no-op
    actorFlash(who, amount, rgb) { /* who: "hero" | enemyId; called every frame while flashing, 0 at the end */ },
    dash(startInMs, durationMs, targetId) { /* AutoAttack: start +160 ms, contact on the impact tick */ },
    slashArc(angle, size, rgb, targetId) { /* finisher flurry (Chunk C) */ },
    chipImpact(hit) { /* the deferred chip hit is being presented NOW */ },
    dissolve(enemyId, byKind) { /* EnemyDeath is being presented NOW (after any chip for that enemy) */ },
  },
  onPresent: (e) => dispatch(e),   // events the queue held back come out here, in causal order
});

// 1. for EVERY sim event, in order:
for (const e of events) if (fx.onEvent(e)) dispatch(e);   // dispatch = hud.pushEvent + audio + T2.3 handlers
// 2. once per frame, BEFORE world.update:
const worldDt = fx.update(dt, dt, view);                   // dt * TimeDilation.scale
world.update(worldDt, alpha);                              // render-only: the sim never sees the dilation
// 3. world.render() as usual (PooledParticles upload during fx.update). HUD: hud.render(view, alpha, dt).
// 4. teardown: fx.dispose();
```

Rules:

- `onEvent` returns `false` for a held-back event: do NOT dispatch it now; it arrives through `onPresent`.
  `Hit{kind:"chip"}` is held 380 ms (0 when `effectsIntensity` is 0). While anything is pending for enemy E,
  later events about E (`Hit`, `Break`, `ShieldDamaged`, `WeaknessRevealed`, `EnemyDeath`, `FocusChanged`,
  statuses) wait behind it (+16 ms), so a chip is always presented before the same enemy's `EnemyDeath`.
  `EncounterCleared`, `LevelCleared`, `LevelFailed` flush the queue first, then pass.
- `CharCorrect`, `Typo`, `KeyStreakTierChanged`, `BurstWpm` are never held back; typing feedback never waits.
- The HUD runs in real time; only the world sees the dilated dt. Audio is untouched.
- Use `fx.setSettings({effectsIntensity, reducedFlash, reducedMotion})` (or `hud.setSettings`; `update` re-syncs).
  `fx.setQuality(q)` forwards to the HUD; the world half reads `world.qualityTier` each frame (auto fallback included).
- `fx.setEnabled(false)` is the A/B switch (readability capture): no typing VFX, nothing held back.
- No `level/` file is touched: the handle plus `TYPING_FX` params (`level/typingFxParams.ts`) are the whole surface.

## Files

| file | what |
|---|---|
| `TypingFxHandle.ts` | `createTypingFx(...)`: composes everything below |
| `TypingWorldFx.ts` | event to world effects: tier-up downbeat, ATB sequence, word landing, gutter, capped post flash |
| `HeroAura.ts` | combo rune, ground pool + pulse rings, pillar and shafts, sunburst (T3+), halo, motes, orbit stars (T4), gutter |
| `BladeGlow.ts` | weapon glow (edge from T3, charge per fragment), flare, strike beam with impact |
| `AuraQuad.ts` | soft light shapes with a part-"over", part-additive blend (keeps hue on bright worlds) |
| `FxQuad.ts` | cheap setters over the render core's additive fx quads |
| `PooledParticles.ts` | SoA instanced particle pool, no allocation after construction (shader shared with `ambient/particles.ts`) |
| `LightSlots.ts` | the 3 typing-owned dynamic lights (1 held aura + 2 flash slots), reused |
| `TimeDilation.ts` | `slow(f, holdMs, rampMs)` (1.2 s cooldown), `hitStop(ms)`, `scale(realDt)` |
| `PresentationQueue.ts` | 64-slot ring: chip deferral, entity gate, flush on clear |
| `colors.ts`, `types.ts` | linear HDR palettes; `WorldAnchors`, `TypingFxCallbacks`, settings |

## Budgets and scaling

Pool A (additive) 576 / 432 / 288 by quality tier (384 / 288 / 192 for typing, the rest reserved for the T2.3 combat
effects, which share the pool and its draw call), pool B (normal blend: smoke, pixel motes) 192, 14 fx meshes,
3 dynamic lights (aura light off at quality 2). `effectsIntensity` 0 hides every world effect; `reducedFlash`
turns the post flash off, halves light flashes and drops the CA; `reducedMotion` drops punches, shakes and the
time-slow. The post flash is capped at 0.12 while typing (R6).

## Chunk C: guard, bolts, finisher, runner

`level/typingFx.ts` is the real wiring (read it instead of the sketch above): `router.setPresentationGate(handle.onEvent)`,
`onPresent: router.present`, `worldDt = fx.update(dt)` fed to `stage.update`. New callbacks: `cameraPose`, `sfx`, `heroPush`,
`dash(..., source)`. New files: `GuardBarrier`, `SentenceBolts`, `FinisherCinematic`, `screenToWorld`, `typingBindings` (the binding table the
coverage test checks).

## Chunk C: guard, bolts, finisher, runner

`level/typingFx.ts` is the real wiring: `router.setPresentationGate(handle.onEvent)`, `onPresent: router.present`,
`worldDt = fx.update(dt)` fed to `stage.update`. New callbacks: `cameraPose`, `sfx`, `heroPush`, `dash(..., source)`.
New files: `GuardBarrier`, `SentenceBolts`, `FinisherCinematic`, `screenToWorld`, `typingBindings` (checked by the coverage test).

## T2.3: the combat library (`combat/`)

Arcs, hits, skills, statuses, enemy telegraphs, death dissolve, chests, coins and the boss moments. `level/combatFx.ts` is
the wiring: `router.sinks.fx = combat` (the `fx` column of `level/eventBindings.ts`: every event is bound or carries a
justified `fxNone`), the typing handle's `chipImpact` / `dissolve` callbacks, and `combat.update(stage.dt)` after
`stage.update` (a hit-stop freezes the arcs too). It shares pool A / B and the capped post flash with the typing VFX and
owns 3 lights of its own (typing keeps its 3; 16 slots in total).

| file | job |
|---|---|
| `combat/CombatFx.ts` | the director and the `CombatFxSink` the bindings call; rim-flash decay; dev overrides |
| `combat/kit.ts` | shared pools, quads, arcs, ghosts, lights, scale from settings, non-allocating emit helpers |
| `combat/AttackFx.ts` | weapon arcs (sword, dagger, staff bolt, hammer slam), afterimages, crit / weak / chip / counter / DoT, shield, BREAK |
| `combat/SkillFx.ts` | six skills, status markers (read from the view every frame), Aegis bubble, heal, passive, revive |
| `combat/EnemyFx.ts` | windup sigil (sim-tick driven, kept at intensity 0), lunge impact, block / parry sparks, pixel dissolve |
| `combat/RewardFx.ts`, `BossFx.ts` | chest + beam by tier, coin fountain; rune intro (35% of the intro ticks), Doom aura, phase change, rubble |
| `combat/ArcPool.ts`, `QuadPool.ts`, `Ghosts.ts`, `Projectiles.ts` | the pooled primitives (built once; spawn writes numbers) |
| `combat/params.ts` | every number and colour, pure (unit tested) |

Dev: `?scene=play&level=ch1-l08&demo=1` then `window.__play.demo("crit" | "fireball" | "chest:Gold" | ...)` (see
`dev/combatFxDemo.ts`); `&combat=0` turns the library off.

## T6.3 world polish (hero readability, QA backlog #3 #4 #7 #14-#17 #23)

- **Hero guard** (`materials/heroGuard.ts`): the hero's body box in NDC is one shared uniform. Aura shapes (`AuraQuad`)
  cap their alpha to 0.35 inside it, every `FxQuad` and the slash `ArcPool` multiply their light by 0.5 / 0.45 there. It is
  written each frame by `HeroAura.update`. A glow around and beside the hero, never a veil over it.
- **No white-outs on the sprite:** the ATB-ignite hero flash is capped at 0.03 (a tint), pixel motes rise beside the hero (|dx| >= 0.5)
  and mostly behind it, T4 orbit stars pass behind the body, the skill cast flash sits at the weapon tip (`SkillFx.skillCast`).
- **Cave rim light** (`materials/sprite.ts`, hero only: `caveRim` 0.6): an albedo-lit fill plus an outline rim in the mood's `hi` tint,
  both scaled by the mood's `caveK` (new shared uniforms `uCaveK`, `uHiTint` in `lighting.ts`).
- **Parry flash** (`GuardBarrier`, `PARRY_FLASH`): a `FxKind.Disc` flash (core #7fe8ff, rim #3ab8ff, 140 ms, r 0.9 u) at the blade tip,
  6 `PK_HEX` shards (new particle kind: hexagon with a bright rim).
- **Aegis** uses the new `FxKind.Hex` (domed hex lattice, travelling shimmer, fresnel rim). **BREAK** is a thin ring plus 14 hex shards.
- **Sentence bolts:** 1.2 u halo, 0.35 u core (violet to white), 6-sample trail, 250 ms, arc 1.2 u.
- **Finisher:** CA <= 0.006, zoom <= 0.04, warm flash [1, 0.92, 0.75] gone in 90 ms, slash lines clipped to the viewport (`clipLen`).
- **Tier 4:** hue drift 0.25 Hz (`T4_HUE_DEG_PER_SEC`). Forest aura rings and rays +30 % (`FOREST_SHAPE_GAIN`), uAdd 0.2.
- **Layout colours:** `Prop`/`Scatter` `flameColor` (torch flame, glow, light and cast-shadow source) and `Rune` `color`; absent = the old values.
  `ch1-l10.json`: two of three torches and all four rune decals are violet.
- **Boss adds** (`level/stage.ts`): hidden through `bossIntro`, then dissolved in over 300 ms (`ADDS_FADE_SEC`).
- **Coin fountain:** `coinCount` 14 + amount/7 (cap 72), 0.2 u coins, a glow sprite on every second coin, a warm bloom and star.

Captures on real Metal: `PW_PORT=<unique> pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-stills`
(`STILL_DIR` redirects; `STILLS_ONLY=a,b` picks stills) and `metal-skillcast` (the bot casts Fireball for real). `heroSilhouette.spec.ts`
(typing scene) and `heroSilhouettePlay.spec.ts` (real runner: skill cast, crit, slash, chest + slash, aegis; L9 / L10 cave contrast >= 2.0) share
`render/vfx/heroProbe.ts`. Pick a port nobody else uses (`lsof -i :PORT`): a stray dev server from another worktree answers silently.

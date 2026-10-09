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

Pool A (additive) 384 / 288 / 192 by quality tier, pool B (normal blend: smoke, pixel motes) 128, 14 fx meshes,
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

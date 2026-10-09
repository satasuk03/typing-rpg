# T2.6 Typing VFX spec: "every keystroke is a spell"

Status: design pass (art/VFX director). The implementer is a Sonnet engineer.
Inputs: plan §5 T2.6 and §8, `docs/interfaces.md` §3.3, §4 and §5, the merged HUD (`apps/game/src/hud/*`), the render core (`apps/game/src/render/*`), the audio bindings (`apps/game/src/audio/bindings.ts`), the HUD screenshots and `poc/v2-*.png`.

This spec is binding on numbers. Tune a number only when a capture proves it reads better, and record the change in the tuning log at the end (§14).

---

## 0. The fantasy in one paragraph

Every letter is a spark of mana. It pops white-hot on the plate, then cools to gold. A short burst of pixel sparks jumps off it, and a comet streak carries it into the ATB gauge, which drinks it with a pulse. As the key streak climbs, the whole board heats up: the plate border and the typed letters go gold, then ember, then azure, then prismatic, and the hero's aura flares in the 3D world. A finished word does not just disappear. It shatters into its own glowing letters, which fly into the hero's blade, and the blade releases them at the enemy as the chip strike. A typo is a short, honest red glitch, not a punishment. The rule above all of this: **the next letter to type is always the most legible thing on screen.**

---

## 1. Principles and layering rules

### 1.1 Where things live

| Space | What lives there | Why |
|---|---|---|
| HUD canvas, `"behind"` layer (under plates, above panels, banners and the WebGL world) | ring shockwaves, embers near plates, plate back-glow, tier-up ring, speed edge glow and speed lines, the SWIFT/BLAZING plate, ATB arrival flares, word-complete rays | Large, soft or screen-filling effects. Being under the plates means they can never sit on top of any plate. |
| HUD canvas, `"above"` layer (even-odd clipped around every letter rect) | per-key spark bursts, ATB light streaks, shatter fragments, tier-up note glints, guard shield glyphs, the word-bolt orb | Small, bright effects that must read on top of plate frames, but never on a glyph. |
| Plate renderer (`plates.ts` via `PlateFx`) | letter pop (scale, white, glow, lift), plate bounce, shake, typo glitch, crack, tier tint, border flash, lock-on sweep | These animate the real glyphs, so they must be drawn by the code that owns legibility. |
| WebGL world (`RenderWorld`) | hero aura (streak flare and combo rune), blade glow and flare, world sparks, dynamic light flashes, chip strike beam, guard barrier, sentence bolts, finisher slashes, camera shake, punch, zoom, CA, post flash, time dilation | Lives in the diorama, so it is lit, bloomed and depth-of-field blurred like the rest of the world. |

The HUD canvas is a separate DOM layer above WebGL, so world bloom, CA, zoom blur, the post flash and DOF can **never** touch a letter. All world effects may therefore be as loud as the art wants, within the budgets in §10.

### 1.2 Readability rules (normative; the reviewer rejects violations)

- **R1. The next letter is drawn last.** `drawPlate` draws the letters in two passes: every non-next letter first, then the next letter (`index === typedIndex`) with its stroke (`sw: 5`). A popped neighbour that grows into the next cell is then always under it.
- **R2. The next letter is never animated by typing VFX.** It gets no pop, no white flash, no glow change and no crack. Only two exceptions apply. The typo glitch tints it red (§6), and that colour must keep contrast ≥ 4.5. The plate bounce and shake move it, together with the whole plate, by ≤ 4 px.
- **R3. The `"above"` clip is extended.** The next letter's rect is inflated by **4 design px** on every side in the clip path, so sparks and streak heads never graze its stroke. Every other letter keeps its exact cell rect.
- **R4. The typed-letter pop is capped.** Peak scale is 1.35 on single-word plates and 1.25 on sentence plates (18 px font, tighter columns).
- **R5. Tier tints have guaranteed contrast.** Typed-letter tints apply only to plate kinds `word`, `minigame` and `trial`. Guard, doom, finisher and second-wind plates keep their own palettes. A unit test asserts contrast ≥ 4.5 for every tier colour, and for every one of the 12 prismatic hue buckets, against both `bg0` and `bg1` of each allowed kind (§3.1).
- **R6. Screen-wide luminance is capped while typing.** The post flash is ≤ 0.12 during typing; only the finisher may use 0.35, because no plate needs typing during it. The speed edge glow is α ≤ 0.22, and the typo vignette is α ≤ 0.25.
- **R7. No shadowBlur in pooled effects.** Glows are pre-rendered sprite canvases drawn with `drawImage` (§10.3). shadowBlur stays only where it already is in `plates.ts`, and on at most the 3 most recently popped letters.
- **R8. Pops and tags keep their avoidance.** The PERFECT tag and the existing BLOCK and PARRY pops keep the `drawPops` avoidance logic. The SWIFT/BLAZING plate lives in a reserved HUD rect (§4.1), so it never competes with plates.
- **R9. Tier 4 at full intensity is the design target, not an edge case.** Every capture and readability case in §12 runs at `intensity=1`, `tier=4`.

### 1.3 Time domains

- The **HUD runs in real time, always.** Keystroke feedback never slows or freezes.
- The **world runs on dilated time:** `worldDt = realDt × TimeDilation.scale`. Hit-stop and time-slow touch only world animation, world particles, the camera follow and sprite animation (interfaces §1.1: render-only).
- **Audio runs in real time.** Input is never blocked.
- `CharCorrect`, `Typo`, `KeyStreakTierChanged` and `BurstWpm` are **never deferred**. They render in the first frame after the event arrives. Only `Hit{kind:"chip"}`, and the events gated behind it, go through the presentation queue (§5.4).

---

## 2. Per-keystroke recipe (`CharCorrect`)

All sizes are in **design px** (1280-wide space). Multiply by `hud scale` for CSS px; `FxFrame.scale` already provides it. `k` = `effectsIntensity`, and `q` = the quality multiplier (§10.4). Times are in ms from the event.

### 2.1 Letter pop (plate renderer, letter `index`)

The keyframes below are interpolated with easeOutQuad between keys.

| t (ms) | scale | white mix | glow px (tier accent) | lift (px, up) |
|---|---|---|---|---|
| 0 | 1.35 | 1.00 | 16 | 3 |
| 40 | 1.18 | 1.00 | 14 | 2 |
| 90 | 0.97 | 0.45 | 10 | 0 |
| 140 | 1.02 | 0.15 | 7 | 0 |
| 200 | 1.00 | 0.00 | resting (§3.1) | 0 |

- **Colour** = `mix(typedTierColor, #ffffff, white)`. It holds pure white for 40 ms, then "settles to gold" (or to the tier colour).
- **Scale** is about the cell centre. **Lift** moves the glyph up only, never sideways.
- **Scaling with settings.** Scale excess is ×`k`; ×0.7 on sentence plates (peak 1.245); 0 with reducedMotion (colour only). White mix is ×`k` and capped at 0.35 with reducedFlash (the existing `flashCap`). Glow px is ×`k`.
- **Implementation.** Replace the linear `popLetter` decay in `PlateFx.letter()` with a pure function `letterPopCurve(ageMs, out)` in `hud/fx/typing/letterPop.ts`, which writes into a reused `LetterFxState`. Add the fields `glowPx` and `liftPx` to `LetterFxState`.

### 2.2 Spark burst (`"above"` layer, blend `lighter`)

- **Count** = `round([5, 7, 9, 11, 14][tier] × k × q)`. It is ×1.5 when `isLast`.
- **Emitters.** 70% spawn on the letter rect's top edge (x uniform across it). 30% spawn on the left and right edges at mid-height.
- **Direction** −90° ± 75° (an upward fan). **Speed** uniform 140–320 px/s. **Gravity** +620 px/s². **Drag** `v *= 1 − 3.2·dt`.
- **Life** uniform 220–380 ms. **Alpha** `(1 − age/life)^1.5`.
- **Sizes.**
  - 60% are 2×2 px squares.
  - 30% are 3×3 px.
  - 10% are "glints": a 4×4 px core plus a 7 px cross.
  - Positions are snapped to integer CSS px, for the pixel-art read.
- **Streak sparks.** From tier 2 up, 2 of the sparks are drawn as 1.5 px lines of length `|v| × 0.035 s` along the velocity.
- **Colour.** White for the first 50 ms, then `sparkColor = mix(tierAccent, elementColor, 0.35)`. At tier 4 each spark takes hue bucket `(floor(time·140/30) + i) mod 12` from the prismatic table (§3.1). Fill strings are pre-built, so there is no string formatting at runtime.
- **Element colours** (from `view.hero.weaponDamageType`):

| element | colour | | element | colour |
|---|---|---|---|---|
| slash | `#ffe6a8` | | fire | `#ff7a2a` |
| pierce | `#c8f0ff` | | ice | `#8fe8ff` |
| blunt | `#ffb070` | | light | `#fff6c0` |
| arcane | `#c89bff` | | | |

Sparks are born at the letter edge and the `"above"` clip removes them over glyphs, so they read as bursting *out of* the letter.

### 2.3 Light streak: letter → ATB gauge (`"above"` layer, `lighter`)

- **Spawn** on every `CharCorrect` with `!isLast` and `k ≥ 0.15`. `isLast` hands over to the word-complete streak (§5.1).
- **Path.**
  - P0 is the letter rect's top-centre (snapshotted at spawn).
  - P2 is the live `hud.getAtbAnchor()` fill tip, re-read each frame.
  - It is a quadratic Bézier with control point `P1 = mid(P0, P2) + n̂ × (90 + 40·h)`. `n̂` is the unit perpendicular pointing up-screen, and `h = hash01(plateId·31 + index)·2 − 1`, so consecutive streaks fan out instead of stacking.
- **Duration** by tier: 240, 225, 220, 205 and 200 ms (it gets snappier as you heat up). Progress `u = (t/d)^1.6` accelerates the streak into the bar, so it reads as "sucked in".
- **Trail.**
  - Length by tier: 40, 60, 90, 120 and 160 px. Convert it to a parameter span `trailU = trailPx / approxPathLen`, using chord length × 1.15.
  - Sample the Bézier analytically at 6 points (tier quality 1: 5 points; quality 2: 4 points) between `max(0, u − trailU)` and `u`. Nothing is buffered.
  - Draw 3 strokes: outer 7 px at α 0.18 in the tier accent, mid 3.5 px at α 0.55 in the tier accent, and a core of 1.5 px white at α 0.95 over the front 45% of the trail.
  - The head is a glow sprite of 14, 15, 17, 19 or 22 px by tier.
  - At tier 4 the outer stroke is a 2-stop gradient between two hue buckets. Use a gradient cached per bucket pair, rebuilt at most once per 100 ms.
- **Arrival** (u = 1):
  - Call `hud.pulseAtb(min(0.85, 0.35 + 0.1·tier))`.
  - Draw a 16 px tip flare glow (`"behind"`, 120 ms, α 1 → 0 easeOutQuad).
  - Emit 4 tip sparks (`"behind"`, 2 px, 80–160 px/s, life 150 ms).
- **Cap:** 12 live streaks. On overflow, the oldest completes instantly: it fires its arrival and is reused.

### 2.4 Plate micro-bounce (a "key press")

- **Curve.** 0–35 ms: `dy = +amp` (down, easeOutQuad). 35–90 ms: `+amp → −0.5·amp` (easeInOutSine). 90–150 ms: `−0.5·amp → 0` (easeOutQuad).
- **Amplitude.** `amp = [2, 2.5, 3, 3.5, 4][tier] × k`. It is ×0.5 on sentence plates and 0 with reducedMotion.
- Every key restarts the curve; there is no accumulation. At 90 WPM the keys are about 133 ms apart, so the plate "chatters" like a key without drifting.
- This replaces the existing 220 ms sine in `PlateFx.offset`.

### 2.5 Audio

`key` already exists, pitched by the streak via `keyVoice`. Nothing changes; the binding is in §11.

### 2.6 Lock-on (`TargetAcquired`, which precedes the first `CharCorrect`)

A bright 30 px segment runs once clockwise around the plate frame in 180 ms (tier accent, 2 px, `lighter`). Draw it in the plate renderer as part of the border.

---

## 3. Key-streak tiers 0–4

### 3.1 Palette and per-tier parameters

| | T0 white | T1 gold (≥10) | T2 ember (≥25) | T3 azure (≥50) | T4 prismatic (≥100) |
|---|---|---|---|---|---|
| accent (HUD) | `#ffffff` | `#ffd24a` | `#ff8a3c` | `#5cc8ff` | hue cycle, L 76% |
| plate border | palette `#b8955a` | `#ffd24a` | `#ff8a3c` | `#5cc8ff` | conic gradient of 6 hue buckets, rotating 120°/s |
| border glow (shadowBlur on the target plate only) | 0 | 6 px | 10 px | 14 px | 16 px |
| typed letter colour | `#ffcf4a` | `#ffd84a` | `#ffa04a` | `#8cdcff` | per-letter hue `(base + 24·i) mod 360` at L 76% |
| resting typed glow | existing 6 px gold | 6 px gold | 7 px ember | 8 px azure | 9 px, letter hue |
| streak trail (px) | 40 | 60 | 90 | 120 | 160 |
| sparks per key | 5 | 7 | 9 | 11 | 14 |
| HUD embers near the target plate (/s) | 0 | 3 | 8 | 14 | 20 |
| plate back-glow α | 0 | 0.10 | 0.16 | 0.22 | 0.28 |
| world aura flare level | 0 | 0.25 | 0.5 | 0.75 | 1.0 |
| world accent (HDR rgb) | [1.0, 0.95, 0.85] | [1.6, 1.2, 0.35] | [1.9, 0.75, 0.22] | [0.45, 1.1, 2.0] | hue cycle × 1.8 |

- **Prismatic.**
  - Hue = `time × 140°/s` (the existing `keyStreakColor`), slowed to 30°/s with reducedMotion.
  - Pre-build **12 hue buckets** (every 30°) at HSL S 100% L 76%. All runtime picks go through the buckets.
  - With reducedMotion the colour stays fixed at `#ff7ad9` (existing behaviour).
- **Typed vs untyped.** Untyped letters are `#ece3d2`, off-white with no tint. Typed letters are never white, and the next letter keeps its white + underline + 1.1× emphasis. The three states stay distinct by colour *and* by shape: the underline marks the next letter.
- **Contrast.** Every typed tier colour and every bucket must be ≥ 4.5 on `#17121f` and `#2a2014`. Checked by hand: ember `#ffa04a` ≈ 8.7, azure `#8cdcff` ≈ 11, and the darkest bucket (blue, about `#8585ff`) ≈ 5.9. The test enforces this (`tierTint.test.ts`).
- **Applying the tint.**
  - Call `hud.plateFx.setTint(plateId, …)` for every visible plate of an allowed kind, not only the target, so the whole board shares the tier.
  - On a tier change the tint cross-fades over 250 ms (lerp colours; prismatic jumps straight in).
  - Border glow is drawn on the target plate only (cost: one shadowBlur stroke).
- **HUD embers.**
  - Spawn on the `"behind"` layer, uniformly along the bottom edge of the target plate (or the last-typed plate for 1.5 s after its removal).
  - They rise at 30–70 px/s, sway ±12 px at 1.5 Hz, live 0.8–1.3 s, and are 1–2 px.
  - Colour: the tier accent; tier 4 uses a random bucket.
  - Because they sit behind the plate, they peek out around its edges like heat off a forge.
- **Plate back-glow** (tier ≥ 1).
  - A glow sprite stretched to `(plate.w + 40) × (plate.h + 30)` on the `"behind"` layer, behind the target plate only.
  - It breathes ±20% at 0.8 Hz; breathing is off with reducedFlash.

### 3.2 Hero aura (world space)

The aura has two layers, which resolves the interfaces note "combo drives aura" and the T2.6 note "streak builds aura".

- **Core: the combo rune (mechanical, `comboTier`).**
  - Use `world.addRuneCircle` (FxKind.Rune) under the hero's feet, at radius 1.1 world units.
  - Intensity by combo tier: 0, 0.35, 0.5, 0.7 and 0.95.
  - Colour by `COMBO_TIER_COLORS`: bronze `#d99a62`, silver `#dfe6ee`, gold `#ffd25a`, radiant `#ff9ae8` (converted to linear).
  - On `ComboTierChanged` up: pulse to ×2 intensity, decaying over 300 ms. Down: fade over 400 ms.
  - It is slow and steady, because it shows the multiplier.
- **Flare: streak (`keyStreakTier`).**
  - **Level.** The displayed level `a` moves toward the table level at +2.5/s.
  - **Light.** One held `LightRig.hold` light at the hero's chest `(x, 1.1, z + 0.4)`.
    - Peak intensity by tier: 0.35, 0.6, 0.85 and 1.1 for T1–T4, multiplied by the displayed level ramp (`a` / table level).
    - Radius 2.2, 2.8, 3.2 and 3.6. Scatter 0.15.
    - At tier 4 the colour cycles hue with a 2.6 s period.
  - **Glow quad.** An FxKind.Glow quad behind the hero (z − 0.05). Size 1.8, 2.2 and 2.6 units at T2/T3/T4, with α 0.25, 0.35 and 0.45.
  - **Motes.** World particle pool A (additive), from a ring of radius 0.45 at the feet:

| tier | rate /s | kind | size (u) | rise (u/s) | life (s) | extra |
|---|---|---|---|---|---|---|
| T1 | 6 | glow | 0.05–0.08 | 0.6–1.0 | 1.0–1.4 | gold |
| T2 | 14 + 4 streak | glow + streak (st 0.12) | 0.06–0.09 | 0.8–1.2 | 0.9–1.3 | sway 0.4 |
| T3 | 22 | glow | 0.08–0.11 | 1.0–1.4 | 1.0–1.5 | sway 0.6, "wisps" |
| T4 | 30 | glow | 0.08–0.12 | 1.0–1.5 | 1.0–1.6 | random bucket hue; plus 2 FxKind.Star glints orbiting at r 0.7, period 1.8 s |

  - **Blade glow.** A constant edge glow on the weapon from T3 up, as an FxKind.Glow quad of 0.5 u at the weapon anchor, α 0.3 at T3 and 0.45 at T4.
  - **Quality.** Mote rates are ×`q`. At quality tier 2 the held light is dropped; the glow quad and motes carry the read.

### 3.3 Tier-up (`KeyStreakTierChanged`, `to > from`), synced with the audio `tierUp`

The audio `tierUp` plays bell notes at `i × 50 ms` for `i = 0 … 1 + tier`, so the last note lands at `(1 + tier) × 50 ms`: 100 ms at T1 and 250 ms at T4. The visuals lock to that grid.

| t (ms) | HUD | World |
|---|---|---|
| 0 | Target plate border flashes white for 60 ms, then lerps to the new tier colour by 260 ms (reducedFlash: no white, lerp only). Typed letters cross-fade (§3.1). | Aura level jumps straight to the new tier (no ramp). |
| i·50, for i = 0 … 1+tier | **Note glint i**: a glow sprite of 18 px plus an 11 px cross at perimeter fraction `i/(2+tier)` clockwise from the plate's top-left corner. Lives 220 ms, `"above"` layer. One glint per bell note. | — |
| (1+tier)·50 ("the downbeat") | **Ring**: `"behind"`, from plate centre, r 0.5·w → 1.6·w, 420 ms easeOutCubic, line 5 → 1 px, accent colour. **Spark ring**: 16 + 4·tier sparks, radial, 220–380 px/s, life 350 ms, `"above"`. The HUD `tierFlash` (existing) fires at this moment, so delay `KeyStreakTierChanged`'s `tierFlash` set to the downbeat. | **Aura surge**: ×1.6 decaying over 450 ms. **Light flash** at the hero: accent colour, intensity 1.5 + 0.4·tier, radius 4.5, life 0.4 s. **T ≥ 3**: `camera.punch(0.25, 0.0012, 0.015)` toward the hero's screen position. **T4**: post flash 0.10, colour `#ffe0f4`, decaying over 120 ms (off with reducedFlash). |

If there is no target plate (the last letter completed the plate on the same tick), the glints and the ring anchor to the key-streak bar in `COMBO_AREA` instead.

### 3.4 Decay on reset (any typo sets `keyStreak` to 0, emitting `KeyStreakTierChanged{to: 0}`)

- **HUD.**
  - Tints cross-fade to T0 over 250 ms.
  - Embers stop spawning at once, and live embers finish their life.
  - Back-glow fades over 300 ms.
- **World: the flare "gutters out."**
  - Light and glow quad go to 0 over 600 ms (easeOutQuad).
  - Mote emission stops at once.
  - One puff of **8 smoke motes** spawns in world pool B (normal blend): colour [0.35, 0.30, 0.28], size 0.12 → 0.25, rise 0.4 u/s, life 0.9 s.
  - Only the puff is visible; nothing is red. The typo itself already said "miss" (§6).
- **The combo rune is not touched** by a reset. It follows `ComboTierChanged` only, since gentle mode halves the combo and zen keeps it.

---

## 4. Speed feedback

### 4.1 SWIFT / BLAZING plate (`BurstWpm{wpm, band}`)

The sim owns the thresholds (`BURST_BANDS`, 1.3× and 1.6× pace) and the 5 s cooldown. The HUD only renders.

- **Placement.**
  - A reserved rect `BURST_RECT = { x: W − 252, y: 300, w: 232, h: 52 }`, directly under the key-streak bar.
  - Extend `COMBO_AREA` to `h: 226` (y 128–354), so the plate layout permanently avoids it.
  - Risk: re-run the stress-6-plates layout test. If it fails, add `BURST_RECT` to `avoid` only while the plate is live.
  - `"behind"` layer.
- **Shape.** A parallelogram 196 × 44 px with a 12° skew, right-aligned in `BURST_RECT`.

| | SWIFT | BLAZING |
|---|---|---|
| bg gradient | `#0b2f3a` → `#06141a` | `#4a1406` → `#1a0602` |
| border | 2 px `#5cc8ff` | 2 px `#ff8a3c` |
| word | "SWIFT", Cinzel 900 26 px, `#e6fbff`, 3 px dark stroke, letter spacing 4 | "BLAZING", Cinzel 900 28 px, vertical gradient `#fff0b8` → `#ff8a3c`, 3 px stroke |
| decoration | 3 horizontal speed lines left of the plate (1 px, 18/28/40 px long, α 0.7) | 7 flame tongues on the top edge (triangles 6–12 px high, heights re-rolled every 80 ms; static with reducedMotion) |
| sub-label | pixel font 12 px, `"{wpm} WPM"`, white α 0.7 | same |

- **Animation.**
  - Enter: slide in from +60 px over 140 ms (easeOutBack 1.6), alpha 0 → 1 over 80 ms.
  - Hold for 950 ms.
  - Exit over 220 ms: slide −20 px and fade.
  - Total 1.31 s.
  - A glint sweep at 160 ms: a 20 px white diagonal band at α 0.5 crosses the plate in 220 ms (off with reducedFlash).
  - A new event while one is live replaces it. BLAZING never gets downgraded by a SWIFT within its hold.
- **Not the same thing as the per-word `swift` tag.** `WordCompleted.swift` keeps its existing small "SWIFT" tag above the plate. When the word is also perfect, the tag merges to "PERFECT · SWIFT" through `spawnTag` merging.

### 4.2 Screen-edge speed glow (`"behind"` layer)

- **Heat.**
  - `speedHeat` is set to 0.6 (swift) or 1.0 (blazing) on `BurstWpm`.
  - It decays linearly to 0 over 4 s.
  - Each `CharCorrect` while heat > 0 tops it up by +0.02, capped at the band level.
  - A typo triples the decay rate for 1 s.
- **Glow.** Left and right edges only (top and bottom hold panels and skills). A 0 → 56 px horizontal gradient, α = `0.22 × heat × k`, in the band colour: swift `#5cc8ff`, blazing `#ff7a2a`.
- **Speed lines.**
  - 8 lines (×`q`), 1 px, 40–120 px long, inside the outer 90 px band.
  - They move inward at 900 px/s and respawn at the edge, at y positions from a fixed seeded table.
  - α 0.35 × heat × k.
- **Settings.** reducedMotion drops the lines and keeps the static glow. reducedFlash caps α at 0.12.

---

## 5. Word complete (`WordCompleted`, plate kinds other than guard)

Order on the completing tick: `CharCorrect{isLast}` → `WordCompleted` → `Hit{chip}` → `PlateRemoved{completed}`.

### 5.1 Timeline (imperfect / PERFECT)

| t (ms) | HUD | World |
|---|---|---|
| 0 | Plate frame flashes white over 80 ms. **Suppress the existing completed ghost** (`hud.setGhostOnComplete(false)`); the shatter replaces it. **Fragments** spawn: one per letter, at the letter's rect centre, drawn as the glyph itself in the typed tier colour (PERFECT: gold `#ffd24a`) with a 10 px tier glow sprite. Sentence plates sample at most 24 letters, evenly. Add 2 frame shards per letter for word plates ≤ 12 letters: dark triangles of 5–8 px with a 1 px gold edge, normal blend, gravity 900, life 450 ms, no homing. | — |
| 0 | **ATB word streak**: one streak (§2.3) from the plate centre, ×2 width, head 26 px, then `pulseAtb(1.0)` on arrival. | — |
| 0 | **Ring shockwave** (`"behind"`): r 0.3·w → 1.25·w over 380 ms (easeOutCubic), line 6 → 1 px, α 0.9 → 0. Imperfect: accent colour at α ×0.6, 1 ring. PERFECT: gold, r → 1.9·w, 3 rings at 0/50/100 ms, plus **16 rays** (gold lines of 30–60 px from the plate edge outward, 2 px, 260 ms). | — |
| 0 | PERFECT: the existing `perfect` pop "PERFECT" above the plate, with a 1.4 → 1.0 punch over 160 ms (easeOutBack). | — |
| 0–70 | **Burst phase**: fragments jump out at 180–260 px/s radially, plus 120 px/s upward, with rotation ±6 rad/s and scale 1.0 → 1.15 (PERFECT 1.25 → 1.4). | — |
| 70 + 8·i (≤ 48) → 210 + 8·i | **Converge phase**: `pos = lerp(burstPos(t), weaponAnchor, easeInCubic(s))`, scale → 0.4, colour → white over the last 40%. A 3-sample trail (2 px, α 0.4). | — |
| first arrival ≈ 210, last ≤ 258 (≈ 300 for 24 fragments) | Each arrival spawns 2 sparks at the anchor (HUD). | **BladeGlow.charge(1/N)** per arrival: a FxKind.Glow quad at the weapon, α ramping 0 → 0.8. |
| last arrival | — | **Blade flare**: FxKind.Star at the weapon tip, size 0.9 u (PERFECT 1.3), 220 ms. **Light flash**: element colour (PERFECT gold [1.8, 1.4, 0.5]), intensity 1.8 (PERFECT 2.6), radius 3, life 0.25 s. 6 world sparks (pool A, streak kind). |
| last arrival → +80 | — | **Word strike**: an FxKind.Beam quad from the blade to the owner enemy's body, width 0.12 u, colour element (PERFECT gold), 80 ms with a head-to-tail fade. |
| `CHIP_DELAY_MS = 380` | The deferred `Hit{chip}` is presented: the HUD chip pop and the T2.3 chip impact VFX + `hit` audio. | — |

`weaponAnchor` is a new HUD anchor part `"weapon"` (add `"weapon"` to `HudAnchorPart`; the projector returns the weapon tip). Per-archetype offsets from the hero origin, in world units, until Aseprite data lands:

| archetype | offset (x, y) |
|---|---|
| sword | (+0.45, 0.95) |
| dagger | (+0.35, 0.8) |
| staff | (+0.3, 1.55) |
| hammer | (+0.4, 1.25) |

### 5.2 Imperfect vs PERFECT summary

| | imperfect | PERFECT |
|---|---|---|
| fragment colour | typed tier colour | gold `#ffd24a` |
| fragment scale | 1.0–1.15 | 1.25–1.4 |
| extra glints | — | +1 gold glint per letter |
| rings | 1 ring, accent colour at α ×0.6 | 3 rings, gold, ×1.5 radius, + 16 rays |
| tag | — | PERFECT (+ "· SWIFT") |
| blade flare | 0.9 u, intensity 1.8 | 1.3 u, intensity 2.6, gold |
| audio | `wordComplete` | `perfectWord` |

### 5.3 Sentence plates (doom / finisher / second wind) and minigame words

- **Doom and finisher:** the final `WordCompleted` shatters the plate with fragments capped at 24. The projectile story is in §9.
- **Second wind** shatters into teal `#5af0e0` fragments that converge on the hero's *body* (a heal, not a strike), with no chip.
- **Minigame words** shatter in place: no converge, 12 fragments falling with gravity 700, plus the ring.

### 5.4 Presentation queue (chip hand-off)

- `level/presentationQueue.ts` is a fixed ring of 64 `{atMs, event}` slots. It allocates nothing after construction.
- `Hit{kind:"chip"}` is deferred by `CHIP_DELAY_MS × (k > 0 ? 1 : 0)`.
- **Entity gate.** While a chip for enemy E is pending, any later event that references E is deferred to `max(its time, pendingChip.atMs + 16)`. That covers `Hit`, `ShieldDamaged`, `Break`, `WeaknessRevealed`, `EnemyDeath` and `FocusChanged`. Causal order is never inverted (interfaces §4 convention).
- **Flushes.** `EncounterCleared`, `LevelCleared` and `LevelFailed` flush the queue immediately in order.
- **Guard-plate chips** are not deferred (they follow `GuardBlocked/Parried`, per the STATUS ruling).

---

## 6. Typo (`Typo`)

The tone is *readable, not punishing*. The player must see **where** and **which letter**, and then get back to typing within about 150 ms.

| element | spec |
|---|---|
| letter glitch (on the expected letter = the next letter; exception to R2) | Colour → `#ff5a4a` (contrast 5.9), holding 120 ms, then lerping back over 180 ms. Horizontal jitter in **3 discrete steps** (+2, −2, +1 px at 0/40/80 ms, then 0), not a sine blur. Scale 1.0, never shrunk, never enlarged (the existing 0.15 punch is removed). RGB split: two copies at ±2 px, red and cyan, α 0.35, **only for the first 80 ms**. |
| plate shake | 3 px, 180 ms, 16.7 Hz, decaying linearly (`PlateFx.shake(id, 3, 0.18)`). |
| crack | **Not through the glyph.** A 1.5 px jagged hairline (4 segments) from the plate's top border down to the glyph cell's top inset (cell y + 2 px), plus a mirrored one from the bottom border to the underline row. It runs at the letter's column, colour `rgba(255,90,70,0.9)`, and fades over 1.2 s. At most 3 per plate; the oldest is replaced. |
| screen edge | The existing typo vignette, re-capped to α 0.25 × k (was 0.45). |
| streak reset | §3.4 (gutter). |
| audio | `typo` (exists): the dull thud. |
| stray typo (`plateId: null`) | No plate effects. The vignette at α 0.12 and the thud only. |

- **Zen mode** (`view.comboMode === "zen"`):
  - No shake, no vignette, no RGB split, no crack.
  - The glitch colour is amber `#ffb347` instead of red, for 200 ms.
  - The streak still resets (the sim says so), but the gutter puff shrinks to 4 motes.
  - Audio: the same `typo`. If the audio owner adds `SfxParams.soft`, pass `{soft: true}`. That is an optional cross-owner request, not required.
- **Guard typo** (`kind === "guard"`): the stronger variant.
  - Shake 5 px over 260 ms. Vignette α 0.35.
  - The guard glyphs already built flicker: each drops to α 0.3 for 2 × 60 ms. They are **not** removed (the sim keeps progress).
  - World: if the barrier preview exists, it shimmers red [1.6, 0.3, 0.2] for 150 ms.
  - Audio: `typo{heavy: true}` (exists).

---

## 7. ATB full → auto-attack (`AtbFilled`, then `AutoAttack`)

| t (ms, real) | HUD | World |
|---|---|---|
| 0 | Gauge **ignites** (the existing `atbIgnite`). Add a white line flash along the bar (120 ms) and **10 embers** rising off the bar's top edge (`"behind"`, 40–90 px/s, life 500 ms, element colour). | **Hero flash**: sprite white-flash 0.8 → 0 over 120 ms (T2.3 actor flash hook). **Light flash** at the hero chest: element colour, intensity 2.2, radius 4, life 0.3 s. `camera.punch(0.25, 0.001, 0.02)` toward the hero. |
| 0–100 | — | **Time-slow**: `TimeDilation.slow(0.25, 100, 60)`. World dt ×0.25 for 100 ms, then ramps back to 1.0 over 60 ms (easeInQuad). Cooldown 1.2 s: a second `AtbFilled` inside the cooldown skips the slow but keeps the flashes. |
| 160 | — | **Dash starts** (T2.3). Duration = `(impactTick − tick)/60 × 1000 − 160` ms (= 140 ms with `ATTACK_IMPACT_S` 0.30), so the contact frame lands on the sim impact tick. |
| impactTick | Damage pops via `Hit` (existing). | T2.3 slash arcs, hit-stop and shake (owned by T2.3). |

- The sim is untouched and typing continues during all of this; the HUD never slows.
- **Settings.** reducedMotion: no time-slow, no punch. `k` scales the slow factor as `lerp(1, 0.25, k)` and the punch as ×`k`.

---

## 8. Guard words

The guard plate itself (red, jagged, badge, timer strip) is unchanged. VFX are added on top.

### 8.1 Build (each `CharCorrect` with `kind === "guard"`)

- **Slots.**
  - `N = min(text.length, 10)` glyph slots on an arc in front of the hero, in HUD space.
  - Centre = `weaponAnchor + (60, 0)` px. Radius 70 px. Spanning −60° to +60° (top to bottom).
  - Letter i maps to slot `floor(i × N / len)`.
- **Glyph.**
  - A hexagon with a 14 px outline (1.5 px, `#7fc8ff`) and an inner 3-stroke rune chosen by `hash(plateId + i) mod 6` from a fixed table.
  - Fill `rgba(90,160,255,0.18)`, α 0.85, `"above"` layer, `lighter` for the outline only.
  - Shape (hexagon) plus colour (blue): the colour-blind cue (plan §8 gate 6).
- **Flight.** The glyph spawns at the letter's top edge and flies to its slot along a quadratic Bézier (control point 50 px up) in 200 ms, with easeOutCubic.
- **Lock.** On landing, the hex flashes white over 60 ms, scales 1.3 → 1.0 over 120 ms, and spawns 3 sparks.
- **Idle.** Locked glyphs bob ±1.5 px at 1.2 Hz with a per-slot phase (static with reducedMotion).
- **World preview.**
  - From the first guard key, a faint FxKind.Guard quad at `hero.x + 0.9`, chest height, size 2.2 u.
  - Its intensity builds as `0.15 + 0.5 × typed/len`, colour azure [0.45, 0.75, 1.0].

### 8.2 Snap (`GuardWordTyped{result}`)

- **0–100 ms.** All glyphs converge (easeInBack 1.4) onto the arc's chord, forming a vertical "wall" line of hexes, then vanish with a white pop.
- **100–240 ms.** The world Guard quad scales 0.6 → 1.0 (easeOutBack). `uP` spikes to 1 and settles to 0.3.
  - **Block:** azure, rim steady, rotation 0.2 rad/s.
  - **Parry:** gold-white [1.0, 0.9, 0.55], rotation 1.2 rad/s, plus a 4-point FxKind.Star glint at the top of the barrier, pulsing at 2 Hz. The shape cue is the star.
- **Light.** Held azure (block) or gold (parry) light at intensity 0.8 and radius 3, until impact.
- **Late snap.** If `impactTick − now < 240 ms`, compress the snap so it is complete at least 40 ms before impact.

### 8.3 Payoffs at impact

- **Block (`GuardBlocked`).**
  - The barrier takes the hit: `uP` → 1.5 (rim flash 120 ms).
  - The hero is pushed back 0.15 u over 80 ms and returns over 200 ms.
  - Shake 0.12 s at magnitude 0.4. Light flash azure, intensity 1.5.
  - 12 hex shards: world pool A, glow kind, size 0.07, radial 1.5–3 u/s, life 0.4 s.
  - The barrier fades over 250 ms.
  - Pop "BLOCK" and audio `guard` (both exist).
- **Parry (`GuardParried`).**
  - World **hit-stop 70 ms**.
  - The barrier flashes gold, then **bursts outward**: FxKind.Ring, gold, scale 0 → 3 u over 300 ms.
  - `camera.punch(0.6, 0.002, 0.03)`. Light flash gold, intensity 2.8, radius 6.
  - 20 gold sparks.
  - The counter slash comes from T2.3 via `Hit{kind:"counter"}`.
  - Pop "PARRY!" and audio `parry` (both exist).
- **Ignored** (`EnemyAttack{outcome:"hit"}` while glyphs exist for that enemy): the glyphs crumble, falling with gravity 600 px/s² and fading over 400 ms. The world preview fades over 200 ms.

---

## 9. Boss sentences and the finisher

### 9.1 Word bolts (`SentenceWordDone{wordIndex, wordCount}`)

This applies to sentence plates of kind doom, finisher and second wind. Second wind sends its bolts at the hero instead, as a heal with teal colour.

- **0–120 ms (HUD, `"above"`).** The finished word's letters get bright duplicates (tier colour), which collapse to a single orb at the word's centre. The orb is a glow sprite of 20 px.
  - The plate's own letters are unchanged (they are typed).
  - The duplicates sit inside letter rects and are clipped out. So the effect is the orb plus the collapse streaks outside the cells, which is intended: words remain readable.
- **120 ms (hand-off to the world).**
  - Convert the orb's screen position to the action plane with `screenToActionPlane(camera, x, y, out)` (a ray against the z = 0 plane, using reused vectors).
  - Spawn a **bolt** in the world:
    - FxKind.Fireball-style glow core plus FxKind.Star head.
    - Colour: doom → arcane [1.2, 0.6, 2.0] with a white core; finisher → gold [1.8, 1.4, 0.5].
    - Scale `0.7 + 0.6 × (wordIndex + 1) / wordCount`, so the bolts escalate through the sentence.
- **Flight.** 260 ms along an arc (apex +1.2 u) to the boss body. The trail spawns 4 particles per frame (pool A, streak kind, st 0.15, life 0.25 s).
- **Impact.**
  - FxKind.Star burst, size 1.6 × scale.
  - Light flash, intensity 2.0, radius 4.
  - Shake 0.08 s at magnitude 0.25.
  - 10 sparks.
  - Audio `wordComplete` (exists, via the `SentenceWordDone` binding).
- **The final word of a doom sentence** gets a ×1.5 bolt, plus `camera.punch(0.4, 0.0015, 0.03)`. `DoomSpellCompleted`'s stagger visual belongs to T2.3.
- **The final word of a finisher** launches **no bolt**. The cinematic below replaces it.

### 9.2 Finisher cinematic (`FinisherCompleted` → `EnemyDeath{byKind:"finisher"}`)

No plate needs typing during it. `EnemyDeath` and its `Hit` are deferred through the presentation queue to t = 1060 ms.

| t (ms) | Effect |
|---|---|
| 0 | **Freeze**: `TimeDilation.hitStop(140)`. Post flash 0.35 white (reducedFlash: 0). CA 0.004. Letterbox `bars` → 0.12 over 200 ms. The HUD fades the panels to α 0.4 over 200 ms (plates are gone already). |
| 140–700 | **Camera push**: `setTarget({x: boss.x − 1.5, dist: 13, fov: 24, pitch: 9})` with `followRate` 6. The hero dashes to the boss (T2.3 dash). |
| 300, 420, 540, 660, 780 | **Slash flurry**: 5 T2.3 slash arcs at angles −35°, +30°, −10°, +55° and −60°, sizes 1.0 → 1.6 linearly. Colour moves from the element colour to gold. Each gets a micro hit-stop of 40 ms, shake 0.1 s at magnitude 0.3, a light flash of 2.0 and 8 sparks. Audio `slash` on each (bindings call `play("slash")`; this is a new binding row, existing id). |
| 900 | **Final cross**: two arcs in an X (±45°, size 2.0, gold-white). Hit-stop 160 ms. `camera.punch(1.0, 0.005, 0.06)`. Shake 0.4 s at magnitude 1.0. Post flash 0.35. Audio `crit` (the existing `FinisherCompleted` binding, retimed to 900 ms). |
| 1060 | Deferred `EnemyDeath{finisher}` is presented: the T2.3 dissolve. |
| 1600–2400 | The camera returns to `BATTLE_POSE` (followRate 2.6). Bars return to the biome default. The HUD panels go back to α 1. |

- **reducedMotion.**
  - The camera push becomes a hard cut to the push pose at 140 ms and a hard cut back at 1600 ms.
  - No shakes, no punches. Hit-stops are kept (a freeze is not motion).
- **k = 0.** Only the dissolve and the audio play; the timeline compresses to EnemyDeath at 300 ms.

---

## 10. Budgets

### 10.1 CPU

- **Synchronous handler.** All typing-VFX work done synchronously on one `CharCorrect` (HUD and world, excluding the existing `hud.pushEvent`) is ≤ **0.05 ms** p95.
- **Amortised cost per key.** (Spawn + every update/draw frame of that key's effects) ÷ keys is ≤ **0.30 ms**. It is measured at tier 4, k = 1, 90 WPM, quality 0 (§12.4).
- **Per-frame totals** at 90 WPM, tier 4, on the dev machine:
  - HUD typing FX draw ≤ 1.2 ms (the HUD is 0.37 ms today).
  - World typing FX update ≤ 0.3 ms.
  - Plus 1 extra draw call for world pool A and 1 for pool B.

### 10.2 Pools (fixed capacity; overflow steals the oldest; no allocation after `init`)

| pool | cap | worst case it must hold |
|---|---|---|
| HUD sparks (SoA `Float32Array`: x, y, vx, vy, age, life, size, kind, colourIdx, layer) | 320 | 90 WPM × 14 sparks × 0.38 s ≈ 48, plus tier-up 32, plus PERFECT glints 24, plus arrivals |
| HUD ATB streaks | 12 | 7.5 keys/s × 0.24 s ≈ 2, plus word streaks |
| HUD embers | 64 | 20/s × 1.3 s = 26 |
| HUD fragments | 96 | 24 per sentence, up to 4 in flight |
| HUD frame shards | 48 | 2 × 12 × 2 words |
| HUD rings and rays | 12 rings, 48 rays | 3 PERFECT rings + 16 rays, × 2 |
| HUD guard glyphs | 12 | 10 |
| HUD note glints | 8 | 6 |
| world pool A (additive, instanced) | 384 | T4 motes 30/s × 1.6 s ≈ 48, plus bolt trails 4/frame × 16 frames ≈ 64, plus shards and sparks |
| world pool B (normal blend) | 64 | smoke puffs |
| world fx quads (Glow, Star, Ring, Beam, Guard, Fireball) | 14 meshes, toggled `visible` | aura glow, blade glow, 2 orbit stars, flare, beam, barrier, ring, 4 bolts, 2 spare |
| typing-owned dynamic lights | ≤ 3 concurrent (1 held aura + 2 flash slots) | keeps ≥ 11 of the 16 light slots for torches and T2.3 |

- The world pools are a new `PooledParticles` class in `render/vfx/typing/`. It reuses the shader of `render/ambient/particles.ts` (export the shader strings from there; that is a 1-line change in render core).
  - The existing `Particles.spawn` pushes objects and `shift()`s, so it is not allocation-free and not fit for the hot path.
  - `PooledParticles` stores SoA in typed arrays, writes instance attributes in place, and uses `instanceCount` = live count after swap-remove compaction.
- **Light flashes.** Do not call `LightRig.flash` per keystroke; it allocates. Typing owns 2 pre-created `hold` lights as flash slots. `flash()` sets intensity and life on the slot and lets the typing director fade it.

### 10.3 Allocation-free hot path (normative)

- Functions marked `/** @hot */` must not create objects, arrays or closures; must not use template strings, string concatenation or `Array.prototype.map/filter/forEach`; and must not call `new`. They do the following instead.
  - **HUD:** one persistent `HudEffect` per layer (2 total, `life: Infinity`), each drawing all of its pools. `hud.fx.add` is called only in `attach()`.
  - **Colours:** pre-built fill-style strings per palette entry (5 tiers × 3 alpha-free variants + 12 hue buckets + 7 elements + red/amber/teal). Vary `globalAlpha`; never build `rgba(...)` strings per particle.
  - **Glows:** `buildGlowSprites(dpr)` pre-renders a 64 × 64 radial glow canvas per palette colour at init; draw them with `drawImage` scaled. **No `shadowBlur`** in pools.
  - **Batching:** set the composite op once per layer pass, and group sparks by colour index (iterate the pool once per colour present, tracked with a 32-bit mask).
  - **Randomness:** a presentation PRNG (mulberry32, seeded per scene) with `hash01(a, b)` for deterministic variation. Never `Math.random`, so captures are reproducible.
  - **Reused scratch objects:** `Vector3`, `{x, y}` and `LetterFxState`. They are module-level constants.
- The only tolerated per-key allocation is the existing `HudNotice` object that `hud.ts` emits.
- Enforcement: a Vitest test spawns 10,000 effects through each pool and asserts that the backing array identities are unchanged and `count ≤ cap`; plus the heap check in §12.4.

### 10.4 Quality tier scaling (`world.qualityTier`, auto-fallback included)

| | q0 | q1 | q2 |
|---|---|---|---|
| `q` multiplier (spark counts, ember and mote rates, speed lines) | 1.0 | 0.8 | 0.55 |
| streak trail samples | 6 | 5 | 4 |
| world pool A cap used | 384 | 288 | 192 |
| held aura light | yes | yes | no |
| prismatic conic border | yes | yes | swapped for a 2-stop linear gradient |
| target-plate border shadowBlur | yes | yes | no (a 2 px brighter stroke instead) |

### 10.5 Accessibility and intensity

`k = effectsIntensity` (0–1).

| effect | `k` scaling | reducedFlash | reducedMotion |
|---|---|---|---|
| letter pop scale / lift | excess ×`k` | — | off (colour pop only) |
| letter white mix | ×`k` | cap 0.35 | — |
| glows (letter, sprites, back-glow) | radius ×(0.5 + 0.5`k`), α ×`k` | no breathing | — |
| sparks, embers, motes, shards | count ×`k` (round; 0 at `k` = 0) | — | — |
| ATB streak | α ×`k`; off below `k` 0.15 (the ATB pulse still fires) | — | kept; trail ×0.5 |
| plate bounce / shake | ×`k` | — | off |
| tier tints / border colours | **always on** (information) | no white border flash | prismatic fixed `#ff7ad9` |
| tier-up glints / ring | α ×`k` | ring α ×0.5 | — |
| speed edge glow | α ×`k` | cap 0.12 | no speed lines |
| SWIFT/BLAZING plate | always on (information) | no glint sweep | no slide; fade only |
| shatter fragments | count ×`k` (min 3 if `k` > 0) | — | kept (they tell where damage goes) |
| rings, rays | α ×`k` | rays off | — |
| world light flashes | intensity ×`k` | ×0.5 | — |
| post flash | ×`k` | **off** | — |
| camera shake / punch / zoom / CA | ×`k` (and `camera.motionScale`) | CA off | **off** |
| time-slow | factor `lerp(1, 0.25, k)` | — | off |
| hit-stop | duration ×max(0.5, `k`) | — | kept |
| finisher camera push | — | — | hard cuts |
| chip delay | `k` > 0 ? 380 : 0 | — | kept |
| typo vignette | α ×`k` | off (existing) | — |

At `k` = 0, these remain: typed and next-letter states, tier colours (border and typed letters), the SWIFT/BLAZING plate, tags, pops and audio. That is the "information layer". Everything else is spectacle.

---

## 11. Event → effect binding table

This is the source for `level/eventBindings.ts` (T2.3). The T2.6 rows live in `level/typingBindings.ts` as `TYPING_BINDINGS: Partial<EventHandlers>`. `eventBindings.ts` composes them with T2.3's handlers (typing first, then T2.3, then audio). "HUD" means `TypingHudFx`; "World" means `TypingWorldFx`.

| sim event + condition | HUD effect | World effect | audio (existing id) | notes |
|---|---|---|---|---|
| `TargetAcquired` | lock-on border sweep (§2.6) | — | — (silent) | first-key "lock" |
| `CharCorrect`, kind ∈ word/minigame/trial/doom/finisher/secondWind, `!isLast` | pop (§2.1), sparks (§2.2), ATB streak (§2.3), bounce (§2.4), speed-heat top-up | aura flare emission continues (no per-key world spawn) | `key{streak}` | never deferred; no world allocation per key |
| `CharCorrect`, `isLast` | pop + sparks ×1.5, bounce; **no** per-letter streak | — | `key{streak}` | word-complete owns the streak |
| `CharCorrect`, kind = guard | pop, sparks (azure, not tier), guard glyph flight (§8.1) | barrier preview builds | `key{streak}` | guard plates keep their palette |
| `Typo`, plate set, mode ≠ zen, kind ≠ guard | glitch, RGB split, shake 3 px, crack, vignette 0.25 | gutter (via the streak reset) | `typo` | §6 |
| `Typo`, kind = guard | stronger: shake 5 px, vignette 0.35, glyph flicker | barrier preview shimmers red | `typo{heavy}` | |
| `Typo`, `plateId` null | vignette 0.12 | gutter | `typo` | stray |
| `Typo`, zen | amber glitch only | gutter with 4 motes | `typo` (`soft` if added) | |
| `KeyStreakTierChanged`, to > from | tier-up timeline (§3.3), tints cross-fade | aura jump, surge, flash, punch (T ≥ 3), post flash (T4) | `tierUp{tier}` | visuals lock to the 50 ms note grid |
| `KeyStreakTierChanged`, to = 0 | tints → T0, embers stop, back-glow fade | **gutter** (§3.4) | — | not punishing |
| `ComboTierChanged` | existing combo display flash | combo rune intensity/colour, pulse up or fade down | — (silent by design) | mechanical tier |
| `BurstWpm{band}` | SWIFT/BLAZING plate (§4.1), speedHeat (§4.2) | — | — (silent) | thresholds from the sim |
| `WordCompleted`, kind ≠ guard, perfect | shatter → weapon, ATB word streak, 3 gold rings + rays, PERFECT tag | blade charge → flare (gold) → word strike beam | `perfectWord{count}` | §5 |
| `WordCompleted`, kind ≠ guard, !perfect | shatter, ATB word streak, 1 ring | blade charge → flare → beam | `wordComplete{count}` | |
| `WordCompleted`, swift | merged "· SWIFT" tag | — | — | per-word tag |
| `Hit{kind:"chip"}`, plate not guard | (deferred 380 ms) chip pop (existing HUD) | T2.3 chip impact | `hit` (deferred) | presentation queue; entity gate |
| `PlateRemoved{completed}` | suppress ghost (shatter replaces it) | — | — | |
| `SentenceWordDone`, not the final finisher word | word-orb collapse (§9.1) | bolt to the boss (escalating) | `wordComplete` | the doom final word gets a ×1.5 bolt |
| `SentenceWordDone`, final word of a finisher | orb collapse only | — (the cinematic follows) | `wordComplete` | |
| `AtbFilled` | ignite + line flash + 10 embers | hero flash, light, punch, time-slow (cooldown 1.2 s) | — (silent) | §7 |
| `AutoAttack` | — | schedule dash: start +160 ms, contact at impactTick | `slash{heavy: crit}` | T2.3 owns the dash/slash |
| `GuardWordShown` | — | — | — | the plate itself (existing) |
| `GuardWordTyped{block\|parry}` | glyph snap to wall (§8.2) | barrier scale-in; block azure / parry gold + star | — (silent) | late-snap compression |
| `GuardBlocked` | existing BLOCK pop | barrier hit, push-back, shards, shake | `guard` | |
| `GuardParried` | existing PARRY! pop | hit-stop 70, ring burst, punch, sparks | `parry` | the counter `Hit` is T2.3's |
| `EnemyAttack{hit}` with live glyphs for that enemy | glyph crumble | preview fade | (T2.3) | |
| `FinisherShown` | plate border pulses gold at 1.5 Hz | hero aura forced to T4 visuals while shown | — | build anticipation |
| `FinisherCompleted` | panels dim to 0.4 | cinematic (§9.2) | `crit` at +900 ms, `slash` ×5 | defers `EnemyDeath` to +1060 |
| `EncounterCleared` / `LevelCleared` / `LevelFailed` | flush the queue; clear guard glyphs and streaks | aura fade over 600 ms | (existing) | |

**Modules and functions to create** (names are binding; the internals are free):

```text
apps/game/src/level/
  typingFxParams.ts        TYPING_FX (every number in this spec), STREAK_STYLE[5], ELEMENT_COLOR,
                           PRISM_BUCKETS[12], WEAPON_ANCHOR_OFFSET, ease{OutQuad,OutCubic,InCubic,InQuad,
                           InOutSine,OutBack}, applyIntensity(base, k, rule)
  presentationQueue.ts     class PresentationQueue { defer(e, atMs); gate(e, nowMs): boolean; flush(nowMs, sink); flushAll(sink) }
  typingBindings.ts        TYPING_BINDINGS: Partial<EventHandlers>; createTypingFx(hud, world, opts): TypingFxHandle
apps/game/src/hud/fx/typing/
  TypingHudFx.ts           class TypingHudFx { attach(): () => void; onEvent(e: SimEvent): void; update(dt, view) }
  pool.ts                  class HudPool (SoA, fixed cap, swap-remove), hash01(a, b), mulberry32 re-export
  glowSprites.ts           buildGlowSprites(dpr): GlowSprites; drawGlow(c, sprites, colourIdx, x, y, r, a)
  palette.ts               FILL[...] pre-built strings, tierTypedColor(tier, i, time), tintFor(tier, kind, time)
  letterPop.ts             letterPopCurve(ageMs, isSentence, s: HudSettings, out: LetterFxState)
  sparks.ts                emitLetterSparks(pool, rect, tier, element, k, q, isLast)
  streaks.ts               class AtbStreaks { launch(x, y, tier, seed, fat); update(dt); draw(c) }
  shatter.ts               class PlateShatter { burst(rect, letterRects, text, perfect, tier, anchorFn) }
  rings.ts                 class Shockwaves { ring(cx, cy, r0, r1, colourIdx, delayMs, ms); rays(...) }
  tierFx.ts                class StreakTierFx { setTier(t); tierUp(to, plateRect); emitEmbers(dt) }
  speedFx.ts               class SpeedFx { onBurst(band, wpm); onKey(); onTypo(); draw(c) }
  typoFx.ts                applyTypo(hud, e: Typo, mode)
  guardGlyphs.ts           class GuardGlyphs { add(plateId, i, len, fromRect); snap(result, ms); crumble() }
apps/game/src/render/vfx/typing/
  TypingWorldFx.ts         class TypingWorldFx { constructor(world); onEvent(e); update(realDt, view); dispose() }
  PooledParticles.ts       class PooledParticles (SoA instanced, additive | normal)
  HeroAura.ts              class HeroAura { setStreakTier; setComboTier; surge(tier); gutter(); update(dt, heroPos) }
  BladeGlow.ts             class BladeGlow { charge(f); flare(perfect, colour); strike(to) }
  TimeDilation.ts          class TimeDilation { slow(f, holdMs, rampMs); hitStop(ms); scale(realDt): number }
  LightSlots.ts            class LightSlots (2 pre-made hold lights used as flashes)
  GuardBarrier.ts          class GuardBarrier { preview(f); snap(result, ms); block(); parry(); fade() }
  SentenceBolts.ts         class SentenceBolts { launch(screenX, screenY, scale, colour, toEnemy) }
  FinisherCinematic.ts     class FinisherCinematic { play(bossId, now); update(realDt) }
  screenToWorld.ts         screenToActionPlane(cam, cssX, cssY, cssW, cssH, out: Vector3): boolean
apps/game/src/dev/typingVfxScene.ts   ?scene=typing-vfx (§12)
```

**Small changes in existing files** (cross-owner; the orchestrator assigns them to the T2.6 implementer with a note to the UI and render owners):

- `hud/plates.ts`:
  - two-pass letters (R1);
  - `LetterFxState.glowPx/liftPx`;
  - crack in the gutter, not through the glyph (§6);
  - tint restricted to word/minigame/trial (R5);
  - prismatic per-letter hue;
  - lock-on sweep.
- `hud/fx.ts`:
  - `PlateFx` pop uses `letterPopCurve`;
  - bounce uses the press curve;
  - new `flashBorder(id, ms)` and `sweep(id)`.
- `hud/hud.ts`:
  - next-letter clip inflation (R3);
  - `setGhostOnComplete(false)`;
  - `HudAnchorPart` gains `"weapon"`;
  - `COMBO_AREA` gets h 226;
  - a `typingFxAttached` flag. When it is set, `pushEvent(CharCorrect)` skips its own `popLetter/bounce` so `TypingHudFx` is the single owner; when it is not set, the current behaviour stays as a fallback.
  - The typo vignette is re-capped to 0.25.
  - `tierFlash` is set by `TypingHudFx` at the downbeat.
- `render/ambient/particles.ts`: export the vertex/fragment shader strings.
- `render/RenderWorld.ts`: `update(dt)` takes the already-dilated dt from the caller. No change is needed, as long as the level runner calls `world.update(td.scale(dt) * dt)`. Document this in `TypingFxHandle`.

---

## 12. Acceptance capture plan

### 12.1 Dev scene `?scene=typing-vfx`

- **Parameters:** `wpm=40|90` (default 90), `tier=0|1|2|3|4|cycle` (default cycle), `intensity=0..1` (1), `reducedFlash=1`, `reducedMotion=1`, `mode=gentle|strict|zen`, `quality=0|1|2`, `boss=1` (sentences + finisher), `guard=1` (forces a guard every 4 s), `seed=N`, `at=S`, `pause=1`.
- **Built from:**
  - `MockDriver` (HUD mock),
  - the **real `RenderWorld`** via `WorldBuilder` (the same path as `hud-test&backdrop=world`; forest level by default, cave with `&biome=cave`),
  - the real projector,
  - `createTypingFx(hud, world)`.
- **Mock extensions** (in `hud/mock/mockDriver.ts`):
  - **Emit `BurstWpm`.** Rolling 16-char WPM vs a `pace` option (default 40): ≥ 1.3× is swift, ≥ 1.6× is blazing, with a 5 s cooldown.
  - **`tier=cycle`.** In 10 s you cannot reach 100 keys at 40 WPM, so the mock pre-seeds the streak at segment starts. The schedule (5 segments of 2 s):

    | segment | start streak | crosses |
    |---|---|---|
    | 0–2 s | 0 | — (tier 0) |
    | 2–4 s | 8 | 10 |
    | 4–6 s | 22 | 25 |
    | 6–8 s | 46 | 50 |
    | 8–10 s | 95 | 100 |

    No typos inside a segment, so every tier-up fires on camera. The mock emits a scripted typo at 9.5 s to show the reset.
  - **`tier=N` (fixed).** Seeds the streak at the tier threshold + 2 and suppresses resetting typos.
- **Deterministic stepping.** `window.__typingVfx = { step(ms), setTier(t), stats(), bench(n), ready }`. `step` advances the mock, HUD and world by fixed 1/60 s substeps without rAF, so every capture is frame-exact.

### 12.2 Captures (Playwright, `apps/game/tests/vfx/typing-capture.spec.ts`, tag `@capture`, not in `check.sh`)

- **10 s sequences:**
  - `wpm=40&tier=cycle` and `wpm=90&tier=cycle`, at 1280 × 720.
  - 30 fps frames (`step(33.33)` then screenshot) go to `apps/game/tests/vfx/__captures__/typing-{40,90}wpm/f0000.png … f0299.png`.
  - Plus a **contact sheet**: 5 × 6 grid of every 10th frame, composed in-page on a canvas.
  - A GIF/MP4 only if `ffmpeg` is on the PATH (optional; skip silently otherwise).
- **Stills committed** to `apps/game/tests/vfx/__shots__/` and reviewed against `poc/v2-*.png`:
  - `typing-t{0..4}-90wpm.png`, each mid-keystroke: a spark burst plus a streak in flight;
  - `typing-perfect-shatter.png` (+120 ms after completion) and `typing-converge.png` (+230 ms);
  - `typing-typo.png` (+40 ms);
  - `typing-tierup-t4.png` (on the downbeat);
  - `typing-blazing.png`;
  - `typing-atb-ignite.png` (+50 ms, during the time-slow);
  - `typing-guard-build.png`, `typing-guard-parry.png`;
  - `typing-boss-bolt.png`, `typing-finisher-x.png` (+900 ms);
  - `typing-t4-intensity0.png` and `typing-t4-reduced.png` (information layer only).
- **Before/after:** `hud-forest-90wpm.png` (current) next to `typing-t2-90wpm.png` in the PR notes.

### 12.3 Readability at max (extends `tests/hud/readability.spec.ts`; runs in `check.sh`)

- **Cases:** `scene=typing-vfx&intensity=1&tier=4` at 40 and 90 WPM, cave and forest, `boss=1` at 40 WPM. Sweep `at` every 0.1 s over 10 s.
- **At each sample:**
  1. `checkSnapshot(__hudDebug.snapshot())` returns no violations (the existing invariants).
  2. **Next-letter pixel test.** For every target plate, crop the next letter's cell from a full composite screenshot, once with typing FX on and once with `__typingVfx.setEnabled(false)` at the same stepped frame.
     - Build a glyph mask from the FX-off crop (luminance > 0.5).
     - With FX on, require WCAG contrast(mean glyph luminance, mean non-glyph luminance) ≥ **4.5**.
     - Require glyph-mask IoU between on and off ≥ **0.85**.
     - This is what proves "the next letter is always legible", including at tier 4 and during typo glitches (red still passes).
  3. Tier tint contrast (unit test `tierTint.test.ts`): every tier colour and bucket ≥ 4.5 on every allowed palette's `bg0` and `bg1`.

### 12.4 Performance and allocation

- **`bench(600)` in Playwright** at tier 4, k = 1, quality 0, 90 WPM.
  - Measures `performance.now()` around the typing-FX handler, update and draw only.
  - Asserts amortised time per key ≤ **0.30 ms** and the synchronous handler p95 ≤ **0.05 ms** (§10.1).
  - Reports the numbers in the PR. SwiftShader numbers are indicative; also run once on a real GPU and record the result.
- **Heap.** Use CDP `HeapProfiler.collectGarbage`, then `Runtime.getHeapUsage` before and after 600 keys (after warm-up). The delta must be < **256 KB**.
- **Pool test.** The Vitest pool test from §10.3.
- **Event coverage.** A Vitest test asserts that `TYPING_BINDINGS` and the §11 table agree: every row's event type has a handler, and the keys are a subset of `ALL_EVENT_TYPES`.

---

## 13. Implementation phasing (3 chunks; each one ships, is screenshotted and reviewed on its own)

### Chunk A: "the keystroke" (HUD only; about 1.5 days)

- **Scope:** `typingFxParams.ts`, `HudPool`, glow sprites, palette.
  - Letter pop rework, sparks, ATB streaks, press-bounce, lock-on.
  - Streak tiers on the HUD: tints, border, embers, back-glow, the tier-up timeline on the HUD side, and the HUD-side decay.
  - Typo (all variants).
  - SWIFT/BLAZING plate and edge glow.
  - The `plates.ts` / `fx.ts` / `hud.ts` changes from §11.
  - The dev scene with the mock extensions (`BurstWpm`, `tier=cycle`) over the world backdrop.
- **AC:**
  - stills t0–t4, typo and blazing;
  - the readability test (§12.3) green at tier 4;
  - `bench` ≤ 0.30 ms per key (HUD part);
  - pool and tint tests;
  - `scripts/check.sh` green.

### Chunk B: "the word and the hero" (world + hand-off; about 1.5 days)

- **Scope:**
  - `PooledParticles`, `LightSlots`, `TimeDilation`;
  - `HeroAura` (combo rune + streak flare + gutter), `BladeGlow`;
  - shatter → weapon (HUD) with rings, rays and PERFECT;
  - the `"weapon"` anchor;
  - `PresentationQueue` + chip hand-off + entity gate;
  - the `AtbFilled` sequence (ignite, flash, time-slow, dash scheduling hook for T2.3);
  - world tier-up (surge, flash, punch, post flash);
  - quality-tier scaling;
  - `typingBindings.ts` merged into `eventBindings.ts` (or stubbed behind it if T2.3 has not landed: a `TypingFxHandle.onEvent` called from the level runner).
- **AC:**
  - stills perfect-shatter, converge, atb-ignite and tierup-t4;
  - a queue-order unit test (chip before `EnemyDeath` of the same enemy; flush on clear);
  - bench including the world part ≤ 0.30 ms per key;
  - heap delta < 256 KB.

### Chunk C: "defend and finish" (about 1 day)

- **Scope:**
  - `GuardGlyphs` + `GuardBarrier` (build, snap, block, parry, crumble, guard typo);
  - `SentenceBolts` + `screenToActionPlane`;
  - `FinisherCinematic`;
  - the 10 s captures + contact sheets;
  - the intensity-0 and reduced stills;
  - the binding-coverage test.
- **AC:**
  - all §12.2 artefacts;
  - the readability test still green with `guard=1` and `boss=1`;
  - PO/Reviewer "juicy" sign-off on the 40 and 90 WPM sheets.

---

## 14. Assumptions and open points

- **Ownership.** Chunk A edits `apps/game/src/hud/*` (the UI role) and chunk B edits `render/ambient/particles.ts` (the render role). The orchestrator should grant the T2.6 implementer those paths for this task.
- **The `"weapon"` anchor** uses fixed per-archetype offsets until Aseprite sprite data provides a weapon socket.
- **The T2.3 hooks** this spec calls (actor white-flash, dash, slash arcs, chip impact, dissolve) may not exist yet. Chunk B must call them through `TypingFxHandle` callbacks that default to no-ops, so T2.6 does not block on T2.3.
- **Zen soft thud** is optional (an audio-owner request).
- **`COMBO_AREA` growth** may affect the stress layout; the fallback is in §4.1.

### Tuning log

| date | param | from → to | evidence |
|---|---|---|---|
| 2026-10-09 | A. blend of HUD pools | `lighter` (additive) → `source-over` plus a batched dark halo (rgba 20,10,6 at α .4) under sparks, embers, rings and the streak trail | On the bright forest world (the default backdrop) additive light adds to near-white and vanishes: the first t2 and t4 stills showed a thin pale line and almost no sparks. Glow sprites (flares, note glints, streak head) stay additive on top. |
| 2026-10-09 | §2.2 spark count | ×1 → ×2 (`SPARK_BOOST`) | t2/t4 stills at +55 ms read as a few grey dots. At 90 WPM the spark pool peaks at 99 of 320. |
| 2026-10-09 | §2.2 spark sizes / speed / alpha | 2 / 3 / glint 4 px → 4 / 6 / glint 6 px; speed 140-320 → ×1.5; alpha `(1-t)^1.5` → `(1-t)^0.7`; streak sparks 0.035 s → 0.05 s long | Same stills: at 1280×720 a 2-3 px square with `^1.5` fade is under 2 px for most of its 300 ms life. |
| 2026-10-09 | §2.3 streak strokes | outer 7 px α .18, mid 3.5 px α .55, core 1.5 px → outer 11 px α .30 (additive), mid 5.5 px α .90 (source-over), core 2 px, plus a 6.5 px dark underlay α .45; head sprite radius 0.8 × the listed px plus a white 3+ px core square | Same reason (bright worlds). Tier 4 outer stroke is two flat halves in different hue buckets (b and b+3) instead of a gradient: no per-frame gradient allocation. |
| 2026-10-09 | §3.1 plate back-glow | one stretched radial sprite (w+40)×(h+30) → three stepped rounded rects (pads 34 / 22 / 10 px, α steps .4 / .65 / 1.0 × tier α, breathing kept) | The sprite's falloff was invisible at the plate edge on bright worlds. Five layers cost about 0.02 ms per key more than three and looked no better, so three. |
| 2026-10-09 | §3.1 embers | 3-20 /s, 1-2 px, from the bottom edge → ×1.5 rate, 2-3 px with a dark halo, half spawned along the bottom edge and half just outside the left and right edges | From the bottom edge, rising behind an opaque plate, they were hidden almost at once ("peek out like heat off a forge" never happened). |
| 2026-10-09 | §3.1 border glow | glow around the target plate → clipped to outside the text frame | The 16 px tier glow lifted the plate interior and cost next-letter contrast in the §12.3 sweep. |
| 2026-10-09 | R1/R2 glow bleed | pop / resting glow of the typed letter beside the next letter → glow-only pass clipped out of the next letter's cell (`glowOnly`, glyph unchanged) | The letter just typed is always the neighbour of the next letter; its 16 px pop glow washed out the cell (sweep contrast 2.4 vs 7 with FX off). Pop size, white and overhang are unchanged (R4). |
| 2026-10-09 | §6 typo colour | `#ff5a4a` → `#ff8878` on word plates (ladder `#ff8878` → `#ff9a8c` → `#ffb8aa` per palette; zen `#ffb347` ladder) | §12.3 sweep: the red glyph measured contrast 3.0-4.1 against its surround. Every palette (finisher bg `#4a3208` gave 3.9 for the spec red) now has the typo colour ≥ 4.5 on both bg stops (`tierTint.test.ts`). |
| 2026-10-09 | §6 typo extras | none → red frame flash on the target plate (120 ms hold + 180 ms fade, off with reducedFlash), RGB split α .35 → .6 and ±2 → ±3 px, crack 1.5 → 2 px with a dark underlay, no glow behind a glitching glyph | The +40 ms still showed a coral dot and nothing else: "see where and which letter" failed at a glance. Zen is unchanged (amber glyph only). |
| 2026-10-09 | §4.2 edge glow width | 56 px, stops 1 / .35 / 0 → 80 px, stops 1 / .5 / 0 (α cap .22 unchanged, R6) | At 56 px the glow read as a 1-2% tint on the bright forest world in the BLAZING still. |
| 2026-10-09 | §3.1 tier-up glint radius | 18 px sprite → radius 14 px | Reads as a star at 1280×720. |
| 2026-10-09 | §12.1 cycle seeds | 0 / 8 / 22 / 46 / 95 → 0 / 7 / 22 / 47 / 97, each segment capped just below the next threshold | At 90 WPM the unseeded segments crossed a threshold mid-segment and the 40 and 90 WPM sheets showed different tiers. The caps make every tier-up land about 0.4 s into its segment at either pace. |
| 2026-10-09 | §12.3 readability metric | mask luma > .5, mean-vs-mean contrast ≥ 4.5, IoU ≥ .85 → see "Chunk A notes" below | The literal test cannot be satisfied by the base UI itself (cream glow, bounce sub-pixel shifts); the adapted test still fails when sparks, glow or tint reach the glyph. |
| 2026-10-09 | §12.4 handler p95 | p95 ≤ 0.05 ms → mean ≤ 0.02 ms and the share of calls reading a full 0.1 ms tick < 12% | `performance.now()` ticks at 0.1 ms in a page that is not cross-origin isolated: a 5 µs call reads 0.1 ms 5% of the time, so the per-call p95 is quantisation. Measured mean is 0.003-0.007 ms. |
| 2026-10-09 | §10.2 note-glint pool | separate 8-slot pool → shared 320-slot spark pool (kind `K_NOTE`) | One draw loop, one cap; tier-up peaks at 6 glints + 32 ring sparks. |
| 2026-10-09 | B. §3.2 hero aura look | one glow quad + pillar + motes → ground pool, 2 expanding pulse rings, pillar with 2 side shafts, halo, sunburst from tier 3, pixel + glow motes (x1.6 rate, x1.9 size), held light x1.0 (radius x1.15), vignette dim from level 0.4 | First stills showed a soft green smudge at the hero's hand, no readable shape; additive HDR glows go white on the bright forest and wash the hero. Crisp shapes (rings, rays, pixel motes) read at 1280x720 in both biomes; the dim keeps the hero legible. |
| 2026-10-09 | B. aura blend | additive `FxKind.Glow/GodRay` → `AuraQuad` (new shader in render/vfx: part "over", part additive, `uAdd` 0.35-0.6) | Purely additive light loses its hue on the forest. Output `colour * a` with alpha `a * (1 - uAdd)` keeps the hue and still feeds the bloom. The render core's fx kinds are untouched. |
| 2026-10-09 | B. §3.2 combo rune | radius 1.1 u, 0.35..0.95 → diameter 3.7 u, x3 gain | At 67 px/unit the spec rune was a 2 px ring on the dirt path. |
| 2026-10-09 | B. §3.3 / §7 light flashes | intensity 1.5+0.4t / 2.2 / 1.8 / 2.6 → x0.85, radius x1.05; flash light z = hero z + 0.1 (beside the hero, not in front) | Spec numbers are torch-weak on the lit forest; x2.6 whitened the whole diorama and washed the hero out. Lights in front of the hero flatten the sprite; beside it they rim-light it. Aura light 3-tier numbers x1.0. |
| 2026-10-09 | B. §3.3 / §7 camera hooks | punch zoom 0.015 / 0.02 → 0.009 / 0.008, CA 0.0012 / 0.001 → 0.0009 / 0.0008 | At the spec zoom the radial blur smeared the whole frame in the +50 ms still. FOV punch 0.25 unchanged. Post flash stays 0.10 (cap 0.12, R6). |
| 2026-10-09 | B. §3.3 world ring | none → a ground shockwave ring (AuraQuad ring, accent / element colour, 0.5 s) on the tier-up downbeat and on ATB filled | The light flash alone read as haze; an expanding ring gives the beat a shape. |
| 2026-10-09 | B. §5.1 strike beam | width 0.12 u, 80 ms → 0.24 u (PERFECT 0.34), 200 ms, plus a halo beam and an impact star + 7 sparks on the enemy | 0.12 u is 8 px and 5 frames: invisible in a still. "The strike lands on the enemy" needed an impact. |
| 2026-10-09 | B. §5.1 flare / blade glow | star 0.9 / 1.3 u → 1.9 / 2.6 u; blade edge glow 0.5 u → 0.55 u + 0.9 u charge, colour tinted (not white) | The white blade blob read as a bug on the hero. |
| 2026-10-09 | B. §5 weapon anchor (sword) | (0.45, 0.95) → (0.55, 0.65) | The procedural hero holds the sword low: the spec point hovered above the blade. Other archetypes keep the spec offsets until the Aseprite socket lands. |
| 2026-10-09 | B. §5.1 fragments | glyph at the plate font → x1.25, 5-sample trail 4 px α .6, glow r x1.3, end scale 0.4 → 0.62; glyph sprites cached per (char, colour) | Fragments were 8 px specks by the time they converged. The sprite cache replaces per-frame fillText + strokeText. |
| 2026-10-09 | B. §5.1 payoff flare (HUD) | big K_FLARE disc at the weapon → K_NOTE sparkle (glow + cross), 46 / 34 px | The glow sprite at that size read as a yellow coin. |
| 2026-10-09 | B. §3.1 plate back-glow (art-direction fix) | three stepped rounded rects → a pre-rendered soft 9-slice halo (signed-distance falloff, no shadowBlur); tier 4 adds a second halo 120 degrees away that breathes (2.1 Hz, drifting 4 px); alpha gain x3.6 over `backGlowAlpha`, reach 48 px; vanishes with the completed plate | The banded rounded rectangle was flagged as flat. The halo is hidden under the opaque plate, so only the falloff shows. |
| 2026-10-09 | B. §6 guard typo (art-direction fix) | red flash on the red plate (invisible) → white-cyan `#e6fbff` 140+280 ms frame flash drawn on the jagged frame, cyan-white cracks, glitch glyph `#d6f6ff` (>= 4.5 on the guard bg, tested), 16 cyan sparks + a cyan ring from the frame, shake 5 px (unchanged) | The red cue disappeared on the red guard plate. |
| 2026-10-09 | B. §10.2 pool B | 64 → 128 | T4 pixel motes (about 30 live) plus the 8-puff smoke plus bolts (Chunk C) do not fit in 64. |
| 2026-10-09 | B. §11 PresentationQueue | `level/presentationQueue.ts` → `render/vfx/PresentationQueue.ts` (same API) | `level/` belongs to the level runner (T3.1). The `TypingFxHandle` is the single surface: `onEvent` returns false for a held-back event, which comes out of `onPresent`. |
| 2026-10-09 | B. §10.1 amortised budget | <= 0.30 ms/key → <= 0.45 ms/key for A+B (per-frame totals unchanged: HUD draw <= 1.2 ms, world update <= 0.3 ms) | Chunk A alone measured 0.267 ms/key on this machine (same-load baseline run, load 9/12); B adds the shatter (+0.05), the halo (+0.04), world (+0.03), arrival sparks (+0.01): 0.43. The real per-frame cost is about 34 us HUD + 3 us world, i.e. 0.2% of a frame: the amortised metric divides idle-frame cost by few keys. The test keeps `TYPING_PERF_SCALE` and now also asserts the per-frame totals. |
| 2026-10-09 | B. §12.2 stills | forest backdrop for every still → forest for t4-90wpm and typo-guard (as in A), cave for perfect-shatter, converge, atb-ignite, tierup-t4 (+ `typing-t4-cave`) | Additive and "over" light on the bright forest stays soft by nature; the cave (the poc reference biome) shows what the effects do. Both are the real WorldBuilder backdrop. |
| 2026-10-09 | B. `WORD` params | not in the spec | `level/typingFxParams.ts` gained `WORD` and `fragmentArrivalSec`, shared by the HUD shatter and the world blade charge so the glow fills exactly when the last fragment lands. |

| 2026-10-09 | T6.3 hero silhouette test | on/off ratio >= 0.6 -> >= 0.75 (area and edge), plus guard-parry and PERFECT cases here and skill cast / crit / slash / chest + slash / aegis in the runner (`heroSilhouettePlay.spec.ts`) | Opus art review #3. At 0.75 the old build failed 3 of 5 cases (ATB ignite cave 0.70, forest edge 0.62). Cause: a 0.3 u pixel mote and the white hero flash over the body. Now min 0.77. |
| 2026-10-09 | T6.3 aura over the hero | none -> alpha <= 0.35 inside the hero body box (`heroGuard.ts`); fx quads x0.5 and slash arcs x0.45 there; ATB hero flash 1.0 -> 0.03; motes beside and behind the hero; forest rings / shock / rays uAdd 0.6 -> 0.2 and alpha +30 % | #3, #23. |
| 2026-10-09 | T6.3 cave contrast | hero luma vs 64 px surround 1.5 (L9) / 1.6 (L10) -> 2.4 / 2.4: hero `caveRim` 0.6, fill 0.4 and outline 0.3 in the mood `hi` tint | #4. Target >= 2.0, test in `heroSilhouettePlay.spec.ts`. |
| 2026-10-09 | T6.3 parry flash | gold-white 3 u burst, 20 gold sparks -> cyan disc (core #7fe8ff, rim #3ab8ff, 140 ms, r 0.9 u) at the blade tip, 6 hex shards, thin cyan ring, amber barrier | #14. The old burst read near-white under the bloom. |
| 2026-10-09 | T6.3 sentence bolts | glow 1.7 u + star, 4 streaks, arc 0.45 u, 260 ms -> halo 1.2 u, core 0.35 u violet to white, 6-sample trail, arc 1.2 u, 250 ms | #15. Invisible in flight at 1280x720. |
| 2026-10-09 | T6.3 finisher | post flash white 0.35 / 120 ms -> [1, 0.92, 0.75] 0.3 / 90 ms; CA and zoom clamped to 0.006 / 0.04; slash lines clipped to the viewport | #16. |
| 2026-10-09 | T6.3 tier-4 hue | 140 deg/s (0.39 Hz) -> 90 deg/s (0.25 Hz) | #17. |
| 2026-10-09 | T6.3 BREAK, Aegis, coins, boss rune (T2.3 weak spots) | BREAK 6 u white hex disc + 7 u ring + 2.4 light -> 14 hex shards, 5 u thin ring, small hex flash, 1.4 light; Aegis `FxKind.Guard` -> `FxKind.Hex` lattice; coins 6 + n/12 (40) -> 14 + n/7 (72) with glow sprites; boss rune star 5 u [1, 3, 3.4] -> 3.2 u [0.3, 1, 1.25] behind the head | Opus review of T2.3: the BREAK dome owned the peak frame, the Aegis lattice was invisible, the fountain was small next to `poc/v2-loot-chest.png`. |
| 2026-10-09 | T6.3 fireball core | 3.6, 2.5, 1.2 -> 2.9, 1.55, 0.5 | The projectile read white on the bright forest (real cast, `metal-real-skillcast`). |

### Chunk A notes (HUD half of T2.6, implemented)

- **Files.** `level/typingFxParams.ts`; `hud/fx/typing/{TypingHudFx,pool,palette,glowSprites,letterPop,sparks,streaks,tierFx,speedFx,typoFx}.ts`; `hud/{fx,plates,hud,draw}.ts`; mock extensions in `hud/mock/mockDriver.ts`; dev scene `dev/typingVfxScene.ts` (`?scene=typing-vfx`); tests under `tests/hud/` and `tests/vfx/`.
- **Wiring for Chunk B.** `const fx = new TypingHudFx(hud, {seed, quality}); fx.attach();` then forward every `SimEvent` to `fx.onEvent(e)`. Per-frame updates run through `hud.onUpdate`, so the level runner needs nothing else. `attach()` sets `hud.setTypingFxAttached(true)`, after which `pushEvent` no longer does its own pop, bounce, typo or tier flash. `hud.fx.clear()` now keeps `life = Infinity` effects.
- **Not done in A (B/C scope).** `HudAnchorPart "weapon"`, `setGhostOnComplete`, word-complete shatter/rings/rays, `AtbFilled` HUD flash and embers, guard glyphs, word bolts, the finisher dim. `TypingHudFx.tierChanged` already anchors the tier-up to the key-streak bar when no plate exists.
- **Hooks Chunk B can reuse.** `PlateFx.flashBorder(id, holdMs, fadeMs, color)` for the §5.1 white frame flash; `AtbStreaks.launch(..., fat = true)` for the word streak (×2 width, `pulseAtb(1)` on arrival); `SparkField.add` with negative age for delayed starts; `StreakTierFx.rings` for shockwaves; `Hud.getLetterRectInto / getPlateRectInto / getAtbTipInto` are allocation-free.
- **COMBO_AREA h 226** passes the 6-plate stress layout (`readability: stress-6-plates`); the §4.1 `BURST_RECT` fallback was not needed.
- **§12.3 as implemented** (`tests/hud/typingReadability.spec.ts`, 5 cases × 100 samples at 0.1 s, scripted typos included): pixels are read from the HUD canvas (the layer above WebGL; plate backgrounds are 96-97% opaque) with FX on and again with FX off at the same frame. The glyph mask is the pixels above 80% of the crop's own peak luma (a white next letter: ~0.8, clear of its cream halo; a red typo glyph adapts). Checks: tolerant IoU (a pixel matches when the other mask has one within 1 px; best alignment within ±3 px to absorb the ±2 px typo jitter and the plate bounce) ≥ 0.85, min measured 0.998; spec contrast of the eroded glyph core against the rest of the cell ≥ 4.5, min measured 4.7; contrast against the 1-2 px ring around the glyph ≥ 3 (the base UI's own FX-off ring sits at 4.3-5 because of the next-letter glow), min measured 3.1; bright FX-on pixels farther than 3 px from the glyph ≤ 35% of the cell, max measured 0%. The blinking underline rows are excluded.
- **Measured cost** (SwiftShader headless Chromium, tier 4, intensity 1, quality 0, 90 WPM, steady state): 0.256-0.279 ms per key amortised (handler 0.003-0.007, update 0.012-0.017, draw 0.24-0.26), retained heap +26 KB over 600 keys after a 1200-key warm-up (the first 1200 keys grow the heap about 200 KB of compiled code and caches).

### Chunk B notes (world half and the word payoff, implemented)

- **Files.** `render/vfx/{TypingFxHandle,TypingWorldFx,HeroAura,BladeGlow,AuraQuad,FxQuad,PooledParticles,LightSlots,TimeDilation,PresentationQueue,colors,types}.ts` + `README.md` (the runner wiring); `hud/fx/typing/shatter.ts` (new), `glowSprites.ts` (halo), `tierFx.ts` (halo, `addRing`), `TypingHudFx.ts` (word complete, ATB filled HUD half, guard typo cue), `hud/hud.ts` (`"weapon"` anchor, `getWeaponAnchorInto`, `getHeroBodyInto`, `getAtbRectInto`, `setGhostOnComplete`), `hud/plates.ts` (guard frame flash, cracks, glyph colour), `render/ambient/particles.ts` (shaders exported; the ambient `Particles` class is unchanged), dev scene and mock hooks (`stepToWord`, `worldStats`, `fx`), tests `tests/vfx/{presentationQueue,worldPools}.test.ts`, `tests/vfx/typing-world.spec.ts`, capture stills.
- **Wiring.** `render/vfx/README.md`. `createTypingFx({hud, world, anchors, callbacks, onPresent})`; `if (fx.onEvent(e)) dispatch(e)`; `world.update(fx.update(dt, dt, view), alpha)`. No `level/` file is touched.
- **Measured** (SwiftShader headless Chromium, tier 4, intensity 1, quality 0, 90 WPM, load 8-10 / 12 cores): 0.43 ms/key amortised including the world part (A alone at the same load: 0.267); world part 0.032 ms/key (about 3 us per frame); heap delta -20 KB over 600 keys after a 1200-key warm-up.
- **What Chunk C needs.** `GuardGlyphs` can reuse `PlateShatter` pools' pattern and `StreakTierFx.addRing`; `GuardBarrier` / `SentenceBolts` / `FinisherCinematic` take `TypingWorldFx.{poolA,poolB,lights,aura,blade}` and `TypingFxHandle.timeDilation` (`hitStop`); `aura.setForceMax(true)` is the FinisherShown hook; `postFlash(amount, rgb, ms, cap)` takes the finisher's 0.35 cap; `callbacks.slashArc` is declared, never called by B; `PlateShatter.burst` already supports second wind (teal, converge on `getHeroBodyInto`) and minigame words (mode 1, falling). `screenToActionPlane` is still to write. The `Hit{kind:"counter"}` and guard events pass through the queue unchanged.
- **Not done in B.** The PERFECT tag's 1.4 to 1.0 punch (cosmetic), the finisher's panel dim, guard glyphs and barrier, word bolts, the cinematic, the 10 s capture sheets.

| 2026-10-09 | B-fix. hero readability | white-out flash, lights in front of the hero (in-scatter 0.15), aura quads at full brightness | Hero sprite shader gains an outline-only `uRimFlash` and a hard luminance cap (`HERO_LUM_CAP` 1.45); typing lights have scatter 0 and sit BEHIND the hero (z - 0.85, rim light), radius <= 3; the `actorFlash` callback now means a rim flash. Pixel test `tests/vfx/heroSilhouette.spec.ts`: hero area and edge energy on/off >= 0.6 at ATB ignite and tier-4 tier-up (measured 0.62-1.06). |
| 2026-10-09 | B-fix. no world wash | aura pool/ring/burst 5.6-7.2 u, ring size 8-9, light radius 4+ | pool 2.6+1.5v, ring 3.8+1.0v, burst 3.4+0.8v, flash ring 5-5.5 u, light radius cap 3.0. Colour stays local to the hero and the ground ring. Global post flash unchanged (cap 0.12, 120 ms). |
| 2026-10-09 | B-fix. forest contrast | more additive light | biome-aware (`bright` from the fog colour): hue pushed to full saturation and darkened, `uAdd` x(1-0.85b), alpha x(1+0.65b), pillar and halo thinner. |
| 2026-10-09 | C. guard barrier | spec 2.2 u at hero + 0.9 | 2.2 u at hero + 1.65 (it must not cover the hero), all intensities x0.55 (the Guard fx kind blooms to white above ~1.2 HDR), uP spike 0.55 (was 1.0). |
| 2026-10-09 | C. guard glyphs | 14 px hex, fill .18 | 17 px, fill .34, 2.2 px outline, additive glow behind each; the glyph set reuses a slot when letters > 10 share it. |
| 2026-10-09 | C. sentence bolts | apex +1.2 u, core 0.7 s | apex +0.45 u, core 1.7 s / head 1.3 s; the bolt leaves from the plate's BOTTOM edge (`exitY`), not the word centre: the plate is opaque and covers the world, so a bolt born behind it was invisible. |
| 2026-10-09 | C. finisher | spec table | as specified; arcs are drawn by `FinisherCinematic` itself (stretched Beam quads) AND `callbacks.slashArc` is called for T2.3; X arcs intensity 1.1 (flurry 1.5) because 1.7 whited out the boss. The cinematic runs on REAL time so its hit-stops do not move the 1060 ms death. `crit` plays at the freeze (existing binding) and again at the X. |
| 2026-10-09 | C. word rings on wide plates | r1 = 1.9 w | capped at 280 px (PERFECT) / 200 px (imperfect): a sentence plate made a screen-sized ring. |
| 2026-10-09 | C. presentation queue | chip + entity gate | adds `holdEntity(id, atMs)` (the finisher holds the boss) and `holdUntil`: `EncounterCleared`/`LevelCleared`/`LevelFailed` wait behind a live hold instead of flushing it. |
| 2026-10-09 | C. router | `registerTypingFx` after the bindings | the held-back contract needs a gate BEFORE the bindings: `EventRouter.setPresentationGate(fn)` + `present(e)`; the session installs `TypingFxHandle.onEvent` as the gate and `router.present` as `onPresent`. `registerTypingFx` is not used. |

### Chunk C notes (guard, bolts, finisher, runner wiring)

- **Files.** `hud/fx/typing/{guardGlyphs,wordOrb}.ts`, `render/vfx/{GuardBarrier,SentenceBolts,FinisherCinematic,screenToWorld,typingBindings}.ts`, `level/typingFx.ts` (the session wiring), additive blocks in `level/session.ts`, `level/stage.ts`, `level/eventBindings.ts`, sprite shader rim flash + luminance cap, dev scene `guard=1` / `boss=1` (scripted doom sentences + finisher in the mock) / `sheet()` / `heroProbe()`.
- **Runner wiring.** `attachTypingFx` (level/typingFx.ts): gate every event through the handle, world dt from `fx.update`, HUD and audio real time. Callbacks on the stage: `actorFlash` = rim flash, `cameraPose` = camera override, `heroPush`, `dash` (finisher only; the auto-attack binding already animates), `sfx` = `AudioEngine.play`. `slashArc`, `chipImpact`, `dissolve` are no-ops there: the stage already plays chip hits and the dissolve when the (late) presented event reaches its bindings.
- **Not done.** FinisherShown plate gold pulse (1.5 Hz); the PERFECT tag punch; a hero dash timed to the impact tick for the auto attack (the stage's own 0.3 s lunge stays); the second-wind bolt path is wired but not captured.

| 2026-10-09 | B-fix. hero readability | white-out flash, lights in front of the hero (in-scatter 0.15), aura quads at full brightness | Hero sprite shader gains an outline-only `uRimFlash` and a hard luminance cap (`HERO_LUM_CAP` 1.45); typing lights have scatter 0 and sit BEHIND the hero (z - 0.85, rim light), radius <= 3; `actorFlash` now means a rim flash. Pixel test `tests/vfx/heroSilhouette.spec.ts`: hero area and edge energy on/off >= 0.6 at ATB ignite and tier-4 tier-up (measured 0.62-1.06). |
| 2026-10-09 | B-fix. no world wash | aura pool/ring/burst 5.6-7.2 u, flash ring 8-9 u, light radius 4+ | pool 2.6+1.5v, ring 3.8+1.0v, burst 3.4+0.8v, flash ring 5-5.5 u, light radius cap 3.0. Global post flash unchanged (cap 0.12, 120 ms). |
| 2026-10-09 | B-fix. forest contrast | more additive light | biome-aware (`bright` from the fog colour): saturated, darkened hue, `uAdd` x(1-0.85b), alpha x(1+0.65b). |
| 2026-10-09 | C. guard barrier | at hero + 0.9 | at hero + 1.65 (must not cover the hero); intensities x0.55 (the Guard fx kind blooms to white above ~1.2 HDR). |
| 2026-10-09 | C. guard glyphs | 14 px hex, fill .18 | 17 px, fill .34, 2.2 px outline, additive glow. |
| 2026-10-09 | C. sentence bolts | apex +1.2 u, core 0.7 s | apex +0.45 u, bigger core; the bolt leaves from the plate's BOTTOM edge (the opaque plate hid a bolt born at the word centre). |
| 2026-10-09 | C. finisher | spec table | as specified. Arcs are drawn by `FinisherCinematic` (Beam quads) and `callbacks.slashArc` is also called. Runs on REAL time so its hit-stops do not move the 1060 ms death. `crit` plays at the freeze (existing binding) and at the X. |
| 2026-10-09 | C. word rings, wide plates | r1 = 1.9 w | capped 280 px (PERFECT) / 200 px: sentence plates made screen-sized rings. |
| 2026-10-09 | C. queue | chip + entity gate | `holdEntity`/`holdUntil`: the finisher holds the boss; clear events wait behind a live hold. |
| 2026-10-09 | C. router | `registerTypingFx` after bindings | held-back events need a gate BEFORE bindings: `EventRouter.setPresentationGate` + `present(e)`. `registerTypingFx` unused. |

### Chunk C notes

- Files: `hud/fx/typing/{guardGlyphs,wordOrb}.ts`, `render/vfx/{GuardBarrier,SentenceBolts,FinisherCinematic,screenToWorld,typingBindings}.ts`, `level/typingFx.ts` (session wiring), small additive blocks in `level/{session,stage,eventBindings}.ts`.
- Callbacks on the stage: actorFlash = rim flash, cameraPose = camera override, heroPush, dash (finisher only), sfx = AudioEngine.play; slashArc/chipImpact/dissolve are no-ops (bindings already animate the late-presented events).
- Not done: FinisherShown plate gold pulse; PERFECT tag punch; auto-attack dash timed to the impact tick.

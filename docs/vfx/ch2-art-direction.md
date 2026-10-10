# C0.2 Chapter II "The Hushwood": art and audio direction brief

> **Orchestrator note on naming (2026-10-10).** Where names differ, `docs/interfaces.md` v2.0 wins. Map this brief's names as follows:
> - `RiddleShown` → `RiddleStarted`.
> - `RiddleAnswered` / `RiddleTimedOut` → `RiddleResolved{right|wrong|timeout}`, with `RiddleLeafPicked` on each pick.
> - "uppercase flag" → `CharCorrect.shifted`.
> - `BossPhaseChanged` already exists. "BossFreed" is the existing defeat/finish flow, restyled for the Willow.
> - `HealerCasting` isn't in v2.0. Derive the wind-up in render from the heal cadence (`EnemyView.healer`); only propose a new event if that proves insufficient.
> - `Ground.kind`, `QualitySettings.waterReflect` and the extended `BiomeName` are render/audio-side names. The T2.x and T3.3 agents own them, so they aren't sim contracts.
>
> **Sprite quality.** The mock sprites set the **direction only**. The Gloom Wolf and Mire Toad read as flat and blocky, the Willow fronds read as noise, and the Shade goes near-black. T2.3 must clearly exceed them before an Opus art review passes.

Status: direction pass (Opus art director). Implementers: T2.1 (hushwood + grove), T2.2 (fen + water), T2.3 (sprites), T2.4 (layouts), T3.2 (VFX), T3.3 (audio).
Inputs: `docs/CH2_PLAN.md` (the PO decisions block is binding), `docs/vfx/typing-vfx-spec.md` (format, R1–R9), `docs/brainstorm/04-art-vfx-sfx-research.md`, and the real render and audio code (`apps/game/src/render/{biomes,lighting,quality}.ts`, `render/post/*`, `render/materials/*`, `render/sprites/*`, `render/ambient/*`, `render/world/*`, `apps/game/src/audio/*`).

**The PO ruling governs everything here.** Ch2 stays procedural, but the procedural art ships as final art. It is not a placeholder. Every M2 merge passes an Opus art review against `poc/v2-*.png`, the Ch1 deck, and the mock stills in `docs/vfx/ch2-mock/`.

Numbers in this brief are binding in the same way as `typing-vfx-spec.md`: tune a number only when a capture proves the change reads better, and log it in §9.

---

## 0. Direction in one paragraph, and the mock

Ch1 is warm daylight: amber, green, sun shafts. Ch2 is its opposite.
- **Light:** cool moonlight in blue-violet and teal, with warm lantern pools as the only warm notes.
- **Air:** fog that pools low to the ground.
- **The Silence:** it shows up as violet. Violet is reserved for the Silence (shades, the Willow's Hush, hush glyphs) and never appears on friendly lights.

The chapter walks a lit lantern road through it:
1. **Hushwood (L1–L4):** a moonlit night forest of twisted hollow oaks, hanging paper lanterns and glowing mushroom rings.
2. **Fen (L5–L9):** a green-gold dusk swamp with boardwalks over black still water that mirrors the lanterns.
3. **Grove (L10):** the Willow's Heart, a vast weeping willow inside a ring of lanterns, under a falling-leaf storm.

The **read rules** never change: hero, enemies and next letter come first. The HUD stays above WebGL, and VFX never cover a plate.

### 0.1 Mock (direction target, not final art)

`docs/vfx/ch2-mock/` is a scratch scene built on the **real render core**: `RenderWorld`, `LightRig`, `PostPipeline`, the sprite materials, and the moods fed through the real `BiomeMood` type. The art, ground and water code is scratch, and nothing is imported into `apps/game/src`.
- Run it with `apps/game/node_modules/.bin/vite --config docs/vfx/ch2-mock/vite.config.mjs --port 5342`.
- Then open `/?mood=hushwood|fen|grove[&tier=2][&willow=p1|spell|riddle|freed][&bars=1][&refl=0]` or `/sheet.html`.
- Capture with `node docs/vfx/ch2-mock/capture.mjs <dir> name=url…` (Metal, 1920×1080, DPR 1).

| file | what |
|---|---|
| `ch2-hushwood.jpg`, `ch2-fen.jpg`, `ch2-grove.jpg` | the three mood stills at 1920×1080 (all under 400 KB) |
| `ch2-vs-ch1-sheet.jpg` | each Ch2 mood next to a shipped Ch1 forest still (same renderer, same battle pose) |
| `ch2-willow-phases.jpg` | Willow phase 1, Hush Spell, Riddle and Freed looks |
| `ch2-fen-water-tiers.jpg` | still water at tier 0/1 against the tier 2 fallback |
| `ch2-grove-intro-letterbox.jpg` | boss intro framing with bars 0.1 |
| `ch2-sprites-sheet.jpg` | Ch1 roster against the 5 Ch2 enemies (all frames), their normal, emissive and silhouette layers, the Willow states, the frond tints and the riddle leaves |

`src/moods.ts` holds the exact `BiomeMood` objects for T2.1 to paste. `src/ch2Art.ts` holds the reference generators T2.1 and T2.3 port into `render/sprites/ch2Props.ts` and `ch2Monsters.ts`. They are re-implemented, not imported. `src/ch2Materials.ts` holds the ground, water and fog-card shaders.

---

## 1. Moods

Values are **linear** (as in `biomes.ts`). Hex swatches are the sRGB read of a colour normalised to its max channel, which is the hue you should see.

### 1.1 `BiomeMood` table (paste into `render/biomes.ts`; extend `BiomeId` with `hushwood | fen | grove`)

| field (`BiomeMood`) | hushwood | fen | grove (boss) | consumed by |
|---|---|---|---|---|
| `amb` sky ambient | [0.13, 0.16, 0.30] `#656f94` | [0.19, 0.21, 0.25] `#787d88` | [0.08, 0.11, 0.20] `#515d7b` | `LightRig.applyMood` → `uAmb` |
| `gamb` ground bounce | [0.05, 0.058, 0.075] | [0.06, 0.065, 0.04] | [0.04, 0.04, 0.06] | `uGAmb` |
| `sunCol` (key: moon / dusk sun) | [0.50, 0.62, 1.00] `#bacdff` (moon) | [1.10, 0.80, 0.40] `#ffdda1` (low sun) | [0.45, 0.62, 1.00] `#b1cdff` (moon) | `uSunCol` |
| `sunDir` | [-0.55, 0.72, -0.12]: upper left, slightly behind (rim on trunks) | [0.62, 0.36, -0.50]: low, back right (backlight) | [0.12, 0.92, -0.30]: straight above the Willow | `uSunDir` |
| `fogCol` = `clear` | [0.045, 0.062, 0.12] `#3e4861` | [0.20, 0.23, 0.13] `#7b8365` | [0.03, 0.055, 0.10] `#34445a` | `uFogCol`, clear colour |
| `fog` [density, start, height falloff] | [0.018, 14, 0.32] | [0.022, 9, 0.50]: dense, hugs the water | [0.020, 12, 0.32] | `applyFog` |
| `scatter` (lantern halos) | 0.9 | 0.9 | 1.0 | `uScatter` × `inscatter()` |
| `exposure` | 1.45 | 1.12 | 1.35 | `uExposure` |
| `lift` / `gamma` / `gain` | [0.008, 0.012, 0.032] / [1, 1, 1.02] / [0.97, 1.0, 1.08] | [0.01, 0.014, 0.014] / [1, 1, 1] / [1.04, 1.0, 0.86] | [0.008, 0.01, 0.03] / [1, 1, 1.02] / [0.98, 1.0, 1.06] | final grade |
| `sat` / `contrast` | 1.12 / 1.15 | 1.16 / 1.13 | 1.15 / 1.14 | final grade |
| `sh` shadow tint / `hi` highlight tint | [0, 0.012, 0.045] teal-blue / [0.045, 0.024, 0] amber | [0, 0.02, 0.035] teal / [0.05, 0.032, 0] gold | [0, 0.012, 0.05] / [0.045, 0.026, 0] | split-tone ("LUT") |
| `bloom` / `thr` | 0.62 / 0.90 | 0.55 / 0.95 | 0.66 / 0.88 | `uBloom` / `uThr` (`BLOOM_PRE_FS`) |
| `vig` | 0.52 | 0.50 | 0.56 | `uVig` |
| `rangeFar` / `tilt` (DOF) | 13 / 0.24 | 12 / 0.24 | 13 / 0.26 | `uRangeFar`, `uTilt` |
| `bars` | 0 | 0 | 0.10 (intro only, via `setLetterbox`) | `uBars` |
| `caveK` ("darkness k") | 0.45 | 0.30 | 0.60 | hero cave-rim lift, `additiveGain` / `discGain` / `arcGain` (W4/W5 glare rules) |
| `rays` | 1.1 | 1.0 | 1.2 | god-ray `uI` multiplier |
| `fill` (warm camera fill) | 0.80 | 0.55 | 0.60 | the held fill light at (camX − 1, 3.2, 5.5), r 13 |
| `ambient` | `"wisps"` (new) | `"fireflies"` (new) | `"leaves"` (new) | `AmbientDirector` (§1.5) |

**Grade direction (the "LUT").**
- **Hushwood:** a split-tone of teal-blue shadows against amber highlights, so only lanterns and the hero's skin are warm. Blacks lift slightly toward blue (no pure black). Saturation goes into the lights, not the fog.
- **Fen:** green-gold midtones; `gain.b` 0.86 pulls the blue out of the highs, and teal shadows keep the water cold. It must never look "sick yellow": if a capture reads olive, lower `sat` before touching `gain`.
- **Grove:** the hushwood split-tone, one notch darker and more saturated. **Violet comes only from emissives**: the Willow's eyes, glyphs and rune, and the shades. The fog stays blue (`#34445a`). The first mock pass had violet fog, and it read magenta-pink and cheap. Do not do that.

**Why `caveK` > 0 outside a cave.** `caveK` drives the hero's rim lift (sprite `uCaveRim` × `uCaveK`, tinted by `hi`) and the W4/W5 additive glare dampers. Night scenes need both. Do not reuse it to switch ground textures (§2.3 adds a separate ground kind).

### 1.2 Lights (`LightRig`, `MAX_LIGHTS = 16`, nearest-16 by x)

| source | colour (linear) | intensity | radius | scatter | flicker | notes |
|---|---|---|---|---|---|---|
| hanging paper lantern | [1.0, 0.56, 0.22] `#ffc480` | 1.5–1.7 | 6.5 | 0.03 | yes | a `Light` at the paper body, plus an FxKind.Glow quad 1.5 u at α 0.55, behind (z − 0.05). **No flame mesh**: the paper is the emissive (`emis` 2.2) |
| stilt / ring lantern | [1.0, 0.62, 0.24] | 1.8 (fen), 1.3 (grove ring, ×7) | 7 / 6.5 | 0.03 / 0.025 | yes | the grove ring is 7 lamps on the back arc. Keep its sum lower than the Willow's key |
| glowing mushroom ring | teal [0.25, 1.0, 0.9] / violet [0.7, 0.45, 1.2] | 0.55 | 2.8 | 0 | no | `emis` 1.5. 2.6 bloomed to white in the first pass |
| waystone rune | [0.35, 1.2, 1.25] | 0.9 | 3.2 | 0.02 | no | without it the stone body vanishes at night |
| Lantern Wisp (per enemy) | [0.4, 1.2, 1.6] `#88e0ff` | 0.7 | 3.5 | 0.015 | no | held while the wisp lives; it **is** the enemy's emissive light |
| Willow key (phase light) | p1 / spell [0.45, 0.42, 1.15]; riddle [0.9, 0.8, 0.4]; freed [1.0, 0.85, 0.5] | 0.9 | 9 | 0.015 | no | at (boss.x, 3.6, boss.z + 1.8) |
| moon on the Willow's face | [0.5, 0.62, 1.0] | 0.8 | 6 | 0 | no | (boss.x, 5.2, boss.z + 2.4). Without it the face is a black slab |
| elite aura light | [1.0, 0.75, 0.3] | 0.6 | 3.2 | 0 | no | counts toward the T2.3 dynamic budget (§5) |

**Budget per frame:** at most **9 static** lights inside camX ± 17 (lanterns, mushrooms, runes). That leaves ≥ 7 slots for the fill light, the typing aura (≤ 3, `typing-vfx-spec` §10.2) and combat flashes. T2.4 checks this with the `world.lights` pick on every battle pose.

**Emissive sources (the bloom budget).** Only these may exceed `thr`:
- lantern paper;
- wisps;
- mushroom caps;
- rune glyphs;
- the Willow's eyes, glyphs and mouth;
- the healer's crosses;
- the elite collar and eyes;
- fireflies.

Moonlight never exceeds `thr` on a surface. It reads through rays and rim, not through bloom.

### 1.3 God rays (`RayField` / `GodRay`, FxKind.GodRay, × `rays`)

| mood | colour | w (m) | h | rotZ | intensity | where |
|---|---|---|---|---|---|---|
| hushwood | moon [0.42, 0.56, 1.0] | 1.4–3.0 | 17 | −0.32 | 0.40–0.70 | z −5.5…−7.5, between trunks, spacing 6–9 m |
| fen | dusk [1.0, 0.80, 0.40] | 1.6–3.6 | 16 | +0.38 (from the right) | 0.50–0.90 | z −7…−9, over the water, 5 per screen |
| grove | moon [0.45, 0.58, 1.0] | **5.5** centre shaft, plus 2.0–2.4 sides | 20 / 17 | −0.08 / ±0.15 | 0.85 / 0.40–0.45 | the centre shaft falls on the Willow (boss.z − 0.6) |

### 1.4 DOF and depth layers (`PostPipeline`: `uFocus` = camera dist, `uRangeFar`, `uRangeNear` 7, `uTilt`, `fgBlurPasses`)

Keep the Ch1 DOF engine and `rangeFar` per the table. Every Ch2 battle frame must show all **five depth bands**, each with its own job:
1. **Far backdrop.** The `sky` and `mountains` strips are recoloured:
   - hushwood: night gradient `#0a0c22` → `#5a7c84` with stars, and spiky dead crowns `#141632`/`#1e2244`/`#2e3660`;
   - fen: dusk gradient `#14202a` → `#e0c884`, and a cypress line `#2a3228`/`#3c4636`/`#58644c`.
2. **Back row, z −16…−21.** Oaks or cypress at scale 1.3–1.6, with tint [0.5, 0.55, 0.75] (hushwood) or [0.62, 0.68, 0.58] (fen), rim 0.5–0.6. These are fog-eaten silhouettes.
3. **Mid row, z −5…−11.** Framing trees, the root arch, lanterns and god rays.
4. **Action band, z −4.6…+2.2.** Ferns, reeds, mushrooms and the waystone sit at z ≤ −2.4. **The hero lane, |z| < 2.2, stays clear** (validator rule). The fen boardwalk is the ground itself (§2.3), and its posts stand at z ±2.45, with the front ones at **scale 0.5**. The first mock pass put full-height posts at z −1.15/+1.55, and they cut through the enemies.
5. **Foreground layer, z 6–7.4, `foreground: true`, `dark` 0.45–0.6, `rim` 1.6, `wrap` 0.6.** At z ≈ 6.5 the frame is only **camX ± 6 m** wide.
   - Place fg pieces at camX − 8…−4 and camX + 4…+7.
   - Hanging pieces go at y 7.6–9.6.
   - **Nothing in the fg layer may overlap the hero's screen box or an enemy's.** The first pass put a fg fern blur over the hero's legs and a fg lantern bloom over the Moth Mender. Both are rejects.

### 1.5 Ambient particles (new `BiomeMood.ambient` kinds; spawn in `AmbientDirector`; the layout `AmbientZone` presets match)

| kind | pool | rate /s (× `ambientDensity`) | colour (HDR) | size | life (s) | motion |
|---|---|---|---|---|---|---|
| `wisps` motes | A (additive), kind 0 | 16 | [0.45, 1.3, 1.6] α 0.8 | 0.03–0.06 | 4–6 | vy +0.04…0.2, sway 0.7, fadeIn 0.5 |
| `wisps` big drifting lights | A | 1.6 | [0.5, 1.5, 1.9] α 0.75 | 0.10–0.15 | 5–7 | sway 1.1, fadeIn 0.8 |
| `wisps` leaves (night) | B (normal), kind 1 | 1.4 | [0.24, 0.13, 0.09] | 0.08 | 10 | vy −0.6, spin 3 |
| `fireflies` | A | 9 | [1.5, 2.2, 0.45] | 0.06–0.10 | 2–4 | sway 1.3 (add a blink: α × step(0.3, sin(t·5 + ph)) in `PARTICLE_FS`, a T2.2 nice-to-have) |
| `fireflies` pollen | A | 8 | [1.3, 1.1, 0.55] α 0.6 | 0.025–0.045 | 4–6 | slow drift |
| `leaves` (grove storm) | B, kind 1 | 9 (phase change: 40 for 2 s) | silver-teal [0.16, 0.34, 0.32]; 12% gold [0.7, 0.5, 0.12] | 0.07–0.10 | 12 | from y 8–10, vx −0.5…0.3, vy −0.55…−0.8, sway 1.6, spin 3 |
| hush motes (grove rune) | A | 10 | rune colour (§3.6) | 0.03–0.06 | 1.5–2.6 | rise 0.3–0.7 off the ring's circumference |

Night leaves use **dark** normal-blend colours (they are unlit). The Ch1 `[0.85, 0.45, 0.2]` leaves glow orange at night.

### 1.6 Fog cards (new, small material, `ch2Materials.ts` `fogCardMaterial`)

Fog cards are horizontal bands of drifting value noise. They use **normal blend**, posterised to 6 alpha steps with a 2-px Bayer dither, so the fog reads as pixel art and not as a gradient. Colour = a lighter `fogCol` plus a little `inscatter`.

| mood | cards (x-span m × height m @ y, z, α) |
|---|---|
| hushwood | 46×1.3 @0.45, −1.8, 0.30 · 60×2.6 @0.9, −9.5, 0.50 · fg 40×1.2 @0.35, 4.6, 0.28, colour [0.08, 0.11, 0.21] |
| fen | 50×1.4 @0.45, −1.6, 0.40 · 70×2.8 @0.8, −6.5, 0.60 · 80×4 @1.2, −13, 0.65 · fg 44×1.2 @0.35, 4.8, 0.32, colour [0.38, 0.40, 0.26] |
| grove | 50×1.4 @0.5, −1, 0.34 · 70×3 @1, −8, 0.5 · fg 44×1.2 @0.35, 4.8, 0.28, colour [0.06, 0.10, 0.19] |

A card never rises above y 1.5 in the action band, because that would veil the actors' bodies.

---

## 2. Props, ground and foreground

All props use 16 texels per metre, a 1-px darkest-ramp outline where the silhouette meets fog, and Bayer-dithered ramps of 5–8 steps. **Normal maps are AUTHORED** from the generator's own geometry (`SpriteFrame.normal`): cylinder normals across trunks, limbs and stems, and hemisphere normals per leaf clump or body dome. The Ch1 alpha-derived bulge (`normalMapOf`) is the fallback for small props only (≤ 24 px).
- Why: at night the moon (`sunDir`, wrap 0.5) is the only form light. On the alpha bulge, a 180-px trunk reads as a flat cut-out. With cylinder normals the moon rakes down one side. See `ch2-sprites-sheet.jpg`, row 3.
- **Flipped props must negate normal.x** (`flipN` in the mock). Ch1 does not, and a flipped tree is then lit from the wrong side.

### 2.1 Prop list (`render/sprites/ch2Props.ts`; keys `prop.ch2.<name>.<n>`)

**Design constraint for every tall prop: the camera never sees above y ≈ 7 m.** The battle pose's top ray is horizontal at camera height (y 1.9 + 18.6·sin 16° ≈ 7.0). So structure (limb splits, lanterns, moss) lives at 3–7 m, and canopy above that is wasted. The first mock oak put its canopy at 9–14 m and read as bare columns.

| prop | shape language | size px (w×h) | palette (sRGB ramp, dark→light) | normals | layer |
|---|---|---|---|---|---|
| **twisted hollow oak** ×5 seeds | S-curved trunk, spiral grooves, root flare, splits at 3.5–4.5 m, limbs reach **sideways**, flat shelf clumps, hanging moss; a dark oval hollow on 3/5 | 184×176 | bark `#0b0910 #141019 #1e1824 #2a2232 #3a3044 #514660 #6e6280`; leaf `#060d12 #0a171c #0f2226 #163132 #204440 #2f5c52 #477a66 #6c9c80`; moss `#161e1c…#66786c` | cylinder (trunk, limbs), hemisphere (clumps) | mid (scale 1.0–1.25) / back (1.3–1.6, tinted) / fg trunk (`dark` 0.6) |
| hanging paper lantern ×3 cord lengths | an 11-wide paper barrel on a cord with iron caps, ribs and a red tassel; `hang` | 13×(cord+19), cords 10/22/44 | paper `#6a2e10 #b4561a #f08a30 #ffbe64 #fff0c4` (emissive), iron `#0c0a0e…#463e44` | flat plus q·0.8 | mid / fg bokeh (top corners only) |
| stilt / road lantern ×2 | a crooked pole with a crossarm and a lantern swinging off the tip, rope wraps; the asymmetric "?" silhouette | 30×92, 30×76 | wood `#16100b #241a12 #34261a #4a3624 #634a32 #7e6242 #9a7c56` + paper | cylinder | mid; grove ring; fg posts (`dark` 0.25) |
| waystone | rounded slab, leaning, a moss cap, a carved vertical rune and ring (emissive teal), lichen | 30×46 | stone `#111118 … #82829a`, rune `#1e8a9a #46d8e0 #a8fff8 #eaffff` | cylinder plus dome top | mid, beside the lane (z ≤ −2.4) |
| mushroom ring ×2 (teal, violet) | 7–10 stems of mixed height, glowing caps, grass at the foot; the ring seen edge-on | 52×22 | stem `#6a6a74…#f0f0f6`; caps teal `#123c46 #1f7a80 #3fd0c8 #9ff6ee #eafffb`, violet `#2a1a4a #5a3aa0 #9a72f0 #d0b8ff #f4ecff` | hemisphere caps | mid |
| root arch | three twisting roots arching over the road, moss strands | 150×104 | bark + moss | cylinder | mid, z −7 (behind the arena) |
| moss curtain (fg) ×2 | a gnarled bough across the top, ~60 strands hanging 1.5–11 m | 150×190, `hang` | hanging-moss ramp | flat | **fg**, hung at y 7.6–8 |
| night fern ×2 | Ch1 fern geometry in the night-leaf ramp | 110×76, 120×84 | night leaf | per frond | mid (scale 0.8–1.15) / fg (1.25–1.4) |
| cobweb veil | a 2-px silver radial web between two trunks, emissive at 0.2 | 64×64 | `#9aa0c0` α | flat | mid, sparse (≤ 1 per screen) |
| **dead bald cypress** ×3 | a fluted buttress cone at the base, knees, a thin straight trunk, a snapped top, crooked limbs with Spanish-moss drapes | 120×250 | cypress `#0b0d0b #141814 #1e231d #2a3128 #3a4236 #4e5848 #68725e #8a9480`; moss `#1e2620…#98aa98` | cylinder | back (in water) / mid / fg trunk |
| reed clump ×3 | 16–24 vertical blades rising dark→light, 3–4 cattails | 48–60 × 60–76 | reed `#10160a … #c4bc6a`; cattail `#24160c #3e2614 #5a3a1e #7a5430` | slight ±x | mid (z −4.2…−2.8) / fg (scale 1.5–1.9) |
| boardwalk post (+ short stub) | a 4-px post with a rope band | 10×30 (stub at scale 0.5) | wood | cylinder | z ±2.45 only |
| sunken shrine column ×2 | Ch1 pillar language in cool green stone, set at y −0.5…−0.7 | 26×70 / 26×50 | `#101612 #1a221c #26302a #344038 #46544a #5e6e62` + moss | cylinder | mid (in water) |
| lily pads | **not a sprite**: a decal in the water shader (§4) | — | `#1e3a1c #2e5a2a #4a7a3a`; flower `#f0d0e8` | — | water surface |
| lantern ring (boss) | 7 lantern posts on the back arc of an ellipse (r 11.5 × 3.6) around the Willow, plus 2 fg posts | — | as lanterns | — | mid / fg |
| Willow frond curtain ×4 seeds × 4 tints | 5–7 **bundles** of 4–7 strands with gaps, a leafy canopy band at the top, tapered tips, leaf slivers angled down and out | 60–78 × 120–162, `hang` | silver `#071212 … #acdcc4`; hush (indigo-violet); gold; bloom (silver + pink-white blossoms) | per strand ±x | back canopy (y 11.5–13.5) / front curtains / fg |

### 2.2 Foreground depth layers (≥ 2 on every battle pose; T2.4 validates)

| piece | levels | placement |
|---|---|---|
| near trunk (oak or cypress, `dark` 0.55–0.6) | all | one screen edge, camX − 8.6 or + 9, z 7.2–7.4 |
| moss curtain / willow fronds (`hang`) | hushwood, grove | top corner, y 7.6–9.8 |
| fern or reed mound | all | bottom corners, camX − 8 / + 5, z 6–6.4 |
| fg lantern (bokeh) | hushwood, grove | **top-left only** (y ≥ 5 m), never over an actor |
| low fog card | all | §1.6 |
| falling-leaf sheet | grove | the B-pool leaves at z 4–5 pass through the fg blur and become bokeh |

### 2.3 Ground variants (extend the layout `Ground` entity with `kind: "forest" | "cave" | "leaf" | "fen" | "roots"`; the shader takes `uGround`)

The `uBiome` x-dither stays for forest↔cave. The new kinds are separate branches of `groundMaterial` (reference: `ch2GroundMaterial`). All of them use 16 texels/m, posterised 7-step lighting and Bayer dither.

| kind | look | albedo ramps (linear) |
|---|---|---|
| `leaf` (hushwood) | dark umber-violet leaf litter; russet/old-gold 2×1 leaf slivers (14%); teal moss patches (vnoise > 0.55); a packed-earth path (`pathC`, half-width 1.35 ± 0.35); **root veins** crossing floor and path (warped stripes, dark bark with a normal kick); sparse emissive teal ground specks (1 in 700 texels, off-path) | litter L0–L4 0.028…0.22 (umber to russet), moss M0–M4, path P0–P4 0.045…0.19 cool grey-brown |
| `fen` | **boardwalk = the ground**: planks across the lane 0.375 m wide, 0.09 gaps, per-plank tone and grain, nails on the joists at abs(lane) 0.7 and 2.0, side beams, half-width **2.3** (it holds the whole hero lane), a few broken plank ends at abs(lane) 1.3–2.0 that show water. Off the boardwalk: mud with sedge tufts and a **wet rim** (×0.6) next to water. Water = `discard` where `waterMask` = 1 (pools at abs(lane) > 2.7–3.3, plus everything at z < −9) | mud F0–F4 0.022…0.12 olive, wood W0–W4 0.05…0.28 |
| `roots` (grove) | violet moss-dirt; **7 great roots radiating** from the Willow (`uArena` = boss x, z), width 0.16·e^(−0.09r), bark ramp with cross normals; fallen silver-teal leaves (10%) and gold riddle leaves (1.5%) | G0–G4 0.02…0.16, roots R0–R4 0.025…0.17 |

---

## 3. Enemies and the Willow

All are drawn facing right, then flipped to face the hero (Ch1 convention), with a 1-px outline in the darkest ramp colour (never pure black) and authored normals. Sizes are the sprite frame in texels, and **scale** is the actor scale in the encounter. The Ch1 references are hero 38×36 @1.0, goblin 26×24 @1.35 and golem 48×50 @1.6. Contact sheet: `ch2-sprites-sheet.jpg`.

**Silhouette rule:** each type must be recognisable as a pure-black silhouette at 2× (sheet row 3), and must differ from every Ch1 type:
- tall hood (Shade) against round dome (slime);
- teardrop flame with a cap (Wisp) against bat wings;
- wide wings (Moth);
- squat dome with eye bumps (Toad);
- long, low quadruped with ears (Wolf).

### 3.1 Lantern Wisp (grunt, flying, fragile)

- **Silhouette:** an upward teardrop flame with a flicking tip, wearing the broken **iron cap of its lantern** (an 11-px band with 3 bars and a ring handle). It is the lantern-road lore made visible: lantern flames that ran off their wicks. Two big dark eyes with a catch-light and a small "o" mouth make it cute, not scary.
- **Size:** 22×30 @1.2. It flies at y 1.45–1.6 with a ±0.12 m bob at 1.4 Hz.
- **Palette:** `#123a7a #2a78c0 #4cc0ec #90ecff #d6ffff #ffffff`, iron `#0c0a0e…#463e44`. The white-hot core is **small and low** (r ≈ 3 px). A whole-white body blooms into a blob (first-pass reject).
- **Emissive:** the body, at glow 0.75 × colour. Eyes and cap are non-emissive. Use the `set()` that clears glow: a mock bug had emission bleeding through the eyes.
- **Frames:**
  - idle ×3 (flame sway phase 0 / 1.6 / 3.2, 8 fps);
  - atk ×1 (body R 6.6 px, +0.5 brightness);
  - hurt = atk frame + flash;
  - death = the §5 "chime-puff".
- **Light:** a held point light (§1.2) plus an FxKind.Glow quad of 1.5 u at α 0.5.

### 3.2 Hush Shade (grunt; often **Fading**)

- **Silhouette:** a tall hood whose tip leans **back**; shoulders at 35% of the height; a robe flaring to a **torn hem that dithers into nothing**; long drooping sleeves, the near one reaching forward. It hovers at y 0.18 and has no feet.
- **Face:** a pale **blank theatre mask** floating in a black hood opening. Soft violet eye slits and a mouth sewn with 3 stitches ("the Silence took its voice").
  - **Never a skull.** The first pass, with dark sockets and teeth-like stitches, read as a skull and broke the all-ages tone.
- **Size:** 28×40 @1.1. That makes it 2.75 m, taller than the hero, which is eerie on purpose.
- **Palette:** robe `#07060f #0e0b1e #17122e #221a44 #30265e #43387e #5e52a2`; mask `#5e5672 #9a90b0 #cec6dc #eee8f4` (glow 0.28: it must read at night); hush violet `#2a1260 #4e28b0 #7a50f0 #ac90ff #dcd0ff #f6f2ff`.
- **Emissive:** eye slits, stitches, and 4 dim word-motes at the hem.
- **Frames:** idle ×2 (the hem ripples, 4 fps); atk ×1 (the near sleeve lunges and the robe widens 2.5 px).
- **Fading tell:** the sprite α breathes 1 → 0.55 → 1 over 1.6 s, synced to the plate fade, and the hem emits violet letter-motes (§5 row "Fading").

### 3.3 Moth Mender (**healer**, new archetype)

- **Silhouette:** a broad moth seen from the front. It has swept forewings (rounded triangles) with **scalloped** trailing edges, small round hindwings, a fuzzy segmented body and feathered antennae. Its width is the read: it is the widest grunt.
- **The healer read, at a glance from 1280 px:**
  1. Each forewing eyespot is a dark ring around a **glowing green cross**. Green `#22b450 #5cf08a #f0fff2` is reserved for healing in Ch2: no prop, lantern or other enemy uses it.
  2. A constant drizzle of green motes falls from the wings (10/s, A pool, [0.5, 2.4, 0.9]).
  3. The HUD ✚ badge on its plate (T3.1).
- **Size:** 36×28 @1.15. It flies at y 1.25–1.35.
- **Palette:** wings `#1e1e16 #30301e #4a4a2c #68683c #8c8a52 #b2ae72 #d8d29c` with a pale band; body `#3a2e1e … #f6eed4`.
- **Frames:** idle ×3 (wing beat −3 / 0 / +3 px at the tips, 10 fps); cast ×1 (wings fully up at −5 px, crosses at glow ×1.5) for the heal.

### 3.4 Mire Toad (brute, heavy 12 s telegraph)

- **Silhouette:** a squat, wide dome with two **bulging gold eyes on top**, a pale belly and throat sac, splayed front feet with toes, and a back leg haunch. It wears a **lily-pad hat with one white flower**: the appeal beat that makes a big ugly brute lovable.
- **Size:** 44×32 @1.3. It sits on the ground.
- **Palette:** skin `#0e1208 #171e0c #222c10 #2f3d16 #40521e #566a28 #6e8434 #8ea044` with warts at +1.6 steps; belly `#4e4a2e #7a7448 #a8a070 #d0c894`; eyes `#8a5a08 #e0a020 #ffd448 #fff2a8` (emissive iris, black slit pupil).
- **Frames:**
  - idle ×2 (throat sac pulse, 2 fps);
  - **telegraph:** crouch, with the body squashed 3 px and the eyes narrowed, held through the windup;
  - atk ×1 (leap: sprite y +0.6 m over 0.25 s, then the slam frame);
  - land → §5 "splash slam".
- **Known nit:** the near front leg can read as a dark "door" on the belly. Draw it in mid-greens (C5/C6), not C3/C4.

### 3.5 Gloom Wolf (**elite**)

- **Silhouette:** a lean wolf in profile, **stalking low**:
  - pointed ears up;
  - a long muzzle;
  - a deep chest and a tucked waist;
  - a shaggy ruff at the throat and over the shoulders;
  - a bushy tail hanging low.
- **Drawing method:** an **SDF union** of ellipses and tapered capsules, shaded from the SDF gradient (`paintSdf` in the mock). Hand-placed rows produced a "stegosaurus" (rejected). Use the SDF method for any organic animal.
- **Size:** 54×34 @1.45. Its body is about 1.6 m tall and it is the longest grunt.
- **Palette:** steel-blue fur `#101218 #1c202c #2a3042 #384058 #4a5470 #5e6a8a #7c88a8 #a4b0cc`, with the top edge lit at +2 steps; ember eye `#7a2a06 #d4600e #ffa62a #ffe08a`; **broken gold chain collar** `#a8761a #e8b23a #ffe08a`, with a loose end hanging.
- **Frames:**
  - idle ×2 (breath, 3 fps);
  - **howl ×1** (head up 5.5 px, muzzle raised; this is the telegraph pose, held through the windup with the §5 howl ring);
  - atk ×1 (a lunge: front legs forward, jaw open with 3 teeth).
- **Fen backlight:** in the fen the dusk key comes from behind, so the wolf reads mostly as a silhouette with a gold rim. That is acceptable and is a strong read. But keep the interior ramp ≥ `#2a3042` so it is never a pure black hole.

### 3.6 Elite tier: a generic read (applies to any future elite)

All four of these, together:
1. **A gold rim:** a persistent `setRimFlash(0.42, [1.9, 1.35, 0.45])`, breathing ±0.08 at 0.7 Hz. 0.55 was too loud.
2. **A gold ground sigil:** `addRuneCircle(x, z, 3.4, 0.55, [1.5, 1.05, 0.3])`, rotating slowly.
3. **Rising gold motes:** 7/s, A pool, [2.2, 1.5, 0.4], life 0.8–1.3 s.
4. **Scale ×1.08** over its base scale, plus the HUD gold name tag and gold plate trim (T3.1).

The aura light (§1.2) is optional and is dropped at quality tier 2.

### 3.7 The Whispering Willow (boss, multi-part)

**Parts** (T2.3 builds them as separate meshes so they can animate independently):

| part | frame px | scale | placement (relative to the boss anchor) | animation |
|---|---|---|---|---|
| core: trunk, carved face, root beard, ground roots, two great boughs leaving the frame | 112×132 | 1.0 (7 × 8.25 m) | anchor at the root collar; boss.z ≈ −3.6 (behind the add slots) | breath: scale.y 1 ± 0.008 at 0.25 Hz; **shudder** on a phase change (x ±0.06 m, 8 Hz, 0.6 s) |
| front frond curtains ×4 | 60–78 × 120–162 | 1.15–1.3 | hung at y 9.2–9.9, x −4.6 / −2.8 / +3.0 / +4.8, z +0.35…+0.5 | vertex sway: x += sin(t·0.9 + x) · 0.12 · (1 − v)², with tips moving most |
| back frond curtains ×3 | same | 1.3–1.4 | y 10.4–11.4, x ±6.5 / 0, z −0.4…−0.6 | slower sway (0.6 Hz) |
| canopy curtains (back) | same | 1.4–1.8 | y 11.5–13.5, z −9…−13, x span ±20 m, tint [0.45, 0.5, 0.7] | static plus wind sway |
| lash roots ×2 (new, attack) | 60×40 | 1.2 | at the boss's feet, ±3 m | a 3-frame branch-lash: coil, whip (an arc VFX), recoil |

The canopy is deliberately **off-frame**: the Willow is bigger than the camera. The face sits at y ≈ 4.7 m and the boss plate anchors to the **face**, not to the sprite top. Screen area: in the battle pose the core plus front curtains cover about 2× the Golem, and the gaps between frond bundles keep the background visible. Plates sit above the HUD layer anyway, so the fronds are never a readability problem.

**Phase looks** (`ch2-willow-phases.jpg`). Each row is one state; the columns are the same across rows.

| state | eyes | mouth | glyph cracks (emissive) | fronds | rune ring / key light |
|---|---|---|---|---|---|
| **Intro** | closed → open over 0.8 s on "Willow opens its eyes" | crack | dark → p1 | silver | the lantern ring ignites lamp by lamp (7 × 90 ms), then the rune fades in |
| **Phase 1** (100–66%) | **half-lidded** violet `#7a50f0 / #ac90ff / #f6f2ff` | a long crack with 3 faint violet glints | dim violet | silver-teal | violet [0.75, 0.45, 1.8] at 0.75 / key [0.45, 0.42, 1.15] |
| **Phase 2 Hush Spells** (66–33%) | wide open, glow ×1.3 | **an open glowing O**, a violet gradient | **blazing**, plus extra 1-px branches | **hush** tint (indigo-violet, with violet sparks) | ring at 1.0, plus the §5 Hush aura |
| **Phase 3 Riddle of Leaves** (< 33%) | **teal-gold**, calm (`#3fe8cc`, core `#ffe08a`) | crack (closed, "listening") | teal | **gold** (autumn), shedding the gold riddle leaves | ring → gold [1.2, 1.0, 0.35], key → warm |
| **Freed** (finisher) | closed, peaceful | **a soft smile (U)**; the first pass drew a frown | none | **bloom**: silver with pink-white blossoms | ring → warm white [1.4, 1.2, 0.5], then fades out; key [1.0, 0.85, 0.5]; leaves rise (§5) |

**Riddle leaf (plate carrier):**
- Size 22×14 at scale 2.2.
- Three tints:
  - *neutral*: gold `#5a4a12 … #fff0b8`, emissive;
  - *bloom* (right): green-gold `#2a6a1a … #ffffe0`, emissive;
  - *wither* (wrong or timeout): brown `#2a1a10 … #a87a4a`, **not** emissive.
- It drifts down at 0.35 m/s with a ±0.4 m sway, rotation ±12°, and the plate rides 0.5 m above it.
- **The three leaves never overlap each other's plate rects.** The lanes are fixed by T2.4 anchors.

---

## 4. Still-water reflection spec (fen, T2.2)

**Look.** Black-green still water that mirrors the world:
- cypress, reeds, posts, lanterns, and (tier 0) the actors;
- each lantern lays a **narrow, pixel-posterised vertical streak** on the water;
- a gentle row-wise ripple wobble;
- lily pads on the surface;
- fog over it all.

It is *still* water: no big waves and no broad glare.

**Technique (cheap, matches the HD-2D billboard world).** Reflections of billboards standing on a horizontal plane are **the billboards mirrored about y = 0**. No render-to-texture is needed. The mock proves the approach (`ch2Materials.ts`, `main.ts` "mirror"):
1. **Mirrored twins.**
   - For each prop or actor within camX ± 22 whose base is within 1.5 m of water, add a twin: the same geometry, `scale.y = −1`, `position.y = −y`.
   - Its material **shares the source material's uniform cells** (`{...src.uniforms}`) so lights stay live, overrides `uTint` to ×0.62 for props and ×0.70 for actors, and uses a vertex shader with a ripple wobble: `x += sin(floor(y·16)·0.9 + t·2.2) · 0.018 · (0.4 + depth·0.35)`.
   - Actor twins copy the actor's frame and flash state every frame (one extra uniform write per actor).
2. **Ground holes.** The `fen` ground `discard`s where `waterMask(tc)` = 1, so the twins below are visible only through the water.
3. **Under-water sky card.** A big unlit quad behind and below the twins (y −30, z −40, 260 × 60 m) with colour `fogCol × [0.5, 0.55, 0.6]`. Without it, reflected rays that miss geometry show the clear colour through the water.
4. **Water surface** (transparent, `depthWrite` true so DOF focuses on the surface):
   - **ripple normal** from two texel-snapped noise octaves, amplitude x 0.06/0.04 and z 0.14/0.08. Larger amplitudes smear lantern streaks into blobs;
   - **fresnel** `(1 − N·V)^3`; alpha `mix(0.74, 0.46, fres)`;
   - deep colour [0.004, 0.012, 0.010];
   - **light glints**: for each of the 16 lights, `pow(max(R·L, 0), 260) · 3.2 · falloff`. Use **no broad lobe**: a `pow(…, 12)` term made bright posterised blotches in the first passes;
   - **moon or sun glint**: `pow(…, 600) · 0.8`;
   - glints posterised to quarter steps;
   - **lily pads** as a decal: notched discs in 1.3 m cells (34% fill), r 0.2–0.42 m, with a rare flower;
   - `applyFog`.

**Tier fallbacks.**

| tier | reflection |
|---|---|
| 0 | twins for props **and actors**, ripple wobble, glints, lily pads |
| 1 | twins for **props only** (actors skipped), wobble, glints |
| 2 | **no twins, no ground holes for twins**: the surface is opaque "matte bog" (`mix(deep, fogCol·0.55, fres·0.8)` + glints + pads). It still reads as water because of the lantern streaks (`ch2-fen-water-tiers.jpg`) |

Add `waterReflect: 0 | 1 | 2` to `QualitySettings`. The auto-fallback then drops the reflection along with everything else.

**Perf budget (measured on the mock, M4 Pro Metal, 1920×1080, uncapped):**
- **Mock fen tier 0:** avg 3.41 ms, p95 6.0 ms. The same scene with `refl=0` measures avg 3.09 ms, p95 5.2 ms. So the twins plus the surface cost ≈ **+0.3 ms avg / +0.8 ms p95** with about 70 mirrored meshes.
- **Mock fen tier 2:** avg 1.54 ms, p95 3.1 ms; at 4× CPU throttle, avg 1.41 ms, p95 2.3 ms.
- **The mock has no HUD, sim or combat VFX.** The binding gates are the plan's: **Metal p95 ≤ 16.8 ms at tier 0 in a real L2-5 battle with max FX, and tier 2 ≥ 45 fps at 4× throttle** (T2.2, T5.3).

**Hard caps for T2.2:**
- ≤ **60 mirrored meshes** in the camX ± 22 window;
- twins share geometry (no new geometry per twin);
- one material per source material (cached; not one per mesh);
- the surface loop stays at the existing 16 lights;
- zero allocation per frame.

**Readability:** the water is ground, below every plate. Glints are capped at 3 HDR and posterised. The W4/W5 glare dampers (`additiveGain`) do not apply to the water's own shader, so its cap is that 3.0.

---

## 5. VFX spec rows (new; the format of `typing-vfx-spec.md` §5/§11)

R1–R9 of `typing-vfx-spec.md` §1.2 apply unchanged. That includes the **next letter is drawn last and never animated (R2)**, the `"above"` clip inflated 4 px around the next letter (R3), and the post flash ≤ 0.12 while typing (R6).

Additional Ch2 keep-out rules:
- **K1:** every new world effect respects the hero guard (`uHero` / `HERO_DAMP`).
- **K2:** no world effect brighter than 1.5 HDR may sit within 40 design px of an *active* plate's rect. Check this with the H3 keep-out probe; T3.2 extends `readability.spec`.
- **K3:** green is reserved for healing, and gold for elite or riddle-right.

All times are in ms from the event. `k` = effectsIntensity, `q` = quality multiplier.

### 5.1 Healer: `EnemyHealed{healerId, targetId, amount}` (from C0.1)

| t | HUD | World | Audio |
|---|---|---|---|
| −600 (the sim heal tick is known; play the windup on `HealerCasting`, or 600 ms before the cadence tick if C0.1 exposes only the result) | ✚ badge on the healer plate pulses 1 → 1.25 → 1 | Moth `cast` frame; crosses glow ×1.5; a green ring (FxKind.Ring, [0.4, 2.0, 0.7]) on the ground under the moth, r 0 → 1.2 over 600 ms | `mothFlutter` (§6) |
| 0 | the target's HP bar fills in green `#5cf08a` over 300 ms; a **green "+N"** pop in the existing damage-pop style, never over a plate (`drawPops` avoidance) | **heal beam**: FxKind.Beam from the moth to the target's chest, `uColor` [0.3, 1.6, 0.6], `uColor2` [1.4, 2.4, 1.6], width 0.10 u, 220 ms, head-to-tail fade. **Motes**: 14 green glow particles spiral up the target (r 0.5, rise 1.2 u/s, life 0.7 s). Target sprite `setRimFlash(0.6, [0.6, 2.0, 0.9])` decaying over 250 ms | `healChime` |
| at most 1 per 10 s per healer | — | at tier 2: beam plus 6 motes, no ring | — |

### 5.2 Elite aura and howl (`Telegraph` on an elite with the `howl` anim)

| state | World | HUD |
|---|---|---|
| idle (persistent) | §3.6 rim, sigil and motes | gold name tag; gold plate trim |
| howl telegraph (windup duration) | the howl pose held; **2 expanding gold rings** (FxKind.Line, [1.8, 1.3, 0.4] → [0.6, 0.3, 0.1]) from the head, r 0 → 3.5 m every 450 ms; sigil intensity 0.55 → 1.0; camera shake 0.15 on the howl's peak | the existing telegraph bar; nothing new over plates |
| bite (impact) | standard T2.3 hit, plus 3 gold shard particles | — |

### 5.3 Fading words (Hush Shade gimmick: plate letters fade in and out)

| t | HUD | World |
|---|---|---|
| fade-out phase | untyped letters lerp α to the gimmick's floor. **The next letter never fades below α 0.85** (R2 extension). It gets a 1-px violet underline `#ac90ff` as a "still here" cue | shade sprite α breathes to 0.55; 2/s violet letter-motes (A pool, [1.0, 0.6, 2.2]) peel off the hem and rise 0.6 m |
| fade-in | letters return over 200 ms | motes stop |
| Reveal skill (S7) | the plate snaps to full α with a white border flash (80 ms) | shade α → 1; a violet puff of 12 motes |

### 5.4 Leaf plates and the riddle (`RiddleShown`, `RiddleAnswered{correct}`, `RiddleTimedOut`, from C0.1)

| t | HUD | World | Audio |
|---|---|---|---|
| shown | the riddle panel (definition text) slides down from the top in 250 ms, inside its reserved rect (T3.1), never over plates. Three leaf plates appear with their leaves | Willow eyes → teal-gold; 3 riddle leaves (neutral, emissive) detach from the fronds and drift into their lanes; leaf storm rate 9 → 3 (quiet, so the player can read) | `whisperLoop` ducks to −12 dB; one `leafRustle` |
| typing | per-key VFX as `typing-vfx-spec` §2 (sparks clip around the next letter) | — | `key` |
| **right** | the plate shatters gold (PERFECT style, 3 gold rings plus 16 rays) | the leaf → *bloom* tint and scale 1 → 1.6 over 200 ms, bursting into 24 gold-green petal particles (B pool kind 1 + A glints) that fly to the Willow. Hit flash on the Willow; one front frond curtain tints silver → gold over 400 ms (5 right = all gold) | `riddleRight` |
| **wrong / timeout** | the plate does a desaturated crumble (fragments go grey, no rings); a short typo-style shake of 3 px | the leaf → *wither*: tint and scale 1 → 0.8; it curls (rotation +40°) and falls fast (vy −2.5); 8 brown flakes. `missHit` on the hero as usual | `riddleWrong` |

### 5.5 Hush Spell capital accent (`CharCorrect` where the typed char is uppercase; a new flag or a derived check, C0.1)

**The constraint:** the accent must not touch the *next* letter (R1–R3), and it must survive ≥ 90 WPM within the 0.45 ms/key budget.

| t | HUD (`"above"`, clipped) | World | Audio |
|---|---|---|---|
| 0 | on the **just-typed** capital's cell only: a **crown spark**, 3 gold pixels in a ^ shape 2 px above the glyph's cap height (`#ffd24a`, then `#fff0b8`); a 1-px gold top-bar flash over the glyph cell, 120 ms; the normal pop (§2.1) with white mix → **gold** instead of white | none (no per-key world allocation) | `capitalKey` = the normal `key` voice **plus** a low partial (§6) |
| 0–160 | 4 gold sparks rise straight up (not the fan), 2 px, life 160 ms | — | — |
| the ⇧ cue | when the *next* letter is uppercase, T3.1 draws a ⇧ glyph **beside** the plate (left margin, 10 px), never on the glyph. The cue is static: no pulse faster than 1 Hz | — | — |

The capital accent is a reward for the Shift lesson. It is small, gold and fast. Hush Spell plates keep the doom palette (R5).

### 5.6 Freed Willow (`FinisherCompleted` in Ch2 → `BossFreed`; replaces the Ch1 dissolve)

It reuses the `typing-vfx-spec` §9.2 finisher timeline up to 900 ms (the slash flurry and the X). Then:

| t | Effect |
|---|---|
| 900 | final cross; **no dissolve**. Post flash 0.35 **warm white** [1.0, 0.95, 0.8] (reducedFlash: 0) |
| 1060 | Willow → `freed` state: the eyes close, a smile, glyph cracks go dark over 300 ms. The violet rune ring turns to warm white, expands to r 14 over 1.2 s and fades |
| 1060–3000 | **leaves rise**: the storm reverses (vy +0.4…+0.9), the colour goes silver → green-gold, 30/s for 2 s; fronds tint to `bloom` over 1.5 s; 40 pink-white blossom particles |
| 1400–3000 | **light returns**: the mood crossfades grove → a "grove dawn" variant (exposure +0.15, fog colour × 1.4 toward [0.08, 0.1, 0.12], key [1.0, 0.85, 0.5]); the lantern ring brightens ×1.4; fireflies replace the hush motes |
| 2400 | the Willow's sigh (`willowSigh`), then the chapter-complete sting |
| 3000+ | the results screen. The letterbox bars return to 0 |

### 5.7 Other new rows (short)

| event | World | Audio |
|---|---|---|
| wisp death | **chime-puff**: the cap drops and falls (a B-pool hard pixel, grav 9); the flame shrinks to 0 in 150 ms; a ring of 10 cyan glints; light out over 200 ms | `wispChime` |
| toad slam (impact) | 14 dark-water droplets (B pool, grav 12) + a ground ring (FxKind.Ring, [0.4, 0.6, 0.5]); shake 0.35. On a fen tile, also a ripple ring decal on the water | `toadSplash` |
| shade death | the hem dissolves upward (`uDissolve`, edge colour violet [1.4, 0.8, 2.6]); the mask hangs 200 ms, then fades | `shadeHiss` (soft) |
| footsteps and hits on fen water | a 1.2 m ripple ring on the water surface (a uniform array of 4 ripple centres in the water shader) | — |
| Willow branch-lash | the T2.3 arc in violet-teal [0.6, 0.4, 1.6] → [0.3, 1.4, 1.2]; the lash-root frames | `willowCreak` + `slash` |
| Hush-Spell aura (phase 2, held) | violet-teal FxKind.Glow 6 u behind the Willow, α 0.35, breathing at 0.5 Hz; hush motes 10 → 20/s | `whisperLoop` |
| phase change (66%, 33%) | shudder (§3.7); leaf storm burst 40/s for 2 s; frond tint crossfade 600 ms | `leafStorm` |

### 5.8 Binding table (additions to `typing-vfx-spec` §11)

| sim event + condition | HUD | World | audio | notes |
|---|---|---|---|---|
| `EnemyHealed` | green +N, ✚ pulse, green HP fill | beam, motes, rim | `healChime` | §5.1 |
| healer windup | — | ring + cast frame | `mothFlutter` | §5.1 |
| elite spawn / alive | gold tag, trim | rim, sigil, motes | — | §3.6 |
| `Telegraph`, elite | — | howl pose + rings | `wolfHowl` | §5.2 |
| Fading phase | letter α (next ≥ 0.85) | shade α + motes | — | §5.3 |
| `RiddleShown` | panel + leaf plates | leaves drift in, storm quiets | `leafRustle`, duck | §5.4 |
| `RiddleAnswered{correct}` | gold shatter | bloom → petals → hit | `riddleRight` | §5.4 |
| `RiddleAnswered{!correct}` / `RiddleTimedOut` | grey crumble | wither + fall | `riddleWrong` | §5.4 |
| `CharCorrect`, uppercase | crown spark + gold pop | — | `capitalKey` | §5.5; budget 0.45 ms/key |
| `BossPhaseChanged` (Willow) | — | shudder, storm, tint | `leafStorm` | §5.7 |
| `FinisherCompleted` (Willow) | §9.2 HUD | §5.6 freed | `crit` → `willowSigh` | replaces the dissolve |

---

## 6. Audio: SFX and music brief (T3.3)

### 6.1 Synthesis direction

Build everything in `apps/game/src/audio` with the existing `Synth` primitives: `osc(type, f0, f1, t, dur, gain, {lp, q, slide, detune, wet, pan, hold})`, `noise(t, dur, gain, filterType, f0, f1, …)`, `bell(f, t, dur, gain, wet, ratios)`. Use the seeded `rng`, no `Math.random`, and the existing buses.
- **Mixing:** the Ch2 palette is **softer, airier and wetter** than Ch1. Fewer square waves; more sine, triangle and bells. Reverb per biome via `REVERB_BIAS`: hushwood 1.0, fen 1.2, grove 1.6.
- **Types:** extend `BiomeName` with `hushwood | fen | grove`, and add rows to `AMBIENCE_MIX`, `REVERB_BIAS` and `BIOME_MUSIC`.

### 6.2 Music (`BIOME_MUSIC` rows; the layers and `LAYER_GAINS` are unchanged)

| loop | bpm | root | scale | chords (per bar) | colour |
|---|---|---|---|---|---|
| **Hushwood** | 72 | 62 (D) | D **dorian** [0, 2, 3, 5, 7, 9, 10] | Dm9 · G/D · Fmaj7 · C, as [0, 3, 7, 14], [−7, −3, 0], [3, 7, 10], [−2, 2, 5] | a melody voice in **"celesta"**: sine + `bell` ratio [1, 4] at 0.3 gain, short decay. The pad is triangle at −5/+5 cents, attack 0.4 of a bar. Density 0.45 |
| **Fen** | 66 | 57 (A) | A **lydian** [0, 2, 4, 6, 7, 9, 11] | A · B/A · A · E/A over an A drone | a low sine **drone** (root −24) always on in the pad layer. The melody is **plucks** (triangle, decay 0.25 s, `lp` 2400) with occasional 2-note dyads. The battle drums use a frog-like low tom (sine 120 → 70) in place of the kick |
| **Willow boss** | 88 | 50 (D) | D **harmonic minor** [0, 2, 3, 5, 7, 8, 11] | Dm · B♭ · Gm · A7 | the boss layer is a sawtooth ostinato (`lp` 900, q 3, as Ch1) plus a **choir pad**: 3 detuned saws with `lp` 1200 and slow attack, the "whispers". Phase 3 (riddle) drops the drums to the hat only and adds celesta; **Freed** resolves to D major (the victory layer gains) |
| chapter-complete sting | — | D | major | I–V–I | the `fanfare(big)` shape, voiced on bells, ending on a held Dmaj9 bell chord |

### 6.3 Ambiences (`AMBIENCE_MIX` rows plus new sparse one-shot layers)

| bed | layers |
|---|---|
| **night forest** (hushwood, grove at 0.6) | wind 0.6 (bandpass 380, LFO 0.07); leaves 0.5. **New `crickets` layer**: a 4.6 kHz sine pulse train, 3 pulses per chirp at 18 ms spacing, every 0.4–1.2 s, 3 voices panned. **New `owl`** every 9–20 s: two sine hoots at 380 → 360 Hz, 0.35 s each, 0.5 s apart, wet 0.8. Birds 0 |
| **fen** | wind 0.3; **new `frogs`**: square 90 → 70 Hz with a 30 Hz amplitude wobble, 0.12 s, in 2–3 croaks per burst every 1.5–4 s, `lp` 700, panned. Drips 0.6 (shorter: 0.04 s, wet 1.0). **New `insects`**: highpass noise at 7 kHz, gain 0.006, slow LFO |

### 6.4 SFX (14 new ids in `SFX_IDS`; one voice each in `SFX_VOICES`)

| id | recipe (the `Synth` calls) | feel |
|---|---|---|
| `wispChime` | `bell(NOTE(91), t, 0.5, 0.06, 0.6, [1, 2.76, 5.4])` + noise highpass 8 k → 6 k, 0.15 s, gain 0.04 | a small glassy "ting-pff" |
| `shadeHiss` | noise bandpass 2400 → 900, 0.45 s, a = 0.08, gain 0.10, wet 0.5 + sine 300 → 180, 0.4 s, gain 0.03 | an exhale, not a scream |
| `mothFlutter` | 6 × noise bandpass 1800, 0.03 s, gain 0.05, every 45 ms, panned with the moth | soft wing beats |
| `healChime` | triangle NOTE(76) → NOTE(83) → NOTE(88), 0.09 s apart, gain 0.08, wet 0.5. A **minor-ish** rising shape so it is distinct from the hero's `heal` | "they're healing": a warning, not a reward |
| `toadCroak` | square 110 → 75 with 32 Hz AM (2 overlapping osc at ±16 Hz), 0.22 s, `lp` 800 | a deep, comic ribbit |
| `toadSplash` | `impact(heavy)` + noise lowpass 3000 → 400, 0.35 s, gain 0.4 + 8 sine "plips" at 600–1400 Hz over 0.3 s | a wet slam |
| `wolfHowl` | saw 300 → 520 → 380 (slide 0.6 s, hold 0.4), `lp` 1400 q 4, gain 0.07, wet 0.9 + a quieter second voice a fifth below, delayed 0.08 s | a telegraph: long, eerie, clear |
| `wolfBite` | noise bandpass 3000, 0.04 s + square 180 → 90, 0.08 s + `hit` | a snap |
| `willowCreak` | sine 70 → 55 (0.8 s, AM 7 Hz) + noise bandpass 400 → 250, 0.7 s, q 6 | an old wood groan |
| `whisperLoop` (held while a Hush Spell is up) | 3 noise voices bandpass 1200 / 1800 / 2600, q 8, with random-walk filter sweeps, gain 0.03 each, wet 1.0, faded in and out over 0.4 s; stopped by the binding | breathy, unintelligible whispers |
| `leafStorm` | noise highpass 3000 → 5000, 2.0 s, a = 0.4, gain 0.07 + 20 random `osc sine` ticks at 3–6 kHz (0.01 s) | a rushing rustle |
| `riddleRight` | `bell(NOTE(84))`, `bell(NOTE(88))`, `bell(NOTE(91))` at 0 / 60 / 120 ms + triangle NOTE(96), 0.4 s | a bright "correct!" bloom (not louder than `perfectWord`) |
| `riddleWrong` | sine 220 → 196, 0.3 s + noise lowpass 900 → 300, 0.2 s (a dry leaf crunch) | gentle and not punishing (typo family) |
| `capitalKey` | the normal `key` voice **plus** sine NOTE(key − 12), 0.06 s, gain 0.06. **Hot path: ≤ 2 extra nodes, no reverb send** | a "deeper click" |
| `willowSigh` | noise bandpass 600 → 300, 1.8 s, a = 0.5, wet 1.0 + triangle chord D-F♯-A (NOTE 62 / 66 / 69), 2.4 s, attack 0.8 s | a release, warm |

`leafRustle` (riddle shown) is `leafStorm` at 0.4× for 0.6 s. That gives 14 distinct voices plus one variant.

### 6.5 Listen checklist for the PO (append to `apps/game/src/audio/LISTEN_CHECKLIST.md`; keys on `?scene=audio-test`)

- [ ] **Hushwood loop:** calm, a little sad, magical (dorian). The celesta melody never sounds like Ch1's forest.
- [ ] **Fen loop:** dreamy and floating (lydian), the drone steady, never muddy in the low end.
- [ ] **Boss theme:** tense with whispers; phase 3 drops to the hat and celesta (thinking time); Freed resolves to major and feels like relief.
- [ ] **Night ambience:** crickets are not shrill on headphones; owl hoots are sparse (no more than once in 9 s).
- [ ] **Fen ambience:** frogs are funny and not annoying over 3 minutes; drips are subtle.
- [ ] **wispChime:** tiny and glassy.
- [ ] **shadeHiss:** eerie but not scary for children.
- [ ] **mothFlutter + healChime:** you can tell "an enemy healed" from the hero's `heal` with your eyes closed.
- [ ] **toadCroak / toadSplash:** the croak is comic; the splash is heavy.
- [ ] **wolfHowl:** clearly a warning, recognisable within 0.3 s.
- [ ] **wolfBite:** a snap.
- [ ] **willowCreak:** old wood.
- [ ] **whisperLoop:** unintelligible, and stops instantly when the spell ends.
- [ ] **leafStorm:** a rush, not white noise.
- [ ] **riddleRight / riddleWrong:** right is rewarding but quieter than `perfectWord`; wrong is gentle.
- [ ] **capitalKey:** a slightly deeper click on capitals. At 90 WPM on "Hush now, Ember Knight" there is no zipper and no lag.
- [ ] **willowSigh:** warm. It plays before the chapter sting, and they do not clash.

---

## 7. Hand-off notes per task

- **T2.1** (hushwood + grove):
  - paste §1.1 into `biomes.ts` and extend `BiomeId`;
  - add the ambient kinds (§1.5), the `Ground.kind` branches `leaf` and `roots`, and the fog-card material;
  - port the oak, lantern, waystone, mushroom, root arch, moss curtain, fern, frond and post generators **with authored normals** and the `flipN` fix;
  - AC stills next to `ch2-hushwood.jpg` / `ch2-grove.jpg`. Your capture must be at least as rich, and must keep the §1.4 fg placement rules.
- **T2.2** (fen + water): implement §4 exactly, including the sky card and `waterReflect` in `QualitySettings`, and report the Metal p95 on a real fen battle at tier 0 and tier 2 with 4× throttle.
- **T2.3** (sprites):
  - follow §3, using the SDF method for the wolf and the 4 Willow parts;
  - `set()` must clear glow;
  - provide a contact sheet against `ch2-sprites-sheet.jpg`;
  - every silhouette distinct at 2×.
- **T2.4** (layouts): follow the §1.4 bands; the lane stays clear; ≤ 9 static lights per battle pose; the riddle-lane anchors keep the 3 leaf plates apart.
- **T3.2 / T3.3:** follow §5 and §6.

## 8. Risks to the production-quality bar

1. **Night is hard to read.** The moods are inky by design, and the PO's Ch1 sign-off was on a bright forest. If hero, enemy or plate contrast drops, it fails the bar. Mitigations: `fill` 0.8 and `caveK` 0.45 hero lift in hushwood, mask and eye emissives on dark enemies, and a hero-luminance probe in T2.1's AC (hero silhouette ≥ 0.75, as in the plan).
2. **Procedural foliage noise.** Willow fronds and moss curtains can read as "pixel rain" or bead strings instead of leaf masses. The second mock pass is acceptable direction, not final. T2.3 needs an explicit bundle, gap and tip-taper pass, and a reviewer at 100% zoom.
3. **Silhouettes in backlight.** The Gloom Wolf and Shade go near-black against the fen's bright fog. Gold rim, emissive eyes and interior ramps ≥ `#2a3042` are mandatory; reject frames where the interior is pure black.
4. **Reflection cost and artefacts.** The mirrored twins double sprite draws in the water window. Broad specular lobes or a missing sky card produce bright blotches (seen and fixed in the mock). Keep the §4 caps, measure on a real battle, and keep the tier-2 matte bog.
5. **Glare stacking on dark moods.** Ch1's W4/W5 glare fixes were tuned for `caveK` 0 / 1, and Ch2 sits in between (0.3–0.6). Lantern halos + wisp light + typing tier-4 aura + heal beams could clip near plates. Verify with the K2 keep-out probe at max FX on L2-1, L2-5 and L2-10 before PO review.

## 9. Tuning log

| date | change | why (capture) |
|---|---|---|
| 2026-10-10 | Initial values. Mock passes: fog darkened and moved blue (pass 1 read milky lavender); grove fog magenta → blue (pass 2); oak canopy lowered under the 7 m frame top; fg props moved into the ±6 m frame; boardwalk widened to 2.3 and posts off the lane; Shade mask de-skulled; wolf redrawn with SDF; water broad lobe removed and sky card added | `docs/vfx/ch2-mock/*.jpg` |

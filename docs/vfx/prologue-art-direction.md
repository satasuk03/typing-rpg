# P0.2 Prologue "The Unwriting": art, VFX and audio direction

Status: the direction brief (Art Director, Opus). It is binding on numbers. Tune a number only when a Metal capture proves a
better read, and log the change in §8.
Inputs: `docs/PROLOGUE_PLAN.md` (§1, §2, §4, §5), the PO rulings of 2026-10-10 (**Nul, the Silent King**; hold Esc for 1 s to
skip; the kit is the 6 Ch1 actives), `docs/vfx/typing-vfx-spec.md` (R1–R9), `docs/vfx/ch2-art-direction.md` (K1–K3), the
render core, the procedural sprite kit (`render/sprites/ch2Props.ts` `Layer`, `ch2Monsters.ts`) and the audio engine.
VFX ids follow interfaces v2.2 (P0.1): `letterVortex` and `silenceFog` are **two** ids, and the stolen-colour swirl is a
**HUD** cue, not a world VFX. Binding names are in `docs/interfaces.md` §14.

---

## 0. Direction in one paragraph, and the mocks

The prologue is the one time the player sees the Ember Knight at full power, so it is the warmest, brightest scene in the
game. A storm-gold dusk is backlit by a low sun inside the arch of the **Word Gate**, whose carved letters glow gold. Against
that light **Nul** is a tall, near-black vertical spike. Only three things on him are bright: a bone-white mask with no
mouth, a crown of broken gold quills, and a violet rim. In the cutscene the colour drains out of the world in six visible
steps, one per stolen skill. At the end the only colour left on screen is what Nul stole, swirling inside his cloak, and one
ember in the knight's hand.

**Value rule, which every row below serves:** in Parts A and B, *Nul is dark on bright*. In Part C after the theft, *the HUD
layer holds all the colour*. The post grade can't grey it.

### 0.1 Mock stills (direction targets, not final art)

The mocks run on the **real** render core: `RenderWorld`, `WorldBuilder` on `ch1-l04` ruins terrain (encounter 3), the real
`HeroAura`/`BladeGlow` through `TypingWorldFx`, the real `Hud` with `MockDriver` plates, and the real post. Nul, the gate,
the runestones, the fireball, the ward and the HUD swirl are scratch art. The mocks were captured on Metal (M4 Pro, ANGLE).
The scratch code stays in the agent's scratch area. It is not committed and nothing goes into `apps/`.

| file | what |
|---|---|
| `docs/prologue/nul-turnaround-palette.jpg` | Nul in game view (3/4, baked flip), front, side and back, at in-game scale next to the hero (1.0), Hush Shade (1.1) and Golem (1.6). Height guides, the anim key poses, colour / glow / normal layers, the 50% alpha silhouette and the palette swatches with hex values |
| `docs/prologue/mood-stormgold-vs-unwritten.jpg` | the same frame in `STORM_GOLD` and in `UNWRITTEN` (with the HUD swirl and ember), plus the 7 frames of the theft ramp (§2.3) |
| `docs/prologue/partb-full-power.jpg` | a Part B composition: tier-3 aura, a Fireball in flight, Nul casting with the `ward` rim, a Shade and a Wisp, the real plates, and a Grimoire bar mock (6 actives + 9 passives) in the skill-panel rect |
| `docs/prologue/nul-intro-card.jpg` | the boss intro framing (fov 21, pitch 7, bars 0.1) with the **NUL / THE SILENT KING** card |

**In-render luma measured on the mocks** (relative luminance, post-processed frame, 1280×720):

| frame | mask forehead | cloak body | backdrop | mask : cloak | backdrop : cloak |
|---|---|---|---|---|---|
| storm-gold, two-shot | 0.437 | 0.025 | 0.951 | **6.5 : 1** | **13.4 : 1** |
| storm-gold, before the mask self-light fix (glow 0.12) | 0.379 | 0.025 | 0.951 | 5.7 : 1 (fails) | 13.4 : 1 |
| UNWRITTEN, two-shot | 0.331 | 0.075 | 0.446 | **3.0 : 1** | **4.0 : 1** |

What the mocks taught, now normative:
1. **The sun is behind the gate, so Nul's mask is backlit.** With no self-light the mask lands at 5.7 : 1 and fails the
   6 : 1 gate. The mask needs a **glow layer at 0.25 × its colour** (§1.4).
2. **An additive ward shell over Nul washes him pink** and kills the read (the first mock pass). `ward` is therefore a
   rim-only effect (§3, `ward`).
3. **The theft ramp must be front-loaded.** A linear `k/6` blend makes steps 1–2 invisible, because `sat` 1.18 → 0.84 barely
   reads (§2.3).
4. **A world-space light can't stay warm in `UNWRITTEN`.** `sat` 0.15 greys it, so the ember is drawn on **both** layers
   (§3, `ember`).
5. **Torch props stay full white in `UNWRITTEN`**, as the stray post next to Nul shows in the mock. The prologue layout has
   **no flame props** (§2.4).

---

## 1. Nul, the Silent King

### 1.1 Silhouette and turnaround

Read order at thumbnail size: **(1) the crown spikes, (2) the white oval mask, (3) a tall A-line dark cloak, (4) the
staff-quill as a separate vertical line.** He is a vertical spike: the Golem is a block and the Willow is wider than the
screen.

| view | what it shows |
|---|---|
| **game** (3/4; drawn facing right, baked flip like Ch2: image, glow and normal.x) | The mask sits 1.2 tx toward the facing side, and the far eye slit is 1 px shorter (2 vs 3 px). The cloak's back half trails wider than the front: hem half-width ×1.18 behind (+1.2% per tx below u 20) and ×0.86 in front, so he leans into the hero. The staff is held in the front hand at hand height 30 tx. The collar's two wings frame the mask, and the back wing is 2 tx taller |
| **front** | Symmetric. Rims on both edges, both slits 3 px, the staff at the right side |
| **side** | The cloak is 0.62× as wide, the mask is a half-oval at 0.55× width with one 2 px slit, there is one collar wing (behind), and 3 crown quills show |
| **back** | No mask. The back of the head is a dark ink oval with the mask strap (a 1-px gold line). The crown is mirrored, and a vertical glyph seam runs down the spine. The staff is on the left |

**Lore guard (Nul vs the Hush Shade):**

| | Hush Shade (Ch2) | Nul |
|---|---|---|
| mask | lavender `#eee8f4`, painted brows, crescent slits, **stitched mouth** | warm bone `#e9e3d6`, **no brows, no mouth**, two thin horizontal slits |
| head | a hood with a void | stiff pointed collar wings, no hood |
| crown | none | 5 broken gold quills |
| size | 1.1 scale, 28×40 | 2.35× the hero, 96×92 |
| prop | none | the Quill of Unwriting (a staff) |

### 1.2 Proportions (texels at actor scale **1.0**, 16 tx/m; u = texels up from the foot line)

**Use scale 1.0, not the boss default of 1.6.** Nul's texels must be the same size as the hero's. That is an HD-2D
consistency win over the Golem's chunky 1.6× texels, and it gives the mask enough pixels to be smooth.

| part | value |
|---|---|
| canvas | **96 × 92** (+1 px outline each side), foot line at y 89, anchor `ax` = the cloak centre after the flip, `ay` = the foot |
| total height (crown tip) | **73 tx = 4.56 m = 2.35× the hero** (the hero is 31 tx = 1.94 m) |
| top of the mask | u 60 (1.94× hero). The **boss plate anchors 1.0 m above the crown tip** (y ≈ 5.6 m), never on the mask |
| mask | **12 × 14 tx**, centre u 53, chin taper 38% at the bottom, eye slits at u 54 (3 px + 3 px, a 2 px gap; 2 + 3 in 3/4 view) |
| crown band | u 60–61, 13 tx wide, curved down 1.5 tx at the ends |
| crown quills | 5 quills at dx −6/−3/0/+3/+6 from the mask centre, heights **5 / 8 / 11 / 7 / 5** tx, lean −0.8/−0.35/0/+0.4/+0.85 px per tx. Quills 1 and 4 are **broken** (a jagged split tip). Only the tallest has a 1-px vane |
| collar wings | u 40–58 (back) / 40–56 (front). They flare from 4.2 tx off-centre to 2.5 + 0.32·(u−40) tx wide, with pointed tops and a violet rim on the outer edge |
| shoulders | u 46 (+1 on breath frames), half-width 8.4 |
| cloak | A-line from 8.4 (u 40) to **14.5 half-width at the hem** (×1.18 back / ×0.86 front in 3/4) |
| hem | page strips 3 tx wide with ragged bottoms at u 1–7 (sway ±0.8 tx per frame). The bottom row is a pale page edge (`#7a7684`), and 60% of strips have a gap |
| staff (Quill of Unwriting) | **66 tx** long. Nib 0–11% (violet crystal, a white slit, emissive). Gold ferrule 11–13%. A 2-px shaft 13–60%. Feather 60–100%: rachis bone, vane 4.6 tx out / 2.6 tx in, torn notches (22%), violet rim on the vane edge. At rest it stands vertical at x = cloak centre + 15, with the **nib down** at the ground |
| hands | bone `#ddd6c8…#6a6672` (always darker than the mask), 3×4 grip plus 1-px finger tips |

### 1.3 Palette (sRGB hex; mock swatches in `nul-turnaround-palette.jpg`)

| role | ramp (dark → light) | rule |
|---|---|---|
| cloak ink | `#07050d` `#0e0a18` `#140f22` `#1c1530` `#2a1d45` `#3a2a5e` `#4e3a7a` | Base `#140f22` → `#2a1d45`. Interior minimum ramp index **1.6** (never pure black). Fold ridges reach `#3a2a5e` near the shoulders only |
| rim violet | `#2a1260` `#5a3ab8` `#8a6cff` `#b9a6ff` `#e6dcff` | Back edge: 2 px (`#8a6cff` outer, `#5a3ab8` inner), glow 0.45. Front edge: 1 px `#5a3ab8`, glow 0.25, u 12–44. Collar outer edge `#8a6cff` |
| mask bone | `#4a4652` `#7a7684` `#a8a29e` `#cfc8bc` `#e9e3d6` `#f8f4ea` | Base `#e9e3d6`, cool shade `#bdb6ad`→`#a8a29e`. The forehead may reach `#f8f4ea`. **The mask holds the highest value on the sprite** |
| eyes / nib / spell | `#5a1a8a` `#9a2ee0` `#c04dff` `#e08aff` `#f2d8ff` (+ `#ffffff` nib core) | Eyes `#c04dff` with a `#f2d8ff` centre pixel, fully emissive. The nib is emissive at 0.9 |
| gold (crown, shaft, ferrule, mask strap) | `#3e2f14` `#6e5424` `#b08a3e` `#d8b464` | Tarnished. **No other warm colour on Nul** |
| outline | `[10, 6, 20]` | |
| **stolen-colour swirl** (HUD, Part C only) | Fireball `#ff7a2a`, Aegis `#ffd24a`, Slash Wave `#e8eeff`, Piercing Thrust `#4fe6ff`, Mending Light `#5cf08a`, Frost Lock `#6f8dff` | Six hues spread around the wheel (25°, 45°, white, 186°, 140°, 226°), so adjacent thefts never match. The same table drives `theftStream`. See §7 Q1: this deliberately differs from `SKILL_STYLE`, where 4 of the 6 are near-identical blues |

### 1.4 Material and normal-map notes (`Layer.n`, authored normals, as for ch2Monsters)

- **Cloak:** cylinder normals across the body (`nx = q·0.9`, `ny = 0.15`, `nz = √(1−q²)`). Folds dip `l −1.2` in a trough
  with a `+1.3·(0.5 + 0.5·u/42)` ridge beside it. Three folds fan out from the shoulders (`sin(q·4.4 + (1−u/46)·1.9)`).
  The cloak is **not** emissive except the rim.
- **Mask:** sphere normals (`dx·0.75, v·0.6, 0.75`). **Glow layer = 0.25 × the mask colour** (the measured fix: 5.7 → 6.5 : 1
  in the backlit storm). The eye slits are a full glow.
- **Collar wings:** normals tilt outward (`±0.7, 0.3, 0.6`), so the warm backlight catches their edges.
- **Staff / feather:** shaft `(−0.5, 0.2, 0.8)` on the lit side and `(0.5, 0.2, 0.8)` on the shade side. Vane ±0.5.
- `bulge` 0.7; `rim` 1.4 on the actor. **No `setLumCap` below 0.85** (the boss default is fine). **Don't** add a coloured
  point light on Nul's body: a violet fill lifted the cloak to mauve in the mock and cost the mask read.
- Hem letters: in the **sprite** they are only the 3×5 glyphs peeling off the hem (≤ 10 tx up, beside the cloak, never
  painted over the body, dissolving by Bayer dither as they rise). Free-floating letters higher up belong to `letterVortex`
  (§3), not the idle loop.

### 1.5 Animations (keys `monster.nul` / anims; frame counts and holds)

| anim | frames | timing | content |
|---|---|---|---|
| `idle` | **4** | 220 ms each, loop | Breath (shoulders + collar +1 tx on frames 1 and 3). Hem strips sway (phase ×1.57 per frame). 5 hem glyphs rise 2–3 tx per frame and dissolve |
| `cast` (hush bolt) | **3** | 120 / 160 / hold until the bolt leaves | 0: the staff tips forward 0° → 1: raised to +25°, nib forward-up (nib tip at about (cx+40, u 54)) → 2: a recoil of 1 tx back, nib flare frame |
| `write` (write-in-air, Part C 10.5 s) | **3** | 110 ms per frame, ping-pong in sync with the HUD ink letters (one stroke per letter) | Nib forward at −20° / +5° / +30°, hand height 38 / 41 / 44, so the nib traces a small arc at chest height |
| `catch` (Part C 0.0 s) | **2** | 0: 80 ms (the hand comes out) → 1: hold | The free arm leaves the cloak front, **palm out** at (cx+25, u 41), fingers up and splayed. The staff stays in the front hand |
| `reach` (the theft, 13.0–20.0 s) | **2** | 0: hold during each stream → 1: a 90 ms "pull" on each theft beat (fingers close by 1 tx) | The arm extends higher (cx+27, u 47), fingers **hooked** toward the hero |
| `hurt` | **2** | 60 / 140 ms | Lean −3 (the top recoils), the mask shifts −1.4 tx and tilts −0.12 px/tx, the eye slits flare white (`#f2d8ff`), the lower cloak flares +6% |
| `intro` (B2 boss intro, out of the sky tear) | **4** | 0–1: 200 ms each, 2: 300 ms, 3: hold (→ `idle`) | 0: lift +10 tx, cloak strips long (hem +6), 3× hem letters. 1: lift +6. 2: lift +2, the hem settles. 3: the `idle` frame 0 pose with the eyes at full glow |
| `rise` (Part C exit, 31.0 s) | **2** | 180 ms, loop while he ascends | Lift +6, hem strips streaming downward, 3× letters. The world move is the cutscene's `actor.move` |
| `ward` | overlay | — | It is not a sprite anim. It is the VFX in §3 |

Every frame shares one anchor (`anchorSet`). In total that is 4 + 3 + 3 + 2 + 2 + 2 + 4 + 2 = **22 frames**.

### 1.6 Silhouette and luma targets (what R0 gates on)

| target | measure | pass |
|---|---|---|
| **Height** | crown tip over the hero's height, both at scale 1.0 | 2.25–2.45× (mock 2.35×) |
| **Silhouette (alpha)** | the alpha mask of `idle[0]` box-downsampled to 50%, thresholded at 128 | ≥ **4 separate crown spikes** visible above the head line, the **collar notch** on both sides of the head, and the staff + feather as a **separate vertical stroke** detached from the body for ≥ 60% of its height |
| **Silhouette (value)** | a luma threshold at 0.5 on the same 50% sprite | the **mask is one isolated bright blob** and nothing else on the sprite passes the threshold apart from ≤ 6 px of crown tip |
| **Sprite luma** | mean relative luminance of mask pixels vs cloak pixels in the raw sprite | ≥ **10 : 1** (mock 11.1 : 1) |
| **In-render mask : cloak** | forehead box vs mid-cloak box on Metal, two-shot in `STORM_GOLD` | ≥ **6 : 1** (mock 6.5) |
| **In-render body vs backdrop** | mid-cloak vs the sky/fog inside the gate, `STORM_GOLD` | ≥ **3 : 1** (mock 13.4) |
| **UNWRITTEN** | same boxes, after theft step 6 | mask : cloak ≥ **3 : 1**, backdrop : cloak ≥ **3 : 1** (mock 3.0 / 4.0) |
| **No warm hue** | hue of every Nul pixel outside the gold ramp | none in 0–60° except the gold ramp |
| **Shade separation** | contact sheet, Nul next to the Shade at 1280 | a reviewer names both correctly at a 25% thumbnail |

---

## 2. Moods

Values are **linear**, in the `BiomeMood` shape of `render/biomes.ts`. Pasted from the mock's `moods.ts`.

### 2.1 Storm-gold: the Word Gate segment's `mood` tweak on `ruins` (`prologue.json`, `Segment.mood`, a `MoodTweak`)

```ts
// prologue.json Segment.mood (merged over BIOMES.ruins by the layout code)
const WORDGATE_TWEAK: MoodTweak = {
  amb: [0.26, 0.2, 0.31],
  gamb: [0.22, 0.13, 0.08],
  sunCol: [2.05, 1.22, 0.52],
  sunDir: [-0.38, 0.3, -0.87], // low, BEHIND the gate (negative z = away from the camera): a backlit key
  fogCol: [0.7, 0.4, 0.21],
  fog: [0.011, 14, 0.26],
  scatter: 0.95,
  exposure: 1.0,
  lift: [0.026, 0.012, 0.042],
  gamma: [1, 1, 1.02],
  gain: [1.1, 0.98, 0.83],
  sat: 1.18,
  contrast: 1.15,
  sh: [0.02, 0.0, 0.055], // violet shadows (Nul's colour lives in the darks)
  hi: [0.065, 0.035, 0.0],
  bloom: 0.62,
  thr: 0.95,
  vig: 0.56,
  clear: [0.7, 0.4, 0.21],
  rays: 1.5,
  fill: 0.45, // the camera fill lifts the backlit fronts of the hero and adds
  ambient: "embers",
};
```

### 2.2 `UNWRITTEN` (export next to `GROVE_DAWN`; not a `BiomeId`)

The ids that don't change inherit from the storm (`{ ...STORM_GOLD, … }` where `STORM_GOLD = { ...BIOMES.ruins,
...WORDGATE_TWEAK }`), so `blendMood` never swings the shadow direction, DOF or tilt.

```ts
export const UNWRITTEN: BiomeMood = {
  ...STORM_GOLD,
  amb: [0.22, 0.23, 0.26],
  gamb: [0.12, 0.12, 0.13],
  sunCol: [0.62, 0.64, 0.7],
  fogCol: [0.3, 0.31, 0.34],
  fog: [0.012, 14, 0.3], // NOT denser than the storm: grey fog on the cloak killed Nul's read (3.0:1 needs this)
  scatter: 0.35,
  exposure: 0.92,
  lift: [0.012, 0.014, 0.02], // a small cool lift; more lifts the cloak's blacks
  gamma: [1, 1, 1.02],
  gain: [0.96, 0.98, 1.02],
  sat: 0.15,
  contrast: 1.0,
  sh: [0.0, 0.006, 0.02],
  hi: [0.0, 0.005, 0.015],
  bloom: 0.25,
  thr: 1.15,
  vig: 0.71, // +0.15 over the storm
  clear: [0.3, 0.31, 0.34],
  rays: 0.2,
  fill: 0.25,
  ambient: "none", // the slow grey ash is the `silenceFog` emitter (§3); AmbientKind has no "ash" and P2.2 may add constants only
};
```

Changes from the plan's targets, with reasons: contrast is 1.0, not 0.92, and the fog is not raised, because the flatter and
denser grade took Nul's mask : cloak ratio to 1.9 : 1 in the mock. `blendMood` switches `ambient` at t ≥ 0.5, so the embers
stop at theft step 3. That is wanted: the world's sparks go out mid-theft.

### 2.3 The 6-step desaturation ramp (Part C theft, `mood` cues)

Use `blendMood(STORM_GOLD, UNWRITTEN, THEFT_RAMP[k])`. Each step blends over **280 ms, easeOutCubic**, starting when stream k
**arrives** at the mask (beat start + 820 ms).

```ts
export const THEFT_RAMP = [0, 0.24, 0.42, 0.57, 0.71, 0.85, 1] as const; // front-loaded: step 1 must already read
```

| k | stolen | beat starts | blend starts → done | t | sat | exposure | bloom | rays | ambient |
|---|---|---|---|---|---|---|---|---|---|
| 0 | — | — | — | 0 | 1.18 | 1.00 | 0.62 | 1.50 | embers |
| 1 | Fireball | 13.0 | 13.82 → 14.10 | 0.24 | 0.93 | 0.98 | 0.53 | 1.19 | embers |
| 2 | Aegis | 14.1 | 14.92 → 15.20 | 0.42 | 0.75 | 0.97 | 0.46 | 0.95 | embers |
| 3 | Slash Wave | 15.2 | 16.02 → 16.30 | 0.57 | 0.59 | 0.95 | 0.41 | 0.76 | **none** |
| 4 | Piercing Thrust | 16.3 | 17.12 → 17.40 | 0.71 | 0.45 | 0.94 | 0.36 | 0.58 | none |
| 5 | Mending Light | 17.4 | 18.22 → 18.50 | 0.85 | 0.30 | 0.93 | 0.30 | 0.40 | none |
| 6 | Frost Lock | 18.5 | 19.32 → 19.60 | 1.00 | 0.15 | 0.92 | 0.25 | 0.20 | none |

With reduced motion, each step snaps (0 ms). The aura collapse at 20.0 s happens in an already fully `UNWRITTEN` world.

### 2.4 Layout notes for P2.2 (Word Gate)

- Distance from the hero anchor to the boss anchor is **D = 10 m**. Nul's z is the slot line −1.4 m (behind the adds). The
  gate is at Nul.x + 0.6, **z −6.5** (inside the DOF focus range: at −10 the letters blurred into sparkle). Runestones at
  gate ±8 m, z −3.5 / −4.5.
- **God rays:** a `RayField` of 5 rays behind the gate, x from gate.x −6 to +7, h 16, `rotZ` −0.35…−0.15,
  colour `[1.4, 0.9, 0.45]`, intensity 0.55 × `mood.rays`.
- **Sun:** a glow disc of 22 m at (gate.x, 4.4, gate.z −18), `[1.6, 0.95, 0.4]` × 0.9, plus an 8 m inner glow in the arch
  (× 0.45). Both scale with `rays` / 1.5, so they fade with the theft.
- **No flame props** (torch posts, sconces). Flames ignore the grade's intent and stay white-hot in `UNWRITTEN`.
- Backdrops: `skyDusk` / `mountainsDusk` / `treelineDusk`. The ground should be the drier, least green ruins variant;
  the grade can't turn green grass gold (see the mock).
- The gate letters (`prop.prologue.wordgate`) are gold `#ffcf6a`/`#fff2c4` on a recessed `#241c16` cartouche, emissive
  2.4, ~44 glyphs along the arch and the pillars, read left to right (the `gateDarken` order).

---

## 3. VFX spec rows (`render/vfx/prologue/`; the format of `typing-vfx-spec.md` §5/§11)

R1–R9 of `typing-vfx-spec.md` §1.2 and K1–K3 of `ch2-art-direction.md` §5 apply unchanged. Prologue additions:
- **P1:** In Part B, **one kit skill VFX at a time** (the 1.5 s cast gap). No prologue world effect brighter than 1.5 HDR
  within 40 design px of an active plate rect (the K2 probe).
- **P2:** In Part C there are no plates. The **dialogue box rect inflated by 24 design px** and the **ink-line rect** are
  keep-outs for every world effect brighter than 0.8 HDR and for every HUD effect except the ink line itself.
- **P3:** Nothing additive over Nul's body raises his cloak luma by more than +10% (the ward lesson).
- **P4:** **Colour after theft step 3 lives on the HUD layer.** World effects from 16.0 s on may be any hue, but they read
  grey. Design them for value, not hue.

`k` = effectsIntensity, `q` = the quality multiplier (tier 0 1.0 / tier 1 0.75 / tier 2 0.5). Times are in ms from the cue,
or from the event. Particle counts are at tier 0 and k = 1. Pools are `PooledParticles` A (additive) and B (normal).

| cue id | trigger | shape | colour (HDR linear) | timing (ms) | particles | budget (tier 0) | readability keep-out |
|---|---|---|---|---|---|---|---|
| **`inkRise`** | stage spawn, prologue only (per add) | an ink pool disc on the ground (FxKind.Disc, normal blend, r 0 → 0.9 m), **upward drips** (B-pool streaks, vy +1.6…2.6 m/s, life 0.5–0.8 s), a violet rim ring (FxKind.Line, r 0.9 → 1.3 m); the sprite rises from y −1.2 → 0 | pool `[0.04, 0.03, 0.07]` α 0.85; rim `[0.9, 0.5, 2.4]` → `[0.4, 0.2, 1.2]`; drips `[0.05, 0.04, 0.1]` | pool opens 0–250, rise 250–850 (easeOutBack 1.2), rim 250–700, pool closes 850–1250 | 18 B drips + 10 A violet sparks per add | 2 quads + 28 particles; ≤ 3 adds at once | under the plates by construction (ground level); the plate appears after 850 ms |
| **`skyTear`** | B2 boss intro (open), Part C 31.0 (close) | a vertical slit quad above Nul (FxKind.Beam rotated 90°, 0.25 → 2.2 m wide, 9 m tall, top off-frame); white core, violet edge; 6 short lightning `ArcPool` crackles along the edge; a radial dark vignette pulse | core `[3.0, 2.8, 3.4]`, edge `[1.4, 0.5, 3.0]`; post `vignetteBoost` +0.2 | open: 0–400 (width easeOutExpo) + flash 0.10 capped (R6: no typing during B2); hold to the intro end; close (31.0 s + 4.0 s): 600 ms width → 0, then a 160 ms white line and a muffled boom | 24 A motes falling out of the slit (vy −1.2), 6 arcs | 1 quad + 6 arcs + 24 motes | B2 has the HUD hidden; Part C close: inside the sky, above the dialogue box (P2 check) |
| **`hushBolt`** | `EnemyAttack` when the attacker def is `nul` | an ink **lance**: a 2.4 m dark streak (B pool, st 0.35, normal blend) with a violet head (FxKind.Glow 0.5 m + Line ring 0.3 m); travels nib → hero chest | body `[0.05, 0.03, 0.1]`; head `[1.6, 0.6, 3.2]`; impact disc `[0.9, 0.4, 2.2]` | windup = Nul `cast` frame 1 (160 ms); flight 280 ms (easeInQuad); impact 0–220 ms: disc r 0 → 0.8, 10 ink flakes, hero rim flash `[1.2, 0.6, 2.4]` 0.5 | 1 head + 14 B trail + 10 B flakes + 6 A sparks | ≤ 2 bolts in flight | the flight line is world space; no world effect > 1.5 HDR within 40 px of a plate (K2): the head is 1.6 peak, so clamp it to 1.4 near plates. A guard word's plate is never crossed by the head sprite: the bolt flies below the plate row (y ≤ 1.6 m) |
| **`ward`** | per frame while `view.prologue.bossClamped` | **Rim-only shell**: a vertical ellipse outline (FxKind.Line, 5.2 × 6.6 m, centre at Nul's y 2.7, z +0.7), plus 10 slow violet sparks riding the rim (A) and 6 ink flakes peeling off it (B, kind 1, spin 3). **No additive fill and no Hex dome over the body** (P3) | line `[0.9, 0.5, 2.4]` → `[0.5, 0.25, 1.6]`, α 0.9 pulsing ±0.15 at 0.8 Hz; sparks `[1.2, 0.7, 3.0]`; flakes `[0.06, 0.04, 0.12]` | fade in 300 ms; hold; on a hit while clamped, a **ripple** (the line scales 1.0 → 1.06 → 1.0 in 180 ms) + 6 sparks; fade out 400 ms | 10 A + 6 B steady, +6 per hit | 1 quad + 16 particles | the line is 0.9 HDR peak (under the K2 1.5 cap); Nul's plate sits above the crown, outside the ellipse top |
| **`surgeAura`** | the prologue: aura floor at **tier 2** from `startPlay`; level tracks `view.prologue.surgeMult` | an extension of `HeroAura`: `auraLevel` floor = STREAK_STYLE tier 2; for surgeMult 2 / 4 / 8 / 16 add +0.15 / +0.3 / +0.45 / +0.6 to the flare level, rings ×1.1 per doubling (cap ×1.4), +4 / s motes per doubling (cap 30 / s) | the streak tier colour (unchanged); at surgeMult ≥ 8 add a gold under-pillar `[1.9, 1.35, 0.45]` | level ramps at the existing 2.5 / s; doubling events add a `surge()` pop (the existing 0.45 s) | ≤ +16 / s over the tier's rate | the existing aura budget + 1 quad | `setHeroGuard` stays on (the aura never veils the hero); story levels unchanged (gated on `view.prologue`) |
| **`catchFireball`** | Part C 0.0 | the last Fireball's FxQuad **freezes** at Nul's palm (cx+25, u 41 → world); its colour lerps orange → grey ink; it **cracks** (6 Line slivers) and **crumbles** into falling ink grains | fire `[4, 1.6, 0.35]` → `[0.5, 0.48, 0.52]` → `[0.06, 0.05, 0.08]`; a grey puff | hit-stop 160 ms (TimeDilation 0); hold frozen 0–500; colour lerp 500–1100 (the fire light fades with it, 1.0 → 0); crack 1100–1200; crumble 1200–1900 (grains vy −0.4 → gravity 3) | 22 B grains + 8 A dying sparks + 1 B smoke puff | 1 quad + 31 particles | no plates in Part C; it sits outside the dialogue rect (palm height ≈ 2.6 m) |
| **`inkWrite`** | Part C 10.5, synced with the HUD `ink` cue (one letter per 110 ms) | **The world draws only the nib sparks.** Per letter: 4 A sparks off the nib tip + a 0.12 m violet glow that follows the nib; Nul plays `write` frame (letter index mod 3) | sparks `[1.6, 0.6, 3.2]`; glow `[1.0, 0.4, 2.2]` 0.6 | each letter: spark burst at 0 ms, life 260 ms; glow follows for the whole line (14 letters × 110 ms = 1.54 s) | 4 A per letter (56 total) | ≤ 20 live | the HUD ink line is drawn above WebGL, so the sparks can't cover it; the sparks stay at the nib, ≥ 40 px from the ink-line rect (P2) |
| **`theftStream`** ×6 | Part C beats k = 1…6 at 13.0 + 1.1·(k−1) s | a **cubic bezier ribbon of motes** from the hero's chest (y 1.1) to Nul's mask (y 3.3); control points arc 2.2 m above the line, alternating sides per beat; motes travel head-first with a 0.6 m bright head and a fading tail | the **theft table** (§1.3) at HDR ×2.2: Fireball `[2.2, 0.42, 0.05]`, Aegis `[2.2, 1.43, 0.15]`, Slash Wave `[1.75, 1.85, 2.2]`, Piercing `[0.18, 1.7, 2.2]`, Mending `[0.24, 2.0, 0.55]`, Frost `[0.35, 0.55, 2.2]` | 0–120: the HUD icon cracks (the stream doesn't start yet); 120–820: the stream flies (easeInOutSine); 820: arrival (mask flash: the eye slits go to `#f2d8ff` for 120 ms; Nul `reach` frame 1 for 90 ms); the mood step starts (§2.3); 820–1100: tail drains | **40 A motes per stream × q** (tier 2: 20) + 1 head glow + 1 light (the stream colour, 0.8, follows the head) | 1 stream at a time (1.1 s beats, 0.98 s lifetime) | no dialogue line is on screen 13.0–20.0 (the table); the HUD Grimoire bar sits at the bottom centre, and the stream starts at the chest (≥ 120 px above the bar at 1080p) |
| **`auraCollapse`** | Part C 20.0 | a variant of the existing `gutter()`: rings **contract** 1.0 → 0.1 scale; the pillar narrows (w 1 → 0.05) then **snaps** (a 60 ms white line, gone); a smoke puff (B, grey); the blade glow gutters | rings / pillar in the current tier colour (it reads grey: P4); snap line `[2.0, 2.0, 2.0]`; smoke `[0.18, 0.18, 0.2]` | contract 0–500 (easeInCubic); pillar thin 300–700; snap 700–760; smoke 760–1600; `BladeGlow` 1 → 0 over 0–900 with 3 flickers; camera shake 0.4 s × 0.5 at 700 | 14 B smoke + 8 A last sparks falling | the existing aura quads | — |
| **`gateDarken`** | Part C 26.5 | per-letter emissive fade on `prop.prologue.wordgate` (a uniform of 44 per-glyph floats, or a `uLitCount` 0..44 plus a 1-glyph soft edge) and the runestones | glyph `#fff2c4` → `#241c16` (carved) | **120 ms per glyph**, left to right; each glyph fades 1 → 0 over 160 ms with a 1-frame spark (2 A motes, gold, up 0.4 m); total ≈ 5.4 s | 2 A per glyph (88 total, ≤ 6 live) | prop uniform + tiny motes | wide shot; the dialogue box keep-out holds (the letters are > 1 m above the ground) |
| **`letterVortex`** | Part C 31.0 (Nul rises) | a **spiral of 3×5 pixel glyph sprites** (B pool, kind 1 with the glyph atlas) around Nul, radius 1.8 → 0.6 m as they rise 0 → 9 m into the closing `skyTear`; they turn 2 rev/s; letters from the prologue word list | glyphs bone `[0.9, 0.88, 0.84]` with a violet glow underlay `[0.8, 0.4, 2.0]` α 0.3 (they read as pale on grey) | 0–4000 spawn, 60 / s × q; life 1.6 s; Nul `rise` lifts 0 → 9 m over 0–3600 (easeInQuad) | **≤ 120 live** at tier 0, 60 at tier 2 (plan §4.5 #5) | 120 instanced quads | stays above y 1.5 m and inside a 2.2 m radius of Nul: clear of the dialogue box rect |
| **`silenceFog`** | Part C 31.0 (after the tear closes, 35.0 the wall is at the camera) | (1) a **fog density ramp**: the mood `fog.x` 0.012 → 0.03 over 31.0–36.0, then back to 0.018 by 38.0 (so the close-up still reads); (2) **6 fog cards** (the Ch2 `fogCardMaterial` pattern, grey `[0.3, 0.31, 0.34]`, α 0.55) rolling down the road toward the camera at 3 m/s; (3) **ash**: slow grey flakes for the rest of Part C (it replaces `ambient` "ash") | cards `[0.3, 0.31, 0.34]`; ash `[0.42, 0.42, 0.45]` | cards from x = gate → camera over 31.5–36.5; ash 8 / s from 31.0 to the end, vy −0.25, sway 0.6, life 6 s | 6 cards + ≤ 48 ash (B, kind 1, size 0.05) | 6 quads + 48 particles | fog cards are world-layer and the HUD is above them; the card alpha is capped so the hero silhouette stays ≥ 0.75 (the existing hero silhouette spec) |
| **`ember`** | Part C 41.0 (the shards land) | **two layers.** World: a point light in the knight's open hand (`[1.0, 0.5, 0.18]`, intensity 1.6, r 2.4 m, flicker) + 3 A motes rising 0.3 m. **HUD:** the 4×4 core (`#ffd28a`, a `#fff4d8` 2×2 centre) + a 26 px radial halo (`rgba(255,170,70,0.75)` → 0), drawn at the projected hand point. Without the HUD half, `sat` 0.15 greys it | world `[1.0, 0.5, 0.18]`; HUD as given | lights 0 → 1 over 600 ms after the shards land; breathe ±12% at 0.6 Hz; 44.0 the hand closes: the halo shrinks to 14 px, the core stays; it follows the hand through 47.0 (stand, walk) | 3 A motes | 1 light | the HUD ember is drawn **below** the dialogue box in z-order and is never inside its rect (the hand is at screen y ≈ 70% in the close-up and the box is the bottom 22%: P3.6 checks it at 42.5 s and 44.0 s) |
| **HUD: stolen-colour swirl** (`colourSwirl` in the HUD; interfaces §14 name) | Part C 23.0 → the exit at 31.0 (fades as he rises) | **6 streams × 14 motes** on slow elliptical orbits inside Nul's cloak, **clipped to the projected cloak trapezoid** (top width 1.0 m at y 2.9; bottom 1.75 m at y 0.45), so no mote ever leaves his silhouette. Each mote has a 3-sample trail. Every 4th mote has a soft 6 px halo | the theft table (§1.3), full sRGB on the HUD canvas, `lighter` blend; head α 0.95, trail 0.4 / 0.2 / 0.13 | it builds stream by stream: each stream's motes appear at its theft arrival (13.82 s + 1.1·(k−1)) but are drawn only from 23.0 (before that the colour is "inside him"); the orbit speed is 0.5–1.0 rad/s, alternating direction per stream | 84 motes (tier 2: 42) | ≤ 0.08 ms per frame (fillRect only, no shadowBlur: R7) | Part C has no plates; it is clipped to Nul, so it never touches the dialogue rect |

---

## 4. Camera keyframes (`cutscene` `camera` cues)

Notation: `hx`, `nx` = the hero and Nul anchor x. `gx` = the gate x. `mid = (hx + nx)/2`. `D = nx − hx` (10 m). Poses are
`CameraPose {x, y, dist, pitch, fov}`. "dur" is the ease time into that key. Eases: `sine` = easeInOutSine,
`cubicOut` = easeOutCubic, `cut` = snap. **Reduced motion:** every move is a `cut` at the key time, there's no shake, and
dollies are dropped.

### 4.1 Part A (cold open, ≈ 9 s)

| t (s) | x | y | dist | pitch | fov | dur / ease | shake | note |
|---|---|---|---|---|---|---|---|---|
| 0.0 | hx − 6 | 2.5 | 32 | 26 | 30 | cut (black) | — | the pose is set under the black so the fade-in has no pop |
| 2.5 | hx − 6 → hx − 2 | 2.5 → 2.3 | 32 → 26 | 26 → 21 | 30 | 3.0 / sine (the push in) | — | "high crane" down the road at the gate; the knight walks in |
| 5.5 | mid | 2.1 | 22 | 18 | 31 | 1.5 / sine | 0.25 s × 0.15 at 6.0 (the ink drips) | the sky darkens over the gate |
| 7.0 | battle:1 | 1.9 | 18.6 | 16 | 32 | 1.0 / cubicOut | — | `BATTLE_POSE` reached by 8.0; `startPlay` at 8.0 hands the camera to the stage |

### 4.2 Part B boss intro (B2, existing `bossIntro` phase)

| t into B2 (s) | x | y | dist | pitch | fov | dur / ease | note |
|---|---|---|---|---|---|---|---|
| 0.0 | nx − 0.2 | 2.9 | 18 | 7 | **21** | 0.6 / cubicOut | `BOSS_INTRO_POSE` but at fov 21 (19 crops the crown at 1280); bars 0.1 (see `nul-intro-card.jpg`) |
| 0.0 → 3.4 | y 2.9 → 3.1 | | | | | linear | a slow tilt as he steps out of the tear |
| 3.4 | battle | | | | | 0.6 / sine | back to the battle pose for B3 |

### 4.3 Part C (the Unwriting, ≈ 55 s at minimum line holds)

| t (s) | x | y | dist | pitch | fov | dur / ease | shake | note |
|---|---|---|---|---|---|---|---|---|
| 0.0 | (hold) | — | — | — | — | hold; hit-stop 160 ms | 0.15 s × 0.2 at the catch | the battle pose the fight ended on |
| 1.5 | nx + 0.4 | **3.4** (mask) | 18 | 7 | **19** | 3.0 / sine | — | the mask push; the mask fills ≈ 9% of the frame height at 1080p |
| 7.5 | hx + 0.3 | 1.1 | 14 | 5 | 24 | 1.5 / sine | 0.2 s × 0.2 at the flare | the knight, low; aura tier 4 |
| 10.5 | mid | 2.4 | 22 | 12 | 30 | 1.2 / sine | — | the two-shot for the ink line |
| 13.0 | mid → mid + 1.5 (the `offset.x` dolly toward the knight) | 2.4 | 22 → 20 | 12 | 30 | 7.0 / linear | **each theft arrival**: 0.12 s × 0.25 | the theft |
| 20.0 | mid + 1.5 | 2.2 | 20 | 11 | 30 | hold | 0.4 s × 0.5 at 20.7 (the snap) | the aura collapse and kneel |
| 23.0 | nx + 0.2 | 2.6 | 15 | 8 | 22 | 1.2 / cubicOut | — | Nul close: mask + swirl in frame (the mask at the top third) |
| 26.5 | mid + 1 | 3.0 | 30 | 22 | 30 | 2.5 / sine | — | wide and high: the gate goes dark |
| 31.0 | mid + 1 | 3.0 → 4.5 | 30 | 22 → 18 | 30 | 6.0 / sine | 0.3 s × 0.3 at 35.0 (the boom) | it follows the rise; the fog rolls at the camera |
| 37.0 | hx | 0.9 | 12 | 4 | 20 | 1.5 / sine | — | the knight close and low |
| 41.0 | hx | 0.9 → 0.8 | 12 → 11 | 4 | 20 → 19 | 6.0 / linear | — | a creep-in on the shards and the ember |
| 47.0 | hx + 3 | 2.0 | 40 | 30 | 30 | 6.0 / sine | — | the crane up and away; the ember stays a warm dot |
| 53.0 | (hold) | | | | | fade to black 1.5 s | — | the 2-note motif plays |

Line keyframes for the dialogue keep-out probe (P2): 1.5, 4.5, 7.5, 23.0, 26.5, 37.0 and 44.0 s.

---

## 5. SFX and music (procedural; `audio/sfxPrologue.ts`, `music.ts`, `musicScheduler.ts`, `mixer.ts`)

### 5.1 Synthesis direction

Build everything with the existing `Synth` primitives (`osc`, `noise`, `bell`, `env`), the seeded `rng` and the existing
buses (`sfx`, `ui`, `ambience`, `music`). The prologue palette moves from **bright brass and bells** (full power) to **dry,
filtered and close** (silence). Every "loss" sound **descends**; the ember sound is the only one that **rises**.
Rows to add: `BiomeName` gets `prologue`, with an `AMBIENCE_MIX.prologue` row (wind 0.7, crackle 0.4 = embers, birds 0,
drips 0) and `REVERB_BIAS.prologue` 1.1 (a stone arch).

### 5.2 Music arc

| stretch | material | `BIOME_MUSIC.prologue` / control |
|---|---|---|
| **Heroic** (Part A from 2.5 s, B1, B3) | **D major**, bpm **112**, root 62, scale `[0, 2, 4, 7, 9]` (pentatonic), chords **I · V · vi · IV** = `[0,4,7]`, `[-5,-1,2]`, `[-3,0,4]`, `[-7,-3,0]`, density 0.7, new `style: "brass"`: the melody voice is 2 detuned saws (±6 cents) through `lp` 2400 q 1.2, attack 30 ms, plus a square an octave down at 0.25 (the "brass" bite). **The melody's head motif is a rising fifth D5 → A5 (MIDI 74 → 81)** on every first bar of the 4-bar pattern: that is the "spark" motif, seeded here | layers `walk` (Part A), `battle` (B1); `LAYER_GAINS` unchanged |
| **Boss** (B2–B3) | same key; the boss layer is a low saw ostinato on D–A–C–A (`lp` 900 q 3, as Ch1) and drums ×1.2; the melody drops to 0.2 | `setState("boss")` |
| **Theft** (Part C 0.0 → 20.0) | at 0.0 **everything cuts** (a 40 ms fade) to **one sustained low D** (sine MIDI 38 + triangle MIDI 50 at 0.3, `lp` 600, attack 0.6 s), gain 0.5 of the music bus. Each theft beat adds nothing musical: the SFX carry it. A **reverse swell** (noise bandpass 300 → 1200, 0.9 s, rising gain) leads into 10.5 s (the ink line) | `music.drone(38)` (new) |
| **Silence** (20.0 →) | the drone stops with the aura snap. `silence(1)` engages over 1.2 s: music + ambience buses **low-pass 18 kHz → 350 Hz** (an exponential ramp) and **duck −12 dB**. Only the wind (filtered) and the SFX are left | `mixer.silence(amount, rampS)` |
| **Lone ember** (41.0 →) | `silence(0.75)` over 2 s (the low-pass opens to ≈ 900 Hz, the duck is −9 dB). **The spark motif:** a single `bell(NOTE(74))` then `bell(NOTE(81))` 0.6 s later, gain 0.07, wet 0.8, ratios `[1, 2.76, 5.4]`, played **once** at 41.6 s | `music.motif("spark")` |
| **End** (53.0) | the motif again, now bell + a soft triangle pad on D–A (MIDI 62/69, attack 0.8 s, 2.4 s), resolving to D major add9 (62/66/69/76) under the fade. The story card / L1 can quote the rising fifth later as "power regained" | `music.motif("sparkEnd")` |

`silence(amount)` acceptance: the cutoff and gain use `setTargetAtTime` with tc = rampS / 3 (no clicks: P3.4's offline
render test). `silence(0)` restores the exact pre-silence gains.

### 5.3 SFX (new ids in `SFX_IDS`; one voice each)

| id | cue | recipe (`Synth` calls) | feel |
|---|---|---|---|
| `inkPool` | `inkRise` | noise lowpass 900 → 300, 0.5 s, a 0.05, gain 0.18, wet 0.4 + sine 90 → 140 (rising), 0.6 s, gain 0.08 + 6 "drip-up" sine plips at 900 → 1400 Hz, 0.03 s, over 0.5 s | a wet bubble that runs backwards |
| `skyTear` | `skyTear` open | **reverse swell**: noise bandpass 400 → 3000, 1.2 s, a = 1.1 (all attack), gain 0.22, wet 0.9 + the `whisper` texture (`WhisperLoop`, 1.4 s) + saw 55 Hz, `lp` 300, 1.4 s, gain 0.12; at the open: a `crack` (noise highpass 2 k, 0.06 s, 0.3) | a sky ripping |
| `skyTearClose` | `skyTear` close | a muffled boom: sine 70 → 38, 0.9 s, gain 0.45, `lp` 400 + noise lowpass 500 → 120, 0.8 s, gain 0.3, wet 0.9 | heard through cotton |
| `hushBolt` | `hushBolt` | launch: noise bandpass 1800 → 600, 0.28 s, gain 0.12 + sine 520 → 180, 0.28 s, gain 0.06; impact: `impact(heavy)` at 0.6 + a violet "shh" (noise bandpass 3000, q 2, 0.2 s, 0.08) | an ink lance: a hiss that thuds |
| `wardHum` (held) | `ward` | 2 sines at 196 / 197.5 Hz (1.5 Hz beat), gain 0.05, `lp` 900, faded in/out over 0.3 s; on a hit: `bell(NOTE(79), 0.25 s, 0.05)` with ratios `[1, 2.4]` | a held glass hum |
| `catchHiss` | `catchFireball` | at freeze: the fire `skillFire` voice cut off after 60 ms; 0.5 s: a choked hiss (noise bandpass 2500 → 400, 0.6 s, gain 0.14); 1.1 s: a dry crunch (noise highpass 1500, 0.05 s × 3 at 40 ms) | fire smothered in a fist |
| `quillScratch` | `inkWrite`, per letter | noise bandpass 3800 (± 8% from a seeded index), q 4, 0.045 s, gain 0.07 + square 1600 → 900, 0.02 s, gain 0.015, pan +0.3 | the player's own keystroke, made sinister |
| `theftCrack` ×6 | each `theftStream`, at 0 ms (the icon cracks) | glass: `bell(f, 0.5 s, 0.09, wet 0.6, [1, 2.76, 5.4, 8.9])` + noise highpass 6 k → 3 k, 0.12 s, 0.12. **f descends per beat**: Fireball NOTE(88), Aegis NOTE(86), Slash Wave NOTE(83), Piercing NOTE(81), Mending NOTE(79), Frost NOTE(76) (E6 → E5 down the major pentatonic) | each loss is a step down |
| `theftWhoosh` | each stream, 120 → 820 ms | a **reverse whoosh**: noise bandpass 600 → 2400, 0.7 s, a = 0.6, gain 0.13, pan hero → Nul (−0.5 → +0.5) + a sine in the element's octave, f → f/2 over 0.7 s, gain 0.03 | the colour is sucked across |
| `auraCollapse` | `auraCollapse` | a downward sweep: saw 880 → 55, 0.7 s, `lp` 2000 → 200, gain 0.1 + sine 110 → 40, 0.5 s, gain 0.25 at the snap (700 ms) + noise lowpass 800, 0.3 s puff | the power dies |
| `swordClang` | the kneel (21.0) | muffled: `impact(false)` through `lp` 700 + `bell(NOTE(64), 0.4, 0.04, wet 0.9, [1, 2.4])` | the sword hits stone, heard far off |
| `heartbeat` | 37.0 → 41.0 | 2 sines per beat (lub 55 Hz 0.09 s gain 0.3, dub 48 Hz 0.08 s gain 0.22, 160 ms apart), every 0.95 s, `lp` 200, **not** routed through `silence()` (the sfx bus) | close, inside the head |
| `emberChime` | `ember` lights (41.0) | `bell(NOTE(86), 1.2 s, 0.06, wet 0.8, [1, 3.0])` + triangle NOTE(98) 0.3 s, gain 0.02, a 0.08 | the one rising, warm sound |
| `lineBlip` | each dialogue line (`line` cue) | Nul: sine NOTE(50) 0.05 s, gain 0.03, `lp` 600. Knight: triangle NOTE(74) 0.04 s, gain 0.03. ui bus | soft speaker tick |
| `gateDark` | each `gateDarken` glyph | sine NOTE(91 − i mod 5 · 2), 0.06 s, gain 0.012, wet 0.7 | tiny lights going out |

The `whisper` texture is reused from `audio/whisper.ts` (Part A 5.5 s, the `skyTear` open). Hush Shade and Wisp voices are
reused (`shadeHiss`, `wispChime`).

### 5.4 Mix levels (relative to the Ch1 battle mix; the bus defaults are unchanged)

| moment | music bus | ambience bus | sfx | notes |
|---|---|---|---|---|
| Part A | 0 dB (walk layers) | 0 dB (wind + crackle) | — | the caption needs no ducking |
| Part B | 0 dB (battle / boss) | −3 dB | the typing SFX at the Ch1 levels; kit casts **−2 dB** (6 actives + passives are denser than Ch1) | the T2.6 key SFX are never ducked |
| Part C 0.0–20.0 | the drone at −6 dB | −6 dB | `theftCrack` 0 dB, `theftWhoosh` −4 dB | dialogue blips at −10 dB |
| Part C 20.0–41.0 | `silence(1)`: −12 dB, LP 350 Hz | the same `silence(1)` | `heartbeat` −3 dB, unfiltered | |
| Part C 41.0–end | `silence(0.75)`: −9 dB, LP ≈ 900 Hz | the same | `emberChime` −4 dB | the motif plays on the music bus but **bypasses the LP** (a direct send) so it stays clear |

### 5.5 Listen checklist (append to `audio/LISTEN_CHECKLIST.md`)

- [ ] **The prologue theme** sounds heroic and faster than any Ch1 loop; the rising-fifth head motif is hummable.
- [ ] **The catch** cuts the music so hard you notice the silence.
- [ ] **The 6 theft cracks** step down in pitch: with your eyes closed, you can count six losses.
- [ ] **`silence()`** has no clicks or zipper noise when it engages or opens.
- [ ] **The heartbeat** feels close and is not muddy on laptop speakers.
- [ ] **The ember chime and the spark motif** are the only warm, rising sounds after 20 s.
- [ ] **`quillScratch`** reads as a pen, not as the player's key sound (it is not confusable with `key`).

---

## 6. R0 gate checklist (the Nul sprite, `docs/qa/prologue-r0.md`)

R0 runs on **Metal** captures (`playwright.metal.config.ts` or the P2.1 sheet scene, a unique port). Every line is pass or a
P1. Any P1 blocks P3.2.

1. [ ] **Contact sheet** at 1280 and 1920: Nul `idle[0]` next to the hero (1.0), Golem (1.6), Willow core (1.15), Hush Shade
   (1.1) and Wisp (1.2) at in-game scales, on the storm-gold mood and on a neutral grey.
2. [ ] **Height:** crown tip 2.25–2.45× the hero (spec 73 tx). The mask is 12×14 tx. Actor scale **1.0**.
3. [ ] **Silhouette (alpha, 50%):** ≥ 4 separate crown spikes, the collar notch on both sides, the staff as a separate stroke
   for ≥ 60% of its height (§1.6).
4. [ ] **Silhouette (value, 50%, luma 0.5 threshold):** the mask is the only bright blob (≤ 6 px of crown tip may also pass).
5. [ ] **Sprite luma:** mask : cloak ≥ 10 : 1 in the raw frame.
6. [ ] **In-render luma on Metal** (two-shot, `STORM_GOLD`): mask : cloak ≥ 6 : 1, backdrop : cloak ≥ 3 : 1. In
   `UNWRITTEN`: both ≥ 3 : 1. Attach the box coordinates and numbers.
7. [ ] **Palette:** every pixel is from §1.3; no warm hue outside the gold ramp; the cloak interior never drops below ramp
   index 1.6 (no pure black holes against the fog).
8. [ ] **Lore guard:** no mouth, no brows, bone (not lavender) mask, no hood. Two reviewers tell Nul from the Shade at a 25%
   thumbnail.
9. [ ] **Normals:** authored normals on the cloak, mask, collar and staff; the baked flip negates normal.x (check: the warm
   sun rim lands on the same world side for both facings). No alpha-derived bulge on the mask.
10. [ ] **Glow:** the mask's glow is 0.25 × its colour; the eyes and nib are full emissive; the rims are emissive at
    0.45 / 0.25; **the cloak body has no glow**.
11. [ ] **Anims:** all 22 frames (§1.5) on one anchor; no foot slide between `idle` frames (≤ 0 px at the foot line); the
    `write` nib tip positions are 3 distinct points ≥ 4 tx apart; `catch` is palm out; `reach` is fingers hooked.
12. [ ] **Hem:** page strips with ragged bottoms and a pale edge; the hem letters stay beside the cloak (never over the
    body) and dissolve by ≤ 10 tx.
13. [ ] **Plate anchor:** the boss plate sits ≥ 1.0 m above the crown tip and never overlaps the mask at the battle pose (the
    readability probe at max FX).
14. [ ] **Art bar:** a side-by-side with `poc/v2-boss-intro.png` at the B2 intro framing (fov 21, bars 0.1). The reviewer
    grades "matches or beats". The scratch mock `docs/prologue/nul-intro-card.jpg` is the floor: P2.1 must beat it (smoother
    mask shading, readable folds, a crisper crown).
15. [ ] **Cost:** generation time for all 22 frames ≤ 60 ms (cold), and the texture memory is recorded.

---

## 7. Questions for the PO (each has a default; work proceeds on the default)

1. **Theft colours vs the existing skill colours.** `SKILL_STYLE` / `SKILL_ACCENT` make Aegis, Slash Wave, Piercing Thrust
   and Frost Lock all pale blue, so six streams would read as "orange, then four blues, then green". **Default:** a separate
   theft table (§1.3), used only by `theftStream` and the HUD swirl, with the plan's colours (Aegis gold, Slash Wave
   steel-white, Piercing cyan, Frost blue). The icons and the combat VFX are unchanged.
2. **The ground looks green.** The ruins grass stays green under the storm grade (see the mock). **Default:** P2.2 uses the
   driest ruins ground variant and few grass tufts. A gold-dry ground material is polish backlog, not M2.
3. **Mood deltas from the plan.** `UNWRITTEN` keeps contrast 1.0 and the storm's fog density (the plan said 0.92 and
   heavier), because the measured read of Nul failed otherwise. **Default:** the numbers in §2.2.

## 8. Tuning log

| date | what | why |
|---|---|---|
| 2026-10-10 | the mask glow 0.12 → 0.25 | the backlit storm measured 5.7 : 1 (< 6) |
| 2026-10-10 | `UNWRITTEN` fog 0.024 → 0.012, contrast 0.92 → 1.0, lift halved | mask : cloak 1.9 → 3.0 |
| 2026-10-10 | the theft ramp linear → `THEFT_RAMP` | steps 1–2 were invisible |
| 2026-10-10 | `ward` from a Hex dome to rim-only | the additive dome washed Nul pink |

## Orchestrator rulings (2026-10-10)
- The HUD swirl id is `colourSwirl`, as in interfaces §14 (renamed from the placeholder `stolenSwirl`).
- **Accepted defaults.** The PO ruled that art doesn't block milestones and can be iterated later.
  1. A separate theft-only palette with the plan colours. Icons and combat VFX don't change.
  2. The driest ruins ground with few tufts. A gold, dry ground material goes to the polish backlog.
  3. The measured `UNWRITTEN` numbers (contrast 1.0, storm fog density) replace the plan targets.
- **Part B mock: damage pops must not sit on Nul's mask or face.** P3.3 and R1 check this.

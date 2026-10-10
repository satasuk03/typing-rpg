# R0 Villain gate: Nul, the Silent King (P2.1 on `main`)

Reviewer: Art Director (Opus), 2026-10-10. Spec: `docs/vfx/prologue-art-direction.md` §1 and the §6 checklist.
Build: `main` at `6532c1e` (P2.1 merge), merged into the review branch.
Capture: real Metal (Chromium channel `chromium`, `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, M4 Pro), Vite on
port 5417, 1280×720 unless noted, 0 console errors in every capture.

## Verdict: **PASS with P2/P3 polish**

There are no P1 items, so **P3.2 (the prologue VFX) is unblocked.**

Nul reads as the spec intends. He is a tall dark spike with a bone-white blank mask and a broken-quill crown. At a 25%
thumbnail he can't be confused with the Hush Shade. Every sprite-level number passes, and all in-render numbers that the
P2.1 sprite controls pass on Metal.

Two kinds of item are not sprite defects and go to their owners:
- **The backdrop halves of item 6.** These are owned by P2.2, because there is no Word Gate sky behind him yet.
- **The B2 framing problems:** the bottom bar cuts the nib and hem, and level foreground props occlude Nul. These are
  camera and layout numbers.

The polish items are mostly about richness at the B2 close-up: flat cloak folds, a dithered mask, and an eye bar in the
intro frame.

## How the numbers were measured

- **Scene.** I built my own scene through the real render core: `RenderWorld`, `buildWorld`, the real post, and the
  `STORM_GOLD`/`UNWRITTEN` constants exported by `dev/nulSheet.ts`. I loaded it into the `?scene=nul-sheet` page and used
  the hero plus the real `monster.nul` frames.
- **Placement.** The level is `ch1-l04` encounter 3, the same spot as the P0.2 mocks. Nul is on the last slot.
  `ch1-l05` boss-slot repeats are also listed.
- **Sampling.** Boxes are not hand-placed rectangles. They come from the sprite's own `PART` map, projected to screen
  pixels. The texel-to-pixel offset is fitted per still: the best mask-bright / cloak-dark registration, verified on the
  overlay still `r0-twoshot-storm-boxes.jpg` (green = forehead samples, magenta = mid-cloak samples).
  - **forehead:** mask texels at u 56–59.5 (35 samples).
  - **mask:** all mask texels except the eyes (120 samples).
  - **mid-cloak:** interior cloak texels at u 14–30, at least 2 tx inside the silhouette (320 samples).
  - **backdrop:** pixels 4–6 tx outside the silhouette on both sides, rows u 30–66 (216 samples).
- **Contrast** is WCAG `(L1+0.05)/(L2+0.05)` on relative luminance, the same formula as the §0.1 mock table.
- **Sprite-level numbers** come from `renderNulRaw` in the browser (`window.__nulSheet.numbers`), plus my own pass over all
  22 frames: glyph heights, cloak ramp histogram, default-normal coverage, and timing.

## Checklist (§6)

| # | item | result | evidence |
|---|---|---|---|
| 1 | Contact sheet at 1280 and 1920, storm-gold + neutral | **PASS** | `r0-lineup.jpg`: in-world lineup (hero 1.0, Shade 1.1, Wisp 1.2, Golem 1.6, Nul 1.0) at 1280 in STORM_GOLD, the native ruins mood, UNWRITTEN, and 1920×1080; it embeds the P2.1 sprite sheet (Willow core). Nul is the tallest read in the roster, a vertical spike next to the Golem block |
| 2 | Height 2.25–2.45×, mask 12×14, scale 1.0 | **PASS** | 73 tx / 31 tx = **2.355×**; mask 14 rows × 11–13 tx (unit test); actor scale 1.0 (`NUL_SCALE`) |
| 3 | Alpha silhouette at 50% | **PASS** | ≥ 4 crown spikes, a collar notch on both sides, and the staff detached for ≥ 60% of its height (unit test); visually confirmed in `docs/qa/prologue-p2.1/nul-sil.jpg` |
| 4 | Value silhouette at 50% | **PASS** | 26 bright px at 50%, all in the mask blob except ≤ 6 (crown tip and nib core); `nul-sil.jpg` |
| 5 | Sprite luma ≥ 10:1 | **PASS** | **11.70 : 1** (mask 0.682, cloak 0.0126) |
| 6a | In-render STORM_GOLD mask : cloak ≥ 6 | **PASS** | two-shot `ch1-l04` e3: forehead : cloak **7.74**, mask : cloak 7.52 (`r0-twoshot-storm.jpg`). `ch1-l05` boss slot: 7.09 / 6.60 (`r0-twoshot-storm-l05.jpg`). B2 close-up: 10.6. Forehead luma 0.454 vs the mock's 0.437 |
| 6b | In-render STORM_GOLD backdrop : cloak ≥ 3 | **PASS (provisional), re-measure in P2.2** | `ch1-l04`: **3.78**; `ch1-l05`: 2.81 (a dark tree trunk behind the shoulder). The cloak itself is right (mid-cloak luma 0.015 vs the mock's 0.025: darker, as intended). What's missing is the bright gate sky the mock had (0.951). Owned by P2.2, see F5 |
| 6c | UNWRITTEN mask : cloak ≥ 3 | **PASS** | two-shot `ch1-l04`: **4.97** (`r0-twoshot-unwritten.jpg`); B2: 6.36 (`r0-b2-unwritten.jpg`) |
| 6d | UNWRITTEN backdrop : cloak ≥ 3 | **Deferred to P2.2** (not a sprite defect) | Measures 2.16 (two-shot) and 2.72 (B2) against the grey ruins trees. The cloak at 0.035 is darker than the mock's 0.075, so a gate-fog backdrop of ≥ 0.205 luma passes. The mock's gate sky was 0.446 |
| 7 | Palette, no warm hue, no black holes | **PASS** | Unit test: every pixel is in `NUL_PALETTE_SET` and the only warm pixels are gold. The cloak darkest is `#0e0a18` (ramp idx 1, only as the dither partner of idx 2 under the `clamp(l, 1.6, …)` floor), and there is never `#07050d` |
| 8 | Lore guard; Shade vs Nul at a 25% thumbnail | **PASS (reviewer 1)**, reviewer 2 pending | Bone mask, no mouth, no brows, one eye row with 5 slit px, no hood (unit test). `r0-thumb25.jpg`: at 1:1 25%, Nul reads as crown spikes + white oval + staff line at about 2× the Shade's height. The Shade reads as a hooded triangle with a lavender face. I named both correctly in all three thumbnails. **The second reviewer is the PO/orchestrator, from the same still (P3-6)** |
| 9 | Normals authored; the flip negates normal.x; the sun rim is on the same world side for both facings | **PASS** | 0.0% of opaque px use the default normal fill (all 22 frames). Mean normal.x on the outer 2 body texels, u 12–44: in-game facing (left) is **L −0.24 / R +0.91**, and the unflipped twin mirrors it (L −0.91 / R +0.24), so normals point outward in both facings. Grey-albedo, no-glow lighting probe at B2 (`r0-facings.jpg`): the warmer, brighter edge is **world-left in both facings** (sun from screen-left, behind). Facing left: L 0.271 / R 0.239. Facing right: L 0.674 / R 0.183. See note N1 |
| 10 | Glow | **PASS** | Mask glow = 0.25 × colour (±1), eyes and nib full emissive, cloak body 0 glow px (unit test) |
| 11 | Anims | **PASS** | 22 frames, one anchor, 0 px foot slide over idle, 3 `write` nib points ≥ 4 tx apart, `catch` palm out, `reach` hooked with a 1 px close on the pull (unit test plus `nul-strip.jpg` / `nul-frames.jpg`) |
| 12 | Hem | **PASS**, P3 on height | Pale page edge on the strips; **0** glyph px over the body in all 22 frames. Glyph max height is **11.5 tx** in idle 2/3 and write 2, and 10.5 elsewhere, vs ≤ 10 in the spec. The unit test allows 14. See F7 |
| 13 | Plate anchor | **PASS (sprite level)**; the HUD probe is R1's | `NUL_PLATE_Y_M` = 5.5625 m = crown + 1.0 m. Battle two-shot: plate y **107 px**, crown tip 178 px, mask top ≈ 235 px, so no overlap and 71 px of air. The max-FX readability probe needs the real stage plate (P2.2/P3.3) and moves to R1 |
| 14 | Art bar vs `poc/v2-boss-intro.png` at B2 (fov 21, bars 0.1) | **PASS (matches at sprite level; beats the floor on 2 of 3)**, with P2 polish | `r0-b2-vs-poc.jpg`. See "Art-bar judgement" below |
| 15 | Cost | **PASS** | 22 frames incl. canvases: **29–33 ms** (5 runs, Metal Chromium). Ward variant +43 ms (lazy, only built if `monster.nul.ward` is asked for). Texture memory: 96×92×4 B × 3 maps = 104 KB/frame, **2.2 MB per variant, 4.45 MB with the ward set** |

**Not in the checklist (waived).** The front/side/back turnaround views from §1.1 are design-reference views. No cue in the
prologue (interfaces §14, camera table §4) shows Nul from the front or back, and the P0.2 mock
`docs/prologue/nul-turnaround-palette.jpg` already documents them. Not required, and not even P3 unless a later chapter
needs them.

## Art-bar judgement (item 14)

- **Against the POC Golem intro.** The POC's richness is mostly its VFX: dust motes, crystal glow, title card, and the cave
  light. The sprite under it is a chunky block. Nul's sprite at the same framing is at least as iconic: a crisp silhouette,
  one bright focal shape (the mask), a gold accent (the crown band), and an emissive accent (the nib). **At the sprite level
  it matches.** The full shot will meet the bar once P2.2 gives it the gate backlight and P3 adds the intro VFX and the card.
- **Against the P0.2 floor** (`nul-intro-card.jpg`):
  - **Crown: crisper.** It now has a gold band and five distinct quills where the mock had a brown smear.
  - **Mask: smoother**, a clean oval with a soft cool shade. However, the Bayer term leaves a visible checker on the lower
    half at 6.5 px/tx. That is F3.
  - **Folds: not beaten.** The mock's cloak had several violet fold strokes. P2.1's cloak reads as a flat ink plane at B2:
    only 6.4% of cloak pixels reach ramp index ≥ 4. That is F2. It is P2, not P1, because it doesn't affect readability
    or the value rule. If anything, a flat dark mass helps both.
- **B2 framing problems.** These are not sprite defects, but they are visible in the hero shot:
  - At the §4.2 keyframe (y 2.9), the bottom bar already cuts the hem bottoms and half the nib (`r0-b2-vs-poc.jpg`,
    bottom-right crop), and the scripted tilt to y 3.1 pushes him about 19 px further down. That is F1.
  - On both test levels, a foreground-layer prop (the `ch1-l04` pillar, the `ch1-l05` bush) occludes his body at B2. That
    is F5.
- **Intro frame 3 (`eye: 2`).** The glow halos of the two slits overlap across the 2 px gap, and bloom turns them into one
  white-violet visor bar at B2. That loses the "two thin slits" read. That is F4.

## Fix list

There are no P1 fixes. Every item can be done by a Sonnet worker. "After" numbers are measured with the same method, at
`ch1-l04` e3 unless stated.

| id | prio | owner / file | change | target |
|---|---|---|---|---|
| F1 | **P2** (apply before the B2 camera is implemented) | `docs/vfx/prologue-art-direction.md` §4.2 (AD/orchestrator) and wherever the prologue B2 pose is coded (stage/cutscene owner) | B2 pose `y` 2.9 → **2.45**, tilt 2.45 → **2.65** (was 2.9 → 3.1). Keep fov 21, pitch 7, dist 18, bars 0.1 | At both ends of the tilt: nib core and hem bottoms ≥ 16 px above the bottom bar (y ≤ 632 at 720p) and crown tip ≥ 40 px below the top bar (y ≥ 112). Today the hem is cut at y 648 |
| F2 | **P2** | `apps/game/src/render/sprites/prologueArt.ts` cloak loop (lines 177–182) | Make the folds read. Widen the ridge band from `fold > 0.5 && fold < 0.72` to **`> 0.42 && < 0.76`**. Raise the ridge gain from `1.7 * (0.5 + 0.5·vv/42)` to **`2.3 * (0.55 + 0.45·vv/42)`**. Keep the trough at −1.2 and the clamp floor at 1.6 | Cloak px at ramp idx ≥ 4 in `idle[0]`: from ≈ 6% to **12–18%**. In-render STORM_GOLD two-shot mid-cloak mean ≤ **0.025** (now 0.015). Forehead : cloak ≥ **6.5** (now 7.74). Sprite luma ≥ 10:1 (now 11.7). Before/after B2 stills |
| F3 | P3 | `prologueArt.ts` mask (line 339) | Bayer amplitude on the mask from `(bayer − 0.5) * 0.9` to **`* 0.45`**, so the shade steps band instead of checkering | No isolated 1-px value flips inside the mask at B2. Mask : cloak unchanged ±0.3 |
| F4 | P3 | `prologueArt.ts` `slit()` (line 357, `pose.eye === 2`) | Limit the row halos to `x0..x1` (not `x0−1..x1+1`), and drop the inner end-cap glow (`R.g(x1 + 1, …)` on the far slit, `R.g(x0 − 1, …)` on the near slit), so the 2 gap columns between the slits get no glow | `intro[3]`: the glow alpha of the 2 gap px on the eye row is 0, and the B2 still shows two slits |
| F5 | **P2.2 acceptance** (not a P2.1 fix) | `apps/game/src/assets/levels/prologue.json` (P2.2 layout) | (a) Put the bright gate sky or fog directly behind Nul's upper body at the battle and B2 poses. (b) Keep every `foreground: true` prop out of Nul's B2 screen box (x 520–760 px at 1280, full height) | Re-run R0 item 6 in the Word Gate scene with these boxes: STORM_GOLD backdrop : cloak ≥ **3** (mock 13.4), UNWRITTEN backdrop : cloak ≥ **3** (mock 4.0). No fg prop overlaps Nul at B2 |
| F6 | P3 | `apps/game/src/render/sprites/prologueArt.test.ts` | Tighten the tests to the spec: cost `< 500` → **`< 60`** ms (now 33); hem glyph bound 14 → **10.5** (after F7); add a check that no glyph px has cloak on both sides within 3 px | Tests green with the spec numbers |
| F7 | P3 | `prologueArt.ts` hem glyphs (`u = vBase + age * 9 + lift * 0.4`) | `age * 9` → **`age * 7`** | Max glyph px u ≤ **10** in idle, cast, write, catch, reach and hurt (now 11.5). Intro and rise keep their lift |
| F8 | P3 | `prologueArt.ts` `finishRaw` | Outline-ring pixels get no normal (they stay `0,0,0,0`, which decodes to (−1, −1, −1)), so the ring catches the backlight in the grey probe. Write the outward silhouette normal (the `back()` rim normal mirrored per side) or a flat `128,128,255,255` for the outline pixels, flipped like the rest | In the grey probe, the outline ring is no brighter than the body edge. No visible change in the coloured render is expected (the albedo is `[10, 6, 20]`) |
| F9 | P3 | PO/orchestrator | Second-reviewer read of `r0-thumb25.jpg`: name Nul and the Shade | Two reviewers agree (closes item 8) |

**Notes**
- **N1 (item 9).** The bright violet back rim follows the sprite's back edge, by design (§1.3, 2 px back / 1 px front).
  - Its authored normals (|nx| 0.9, nz 0.35) make it the edge that takes most of the point-light rim term, so it is bright
    on whichever side the back is.
  - The *sun* contribution is world-consistent, as the grey probe shows.
  - In the only in-game facing (left, toward the hero), the hero-side edge gets a weak warm line: probe 0.27 vs 0.14 for
    the interior. That fits the value rule, so no fix.
- **N2.** In `UNWRITTEN` the in-render cloak (0.035) is darker than the mock's (0.075). That is good for the backdrop
  ratio. Watch it if the theft-ramp mid-steps (§2.3) ever blend toward a darker fog.

## Stills (`docs/qa/prologue-r0/`, all JPEG < 200 KB)

| file | what |
|---|---|
| `r0-b2-vs-poc.jpg` | POC Golem intro, P2.1 Nul at B2 (`intro[3]`, fg off), the P0.2 floor mock, a native-pixel crop, the same shot with the fg layer on (`ch1-l04` pillar) and the `ch1-l05` boss slot |
| `r0-facings.jpg` | both facings at B2, and the grey-albedo / no-glow lighting probe for each (item 9) |
| `r0-thumb25.jpg` | 25% thumbnails at 1:1 (lineup, two-shot, native mood, sprite sheet), plus a ×3 nearest-neighbour view of the first one for reading |
| `r0-lineup.jpg` | in-world lineup at 1280 (storm), native mood, UNWRITTEN, 1920×1080, and the P2.1 sprite sheet |
| `r0-twoshot-storm.jpg` | the item 6a/6b measurement frame (`ch1-l04` e3, STORM_GOLD battle pose) |
| `r0-twoshot-storm-boxes.jpg` | the same frame with the sample texels overlaid (green forehead, magenta mid-cloak, yellow crown-tip line, cyan plate-anchor line) |
| `r0-twoshot-storm-l05.jpg` | the repeat on the `ch1-l05` boss slot |
| `r0-twoshot-unwritten.jpg` | the item 6c/6d frame, UNWRITTEN battle pose |
| `r0-b2-unwritten.jpg` | B2 in UNWRITTEN (fg off) |

## Orchestrator follow-up (2026-10-10)
- **F9:** the orchestrator is the second reviewer. Nul and the Shade read as distinct in all three 25% thumbnails (bone mask, gold crown and staff against a hooded blob). Closed.
- **F1:** applied to `docs/vfx/prologue-art-direction.md` (B2 camera y 2.45 → 2.65).
- **F5:** forwarded to P2.2 (Word Gate) as acceptance criteria.
- **F2, F3, F4, F6, F7, F8:** go to the Nul sprite polish task, bundled with P2.3.

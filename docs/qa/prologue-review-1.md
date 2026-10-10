# R1 Prologue art review: "The Unwriting" on `main`

Reviewer: Art Director (Opus), 2026-10-11. Spec: `docs/vfx/prologue-art-direction.md` (P0.2), `docs/PROLOGUE_PLAN.md` §2/§4.5/§6
and the orchestrator notes at its end. Bar: `poc/v2-boss-intro.png`, `poc/v2-boss-battle.png`, the Ch1 sign-off deck
(`docs/qa/po-signoff/`) and the Ch2 review deck (`docs/qa/ch2-review-1/`).

**Build.** `main` at `c7bf394`, which includes P3.6 and interfaces v2.2.2.
**Capture.** Real Metal (M4 Pro, Chromium channel `chromium`, `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`) on port 5461, with a
fresh profile, then Start game and the real prologue session. Settings: `bot-seed=7`, `bot-acc=0.97`, wpm-bot 45 for the keyframe runs and 75
for the live Part C film strip. Part A and C frames were parked with `window.__play.proSeek(t)`. Part B was captured live, and Part C was also
filmed **live, un-parked**, one frame every 2 s, to judge pacing. Both runs were at 1280×720 and 1920×1080 and had 0 console errors.
The capture spec was temporary and is not committed; its method is the same as `apps/game/tests/app/prologueStills.metal.ts`.
**Numbers.** "Luma" is mean relative luminance (sRGB decoded, Rec.709). Contrast is WCAG `(L1+0.05)/(L2+0.05)`. Box coordinates are given
with each measurement so they can be re-run.

---

## 1. Verdict: **not PO-ready yet. One focused polish round (P4.2, both packages) plus R2 should get it there.**

The bones are right, and some of it is already good:
- The real-sim showcase works. All 6 actives cast in kit order, and 3–4 times each at 45 WPM.
- The deterministic timeline holds up.
- The six-step colour drain reads. Part C goes from gold to grey in clear steps (`00b`, `12`), and it is the strongest idea in the piece.
- Nul at the B2 intro, backlit in the gate arch, is iconic: mask : cloak **9.2 : 1**, backdrop : cloak **10.6 : 1** (`04`, `20`).
- The 1920 mask push with no HUD over it would be a sign-off frame (`22`).

But the prologue does not yet meet the "magnum opus" ask, for three reasons:

1. **The value structure is wrong.** Part A and Part B are a high-key beige haze. Their median luma is **4–10× brighter** than every
   reference boss frame, and they have a third as many true darks (§2). Against the POC and both chapter decks, the prologue looks the
   flattest scene in the game. That is the opposite of P0.2's "warmest, brightest **and** darkest-silhouette" direction.
2. **The money beats of Part C are small, quiet, or hidden.**
   - The theft streams are thin comets.
   - The power loss itself (the collapse and kneel) plays in a wide shot with white puffs over the knight's face.
   - The ember is a 6 px dot that floats 130 px below his hand.
   - The Grimoire bar covers both actors' bodies in the close-ups.
   - Combat leftovers (the Aegis bubble, rune circles, pops) leak into the cutscene.
3. **Pacing and continuity bugs undercut the story.**
   - Held lines freeze the whole frame for **18.5 s of the 74.2 s** of Part C.
   - The Word Gate's letters **light up again at 32.1 s**, right after "No more words."
   - The fog peak lands on the knight's "My words... are gone." close-up: body vs fog is **1.23 : 1**.

**How far off, by part.**
- **Part B: about 70% of the bar.** It is readable, lively and on-model, but washed out, and Nul is washed out under a Frost Lock lattice
  for most of the boss fight.
- **Part C: about 55%.** The story reads in outline, but the peaks don't land.

None of this needs new systems. Every item below is a parameter, placement, timing or gating change to code that already exists. The one
exception is overlay lines (§4), which is a small change to the cutscene player.

**11 P1 · 14 P2 · 7 P3.**

---

## 2. Side by side with the bar (`01`, `02`)

Whole-frame value statistics. Each frame was downsampled to 320×180. p5, p50 and p95 are luma percentiles. "dark" is the percentage of pixels with luma below 0.03.

| frame | p5 | **p50** | p95 | **dark** | mean sat |
|---|---|---|---|---|---|
| `poc/v2-boss-intro.png` | 0.000 | **0.051** | 0.527 | **41%** | 0.42 |
| `poc/v2-boss-battle.png` | 0.006 | **0.021** | 0.455 | **57%** | 0.58 |
| Ch1 `10-boss-real-tier4-prismatic` | 0.006 | **0.057** | 0.673 | **40%** | 0.55 |
| Ch1 `07-after-golem-intro` | 0.000 | **0.029** | 0.433 | **51%** | 0.50 |
| Ch2 `l10-p1` (Willow) | 0.007 | **0.041** | 0.331 | **42%** | 0.63 |
| **Prologue A 4.0 s crane** (1920) | 0.107 | **0.289** | 0.615 | **1%** | 0.53 |
| **Prologue B first Fireball** (1920) | 0.011 | **0.214** | 0.725 | **13%** | 0.53 |
| **Prologue B boss fight** (1920 `bp-10`) | 0.012 | **0.234** | 0.660 | **11%** | 0.49 |
| **Prologue B2 intro card** (1920) | 0.006 | **0.206** | 0.853 | **21%** | 0.51 |
| Prologue C swirl (UNWRITTEN) | 0.006 | 0.097 | 0.353 | 16% | 0.15 |

Reading:
- The references are **low-key**: dark mass with bright accents.
- The prologue is **mid-key everywhere**. The ground, the treeline and the stones are all lit to luma 0.2–0.3 by the warm ambient and the
  camera fill, and the fog haze lifts them further.
- So nothing "glows", and the spells read weaker than the same spells in Ch1 (compare `02` with Ch1's prismatic Fireball).
- Nul pays for it too. In the real battle framing his **mask : cloak is 4.3–4.5 : 1**, against P0.2's ≥ 6 target and R0's 7.7 in the test
  scene. His cloak reads mauve, not ink. Boxes on 1920 `bp-11`: mask `1212,477,33,33` → 0.38; cloak `1218,650,39,50` → 0.050.
- **Against `poc/v2-boss-intro.png` (B2 framing, `01`):**
  - The Nul sprite and silhouette **match or beat** the Golem.
  - The shot as a whole is **below** it: there are no letterbox bars, the tear is a pale lilac streak, the circle is Ch1 cyan, the card
    band crosses his torso, and the frame has no dark mass.

---

## 3. Backlog

Every item gives the moment, the problem as measured or observed, the files, the change, a target and the "before" stills
(`docs/qa/prologue-review-1/`). "WP-A" and "WP-B" are the two work packages in §5. Times are timeline ms unless marked "wall".

### P1: fails the PO ask, the art bar, or readability (11)

| id | moment | problem (measured / observed) | files | change | target | before |
|---|---|---|---|---|---|---|
| **P1-1** | A, B, C before the theft | **High-key haze, no dark mass** (§2). p50 luma is 0.21–0.29 vs 0.02–0.06 for the refs; dark px are 1–13% vs 40–57%. Nul in battle: mask : cloak is 4.3–4.5 | `assets/levels/prologue.json` (the segment `mood`), `render/biomes.ts` (`STORM_GOLD`, which must equal the json; the existing test pins it) | Re-grade storm-gold as a **low-key backlit dusk**. Starting values: `amb` × 0.55 → `[0.14, 0.11, 0.17]`; `gamb` × 0.5 → `[0.11, 0.065, 0.04]`; `fill` 0.45 → 0.30; `exposure` 1.0 → 0.88; `contrast` 1.15 → 1.30; `lift` → `[0.010, 0.004, 0.020]`; `vig` 0.56 → 0.68; `fog.x` 0.011 → 0.008. **Keep** `sunCol`, `rays` and the glow discs, because the sky inside the arch must stay hot. Then retune `UNWRITTEN` only if its R0 numbers drop | Part B battle frame (1920, `bp-10` timing): **p50 ≤ 0.10**, **dark ≥ 25%**, the arch opening p95 ≥ 0.6. Nul in battle mask : cloak **≥ 6**, backdrop : cloak ≥ 3. Hero silhouette ≥ 0.75 (the existing spec). UNWRITTEN mask : cloak and backdrop : cloak still ≥ 3. Readability probe on Part B: 0 violations | `02`, `21`, `25` |
| **P1-2** | B3 boss fight (about 57% of samples) | **The Frost Lock frozen lattice is a 5.7 m pale quad over Nul** (`SkillFx` lattice `w = max(2.4, height·1.25)`). In frozen frames, cloak luma is **+49% (lower cloak) to +116% (mid-cloak)** and mask : cloak is **2.85–3.38**. That breaks P0.2's P3 rule (≤ +10%). He reads pink and ghostly for most of the fight | `render/vfx/combat/SkillFx.ts` (the frozen lattice), gated so Ch1 and Ch2 are unchanged (for enemies taller than 3 m, or a per-def flag the prologue sets for `nul`) | For a tall boss, draw the freeze as a **ground frost ring plus a rim-only ice outline** that follows the sprite edge, with ice motes. Use no fill quad over the body, or cap the fill alpha so the cloak delta is ≤ 10% | Cloak luma delta frozen vs unfrozen **≤ +10%**. Mask : cloak while frozen ≥ 6 (after P1-1). Story-level `metal-ch1-unchanged` stays byte-identical | `05`, `21` |
| **P1-3** | C 0–20 s (mask push, knight flare, theft) | **The Part C Grimoire sits over the actors.** At 1080p its rect is about x 600–1320, y 688–876, so it covers Nul's whole torso in the mask push (the dialogue box covers his legs) and the knight's legs and sword in the flare | `hud/prologue/grimoire.ts`, `hud/prologue/geometry.ts`, `hud/prologue/PrologueHud.ts` | **Show the Grimoire only when it tells the story:** slide out at the catch (0–1.5 s, as the plan says), stay hidden through the line shots, then slide in at the ink line, in the **dialogue lane**. No line is on screen from 10.5 to 20.6 s, so that lane is free: the bottom 4–16% of H, centred, 1.25×. It goes away after `passivesDim` + 1.0 s. With overlay lines (§4) the HUD hides it while any line is up | Grimoire rect ∩ the projected hero and Nul sprite boxes = **0 px** at every Part C keyframe and line keyframe. It is visible for every theft beat | `07`, `22` |
| **P1-4** | C 0–54 s | **Combat state leaks into the cutscene.** (a) The Aegis bubble (`SkillFx` persistent bubble, from `barrierCharges`) wraps the knight from 0 to about 14 s and veils his "Your Silence ends here!" flare. (b) The hero's combo rune ring and Nul's cyan boss-intro rune circle stay to the last frame of the crane, as grey rings. (c) Part B damage pops and the PARRY! / BREAK tags are on screen during the catch | World: `render/vfx/prologue/attach.ts` / `PrologueFx.ts` (a new `enterCutscene()` that resets `SkillFx` persistent state, fades the `BossFx` circle and turns the `HeroAura` combo rune off), plus the one call in `level/session.ts` on `PrologueClimax`. HUD: clear pops and tags at the climax (`hud/hud.ts`, `hud/pops.ts`) | At the climax, bubble intensity goes to 0 within **300 ms**, both rune circles are gone by **1.5 s**, and pops and tags are gone by **300 ms** (the plan's 300 ms HUD fade) | `07`, `00a` (c01), `06` (13000) |
| **P1-5** | C 32.1 s → end | **The gate and runestone letters light up again.** `gateDarken` draws dark patches only while its cue is active (`dur 5600`). At 32.1 s every glyph returns: the arch, plus the "FIRE / WORD / HOPE" stones, which then glow white behind the knight in every close-up to the end. "No more stories. No more words." is contradicted for the last 22 s | `cutscene/timelines/prologue.ts` (gateDarken `dur` → to `UNWRITING_END_MS`, like `auraCollapse`); `render/vfx/prologue/cues.ts` (hold "fully carved" for `age ≥ total`, as a guard) | Keep the sweep's end state to the end of Part C | Gate and runestone glyph luma at 32.3, 40 and 52 s **≤ 1.1×** the carved cartouche around them. No lit glyph after the sweep | `09` |
| **P1-6** | C 20.0–21.5 s, **the power loss** | **The "loses all his power" beat plays small and muddy.** The camera is the dist-20 two-shot, so the knight is about 60 px tall at 720p. The collapse reads as white pixel puffs: no ring contraction and no pillar snap are visible. The `auraCollapse` grey smoke puff sits over the kneeling knight's head and chest. **That is the root cause of the "smeared kneel"**: the sprite is clean at 38 s (`10`, right) | VFX: `render/vfx/HeroAura.ts` (the collapse), `render/vfx/prologue/cues.ts` (smoke). Camera: `cutscene/timelines/prologue.ts` | **VFX:** the rings start at ≥ 3× hero width and contract to 0 (easeInCubic, 500 ms). The pillar narrows and snaps as a 2-frame white line ≥ 1.5 HDR. The blade gutters with 3 flickers. The smoke spawns **behind** the sprite (z −0.4), is ≤ 0.35 α inside the sprite rect, and is gone by 1.2 s. **Camera:** push in at 19.6 → 20.0 to `hx + 0.3, y 1.0, dist 13, pitch 6, fov 24`, then shake at the snap; the knight holds the frame through the kneel and the sword clang | Knight **≥ 22% of frame height** in the collapse shot. Ring contraction visible in ≥ 3 frames. Smoke covers **≤ 15%** of the knight's sprite pixels at 21.5 s | `08` |
| **P1-7** | C 13–20 s, **the theft** | **The theft is the cutscene's money shot, and it reads as six thin comets.** Each stream is one short orange/white/green streak, about 120 px at 720p. The arrival is a white-pink bloom blob **on the mask** (13.75–14.05 s), which breaks P3 and hides the eye flash. The knight doesn't react | `render/vfx/prologue/cues.ts` (`theftStream`), `render/vfx/prologue/params.ts`; the knight's recoil frame is an `actor` cue in `cutscene/timelines/prologue.ts` (WP-B) | **Departure:** a chest burst of the element colour (12 motes + a 0.6 m ring), and the knight recoils (1 frame). **Flight:** a continuous ribbon, 0.5 m head, 60–80 motes (tier 2: half), with the tail spanning **≥ 60%** of the bezier at mid-flight and a 2-strand twist. **Arrival:** a coloured ring wash around Nul's silhouette, with the eye slits going to `#f2d8ff`; cap the additive at **≤ 1.2 HDR inside the mask rect**. The shake per arrival stays | At mid-flight, **≥ 1,500 stream-coloured px at 720p** (sat ≥ 0.5 for beats 1–3). Mask luma during arrival rises ≤ **+15%**. Each beat reads in a 3-frame strip | `06`, `14` |
| **P1-8** | C 40–47 s, **the last spark** | **The ember isn't in the hand, and the shards don't read.** The HUD hand anchor is `hero + (0.5, 0.75 m)`, but the open palm of the `reach` pose sits about 0.45 m higher. At 1080p the ember centre is **130 px below the palm**, its core is **6 px** and its halo about 50 px. The world light doesn't visibly warm the knight. The returning "shards" are one dull 16 px brown icon (it reads as a nut), and Clean Cut is barely visible. The sword prop stands where the hand reaches, so the arm reads as gripping the crossguard | HUD: `hud/prologue/PrologueHud.ts` (`drawEmber`, `drawShardsReturn`), `level/session.ts` (hand anchor: a per-anim offset table from the hero `reach`/`kneel` frames). World: `render/vfx/prologue/cues.ts` (`ember` light), `assets/levels/prologue.json` (the `sword` anchor, 1.2 m behind the knight) | Anchor the ember on the palm texel of the current frame. HUD ember core **12 px** with a **90 px** halo at 1080p (scaled by H/1080), breathing. World point light 1.6 → 2.4, r 3 m, so it reads on the hand and face. **Shards:** the two starter icons at 40 px (1080p) with a warm 2 px rim and a falling trail from the tear point over ≥ 1.5 s. They land, then merge into the ember | Ember centre **≤ 8 px** from the palm at 42.5 and 44.0 s. Hand-box luma +0.04 from the light. Both shard icons recognisable at 1280 (a reviewer names Fireball and Clean Cut) | `11`, `24` |
| **P1-9** | B3 boss fight | **Damage pops and tags sit on Nul's mask** (the orchestrator ruling "pops must not sit on Nul's mask"). 1920 `bp-12`: a "39" pop is centred on the mask, "WEAK" sits on the crown, and "204" covers the chest | `hud/pops.ts`, `hud/hud.ts` (the pop anchor for the boss) | For Nul, anchor pops and tags at the cloak side away from the hero (x + 0.9 m, y 2.0–2.6 m). Add the projected mask rect (inflated 12 px) as a keep-out for pops and tags | **0** pop/tag rects intersecting the mask rect across the boss segment (ask the QA worker to add it to `prologue-fx`) | `05` |
| **P1-10** | C (all) and A 7.0 s | **Held lines freeze the picture, and Part C is 74.2 s wall vs 54.5 s planned.** Live film strip at 75 WPM: the timeline is frozen **18.5 s** across 7 holds (4.4 s: 2.1 + 3.3 s on one static mask shot; 7.5: 2.5; 23.0: 2.8; 26.5: 2.8; 37.0: 2.4; 44.0: 2.4). Consecutive frames 2 s apart differ by only **1.3–2.0%** of pixels: a still frame. Scripted VFX freeze with it. The gate sweep waits for the line to end, the heartbeat stops mid-rhythm, and the fog stays at its peak | `cutscene/{types,timeline,player}.ts`, `cutscene/timelines/prologue.ts`, `hud/prologue/dialogue.ts` | **Overlay (non-gating) lines plus a retime.** See §4 for the full proposal | Part C **≤ 58 s** wall at the minimum holds. **No shot static for more than 1.5 s** (frame diff > 3% per second). Each line on screen for ≥ its `lineHoldMs` | `12` |
| **P1-11** | C 36.0–38.0 s | **The knight disappears into fog on his key line.** The `silenceFog` density peak (0.03) lands on the close-up cut. At 37.0 s ("My words... are gone.") his darkest mass is **1.23 : 1** against the fog (boxes on 1280: body `520,480,150,40`, fog `420,320,70,100`). It is held there by the line freeze. At 38.2 s it is 2.81 : 1 | `render/vfx/prologue/cues.ts` / `params.ts` (`silenceFog` ramp), `PrologueFx.ts` (`out.fogDensity`) | Peak the fog **during the wide** (31–34.5 s), back to 0.016 by the close-up cut. Fog cards fade out within 6 m of the camera | Knight body vs fog **≥ 2.5 : 1** from the close-up cut onward. Hero silhouette ≥ 0.75 | `10` |

### P2: below the bar, or a weak cue (14)

| id | moment | problem | files | change | target | before |
|---|---|---|---|---|---|---|
| P2-1 | A 2.5–5.5 s crane | The knight is about 11% of frame height in the bottom-left, the gate is cut by the top-right corner, there is **no sky** in frame, and a blurred dark-violet foreground block sits at bottom centre and reads as a hole | `cutscene/timelines/prologue.ts` (camera); `assets/levels/prologue.json` (the fg block near the road start) | 2.5 s: `x hx − 4, y 3.2, dist 26, pitch 14, fov 32` pushing to `x hx − 1, dist 22, pitch 12`. Remove or move the fg block out of the crane frustum | The whole arch in frame with ≥ 20% sky above it. Knight ≥ 14% of H at 4.0 s. No fg prop in the centre third | `03`, `25` |
| P2-2 | A 5.5–7.0 s | "The sky above the gate darkens and ink drips **upward**" isn't on screen: there is no sky in frame, and only the ground pools show | `render/vfx/prologue/cues.ts` (a new sub-effect of `inkRise` or `skyTear`: a top vignette dip plus 30 upward ink streaks above the arch); timeline cue | After P2-1 frames the sky, darken it over 1.0 s (post `vignetteBoost` + 0.15, top-weighted) and add ink streaks rising into it | Top-third luma −30% at 7.0 s vs 5.0 s. The streaks read at 1280 | `03` |
| P2-3 | B2 boss intro | The tear is a pale lilac streak lost in the sun. At 0.5 s the frame is empty ground; by 1.8 s Nul is already standing, with no "steps out" beat. There are **no letterbox bars** (spec 0.1). The rune circle is **Ch1 cyan**. The card band (y 385–535 at 720p) crosses his torso | `render/vfx/prologue/cues.ts` (`skyTear`: dark lens α 0.85, 3.0 m wide, edge ≥ 2.0 HDR, 6 arcs visible), `render/vfx/combat/BossFx.ts` (circle colour per boss: Nul `#8a6cff`), `hud/banners.ts` (card cy for the prologue / a tall boss → **0.84 H**), `level/stage.ts` (prologue B2 letterbox) | Open the tear in frame from 0.0 to 0.6 s. Nul's `intro` lift starts **inside** the tear mouth at 0.6 s and lands at 1.6 s, and the card follows at 1.8 s | Tear lens luma ≤ 0.5× the sky around it. Bars 0.1. Card rect ∩ Nul's sprite ≤ the hem rows only. Re-grade against `poc/v2-boss-intro.png`: "matches or beats" | `04`, `20`, `01` |
| P2-4 | B surge ×16 | The max-surge aura looks like ×1: the same orange ground ring plus a few sparks. The gold under-pillar is not visible | `render/vfx/HeroAura.ts` (prologue surge path) | At ×8 and above, the gold under-pillar reaches ≥ 1.2 HDR and ≥ 1.6× hero height. Rings ×1.4. Embers 30/s. Ring pulse on each doubling | A reviewer can tell ×16 from ×2 in a thumbnail. The plate readability probe is still green | `14` (left) |
| P2-5 | C 7.5 s knight flare | "Aura flares to tier 4 (sunburst plus orbit stars)" reads as blue rays behind the Aegis bubble | `render/vfx/HeroAura.ts`, `render/vfx/prologue/cues.ts` | After P1-4: sunburst rays ≥ 2× hero height, 6 orbit stars, and a 0.15 flash at the raise | It reads as a power-up in one frame | `07` (right) |
| P2-6 | C 0.3–1.9 s catch | The Fireball is a fuzzy glow at the staff, not frozen in an **open palm**. The orange → grey → crumble isn't legible | `render/vfx/prologue/cues.ts` (`catchFireball`), the timeline's 160 ms hit-stop | Put it on the `catch` palm point (cx + 25, u 41 → world) at 1.4× size. Show 6 visible crack slivers at 1.1 s and 22 grains falling | The palm, the fire, the grey and the crumble each read in a 4-frame strip | `14` (middle), `00a` |
| P2-7 | C 23–31 s colour swirl | It reads as **fairy lights**: one ring of small dots on his chest | `hud/prologue/swirl.ts` | Use the full cloak trapezoid (not a chest ring). Make the cores 5 px at 1080p, with 6-sample trails and halos on every 2nd mote. Slow spirals that cross, with a gentle pulse when he speaks | The swirl covers ≥ 45% of the cloak area. At a 25% thumbnail it reads as "stolen colours inside him" | `13`, `23` |
| P2-8 | C 31–35 s rise / vortex / tear | The tear is a white column inside the arch, and the vortex letters can't be read at dist 30. The `rise` frame has baked faint glyphs on the cloak (orchestrator note b: confirmed). White puffs ring him | Camera: `cutscene/timelines/prologue.ts` (31.0: dist 22, y 3.6, pitch 14). VFX: `render/vfx/prologue/cues.ts` (vortex letters 1.0 m with a violet underlay; tear close with the dark lens as P2-3). Sprite: `render/sprites/prologueArt.ts` (rise frames: hem glyphs only beside the cloak, as R0 F7) | — | Vortex glyphs ≥ 12 px tall at 720p. No glyph px inside the cloak silhouette | `13` |
| P2-9 | B (all) | The **"FIRE" runestone** sits directly behind the first plate row. The "FIREBALL" skill label collides with its vertical "FIRE" glyphs (b1). That is glowing text competing with typed text | `assets/levels/prologue.json` (runestone.0 x −3 m) or `render/vfx/prologue/cues.ts` (runestone emissive 1.0 during Part B) | Keep emissive glyph columns out of the plate band | No world glyph > 1.0 HDR within 40 px of a plate rect (K2) | `00a` (b1), `21` |
| P2-10 | B1 | Encounter-1 crowding: the first Shade stands about 1 m from the knight's sword, so a Fireball has no flight path. The first Fireball's only visible element 150 ms in is a spark **behind** the knight | `assets/levels/prologue.json` (encounter 1 slots + 1.5 m x) | — | The first Fireball is visible in flight for ≥ 3 frames at 60 Hz | `00a` (b1) |
| P2-11 | B3 | **The knight is never hurt.** HP is 871/871 in every boss sample, so Mending Light heals nothing and Last Stand never lights. The beat "his hush bolts hurt" (plan §2 B3) is missing. Passives seen: 6 (no Last Stand) | `packages/content/src/data/prologue.ts` (**orchestrator / content, not WP-A/B**) | One scripted unblockable heavy hush bolt early in the boss segment (the P1.3 ruling), taking the knight to about 45% | Mending Light heals on screen. Last Stand triggers in the 40 WPM persona | `21` |
| P2-12 | B, C | The passive row is 2-letter chips ("CC SH IW…"), not pixel icons (orchestrator note confirmed) | `hud/prologue/grimoire.ts`, `hud/skillIcons.ts` (additive) | 12×12 pixel icons in the theft palette | The passive row reads without letters | `22` |
| P2-13 | C 47–52 s | The end caption "Find your words again." crosses the knight's head in the first half of the crane | `hud/prologue/PrologueHud.ts` (caption y) | Caption at 0.22 H while an actor box intersects 0.5 H ± 60 px | Caption rect ∩ actor boxes = 0 | `00b`, `11` |
| P2-14 | C 23–34 s | The wide shots are too wide for this sprite scale (dist 30): Nul becomes about 80 px tall at 720p while he says his two biggest lines | `cutscene/timelines/prologue.ts` | 26.5 wide: dist 30 → 24, and the gate stays in frame | Nul ≥ 18% of H on both of his lines | `12`, `13` |

### P3: polish (7)

| id | moment | note | files |
|---|---|---|---|
| P3-1 | B hush bolt | A 1.5 m violet head on a thin lance. It reads, but small next to the kit | `render/vfx/prologue/cues.ts` |
| P3-2 | C 10.5 s ink line | Renders as a gold serif title (with a violet trailing "U"), not "ink calligraphy". Fine as is; consider an ink-black fill with a violet edge | `hud/prologue/ink.ts` |
| P3-3 | close-ups | R0 F3/F4 (the mask dither checker and the eye-slit glow merge) are visible at the mask push | `render/sprites/prologueArt.ts` |
| P3-4 | B | The "? ?" intent chips and shield pips under every grunt are noise in a new player's first minute (orchestrator note). Hide the leak badge / intent chips in prologue mode | `hud/hud.ts` |
| P3-5 | C dialogue | The box is 1200×130 px at 1080p for one-word lines, and it alternates sides per shot. Consider width-to-fit (min 40% W) | `hud/prologue/dialogue.ts` |
| P3-6 | C (all) | The knight's face is a white blob in the UNWRITTEN close-ups. A 1-step darker skin ramp would help, but only in UNWRITTEN | `render/sprites/proceduralArt.ts` (additive) — later |
| P3-7 | dev | `?scene=prologue&part=cutscene` still plays the old test timeline (orchestrator note). Not art; route it to `UNWRITING_TIMELINE` | `dev/prologueScene.ts` |

### The orchestrator's notes: confirmed or rejected

| note | R1 |
|---|---|
| (a) Weak skyTear open, inkWrite sparks, catch crumble, grey theft ribbons; the collapse is white puffs | **Confirmed:** P2-3, P3-2, P2-6, P1-7, P1-6. Correction: the ribbons aren't grey for beats 1–3. They are coloured but thin. They are grey after step 3 by design (P0.2 rule P4) |
| (b) Nul floats at the top of the gate; an "OH" glyph on the cloak during the vortex | The float is the intended `rise`. **Baked glyphs on the rise frame: confirmed** (P2-8) |
| (c) Orbiting letters bunch next to the guard plate | **Not reproduced** on the real session at 45 or 75 WPM (15 Part B samples each). Left to the QA probe |
| "50%" leak badge on every grunt; GOLD 0 | Gold is hidden (closed). The intent/leak chips are still there: P3-4 |
| The Part C Grimoire covers the hero's legs | **Confirmed, and worse:** it also covers Nul's torso. P1-3 |
| Passives are 2-letter chips | Confirmed: P2-12 |
| The ember core is tiny | Confirmed, and it is misplaced: P1-8 |
| Part C is 74 s | **Confirmed: 74.2 s wall**, with 18.5 s frozen. P1-10 |
| The theft and collapse are quiet | Confirmed: P1-7, P1-6 |
| The kneeling hero looks smeared | Confirmed. **Root cause: the collapse smoke over the sprite**, not the kneel art. P1-6 |
| The `a1` crane: tiny knight, too much green, gate in a corner | Confirmed: P2-1 (the green goes with P1-1) |
| The max-surge aura is weak | Confirmed: P2-4 |
| The returning shards read faint | Confirmed: P1-8 |
| The dev route plays the old timeline | Confirmed: P3-7 |

**New in R1:** P1-1 (the grade), P1-2 (the frost lattice), P1-4 (combat leftovers), P1-5 (the gate re-lights), P1-9 (pops on the mask),
P1-11 (the fog close-up), P2-11 (the knight is never hurt).

---

## 4. Pacing: the recommendation

**Measured (live, 75 WPM, un-parked):**
- Part A: **10.7 s** wall (8.0 s timeline + a 2.8 s hold).
- Part B: **50.0 s** at 75 WPM and **52.3 s** at 45 WPM. The boss segment is floored at 20 s by `bossMinS`, as ruled.
- Part C: **74.2 s** wall for 54.5 s of timeline.
- Total: **about 2:15.**

**Why Part C runs long.** A `line` cue stops the whole timeline clock. The seven Part C holds add up to **19.1 s** at the minimum reading time
(`max(2.2 s, 1.2 s + 60 ms × chars)`). The cost isn't only length. Every hold is a **freeze-frame**, because the camera, the scripted VFX
and the fog all run on that clock:
- the gate sweep waits until "No more words." is gone;
- the heartbeat stops between beats;
- the fog sits at its peak over the knight's line (P1-11);
- the mask push sits still for 5.4 s.

**Recommendation: overlay (non-gating) lines, plus a retime to about 58 s.** I prefer this to camera eases that keep running during lines.

1. **Engine** (`cutscene/types.ts`, `timeline.ts`, `player.ts`):
   - `line` gets `mode?: "gate" | "overlay"`, defaulting to `"gate"` so the existing tests and other timelines are unchanged. The
     prologue uses `"overlay"` everywhere.
   - An overlay line starts the HUD dialogue at its `at` and keeps its own line clock. The timeline clock never stops.
   - Space/Enter fades the line out early. It skips nothing.
   - `validate()` gets a rule: each overlay line's window `[at, at + lineHoldMs]` must not overlap the next line. That guarantees the
     minimum reading time by construction, so slow readers get exactly what they get today.
   - The 1.5 s input guard and "letters never advance" stay.
2. **Every shot that carries a line gets a creep:** fov −1.5° or dist −0.8 m over the line, so no frame is static for more than 1.5 s.
3. **Retimed Part C.** Each line sits *inside* its shot, and the line and its visual happen together:

| t (s) | beat |
|---|---|
| 0.0 | catch, hit-stop 160 ms, the Grimoire slides out (P1-3) |
| 1.5–4.4 | mask push. **3.0 "Enough."** (→ 5.2) |
| 5.3 | **"Your words are bright, little knight."** (→ 8.7), with the camera creeping to fov 17.5 |
| 8.6–9.8 | cut to the knight, raise, flare at 9.6. **9.9 "Your Silence ends here!"** (→ 12.5) |
| 12.0–13.2 | two-shot, swell 12.3. **13.2 ink line** (1.54 s write + 1.2 s hold → 15.9), the Grimoire slides into the dialogue lane |
| 16.0–23.2 | the six theft beats, 1.1 s apart (the arrival of beat 6 is at 22.4), with the dolly |
| 22.8–23.2 | push in to the knight (P1-6). **23.2 collapse**, 24.0 kneel, 24.1 clang, Grimoire out |
| 24.9–26.0 | Nul close. **26.0 swirl on + "Now the world will be quiet."** (→ 28.9) |
| 28.6–31.0 | pull back (dist 24, P2-14). **31.0 "No more stories. No more words." together with `gateDarken`** (31.0 → 35.9): the words go dark *while* he says it |
| 36.0–39.9 | rise, vortex, tear close, boom at 39.8. The fog peaks here (P1-11) |
| 39.5–41.0 | knight close, heartbeat from 40.0. **41.0 "My words... are gone."** (→ 43.5) |
| 43.6–45.8 | reach, the shards fall from the tear (P1-8). **45.8 ember**, chime, spark motif 46.4 |
| 47.8 | the hand closes. **"No. One spark is left."** (→ 50.3) |
| 50.3–56.3 | stands, sword out 51.5, walk 52.7, crane up and away, caption 50.3–55.8 |
| 56.3–57.8 | fade to black, `sparkEnd` |

   The result is **57.8 s**: 3.3 s over the plan, 16.4 s shorter than today, and with no freeze-frames. Part A moves its line to 5.8 s
   (during the settle), which gives **8.0 s**. `PART_C_KEYFRAMES` and `prologueStills.metal.ts` move with the new times.

**The alternative, rejected:** keep gating, but put the camera and VFX on a second "world" clock that runs during holds.
- It keeps the 74 s length.
- It splits every cue into a world part and a story part (the gate sweep, the heartbeat, the fog, the swirl).
- It breaks the "the frame at t is a pure function of t" property that the stills and the R2 pack depend on.

---

## 5. Work packages (Sonnet, run **in sequence**: WP-A, then WP-B)

They share the keep-out plumbing (`PrologueFx.keepOutRects` ← `PrologueHud` rects), the frame boxes, and `level/session.ts`. WP-B starts
on WP-A's merged `main`. **Neither package touches** the QA worker's files (`apps/game/tests/perf/prologue*`,
`apps/game/tests/level/prologue-fx*`) or the balance task's paths. `packages/content/src/data/prologue.ts` (P2-11) is the orchestrator's to
assign.

### WP-A: VFX and world (first)
**Owns:**
- `apps/game/src/assets/levels/prologue.json` (mood, fg prop, slots, runestone x, `sword` anchor)
- `apps/game/src/render/biomes.ts` (the `STORM_GOLD` / `UNWRITTEN` constants only)
- `apps/game/src/render/vfx/prologue/**`
- `apps/game/src/render/vfx/HeroAura.ts` (prologue-gated paths)
- `apps/game/src/render/vfx/combat/SkillFx.ts` and `BossFx.ts` (gated: story levels byte-identical)
- `apps/game/src/render/sprites/prologueArt.ts` (rise frames, R0 F3/F4)
- `apps/game/src/level/session.ts`: **only** the `PrologueClimax` → `PrologueFx.enterCutscene()` call and the fog wiring

**Items:** P1-1, P1-2, P1-4 (world half), P1-6 (VFX half), P1-7, P1-8 (world light, sword anchor), P1-11, P2-2 (VFX), P2-3 (tear, circle colour),
P2-4, P2-5, P2-6, P2-8 (VFX and sprite), P2-9, P2-10, P3-1, P3-3.

**AC:**
- Before/after Metal stills at the same `proSeek` times at 1280 and 1920 for every item, with the §3 numbers re-measured using the
  same boxes.
- `metal-ch1-unchanged` byte-identical.
- Part B readability probe 0 violations (run the QA worker's `prologue-fx` once it has merged).
- Part B and C p95 ≤ 16.8 ms at tier 0.
- `scripts/check.sh` green.

### WP-B: UI, HUD and timeline (second)
**Owns:**
- `apps/game/src/cutscene/{types,timeline,player}.ts` + tests, `cutscene/README.md`
- `apps/game/src/cutscene/timelines/prologue.ts` (+ its test)
- `apps/game/src/hud/prologue/**`
- `apps/game/src/hud/{pops,hud,banners}.ts` (prologue-gated changes only)
- `apps/game/src/hud/skillIcons.ts` (additive)
- `apps/game/src/level/session.ts` (the hand anchor, overlay-line routing)
- `apps/game/src/level/stage.ts` (prologue B2 letterbox)
- `apps/game/src/dev/prologueScene.ts`
- `apps/game/tests/app/prologueStills.metal.ts` (new keyframe times)

**Items:** P1-3, P1-4 (HUD half), P1-5, P1-6 (camera), P1-7 (knight recoil cue), P1-8 (HUD ember, shards, hand anchor), P1-9, P1-10 (overlay lines and
the §4 retime), P2-1, P2-2 (cue), P2-3 (card, bars), P2-7, P2-8 (camera), P2-12, P2-13, P2-14, P3-2, P3-4, P3-5, P3-7.

**AC:**
- The cutscene Node tests: an overlay line never stops the clock; `validate` rejects overlapping overlay lines; gate mode is unchanged.
- Part C **≤ 58 s** wall live, with no static span over 1.5 s (a frame-diff strip like `12`).
- A dialogue keep-out probe at the new line keyframes.
- A regenerated 16-keyframe contact sheet.
- `scripts/check.sh` green.

---

## 6. Top 5 changes for the most "wow"

1. **Re-grade the Word Gate to a low-key backlit dusk (P1-1, with P1-2).** It is the cheapest change with the biggest effect. Every spell,
   every glyph and Nul's mask start to glow, and the later drain to grey finally has a dark, rich "before" to lose.
2. **Make the theft the money shot (P1-7 + P1-3):**
   - thick element ribbons torn out of the knight's chest, and he recoils;
   - each ribbon lands as a colour wash into Nul;
   - the matching Grimoire icon shatters in the free dialogue lane on the same beat;
   - six steps down in pitch and in colour.
3. **Let the fall land (P1-6 + P1-10):**
   - push in on the knight for the collapse, with the rings imploding, the pillar snapping, the blade guttering, and a kneel with
     nothing over his face, then silence;
   - with overlay lines the whole cutscene flows like a film instead of stopping on still frames.
4. **A real entrance for Nul (P2-3):** a dark violet tear with crackling edges that he steps out of, letterbox bars, a violet circle, and the
   name card under his hem. The intro is already the best frame in the prologue, and it can beat the POC.
5. **The last spark (P1-8 + P1-5 + P1-11):**
   - the world stays dark and the gate stays carved;
   - the knight stands out of the fog;
   - two readable shards fall from where the tear closed, into his open palm, and become an ember that lights his hand and face: the
     only warm light on screen.

---

## 7. Stills (`docs/qa/prologue-review-1/`, JPEG < 200 KB)

| file | what |
|---|---|
| `00a-keyframes-A-B-C1.jpg`, `00b-keyframes-C2.jpg` | the 16 plan §6 keyframes. A, B and C at 1280 and 1920 (B from the real session; b4 is P3.6's max-surge still). C 11.5 is a live frame, because the HUD ink line doesn't render under a parked seek |
| `01-intro-vs-poc-ch1.jpg` | `poc/v2-boss-intro.png` · Ch1 golem intro (sign-off deck) · prologue B2 at 1920 |
| `02-value-structure-vs-decks.jpg` | top: POC battle, Ch1 boss, Ch2 Willow. Bottom: the prologue boss fight, first Fireball, A crane (§2 numbers) |
| `03-partA-crane-ink.jpg` | A 2.6 s, 4.0 s, 6.6 s, 7.0 s (P2-1, P2-2) |
| `04-boss-intro-sequence.jpg` | B2 at 0.5 / 1.8 / 3.2 s (P2-3) |
| `05-nul-frost-lattice-wash.jpg` | 1920 crops: unfrozen (`bp-11`) vs frozen with pops on the mask (`bp-12`) (P1-2, P1-9) |
| `06-theft-beat-1-strip.jpg` | theft beat 1, 13.0–14.2 s every 150 ms: comet, mask glare, leftover pops (P1-7, P1-4) |
| `07-partC-grimoire-overlap.jpg` | 1920 mask push and knight flare: the Grimoire over the actors, the Aegis bubble (P1-3, P1-4, P2-5) |
| `08-collapse-kneel.jpg` | 20.3 / 20.8 s collapse and a 2× crop of the 21.5 s kneel under smoke (P1-6) |
| `09-gate-relights.jpg` | 31.9 s (carved) → 32.3 s (all lit again) → 52 s (still lit) (P1-5) |
| `10-fog-knight-closeup.jpg` | 36.0 and 37.0 s (1.23 : 1) vs 38.2 s live (2.81 : 1) (P1-11) |
| `11-shards-ember.jpg` | 1920 crops: the shard icon, the ember 130 px under the palm, and the 44 s line frame (P1-8) |
| `12-held-lines-freeze.jpg` | live frames: 3.9 → 4.4 → 4.4 → 4.4 s (5.4 s on one shot) and 25.2 → 26.5 → 26.5 → 28.3 s (the gate waits for the line) (P1-10) |
| `13-swirl-rise-vortex.jpg` | 31.8 s rise, 33 s vortex, 23 s swirl (P2-7, P2-8) |
| `14-surge-catch-arrival-glare.jpg` | max surge (P3.6 still), catch at 0.3 s with pops, theft-3 arrival glare (P2-4, P2-6, P1-7) |
| `20`–`25` `-1920-*.jpg` | 1920 singles: boss intro, boss fight, mask push, colour swirl, ember, A crane |

## Orchestrator rulings (2026-10-11)
- **Pacing:** overlay (non-gating) lines are approved, as `mode?: "gate" | "overlay"` on the line cue (client-only, interfaces v2.2.3). WP-B implements it.
- **P2-11 (the knight is never hurt in the boss fight):** deferred to the backlog. Content alone can't make a strike unblockable (P1.3 found this), and the v2.2.1 show-heal already makes Mending Light cast. Never being hurt fits the power fantasy; Last Stand not triggering is acceptable.
- **WP-A also owns the P4.1 hitch:** pre-warm the prologue VFX and HUD before `startPlay` (first Part B frames: 50 ms at tier 0, 133 ms at tier 2 with 4× throttle).
- **WP-A merged (2026-10-11).** Left over for WP-B:
  - **P1-5:** `gateDarken` `dur` runs to the end of Part C.
  - **P2-10:** move `WORD_GATE.slots` together with `enc1.slot0–2` in `prologue.json`.
  - **P1-8:** the HUD ember and shards land in the palm.
  - **P1-6:** the camera push-in.
  - **P1-7:** the recoil.
  - **P2-3:** the card, bars and Nul lift.
  - **New regression from the re-grade (orchestrator):** in Part B the knight is a near-black silhouette and his face is unreadable (`docs/qa/prologue-p4.2a/p1-1-grade-boss-fight.jpg`, bottom-right). Add a prologue-gated warm hero fill or rim light (stage) so his face and cape read. Target: hero face luma ≥ 0.25 and silhouette ≥ 0.75.
  - **Still short:** mask:cloak 5.3 (target ≥ 6), fog vs knight 1.6 (target ≥ 2.5). R2 judges these.

---

## R2 (Art Director, 2026-10-11): final review on `main` after WP-A and WP-B

**Build.** `main` at `0a52734` (WP-B merged, interfaces v2.2.3).
**Capture.** My own run on real Metal (Apple M4 Pro, ANGLE Metal, channel `chromium`), port 5487, fresh profile, then Start game into the real
prologue session, at **1920×1080 and 1280×720**. Settings: `bot-seed=7`, `bot-acc=0.97`, wpm-bot 45. A and C frames are parked with
`__play.proSeek(t)` at the WP-B times; Part B is live, sampled every 0.7 s through the boss fight (30 frames per size), plus a 9 WPM run for
the ×16 surge. 0 console errors in every session. The capture spec was temporary and is not committed; it is `prologueWpbStills.metal.ts`
plus a per-frame probe of the projected Nul, knight and face points, the mask rect and the pop rects.
**Re-run on this build:**
- `prologueFullRun`: A **7.9 s**, B **53.3 s** (40 WPM), C **57.6 s**, 0 console errors, 0 in-app errors.
- `prologue-fx` (Metal): **0 violations** at 40 and 90 WPM. Min next-letter ring/cell contrast is 4.19/6.50 at 40 WPM and 4.19/5.63 at
  90 WPM. Dialogue contrast min is 9.08. 160 and 146 mask samples.
- `pnpm bot --prologue`: BOT PASS.

**Method for the numbers.** Same luma and WCAG contrast as R1. Because Nul and the knight move in live frames, the boxes come from the
projected sprite anchors rather than fixed pixels:
- **Mask:** the largest bone-grey blob (sat < 0.42) in Nul's head region.
- **Cloak:** a 0.1 h box, 0.42 h below the mask centre.
- **Knight face:** a 24×28 px box (at 1080p) on the projected face point.
- **Fog:** the open fog to the knight's right, at body height. The knight's "body" is the p20 of his sprite box.

### R2.1 Verdict: **ready for PO.** No P1 is open and there are no blockers.

All 11 R1 P1s are closed, and so is the hero-dark regression. Of the two numbers that were still short after WP-A:
- **Knight vs fog** now passes clearly (3.0 : 1).
- **Mask : cloak** meets the R1 target the way R1 measured it, on the lit face (6.0–6.7). Over the whole mask it is 4.5–5.1, because the
  mask is matte bone-grey and not luminous. That is a polish item (R2-P2-a), not a failure: the cloak is now true ink (luma 0.010, which was
  0.050 in R1), and the silhouette reads at a glance in every boss frame.

Against the bar:
- **Part B:** about 70% → **about 90%.** The value structure is now low-key, every spell glows, Nul reads as ink, and the knight's face reads.
- **Part C:** about 55% → **about 90%.** The theft, collapse, kneel, swirl and last spark are now real shots, it flows as one 57.6 s film with
  no freeze-frames, and the gate stays dark.
- **B2 intro vs `poc/v2-boss-intro.png`:** it matches the POC on silhouette, card and value: p50 0.024 vs 0.052, dark px 52% vs 41%. It is
  below the POC on the tear, which is still a white/lilac column rather than a dark lens, and on ambient particles. See the pack's `02`.

What's left are P2/P3 polish items for the backlog (R2.3). Per the PO's 2026-10-10 ruling, art does not block the milestone.

### R2.2 R1 P1s and the regression: closed or open, with numbers

| id | R1 target | R2 measurement (Metal, this build) | status |
|---|---|---|---|
| **P1-1** grade | Part B p50 ≤ 0.10, dark ≥ 25%, arch p95 ≥ 0.6, mask : cloak ≥ 6 | Boss fight (30 frames, 1920): **p50 0.064–0.102** (median 0.093). **Dark px 23–39%** (median 24.2%; first Fireball 26.8%). The arch opening is still the hottest area (frame p95 0.51–0.75). Mask : cloak: see the row below | **closed.** Dark px sits about 1 pt under the target in the boss framing, after the WP-B hero fill light. That is a P3 note, not visible as haze |
| mask : cloak (still short after WP-A) | ≥ 6 | **Lit face (p80 of the mask blob): 6.43 unfrozen / 6.04 frozen at 1920, and 6.73 / 6.52 at 1280.** Whole-mask median: 4.64 / 4.51 at 1920, 4.89 / 5.11 at 1280. Cloak luma median **0.0104** (R1: 0.050) | **closed** on R1's method. The matte mask goes to the backlog as R2-P2-a |
| **P1-2** Frost Lock wash | frozen cloak delta ≤ +10% | Cloak median **0.0103 frozen vs 0.0104 unfrozen** at 1920 (12 vs 17 frames), and 0.0094 vs 0.0104 at 1280: **−1% / −10%**. The ice is rim-only (`03`, `bp-23`) | **closed** |
| **P1-3** Grimoire over actors | 0 px overlap | It shows only from 13.2 to 23.8 s, in the bottom lane. In every theft frame (16.4–22.5 s) it is clear of both actors at 1920 and 1280. WP-B probe: 0 px² | **closed** |
| **P1-4** combat leftovers | bubble, rune circles, pops gone at the climax | C 0.3 and 1.2 s: no Aegis bubble, no rune circle, no pops or tags at either size | **closed** |
| **P1-5** gate re-lights | glyph ≤ 1.1× carved after the sweep | The gate and runestones are dark at 34.0, 36.3, 41.5 and 54.0 s. No lit glyph after the sweep | **closed** |
| **P1-6** power loss | knight ≥ 22% H, ring visible, smoke ≤ 15% | Push-in: the knight is about 38% of H at 23.3–24.5 s, and the ring is visible. Face and chest are clear of smoke at 23.6 and 24.0. A few white cube puffs remain at the sides | **closed.** The puffs are P3 (R2-P3-b) |
| **P1-7** theft money shot | thick coloured ribbons, recoil, no mask glare | Each beat is a chest burst in the element colour, a thick ribbon to Nul, and a ring wash on him. Beat 1 (16.4 / 17.0 s) is an orange Fireball ribbon with an orange ring on Nul. The matching Grimoire icon empties on the beat, the knight recoils, and the eye slits stay visible. Beat 3 (18.9 s) has a green burst but a near-white ribbon: it is the Slash Wave colour, though R1 asked for sat ≥ 0.5 on beats 1–3 | **closed.** The beat-3 ribbon tint is P3 (R2-P3-c) |
| **P1-8** ember / shards | ember ≤ 8 px from the palm, shards readable | Ember in the open palm at 46.5 s and at the closed hand at 48.5 s (WP-B: 1 px). The Fireball shard is readable falling at 44.8 s | **closed** |
| **P1-9** pops on the mask | 0 | **0 pop/tag rects on the mask** in my 59 boss frames (1920 + 1280), plus `prologue-fx` 306 mask samples | **closed** |
| **P1-10** pacing | C ≤ 58 s, no static span > 1.5 s | Re-run: A **7.9 s**, C **57.6 s**. WP-B film strip at 75 WPM: 0 static seconds, minimum diff 4.6%/s | **closed** |
| **P1-11** knight vs fog (still short after WP-A) | ≥ 2.5 : 1 from the close-up | **2.93 at 40.5 s, 3.06 at 41.5 s ("My words... are gone."), 3.06 at 43.0 s, and 2.96 at 46.5 s.** The fog now peaks in the wide shots (1.6–2.0 at 36.3–37.5 s, where he is a small silhouette by design) | **closed** |
| hero-dark regression | face luma ≥ 0.25 | **Median 0.29 (1920) / 0.285 (1280)** over the frames where the knight stands at his post (0.29–0.45). The low outliers are lunge frames where the sprite has left the projected point. Cape and face read in every boss frame | **closed** |

### R2.3 New findings and the remaining backlog (no P1)

New in R2:
- **R2-P2-a: the mask is matte.** The mask body is luma about 0.22, bone-grey. Only its lower half and the eye slits glow. Lifting the mask
  albedo or emissive by about 1.4× (prologue-gated) would put the whole-mask ratio above 6 and make him read as a light source. Files:
  `render/sprites/prologueArt.ts` or the Nul material.
- **R2-P2-b: Part A 6.0 s dialogue box over the knight.** Nul's "So. The last Ember Knight." box (y 894–1044 at 1080p) overlaps the
  knight's legs and sword tip (feet at y 940, x 571; the box starts at x 576). By 7.0 s he has walked clear. Part C's keep-out holds; this is
  Part A. Fix: side-swap or nudge the box at that line. Files: `hud/prologue/dialogue.ts` or the Part A cue.
- **R2-P3-a:** the knight-flare colour at C 10.4 s depends on the Part B run's carried aura tier: yellow in one run, magenta in another. Both
  read as a power-up, but stills of the same `t` differ between runs.
- **R2-P3-b:** a few white cube puffs remain beside the knight in the collapse (23.3–23.6 s).
- **R2-P3-c:** the theft-3 ribbon (Slash Wave, 18.9 s) is near-white. Tint it toward its green burst so the first three beats all read as
  colour leaving.

Still open from R1 (P2/P3, for the polish backlog):
- **P2-2:** the sky over the gate doesn't visibly darken, and there are no upward ink streaks at A 6.6–7.0 s.
- **P2-3 (tear part) and P2-8 (vortex part):** the tear is a bright white/lilac column, not a dark lens. The vortex glyphs read as white
  blocks.
- **P2-4:** the ×16 surge aura shows a violet ring and rays, but no gold under-pillar. It doesn't read as "max".
- **P2-6:** the catch crumble isn't legible.
- **P2-11:** deferred by ruling. The knight is never hurt in 14/20 Average and 19/20 Fast bot runs.
- **P3-1, P3-2, P3-3, P3-6:** P3-6 is the knight's flat white face in the UNWRITTEN close-ups.
- **P3-5 (height part):** one-line boxes are still 150 px tall.

Closed by WP-A/WP-B and confirmed in R2: P2-1, P2-5, P2-7, P2-9, P2-10, P2-12, P2-13, P2-14, P3-4, P3-7. P2-3 is closed for the bars, card,
lift and circle.

### R2.4 Pack
PO sign-off pack: `docs/qa/prologue-signoff/README.md`. It contains the 16-keyframe sheet, the POC side by side, Part B readability, the
power-loss and last-spark strips, the 1920 singles, a 1280 sheet, timing, perf, the audio checklist pointer and the PO checklist.

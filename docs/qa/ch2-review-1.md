# Chapter 2 art review, round 1 (R2)

This is the single Ch2 art backlog. It replaces the "Ch2 art backlog" section of `docs/TODO.md`; every item from that section is folded in below (marked *TODO*), deduplicated, or listed as closed in the last section. Per the PO, art does not block milestones. The bar is still `poc/v2-*.png`, Ch1, and `docs/vfx/ch2-art-direction.md` (the dark night mood is intended).

**Grades**
- **P1:** fix before PO sign-off. Real bugs or readability failures only.
- **P2:** should fix.
- **P3:** polish.

## How the stills were made

- **Hardware:** real GPU (ANGLE Metal, Apple M4 Pro), headless `chromium` channel, 1920×1080 at DPR 1. Dev server on port 5431.
- **Routes:** the real routes only.
  - `?scene=play&level=ch2-lXX&wpm-bot=60&audio=0&seed=7`, frozen on the stage clock (`timeDilation.hitStop`) at a moment chosen from `__play.view()`. The heal still used `wpm-bot=30`, so the healer lives long enough to cast.
  - `?scene=level&id=ch2-lXX&pose=battle:1|boss`. These use stand-in actors (the goblin, bat and slime); they are only used for layout comparison.
- **Capital accent:** Ch2 word plates fold case, so capitals only appear on sentence plates (doom, finisher). The capital-accent still is therefore the Hush Spell plate with its ⇧ cue.
- **Caveat on frozen stills:** a frozen still holds whatever transient VFX is up at that instant. Where that matters, the item says so.

**Stills** (`docs/qa/ch2-review-1/`, every JPEG is under 400 KB):

| file | what |
|---|---|
| `00-sheet-battle-play.jpg` | L1–L9 at a battle moment plus the Ch1 L2 forest reference (60 WPM bot) |
| `00-sheet-level-poses.jpg` | `?scene=level` battle:1 poses for L1–L9, the L10 boss pose and L10 battle:2 |
| `00-sheet-willow.jpg` | L10: phase 1, the Hush Spell, phase 2, the riddle, the freed finale and level clear |
| `l01-battle.jpg` … `l09-battle.jpg` | each Ch2 level at full size |
| `ch1-l02-reference.jpg` | Ch1 forest, the same route and bot |
| `l10-p1.jpg`, `l10-p2-hush-spell-shift-cue.jpg`, `l10-p2.jpg` | Willow phases 1 and 2 |
| `l10-p3-riddle-panel-leaves.jpg`, `l10-p3-riddle-gap.jpg` | phase 3: the riddle panel with leaves, and the gap between riddles |
| `l10-freed-finale.jpg`, `l10-level-clear.jpg` | the finale 1.7 s after the Willow falls, and the clear banner |
| `heal-l02.jpg`, `elite-l04.jpg`, `fading-l03.jpg` | a heal, the elite Gloom Wolf, a fading word |
| `crop-hush-plate-shift-cue.jpg` | the capital-letter accent: the ⇧ cue on "Under…" |
| `crop-elite-tag-overlap.jpg` | P1-2 |
| `willow-hud-vs-gl.jpg` | the same frozen frames with the HUD on (left) and off (right): Hush Spell (top) and riddle (bottom) |
| `willow-wash-burst.jpg` | 400×550 crops of the Willow taken 90 ms apart (riddle normal / washed; Hush Spell GL / HUD) |
| `crop-toad-shade-bat-hero.jpg` | sprite crops at 1×: the toad (L8), the shade (L5), the Ch1 bat (L3), the hero (L5) |

---

## P1: fix before PO sign-off (3)

**P1-1. The hero HP shows a fractional maximum: "122 / 121.717".**
- **Where:** every Ch2 still (top-left panel). Compare `ch1-l02-reference.jpg`, which shows "100 / 100".
- **What's wrong:** the current value is rounded but the max is not. The text reads as a bug, and the current value appears to exceed the max.
- **Fix:** `apps/game/src/hud/panels.ts:121`. Change it to `${Math.round(v.hero.maxHp)}` (or `Math.floor` for both values). Separately, the sim/content owner should decide whether the Ch2 par loadout (`parLoadout(2)` gear scaling) should produce an integer `maxHp` at all.
- **Owner:** HUD (`hud/panels.ts`); sim/content for the source of the fraction.

**P1-2. The gold ELITE tag sits on top of the enemy's attack/leak badge.**
- **Where:** `crop-elite-tag-overlap.jpg` and `elite-l04.jpg`. The tag covers the shield icon and the "2" of "20%", so it reads "ELITE0%".
- **Fix:** in `apps/game/src/hud/panels.ts` (the elite tag drawn at about lines 419–470, and `leakBadgeLabel`), lay the tags out as a row. Either put ELITE to the left of the badge with a 4 px gap, or move ELITE onto its own line above the bars. `hud.ts:847` already reserves a rect for tags (`enemyHasTags`), so only the draw offsets need to change.
- **Owner:** HUD.

**P1-3. The Willow loses its silhouette during the Hush Spell (phase 2).**
- **Where:** `l10-p2-hush-spell-shift-cue.jpg` and `willow-hud-vs-gl.jpg` (top row).
- **What's wrong:** for the length of the Hush Spell, the whole Willow becomes a pink-violet ghost that is the same value as the background columns of the Hush aura. In the full-HUD still the boss cannot be found at all. Only the rune ring and some pale frond strands remain. This is the antagonist in its signature phase.
- **Probe values** (`__play.session.stage.foes`):
  - spell state `uRimFlash` 0.5–0.84;
  - `uFlash` 0.12–0.18, because the HUD shows "BREAK 2", so the `broken` boss tint (`stage.ts` ~l.660) is stacked on top;
  - the blazing spell glyphs;
  - the magenta Hush-aura light, then bloom.
- **This is not a freeze artefact:** each of those terms is a held state, not a transient.
- **Fix, in this order:**
  1. Don't stack the `broken` tint on the Willow while `doom` is up, and cap `uRimFlash` for the boss at about 0.3.
  2. Keep the Hush-aura light behind the trunk (z < boss.z − 1), so it back-lights the Willow instead of washing its front.
  3. Keep the trunk body at its p1 value (dark indigo) so the open glowing "O" mouth and eyes carry the spell.
  4. Gate: boss-body vs. surround luminance contrast ≥ 3:1. Reuse the `heroProbe` show/hide diff on the boss mesh.
- **Owner:** `apps/game/src/level/stage.ts` (boss flash/tint), `render/vfx/combat/BossFx.ts` and `Ch2Fx.ts` (Hush aura and rim flash), the grove mood lights.

All plates and the next letter stay legible in every still, including the 2-line Hush Spell plate (with its ⇧ cue), the riddle leaves, and the faded word. No P1 is a plate-readability failure.

---

## P2: should fix (12)

**P2-1. Level variety: the fen L5–L9 are one framing, and hushwood L1/L2 are twins.**
- **Where:** `00-sheet-battle-play.jpg` and `00-sheet-level-poses.jpg`.
- **What's wrong:**
  - All five fen levels share the same set: the boardwalk, the stilt lantern on the left, the foreground pool with the same two lantern reflections, and the same cypress row. Only L6 (one waystone) and L9 (moss curtains, darker) differ, and only slightly.
  - L6 "Sunken Shrine" shows no shrine at all.
  - Hushwood L1 and L2 are near-identical (the same root arch, mushroom clusters and lantern pair).
- **Fix:** give each level one signature set piece and one light change at the battle camera.
  - **L5:** open water, a wider pool, low horizon.
  - **L6:** two or three sunken columns and a half-drowned arch in the mid row (z −5…−8, *not* fog-eaten), plus a broken pillar in the foreground. Make the pool mask authorable (*TODO*: today it is shader noise).
  - **L7:** close reed walls on both sides, narrow framing, no pool.
  - **L8:** a firefly swarm plus a lantern-strung rope bridge across the back.
  - **L9:** the weeping curtains and the first violet tint of the grove.
  - **L2:** move the lanterns along the path and drop the root arch.
- **Owner:** layouts (content level JSON, `render/world/layout.ts`, `WorldBuilder`; T2.4). *TODO: T2.4 fen variety, the L6 sunken columns.*

**P2-2. The Willow reads weakly in battle: soft, small, and with a dim face.**
- **Where:** `l10-p1.jpg`, `l10-p2.jpg`, `l10-p3-riddle-gap.jpg`; compare the mock `docs/vfx/ch2-mock/ch2-grove.jpg`.
- **What's wrong:**
  - The Willow (boss.z −3.63) falls outside the DOF band. It is visibly softer than the hero and the adds.
  - The front frond curtains (§3.7, z +0.35…+0.5) don't show at the battle camera, so it reads as a lone purple trunk, not "about 2× the Golem".
  - The face is only two violet eyes on violet bark. *TODO: the face is washed out by the violet key light.*
- **Fix:**
  - Put `uFocus` on the boss (or `rangeFar` ≥ 14) for the boss encounter.
  - Add the §3.7 "moon on the Willow's face" light (0.8, from `boss.x`), and lower the violet key on the face band, or give the face a 1 px cool rim.
  - Bring in the front frond curtains.
- **Owner:** stage camera/post (`PostPipeline` focus), `ch2Monsters.ts` (Willow core), the grove lights. *TODO: the T2.3 Willow face, and breath/sway/lash (P3-11).*

**P2-3. The freed finale reads as a blurred tree trunk.**
- **Where:** `l10-freed-finale.jpg`.
- **What's wrong:**
  - The finisher camera frames the root collar. The face (with its "soft smile") is off-frame and blurred.
  - There are no blossoms, the key light is still violet, and no rising leaves show.
  - The level-clear still has the same dark violet Willow, so nothing says "freed".
- **Fix:**
  - Frame the face (y ≈ 4.7 m) with focus on the boss.
  - Draw the freed blossoms and canopy curtains (*TODO T2.3*).
  - Run the grove-dawn crossfade (*TODO T3.2*: key [1.0, 0.85, 0.5], ring to warm white).
- **Owner:** stage finisher camera, `ch2Monsters.ts`, `Ch2Fx.ts`, the grove mood.

**P2-4. The Willow washes to a pale ghost after a right riddle answer.**
- **Where:** `willow-wash-burst.jpg` (frames 1 and 2), `willow-hud-vs-gl.jpg` (bottom row), `l10-p3-riddle-panel-leaves.jpg`.
- **What happens:** within 0.4 s of a right answer, the trunk turns flat lavender-grey at the fog's value, outlined only by the gold fronds. The burst captured the trunk area of the GL canvas going from 61 to 139 mean luma.
- **Caveat:** the stills are frozen, so the visible duration is exaggerated. Check a 60 fps clip; if the wash lasts longer than 0.3 s, promote this to P1.
- **Fix:** the right-answer bloom and petals should light the fronds and leaves, not the trunk. Cap the additive glow quad over the boss rect, or move it behind the trunk.
- **Owner:** `Ch2Fx.ts` (the riddle-right burst and the frond tint).

**P2-5. The break burst and WEAK tag anchor to the sprite top, not the face.**
- **Where:** `l10-p2-hush-spell-shift-cue.jpg`.
- **What's wrong:** the BREAK burst ring, the sparks and the "WEAK" tag sit at the screen's top edge (x ≈ 1440, y ≈ 150), half under the stats panel and crowding the boss bar. The face is at about (1180, 280). §3.7 says the plate anchors to the face, and the burst and tags should do the same.
- **Fix:** for `monster.willow`, map the projector part `head` to the face point.
- **Owner:** `level/stage.ts` (the projector), `BossFx.ts`.

**P2-6. The riddle pick highlight is a hard-edged pale rectangle.**
- **Where:** `l10-p3-riddle-panel-leaves.jpg`, behind the "cloak" leaf.
- **What's wrong:** a flat lavender rectangle sits behind the picked leaf. It is wider than the plate and runs over the "LEAF 6.4s" label. It reads as a rendering glitch.
- **Fix:** use a soft radial or leaf-shaped glow, or the plate's own pick trim.
- **Owner:** `Ch2Fx.ts` (the pick highlight) or the HUD riddle plates, whichever draws it.

**P2-7. The Hush Shade is a black hole with a skull.**
- **Where:** `l05-battle.jpg`, `l09-battle.jpg`, `crop-toad-shade-bat-hero.jpg`.
- **What's wrong:**
  - In the fen, the cloak is near-black on near-black trunks; only the violet hem and the face read.
  - At 1× the face reads as a skull (*TODO T2.3: PO look needed*).
- **Fix:**
  - Lift the cloak's base value one step.
  - Add a violet rim of at least 0.6 that faces the key light.
  - Redraw the mask as a smooth porcelain oval with two slits (no teeth row, no cheek hollows).
- **Owner:** `ch2Monsters.ts` (shade); stage rim per mood.

**P2-8. Ch1 review enemies vanish in the hushwood.**
- **Where:** `l03-battle.jpg`.
- **What's wrong:** the Ch1 cave-bat is a black shape with two pink eyes against the dark oaks. The murk-slime goes dark magenta (L2/L3).
- **Fix:** apply the Ch2 mood rim/fill to the Ch1 roster (`FOE_FOREST_CAP` and the rim per mood), or a 1 px light outline in night moods.
- **Owner:** `level/stage.ts` (actor material per mood).

**P2-9. White blowouts on Ch2 enemies in dark moods.**
- **Where:** `fading-l03.jpg`.
- **What's wrong:** the moth mender and the shade both go flat white, with a bloom halo about 250 px wide, under hit flash plus heal glow. At 60 WPM in a busy fight this is frequent. The same frame tints the hero flat salmon on PARRY (P3-20).
- **Fix:**
  - Extend the W4 luminance cap (`FOE_FOREST_CAP` / `BOSS_LUM_CAP`) to the hushwood and grove moods.
  - Make Ch2 hit flashes outline-only (as `stage.ts:460` already does for the hero).
- **Owner:** `level/stage.ts`, the sprite material.

**P2-10. Hushwood lighting.**
- **Where:** `l01-battle.jpg`, `l03-battle.jpg`, and `00-sheet-level-poses.jpg` (L3).
- **What's wrong:**
  - The levels are darker than the T2.1 diorama. L3 is near-black outside the actors.
  - Lanterns blow the nearby oaks out to orange (the left edge of L1).
  - The back-row oaks are very dark.
- **Fix:** raise the hushwood ambient and fill by about 15% on the level layer, and clamp lantern light falloff on bark.
- **Owner:** the hushwood mood and the layout lantern placement (T2.1/T2.4). *TODO: T2.4 hushwood lighting, T2.1 back-row oaks.*

**P2-11. The riddle wrong-answer wither barely reads.** *TODO T3.2, not re-captured this round.*
- **Fix:** make the flakes larger, show the brown non-emissive leaf for at least 0.6 s, and add a short desaturate on the leaf plate.
- **Owner:** `Ch2Fx.ts`.

**P2-12. The keep-out probe margin is thin.** *TODO T3.2.*
- **What's wrong:** the freed-finale probe measures 208 against a limit of 215, so it can flake.
- **Fix:** dim the finale petals near plates, or re-baseline the probe on the real grove now that it exists.
- **Owner:** `Ch2Fx.ts` and `tests/vfx/metal-ch2-t32.metal.ts`.

---

## P3: polish (23)

1. **Heal read** (`heal-l02.jpg`).
   - What's wrong: the green "+N" pop now ships, but "+2" is small and sits on the healed wisp's face. The beam and motes barely show 100 ms after the heal.
   - Fix: offset the pop above the plate side, make the beam brighter, and confirm the HP bar fills green on heal (*TODO T3.2*).
   - Owner: HUD, `Ch2Fx.ts`.
2. **Fading word** (`fading-l03.jpg`).
   - What's wrong: the letters dim to violet with the underline, which works. The "FADING" label above the plate gets covered by keystroke confetti ("·:DING").
   - Fix: keep the confetti out of the label rect. Also add the world-side Fading-shade cue (*TODO T3.2*).
   - Owner: HUD typing VFX, `Ch2Fx.ts`.
3. **Projectile trails through the doom plate.**
   - What's wrong: the gold letter trails show through the translucent Hush Spell plate backing (`crop-hush-plate-shift-cue.jpg`). The text is still readable.
   - Fix: make the backing more opaque (at least 0.92 alpha) for sentence plates.
   - Owner: HUD plates.
4. **ATB comet over the HP number.**
   - What's wrong: the white ATB-fill streak crosses the "122 / …" text in most Ch2 stills. In Ch1 it sits outside the panel.
   - Owner: HUD (`panels.ts`).
5. **Capital accent: a gold mix on the capital-letter pop.**
   - The ⇧ cue itself reads well (`crop-hush-plate-shift-cue.jpg`). *TODO T3.2.*
   - Owner: HUD typing VFX.
6. **Toad.**
   - What's wrong: the legs and toes need separating, and a hop frame is missing. The eyes read as a yellow grille at 1× (`crop-toad-shade-bat-hero.jpg`), so give them two clear rings as in the mock. *TODO T2.3.*
   - Owner: `ch2Monsters.ts`.
7. **Wolf:** a shaggier ruff and a howl muzzle. *TODO T2.3.*
8. **Moth and wisp:** more detail, flicker, and hurt/die frames. *TODO T2.3.*
9. **Hurt poses** for every Ch2 enemy. *TODO T2.3.*
10. **Death/slam FX** for the wisp, shade and toad; fen water ripples; the Reveal skill puff. *TODO T3.2.* Owner: `Ch2Fx.ts`.
11. **Willow on stage:** breath, sway and the lash animation. *TODO T2.3.*
12. **Willow ambience:** a frond tint per right answer, and leaf-storm rates. *TODO T3.2.*
13. **Firefly blink.**
    - What's wrong: `PARTICLE_FS` is shared with Ch1 and the typing pools, so it has no per-particle phase. *TODO T2.1/T2.2.*
    - Owner: the ambient particles.
14. **Hush motes** run only in the dev scene; wire them into the levels. *TODO T2.1.*
15. **Moss:** move the strands on the oaks and root arch to `lock`. Add the cobweb veil and waystone variants. *TODO T2.1.*
16. **Fog cards** per segment for mixed-biome levels. *TODO T2.1.*
17. **Hero fill/rim per mood.**
    - The silhouette is 0.79, a thin margin. The hero reads in every still but is dull in the fen (`crop-toad-shade-bat-hero.jpg`).
    - The game layer should set `caveRim` per mood. *TODO T2.1/T2.2.*
18. **Fen dressing.** *TODO T2.2.*
    - The dusk haze is a little green against the mock's gold.
    - Show a second pool between the reeds so the reflections read.
    - Lily pads: add sway and flower variants.
    - Boardwalk: add per-plank warp and moss.
    - Add an outline pass on the cypress and reed sprites.
19. **Grove ground:** the roots read as glittery cyan (`l10-*`). *TODO T2.4.*
20. **Hero tint on parry/hurt:** a flat salmon full-body tint on PARRY (`fading-l03.jpg`). Prefer an outline flash.
21. **Fen perf:** re-measure on a real fen level with the HUD, sim and VFX running (T5.3). This is not art; it is tracked here because it came from T2.2.
22. **Ch1 flipped-normal fix (proposal).**
    - Negate `nn.x` for mirrored meshes.
    - Before/after: `docs/qa/ch2-t2.1/proposal-ch1-flipped-normal.jpg`.
    - It changes the Ch1 look, so it needs a PO decision.
23. **Re-tune the T3.2 VFX against the real biomes.** *TODO T3.2.* This review is the first pass: P2-4, P2-9 and P3-1 to P3-3 came out of it.

---

## Closed or verified from the old TODO list

- **T2.3 Willow core is a stand-in:** the real multi-state core (intro/p1/spell/riddle/freed) ships. Open items are P2-2, P2-3 and P3-11.
- **T2.2 `fen` layouts and dusk backdrops:** L5–L9 build fen ground and water with the dusk backdrop. The levels now exist; variety is P2-1.
- **T2.3 elite outline pulse / `ELITE_FX`:** the gold rim, sigil ring and gold plate trim show on the Gloom Wolf (`elite-l04.jpg`). The remaining tag bug is P1-2.
- **T3.2 HUD heal pop and fading letters:** the green "+N" pop and the violet-underlined faded letters ship. The rest is in P3-1 and P3-2.
- **T2.4 riddle layout:** the three leaf plates and the riddle panel don't overlap each other, the boss bar or the hero (`l10-p3-riddle-panel-leaves.jpg`; no adds are present in phase 3).
- **Plate readability:** every plate in every still is readable, and the next letter is legible. No world FX draws above a plate; the HUD stays on top as designed.

---

## Verdict against the Ch1 sign-off bar

Chapter 2 is close to the Ch1 bar but does not clear it yet, and the gap sits almost entirely in L10.

**What already meets or beats Ch1:**
- **Fen (L5–L9):** this is the strongest work. It is close to the PO-approved mock: warm dusk god rays, the boardwalk, five readable depth bands, still-water reflections and firefly motes.
- **Hushwood:** delivers the intended dark night mood, with good bokeh and foreground depth.
- **Typing layer:** it holds up everywhere. Plates and the next letter are legible in every still, including the 2-line Hush Spell with its ⇧ cue and the riddle's three leaves under a clue panel.
- **The Gloom Wolf elite** is the best new sprite.

**What falls short:**
- **The Whispering Willow** is not yet an Octopath-grade boss. Across phase 1 it is soft and small, and its face is dim. During the Hush Spell it dissolves into the magenta wash (P1-3). After right riddle answers it ghosts out (P2-4). The freed finale frames a blurred trunk with no blossoms or dawn (P2-3).
- **Level variety:** the five fen levels and the hushwood L1/L2 pair repeat one set each, which Ch1's ten levels never did.

Fix the three P1s (two are one-line HUD fixes) and the Willow block (P2-2 to P2-5) for sign-off. Variety (P2-1) is the main cost after that.

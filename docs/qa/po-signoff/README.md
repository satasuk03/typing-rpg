# PO sign-off stills: Chapter 1 slice (Art Director, 2026-10-10)

These stills come from current `main`, after the round-2 fixes: W3 and W4 (world), H3 (HUD), and the change that makes a typo drop the key streak by one tier.

- **Capture.** Real Metal GPU, 1280×720. Most stills are real bot runs, frozen on the event named in the caption.
- **Exceptions.** #06 and #08 are the round-2 "before" stills. #12 comes from the typing-VFX scene. #15 is reused from H2, because the screens code has not changed since then.
- **Files.** 16 JPEGs, 3.0 MB in total.

## How to see them live

- Run `pnpm dev`, then open `http://localhost:5173/<route>`.
- Bot routes play themselves.
- **"t"** is the stage time in seconds from level load. The walk-in takes about 8 s.
- Seeds are fixed, so each run replays the same way. Frame timing can drift by about ±0.3 s.

| # | Still | What to look at | Route | Timing |
|---|---|---|---|---|
| 01 | `01-forest-perfect-word-tier0.jpg` | PERFECT tag and gold ring on the shattered plate. Letters fly to the blade. Small tier-0 key sparks have a dark underlay, so they read on the bright grass. | `?scene=play&level=ch1-l05&difficulty=story&seed=4&wpm-bot=60` | t ≈ 9.7 (first PERFECT) |
| 02 | `02-forest-tier3-azure-parry-shards.jpg` | Real tier 3 at a 55-key streak: azure aura ring, cyan target-plate glow, azure streak bar. PARRY! shows 6–8 solid hex shards that you can count against the forest. | `?scene=play&level=ch1-l05&difficulty=story&seed=4&wpm-bot=80&bot-acc=0.99` | t ≈ 14 |
| 03 | `03-typo-step-down-azure-to-ember.jpg` | A typo at a 99-key streak drops one tier, not to zero: the counter turns ember at 26, and the bar and aura recolour. The cue is clear but not punishing. | `?scene=play&level=ch1-l05&difficulty=story&seed=4&wpm-bot=75&bot-acc=0.97` | t ≈ 36.8 |
| 04 | `04-forest-break-small-enemy.jpg` | Small-enemy BREAK: a crisp line ring, cyan hex shards and the BREAK pop over the head. There is no white blob. | `?scene=play&level=ch1-l05&difficulty=story&seed=4&wpm-bot=60` | t ≈ 12.2 |
| 05 | `05-cave-letters-into-blade-break.jpg` | Cave: a gold converge ring plus BREAK on the focus target. The glowing mushroom cave stays rich and teal. | `?scene=play&level=ch1-l09&difficulty=story&seed=4&wpm-bot=90` | t ≈ 10.7 |
| 06 | `06-before-golem-intro-wash.jpg` | **Before** (round 2): the Golem intro at p 0.35. The stone is washed pale and there are motes over the torso. | — | — |
| 07 | `07-after-golem-intro.jpg` | **After**, at the same intro progress. The stone keeps its colour and detail, and the light rims it from behind. | `?scene=play&level=ch1-l10&difficulty=story&seed=5&wpm-bot=90` | boss intro ≈ t 52 |
| 08 | `08-before-boss-break-white-dome.jpg` | **Before** (round 2): each boss Break turned the Golem into a white dome about 470 px wide. | — | — |
| 09 | `09-after-boss-break-ring.jpg` | **After**: a big crisp ring outside the body and hex shards. The Golem keeps its shape. The BREAK pop is on the Golem and IMMUNE is a readable pill. | same L10 route | Break at t ≈ 88.7 (+100 ms) |
| 10 | `10-boss-real-tier4-prismatic.jpg` | **Real tier 4 in the boss fight** (108-key streak). The streak counter is prismatic and the aura flares green and gold. With the one-tier drop, a 99%-accuracy player reaches it several times per fight. | `?scene=play&level=ch1-l10&difficulty=story&seed=5&wpm-bot=90&bot-acc=0.99` | t ≈ 72–90 |
| 11 | `11-boss-doom-sentence.jpg` | Doom Spell: magenta pillar and the sentence plate with its countdown. The sentence stays readable. | `?scene=play&level=ch1-l10&difficulty=story&seed=5&wpm-bot=90` | t ≈ 80 (3 s into the first doom) |
| 12 | `12-sentence-bolts.jpg` | Each finished sentence word fires a cyan bolt into the Golem. | `?scene=typing-vfx&pause=1&wpm=90&tier=3&boss=1&at=0&biome=cave` | step to the first `SentenceWordDone` + bolt flight |
| 13 | `13-finisher-x-slash.jpg` | Finisher: letterbox, X-slash flare, HUD dimmed. The full-frame white here is deliberate, as the cinematic peak. | L10 route as #09 | `FinisherCompleted` + 300 ms (t ≈ 111) |
| 14 | `14-golem-dissolve-victory.jpg` | The Golem dissolves into cyan/gold motes, then the chest drop. | L10 route as #09 | `FinisherCompleted` + 930 ms |
| 15 | `15-cache-reveal-rare.jpg` | Cache reveal: chest, rarity beam, item card, and the pity odds next to it. | `?api=off&dev=1&screen=cache` → Open (H2 capture) | about 0.9 s after Open |
| 16 | `16-known-limit-cave-hit-glare.jpg` | **Known limit, not a showcase.** In the cave/dungeon at 80–90 WPM, a hit flare can blank the target into a white disc (here the bat behind "laugh"). See below. | L09 route as #05 | encounter 2, t ≈ 36 |

## How to judge "juicy" (for the PO)

Play the L05 route by hand first, then the L10 route. Ask yourself:

1. **Per key, at a low streak (tier 0–1):** does every correct key give a visible spark at the letter and a tick on the blade, even on the bright forest? Does a run of 10 keys feel alive, not silent?
2. **Per key, at a high streak (tier 3–4):** past 50 keys, does the aura or plate colour change (azure, then prismatic past 100) feel like a reward worth chasing? Can you reach tier 3 in normal play?
3. **Word complete:** does every finished word *pay out*, with plate shatter, letters flying into the blade, and a hit on the enemy? Does a PERFECT word feel clearly better than a normal one?
4. **Typo:** do you notice the streak drop (the colour steps down one tier) without feeling punished or startled?
5. **Boss moments:** do the intro card, Break, phase change, Doom sentence and finisher each feel like an event? Is the Golem still clearly a stone golem during them?
6. **Readability:** in every one of these moments, can you always read the *next letter* you must type, and the guard timer?
7. **Calm vs. noise:** in the forest, does it feel crisp and colourful rather than washed white? (In the cave, see the known limit below.)

## Known limits

- **R3-1. Cave/dungeon hit glare (open; the one item still a problem).** Measured as FX-only clipped pixels, in the worst 96 px window per frame, on bot runs.
  - **Cave and dungeon:**
    - L09 at 90 WPM: 29% of combat frames reach ≥ 60% and 49% reach ≥ 35%.
    - L10 at 90 WPM: 9.6% of frames reach ≥ 60% and 26% reach ≥ 35%.
  - **Forest, for comparison:** L05 at 60 WPM: 0.3% of frames reach ≥ 60% and 2.5% reach ≥ 35%. The forest is fixed.
  - **Cause:** mostly auto-attack, crit and fireball flares at full HDR. The round-2 glare fix scales by biome brightness on purpose, so the dark biomes kept full strength.
  - **Not a regression:** the cave path is unchanged since round 2. Round 2 measured glare only in the forest.
  - **Effect:** at 80–90 WPM, enemies in L09/L10 are often hidden behind a white disc for 0.2–0.5 s ([16]). Word plates are never covered.
  - **Fix (W, small):** a cave glare factor of about 0.7 on the auto-attack, crit and fireball star/flash/arc. Cap the star core HDR at about 2.2 in caves. Target: ≤ 5% of frames ≥ 60%.
- **Accepted, near the no-effect baseline:**
  - Boss Break body clip peaks at 16% (target was 10%). It is a short white core inside a readable golem [09].
  - Phase change at +100 ms reaches 24%, for about 0.2 s.
  - Cave parry contact clip is 4.4% (target 3%).
  - With Aegis up, hero saturation is 0.42 (target 0.45).
  - None of these hide the Golem or the hero by eye.
- During Break the Golem stays a pale lavender (the "stunned" tint) [09][10]. That reads as intended.
- Tier 4 needs about 99% accuracy over 100 keys. At 96–97% accuracy, tier 3 is regular and tier 4 is rare. That is a design choice, not an art issue.
- Not covered here: the title "Press any key" pulse (P3-3) and a small-enemy BREAK pop that can sit about 290 px off in crowded frames. Both are tracked in STATUS.

## Verdict

**Ready for PO sign-off: no, one short W pass away (R3-1, cave/dungeon hit glare).**

- **Ready now:**
  - All round-2 P1s are closed or acceptable.
  - The forest is crisp and still spectacular.
  - The tier step-down cue is subtle.
  - The boss beats (intro, Break, Doom, real tier 4, finisher) are at the art bar.
- **Why not yet:** L09 and L10 are the chapter's climax, and there the same white-disc problem that blocked the forest in round 2 shows up on 10–29% of frames at 90 WPM.
- **Next step:** fix R3-1 and re-run the glare probe. The deck can then be signed off as is, with #16 replaced by an L09 after-still.
- **Preview:** the PO can already review #01–#15 now.

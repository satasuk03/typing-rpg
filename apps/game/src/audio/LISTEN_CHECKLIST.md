# Audio listen checklist (human PO)

The audio engineer cannot hear. Open `pnpm dev`, go to `http://localhost:5173/?scene=audio-test`, press any key
to unlock audio, use headphones, then tick each item. Every effect also has a button on the page.
Mark anything that is wrong with a note (too loud, harsh, muddy, too long, clips).

Page keys: letters = key click (streak rises), `x` = typo, `Enter` = word complete (Shift+Enter = perfect), `1-4` = forest/ruins/cave/boss.

## Keystroke (T2.6 critical)
- [ ] **key (streak 0-9)**: a crisp, short, pleasant "tick" with a faint pitched blip. Not harsh when typed fast (10+ keys/sec). Each press differs very slightly (pitch/brightness).
- [ ] **key pitch walk**: pitch steps up every 3 keys along a pentatonic scale, never sounds out of tune.
- [ ] **tier 1 (streak 10)**: click is a touch brighter and slightly higher; a short 3-note bell sting plays once.
- [ ] **tier 2 (streak 25)**: brighter again with airy shimmer in the sting (4 notes).
- [ ] **tier 3 (streak 50)**: clearly sparkly click; sting has a rising saw swell underneath (5 notes).
- [ ] **tier 4 (streak 100)**: brightest click; big 6-note bell sting with a sub boom. Feels like a reward, not a jump scare.
- [ ] **typo (`x`)**: short dull low "thud/buzz". Noticeable but not punishing; the streak resets (pitch drops back).
- [ ] **guard typo** (`Typo{kind:"guard"}`, test via the typo button with guard variant or `window.__audioTest`): heavier than a normal typo, lower and longer with an extra low thud. Should read as "danger", still not harsh.
- [ ] **no zipper/clipping** when mashing keys quickly for 10 seconds (limiter keeps it clean).
- [ ] **latency**: the click feels instant, no perceptible lag after the keypress.

## Words
- [ ] **wordComplete (Enter after a typo)**: bright two-note chime plus a tiny shimmer.
- [ ] **perfectWord (Enter with no typo, or Shift+Enter)**: same chime plus higher bell and sparkle; clearly "bigger" than wordComplete.

## Combat
- [ ] **slash**: airy whoosh, rising in pitch, no impact.
- [ ] **hit**: short thump with a noisy snap.
- [ ] **crit**: heavy low impact plus a bright bell ring and zing; clearly stronger than `hit`.
- [ ] **guard**: shimmering four-note glassy bell.
- [ ] **parry**: sharp metallic "ting" and clack, then the guard shimmer.
- [ ] **enemyWindup**: low rising growl followed by a rushing noise (a warning). Heavy variant is lower and longer.
- [ ] **heroHurt**: heavy thud plus a low buzzy grunt tone.
- [ ] **enemyDeath**: falling square "wail" with noise, then a sparkling descending-to-rising bell run. Boss variant adds a glass shatter.
- [ ] **break**: glass-like shatter with scattered high pings and a low thump.

## Skills
- [ ] **skillFire**: rising fire "whoosh" with a growling saw underneath.
- [ ] **explode**: big low boom with a long noisy tail and crackles.
- [ ] **skillMagic**: airy shimmer with three rising soft notes.
- [ ] **heal**: soft ascending three-note chime.

## Rewards and flow
- [ ] **chestLand**: dull wooden thump.
- [ ] **chestOpen**: wobbling creak, latch click, then a bright rising arpeggio.
- [ ] **coin**: a shower of small bright "tinks", each slightly different, panned around.
- [ ] **encounter**: rushing noise swell into a low three-note dark chord and thump.
- [ ] **levelUp**: short heroic 8-bit style fanfare (about 1 s).
- [ ] **victory**: longer fanfare (about 2 s) with a closing shimmer.
- [ ] **bossIntro**: dark detuned drone chord, three heavy booms, then a long ominous bell (about 4 s). Dramatic, not distorted.
- [ ] **uiClick / uiConfirm**: tiny dry blips; they play on the UI slider and are NOT affected by the reverb.

## Ambience (press 1-4; crossfade should take about 1.5 s with no clicks)
- [ ] **forest (1)**: soft wind, rustling leaves, occasional bird chirps panned left or right.
- [ ] **ruins (2)**: lower wind, faint torch crackle, a bit more echo.
- [ ] **cave (3)**: dark air rumble, faint low drone, sparse wet water drips with long echo.
- [ ] **boss (4)**: hollow low drone dominates, dark cave air, occasional drips.
- [ ] No obvious loop point or repetition in the noise beds.

## Music (buttons: walk / battle / boss / victory; layers should fade in about 2 s)
- [ ] **forest walk**: gentle pad plus a pentatonic melody, calm and bright (D major pentatonic, 92 bpm).
- [ ] **ruins walk**: darker, slower minor feel (76 bpm).
- [ ] **cave walk**: sparse, mysterious, slow (60 bpm).
- [ ] **battle**: bass and drums fade in, pad quieter; groove steady and in time (kick on 1 and 3, snare on 2 and 4).
- [ ] **boss**: heavy low ostinato and sustained saw chords on top of the battle layers; menacing.
- [ ] **victory**: pad and melody return, drums fade out.
- [ ] Music sits under the key clicks (the clicks stay clearly audible while music plays).
- [ ] Switching biome while music plays has no pops (notes may change abruptly at the swap; flag if jarring).

## Mixer / settings panel (bottom of the test page)
- [ ] Master, Effects, Interface, Ambience, Music sliders work, move with arrow keys, and persist after reload.
- [ ] Mute checkboxes silence only their bus; muting Effects also silences its reverb tail.
- [ ] "Test effect" and "Test interface" buttons play a sound.
- [ ] No console errors in DevTools during the whole session.

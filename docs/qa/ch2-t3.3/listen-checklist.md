# Chapter 2 audio: PO listen checklist (T3.3)

The audio worker cannot hear. Run `pnpm dev`, open the URLs below, **press any key or click once to unlock audio**, use headphones, and tick each item.
Everything on this page is procedural (Web Audio, no files). Base URL: `http://localhost:5173/?scene=audio-test`.

Page controls (Ch2 additions to the Ch1 page):

| Control | What it does |
|---|---|
| keys `1`-`7` | biome bed (ambience + music): forest, ruins, cave, boss, **hushwood, fen, grove** |
| `]` / `[` / `\` | play the next / previous / same Ch2 sound (cycles in the order of the checklist below) |
| `Shift` + a letter | capital-key accent (`CharCorrect.shifted`); plain letters are the normal Ch1 click |
| buttons "Ch2 sounds", "Ch2 music", "Ch2 typing" | every new sound and bed, labelled with its id |
| URL `&biome=<name>&state=<walk\|battle\|boss\|victory>` | preselects a bed on the first key or click, so each link below opens ready |

Mixer sliders at the bottom of the page work as in the game (master / sfx / ambience / music).

## Beds (let each play at least 30 s; use `state=walk` for the calm check and `state=battle` for the fight layers)

- [ ] **Hushwood loop.** Calm, a little sad, magical (D dorian). The celesta melody never sounds like Ch1's forest.
  `http://localhost:5173/?scene=audio-test&biome=hushwood&state=walk` (key `5`, or button "hushwood loop"). Then try `&state=battle`.
- [ ] **Fen loop.** Dreamy and floating (A lydian). The A drone is steady and the low end is never muddy; the battle drums use a frog-like low tom, not a kick.
  `http://localhost:5173/?scene=audio-test&biome=fen&state=walk` (key `6`, or button "fen loop"), then `&state=battle`.
- [ ] **Willow boss theme.** Tense, with whispering choir pads (D harmonic minor, 88 bpm).
  `http://localhost:5173/?scene=audio-test&biome=grove&state=boss` (key `7`, then button "Willow boss phase 1").
- [ ] **Boss phase 3 (the riddle).** Button "Willow boss phase 3": the drums drop to the hat only and a celesta enters (thinking time).
- [ ] **Willow freed.** Button "Willow freed (D major)": the theme resolves to major and feels like relief; the `willowSigh` plays with it.
- [ ] **Night ambience** (hushwood, and grove at 0.6). Open the hushwood URL above with `&state=walk` and listen for 60 s. Crickets are not shrill on headphones. Owl hoots are sparse (never closer than 9 s apart). No birds.
- [ ] **Fen ambience.** Open the fen URL with `&state=walk` and listen for 3 minutes. The frogs are funny, not annoying. Drips are subtle and short. The insect hiss is barely there.
- [ ] **Reverb per biome.** Switch `5` (hushwood) -> `6` (fen) -> `7` (grove) while pressing letters: the click tails get wetter in that order (1.0 / 1.2 / 1.6).

## Sounds (button label = sound id; or use `]` repeatedly from the page start)

- [ ] **wispChime** (spawn of a wisp): tiny and glassy, a little "ting-pff".
- [ ] **shadeHiss** (spawn of a shade): eerie but not scary for children; an exhale, not a scream.
- [ ] **mothFlutter** (spawn of a moth): soft wing beats.
- [ ] **healChime + hero heal.** Press "healChime", then the Ch1 button "heal". With your eyes closed you can tell "an enemy healed" (a rising warning) from the hero's `heal` (a soft reward). Also compare "mothFlutter" then "healChime".
- [ ] **toadCroak:** comic, deep ribbit. **toadSplash:** a heavy, wet slam.
- [ ] **wolfHowl** (elite spawn): clearly a warning, recognisable within 0.3 s, long and eerie.
- [ ] **wolfBite:** a snap.
- [ ] **willowCreak:** old wood.
- [ ] **whisperLoop (held).** Buttons "whisper loop ON" / "whisper loop OFF". Breathy, unintelligible whispers; they fade in over 0.4 s and stop almost at once (0.12 s release) when switched OFF. The plain "whisperLoop" sound button is a 2 s one-shot preview of the same texture.
- [ ] **leafStorm** (Willow phase change): a rush of leaves, not white noise. **leafRustle** (a riddle appears): the same at 0.4x for 0.6 s.
- [ ] **leafPick** (a leaf is chosen): a tiny soft tick.
- [ ] **riddleRight / riddleWrong / riddleTimeout.** Right is rewarding but quieter than `perfectWord` (compare with `Shift+Enter`). Wrong is gentle, not punishing. Timeout is lower and slower than wrong.
- [ ] **capitalKey.** Hold `Shift` and type letters: a slightly deeper click than the plain key. Then press the button `"Hush now, Ember Knight" @90 WPM`: there is no zipper, no lag, and the capitals (H, E, K) are audible but subtle, never fatiguing.
- [ ] **willowSigh:** warm. Then press "chapterSting": it begins about 2.4 s into its own length, so pressing "willowSigh" and "chapterSting" together is the real finale. They do not clash.
- [ ] **chapterSting:** the Ch2 chapter-complete bell sting (I-V-I in D, ending on a held Dmaj9 chord). Reads as "chapter complete", clearly different from the Ch1 `victory` fanfare.

## Regression (Ch1 must sound exactly as before)

- [ ] Keys `1` to `4` and the Ch1 buttons sound the same as before this task (an automated test, `apps/game/tests/audio/ch1-golden.test.ts`, proves the generated parameters are identical; this is a sanity listen).

## Notes for the listener

- Which in-game event plays which sound: `apps/game/src/audio/bindings.ts` (EnemySpawned by creature kind, `EnemyHealed` -> `healChime`, `RiddleStarted/LeafPicked/Resolved`, `CharCorrect.shifted` -> `capitalKey`, `BossPhaseChanged` -> `leafStorm`, `DoomSpellStarted` -> held whisper for the Willow, `EnemyDeath` of the Willow -> `willowSigh` + major resolution, `LevelCleared` of `ch2-l10` -> `chapterSting`).
- Brief deviations: the held whisper releases in 0.12 s (brief says "faded in and out over 0.4 s" and the checklist says "stops instantly": instant won). The brief's `wolfHowl` `slide 0.6 s, hold 0.4` is implemented with one extra ramp from 520 Hz down to 380 Hz.

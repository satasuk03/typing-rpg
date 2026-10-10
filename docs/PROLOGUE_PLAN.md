# Prologue Plan: "The Unwriting" (design + implementation, for PO approval)

> **PO decisions already locked (2026-10-10, TODO round 3):**
> 1. **Placement:** the prologue is the first thing on New Game: prologue → story card → calibration → L1. Esc skips it.
>    The title screen can replay it. Existing profiles are not forced through it.
> 2. **Format:** a short playable part (about 30–60 s of typing) with the hero's **full** skill kit (all 6 actives plus
>    passives firing), fixed easy words (pace isn't calibrated yet), and **no way to lose**. Then a longer in-engine cutscene.
> 3. **Content:** a showcase. Full magical VFX against a boss and a group of monsters. In the cutscene the hero loses all
>    his power, which sets up the 20 h "regain your power" arc. (A parallel balance task moves unlocks to a slow drip after
>    the Fireball + Clean Cut starter kit. This plan doesn't touch that data.)
> 4. **Boss:** a **new villain**, the main antagonist. It needs a new sprite, intro and VFX at or above the `poc/v2-*.png` bar.

**Status:** draft for the PO. The questions in §7 are few and each has a recommended default, so building can start on the defaults.
**Mirrors:** `docs/CH2_PLAN.md` (milestones, roles, gates). `docs/brainstorm/00-overview.md` §6 and CLAUDE.md non-negotiables
apply in full: the sim stays pure and deterministic, the HUD draws above VFX, the next letter is always legible, the art bar is
`poc/v2-*`, and the game is desktop only.
**Concept sketch (direction only, not final art):** `docs/prologue/concept-before-after.jpg` shows the silhouette and value read of
the villain, and the "power drains out of the world" palette idea.

---

## 1. Story, villain, place

### 1.1 One-paragraph story
Long ago, words had power, and the **Ember Knight** was their champion. At the **Word Gate**, an old stone arch where the first
words were carved, he meets **Nul, the Silent King**, the master of the Silence that Ch1 and Ch2 already talk about (the Ruin
Golem's Silence, the Hush Shades, the Willow's Hush Spells). The knight wins the fight with every skill he has. Then Nul catches
the last Fireball in his hand, writes "I unwrite you." in the air, and pulls the knight's skills out one by one. Every stolen
skill takes a colour out of the world. The aura dies, the sword goes dark, the knight falls to one knee, and Nul leaves through
a tear in the sky while the grey Silence rolls over the land. Two small shards fall back down, **Fireball and Clean Cut**:
the starter kit. "One spark is left." The story card and L1 pick up from there, and each later unlock reads as **power
regained**.

Why this ties the game together:
- The slow-drip unlock pace becomes the story, not a balance chore.
- The starter kit has a reason to exist (the two shards that came back).
- Ch1's "Silence makes words vanish" and Ch2's "Hush now, Ember Knight, and forget your name" now have an author.
- The villain "types" against the hero (the quill writes letter by letter), the same verb the player uses. That mirrors the
  core mechanic.

### 1.2 Villain: **Nul, the Silent King**
| Aspect | Spec |
|---|---|
| Name | **Nul** (3 letters: easy to read and say for English learners, easy to type when later chapters put him in sentences). Title on the intro card: **THE SILENT KING**. Alternates for the PO (§7 Q1): "Vesper, the Unwriter", "The Hollow King" |
| Silhouette | Tall and narrow, about **2.3× the hero** (≈ 4.2 m, about 70 texels at 16 tx/m). Three shapes nothing else in the roster has: (1) a **crown of five broken quills** (spiky, asymmetric), (2) a **smooth bone-white mask with no mouth**, (3) a long cloak flaring to a torn, page-like hem that **dissolves into small letters drifting upward**. He holds the **Quill of Unwriting**, a staff-sized quill with a violet nib. The Golem is blocky and wide, the Willow is organic and wider still, and Nul is a vertical spike. |
| Read at sprite scale | The mask is the brightest value in a dark mass: a bone oval of about 12×14 texels on a near-black cloak, with a violet rim light on the cloak edge. At 1280 px the read is "dark tall king, white blank face, crown", even in a thumbnail. The rising-letters hem is his idle motion. |
| Palette | Cloak: ink `#140f22` → `#2a1d45`. Rim: violet `#8a6cff`. Mask: bone `#e9e3d6`, shaded cool `#bdb6ad`. Eye slits: void violet `#c04dff` (emissive). Crown and quill shaft: tarnished gold `#b08a3e`. Nib and spell VFX: violet-magenta `#c04dff` → white core. **No warm colours of his own.** After the theft his cloak holds the stolen colours. |
| Lore guard | Hush Shades (Ch2) wear a cheap copy of his mask, with a stitched mouth. Nul's mask has **no** mouth. The art direction (P0.2) must keep the two apart: scale, crown, cloak and quill differ, and Nul's mask is smooth. |
| Anims | `idle` (4 frames: cloak breath, hem letters rising), `cast` (quill raised), `write` (3-frame quill stroke), `catch` (hand out, palm forward), `hurt` (recoil, mask tilt), `rise` (lifts, cloak streams upward), plus a `ward` overlay (ink shell while his HP is clamped) |
| Combat role in the playable | Boss with 2 adds. His attack is a "hush bolt", an ink lance that drives a guard word. He never dies: his HP clamps at the climax gate (§2.1). |

### 1.3 Place: **the Word Gate** (reuse the `ruins` terrain plus a unique mood; no new `BiomeId`)
- **Terrain and props:** reuse the Ch1 `ruins` biome (ground, stone props, the existing `skyDusk / mountainsDusk / treelineDusk`
  backdrops). Add 3 hero props in a new file:
  - `prop.prologue.wordgate`: a great carved stone arch with an **emissive letter channel**. Its letters glow gold, then go dark
    one by one in the cutscene.
  - `prop.prologue.runestone`: 2–3 standing stones, with the same letter channel.
  - `prop.prologue.sword`: the knight's sword stuck in the ground, for the fall beat.
- **Mood:** a storm-gold dusk. The sun is low behind the gate, the key is warm, god rays are strong, ember ambient drifts, and
  the fog has a gold tint. It is authored as the layout segment's `mood` tweak on `ruins`, which the layout format already
  supports (`render/world/layout.ts` `MoodTweak`). That avoids a new content `Biome`, word pool, audio biome, validator rows and
  map plumbing.
- **Drained mood:** `UNWRITTEN` is an exported `BiomeMood` constant next to `GROVE_DAWN`. It isn't a `BiomeId`. The stage blends
  to it with the existing `blendMood`. Target numbers (P0.2 finalises them): `sat` 1.12 → **0.15**, contrast 0.92, cool lift,
  bloom 0.25, `rays` 0.2, vignette +0.15, fog grey `[0.42, 0.43, 0.46]`, and an ambient of slow grey ash.
- **Why not reuse the Ch1 title forest:** the prologue must read as epic and different from the L1 walk the player sees
  2 minutes later. **Why not a whole new biome:** the cost would be terrain, ground material, word pool and audio, for a scene
  seen once. The gate prop plus the mood buys the difference at about a fifth of the cost.

---

## 2. Beat sheet (New Game → story card)

**Timing is at the 40 WPM reference.** "Part B" stretches or shrinks with typing speed (§2.1). Lines are short A1–A2 English, at
most 8 words, with no idioms. **Speaker colours:** Nul is violet and the Knight is amber.

### Part A: cold open (≈ 9 s, not interactive, the sim isn't started yet)
| t (s) | Camera | Action / VFX / SFX | Text |
|---|---|---|---|
| 0.0 | Black | Wind bed. A small "Hold Esc to skip" ring hint shows for 3 s at the bottom right | Centre caption fades in: **"Long ago, words had power."** |
| 2.5 | Fade in. A **high crane**: pitch 26°, dist 32, fov 30, looking down the road at the Word Gate in storm-gold dusk; a slow push in for 5 s | The gate's letters glow. The knight walks up the road at **full power**: the aura held at streak tier 2, the blade glowing (`BladeGlow`), ember motes | — |
| 5.5 | Settles toward `BATTLE_POSE` over 2.5 s | The sky above the gate darkens and ink drips **upward**. Three ink pools open on the road. SFX: reverse swell plus a whisper texture (`audio/whisper.ts`) | Nul, off screen, in the dialogue box: **"So. The last Ember Knight."** |
| 8.0 | `battle:1` | Hush Shades and Wisps rise out of the ink pools (spawn VFX variant: an ink-pool rise). The cue `startPlay` starts the sim | HUD banner: **"Type the words to fight!"** |

### Part B: playable (the real sim, ≈ 40 s of typing at 40 WPM; 20 WPM ≈ 55–60 s; 75 WPM ≈ 30 s)
| Segment | What the player types | Skills / passives on show | Presentation |
|---|---|---|---|
| B1 Encounter "Servants", wave 1: shade, wisp, shade | Fixed easy words, 3–5 letters, lowercase, distinct first letters (**sun, fire, star, hope, wind, gold, rain, moon, light, brave**…). The first red guard word arrives about 6 s in | **Opening Gambit** (ATB starts half full; the passive icon flashes). The **first completed word fires Fireball** (pre-charged slot 0), so the cause and effect is immediate. **Clean Cut** crits on perfect words | The HUD shows the **Grimoire bar**: all 6 active icons and the passive row (§4.3). A one-time hint at the first guard word: **"Red word: type it to block!"** |
| B1 wave 2: wisp, shade, wisp | Same pool | **Slash Wave** on the 3-enemy crowd. **Frost Lock** on a windup. **Aegis** on a windup. **Bulwark Streak** barrier after a perfect streak. **Riposte** on a parry | One skill VFX at a time (the cast gap, §2.1) |
| B2 Boss intro (the existing `bossIntro` phase, ≈ 4 s) | Keys are ignored | — | HUD hidden, letterbox, `BOSS_INTRO_POSE` on Nul. The sky tears open in a vertical violet slit and he steps out. The name card reads **NUL / THE SILENT KING**. Music goes to the boss layer |
| B3 Boss: Nul plus 2 adds (shade, wisp) | Same pool. Nul's plates are 4–5 letters | **Piercing Thrust** cracks his ward. His hush bolts hurt (the knight drops toward the floor), so **Mending Light** heals and **Last Stand** lights up. Every active casts at least twice by now. The **surge** (§2.1) makes the knight's aura grow if the fight runs long | His HP falls to **35%**, where it clamps. The sim emits `PrologueClimax` and ends |

### Part C: cutscene "The Unwriting" (≈ 55 s; Space or Enter advances a line; hold Esc skips)
| t (s) | Camera | Action / VFX / SFX / music | Dialogue |
|---|---|---|---|
| 0.0 | Hold the battle pose; hit-stop 160 ms | The last Fireball (the cast that ended B3, or a scripted one in standalone mode) flies. **Nul catches it in his palm.** It freezes, turns from orange to grey ink and crumbles. Any adds left dissolve into his cloak. HUD: plates and bars fade out over 300 ms. The **Grimoire bar stays** and slides to the bottom centre at 1.5× scale. Music cuts to one sustained low note | — |
| 1.5 | Slow push to Nul's mask (fov 19, pitch 7, 3 s) | The mask tilts slightly; the eye slits brighten | Nul: **"Enough."** |
| 4.5 | — | — | Nul: **"Your words are bright, little knight."** |
| 7.5 | Cut to the knight: low pitch 5°, dist 14, fov 24, a 1.5 s ease | The knight raises his sword and the aura flares to tier 4 (sunburst plus orbit stars) | Knight: **"Your Silence ends here!"** |
| 10.5 | Two-shot, wide (pitch 12, dist 22) | Nul raises the quill. **Ink letters write themselves in the air** between them, one letter every 110 ms, with a quill-scratch SFX per letter (an echo of the player's own typing) | The written line, drawn by the HUD as large ink calligraphy above WebGL: **"I unwrite you."** |
| 13.0 – 20.0 | Slow dolly toward the knight (x drift 1.5 m over 7 s), with a small shake on each theft | **The theft, 6 beats 1.1 s apart, in kit order.** Each beat: (1) that skill's **icon cracks** (2 frames) and then **shatters** into 16×16 pixel shards that fall and turn grey; (2) a **stream of that skill's colour** tears out of the knight's chest and spirals into Nul's mask: Fireball orange, Aegis gold, Slash Wave steel-white, Piercing Thrust cyan, Mending Light green, Frost Lock ice-blue; (3) the world's saturation **steps down one sixth** (a mood blend toward `UNWRITTEN`); (4) SFX: a glass crack pitched per element, then a reverse whoosh. After beat 6, all passive icons **dim to grey outlines** together | — |
| 20.0 | Hold | **Aura collapse:** the rings contract into the knight, the pillar thins to a line and snaps, one puff of smoke. The blade glow gutters out. He **drops to one knee** (new `kneel` anim). The world is now fully `UNWRITTEN`. **The audio "Silence" engages:** the music and ambience buses go through a low-pass and duck about 12 dB | — |
| 23.0 | Close-up on Nul | **The stolen colours swirl inside his cloak**, the only colour left on screen. They are drawn on the HUD canvas so the grade can't grey them (§4.2) | Nul: **"Now the world will be quiet."** |
| 26.5 | Pull back wide and high (pitch 22, dist 30) | The Word Gate's letters go dark one by one, left to right, 120 ms apart | Nul: **"No more stories. No more words."** |
| 31.0 | Hold wide | Nul **rises** into the sky tear in a vortex of letters. The tear closes with a muffled boom. A grey fog wall (fog density ramp plus fog cards) rolls down the road toward the camera | — |
| 37.0 | Close-up on the knight (fov 20, low) | Silence. A faint heartbeat SFX | Knight: **"My words... are gone."** |
| 41.0 | Hold | **Two small shards drift down** from where the tear was: the **Fireball** and **Clean Cut** icons, dim. They are read from the bundle's starter kit, so they stay right if the kit changes. They land in his open hand. **A tiny ember lights up**, the only warm light in the scene (a point light, ember colour). A soft chime. The low-pass opens slightly | — |
| 44.0 | Hold | The knight closes his hand around the ember | Knight: **"No. One spark is left."** |
| 47.0 | Slow crane up and away (pitch 30, dist 40, 6 s) | He stands, pulls the sword out of the ground and walks into the grey toward the road. The ember is a tiny warm dot in a grey world | Centre caption: **"Find your words again."** |
| 53.0 | Fade to black over 1.5 s | Music: a 2-note motif from the main theme | → **story card** (first run) or → **title** (replay) |

**Reading time:** a line holds for `max(2.2 s, 1.2 s + 60 ms × chars)` unless the player presses Space or Enter. The column above
assumes the minimums. A slow reader stretches Part C to about 65 s.

**Story card follow-up (flow task P3.5):** the card has to follow the prologue and still make sense to a player who skipped it.
- Panel 1 becomes "The Words Are Fading": *"Nul, the Silent King, took your power. Now his Silence spreads, and words vanish from
  the world."*
- Panel 2 keeps "Your Blade Is Your Voice", with a first sentence added: *"One spark is left."*
- Panel 3 doesn't change.
- Unlock notes on the results screen change from "Skill unlocked: X" to **"Power regained: X"**. That is a copy change in
  `app.ts`; the unlock data isn't touched.

### 2.1 How the playable is shaped (numbers are starting values; P1.3 tunes them with the bot)
- **Pace:** fixed at **25 WPM** from the prologue data, not the player's pace (it isn't calibrated). Pace only scales enemy
  timers and guard windows, so 25 gives generous guard windows.
- **Hero:** "full power" gear, built client-side as a plain `Loadout` (sword, Legendary, tier 3, +5) from prologue data. It is
  never added to the inventory.
- **Enemy HP:** authored so a grunt dies in about 2 words at 40 WPM (auto-attacks plus skills).
- **Kit:** the 6 actives (Fireball, Aegis, Slash Wave, Piercing Thrust, Mending Light, Frost Lock) and the 9 current passives,
  all from the data list in `prologue.ts`.
  - **Charge:** ×2.5.
  - **Casting:** each skill uses its **smart** condition, but drops to **asap** after it has waited 4 s, so every skill gets its
    moment.
  - **Cast gap:** at most one kit cast every **1.5 s** (round robin from the slot after the last cast), so each VFX reads on its
    own and the next letter stays clear.
  - **Order:** the start charges are staggered by data (Fireball 100%, the rest falling) and no kit skill casts before the
    run's first `WordCompleted`, so the first skill clearly comes from the player's word.
- **Can't lose:** hero HP clamps at **25%** of max. That is below Last Stand's 30% and Mending's 60%, so both can show. There is
  no `HeroDowned`, no Second Wind and no fail path. Loot is off (gold 0, no chests).
- **Surge (bounds the slow end without a hard cut):** after a segment has been in `combat` for `afterS` (encounter 18 s,
  boss 20 s), hero damage doubles every 4 s, up to ×16. The view exposes `surgeMult`, and the aura grows with it, so a slow
  typist sees a crescendo, not a timeout.
- **Floor for the fast end:** Nul's HP clamps at the 35% gate (with his `ward` VFX) until he has been in `combat` for **12 s**
  (the D16 clamp pattern). Fast typists see more casts instead of a 15 s prologue.
- **Idle player:** nothing happens until a key is pressed (the ATB fills only from typing). After 20 s with no input the
  "Hold Esc to skip" ring appears.

---

## 3. Architecture

### 3.1 How the playable runs. Decision: the **real sim**, with a content-gated `ResolvedLevel.prologue`
| Option | Verdict |
|---|---|
| A. The real sim with a prologue level def and kit / can't-lose / surge rules, gated on `def.prologue` being present | **Chosen.** The typing rules, targeting, guard words, typo latch and every event that drives the T2.6 typing VFX and SFX are the real thing. The prologue *is* a demo of the game, so it has to feel exactly like it. Purity holds (all rules are integer and tick based, with no clock and no `Math.random`). Ch1/Ch2 hash byte-identically because every new key is absent unless the prologue content uses it (§13.1 rule) |
| B. A separate scripted sim mode (a mini state machine that emits the same event types) | Rejected. It duplicates the typing rules, drifts from the real feel, and needs its own parity and determinism coverage |
| C. Presentation-only fake (no sim) | Rejected. It breaks "render/HUD/audio only consume sim events", and the typing VFX pipeline would have no source of truth |

**Why the prologue is not a `LevelDef` in `bundle.levels`:** levels drive the map, chapter plumbing, unlocks, stars, `pnpm bot`'s
20-level gate and the balance cells, and the `ch\d+-l\d+` id regex. A separate `ContentBundle.prologue` (one object) with its
own `resolvePrologue(bundle)` keeps every one of those untouched. The parallel balance task owns `skills.ts`, `balance.ts`,
`sim/meta/**` and `tools/balance/**`; all prologue numbers live in `packages/content/src/data/prologue.ts`, **not** in
`balance.ts`.

**The full kit, in detail.** Today `Loadout.actives` is a 2-tuple, `skillChargeM: [number, number]`, and events and views carry
`slot: 0 | 1`.
- The kit generalises the slot arrays to length N. Story levels stay length 2, so their state hashes don't change (tuples are
  arrays at runtime).
- `slot` widens to `number`. That is a type widening only, done in the stub task P0.3 together with any client compile fallout,
  so the sim task stays sim-only.
- Passives: `hasPassive(run, id)` reads the kit's passive list when present.

**The end.** Nul is a normal `BossDef` whose `phase1.endAtHpPct` equals the prologue gate (35). The rule intercepts the gate
before `BossPhaseChanged`. The sim emits `PrologueClimax`, then `LevelCleared` in the same tick (gold 0, no chests), and the state
is terminal. Phase 2 and 3 data must exist to satisfy the schema; it is unreachable, and the validator checks that.

**The session.** `PlaySession` gets `mode: "story" | "prologue"`. In prologue mode it:
- **holds the sim start:** `runner.start` runs on the cutscene's `startPlay` cue, not in `attach()`;
- **skips results and the save commit:** `onFinished` isn't called, so there is no gold, SRS, journal or stars;
- on `PrologueClimax`, **hands the same RenderWorld and stage to the cutscene player.** There's no reload and no cut: the actors
  stay where the fight left them;
- shows a pause-menu variant: **Resume / Skip prologue**.

The wpm-bot works unchanged (tests). The run is never submitted: no run ticket, and the Worker never sees it.

### 3.2 Cutscene system (presentation only, data-driven, seekable, skippable, headless-testable)
**Module:** `apps/game/src/cutscene/` (new, client-internal; documented in its own `README.md`).
- **`types.ts`.** A timeline is `{ id; durationMs; setup; cues: Cue[] }`. `Cue` is a discriminated union, each with `at` (ms) and
  optional `dur`:
  - `camera` `{pose: Partial<CameraPose> | anchor ref, ease, dur, shake?}`;
  - `actor` `{who: "hero" | "boss" | propId, anim?, move?: {dx, dz, dur}, visible?, tint?}`;
  - `vfx` `{id: PrologueVfxId, from?, to?, params?}`;
  - `sfx` `{id: Sfx}`;
  - `music` `{state | motif | silence: 0..1}`;
  - `mood` `{to: "base" | "unwritten" | number(0..1 blend), dur}`;
  - `hud` `{id: "kitShatter", index} | {id: "passivesDim"} | {id: "caption", text} | {id: "ink", text, charMs}`;
  - `line` `{speaker: "nul" | "knight", text}` (blocks the cue clock until its hold ends or Space/Enter);
  - `startPlay` (Part A only);
  - `end`.
- **`timeline.ts` (pure, Node-tested).**
  - `evaluate(tl, tMs, lineClock)` returns the active cues and continuous state: the camera pose by interpolating keyed
    poses, the mood blend, captions, which icons have shattered.
  - `validate(tl, registries)` checks: ids resolve in the VFX/SFX/anim registries, cues are sorted, lines are ≤ 8 words and
    A2 (a word list check), no `camera` overlap without `ease`.
  - `endState(tl)` is what a skip lands on.
- **`player.ts`.** Runs on a **presentation clock** that is paused on blur/hidden and in the pause menu. Lines **gate** the clock:
  - the clock stops at a `line` cue until the hold time passes or Space/Enter is pressed;
  - letter keys **don't** advance lines, because the player is often still typing when the climax hits;
  - all input is ignored for 1.5 s after `PrologueClimax`.

  It drives the world only through a narrow **`StageDirector`** seam added to `level/stage.ts`: `heroActor()`, `bossActor()`,
  `prop(id)`, `setCameraOverride(pose | null)`, `setMood(mood | null)`, `setLetterbox()`, `setHeroAnim()`.
- **Determinism and stills.** Continuous state is a pure function of `t`. Particle VFX are integrated **at a fixed 1/60 s step
  from each cue's start** with seeded RNGs (the combat VFX already seed from `cfg.seed`; the prologue uses a fixed seed). So
  `seek(t)` replays the steps and is reproducible. Dev route: `?scene=prologue&part=cutscene&t=24000&freeze=1` renders the
  exact frame at 24.0 s from the canonical **standalone setup** (the hero and Nul at their layout anchors, no adds). This is
  also how replay-from-title can jump straight to Part C in tests.
- **Skip.** **Hold Esc for 1.0 s** anywhere in the prologue, with a filling ring at the bottom right ("Hold Esc to skip").
  - It skips the **whole** prologue: a 400 ms fade to black, set `prologueSeen`, then the story card (first run) or the title
    (replay).
  - A short tap of Esc in Part B keeps its normal meaning (drop the target, or open the pause menu, which has "Skip prologue").
  - A hold, not a confirm modal: a modal would interrupt the spectacle, and a hold can't be triggered by accident while typing.
- **Reduced motion / flash.** Camera moves become cuts and there is no shake (`motionK`). The theft flashes are capped by
  `reducedFlash`. `effectsIntensity` scales the particle counts. Lines and timing don't change.

### 3.3 Proposed `docs/interfaces.md` changelog entry (P0.1 finalises it; the orchestrator approves)
**P0.1 note (2026-10-10):** finalised as **v2.2** in `docs/interfaces.md` (changelog, §3.7 and §14), because v2.1 is the slow-drip
entry. The draft below is kept for history; where it differs, the doc wins. Differences: no `endAtBossHpPct` (the gate is Nul's
`phase1.endAtHpPct`), `PrologueClimax { enemyId; bossId: string; surgeMultBp; addIds }`, the surge's first doubling is at
`afterS`, no timeout fail, `LevelView.prologue` also has `armed`, and the run is built by `prologueRunConfig(bundle)`.
> - **2.2** (was drafted as 2.1; prologue): the Prologue contracts. Every change is **additive and gated** on `ResolvedLevel.prologue`,
>   which is absent on every story level. Ch1/Ch2 events, results, balance cells, bot output and state hashes don't change.
>   `SIM_VERSION` stays 1. `CONTENT_VERSION` changes (new bundle key).
>   - **Content (§6):**
>     - New `PrologueDef` and `ContentBundle.prologue?: PrologueDef`: `{ id: "prologue"; layoutId; biome: Biome ("ruins");
>       chapter: 1 (par gear, case folding); pace: int 15..120; seed: int; words: TypableText[] (≥ 40, lowercase, 3–5
>       letters, A1); guardWords: TypableText[] (≥ 12); segments: Segment[]; kit: { actives: { id: ActiveSkillId;
>       startChargePct: 0..100 }[] (1..8); passives: PassiveId[] (≤ 10) }; gear: { archetype; rarity; tier; upgrade };
>       chargeMult; castGapS; forceAfterS; heroHpFloorPct; surge: { encounterAfterS; bossAfterS; doubleEveryS; maxMult };
>       endAtBossHpPct; bossMinS }`.
>     - The Nul `EnemyDef` (`archetype: "boss"`) and `BossDef` `nul` (`phase1.endAtHpPct` = `endAtBossHpPct`).
>     - Validator: a boss referenced only by the prologue is allowed; its phase-2/3 data is unreachable; prologue words don't
>       appear in `bundle.levels` pools.
>   - **Sim (§3, new §3.7 "Prologue"):**
>     - `resolvePrologue(bundle): ResolvedLevel` (levelId `"prologue"`, index 0, goldTotal 0).
>     - `ResolvedLevel.prologue?: ResolvedPrologue` `{ kitActives: ActiveSkillId[]; kitStartChargeM: Milli[];
>       kitPassives: PassiveId[]; chargeMultBp; castGapTicks; forceAfterTicks; heroHpFloorBp; surge: { encounterAfterTicks;
>       bossAfterTicks; doubleEveryTicks; maxMultBp }; endAtBossHpBp; bossMinTicks }`.
>     - Rules, all integer and tick based:
>       - **Kit:** slot arrays have length `kitActives.length`. Smart condition, then asap after `forceAfterTicks`. At most
>         one kit cast per `castGapTicks`, round robin. No kit cast before the run's first `WordCompleted`. `hasPassive`
>         reads `kitPassives`.
>       - **Floor:** `damageHero` clamps HP at the floor. No `HeroDowned`, no Second Wind, no fail except "abandoned".
>       - **Surge:** a hero-origin damage mult of `2^floor((combatTicks − after)/doubleEvery)`, capped at `maxMultBp`, applied
>         after the passives step.
>       - **Climax:** the boss HP clamps at `endAtBossHpBp`. Reaching the gate with `bossMinTicks` elapsed emits
>         `PrologueClimax`, then `LevelCleared` (gold 0, no chests).
>     - `RunState.skillChargeM: number[]` and `skillReady: boolean[]` (length 2 on story levels).
>   - **Events (§4):**
>     - New `PrologueClimax { bossId: EntityId; surgeMultBp: Bp }`.
>     - `SkillCharged.slot` and `SkillCast.slot` widen from `0 | 1` to `number` (0..1 on story levels).
>     - The new event is bound in `level/eventBindings.ts` (exhaustive map) and added to the audio `KNOWN_SIM_EVENTS`.
>   - **View (§5):** `SkillView.slot: number`; `LevelView.prologue?: { surgeMult: number; bossClamped: boolean }` (aura growth,
>     the ward VFX).
>   - **Save (§9.1):** no schema change. The reserved flag key **`#prologue`** in `journal.firstSeen` (the `#intro:chN`
>     pattern, `meta/ops.ts` `introSeenKey`) marks it as seen. It rides the existing min-merge and cloud sync.
>   - **Not changed:** Trial, `hdk1`, run ticket, Worker re-sim (prologue runs are never submitted), `Loadout` shape (the kit is
>     level data, not loadout), and unlock data.

### 3.4 Save flag, migration, flows
- **Flag:** `prologueSeen(save) = journal.firstSeen["#prologue"] !== undefined`, with `markPrologueSeen` written like
  `markIntroSeen`. It is set at the end of Part C or on skip, **not** at the start, so a player who closes the tab mid-prologue
  sees it again.
- **Migration:** none. A save without the key reads as "not seen", but the flag only gates the **first-run** flow, and
  `isFirstRun` is already false for any profile with progress or a calibration. **Existing profiles are never forced.**
- **First run** (`App.beginFirstRun`):
  - `!onboarding || !isFirstRun` → false (unchanged);
  - `!prologueSeen` → `playPrologue({ then: "story" })`;
  - else the existing story / L1 logic.
  - New Game after "Erase and start" clears the save, so the prologue plays again. Hold-Esc makes that a 1 s cost.
- **Replay:** the title menu gets a **"Prologue"** button for every profile. It plays the whole prologue (Parts A to C) in replay
  mode: no flag write, and it ends on the title.
- **Tests and dev:** `?onboard=0` skips it with the rest of onboarding. `?scene=prologue[&wpm-bot=N][&part=cutscene&t=ms&freeze=1]`
  is the dev route.

---

## 4. Art, VFX, SFX and music asks

Every item uses the **existing procedural pipelines**. There's no Aseprite yet (the Ch2 PO ruling: procedural at production
quality, with `SpriteSource` keeping a later swap cheap).

### 4.1 Art (procedural SDF sprites, the `render/sprites/ch2Monsters.ts` conventions: 16 tx/m, foot anchor, authored shape normals via `normalMap.ts`, baked flip)
| Ask | Pipeline / file | Quality gate |
|---|---|---|
| **Nul** core sprite + 6 anims + `ward` overlay | New `render/sprites/prologueArt.ts` (SDF unions as for the Wolf/Toad, form shading from the SDF gradient, cloth folds, hem letters as a 3×5 pixel glyph set) | Contact sheet next to the Golem, Willow and hero at 1280 and 1920. **Silhouette test:** the threshold mask still names it at 50% scale (crown + mask + cloak). **Luma:** the mask against the cloak ≥ 6:1, and Nul's body against the storm-gold sky ≥ 3:1 (dark on bright; the Willow never reached 3:1). Matches or beats `poc/v2-boss-intro.png`. **Opus gate R0 before any VFX builds on it** |
| Knight anims `kneel`, `rise`, `reach` (open hand) + a `sword-out` pose | `render/sprites/proceduralArt.ts`, hero section, **additive only** | A pixel-hash test proves every existing hero frame is byte-identical. New strip still |
| Word Gate arch, runestones, dropped sword (with an emissive letter channel the cutscene can dim per letter) | New `render/sprites/prologueProps.ts` (the `ch2Props.ts` conventions) | Stills at walk / battle / boss poses next to `poc/v2-ruins-guard-words.png` and Ch1 ruins |
| Layout | New `apps/game/src/assets/levels/prologue.json` (LDtk subset: `ruins`, a segment `mood` tweak, dusk backdrops, anchors for the hero, 3 grunt slots, the boss and the gate) | The layout validator is green. The registry glob takes `prologue.json` |
| `UNWRITTEN` mood + the storm-gold tweak | `render/biomes.ts` (export a constant only) | `validateMood` green. Before/after stills at t = 12 s and 22 s of Part C |

### 4.2 VFX (new `render/vfx/prologue/`, built on `PooledParticles`, `FxQuad`, `AuraQuad`, `LightSlots`, `TimeDilation`)
| Cue id | Description | Notes |
|---|---|---|
| `inkRise` | Enemy spawn from an ink pool (ink upward drips, a violet rim) | Used by the stage's spawn for the prologue only |
| `skyTear` | A vertical violet slit with a white core; open, hold, close | Boss intro and exit |
| `hushBolt` | Nul's attack: an ink lance with a violet head | Bound from `EnemyAttack` when the attacker's def is `nul` |
| `ward` | An ink shell on Nul while his HP is clamped | Driven per frame by `view.prologue.bossClamped` |
| `surgeAura` | The aura floor at tier 2 in the prologue, rising with `surgeMult` | An extension of `HeroAura`; no change on story levels |
| `catchFireball` | The Fireball stops in his palm, desaturates and crumbles to ink | Part C 0.0 s |
| `inkWrite` | The quill nib trail synced with the HUD ink text | The HUD draws the letters; the world draws the nib sparks only |
| `theftStream` ×6 | A bezier ribbon of motes in the skill's element colour, from the hero's chest to the mask | Element colours come from the existing per-skill params in `render/vfx/combat/params.ts` |
| `auraCollapse` | Rings contract, the pillar narrows and snaps, a smoke puff | A variant of the existing "gutter out" |
| `gateDarken` | Per-letter emissive fade on the gate | Prop uniform |
| `letterVortex` + `silenceFog` | Nul's exit, then a fog density ramp plus fog cards rolling toward the camera | |
| `ember` | A small warm point light plus 3 motes in the knight's hand | The only warm light in `UNWRITTEN` |
| **Stolen-colour swirl** | Drawn on the **HUD canvas** at Nul's projected position, so the post grade can't desaturate it | During Part C there are no plates, so it can't hide a letter |

### 4.3 HUD (`hud/prologue/`)
- **Grimoire bar.** N active icons (the existing 16×16 pixel icons from `hud/skillIcons.ts`) with charge rings, plus a passive
  row whose icons flash on `PassiveTriggered`. It sits in the existing skill-panel region and is registered as a **reserved
  rect**, so plates never sit under it. In Part C it slides to the bottom centre at 1.5×.
- **Shatter.** A 2-frame crack, then pixel shards (reusing `hud/fx/typing/shatter.ts`) that fall, grey out and fade.
- **Dialogue box.** In the HUD theme, bottom centre, at most 2 lines, 24 px at 1080p, a speaker plate (Nul violet, Knight
  amber), text contrast ≥ 7:1 on its panel, a typewriter reveal at 40 chars/s, and a "Space ▸" cue.
- **Ink calligraphy line** for "I unwrite you." and the centre captions.
- **Skip ring.**
- **Two hints:** "Type the words to fight!" and "Red word: type it to block!". Both use the reserved-rect mechanism the tutorial
  card already uses.

### 4.4 Audio (procedural WebAudio, as today: `audio/synth.ts`, `sfxCh2.ts` pattern, `musicScheduler.ts`)
- **Music:**
  - a `prologue` theme in `BIOME_MUSIC`: heroic, major, faster, with a brass-like lead, reusing the layer model (walk / battle /
    boss);
  - a 2-note "spark" motif;
  - a **`silence(amount)`** control: a low-pass plus duck on the music and ambience buses, from `mixer.ts`.
- **SFX** (new `audio/sfxPrologue.ts`): ink-pool rise, sky tear (reverse swell + whisper), hush bolt, ward hum, catch (a choked
  fire hiss), quill scratch (per letter, small pitch jitter from a seeded index), element-pitched glass crack ×6, theft whoosh,
  aura collapse (downward sweep + thump), muffled sword clang, heartbeat, ember chime, line blip (soft, per line).
- **Gate:** the bindings drift test, 0 audio errors, and a listen checklist for the PO (`audio/LISTEN_CHECKLIST.md` section).

### 4.5 Readability and quality rules (all must hold; the QA task proves them)
1. **Part B:**
   - The existing HUD invariants hold at max FX: the next letter is legible, ring contrast ≥ 3 and cell contrast ≥ 4.5, and no
     pop or tag covers a letter or sits outside its plate.
   - They are run with `tests/level/fxProbe.ts` on the prologue.
   - The **cast gap** keeps one skill VFX at a time.
   - The Grimoire bar is a reserved rect.
2. **Part C:** there are no plates. The dialogue has ≥ 7:1 contrast on its own panel, and no VFX draws over the dialogue box (a
   keep-out rect, checked by a probe at the line keyframes).
3. **The HUD canvas stays above WebGL everywhere.** Nothing in the world layer may hide a line or a letter.
4. **Art bar:** the Metal stills of the 16 keyframes (§6) must match or beat `poc/v2-boss-intro.png` and `poc/v2-boss-battle.png`,
   graded by an Opus reviewer.
5. **Perf on real Metal:** p95 ≤ 16.8 ms at tier 0 (1080p) in Part B (the heaviest VFX density in the game) and in Part C. At
   tier 2 with 4× CPU throttle, ≥ 45 fps. The theft streams and the letter vortex are tier-gated (half the particles at tier 2).

---

## 5. Tasks

Rules (as in `CH2_PLAN.md` §5):
- At most **3 agents at once**.
- Workers use Sonnet. Contracts and reviews use Opus. Haiku only for the stubs.
- Every brief starts with `/usr/bin/git merge main`, names its owned paths and the concurrently running agents' paths, ends
  with `scripts/check.sh` green plus the AC evidence, and commits with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  without merging.
- Playwright runs use a unique `PW_PORT` / `LEVEL_PORT`.
- **Never touch the balance task's paths:** `packages/content/src/data/skills.ts`, `packages/sim/src/balance.ts`,
  `packages/sim/src/meta/**`, `tools/balance/**`.

### M0: contracts and direction (≈ 1 day)
| ID | Owner (model) | Writes (exact) | Deps | AC + evidence |
|---|---|---|---|---|
| **P0.1** Contracts v2.2 | Deep reasoner (**Opus**) | `docs/interfaces.md` | PO answers (or defaults) | §3.3 entry finalised. New §3.7 normative rules. Blocks in §3/§4/§5/§6 updated and marked `v2.2`. Code blocks typecheck with `docs/tools/extract-interface-blocks.mjs`. Reviewer (Opus) sign-off |
| **P0.2** Art + audio direction | Art director (**Opus**) | `docs/vfx/prologue-art-direction.md`, `docs/prologue/*.jpg` (small JPEGs) | — | Nul turnaround mock and palette swatches; mood numbers for the storm-gold tweak and `UNWRITTEN`; one spec row per VFX cue (§4.2) in the `typing-vfx-spec.md` style; camera keyframe table; SFX/music brief. Mock stills from a scratch scene |
| **P0.3** Contract stubs + slot widening | Sim (**Haiku**) | `docs/interfaces.md` §14.9 is the exact checklist. `packages/sim/src/{types,events,view,state}.ts`, `packages/sim/src/{skills,level}.ts` (only the five strict-index fix-ups the widening forces), `packages/content/src/schemas.ts`, `apps/game/src/level/eventBindings.ts` (stub binding), `apps/game/src/audio/bindings.ts` (known event), `apps/game/src/render/sprites/{artTypes,ProceduralSpriteSource}.ts` (new ids + registration of empty `prologueArt.ts` / `prologueProps.ts`), compile-fallout casts in `apps/game/src/hud/**` | P0.1 | Types exactly as written in v2.2, no behaviour. `check.sh` green. **Ch1/Ch2 golden hashes and bot output unchanged** |

### M1: sim and content (≈ 2.5 days)
| ID | Owner (model) | Writes (exact) | Deps | AC + evidence |
|---|---|---|---|---|
| **P1.1** Prologue sim rules | Sim (**Sonnet**) | `packages/sim/src/**` **except** `balance.ts` and `meta/**`; `packages/sim/tests/**` | P0.3 | Rule-named tests for: the kit (N slots, smart → asap after force, one cast per gap, round robin, no cast before the first word); the HP floor; the surge curve; the climax gate plus `bossMinTicks`; no loot. **Can't-lose fuzz:** 1,000 seeded input logs (idle, all typos, random, perfect) never reach `LevelFailed`, and HP stays ≥ the floor. A golden prologue replay. Node ↔ Chromium parity includes the prologue. Purity grep is clean. **Ch1/Ch2 goldens byte-identical** |
| **P1.2** Prologue content | Content (**Sonnet**) | `packages/content/src/data/prologue.ts` (new), `packages/content/src/data/enemies.ts` (the `nul` row), `packages/content/src/data/bosses.ts` (the `nul` boss), `packages/content/src/data/bundle.ts` (the `prologue` key), `tools/content/**` (validator rules), CONTENT_VERSION | P0.3 | 60 plate words (A1, 3–5 letters, ≥ 14 distinct first letters, lowercase) and 16 guard words. The validator implements `docs/interfaces.md` §14.2 (words are not in any level pool, the kit ids exist, no gimmicks or elites, and so on). The gate is Nul's own `phase1.endAtHpPct` (35), so there is no equality check. Dialogue lines live in the client timeline and are checked by P3.1's `validate`. The orchestrator samples the word list |
| **P1.3** Bot + timing tune | QA/balance (**Sonnet**) | `tools/bot/**` (`--prologue`), numbers in `packages/content/src/data/prologue.ts` | P1.1, P1.2 merged | 20 seeds × 20/40/75 WPM. **Typing time to climax:** 20 WPM 50–65 s, 40 WPM 38–50 s, 75 WPM 28–40 s. **Every kit active casts ≥ 1×** in every run (≥ 2× at 40 WPM), and ≥ 6 distinct passives trigger. 0 fails. Kit casts per minute ≤ 40 (VFX density). `pnpm bot --quick` includes the prologue |

### M2: art (≈ 3 days, parallel with M1)
| ID | Owner (model) | Writes (exact) | Deps | AC + evidence |
|---|---|---|---|---|
| **P2.1** Nul sprite | Render (**Sonnet**) | `apps/game/src/render/sprites/prologueArt.ts`, its `.test.ts`, `apps/game/src/dev/` sheet scene (new file) | P0.2, P0.3 | §4.1 gates: contact sheet, silhouette test, luma numbers, anim strip, normal maps |
| **R0** Villain gate | Art director (**Opus**) | `docs/qa/prologue-r0.md` | P2.1 | Pass, or a P1 list on Metal stills. Blocks P3.2 |
| **P2.2** Word Gate layout, props, moods | Render (**Sonnet**) | `apps/game/src/assets/levels/prologue.json`, `apps/game/src/render/world/registry.ts` (glob), `apps/game/src/render/sprites/prologueProps.ts`, `apps/game/src/render/biomes.ts` (two exported constants only) | P0.2, P0.3 | Stills at walk / battle:1 / boss / `UNWRITTEN` at 1280 and 1920 next to `poc/v2-*` and Ch1 ruins. Hero silhouette ≥ 0.75 (the existing hero silhouette spec). Metal fps at tier 0 and 2 |
| **P2.3** Knight anims | Render (**Sonnet**) | `apps/game/src/render/sprites/proceduralArt.ts` (hero section, additive) | P0.3 | The pixel-hash test proves the old hero frames are unchanged. Strip for `kneel/rise/reach/sword-out` |

### M3: cutscene and presentation (≈ 4 days)
| ID | Owner (model) | Writes (exact) | Deps | AC + evidence |
|---|---|---|---|---|
| **P3.1** Cutscene engine | UI/render (**Sonnet**) | `apps/game/src/cutscene/{types,timeline,player,README}.ts/md` + tests, `apps/game/src/level/stage.ts` (additive `StageDirector` seam only), `apps/game/src/dev/prologueScene.ts`, `apps/game/src/main.ts` (route) | P0.3 | Node tests: evaluation is a pure function of t; `seek(t)` twice gives identical state; `validate` catches a bad id, an unsorted cue and a long line; skip at any t lands on `endState`; lines gate on Space/Enter and not on letters; the 1.5 s input guard. Playwright: two captures at the same `t` differ < 0.5% in pixels. A test timeline drives the camera, mood and an actor |
| **P3.2** Prologue VFX | VFX (**Sonnet**) | `apps/game/src/render/vfx/prologue/**`, `apps/game/src/render/vfx/HeroAura.ts` (prologue floor/surge/collapse, gated), `apps/game/src/level/eventBindings.ts` (`PrologueClimax`, `hushBolt` binding) | R0, P2.2, P3.1 | Every §4.2 cue registered (the enumeration test). Stills per cue. Keep-out probes green. Story-level combat stills unchanged (the existing `metal-ch1-unchanged`). Metal perf |
| **P3.3** Prologue HUD | UI (**Sonnet**) | `apps/game/src/hud/prologue/**`, `apps/game/src/hud/hud.ts` (mount hook), `apps/game/tests/hud/prologueHud.spec.ts` | P0.3, P3.1 | Grimoire bar for N = 6 + 9 passives (a reserved rect); shatter sequence; dialogue (contrast ≥ 7:1, 2-line wrap at 1280); ink line; skip ring; hints. Readability sweep at max FX on the prologue with 0 violations. Per-key cost still ≤ 0.45 ms |
| **P3.4** Prologue audio | Audio (**Sonnet**) | `apps/game/src/audio/{sfxPrologue,music,musicScheduler,mixer,types,LISTEN_CHECKLIST}.*` | P0.2 | Drift test; 0 audio errors in a prologue run; the `silence()` ramp has no clicks (an offline render test); a listen checklist |
| **P3.5** Flow + session mode | UI (**Sonnet**) | `apps/game/src/app/app.ts`, `app/screens/{title,story}.ts`, `apps/game/src/meta/ops.ts` (flag helpers only), `apps/game/src/level/{session,screens}.ts`, `apps/game/tests/app/{onboarding,firstSession,newGame}.spec.ts` + new `prologueFlow.spec.ts` | P1.1, P3.1 | Fresh profile: Start → prologue → story → calibrate → L1. A profile with progress is not forced. Hold-Esc skip from A, B and C, then the story card, with the flag set. Title "Prologue" replays and returns to the title. Reload mid-prologue replays it. Pause menu shows Resume / Skip. No save write from the run (the save before and after is diffed). "Power regained" copy. Story card text |
| **P3.6** Prologue timeline | UI (**Sonnet**) | `apps/game/src/cutscene/timelines/prologue.ts` | P3.2, P3.3, P3.4, P2.3 | It implements §2 Parts A and C. `validate` is green. 16 keyframe stills (§6) from `?scene=prologue&part=cutscene&t=…&freeze=1` on Metal |

### M4: QA, review, sign-off (≈ 2 days)
| ID | Owner (model) | Writes (exact) | Deps | AC + evidence |
|---|---|---|---|---|
| **P4.1** QA + perf | QA (**Sonnet**) | `apps/game/tests/perf/prologue.spec.ts`, `apps/game/tests/level/prologue-fx.spec.ts` (uses `fxProbe.ts`), `docs/perf.md` (a section) | P3.5, P3.6 | **Metal:** New Game → prologue (bot at 40 WPM) → cutscene → story → calibrate → L1 with **0 console errors**. Readability probe across Part B at max FX with 0 violations. Frame budget p95 ≤ 16.8 ms at tier 0 for B and C; tier 2 with 4× throttle ≥ 45 fps. `check.sh` green |
| **R1** Art review | Art director (**Opus**) | `docs/qa/prologue-review-1.md` + stills | P3.6 | A graded P1/P2/P3 backlog on Metal captures against `poc/v2-*`, Ch1 and the Ch2 boss decks |
| **P4.2** Polish | VFX / UI (**Sonnet**, two agents in sequence, not together: they share keep-out code) | as P3.2 / P3.3 / P3.6 | R1 | Every P1 and P2 closed with before/after stills |
| **R2** Final review + PO pack | Art director (**Opus**) | `docs/qa/prologue-signoff/` (JPEG only) | P4.2, P4.1 | The **PO sign-off pack:** a 16-keyframe contact sheet (§6) at 1920×1080 from Metal; side by side with `poc/v2-boss-intro.png`; the B-part readability sheet; the persona timing table from P1.3; perf numbers; the listen checklist; "how to watch" (`pnpm dev` → title → Start game, or `?scene=prologue&wpm-bot=40`); known issues |

### Batches (≤ 3 agents; no two agents in a batch share a file)
| Batch | Agents | Why it is safe |
|---|---|---|
| 1 | P0.1 contracts (Opus) · P0.2 direction (Opus) | Docs only, different files |
| 2 | P0.3 stubs (Haiku), alone | Touches sim, content, HUD and render ids |
| 3 | P1.1 sim · P1.2 content · P2.1 Nul sprite | `packages/sim` / `packages/content` + `tools/content` / `render/sprites/prologueArt.ts` |
| 4 | P1.3 bot timing · P2.2 Word Gate · P3.1 cutscene engine | `tools/bot` + `prologue.ts` / layout + props + biomes / `cutscene/**` + `stage.ts` + `main.ts` |
| 5 | R0 villain gate (Opus) · P2.3 knight anims · P3.4 audio | review doc / `proceduralArt.ts` / `audio/**` |
| 6 | P3.2 VFX · P3.5 flow | `render/vfx/**` + `eventBindings.ts` + `HeroAura.ts` / `app/**` + `session.ts` + `screens.ts` + `meta/ops.ts`. **P3.3 HUD waits for batch 7** because HUD and VFX share keep-out code (the Ch2 rule) |
| 7 | P3.3 HUD, then P3.6 timeline (P3.6 needs P3.3's ids) | — |
| 8 | P4.1 QA + perf · R1 art review (Opus) | Tests and docs only |
| 9 | P4.2 polish (VFX, then UI) | — |
| 10 | R2 + PO pack (Opus) → **PO sign-off** | — |

Rough total: about 12 agent-days over 10 batches. The critical path is P0.1 → P0.3 → P2.1 → R0 → P3.2 → P3.6 → R1 → P4.2 → R2.

---

## 6. Definition of Done and the keyframe set

**Keyframes for stills:**
- **Part A:** 2.5 crane, 6.0 ink drips.
- **Part B:** first Fireball, Slash Wave on the crowd, boss intro card, max-surge aura.
- **Part C:** 0.3 catch, 2.0 mask push, 8.0 knight flare, 11.5 ink line, 15.2 theft 3, 19.9 theft 6, 21.0 collapse + kneel,
  23.5 colour swirl, 33.0 vortex + fog, 42.5 shards + ember.

**Done when:**
1. A fresh profile runs New Game → prologue → story → calibration → L1 on Metal with 0 console errors. Existing profiles aren't
   forced. Skip and replay work from every part.
2. Can't lose is proven by the sim fuzz test. The bot timing windows (P1.3) pass, and every kit active fires in every persona run.
3. The Ch1 and Ch2 goldens, balance cells and bot output are byte-identical to `main` before the prologue (the balance task's own
   changes excepted). `check.sh` is green.
4. Readability: 0 violations at max FX in Part B, and the dialogue keep-out holds in Part C.
5. Perf: tier 0 p95 ≤ 16.8 ms, and tier 2 with 4× throttle ≥ 45 fps, on Metal.
6. R2 passes the art bar, and the **PO signs off** the pack.

---

## 7. Risks and questions for the PO

### 7.1 Risks
| Risk | Mitigation |
|---|---|
| VFX soup in Part B hides the next letter (6 actives + 9 passives at full power) | One kit cast per 1.5 s, the reserved Grimoire rect, existing keep-outs, a readability probe on the prologue, and a cap of ≤ 40 casts per minute in the bot AC |
| The kit slot widening ripples through the HUD and sim | Done once in P0.3 with the goldens as the gate. Story levels keep length 2 |
| The cutscene can't be reproduced for stills (particles) | Fixed-step integration from each cue start, seeded; the two-capture pixel test in P3.1 |
| Players still typing at the climax skip the dialogue | A 1.5 s input guard, and only Space or Enter advances a line |
| Desaturation also greys out the villain's read | The violet rim survives at `sat` 0.15 because it is bright. The stolen colours are on the HUD layer. R1 checks the luma |
| Beginners can't read the lines in time | Holds scale with length, a 2.2 s minimum, A2 words, at most 8 words, and Space to advance |
| It feels long for someone replaying New Game | Hold-Esc skip anywhere (1 s) |
| Merge collisions with the parallel balance task | Prologue numbers live in `prologue.ts`, not `balance.ts`. P1.1 lists `balance.ts` and `meta/**` as off limits. The golden comparison is against `main` at merge time |

### 7.2 Questions: RESOLVED 2026-10-10. The PO said "let's go", so the bold defaults are adopted: Nul, the Silent King; hold Esc for 1 s; the 6 Ch1 actives without Reveal; the shard tracker comes later.
1. **Villain name.** **"Nul, the Silent King"** (short, easy for learners to read and type), "Vesper, the Unwriter", or
   "The Hollow King"?
2. **Skip input.** **Hold Esc for 1 s anywhere, with a ring** (a tap of Esc in the fight still opens the pause menu, which has
   "Skip prologue"), or a tap of Esc plus a confirm dialog?
3. **Kit size.** The PO said "all 6 actives". Ch2 has since added **Reveal** (a 7th). **Show the 6 Ch1 actives.** Reveal would
   need a fading enemy, which is a gimmick a brand-new player shouldn't meet in the first minute. The list is data, so adding it
   later is a one-line change.
4. **Optional follow-up (not in this plan):** should the Ch1 HUD show the lost skills as grey shard slots, a visible "powers to
   regain" tracker? **Yes, later.** It touches the unlock UI next to the balance task's slow drip, so it should be scheduled
   after that task merges.

## Orchestrator rulings during the build (2026-10-10)
- **P1.3 feel:** the prologue is a power fantasy. Keep pace ≤ 50 and Nul's attack interval ≥ about 3 s, and keep hero HP ≥ 50% for most of the run. One heavy Nul strike early in the boss segment triggers Mending Light and the low-HP passives. Passive target: a union of ≥ 5 per persona. The first tune (pace 120, hero pinned at the 25% floor) was rejected.
- **P3.5 idle handling:** the sim has no timeout and an idle player never leaves wave 1. After 8–10 s with no input, show a "type any word" nudge. After 20 s, show the "Hold Esc to skip" ring. After 75 s idle, auto-advance to the cutscene.
- **P3.4 → P3.6 music cues:** the §14.4 `music` cue gets two optional client-only fields, `drone?: number | null` (a MIDI note, or null to release) and `swell?: true`. P3.6 adds them to `cutscene/types.ts` and routes them to `engine.musicDrone` / `engine.musicSwell`, so the arc stays data-driven. Timings: drone(38) at the start of Part C, swell at about C 9.6 s. P3.4's edits outside its ownership (`sfx.ts`, `ambience.ts`, `engine.ts`) are accepted. The final drone level and the §5.4 dB offsets are settled in the PO listen pass.
- **P2.2 follow-ups (owners noted):**
  - P3.2/P3.6: spawn `prop.prologue.sword` at the `sword` anchor for the fall beat.
  - P3.6: cutscene prop lookups match the key `prop.prologue.wordgate`, because layout props have no `id`.
  - P3.2: the sun Glow quads don't fade with the theft ramp, so the VFX layer or mood should dim them stepwise.
  - P4.2 polish: the ruins ground still renders lush green; the backlit-stone tint is a workaround.
  - ~~Tech debt: `layout.ts` only accepts `chN-lNN` ids, so `prologue.json` carries the placeholder id `ch1-l00` and `loadLevel("prologue")` renames it. Fix the regex and add a prologue-layout load test (mood tweak equals `STORM_GOLD`).~~ Done 2026-10-10.
- **P3.2 merged (orchestrator review of the stills).** For R1 and P4.2:
  - (a) Weak cues: the skyTear open, the inkWrite sparks, the catch crumble and the grey theft ribbons. The aura collapse reads as white puffs, not a collapse.
  - (b) `clusterC-densest`: Nul appears to float at the top of the gate, and a large "OH" glyph sits on his cloak. Check the actor y and the glyph placement during the vortex.
  - (c) `partB-maxfx` (mock driver, Golem stand-in): orbiting letters bunch up next to the guard plate. Re-probe on the real session once P3.5 lands.
  - Integration jobs for P3.6, from the P3.2 report:
    - apply `inkRiseOffsetY` in the stage;
    - spawn the sword prop;
    - add the auraCollapse camera shake and the 160 ms catch hit-stop;
    - remove the combat Fireball projectile on `PrologueClimax`;
    - apply fog density from `PrologueFx.out`;
    - keep `auraCollapse` active to the end of Part C.
  - Possible tweak: `hushBolt` lands about 440 ms after the damage. If that reads late, retrigger on windup.
- **P3.5 merged.** prologueFlow 11/11 passed on main against the real Word Gate layout; the stills were re-captured there.
  - **bossMinS:** P3.5 reported that it counts across encounters. The orchestrator checked: `combatTicks` resets at each `EncounterStarted` (`level.ts`), so the boss gets its own 20 s. **P4.1** measures the boss-segment duration in the browser at 40 and 75 WPM to confirm.
  - **R1/P4.2 notes from the stills:** every grunt shows a "50%" guard-leak badge (attackPower 16). That is a lot of noise in a new player's first minute; consider hiding the leak badge in the prologue. The GOLD counter shows 0; consider hiding gold in prologue mode (P3.3).
  - **P3.6 wiring:** swap `PROLOGUE_TIMELINES` in `app/prologueTimelines.ts`; replace the placeholder `drain()` in `session.ts` with the real `UNWRITTEN` blend; route the hud, vfx and music cues (only sfx is routed now). Mount P3.3's HUD skip ring and nudge in place of `app/prologueOverlay.ts`.

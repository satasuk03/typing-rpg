# PO sign-off pack: Chapter II, "The Hushwood" (Opus reviewer, 2026-10-10)

**What it is.** Ch2 is the second chapter of 10 levels, played on "The Lantern Road" map tab. It moves through three biomes: the moonlit **Hushwood** (L1–L4), the **Lantern Fen** with still water (L5–L9), and **Willow's Heart** (L10). The boss is the **Whispering Willow**. Its phases are adds, then Hush Spells, then the new **Riddle of Leaves** (read a definition and type the matching word), then a finisher that frees the Willow rather than killing it.

Ch2 adds these new things:
- capitals, in boss sentences only, with a ⇧ cue and an "Ignore capitals" assist;
- a healer, the Moth Mender;
- an elite, the Gloom Wolf, which carries a gold tag and a guard-leak badge;
- the armor "guard leak" lever;
- two skills, Reveal and Calm Mind.

**How the pack was made.** Everything here comes from `main` at `fb0c35a`, which is also what https://satasuk03.github.io/typing-rpg/ serves. That build was deployed and smoke-tested live on `?scene=play&level=ch2-l10&wpm-bot=60`: the bot played and there were 0 console errors.
- **Capture.** 30 stills on the real Metal GPU (ANGLE Metal, Apple M4 Pro), headless `chromium` at 1920×1080 and DPR 1. All are JPEGs under 400 KB, 9.4 MB in total.
- **Method.** Each still is a live bot run, captured on the sim event named in its caption. Nothing is frozen, so a still shows whatever transient effects were up at that instant.
- **Console errors.** 0 in every capture session.

## 1. How to play it

- **Live game:** https://satasuk03.github.io/typing-rpg/
  - New players start in Chapter I. Chapter II unlocks when you clear Ch1 L10.
  - The dev routes below also work on the live URL.
  - The live site saves locally only, because the backend is not deployed yet.
- **Watch the boss:** `?scene=play&level=ch2-l10&wpm-bot=60`. Use 30 for a slow typist and 90 for a fast one. Add `&seed=7` to replay this pack's run.
- **Play the boss yourself:** `?scene=play&level=ch2-l10`. Any level `ch2-l01` … `ch2-l10` works.
- **Full player flow:** go to the plain URL, then Title → Map → Chapter II tab.
  - Before Ch1 is cleared, the tab shows "Clear Level 10".
  - Ch2 L1 opens with the typed intro card, which teaches Shift.
  - Settings → "Ignore capitals" is the assist. It is story-mode only and has no reward penalty.
- **Audio listen pass:** `docs/qa/ch2-t3.3/listen-checklist.md`. The PO has to tick it, because the audio worker cannot hear. It is not signed yet.

## 2. Definition of Done (CH2_PLAN §6). "Re-run" means re-run for this pack.

| DoD line | Result | Evidence |
|---|---|---|
| **1. Bots** | **PASS** (re-run) | Full bot table below. `pnpm balance --chapter 2`: exit 0, every cell PASS, numbers identical to `docs/balance-ch2.md` §2. Ch1 31/31 unchanged (in `check.sh`). |
| **2. Upgrade lever** | **PASS, with one caveat** | Reference damage vs budget: **0.999× at par**, **1.289× at par−2** (target 1.25–1.35). Beginner Willow clear by armor: C+0 **25.4%**, par C+2 **88.0%**, C+5 **97.9%** (1000 seeds). Leak at par: grunt 6.6%, elite 20.0%, Willow 23.1%. HUD shows the leak badge, see #17. **Caveat:** true "no upgrades" (C+0) is a 25% wall for Beginners. The PO ruled (Q1) that "no upgrades" means no *Ch2* upgrades: 64.7%. See `docs/balance-ch2.md` §6–7. |
| **3. Perf** | **PASS, except the soak** | Quiet Metal re-measure (`docs/perf.md`): frame budget **16/16 at vsync**, p95 16.7–16.8 ms on every tier. That includes tier 2 at 4× CPU throttle on ch2-l03 (hushwood), ch2-l07 (fen with water) and ch2-l10 (grove). Typing costs **0.41 ms/key** against a 0.45 budget. **Gap:** no 30-minute *Ch2* soak has been run; the only soak is ch1-l05. |
| **4. Zero console errors** | **PASS** (re-ran a subset) | Full Title → Ch1 → Ch2 run (`tests/perf/full-ch1-ch2.spec.ts`): **32.4 min wall, all 20 levels cleared first try, 0 errors** (T5.2, from HANDOFF; not re-run for this pack). **Re-run:** `tests/perf/ch2-levels.spec.ts` on Metal, **3/3 passed in 5.1 min**: ch2-l01 cleared (59 s), ch2-l05 cleared (91 s), ch2-l10 cleared (154 s), 0 console errors and 0 in-page errors each. Some of my still captures ran at the same time; that only adds load. |
| **5. Save / sync** | **PARTIAL** | Unit tests: `apps/game/tests/app/chapters.test.ts` shows an old Ch1-cleared save opening Ch2 with no migration. `ch2Flow.test.ts` shows that Ch2 progress and the intro-seen flag survive a reload, and that the merge keeps them. In the browser, `ch2Flow.spec.ts` reloads and keeps frontier 2. The full Ch1→Ch2 run uses the real save. **Not shown for Ch2:** a second browser through cloud sync. `test:net` covers it, but it is chapter-agnostic, Ch1-era and not re-run. The backend is not deployed. |
| **6. Readability and juice** | **PASS, with one intermittent invariant** | `check.sh` HUD step: readability, guard-leak and **ch2Hud** sweeps (riddle panel, ⇧ cue, tags/badge, fading, heals), **23 passed**. **The real-runner sweep on L2-1/L2-5/L2-10 is not in the repo.** I ran an ad-hoc copy of `tests/level/typing-fx.spec.ts` on Metal (Found #2): L2-1 0 violations (41 next-letter checks); L2-5 0 (71); L2-10 0 violations in 2 of 4 runs and 1–2 "letter outside its plate" in the other 2. Next-letter contrast was always ≥ 4.16 against the ring and ≥ 5.47 against the cell (limits 3 and 4.5). Per-key 0.41 ms. |
| **7. Gates** | **PASS** (re-run), STATUS gap | `bash scripts/check.sh` → **CHECK PASS, exit 0**. 1669 unit tests in 104 files, typecheck, Biome (PASS, 1 warning), content validate, determinism, purity, Node↔Chromium parity, HUD sweeps, bot quick. `docs/interfaces.md` is at v2.0.3. **Gap:** `docs/STATUS.md` has no Ch2 task lines; Ch2 evidence lives only in the merge commits and TODO. |

**Bot table** (`pnpm bot --chapter 2`, 20 seeds, re-run: **BOT PASS**; first-try clears and mean active minutes):

| Level | Beginner 20 WPM | Average 40 WPM | Fast 75 WPM |
|---|---|---|---|
| L1 Moonward Trail | 95% · 2.74 m | 100% · 1.55 m | 100% · 1.08 m |
| L2 Lantern Path | 100% · 2.88 | 100% · 1.63 | 100% · 1.14 |
| L3 Hollow Oaks | 100% · 4.39 | 100% · 2.36 | 100% · 1.64 |
| L4 Owl's Rest | 100% · 4.82 | 100% · 2.55 | 100% · 1.70 |
| L5 Mirewater Edge | 100% · 4.47 | 100% · 2.47 | 100% · 1.68 |
| L6 Sunken Shrine | 100% · 4.49 | 100% · 2.45 | 100% · 1.75 |
| L7 Reedmaze | 100% · 4.73 | 100% · 2.60 | 100% · 1.75 |
| L8 Firefly Crossing | 100% · 5.15 | 100% · 2.61 | 100% · 1.71 |
| L9 Weeping Reach | 100% · 5.25 | 100% · 2.78 | 100% · 1.83 |
| **L10 Willow** | **85%** · 8.61 | 100% · 4.38 | 100% · 3.11 |

**Balance key cells** (200 seeds; the boss window was also run at 1000):

| Cell | Value | Target |
|---|---|---|
| Beginner Willow clear | **87.5%** (88.0% at 1000 seeds; 76.7% with realistic gimmick reading) | 75–90% |
| Beginner normal levels | 99.6% mean, 98.5% worst | — |
| Boss times, Beginner / Average / Fast | 8.56 / 4.41 / 3.12 min | 8.1 / 4.4 / 2.8 ±15% |
| Skill share | 17.0 / 15.5 / 14.8% | — |
| Riddles | 0 timeouts; wrong answers 10.6 / 6.5 / 2.8% | — |
| Hush Spell fails | 5 in 634 for the Beginner | — |

## 3. PO decisions and how they landed

| Decision | Landed as | See |
|---|---|---|
| Q1 Boss signature: Riddle of Leaves | Five riddles, then the finisher. Each riddle shows a simple-English clue, three leaf plates with distinct first letters, and a 15 s timer scaled by pace. A right answer is a heavy hit (91 in #23); a wrong answer or a timeout is a mild hit plus hero damage (−7 in #24). The panel shows "Last: right – hoof". | #22–#25 |
| Q2 Capitals in boss sentences only, ⇧ cue, assist | Plates stay lowercase. Exact case is used for Hush Spells, the finisher ("Rest now, Willow, …"), Second Wind and the typed intro card, which really needs Shift. The ⇧ box sits next to the plate. "Ignore capitals" is in Settings: story only, default off, free of reward penalties; future ranked modes will force it off. | #04, #05, #19, #20, #26 |
| Q3 Only two new mechanics: healer and elite | The Moth Mender (✚ badge, green "+9" heal pops) and the Gloom Wolf elite (gold ELITE tag, with a 20% leak badge beside it). Nothing else is new. | #16, #17, #14 |
| Q4 No Leagues or Survival in Ch2 | Not built, and the menus have no dead buttons. The hub is Loadout, Gear, Shop, Caches, Word Journal, Typing Trial, Settings. | #03 |
| Q5 Procedural art at production quality, gated by Opus reviews | Review R2 (`docs/qa/ch2-review-1.md`) found 3 P1, 12 P2 and 23 P3. **All 3 P1s are fixed:** the HP shows "122 / 122"; ELITE and the badge sit side by side; the Willow stays visible through the Hush Spell (#19). The variety passes gave all 10 levels their own identity (#06–#15). The Willow fix added scale, face light, dawn and blossoms. | `ch2-p1-hud/`, `ch2-variety/`, `ch2-variety-2/`, `ch2-willow-fix/` |
| Q6 Beginner boss clear 75–90% at par, 55–70% without upgrades | 88.0% at par. Q1 follow-up ruling: "no upgrades" means no Ch2 upgrades, which gives 64.7%. True C+0 is 25.4% (see DoD 2). | `balance-ch2.md` §5–6 |
| T5.1 Q2: loadout hint before L10 | "Before the Willow" modal. It appears when Aegis is unlocked but not equipped, and offers Open loadout or Play anyway. | #29 |
| Fading style in every chapter | The next letter is never below 85% opacity and has a violet underline, Ch1 included. | #18, #30 ("pull") |
| Default Ch2 kit | Fireball + Aegis, Clean Cut + Iron Will; Calm Mind from L6. Scholar is **deferred** (reserved id, no "new word" definition yet). | `balance-ch2.md` §1.1 |

## 4. Stills

The route for the battle stills is `?scene=play&level=<id>&wpm-bot=60&seed=7&audio=0`. Each caption gives the moment it was taken.

| # | Still | What to look at |
|---|---|---|
| 01 | `01-title.jpg` | Title screen with the "Typing Adventure" pixel logo. It still reads "Chapter I · The Ember Road" because this is a fresh save. |
| 02 | `02-ch1-complete-ch2-unlock.jpg` | **The unlock moment.** Chapter Complete shows "New chapter unlocked: Chapter II: The Lantern Road", the Shift hint, and "Enter Chapter II" focused. |
| 03 | `03-map-chapter-tabs-ch2-open.jpg` | Map with the **Chapter I / II tabs**. L1 is marked NEW, L2–L10 are locked, and the L10 node has a crown. |
| 04 | `04-ch2-intro-card.jpg` | The typed intro card, "Welcome to the Hushwood, Ember Knight." It has no fail state. |
| 05 | `05-intro-card-shift-cue.jpg` | Line 2 at a capital: "Hold [Shift] and press [S]". |
| 06 | `06-ch2-l01-battle.jpg` | L1 Moonward Trail, encounter 2: wisp, shade and the Ch1 bat (review). Cold silver moon with teal mushrooms. |
| 07 | `07-ch2-l02-battle.jpg` | L2 Lantern Path, where the healer debuts. Warm lantern avenue; the Moth Mender (✚) takes a 28-damage hit. |
| 08 | `08-ch2-l03-battle.jpg` | L3 Hollow Oaks: violet-black, with colossal trunks. The hero is dim. See Found #4 for the enemy under the combo readout. |
| 09 | `09-ch2-l04-battle.jpg` | L4 Owl's Rest: silver-gold moon clearing and the owl roost. |
| 10 | `10-ch2-l05-battle.jpg` | L5 Mirewater Edge, the first fen level: golden shallows, lilies and the boardwalk. |
| 11 | `11-ch2-l06-battle.jpg` | L6 Sunken Shrine: green dusk. A SCRAMBLED plate ("asop"), FIRE WEAK and BREAK on the healer. |
| 12 | `12-ch2-l07-battle.jpg` | L7 Reedmaze: a tight amber reed corridor and a scrambled wisp. |
| 13 | `13-ch2-l08-battle.jpg` | L8 Firefly Crossing: blue-hour lamp line, a toad, a FADING "ever" (next letter white) and a SCRAMBLED plate. This is peak gimmick density. |
| 14 | `14-ch2-l09-battle.jpg` | L9 Weeping Reach: violet curtains and the **Gloom Wolf elite** (gold outline, ELITE plus 20%). |
| 15 | `15-ch2-l10-willow-phase1.jpg` | L10 phase 1: the Willow with a Shade and a Moth Mender as adds (20% leak each). The boss bar shows 23%. |
| 16 | `16-heal-moth-mender-l06.jpg` | **Heal:** the mender heals two allies, shown as green "+9" pops. Taken at L06, 25 WPM, the EnemyHealed event plus 120 ms. At 30 WPM on L02 the bot killed the mender before it could cast. |
| 17 | `17-elite-gloom-wolf-tag-badge-l04.jpg` | **Elite debut** at L4 encounter 3: ELITE tag and "20%" badge side by side, against 6.6% (shown "7%") on the grunts. |
| 18 | `18-fading-word-l03.jpg` | **Fading "mean":** "me" is typed and the next letter "a" is white with the cursor bar, so it stays readable. Confetti crosses the "FADING" label (Found #5). |
| 19 | `19-hush-spell-shift-cue.jpg` | **Hush Spell plus ⇧ cue:** "Under my boughs, the night never ends." The ⇧ box sits at the capital U, and the Willow stays visible (P1-3 fixed). |
| 20 | `20-hush-spell-capital-typed.jpg` | 60 ms after the capital U is typed: the U turns gold-pink and the case icon shows. |
| 21 | `21-willow-phase2.jpg` | Phase 2 between spells: the trunk reads clearly, and the target plate sits at its crown. |
| 22 | `22-willow-phase3-riddle-panel-leaves.jpg` | **Riddle panel plus leaves:** "I am a small red beetle with black spots." The leaves are plum, cloak and ladybug, and the panel shows "Last: right – hoof". **The Willow is hidden behind the panel and leaves (Found #1).** |
| 23 | `23-riddle-right.jpg` | **Right answer** ("hoof"), 200 ms after RiddleResolved: the letters slam into the Willow for 91. |
| 24 | `24-riddle-wrong.jpg` | **Wrong answer** (typed "cloak"; the answer was "ladybug"), 250 ms after: the letters still fly in, and −7 lands on the hero. The wither barely reads (P2-11). |
| 25 | `25-riddle-same-frame-hud-off.jpg` | The same riddle moment with the HUD canvas hidden. The Willow *is* drawn, but as a pale lavender ghost with gold frond outlines (Found #1). |
| 26 | `26-finisher-sentence.jpg` | Finisher: "Rest now, Willow, and let the words go home." The plate is readable with the capital typed. |
| 27 | `27-freed-finisher-push-in.jpg` | FinisherCompleted plus 1.7 s: the push-in on the face. It is a blurred, abstract close-up (Found #6). |
| 28 | `28-freed-dawn-level-clear.jpg` | FinisherCompleted plus 6.5 s: the **dawn crossfade**, with warm light and green ground, LEVEL CLEAR, and the chest. The Willow trunk is still dark violet. |
| 29 | `29-l10-loadout-hint.jpg` | The **"Before the Willow"** loadout hint over the Ch2 map. L1–L9 show REPLAY and L10 shows NEW. |
| 30 | `30-ch1-l05-comparison.jpg` | **Ch1 L5 for comparison**, same bot and seed 4. Daylight forest; note that the new fading style ("pull") applies here too. |

## 5. Found during sign-off prep (verified on current main, not papered over)

1. **P1 (art), by the review's own P1-3 precedent: the Willow vanishes for the whole riddle phase.**
   - The riddle panel (y ≈ 185–375 at 1080p) and the three leaf plates are laid out right over the boss. The boss body projects to about (1180, 322). With the HUD on, only the rune ring and the root collar show (#22). The antagonist cannot be found during its signature phase.
   - Underneath, the GL frame shows the Willow in its riddle state as a washed, pale lavender ghost (#25). That frame was taken 0.5 s into riddle 1, before any answer, so this is the riddle *state* itself and not the right-answer burst that P2-4 capped.
   - Readability is unaffected: every plate and the clue are legible.
   - **Fix options:** anchor the riddle panel and leaves to the left or centre-left, off the boss rect, and keep the trunk at its phase-1 value during `riddle`.
2. **The DoD 6 real-runner readability sweep for Ch2 is not in the repo, and the L2-10 HUD invariant is intermittent.**
   - What I ran: an ad-hoc copy of `typing-fx.spec.ts` (Metal, 1280×720, intensity 1) on ch2-l01, ch2-l05 and ch2-l10.
   - L10 failed 2 of 4 runs on "letter outside its plate". The captured case was the Hush Spell "Under my boughs, the night never ends." The last glyph of line 1 sits 1 px past the 8 px tolerance, so the wrap margin on the 2-line doom plate is too tight.
   - It is legible and contrast holds. But if this sweep joins `check.sh` as the DoD intends, it will flake.
3. **The menus always show the Ch1 daylight forest** (P2). `apps/game/src/app/backdrop.ts` hard-codes `ch1-l01`. So the Chapter II map tab, the unlock card, the Ch2 intro card and the Willow hint (#02–#05, #29) never look like the Hushwood. A biome-per-chapter backdrop would sell the unlock moment much better.
4. **L3 encounter 2 places the back-right enemy under the combo / key-streak readout** (P2), in both #08 and #18. That enemy is the Moth Mender, the target-priority enemy. Its sprite is half covered and its plate ("slab") sits against the stats panel. Plates stay readable.
5. **Keystroke confetti and comets cross HUD labels** (P3-2 from the review, still open). They cover the FADING, SCRAMBLED, LEAF-timer and "RIDDLE OF LEAVES" labels. In #22 a gold comet also crosses the clue text, which is the reading test (P2).
6. **The freed finale is still weak at the push-in** (#27; known per TODO). It is a blurred close-up, the "soft smile" face is not readable, and the full HUD stays up during the finisher cinematic. The dawn at +6 s (#28) does land.
7. Still open from R2, as seen in this pack:
   - P2-6: the riddle pick highlight is a pale rectangle behind the picked leaf (#22).
   - P2-11: right and wrong look alike on the boss and the wither barely reads (#23 vs #24).
   - P2-7: the Hush Shade is near-black on dark trunks (#14, #15).
8. Minor, P3:
   - The leak badge's "%" glyph reads like "z" in the pixel font ("7z").
   - Naming is inconsistent. The unlock card says "Chapter II: The Lantern Road", while the plan's title card is "Chapter II: The Hushwood". The intro card says only "Chapter II".
9. **Process gaps:**
   - `docs/STATUS.md` has no Ch2 task lines (DoD 7).
   - No 30-minute Ch2 soak has been run (DoD 3).
   - The cloud-sync second-browser test has not been run for Ch2 (DoD 5).

**Confirmed fixed and holding:** P1-1 (HP "122 / 122"), P1-2 (ELITE and badge side by side), P1-3 (the Willow is visible in the Hush Spell), the fading next letter at ≥ 85% opacity, the ⇧ cue, the heal pops, and the variety of the 10 levels. There were 0 console errors across every session.

## 6. Known gaps (backlog)

- **Art backlog** (`docs/qa/ch2-review-1.md` plus the TODO follow-ups):
  - **P1: 0 of 3 open**, plus the new Found #1.
  - **P2: 7 of 12 open:** P2-6, 7, 8, 9, 10 (lighting partly done in the variety passes), 11 and 12 (flaky freed-finale keep-out probe, margin 2–29 against 215). P2-2 and P2-3 are only partly done: the Willow face is still dark.
  - **P3: 22 of 23 open.** P3-21, the fen perf re-measure, is done.
  - From the TODO list: L6's shrine gate is cut off by the top of the frame; L7's reed wall looks coarse; the Willow lacks front frond curtains and breath/sway animation; the Ch1 flipped-normal proposal needs a PO call.
- **Scholar deferred.** It needs a PO definition of what counts as a "new word".
- **Leagues and Survival:** deferred to Meta-1, after the backend deploy.
- **Backend not deployed.** The live game is local-only (IndexedDB), with no leaderboard and no cloud sync.
- **Audio** is not PO-approved yet (listen checklist above).
- **The ★★★ par-time star** is near-free in both chapters (`balance-ch2.md` §7).

## 7. What the PO should try and judge (about 20 minutes)

1. **Unlock moment:** go Title → Map → Chapter II tab → L1. Do the intro card and the Shift lesson feel like a new chapter, even though the backdrop is still Ch1's forest (Found #3)?
2. **Hushwood and fen, by hand:** play ch2-l02 and ch2-l08. Can you spot the healer (✚) and want to kill it first? Do the fen's water and lanterns feel distinct from Ch1? Is the night mood good, not just dark?
3. **Elite and leak:** play ch2-l04. Does the ELITE/20% badge, plus the results hint "Upgrade Armor in Gear", make you want to buy armor?
4. **Willow, by hand (`?scene=play&level=ch2-l10`):**
   - Does each Hush Spell, with the ⇧ cue, feel fair?
   - Do the riddles feel like the climax, or does the boss disappear for them (Found #1)?
   - Does freeing the Willow feel like a release?
5. **Watch at 30 WPM** (`&wpm-bot=30`): is a Beginner's Willow fight (about 8.5 minutes) tense rather than a slog?
6. **Readability:** across all of the above, can you always read the next letter and the riddle clue?
7. **Audio:** tick `docs/qa/ch2-t3.3/listen-checklist.md`.

## 8. Sign-off question

**Do you sign off Chapter II as shipped on `main` (fb0c35a, already live)?** Pick one:
- **(a) Yes, as is.** Found #1 to #9 go to the polish backlog.
- **(b) Yes, conditional on two fixes:** Found #1 (move the riddle panel and leaves off the Willow, and keep its riddle-state body readable) and Found #2 (widen the Hush Spell wrap margin, and add the Ch2 real-runner readability sweep to the gate). Neither needs a balance change.
- **(c) Not yet:** list what has to change first.

**Reviewer's recommendation: (b).** Systems, balance, perf, errors and readability meet the DoD. The one thing below the Ch1 bar is the Willow going missing behind its own riddle UI. That is the climax of the chapter, so it is worth a small layout fix before calling the art bar met.

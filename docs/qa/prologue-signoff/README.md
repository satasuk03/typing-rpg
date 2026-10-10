# PO sign-off pack: Prologue, "The Unwriting" (Art Director, Opus, 2026-10-11)

**What it is.** The prologue is the first thing a new player sees after pressing Start game. It runs about 2 minutes, in three parts:
- **Part A, the cold open (about 8 s):** a crane over the Word Gate at dusk, where ink pools rise.
- **Part B, playable (about 50 s):** the real game sim. The Ember Knight is at **full power**, with all 6 actives (Fireball, Aegis, Slash Wave,
  Piercing Thrust, Mending Light, Frost Lock) and 9 passives. He fights **a crowd of Shades and Wisps** in two waves, then the boss,
  **Nul, the Silent King**. The player cannot lose.
- **Part C, the cutscene "The Unwriting" (about 58 s):**
  - Nul catches the knight's Fireball in his palm.
  - He **tears the six skills out of the knight one by one**, and the world drains from gold to grey in six steps.
  - The knight's aura collapses, he kneels, and his sword falls.
  - Nul rises into a tear in the sky, and the gate's words go dark.
  - One last spark lands in the knight's hand: "Find your words again." The story card follows, then calibration, then Ch1 L1.

These are the four things the PO asked for, and where they are in the pack:

| PO ask | Where | Look at |
|---|---|---|
| A prologue that shows off a short game demo | Part B: real typing, the real HUD, every kit skill cast 3–5 times | `01` cells 3–6, `03`, `07` |
| Full, amazing graphical, magical skills | Part B casts, the knight's flare, the theft ribbons | `01`, `07`, `10` |
| A fight with a boss and a group of monsters | Part B waves 1–2 (crowd), Nul's entrance, the boss fight | `01` cells 3–6, `02`, `03` |
| A cutscene where the hero loses all his power | Part C, 16–25 s: six thefts, collapse, kneel, colour drained | `05`, then `06` for the last spark |

**Status.** R2, the final art review, says **ready for PO**: all 11 R1 P1s are closed and there are no blockers. Details are in
`docs/qa/prologue-review-1.md` § R2. What remains is P2/P3 polish for the backlog (§ 6 below).

**How the pack was made.**
- **Build:** `main` at `0a52734` (P4.2 WP-A and WP-B merged).
- **Capture:** real Metal GPU (ANGLE Metal, Apple M4 Pro), headless `chromium`, 1920×1080 and 1280×720, DPR 1.
- **Setup:** a fresh profile, then Start game into the real prologue session. Bot: wpm-bot 45, seed 7, accuracy 0.97.
- **Frames:** A and C frames are parked on their timeline time (`__play.proSeek`). Part B frames are live.
- **Console errors:** 0 in every session.
- **Files:** all JPEG, each under 200 KB, 1.9 MB in total.

## 1. How to watch

Run `pnpm dev`, then open `http://localhost:5173/`.

| Way | How |
|---|---|
| **As a new player (the real flow)** | Use a fresh profile: a private window, or clear site data. On the title screen press any key, then **Start game**. The prologue plays, then the story card, then calibration, then L1. Existing profiles are never forced into it. |
| **Replay from the title** | Use the title's **Prologue** button. It replays the whole prologue (A, B, C) and returns to the title. It does not touch your save. |
| **Watch it hands-free** | Open `http://localhost:5173/?wpm-bot=45`, then press Prologue or Start game. A bot types Part B. Use 20 to see a beginner and 75 for a fast typist. |
| **Cutscene only (dev route)** | `?scene=prologue&part=cutscene&tl=open` plays Part A, then Part C. `&tl=unwriting` plays Part C alone. Add `&t=<ms>&freeze=1` to park on a frame, for example `&tl=unwriting&t=24000&freeze=1` for the kneel. |
| **Skip** | Hold **Esc** for 1 s anywhere; a ring fills. In Part B, a tap of Esc opens pause, which has "Skip prologue". Space or Enter fades a dialogue line early. |

## 2. The stills

| # | File | What to look at |
|---|---|---|
| 01 | `01-keyframes-16-1920.jpg` | **The 16 keyframes** of PROLOGUE_PLAN §6, at 1920×1080 on Metal. A: the crane and the ink pools. B: the first Fireball, Slash Wave on the crowd, the NUL card, the ×16 surge. C: the catch, the mask push, the flare, the ink line, theft 3, theft 6, the kneel, the swirl, the vortex, the last spark. The Part A crane is at 4.0 s, because 2.5 s is still the black "Long ago…" title card, and the C times are the WP-B retime. |
| 02 | `02-boss-intro-vs-poc.jpg` | **Side by side with the bar**, `poc/v2-boss-intro.png`. Nul's silhouette, card and letterbox match or beat the Golem. The frame is darker and richer (p50 luma 0.024 vs 0.052; dark px 52% vs 41%). It is weaker on the tear (a white column, not a dark lens) and on ambient particles. |
| 03 | `03-partB-readability.jpg` | **Part B readability** at max FX, with 4 live frames: the first Fireball, wave 2, the boss with pops, the boss under Frost Lock. Every plate and next letter is legible. Pops sit beside Nul and never on his mask. |
| 04 | `04-partB-plates-zoom.jpg` | The plate band at 1:1 pixels. The underlined cell is the next letter. |
| 05 | `05-power-loss-strip.jpg` | **The power-loss moment**, C 16.4 to 24.5 s: Fireball torn out; the Grimoire emptying; all six gone; the aura collapse in a push-in; the kneel; the sword down and the colour gone. |
| 06 | `06-last-spark-strip.jpg` | The ending, C 34 to 54 s: the gate goes dark, "My words... are gone.", a shard falls, the ember in his palm, "No. One spark is left.", the walk-off caption. |
| 07 | `07-1920-boss-fight.jpg` | A full-size live frame of the boss fight: the low-key dusk grade, Nul in ink, the knight's face lit. |
| 08 | `08-1920-colour-swirl.jpg` | Full size, C 26.8 s: the stolen colours spiral inside Nul's cloak, "Now the world will be quiet." |
| 09 | `09-1920-ember.jpg` | Full size, C 46.5 s: the ember in the open palm, the only warm light in a grey world. |
| 10 | `10-1920-knight-flare.jpg` | Full size, C 10.4 s: the knight flares to full power, "Your Silence ends here!" (the line is still typing out). |
| 11 | `11-keyframes-1280.jpg` | The same beats at 1280×720, to show the framing holds on a smaller screen. |

## 3. Timing: bot personas and wall times

**P1.3 bot gate** (`pnpm bot --prologue`, re-run for this pack: **BOT PASS**, 20 seeds × 3 personas, deterministic). "Typing s" is Part B
typing time; the window is judged on the persona mean.

| Persona | Typing s min / mean / max | Window | Passives seen (min, union) | Max casts / min | Min HP % | Fails |
|---|---|---|---|---|---|---|
| Beginner (20 WPM) | 46.8 / **53.1** / 68.5 | 50–65 | 5 (union 8) | 31.3 | 25.0 | 0 |
| Average (40 WPM) | 41.3 / **45.0** / 51.9 | 38–50 | 6 (union 7) | 32.0 | 56.4 | 0 |
| Fast (75 WPM) | 35.1 / **38.5** / 43.6 | 28–40 | 4 (union 6) | 32.5 | 56.4 | 0 |

Each kit active casts in every run (mean / min casts per run):

| Persona | Fireball | Aegis | Slash Wave | Piercing Thrust | Mending Light | Frost Lock |
|---|---|---|---|---|---|---|
| Beginner | 4.4 / 3 | 3.6 / 2 | 4.6 / 3 | 5.0 / 4 | 2.9 / 1 | 3.8 / 2 |
| Average | 4.2 / 4 | 4.0 / 3 | 4.1 / 4 | 4.0 / 4 | 3.5 / 3 | 3.4 / 3 |
| Fast | 4.0 / 4 | 2.3 / 1 | 4.0 / 3 | 3.5 / 3 | 3.1 / 3 | 3.0 / 3 |

**Measured wall times** (real Metal run, fresh profile, real time, minimum line holds; `prologueFullRun`):

| Part | Wall time |
|---|---|
| A, the cold open | **7.9 s** |
| B, playable | **≈ 50 s**: 53.3 s at 40 WPM (re-run for this pack), 48.2 s at 75 WPM. The boss segment has a 20 s floor |
| C, "The Unwriting" | **57.6 s** to the story card. Lines no longer freeze the picture: 0 static seconds out of 57 |
| Total to the story card | about **1:59** |

## 4. Perf (from `docs/perf.md` "Prologue (P4.1)", plus the P4.2 re-run)

Budget: tier 0 p95 ≤ 16.8 ms, and tier 2 with 4× CPU throttle p95 ≤ 22.2 ms (≥ 45 fps). Measured on Metal, M4 Pro, 1920×1080, vsync-locked.

| Window | Tier 0 p95 | Tier 2, 4× throttle p95 |
|---|---|---|
| Part A | 16.8 ms | 16.8 ms |
| Part B (real sim, about 3.1k frames) | 16.8 ms | 16.7 ms |
| Part B at the highest surge reached (×4 at 40 WPM) | 16.8 ms | 16.7 ms |
| Part C | 16.7 ms | 16.7 ms |
| C theft beats (14–22 s) | 16.7 ms | 16.8 ms |
| C vortex + fog (30–43 s) | 16.7 ms | 16.7 ms |

- **First-frame hitch:** P4.1 found a one-off hitch on the first Part B frame, 50 ms at tier 0 and 133 ms at tier 2 throttled. After the
  WP-A prewarm it is **gone at tier 0** and **one dropped frame (33.3 ms) at tier 2 throttled**.
- **Sources:** `docs/qa/prologue-p4.2a/README.md` and `docs/qa/prologue-p4.2b/perf-prologue-metal.txt`. `docs/perf.md` still shows the
  P4.1 table.
- **Result:** both budgets **PASS**.

**Readability** (`tests/level/prologue-fx.spec.ts`, the real session at max FX, Metal, re-run for this pack):
- **0 violations** at 40 and at 90 WPM.
- Minimum next-letter contrast: 4.19 against the ring and 6.50 against the cell at 40 WPM; 4.19 and 5.63 at 90 WPM. The limits are 3 and 4.5.
- Part C dialogue contrast is at least 9.08 (limit 7).
- 306 Nul-mask samples, with 0 pops on the mask.

## 5. Audio: listen pass (the PO has to tick it)

The audio worker can't hear, so the prologue sounds still need a human listen. Open
`apps/game/src/audio/LISTEN_CHECKLIST.md`, **section "Prologue (P3.4)"**, and run `pnpm dev`, then
`http://localhost:5173/?scene=audio-test`:
- Press any key once to unlock audio.
- Use the **Prologue sounds** and **Prologue music** rows. Key `8` plays the prologue bed, and **"full arc (~65 s)"** plays the whole music
  arc.
- The list covers the theme, the catch cutting the music, the six theft cracks stepping down, the heartbeat, the ember chime and the end
  motif.
- The final drone level and dB offsets are settled in this pass.

## 6. Known issues and backlog (none blocks; art doesn't block milestones, per the PO ruling of 2026-10-10)

From R2, new:
- **The mask is matte.** Nul's mask body is bone-grey (luma about 0.22), and only the eyes and the lower mask glow. A 1.4× lift would make
  him read as a light source.
- **At Part A 6.0 s, Nul's first line box overlaps the knight's legs** for about 1 s, until he walks clear.
- The knight-flare colour at C 10.4 s depends on the Part B run (yellow or magenta).
- A few white puffs stay beside the knight in the collapse.
- The theft-3 ribbon is near-white.

Still open from R1 (P2/P3):
- The sky over the gate doesn't darken in Part A, and there are no upward ink streaks.
- The tear is a white column, not a dark lens. The vortex letters read as white blocks.
- The ×16 surge aura doesn't read as "max": there is no gold pillar.
- The catch crumble isn't legible.
- One-line dialogue boxes are tall.
- The knight's face is a flat white in the grey close-ups.

Design notes:
- **P2-11 (deferred by ruling).** In Part B the knight is rarely hurt: 14/20 Average and 19/20 Fast bot runs are never hurt. It fits the
  power fantasy, but the beat "his hush bolts hurt" is mostly missing.
- The shard tracker (lost skills as grey slots in Ch1) is a planned follow-up and not in this build.

Process:
- `docs/perf.md` has no P4.2 rows yet; the numbers above come from the P4.2 evidence folders.

## 7. Related change: the slow-drip skill unlocks

The prologue is the story reason for the PO's 2026-10-10 "slow drip" rule. The knight loses everything, and Ch1 starts with only
**Fireball + Clean Cut**. He then regains **one skill every 2–3 levels**, alternating active and passive:
- **Ch1:** Aegis (ch1-l02), Iron Will (l04), Piercing Thrust (l06), Steady Hands (l09).
- **Ch2:** Reveal (ch2-l02), Calm Mind (l04), Slash Wave (l06), Riposte (l08).
- **Held for later chapters:** 6 skills, including Mending Light and Frost Lock. The Loadout shows them as "Regain later in your journey".

The full schedule and rationale are in `docs/balance-ch1.md` §10 and `docs/balance-ch2.md` §10. Existing saves keep everything they own.
Watching the prologue first and then the Ch1 Loadout is the best way to judge whether the two fit together.

## 8. PO checklist (yes / no)

1. **Slow skill unlocks.** After the prologue takes everything, does starting Ch1 with only Fireball + Clean Cut, and winning one skill back
   every 2–3 levels, feel like a motivating "regain your power" arc rather than a stingy one?
2. **The wow.** In Part B, does fighting the crowd and Nul with all six skills feel like a spectacular "full power" demo of the game, with
   magic that looks amazing?
3. **The boss.** Do Nul's entrance (sky tear, letterbox bars, name card) and his fight read as a real boss, at least on par with the POC
   Golem (`02`)?
4. **The power loss.** Does the theft → collapse → kneel (C 16–25 s, `05`) land emotionally? Do you feel the hero lose all his power?
5. **The hook.** Does the last spark (the ember in his palm, "Find your words again.") make you want to start Chapter I?
6. **Pacing.** Does about 2 minutes (A 8 s, B about 50 s, C 58 s) feel right, with no part that drags and no line that goes by too fast to
   read?
7. **Readability.** In Part B, could you always read the next letter to type, and in Part C every line of dialogue?

**Sign-off question.** Do you sign off the prologue as shipped on `main` (`0a52734`)?
- **(a) Yes, as is.** § 6 goes to the polish backlog.
- **(b) Yes, with one small fix first:** the Part A 6.0 s dialogue box over the knight, and optionally the matte mask lift. Both are
  one-file changes.
- **(c) Not yet:** list what has to change.

**Reviewer's recommendation: (a).** The fixes in (b) are cheap, but neither is visible enough to hold a milestone. The audio listen pass
(§ 5) is separate and still needs your ears.

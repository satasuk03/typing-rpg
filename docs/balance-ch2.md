# Chapter 2 balance (T5.1)

`pnpm balance --chapter 2` reproduces every number in §2 (200 seeds per level per persona, about 15 s on 12 workers). It
writes `tools/balance/out/balance-ch2.json`. The exit code is 1 when a target or parity cell fails, as in Chapter 1.
Chapter 2 has real targets now, so its verdicts are no longer informational.

Targets come from `docs/CH2_PLAN.md` §4.2 and §4.3, with the PO decisions of 2026-10-10:
- The Beginner's first-try boss clear must land in a **75–90%** window at par gear, and in **55–70% with no upgrades**.
- The Ch1 boss times (8.1 / 4.4 / 2.8 min ±15%) are kept for the Willow.

The method is Chapter 1's (`docs/balance-ch1.md` §1, §7). This document only describes what is new or different.

**Chapter 1 is byte-identical.** After every change in this task:
- `pnpm balance` stdout and its JSON are identical to `main`; only the timing line and the JSON path line differ.
- `pnpm bot --quick` is identical.
- The `ch1Resolved` test and the goldens pass.

## 1. What is measured, and what changed in the tools

**Personas, noise, keystrokes, guard calibration and active time** are unchanged from Ch1 §1. Every level is a first
clear at **Ch2 par gear (T1/1/1 Common +2)**, with the guard leak on (grunt P 1.07, Gloom Wolf P 1.25, Willow adds 1.25,
Willow 1.30).

### 1.1 "The Ch2 player" (the default kit for `--chapter 2`)

The Ch2 player is **Fireball + Aegis; Clean Cut + Calm Mind + Iron Will**.
- Calm Mind replaces Steady Hands from **L6**. It is unlocked by the L5 first clear, so it is not in play on L5's first
  try.
- Reveal (unlocked by the L3 first clear) is **not** equipped. It is available as `--kit ch2-reveal`.
- The kit lives in `runner.ts` (`defaultKit`, `starterLoadout`). The unlock gating reads `unlockLevel` from content
  `skills.ts`, so it cannot drift.

**Why this kit:**
- **Calm Mind:** it is the Ch2 unlock aimed at Beginners (CH2_PLAN S7: "a non-gear defensive answer"). It is a defensive
  passive and replaces the weakest survival pick, Steady Hands (one forgiven typo per fight).
- **Fireball stays:** it is the only damage active, and the 15–20% skill-share target depends on it.
- **Aegis keeps the second active slot, because Reveal would be a trap.** Measured at the final knobs (Beginner, Willow,
  1000 seeds):

  | Kit | Free gimmick reading (bot default) | Realistic gimmick reading (T6.2 model) |
  |---|---|---|
  | starter (Ch1 kit, no Ch2 unlocks) | 86.8% | 69.1% |
  | **ch2: Aegis + Calm Mind (chosen)** | **88.0%** | **76.7%** |
  | ch2-reveal: Reveal for Aegis + Calm Mind | 59.5% | 54.2% |

  - Reveal does what it promises: on L9 with realistic reading it saves 0.23 min (5.60 → 5.37).
  - But it costs Aegis's barrier, which is worth about 28 points of Beginner boss clear. That holds even when gimmicks
    cost reading time.
- **The alternative fails the window.** Balancing to the Reveal kit would put everyone who keeps Aegis, including the
  untouched default loadout, near 100% at the Willow, and the PO's window would be gone. Balancing to the default-plus-
  Calm-Mind kit keeps both the untouched starter kit (86.8%) and the chosen kit (88.0%) inside the window.
- See PO question Q2.

### 1.2 New bot models (`tools/balance/src/bot.ts`, `personas.ts`)

**Shift cost for capitals** (closes the `docs/TODO.md` tech-debt item):
- It applies only when the sim marks the next key as an exact-case capital (`PlateView.shiftNext`). That covers the Ch2+
  sentence plates: Hush Spells, the finisher, Second Wind and the intro card.
- Ch1 folds sentence case, so `shiftNext` is never set there and Ch1 stays byte-identical.
- The model (`SHIFT_MODEL`, documented guesses):
  - a capital takes **2 key intervals**, because Shift + letter is a chord (2 keystrokes per character in the KSPC
    sense);
  - its typo rate is **×2**, because of a forgotten or late Shift;
  - the wrong key sent is the lowercase letter.
- Shifted punctuation is not modelled in either chapter.
- **Effect at the Willow** (1000 seeds, Shift model on vs off):
  - Beginner clear 88.7% → 88.0%;
  - Hush Spell fails 0.13% → 0.9%;
  - Beginner phase 2 +0.06 min, boss time +0.08 min.
  - The Hush timers are pace-scaled and generous, so the cost shows up as time, not as fails.

**Riddle clue reading** (replaces T1.3's flat 2 s):
- The bot reads the clue at the persona's `readWpm`, then scans the leaves: 0.4 s + words × 60 / readWpm + 0.25 s per
  leaf.
- Clues are 6–17 words (mean 11.7). The old 2 s was about 350 wpm on them.
- `readWpm` is **120 / 170 / 220 / 150** (Beginner / Average / Fast / reference). These are documented guesses:
  - English typing speed tracks English fluency;
  - a learner reads about 120 wpm;
  - native silent reading is about 240 wpm.
- `--whatif readWpm=N` overrides it for every persona (sensitivity in §7).

**Riddle outcomes** are recorded (`RunRecord.riddles`). In Ch2 the report's "Rubble miss" column becomes "Riddle miss":
wrong answers plus timeouts, out of all riddles, with timeouts shown separately.

### 1.3 Report, Python model and solver

- **Targets.** `PLAN_TARGETS_BY_CHAPTER[2]` = `PLAN_TARGETS_CH2` (§4.2). It adds:
  - a worst-normal-level cell (Beginner ≥ 85%);
  - per-gear boss windows: `par-2` (C+0) 55–70%, `armor+3` / `armor+5` (armor C+5) ≥ 85%. They are checked instead of the
    par window when the report runs at that gear.
- **Python model.** The parity cells use economy_sim's model at the **Ch2 par ATK (12.2)** (`pymodel.ts` `parAtk`).
  - This gives encounter HP 243 at L1, the authored 244.
  - Ch2 has time parity cells only. economy_sim has no Ch2 clear row, and §4.2 sets the clear targets directly.
- **Solver.** `solve-hits --chapter 2` uses Ch2's `DMG_FRAC` 0.525 × par HP 121.7 × saw. The budget is 63.9 at L1 and
  76.7 at L9.
  - It runs with the leak on, at par, or at any `--gear`.
  - It now filters by chapter. It used to solve the Ch2 levels together with Ch1's.
- **Gear offsets.** `--gear` accepts per-slot offsets, e.g. `weapon-2,armor+1,charm-2`. That is the Ch1 hint-path
  arrival: armor already +3 for the Golem, everything else +0.
- **What-ifs.** New keys: `riddleS`, `riddleGapS`, `riddleAtk`, `readWpm`.

## 2. Final table vs targets

`pnpm balance --chapter 2`, 200 seeds, exit 0. **Every cell PASSes.**

| Persona | Metric | Value | Target | Verdict |
|---|---|---|---|---|
| Beginner 20 | normal active min (L1-L9 mean) | 4.34 | 3-4.5 | PASS |
| Beginner 20 | boss active min | 8.56 | ~8.1 | PASS(±15%) |
| Beginner 20 | first-try clear normal (mean) | 99.6% | >=0.9 | PASS |
| Beginner 20 | first-try clear normal (worst level) | 98.5% | >=0.85 | PASS |
| Beginner 20 | first-try clear boss | 87.5% | >=0.75 | PASS |
| Beginner 20 | first-try clear boss (PO window) | 87.5% | 0.75-0.9 | PASS |
| Beginner 20 | skill damage share | 17.0% | 0.15-0.2 | PASS |
| Average 40 | normal active min (L1-L9 mean) | 2.34 | 2.4-3 | PASS(±15%) |
| Average 40 | boss active min | 4.41 | ~4.4 | PASS(±15%) |
| Average 40 | first-try clear normal (mean) | 100.0% | >=0.97 | PASS |
| Average 40 | first-try clear boss | 100.0% | >=0.9 | PASS |
| Average 40 | skill damage share | 15.5% | 0.15-0.2 | PASS |
| Fast 75 | normal active min (L1-L9 mean) | 1.59 | 1.7-2.2 | PASS(±15%) |
| Fast 75 | boss active min | 3.12 | ~2.8 | PASS(±15%) |
| Fast 75 | first-try clear normal (mean) | 100.0% | >=0.99 | PASS |
| Fast 75 | first-try clear boss | 100.0% | >=0.95 | PASS |
| Fast 75 | skill damage share | 14.8% | 0.15-0.2 | PASS(±15%) |
| Reference 35 | auto-attacks / encounter | 11.60 | ~11 | PASS(±15%) |
| Beginner 20 | normal active / Py (L1-L9 mean) | 1.06 | 1 ±15% | PASS |
| Beginner 20 | normal active / Py (worst level) | 1.12 | 1 ±15% | PASS |
| Beginner 20 | boss active / Py | 1.05 | 1 ±15% | PASS |
| Average 40 | normal active / Py (L1-L9 mean) | 1.03 | 1 ±15% | PASS |
| Average 40 | normal active / Py (worst level) | 1.07 | 1 ±15% | PASS |
| Average 40 | boss active / Py | 1.00 | 1 ±15% | PASS |
| Fast 75 | normal active / Py (L1-L9 mean) | 1.07 | 1 ±15% | PASS |
| Fast 75 | normal active / Py (worst level) | 1.10 | 1 ±15% | PASS |
| Fast 75 | boss active / Py | 1.11 | 1 ±15% | PASS |

**Beginner boss window over 1000 seeds** (the bot's free gimmick reading): **88.0%**. With the realistic T6.2 reading
model it is **76.7%**. Both are inside 75–90%; see §5.3 for why the knob targets both.

**Damage budget** (`solve-hits --chapter 2 --global --iters 1`; reference typist, bare kit, leak on):
- At par the reference takes **632.2 against a 632.6 budget, 0.999×**.
- Per level the ratio is 0.94–1.05: L1 63.5 / 63.9, L2 62.0 / 65.5, L3 62.9 / 67.1, L4 71.4 / 68.7, L5 73.9 / 70.3,
  L6 71.0 / 71.9, L7 74.3 / 73.5, L8 76.3 / 75.1, L9 77.0 / 76.7.

**Per level** (first-try clear; active min sim vs Py; auto-attacks per encounter; skill share; damage taken per run):

| Level | Beginner | Average | Fast | Reference |
|---|---|---|---|---|
| L1 | 99%, 2.72 vs 2.81, 10.5, 18.6%, 89 | 100%, 1.57 vs 1.59, 10.2, 15.1%, 42 | 100%, 1.11 vs 1.07, 10.0, 15.2%, 17 | 100%, 1.75 vs 1.78, 10.1, 16.0%, 50 |
| L2 | 100%, 2.96 vs 2.85, 11.4, 17.6%, 91 | 100%, 1.66 vs 1.61, 10.9, 16.3%, 44 | 100%, 1.15 vs 1.08, 10.9, 15.6%, 18 | 100%, 1.84 vs 1.81, 10.8, 16.7%, 51 |
| L3 | 100%, 4.38 vs 4.27, 11.7, 17.8%, 87 | 100%, 2.40 vs 2.38, 11.0, 15.6%, 41 | 100%, 1.62 vs 1.57, 10.9, 15.2%, 16 | 100%, 2.67 vs 2.67, 11.0, 16.3%, 49 |
| L4 | 100%, 4.77 vs 4.34, 12.8, 17.5%, 104 | 100%, 2.56 vs 2.41, 12.2, 16.1%, 48 | 100%, 1.72 vs 1.58, 12.3, 15.2%, 23 | 100%, 2.85 vs 2.71, 12.2, 16.1%, 56 |
| L5 | 100%, 4.54 vs 4.41, 12.0, 17.1%, 109 | 100%, 2.46 vs 2.44, 11.4, 15.8%, 50 | 100%, 1.68 vs 1.60, 11.5, 15.0%, 21 | 100%, 2.79 vs 2.74, 11.4, 16.1%, 59 |
| L6 | 100%, 4.61 vs 4.47, 12.0, 16.6%, 97 | 100%, 2.51 vs 2.47, 11.5, 15.9%, 41 | 100%, 1.73 vs 1.61, 11.6, 15.6%, 20 | 100%, 2.79 vs 2.78, 11.5, 15.9%, 46 |
| L7 | 100%, 4.86 vs 4.54, 13.0, 17.5%, 97 | 100%, 2.63 vs 2.50, 12.2, 16.7%, 45 | 100%, 1.77 vs 1.62, 12.3, 15.3%, 24 | 100%, 3.00 vs 2.82, 12.3, 16.8%, 52 |
| L8 | 99%, 4.99 vs 4.61, 13.2, 16.5%, 112 | 100%, 2.55 vs 2.53, 11.8, 14.9%, 44 | 100%, 1.72 vs 1.64, 11.5, 14.4%, 23 | 100%, 2.85 vs 2.85, 11.9, 15.5%, 49 |
| L9 | 100%, 5.22 vs 4.67, 14.1, 16.0%, 113 | 100%, 2.75 vs 2.56, 13.0, 15.3%, 50 | 100%, 1.83 vs 1.65, 12.9, 14.6%, 27 | 100%, 3.04 vs 2.89, 13.0, 15.6%, 56 |
| L10 Willow | **88%**, 8.56 vs 8.12, 15.4, 15.2%, 144, SW 13% | 100%, 4.41 vs 4.39, 14.5, 13.7%, 55 | 100%, 3.12 vs 2.80, 17.8, 12.4%, 22 | 100%, 5.00 vs 4.98, 14.5, 13.7%, 69 |

- **Willow phases (min, cleared runs; pre-boss / phase 1 / phase 2 Hush / phase 3 riddles + finisher):**
  - Beginner: 2.53 / 1.79 / 2.59 / 1.48
  - Average: 1.47 / 0.79 / 1.00 / 0.99
  - Fast: 1.06 / 0.41 / 0.73 / 0.75
  - Ch1 Golem for comparison: Beginner 2.70 / 1.67 / 2.36 / 1.78; Fast 1.12 / 0.39 / 0.82 / 0.46.
- **Riddles:**
  - wrong answers: Beginner 10.6%, Average 6.5%, Fast 2.8%;
  - **0 timeouts** for every persona.
- **Hush Spell fails:** Beginner 5 / 634, everyone else 0.
- **Ch2 first-clear gold** (level + chest): Beginner 2382, Average 2442, Fast 2423. That covers the §4.4 armor lever
  (+4, +5 costs 1,453).
- **`pnpm bot --chapter 2`** (20 seeds): BOT PASS. Beginner clears L1–L9 at 95–100% and the Willow at 85%.
- **`pnpm bot --chapter 2 --quick`**: BOT PASS.

## 3. Diagnosis: why the T4.3 numbers missed

The baseline is T4.3/T1.4 content and tools: starter kit, placeholder Ch1 targets, ENC_HP_MULT 1.2, HIT_MULT 1.25,
BOSS_LEVEL_HIT_MULT 0.9, riddle timer 10 s.
- Beginner normal clears 83% (L9 36%, L8 77%, L2 81%), Willow 72%.
- Reference 12.7 auto-attacks per encounter.
- Fast normal 1.63 min.

1. **"The reference takes only 72% / 87% of budget" was the wrong budget.**
   - The report's gear section compares damage with **hero max HP**. That column was T1.5's "does the run survive"
     view.
   - The §4.3 budget is economy_sim's `DMG_FRAC` × par HP × saw (64–77 per level). It applies to the **bare-kit**
     reference (no Aegis, no Iron Will), as Ch1 §7 solved it.
   - On that definition the T4.3 content dealt **1.33× budget**.
   - The per-level ratio ran from 1.03 (L1) to **1.64 (L4) and 1.68 (L9)**.
2. **The hit shape was Ch1's, not Ch2's.**
   - T4.3 authored every level's grunt hit as Ch1's per-level solved hit × 1.6. Ch1's shape was solved for Ch1 rosters.
   - Ch2's Gloom Wolf levels concentrate damage. The elite leaks 20% at par, hits ×1.2 and lives long (shield 4, HP
     weight 1.5). So L4, L7 and L9 ran 25–35% over budget even after a global fix, while L1, L3 and L6 ran 15–20% under.
   - **L9's 36% Beginner clear was this local spike:** two Wolves, plus a Toad and a Mender in encounter 3. It was not a
     global problem.
3. **TTK about 9% long.** Healers (15% every 10 s) and elites raise effective HP. At ENC_HP_MULT 1.2 the reference made
   12.7 auto-attacks per encounter, against Ch1's 11.6, and normal time / Py was 1.09–1.15.
4. **The riddle timer was broken for fast typists.**
   - The timer is (readS + answerS) × the boss-script pace factor. That factor shrinks with **typing** pace: ×0.6 at
     75 WPM.
   - Reading doesn't get faster with typing speed. At 10 s × 0.6 = 6 s, a 150-wpm reader at 75 WPM timed out on
     **666 of 1000 riddles**. Even the Average persona timed out on 4%.
   - The bot's flat 2 s read hid this.
5. **The riddle phase is reading-bound.** Five riddles take 0.75–1.5 min at every WPM, against rubble's 0.46 min for Fast.
   - So Fast's Willow ran 3.23–3.36 min, over the 2.8 ±15% limit. Py parity was 1.15–1.20.
   - Boss HP can't fix this. Lowering it shortens Py's time (HP / DPS) more than the sim's, so parity gets worse.
6. **Reveal for Aegis cost about 40 points of Beginner boss clear** (§1.1). The T4.3 report's "--kit ch2 ≈ 40%" was
   this, not a content problem.

## 4. Changes (from → to, why)

| Knob | Where | From → to | Why |
|---|---|---|---|
| `encHpMult` | `knobs.ts` `CHAPTER_KNOBS[2]` | 1.2 → **1.1**. L1–L9 pools 292.8–340.8 → **268.4–312.4** | The reference typist goes from 12.7 to **11.6 auto-attacks per encounter**, which is Ch1's 11.6. Time / Py goes from 1.09–1.15 to 1.03–1.07. Sweep: 1.2 → 12.6 auto / Fast 1.65 min; 1.1 → 11.6 / 1.59; 1.05 → 11.1 / 1.56. 1.1 centres both the auto-attack and the parity cells. Average and Fast stay inside ±15% of §9's floors, the same as Ch1 (2.33 / 1.58). |
| `HIT_SHAPE` (new) | `levels-ch2.ts` | Ch1 shape → **[1.29, 0.98, 1.10, 0.81, 1.02, 1.25, 0.84, 0.97, 0.74]** | **Local fix** (§3.2), solved per level with `solve-hits --chapter 2`. Each level takes its own `DMG_FRAC` budget. The Wolf levels L4 / L7 / L9 come down (0.81 / 0.84 / 0.74). The elite-free L3 / L6 and the 2-encounter L1 come up. Mean shape is 1, so the global part stays in HIT_MULT. **L9's Beginner clear goes from 36% to 99.5%** without touching its roster; the two-Wolf identity of the hardest normal level is kept. |
| `hitMult` | `knobs.ts` | 1.25 → **1.05** | The global part of the solve. Reference at par: **1.33× → 0.999× budget**. Grunt hits are now L1 16.47, L2 11.33, L3 7.30, L4 6.07, L5 7.68, L6 8.09, L7 6.29, L8 8.08, L9 5.20. The 2-encounter levels carry bigger hits for the same per-level budget, as in Ch1. |
| `bossLevelHitMult` | `knobs.ts` | 0.9 → **0.71**. Willow hit 11.52 → **9.09**; L10 wave / add hits 7.6 → **6.0** | Puts the Beginner Willow inside the PO window under **both** gimmick-reading models (§5.3). Sweep at 1000 seeds, free / realistic: 0.75 → 82.7 / 68.6%; 0.72 → 86.5 / 74.6%; **0.71 → 88.0 / 76.7%**; 0.70 → 88.7 / 78.7%. |
| Willow `doomEveryS` | `bosses.ts` | 16 → **14** | The Fast typist's phase 2 sits at the `minDoomSpells` floor (2 spells). The cadence only stretches for slow typists (`BOSS_SCRIPT_PACE_SCALE`: ×max(1, factor)). This takes Fast's Willow from 3.23 to **3.12 min** and its Py parity from 1.15 to 1.11. Cost: the Beginner sees about 1 more Hush Spell. It is absorbed in `bossLevelHitMult`. |
| Willow riddle `readS + answerS` | `bosses.ts` | 4 + 6 = 10 s → **9 + 6 = 15 s** at pace 35. That is 9 s at 75 WPM, 13.7 s at 40 and 22 s at 20 | It covers the longest clue (17 words) plus the longest answer for a **150-wpm reader at 75 WPM**. Timeouts go 666 → 0 per 1000 riddles at 75 WPM, and 43 → 0 at 40 WPM. The sim only uses the sum; the split is cosmetic. |
| Willow riddle `gapS` | `bosses.ts` | 1.5 → **1.0** | Takes 2.5 s of dead time off every persona's phase 3 (Fast boss time margin). |
| Willow riddle `clearAtkMult` | `bosses.ts` | 5 (guess) → **5.0, now derived**: 33% band / (5 riddles × par ATK 12.2) | Five right answers take the 33% band, as T1.3 intended. Phase 3 is gated by the riddle count, not by HP, so this is presentation (the HP bar reaches the gate as the finisher appears). |
| Willow riddle `missHit` | `bosses.ts` | 9.6 (0.75 × the pre-knob hit 12.8) → **6.82, derived as 0.75 × the Willow's hit** | Keeps the documented "mild hit" rule after the knob. A Beginner misses 0.5 riddles per run, so this is worth about 1 point of clear. |
| `parRefS` L1–L9 | `levels-ch2.ts` (formula) | 90.4–156.8 → **83.2–144.2 s** | It follows `encHpMult` automatically. Reference combat time / parRefS is 0.79–0.90, the same convention as Ch1 (0.71–0.86). |
| `parRefS` L10 | `levels-ch2.ts` | 296 (unchanged) | L10's ★★★ is `guardian`, so parRefS is unused there. |
| Kit, Shift, reading | `tools/balance` | see §1 | Model changes; Ch1 output is unchanged. |

**ParTime ★★★ (L2 slack 1.2, L7 slack 1.1)** is met by 96–100% of every persona, as it is in Ch1 (100%). Both chapters
derive parRefS the same way. This is consistent, but the par-time star is not a challenge in either chapter (§7).

**Fixtures and tests.**
- `CONTENT_VERSION` → `24b4fbd5` (from `build-version`).
- `packages/content/tests/knobs.test.ts`:
  - pins the Ch2 knobs [1.1, 1.05, 0.71];
  - checks the riddle rules: clearAtkMult × 5 × 12.2 ≈ 33% HP, missHit = 0.75 × hit, and the timer × 0.6 ≥ 9 s.
- `tools/balance/tests/ch2Balance.test.ts` (new) covers:
  - per-chapter targets and the per-gear window verdicts;
  - kit unlock gating;
  - the Ch2 Python ATK and HP;
  - per-slot gear;
  - the model constants;
  - an L10 run at 75 WPM with 0 riddle timeouts.
- No sim code changed. The goldens and `ch1Resolved` are unchanged.

## 5. The Whispering Willow

### 5.1 Numbers
- **HP 923** (unchanged, plan §4.1).
- **Hit 9.09** (12.8 × 0.71). Attack Power 1.30, adds 1.25.
- **Phase 2:** Hush Spells every 14 s from the previous resolution (pace-stretched for slow typists), at least 2.
  Failure costs 15% of par HP.
- **Phase 3:** 5 riddles. Timer 15 s × pace factor, gap 1 s, clearAtkMult 5.0, missHit 6.82. Then the finisher.

### 5.2 Where the Beginner loses
- **Damage taken** is 144 per run against 122 HP. Walk, phase heals and Second Wind (13% of runs) cover the gap.
- **The fails are attack damage in the pre-boss waves and phases 1–2.**
  - Hush fails are 0.8% of spells. Riddle misses cost about 3.5 HP per run.
  - Phase 3 is a reading test, as the PO ruled: weapon ATK and skills barely matter there.

### 5.3 Why the window is centred between the two gimmick models
- The Willow fight has two Fading Shades: one in the second pre-boss wave and one as a phase-1 add.
- With the T6.2 realistic reading model (decode and recall delays), the Beginner's Willow clear is **11–14 points
  lower** than with the bot's free reading.
  - In Ch1 the same gap was 3 points (85 → 82%).
  - Neither model is the truth. The free model is known to be optimistic (Ch1 §6); the realistic one is a set of
    documented guesses.
- `bossLevelHitMult` 0.71 puts **both** inside 75–90%: free 88.0%, realistic 76.7% (1000 seeds).
- At 200 seeds the default report reads 87.5%. The free model's 1000-seed 88.0% has a standard error of about
  1 point, so the cell stays below 90%.

## 6. Gear levers (§4.3)

**Guard leak by attacker** (formula; `pnpm balance --chapter 2 --gear <g>` prints it):

| Armor | Grunt (P 1.07) | Elite / adds (P 1.25) | Willow (P 1.30) |
|---|---|---|---|
| C+0 (`par-2`) | 18.0% | 29.8% | 32.5% |
| C+1 (`par-1`) | 12.3% | 24.9% | 27.8% |
| **C+2 (par)** | **6.6%** (target ≈6.5) | **20.0%** | **23.1%** (target ≈23) |
| C+3 (Ch1 hint path) | 0.8% | 15.1% | 18.4% |
| C+5 (`armor+3`) | 0 | 5.3% | **8.9%** (target ≈9) |

**Reference damage vs the `DMG_FRAC` budget** (bare kit, L1–L9, `solve-hits --chapter 2 --global --iters 1 --gear g`):

| Gear | Damage / budget | Target |
|---|---|---|
| par (C+2) | **0.999×** | 1.00× ±5%: PASS |
| par-1 (C+1) | 1.124× | |
| **par-2 (C+0)** | **1.289×** | **1.25–1.35×: PASS** (the "par−3 ≈ 1.3×" lever) |
| armor C+5 | 0.863× | |

**Beginner Willow first-try clear by gear** (1000 seeds, the Ch2 player kit):

| Gear | Free gimmick reading | Realistic reading | Target |
|---|---|---|---|
| armor C+5 (`armor+3`; +5 clamps there) | **97.9%** | 93.8% | ≥ 85%: **PASS** |
| **par (C+2)** | **88.0%** | **76.7%** | 75–90%: **PASS** |
| Ch1 hint path (armor C+3, weapon and charm C+0) | 64.7% | | |
| C+1 (`par-1`) | 62.8% | | |
| **C+0 (`par-2`), "no upgrades"** | **25.4%** | 13.6% | 55–70%: **FAIL (infeasible, Q1)** |

**Beginner normal levels by gear** (200 seeds, mean / worst):
- par: 99.6% / 98.5%
- Ch1 hint path: 95.7% / 89.5%
- C+1: 94.3% / 86.0%
- C+0: **75.2% / 56.5%**

**Average and Fast at C+0:** 100% normal and 100% boss, with damage +15–30%. They feel the lever as damage, not as a
wall (target ≥ 95%: PASS).

## 7. Remaining risks and sensitivities

- **C+0 is a near-wall for the Beginner** (25% Willow, 75% normal levels). This is Q1.
  - §4.4 says par is affordable from Ch1 income, with about 430 gold to spare.
  - The results-screen hint ("Upgrade Armor in Gear") is the in-game answer.
  - Still, a Beginner who spends Ch1 gold on caches arrives under par.
- **The bot's gimmick reading.** Ch2 is the fading chapter, and the boss window moves 11 points between the two
  reading models. Re-check it with T5.2 Playwright runs and playtests.
- **Fast's boss time depends on the reading-speed guess.**
  - With every persona reading at 150 wpm, Fast's Willow is 3.25 min: +16%, a FAIL by 0.03 min.
  - With 120 wpm it is 3.34 min, and 98 of 1000 riddles time out at 75 WPM: long clues, slow reader, fast typist.
  - The Beginner and Average cells don't move. The root cause is Q3.
- **Shift cost** is a guess (×2 interval, ×2 typo). It moves the Beginner Willow clear by 0.7 points, so the result is
  not sensitive to it.
- **Riddle answer accuracy** is modelled as the persona's typing accuracy (88 / 94 / 97%), a T1.3 guess. Each wrong
  answer costs 6.8 HP, so a Beginner who misses 2 of 5 instead of 0.5 loses about 10 HP.
- **Skill share at the Willow** is 12–15%. Phase 3 has no skill damage. The chapter means (17.0 / 15.5 / 14.8%) pass;
  Fast is inside ±15%, as in Ch1 (15.2%).
- **Average 2.34 and Fast 1.59 normal minutes** sit under §9's floors, inside ±15%. This is the same as Ch1 and for the
  same reason (§6 of balance-ch1.md).
- **The ★★★ par-time star is near-free in both chapters** (96–100% at slack 1.1–1.2). If the PO wants it to be a
  challenge, the fix is a slack of about 0.9 or a parRefS of measured reference combat time. That would be a Ch1 + Ch2
  content change.
- **`tools/balance/src/gear.ts` still mirrors** the sim's upgrade-step rule and `guardLeakBp`. Exporting them needs a sim
  change. It is not essential to T5.1, so it is left in TODO.

## 8. Questions for the PO

**Q1. "55–70% with no upgrades" can't hold together with "75–90% at par".**
- Measured: par 88% and C+0 25%, a gap of about 60 points.
- C+0 has −18% ATK, −18% HP and +9 points of Willow leak. Together that is a 1.29× damage budget on 0.82× HP, and the
  clear rate is a steep threshold in damage / HP.
- No content knob changes the gap. A knob that lifts C+0 to 55% puts par at about 98%.
- Options:
  - **(a) Recommended: keep the par window, and read "no upgrades" as "no Ch2 upgrades".**
    - A player who followed Ch1's hint (armor +3 for the Golem) and buys nothing in Ch2 clears **64.7%**, inside
      55–70%.
    - C+1 (one upgrade short everywhere) clears 62.8%.
    - Only the player with no upgrades at all (C+0) is at 25%. The results hint and §4.4's affordable par address
      that player.
  - **(b)** Hold the C+0 window. Then par is about 98% and the Willow has no risk at par.
  - **(c)** Design change: soften the gear curve for Beginners, e.g. Ch2 par = C+1 (`PAR_UPG[2]` = 1, a sim balance
    constant). The plan's 1.3× lever and leak table would need re-deriving.

**Q2. Reveal is a trap at the Willow.**
- Equipping it in place of Aegis drops the Beginner's first-try clear from 88% to 59.5% (realistic reading: 76.7% →
  54.2%).
- Players are likely to equip the shiny Ch2 unlock.
- Options:
  - **(a)** A loadout hint at L10 ("Aegis guards you against the Willow").
  - **(b)** A defensive rider on Reveal, e.g. revealed plates also delay the owner's attack.
  - **(c)** Accept it. Reveal is for normal levels; it saves 0.2 min on L9.
- The balance assumes the player keeps Aegis.

**Q3. Sim change proposal (ICP, not implemented): don't shrink the riddle reading allowance with typing pace.**
- Today the timer is (readS + answerS) × the pace factor.
- Proposed: readS + answerS × factor, so reading time is pace-independent.
- With readS 8 / answerS 5 the timer would be 11 s at 75 WPM and 15.4 s at 20 WPM. Today it is 9 s and 22 s.
- That covers slow readers who type fast, keeps some pressure for slow typists, and removes the reading-speed
  sensitivity of Fast's boss time.
- Cost: `SIM_VERSION` and the riddle goldens change; Ch1 is unaffected.

**Q4.** Should the balance contract use the realistic gimmick model for fading-heavy chapters? Ch2 is centred between
the two models (§5.3).

## 9. Reproduce

```bash
pnpm balance --chapter 2                                    # §2 table (200 seeds), exit 0
pnpm balance --chapter 2 --level ch2-l10 --persona beginner --seeds 1000    # the window at 1000 seeds
pnpm balance --chapter 2 --gear par-2                       # C+0 lever (the boss-window cell checks 55-70%)
pnpm balance --chapter 2 --gear armor+3                     # armor C+5 lever (checks >= 85%)
pnpm balance --chapter 2 --gear weapon-2,armor+1,charm-2    # Ch1 hint-path arrival
pnpm balance --chapter 2 --kit ch2-reveal                   # Reveal-for-Aegis sensitivity
pnpm balance --chapter 2 --whatif readWpm=150               # reading-speed sensitivity
pnpm --filter @hd2d/balance solve-hits --chapter 2 --global --iters 1 [--gear par-2]   # damage / budget
pnpm bot --chapter 2 [--quick] [--gimmicks realistic]
```

A gear-offset or `--kit` run in Ch2 prints its verdicts but always exits 0, because it is a lever check, not the
contract. Ch1 keeps its old exit behaviour.

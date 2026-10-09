# Chapter 1 balance (T6.1)

`pnpm balance` reproduces every number in this document (60 seeds per level per persona, about 2 s on 12 workers). It
also writes `tools/balance/out/balance-ch1.json`. The exit code is 1 when a plan §9 cell or a parity cell fails. A
documented structural miss (`FAIL*`, see "Remaining deltas") fails only with `--strict`.

## 1. What is measured

**Personas.** The personas are economy_sim's `PERSONAS` at their Chapter 1 starting skill, with the per-attempt noise of
`economy_sim.fight()`:

| Persona | WPM | Accuracy | Guard (economy_sim) | Bot guard attempt rate |
|---|---|---|---|---|
| Beginner | 20 | 88% | 0.40 | 0.60 |
| Average | 40 | 94% | 0.60 | 0.71 |
| Fast | 75 | 97% | 0.75 | 0.74 |
| Reference (only for the "~11 auto-attacks" row) | 35 | 92% | 0.60 (REF_GUARD) | 0.73 |

- **Noise.** WPM × max(0.45, N(1, 0.10)), accuracy + N(0, 0.012), guard + N(0, 0.06). The level's `pace` is the attempt's
  WPM, as in economy_sim (`pace = wpm_eff`).
- **Keystrokes.** The keystroke model is the reference bot's. The correct-character rate equals the net WPM. A typo is a
  real wrong key with probability 1 − accuracy. After each plate the bot pauses len × interval × (1/0.82 − 1), which is
  economy_sim's `COMBAT_TYPING_EFF` 0.82.
- **Guard calibration.** economy_sim's `guard` is the share of attacks that get guarded, and its model has no barrier.
  The bot's attempt rate is calibrated so that, with a build that has no barrier, (blocks + parries) / landed impacts
  equals that value. The measured shares are 0.42, 0.60, 0.75 (±0.03) and 0.60.
  - The attempt rate is not the same number as `guard`. An attempted guard word can still fail (too slow, or a typo).
    An ignored guard word is often answered by killing or Breaking the enemy before the impact, and economy_sim does not
    count that as an attack.
- **Loadout.** Every level uses par gear (T1 Common +0, sword) and the starter kit: Fireball and Aegis as actives, Clean
  Cut, Steady Hands and Iron Will as passives. Unlocks that happen during the chapter are not equipped. Each level is a
  first clear.

**Active time.** Active time = sim time from `LevelStarted` to the end, plus `LEVEL_END_S` (10 s for the results screen,
which the sim does not model).
- Sim time already covers the intro (7 s), walks (8 s), 2 s wave intros, combat, rewards (5 s per encounter), the boss
  intro (4 s) and the breathers.
- This is economy_sim's "Active min/level", which is `win_secs − MENU_S − JOURNAL_S`.
- Means are taken over cleared runs. The "normal" cell is the mean over L1–L9.

**Python model ("Py").** `tools/balance/src/pymodel.ts` ports `typing_combat` and the level overhead, and its unit test
checks it against the Python dump.
- Normal levels use the Python's own encounter HP: `enc_hp(p) = 36 s × reference DPS × (1 + 0.02 (p−1))`, once per
  encounter.
- The boss level uses its content pools.

**Verdicts.**
- A range target passes inside the range. It gets `PASS(±15%)` within 15% of a bound, and `FAIL` beyond that.
- A point target (~x) is a range of zero width.
- Clear rates are floors.

## 2. Final table vs plan §9

| Persona | Normal active, L1–L9 mean (target) | Boss active (target) | First-try clear, normal / boss (target) | Skill share (15–20%) |
|---|---|---|---|---|
| Beginner 20 | **4.31** (3.0–4.5) PASS | **9.01** (~5.4) FAIL* | 100% / 100% (≥80 / ≥50) PASS | 17.2% PASS |
| Average 40 | **2.33** (2.4–3.0) PASS(±15%) | **4.44** (~4.2) PASS(±15%) | 100% / 100% (≥97 / ≥85) PASS | 16.2% PASS |
| Fast 75 | **1.58** (1.7–2.2) PASS(±15%) | **2.90** (~3.4) PASS(±15%), at the edge | 100% / 100% (≥99 / ≥90) PASS | 15.2% PASS |
| Reference 35 | auto-attacks per encounter **11.6** (~11) PASS(±15%) | | | 16.3% |

**Parity with economy_sim's Chapter 1 model on this content.** Every cell passes.

| Persona | Normal: sim / Py, mean (worst level) | Boss: sim / Py | Clear vs Py Ch1 row (100%) |
|---|---|---|---|
| Beginner | 1.05 (1.13) | 1.11 (9.01 vs 8.09 min) | 100% / 100% |
| Average | 1.02 (1.09) | 1.01 (4.44 vs 4.38) | 100% / 100% |
| Fast | 1.06 (1.12) | 1.04 (2.90 vs 2.80) | 100% / 100% |

**Per level** (active minutes, sim vs Py, mean auto-attacks per encounter, skill share, mean damage taken per run):

| Level | Beginner | Average | Fast |
|---|---|---|---|
| L1 (2 enc, tutorial) | 3.15 vs 2.81, 12.0 auto, 18.7%, 26 dmg | 1.73 vs 1.59, 11.7, 17.9%, 4 | 1.21 vs 1.07, 12.1, 16.7%, 2 |
| L2 (2 enc) | 3.03 vs 2.85, 11.7, 16.8%, 35 | 1.66 vs 1.61, 10.9, 16.3%, 14 | 1.16 vs 1.08, 11.0, 15.4%, 6 |
| L3 | 4.18 vs 4.27, 11.2, 17.9%, 19 | 2.29 vs 2.38, 10.5, 16.6%, 7 | 1.60 vs 1.57, 10.6, 15.2%, 3 |
| L4 | 4.92 vs 4.34, 12.9, 17.6%, 47 | 2.58 vs 2.41, 12.4, 16.6%, 9 | 1.77 vs 1.58, 12.6, 15.7%, 3 |
| L5 | 4.60 vs 4.41, 12.3, 16.9%, 37 | 2.51 vs 2.44, 11.5, 16.3%, 8 | 1.71 vs 1.60, 11.7, 14.8%, 4 |
| L6 | 4.68 vs 4.47, 12.4, 17.1%, 30 | 2.60 vs 2.47, 12.1, 16.2%, 9 | 1.72 vs 1.61, 12.1, 15.3%, 4 |
| L7 | 4.75 vs 4.54, 12.5, 17.7%, 40 | 2.60 vs 2.50, 11.9, 15.7%, 10 | 1.70 vs 1.62, 11.9, 14.5%, 5 |
| L8 | 4.46 vs 4.61, 11.8, 16.4%, 19 | 2.36 vs 2.53, 10.6, 15.3%, 6 | 1.60 vs 1.64, 10.2, 14.6%, 2 |
| L9 | 5.00 vs 4.67, 13.2, 17.3%, 26 | 2.63 vs 2.56, 12.4, 16.7%, 8 | 1.75 vs 1.65, 12.4, 15.4%, 3 |
| L10 boss | 9.01 vs 8.09, 0/1012 rubble missed, 0% Second Wind | 4.44 vs 4.38, 0/734 missed | 2.90 vs 2.80, 0/406 missed |

- **Boss phases** (min, Beginner / Average / Fast):

  | Phase | Beginner | Average | Fast |
  |---|---|---|---|
  | Pre-boss waves | 2.79 | 1.58 | 1.10 |
  | Phase 1 | 1.71 | 0.77 | 0.37 |
  | Phase 2 (Doom) | 2.51 | 1.03 | 0.81 |
  | Phase 3 + finisher | 1.83 | 0.90 | 0.45 |

- **Damage by origin** (Average): weapon 58%, chip 18%, skill 16%, counter 6%, rubble 1%. All Fireball, since Aegis does
  no damage.
- **Chapter 1 gold** for first clears (level and chest gold): 2180 / 2150 / 2195 for Beginner / Average / Fast.
- **Damage taken.** The reference typist takes **44.6 per level** without a defensive build (no Aegis or Iron Will), at
  60% guard. The budget is 44.0, from `DMG_FRAC` 0.40 × par HP × saw. With the starter kit the same typist takes 10.2.
  - The Beginner takes 31 per level with the starter kit. Without it they take 90 per level and clear 97% of normal
    levels and 80% of boss runs.

## 3. Diagnosis: why the pre-T6.1 numbers missed

The numbers below are before tuning, measured with the same runner and personas. To reproduce them, set
`BOSS_SCRIPT_PACE_SCALE: false` and run `pnpm balance --whatif encHp=0.833333,hit=0.746269`, which undoes the two
content multipliers.

1. **"Normal levels far too fast (1.3 / 0.65 min)" was mostly a definition mismatch, not a balance bug.**
   - The old bots reported `activeTicks`, which counts only ticks in the combat phase. economy_sim's active time also
     includes the intro, walks, reward bursts and the level-end screen, which come to 38–48 s per level.
   - Plan §9's ranges (3.0–4.5 / 2.4–3.0 / 1.7–2.2) are not Chapter 1 numbers. They are the 30-chapter ranges from
     doc 02 §"Time per level". economy_sim's own Chapter 1 row is **3.0 / 1.7 / 1.2 min**, with 2-encounter levels and
     the boss included in the mean.
   - With the right definition, the untuned sim was already within 1–8% of the Python model on this content. The mean
     ratios were 0.92 / 0.92 / 0.99. The 3-encounter layouts make L3–L9 longer than the Python's Chapter 1, which helps
     the §9 cells.
2. **The real sim kills faster than the analytic model.**
   - Weakness ×1.3, shield BREAK ×1.8, parry counters (5–6% of all damage) and Clean Cut crits are not in economy_sim.
   - At the authored HP, the reference typist's time-to-kill was about 20% short of the authored 36 s × saw. The sim
     measured 9.8 auto-attacks per encounter, against about 11–12 in the Python.
   - The PO's ruling (2026-10-09): keep weakness, shields and BREAK, and retune HP instead. → `ENC_HP_MULT`.
3. **Damage was far below the Python budget.**
   - Grunt hits were solved on the analytic model. On the real sim, shorter fights, Breaks that reset attack timers, and
     enemies killed before their impact gave the reference typist (with no defensive picks) **28.5 per level, 65% of the
     `DMG_FRAC` budget of 44**.
   - The starter kit's Aegis and Iron Will then remove about 75% of what is left, so the starter-kit result was 7.3 per
     level, 17% of the budget. → `HIT_MULT`.
4. **20 WPM boss: 38% clears, 9.2 min.**
   - Falling Rubble kept its authored 2.6 s spawn and 7 s fall at every pace, while a 20 WPM typist needs about 3.3 s per
     word. Result: **539 of 1445 words missed (37%)**, a Second Wind in 67% of runs, and 38% clears.
   - Phase 2 had the same flaw. Doom Spells pay no ATB, and the 16 s cadence (counted from each spell's resolution) did
     not scale. A 20 WPM typist spends about 30 s on every spell, so phase 2 took **3.0 min, against 1.0 at 40 WPM**,
     with about 2/3 of it spent typing spells. → `BOSS_SCRIPT_PACE_SCALE`.
5. **Boss time spread.**
   - §9's 5.4 / 4.2 / 3.4 min are story-wide averages too. They come from the "Boss level min" headline, which averages a
     Beginner who climbs from 20 to 38 WPM over 30 chapters.
   - economy_sim's own Chapter 1 boss gives about **7.4 / 3.9 / 2.45 min** on its structure, and **8.1 / 4.4 / 2.8 min**
     on this content: the sim's HP plus 30 s of `BOSS_EXTRA_S`.
   - Boss time is mostly HP / DPS, and DPS scales about linearly with WPM. A fixed-HP boss therefore cannot make 20 and
     75 WPM land within 1.6× of each other.
6. **Fireball at −35% vs doc 01.** Sweep with everything else final (Beginner / Average / Fast skill share):

   | Fireball | Beginner | Average | Fast |
   |---|---|---|---|
   | 1.2× (−40%) | 16.2% | 15.3% | **14.2%** |
   | 1.25× | 16.5% | 15.8% | **14.7%** |
   | 1.3× (−35%, kept) | 17.2% | 16.2% | 15.2% |

   - Fast typists' share runs low for two reasons. Their combo multiplier boosts auto-attacks but not skill charge. And
     counters plus BREAK-boosted weapon hits are damage sources the Python does not have.
   - The starter kit also has only one damage active, Aegis being defensive, while economy_sim's `SKILL_DMG_PER_CHARGE`
     assumes both slots deal damage.
   - Fireball at 1.3× plus its burn already pays 0.16 ATK per charge, which is more than the Python's 0.12 for both slots
     together.
   - −35% is as close to −40% as the 15% floor allows for every persona.
7. **Guard model.** The old bots attempted every guard word (`guardAttempt` 1), or 60% of them. With a barrier-free
   build, an attempt rate equal to economy_sim's `guard` produced a different guarded share. The rates are now
   calibrated (§1).

## 4. Changes (from → to, why)

| Knob | Where | From → to | Why |
|---|---|---|---|
| `ENC_HP_MULT` | `packages/content/src/data/levels.ts` (L1–L9 encounter `hp`) | 1 → **1.2**. Pools 199.4–231.3 → 239.28–277.56 | Restores the authored 36 s × saw TTK for the reference typist on the real sim: TTK +20%, 9.8 → 11.6 auto-attacks per encounter, level time / Py from 0.92 to 1.02–1.06. A single global knob; per-level solves would overfit to the sword's weaknesses (bats break on every slash). |
| `HIT_MULT` | same file (L1–L9 `gruntHit`) | 1 → **1.34**. Hits 3.85–7.6 → 5.16–10.18 | Solved on the real sim (`pnpm --filter @hd2d/balance solve-hits --global`, 200 seeds, after the HP change). The barrier-free reference typist now takes 44.6 per level against a 44.0 budget. Global, which keeps the authored level shape. |
| `parRefS` (L1–L9) | same file, `parRef()` | 76–131.3 → **90.4–156.4 s** | Its HP part (Σ HP / 5.54) scales with `ENC_HP_MULT`; the 2 s wave intros do not. ★★★ par-time challenges (L2, L7) stay consistent. |
| `BALANCE.BOSS_SCRIPT_PACE_SCALE` (new, TS-only) | `packages/sim/src/balance.ts`, `bossPlates.ts` (helpers), `boss.ts` (call sites) | (implicit `false`) → **`true`** | **Rule change behind a knob**, see §5. Beginner boss clears go from 38% to 100%, rubble misses from 37% to 0%, phase 2 from 3.0 to 2.5 min. |
| Fireball `atk_mult` | `balance.ts` | 1.3 → **1.3 (unchanged)** | See §3.6. |
| Boss level (L10) pools and hits, Ruin Golem | `levels.ts`, `bosses.ts` | unchanged | Already within 1–11% of the Python model. Its pre-boss pools (345 HP, against the Python's one 235 HP add wave) count the phase-1 adds twice. Cutting them to 235 would take Fast from 2.90 to about 2.8 min (a §9 FAIL) and still leave the Beginner at about 8.5 min. Left as authored; T4.x can revisit. |

**Fixtures and tests.**
- `CONTENT_VERSION` 9d21ae83 → 2de9e929 (`build-version`).
- `tests/fixtures/golden-typing.json`: only `golem-40wpm` and `golem-20wpm-sw` change. Both use real content at a pace
  other than 35, so the boss timers move.
  - `golem-20wpm-sw` now uses a barrier-free build with a 40% guard attempt rate and seed 4245. With the knob on, the
    starter kit at 20 WPM never needs a Second Wind at the boss, and this scenario must still cover a mid-boss Second
    Wind.
- `resolve.test.ts`: L4 encounter values.
- `refBot.test.ts`: the no-skill band for auto-attacks per encounter is now 12.5–16.5.
- `bossBot.test.ts`: new assertion that fewer than 5% of rubble words are missed.
- `boss.test.ts`: 7 new tests for the knob at paces 20, 35 and 75.
- Node vs Chromium parity is green.

## 5. Rule change behind a knob: `BOSS_SCRIPT_PACE_SCALE`

When the knob is `true`, the boss script's own timers follow the pace factor that already drives enemy attack intervals
and the guard window: (35 / pace)^0.7, clamped to 0.6–1.8, read from `PACE_FACTOR_BP`.

| Timer | Scaling | 20 WPM | 75 WPM |
|---|---|---|---|
| Falling Rubble spawn period, first-spawn delay and fall time | × factor | ×1.48: 3.8 s spawn, 10.4 s fall | ×0.6: 1.6 s spawn, 4.2 s fall |
| Doom Spell cadence (`doomEvery`, from the previous resolution) | × max(1, factor), so only ever longer | 16 → 23.7 s | 16 s (unchanged) |

Pace 35 is unchanged, so every T1.5 boss unit test still holds.
- **Why the Doom cadence only gets longer:** a fast typist's phase 2 already sits at the `minDoomSpells` floor, and
  shortening the gap would only shorten a fight that §9 already calls too short.
- **SIM_VERSION:** the same inputs at pace ≠ 35 now give a different result, so by interfaces §11 this would bump
  `SIM_VERSION`. It is left at 1 in line with T1.x practice before release. See the ICP in the T6.1 report.

## 6. Remaining deltas and risks

- **Beginner boss 9.0 min vs ~5.4 (FAIL\*). This cannot be reached by tuning.**
  - economy_sim itself puts a 20 WPM Chapter 1 boss at about 7.4 min (8.1 on this content); the 5.4 is a 30-chapter
    average.
  - Cutting boss HP enough to reach 6.2 min (−35%) would take Average to about 3.3 min (FAIL) and Fast to about 2.2 min
    (FAIL).
  - Even pace-adaptive boss HP at the Python's own clamp does not get there. With `--whatif hpPaceExp=0.7`, plus the
    Python's 235 HP pre-boss pool, the boss lands at 6.8 / 4.4 / 3.1 min.
  - **Proposed rule changes, for the PO:**
    - **(a)** Set the Chapter 1 boss targets from economy_sim's model on this content: 8.1 / 4.4 / 2.8 min, ±15%. All
      of these pass today (1.11 / 1.01 / 1.04).
    - **(b)** If the 20 WPM boss must be about 6 min:
      - make boss HP pace-adaptive with economy_sim's `HP_PACE_EXP` (boss only, x ≈ 0.5–0.7, clamp 0.7–1.4). Doc 02 C1
        currently rejects pace-adaptive HP.
      - and make Doom Spell characters pay ATB, or give slow paces fewer and shorter spells.
      - Pace-adaptive boss HP alone measures 7.2–7.5 / 4.6 / 3.2 min (`--whatif hpPaceExp=0.5` or `0.7`). The last
        ~1 min for the Beginner would have to come from the Doom change, which the what-if layer cannot model; the
        Beginner spends 2.5 min in phase 2.
- **Fast boss 2.90 vs ≥ 2.89.** This passes the ±15% band at its edge, for the same structural reason.
  - economy_sim budgets `BOSS_EXTRA_S` 30 s for the intro dialogue, breathers and finisher. The sim models only the
    4 s intro and 2 × 2 s breathers, plus the typed finisher.
  - A real boss-intro dialogue in the client (T3.x) would add that time back to every persona and move Fast to about 3.1
    min.
- **Average 2.33 and Fast 1.58 normal-level times** sit just under §9's ranges, inside the ±15% band. Matching the
  Python makes them land where economy_sim's own model lands.
  - Raising HP until they enter the range would push the Beginner over 4.5 min and the reference to about 12.5
    auto-attacks.
  - The 2-encounter L1–L2 pull the mean down. For 3-encounter levels alone the times are 4.66 / 2.51 / 1.69.
- **The starter kit makes Chapter 1 nearly risk-free.** Aegis plus Iron Will remove about 77% of the incoming damage:
  10 per level instead of 45 for the reference typist.
  - Clear rates are 100% for every persona, against economy_sim's 100% for Chapter 1, so this is not a §9 miss.
  - It does make the starter kit the dominant defensive choice. Consider it in T4.x/T6.x skill tuning (Aegis has charge
    10 and absorbs 2 hits).
  - A build without defence is the one economy_sim's damage budget describes: the Beginner clears 97% of normal levels
    and 80% of boss runs that way.
- **The bot is optimistic about gimmicks.** It reads scrambled and faded words for free. Real players will be slower on
  L4–L9 and on the phase-1 adds. The Playwright bot and playtests in T6.2 should check this.
- **No player in the runs used a Second Wind on any normal level.** Second Wind is only exercised by the golden scenario
  and by builds without defence.

## 7. Knobs and procedure for future chapters

1. **Author** encounter HP and hits with economy_sim's `level_spec`, as in Chapter 1.
2. **Apply the real-sim correction factors.**
   - `ENC_HP_MULT` restores the authored time-to-kill. Check it with the reference typist's auto-attacks per encounter
     and the "normal active / Py" parity row.
   - `HIT_MULT` comes from `pnpm --filter @hd2d/balance solve-hits --global`, with the reference typist, a barrier-free
     build and the `DMG_FRAC` budget.
   - Expect both factors to drift as word tiers, shields and new enemy weaknesses change the sim's damage edge. Re-solve
     them per chapter rather than reusing 1.2 / 1.34.
3. **Run `pnpm balance`.**
   - Extend `CH1_LEVELS` and `PLAN_TARGETS` in `tools/balance` for the new chapter.
   - The Python model's chapter-dependent inputs (word tier, par gear, `DMG_FRAC`) are currently Chapter 1 constants in
     `pymodel.ts` and `solveHits.ts`.
4. **Use the what-if flags** to measure an idea on the real sim before you edit content or rules. Example:
   `pnpm balance --whatif encHp=1.1,hit=0.9,preBossHp=0.68,bossHp=1.1,hpPaceExp=0.5,minDoom=3,doomEveryS=18,guard=0.9 --kit bare`.
5. **Recalibrate the guard attempt rates** if the guard window or word lengths change. Run with `--kit bare` and check
   the "Guard ok" column against economy_sim's `guard`.
6. **Boss checklist.**
   - Boss-script timers follow the pace (`BOSS_SCRIPT_PACE_SCALE`).
   - Watch the "rubble miss", "Doom fail" and "SW" columns, and the boss phase split.
   - Phase 2 is the slow-typist bottleneck, because Doom Spells pay no ATB.

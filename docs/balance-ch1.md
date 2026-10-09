# Chapter 1 balance (T6.1)

`pnpm balance` reproduces every number in this document (200 seeds per level per persona, about 13 s on 12 workers). It
also writes `tools/balance/out/balance-ch1.json`. The exit code is 1 when a target cell or a parity cell fails. The
`FAIL*` mechanism for documented structural misses (`KNOWN_MISSES`, fails only with `--strict`) is kept, but the list is
empty since the PO decisions of §8.

Targets are plan §9, with two PO decisions (2026-10-09, §8):
- Chapter 1 boss times come from economy_sim's own Chapter 1 model on this content: 8.1 / 4.4 / 2.8 min ±15%.
- The Beginner's first-try boss clear must land in an 80–90% window.

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

## 2. Final table vs targets

200 seeds per level per persona. Before the §8 changes, every clear cell was 100%.

| Persona | Normal active, L1–L9 mean (target) | Boss active (target) | First-try clear, normal / boss (target) | Skill share (15–20%) |
|---|---|---|---|---|
| Beginner 20 | **4.31** (3.0–4.5) PASS | **8.68** (~8.1) PASS(±15%) | **99.9%** (worst level 99.5%) / **85.0%** (≥80 / 80–90 window) PASS | 17.0% PASS |
| Average 40 | **2.33** (2.4–3.0) PASS(±15%) | **4.46** (~4.4) PASS(±15%) | 100% / 100% (≥97 / ≥85) PASS | 16.1% PASS |
| Fast 75 | **1.58** (1.7–2.2) PASS(±15%) | **2.95** (~2.8) PASS(±15%) | 100% / 100% (≥99 / ≥90) PASS | 15.2% PASS |
| Reference 35 | auto-attacks per encounter **11.6** (~11) PASS(±15%) | | | 16.4% |

The Beginner's boss clear is 87.4% over 1000 seeds (85.0% at the default 200, whose standard error is about ±2.5
points).

**Parity with economy_sim's Chapter 1 model on this content.** Every cell passes.

| Persona | Normal: sim / Py, mean (worst level) | Boss: sim / Py | Clear vs Py Ch1 row (100%) |
|---|---|---|---|
| Beginner | 1.05 (1.13) | 1.07 (8.68 vs 8.09 min) | 99.9% normal; boss clear is set by the PO window instead (§8) |
| Average | 1.02 (1.09) | 1.02 (4.46 vs 4.38) | 100% / 100% |
| Fast | 1.06 (1.12) | 1.06 (2.95 vs 2.80) | 100% / 100% |

**Per level** (clear, active minutes sim vs Py, mean auto-attacks per encounter, skill share, mean damage taken per
run):

| Level | Beginner | Average | Fast |
|---|---|---|---|
| L1 (2 enc, tutorial) | 100%, 3.12 vs 2.81, 12.0 auto, 18.3%, 57 dmg | 100%, 1.73 vs 1.59, 11.7, 17.4%, 16 | 100%, 1.20 vs 1.07, 12.0, 16.4%, 6 |
| L2 (2 enc) | 99.5%, 3.01 vs 2.85, 11.6, 16.5%, 59 | 100%, 1.65 vs 1.61, 10.8, 16.2%, 19 | 100%, 1.16 vs 1.08, 11.0, 15.9%, 8 |
| L3 | 100%, 4.27 vs 4.27, 11.3, 17.6%, 38 | 100%, 2.30 vs 2.38, 10.4, 16.5%, 11 | 100%, 1.60 vs 1.57, 10.6, 15.4%, 4 |
| L4 | 100%, 4.91 vs 4.34, 12.9, 17.5%, 83 | 100%, 2.61 vs 2.41, 12.3, 16.4%, 24 | 100%, 1.76 vs 1.58, 12.6, 15.4%, 6 |
| L5 | 99.5%, 4.68 vs 4.41, 12.3, 16.9%, 70 | 100%, 2.52 vs 2.44, 11.6, 16.1%, 23 | 100%, 1.70 vs 1.60, 11.7, 14.8%, 7 |
| L6 | 100%, 4.71 vs 4.47, 12.6, 16.8%, 60 | 100%, 2.59 vs 2.47, 12.0, 16.2%, 20 | 100%, 1.72 vs 1.61, 12.1, 15.1%, 6 |
| L7 | 100%, 4.73 vs 4.54, 12.6, 17.7%, 75 | 100%, 2.59 vs 2.50, 11.9, 15.9%, 25 | 100%, 1.71 vs 1.62, 12.0, 14.6%, 8 |
| L8 | 100%, 4.46 vs 4.61, 11.7, 16.5%, 50 | 100%, 2.36 vs 2.53, 10.6, 15.0%, 12 | 100%, 1.59 vs 1.64, 10.2, 14.5%, 3 |
| L9 | 100%, 4.94 vs 4.67, 13.1, 17.1%, 58 | 100%, 2.63 vs 2.56, 12.4, 16.5%, 18 | 100%, 1.75 vs 1.65, 12.4, 15.5%, 5 |
| L10 boss | **85.0%**, 8.68 vs 8.09, 110 dmg, Second Wind in 20% of runs, 0 / 2869 rubble missed | 100%, 4.46 vs 4.38, 24 dmg | 100%, 2.95 vs 2.80, 5 dmg |

- **Boss phases** (min):

  | Phase | Beginner | Average | Fast |
  |---|---|---|---|
  | Pre-boss waves | 2.70 | 1.58 | 1.12 |
  | Phase 1 | 1.67 | 0.77 | 0.39 |
  | Phase 2 (Doom) | 2.36 | 1.05 | 0.82 |
  | Phase 3 + finisher | 1.78 | 0.90 | 0.46 |

- **Damage by origin** (Average): weapon 58%, chip 18%, skill 16%, counter 6%, rubble 1%. All the skill damage is
  Fireball, since Aegis does no damage.
- **Chapter 1 gold** for first clears (level and chest gold): about 2110–2180 per persona.
- **Damage taken.**
  - The reference typist takes **44.6 per level** without a defensive build (no Aegis or Iron Will), at 60% guard. The
    budget is 44.0, from `DMG_FRAC` 0.40 × par HP × saw.
  - With the starter kit the same typist now takes **23.5** per level. Before §8 it took 10.2, so the kit's damage
    reduction went from 77% to 47%.
  - The Beginner takes 61 per level with the starter kit (31 before §8).

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
  - `golem-20wpm-sw` used a barrier-free build with a 40% guard attempt rate and seed 4245. With the knob on, the
    starter kit at 20 WPM never needed a Second Wind at the boss, and this scenario must still cover a mid-boss Second
    Wind. §8.2 superseded this: the scenario is back on the starter kit.
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

- **Boss times against §9's story-wide 5.4 / 4.2 / 3.4 min.** This was the earlier `FAIL*` and is resolved by the PO
  decision in §8.1.
  - Background: economy_sim puts a 20 WPM Chapter 1 boss at about 7.4 min (8.1 on this content).
  - No pace-independent knob makes 20 and 75 WPM land within 1.6× of each other.
  - If the PO later wants a ~6 min boss at 20 WPM, the measured options are:
    - pace-adaptive boss HP with economy_sim's `HP_PACE_EXP`: 7.2–7.5 / 4.6 / 3.2 min with `--whatif hpPaceExp=0.5`
      or `0.7`;
    - plus a Doom change (spell characters pay ATB, or fewer and shorter spells at slow paces). Phase 2 alone is
      2.4 min for the Beginner.
- **The Beginner's boss clear (85% at 200 seeds, 87% at 1000) sits in the middle of the 80–90% window**, but it is a
  probability.
  - It is sensitive to the bot model. The bot's guard attempt rate (0.60) is calibrated to economy_sim's guard of 0.40.
  - It is also sensitive to gimmick reading cost, which the bot gets for free.
  - With the bot guarding every word, the 20 WPM boss clear is still 100% (`bossBot.test.ts`). The fails come from
    unguarded hits.
  - Re-check it with T6.2 playtests.
- **Average 2.33 and Fast 1.58 normal-level times** sit just under §9's ranges, inside the ±15% band. Matching the
  Python makes them land where economy_sim's own model lands.
  - Raising HP until they enter the range would push the Beginner over 4.5 min and the reference to about 12.5
    auto-attacks.
  - The 2-encounter L1–L2 pull the mean down. For 3-encounter levels alone the times are 4.67 / 2.51 / 1.69.
- **Fast boss 2.95 vs 2.8.** Inside the band. economy_sim's `BOSS_EXTRA_S` (30 s of intro dialogue, breathers and
  finisher) is only partly modelled by the sim. A client boss-intro dialogue would add about 15 s for every persona.
- **The bot is optimistic about gimmicks.** It reads scrambled and faded words for free. Real players will be slower on
  L4–L9 and on the phase-1 adds. The Playwright bot and playtests in T6.2 should check this.
- **Second Wind on normal levels is rare.** Even after §8 it fires in about 0.5% of Beginner runs, on L2 and L5 only.

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

## 8. PO decisions of 2026-10-09 (T6.1 follow-up)

### 8.1 Chapter 1 boss time targets

§9's boss times (5.4 / 4.2 / 3.4 min) are 30-chapter averages (§3.5). For Chapter 1 the targets are economy_sim's own
Chapter 1 model on this content: **8.1 / 4.4 / 2.8 min, ±15%**. Normal-level times keep §9's ranges.

- **Tool:** `PLAN_TARGETS` boss times are 8.1 / 4.4 / 2.8, and `KNOWN_MISSES` is now empty.
- **`bossBot.test.ts`:** now checks every tier's boss time (+10 s level end) against these targets ±15%.

### 8.2 "Add some risk": a weaker starter kit, and the Beginner boss clear at about 80–90%

The PO asked for the Beginner's first-try boss clear in an **80–90%** window, with every other §9 clear target held.
Every persona was at 100% before.

**The defensive skills alone cannot reach the window.** Beginner boss clear, 200 seeds:

| Aegis charge / barrier hits, Iron Will | Beginner boss clear |
|---|---|
| 10 / 2, 0.10 (before) | 100% |
| 10 / 1, 0.10 | 98.5% |
| 10 / 1, 0.20 | 98.5% |
| 14 / 1, 0.20 | 96.0% |
| 18 / 1, 0.20 | 96.0% |
| No Aegis or Iron Will at all | about 80–87% |

- Iron Will barely matters at the boss, because the Beginner blocks little.
- Getting to about 85% would need Aegis to be practically useless (charge 25 or more).

So the change combines a moderate nerf with the smallest alternative the orchestrator named: **an L10-only hit
multiplier**.

| Knob | Where | From → to | Why |
|---|---|---|---|
| Aegis | `BALANCE.SKILLS.aegis` | charge 10 → **12**, barrier_hits 2 → **1** | Absorbs per word 0.2 → 0.083. The starter kit's damage reduction goes from 77% to 47% (reference typist 10.2 → 23.5 per level). |
| Iron Will | `BALANCE.IRON_WILL_BLOCK_MULT` (and the mirror `PASSIVES.ironWill.block_mult`) | 0.10 → **0.15** | A block takes 15% instead of 10%, still better than the base 20%. |
| `BOSS_LEVEL_HIT_MULT` (new) | `levels.ts`; applied to L10's wave `gruntHit` (and so the phase-1 adds) and to the Ruin Golem's `hit` in `bosses.ts` | 1 → **1.3**. 5.28 → 6.86, 7.98 → 10.37 | Lands the Beginner boss clear at 85.0% (200 seeds) and 87.4% (1000 seeds). Sweep: ×1.0 gives 97.5%, ×1.3 gives 85.0%, ×1.6 gives 69.0%. Rubble miss (6) and Doom damage (15% par HP) are unchanged. |

**First-try clears, before → after** (200 seeds):

| Persona | Normal (mean, worst level) | Boss |
|---|---|---|
| Beginner 20 | 100% → **99.9%** (99.5% on L2, L5) | 100% → **85.0%** |
| Average 40 | 100% → 100% | 100% → 100% |
| Fast 75 | 100% → 100% | 100% → 100% |

- Average and Fast boss runs take 24 and 5 damage, so they keep a large margin.
- Times are unchanged within noise.
- Skill share is unchanged: Aegis does no damage. Fireball stays at 1.3×.

**Fixtures and tests.**
- `CONTENT_VERSION` → ca6ebf5a.
- `golden-typing.json` is regenerated: Aegis and Iron Will appear in the kit and golem scenarios.
  - `golem-20wpm-sw` is back on the starter kit, with a 60% guard attempt rate (the Beginner's calibrated rate) and
    seed 4246. It covers a mid-boss Second Wind that still clears.
- `skills.test.ts` and `combat.test.ts` (Aegis 1 barrier, chargeFrac 0.125, Iron Will 0.75 of 5) and `resolve.test.ts`
  (boss hit 10.37, adds hit 6.86) are updated.
- `bossBot.test.ts` asserts that a 20 WPM typist guarding 60% of attacks now fails some boss runs.

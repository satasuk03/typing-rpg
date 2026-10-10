# Block chance analysis (PO feedback, 2026-10-10)

> "Enemy attack should not always be blocked. There will be a chance that attack can be blocked (via typing block) like
> only 20-30%. This will force user to upgrade themselves like defense, health, etc."

Analysis only. No game code changed. Author: Opus design reviewer.

## TL;DR

- **The literal version (a typed guard succeeds 25-30% of the time) breaks Chapter 1 for the Beginner.** The Beginner's
  boss clear falls from **85% to 36-41%**, against an 80-90% window. Damage taken per level nearly doubles for the
  Beginner (61 to 108) and triples for the Average typist (19 to 58).
- **It does not "force upgrades" where it is meant to.** Average and Fast typists still clear 100% of Chapter 1 at par
  gear. The extra pressure lands almost entirely on the slowest typists, who already struggle. A Chapter 1 player also
  has nothing to upgrade to: par is T1 Common +0, and the chapter pays about 2,100 gold.
- **Dice after correct typing punish skill.** A perfect guard word typed in time would still get the player hit 75% of
  the time. In a typing-skill game, that turns the main defensive skill into noise.
- **Recommendation: "Guard Rating vs Attack Power".** It is deterministic and driven by gear.
  - A typed guard always works. When the enemy's attack Power is above the hero's armor Guard Rating, part of the hit
    **leaks through**: `leak = clamp(1 − G/P, 0, 0.5)`.
  - At par gear, leak is 0 on L1-L9, and the Ruin Golem's slam leaks 20%.
  - Gate check: no cell fails. One retune comes with it: `BOSS_LEVEL_HIT_MULT` 1.3 to 1.235, which puts the Beginner's
    boss clear at 86.0% over 1,000 seeds.
  - From Chapter 2 on, under-geared players take visible guard leak, and every armor upgrade visibly cuts it.

## 1. How the guard works today

- `level.ts` `onPlateCompleted`: a guard plate finished before impact sets `guardResult` to `"parry"` if it was typed
  perfectly, and to `"block"` otherwise.
- `combat.ts` `resolveImpact` applies that result:
  - a parry takes 0 damage, then a counter (50% ATK) and `PARRY_ATB`;
  - a block takes `BLOCK_MULT` 0.20 of the hit, or 0.15 with Iron Will;
  - otherwise an Aegis barrier absorbs the hit, or it lands in full.
- There is **no DEF stat**. Armor feeds only max HP (`meta/loadout.ts`: HP0 × armor item score; +7% per upgrade step).
- **Measured fact that drives this whole analysis: 81-97% of successful guards are Parries, not Blocks** (Beginner 81%,
  Average 93%, Fast 97%, Ref 90%). Tuning `BLOCK_MULT` alone therefore barely moves anything (§3, options A and C).

## 2. Method

- Runs used the real `pnpm balance` with 200 seeds, noise on and the starter kit. All 31 gate cells were checked:
  17 plan §9 cells and 14 parity cells.
- **`--whatif guard=x`** scales the bot's guard *attempt* rate. It approximates the literal rule, but too
  optimistically: the bot skips the guard word instead of typing it and then getting hit, so it keeps typing time and
  loses guard chip.
- **A faithful model** came from a throw-away copy of the repo in the session scratchpad, not this branch. In that copy,
  `resolveImpact` got env-driven knobs:
  - `BC_P`: the success chance of a typed guard, rolled on a separate derived stream (`deriveRng(…, "meta", 991)` keyed
    on tick and enemy), so it is seeded and deterministic;
  - `BC_PARRY`: whether parries roll too;
  - `BC_FAIL`: the damage multiplier for a failed guard;
  - `BC_BLOCK`: a block multiplier override;
  - `BC_LEAK`: guard leak.
- The unpatched copy reproduces the repo baseline exactly: 61.1 damage per level, 85.0% boss clear.
- The 44.0 damage budget is defined for the **reference 35 WPM typist on the bare kit** (`DMG_FRAC`). Starter-kit
  numbers are shown for context.

## 3. Results

Damage taken is the mean per normal level (L1-L9). "Boss" is the first-try L10 clear. "SW" is the share of boss runs that
needed a Second Wind.

| Variant | Beginner 20: dmg / worst-level clear / boss / SW | Average 40: dmg / boss | Fast 75: dmg / boss | Ref 35 dmg (starter) | Gate FAILs (of 31) |
|---|---|---|---|---|---|
| **Baseline** | 61 / 99.5% / **85.0%** / 20% | 19 / 100% | 6 / 100% | 23.5 | 0 |
| Literal, knob `guard=0.25` (approximation) | 115 / 70.5% / 17.5% / 90% | 64 / 100% | 32 / 100% | 74 | 5 |
| Literal, knob `guard=0.30` (approximation) | 110 / 79.0% / 24.5% / 86% | 60 / 100% | 30 / 100% | 70 | 5 |
| **Literal 25%** (block and parry both roll) | **108** / 85.5% / **36.0%** / 74% | **58** / 100% | **28** / 100% | 67 | **3** |
| **Literal 30%** | **105** / 88.5% / **40.5%** / 72% | **55** / 100% | **26** / 100% | 64 | **3** |
| Literal 25%, parries exempt (only Blocks roll) | 68 / 98.0% / 80.5% / 26% | 21 / 100% | 7 / 100% | 27 | 0 |
| Literal 25% + every hit ×0.70 (retune) | 77 / 100% / 86.0% / 19% | 41 / 100% | 20 / 100% | 47 | 1 |
| A: 25% chance, failed guard takes 50%, parries exempt | 64 / 99.0% / 85.0% / 20% | 20 / 100% | 6 / 100% | 25 | 0 |
| C: Block takes 40% (DEF-scaled block at par) | 64 / 99.0% / 84.5% / 20% | 20 / 100% | 6 / 100% | 25 | 0 |
| B: 1/3 of attacks unguardable (`guard=0.67`) | 81 / 97.0% / 67.0% / 45% | 34 / 100% | 15 / 100% | 41 | 2 |
| B + every hit ×0.85 | 71 / 99.5% / 82.0% / 23% | 30 / 100% | 13 / 100% | 36 | 1 |
| B: 1/2 unguardable (`guard=0.5`) | 93 / 91.0% / 45.0% / 65% | 45 / 100% | 20 / 100% | 53 | 5 |
| G: Guard leak 10%, every guard | 69 / 98.5% / 83.5% / 22% | 27 / 100% | 13 / 100% | 32 | 0 |
| G: Guard leak 20%, every guard | 72 / 98.5% / 79.5% / 27% | 29 / 100% | 14 / 100% | 34 | 1 (boss window, 79.5%) |
| G: Guard leak 30%, every guard | 78 / 98.0% / 77.0% / 32% | 34 / 100% | 19 / 100% | 40 | 1 (boss window) |
| **Rec.: leak 20% on L10 only + L10 hits ×0.95** | L1-9 unchanged / **86.0%** (1,000 seeds) / 19% | unchanged / 100% | unchanged / 100% | 23.5 | **0** |
| Rec. with +3 armor (G/P 0.97, leak 3%), L10 | 89.0% | 100% | 100% | | 0 |

**The cells that fail under the literal 25-30% rule:**
1. Beginner first-try boss clear (target ≥50%). It is 36% or 40.5%: **FAIL**.
2. Beginner boss clear, PO window 80-90%: **FAIL**. Over 1,000 seeds the value is 37.7%.
3. Beginner normal active / Py, worst level: 1.16, just past the ±15% band: **FAIL**. Losing parry counters and
   `PARRY_ATB` makes fights longer.

With the bare kit (no Aegis or Iron Will), the reference typist takes **100 per level against the 44.0 budget (2.3×)**.
The bare-kit baseline is 45.4. In the bare-kit run the Beginner clears only 65.7% of normal levels and 2% of boss runs.

**Reading the table:**
- The literal rule adds about +47 damage per level for the Beginner, +40 for Average and +22 for Fast. In relative terms
  that is ×1.8, ×3.1 and ×4.8. Even so, Average and Fast never come close to dying in Chapter 1.
- Retuning the literal rule back into the gates needs every hit cut by about 30%. That just moves damage from slow to
  fast typists, and a parity cell still fails.
- Options A and C are nearly inert, because Blocks are rare: perfect typing makes Parries.
- Guard leak (G) charges a fairly *flat* toll per guard: +11 for the Beginner, +10 Average and +8 Fast at 20%. Skilled
  players guard the most, so it is the only variant that makes gear matter to them, and it barely touches the Beginner.

## 4. Options

| | D: literal dice (the PO's version) | A: DEF-driven block chance | B: Heavy (unguardable) telegraphed attacks | **G: Guard Rating vs Attack Power (leak)** |
|---|---|---|---|---|
| Rule | A typed guard rolls at p = 25-30%. On a fail, the full hit lands. | Chance = 25% + gear. A failed guard still takes only 50%. | Some attacks show a red Heavy telegraph and get no guard plate. DEF/HP reduce them. You beat them by killing or Breaking the enemy first. | A typed guard always works. If P > G, `clamp(1 − G/P, 0, 0.5)` of the hit leaks through, also on a Parry (the counter is kept). |
| Typing rewarded? | **No.** Perfect input fails 70-75% of the time. | Partly. It is still a dice roll, just softer. | Yes. Speed is the answer: Break or kill before the impact. | **Yes, always.** Parry is still best; Block is still 80%+ mitigation. |
| Do upgrades matter? | Only via HP, and Average/Fast don't need it in Chapter 1. | Weakly. Blocks are 3-19% of guards. | Yes, for everyone (HP / DEF against Heavy hits). | **Yes, for everyone who guards.** Each +1 armor (+7% G) visibly cuts leak, and the HP still helps the Beginner. |
| Sim / RNG | New stream `"guard"` (§1.3: a new consumer gets a new stream), one draw per guarded impact. Trial/ranked would get RNG in defense. | Same as D. | No RNG. A per-enemy, content-authored `heavyEvery` cycle pattern, or a draw from the existing `enemyAi` stream (which shifts draws, so it bumps `SIM_VERSION`). | **No RNG.** Pure integer maths on `scoreOf(loadout.armor)` and an authored `attackPowerM`. Ranked's standardized gear gives everyone the same G. |
| Contract changes (`docs/interfaces.md`) | `EnemyAttack.outcome` gets `"guardFailed"`, or a new `GuardFailed{enemyId, damage}` event. `GuardWordTyped.result` is no longer final. | Same as D, plus a new gear stat (§6 schemas, §8 meta). | `EnemyAttackWindup.heavy: boolean`. Content: `heavy` in the enemy attack schema. `DEF` on armor (§6/§8). | `GuardBlocked` / `GuardParried` get `leak: number` (bp) and `leakDamage`. `view.ts` exposes `guardRatingBp` per enemy. Content: `attackPower` per enemy (default = par → 0 leak). `BALANCE.GUARD_LEAK_CAP` 0.5. |
| HUD/VFX needed | A "GUARD FAILED" stinger, or players will report "I typed it and still got hit" as a bug. | Chance % on the plate, plus the stinger. | A red Heavy windup, a "BRACE" cue, a crack-proof icon. | The guard plate shows a shield icon that cracks when P > G, with the leak % ("Guard 80%"). The Block/Parry VFX play as now, plus a small red "leak" damage number. The results screen hints "Armor +3 would stop this leak". |
| Retune to pass the gates | Hits ×~0.7. It still fails 1 parity cell, and the Fast/Average curve shifts. | None needed (inert). | Hits ×0.85, and the Beginner worst-level parity still fails. | **L10 hit ×0.95** (`BOSS_LEVEL_HIT_MULT` 1.3 → 1.235). No other change. |

## 5. Recommendation: G, Guard Rating vs Attack Power

**Rule (sim, pure integers).**
- `G` = `scoreOf(loadout.armor)`. This is the existing item score: tier growth × rarity × (1 + 0.07 × upgrade). No new
  gear stat is needed; armor simply gains a second meaning.
- `P` = the enemy's `attackPowerM`, authored per level as a multiple of that chapter's **par** armor score.
- `leakBp = clamp(10000 − G·10000/P, 0, GUARD_LEAK_CAP_BP 5000)`.
- Parry: damage = `hit × leak`; the counter and `PARRY_ATB` are unchanged.
- Block: damage = `hit × leak + hit × (1 − leak) × blockMult`.
- An unguarded hit or an Aegis barrier is unchanged.

**Suggested numbers.**

| Content | P (× par armor) | Leak at par | Leak at +3 (×1.21) | Leak at +5 (×1.35) |
|---|---|---|---|---|
| Ch1 L1-L9 grunts | 1.00 | 0 | 0 | 0 |
| Ch1 Ruin Golem and phase-1 adds | 1.25 | 20% | 3% | 0 |
| Ch2+ grunts | the chapter's **next-step** par: 1.07^(PAR_UPG(ch)+1) / 1.07^PAR_UPG(ch) ≈ 1.07 | ~7% | 0 | 0 |
| Ch2+ elites / bosses | 1.25-1.35 | 20-26% | 0-10% | 0-7% |

- This gives the PO's "a guard doesn't stop everything; 20-30% on the big hits" as a **readable, gear-driven,
  deterministic** rule. A player at par gear sees roughly 20-25% leak on boss attacks, and each upgrade cuts it.
- Retune: `BOSS_LEVEL_HIT_MULT` 1.3 → **1.235**. Measured: Beginner boss clear 86.0% over 1,000 seeds (87.4% at
  baseline). Average and Fast stay at 100%. L1-L9 are byte-identical, so the other 30 cells are unchanged.
- **Ch2+ curve:** solve `HIT_MULT` per chapter with the leak in place, using `solve-hits` (§7 of `balance-ch1.md`). Use
  the reference typist **at par gear**, so that par still meets `DMG_FRAC`, and check that "par − 3 upgrades" lands at
  about 1.3× the budget. That is the "force upgrades" lever, and it can be measured.
- **Beginners and HP:** a Beginner guards only about 38% of attacks, so their gear value is mostly HP, which armor
  already gives (+7% per step). The leak rule adds a reason for *skilled* players to upgrade, which the literal dice
  rule never did.
- **Later option, after the leak:** B (telegraphed Heavy attacks) as content for elites and bosses from Chapter 2, with
  Heavy every 3rd cycle, deterministic per enemy and not random. Speed and Break skill get a role, and HP gets a hard
  check.
- **If the PO insists on chance:** use A rather than D. Put the chance on Blocks only, and never on a perfect Parry.
  Have a failed block still take 50%. Publish the % on the plate. Roll on a dedicated `"guard"` stream. Expect it to do
  little (≤ +3 damage per level), because Blocks are rare.

**Implementation footprint for G (for a later ticket, not done here).**
- Code: `combat.ts` `resolveImpact`, `balance.ts` (`GUARD_LEAK_CAP`), and the content schema plus `levels.ts` /
  `bosses.ts` (`attackPower`).
- Events: `leak` fields on `GuardBlocked` / `GuardParried`.
- View: `view.ts` gets `guardRatingBp`.
- HUD: a cracked-shield plate badge, a leak damage number, and a results-screen hint.
- Tests and fixtures: the golden typing fixtures change only for the golem scenarios. `CONTENT_VERSION` bumps;
  `SIM_VERSION` stays 1 (pre-release practice).
- `docs/interfaces.md` gets a v1.8 entry for the events, the view and the schema field.
- Render/VFX changes need before/after screenshots.

## 6. Reproduce

- **Repo knob runs:**
  - `pnpm balance --whatif guard=0.25`
  - `pnpm balance --whatif guard=0.3`
  - `pnpm balance --whatif guard=0.67,hit=0.85`
  - `pnpm balance --kit bare`
- **The other rows** need the scratch patch. It wraps `resolveImpact` with the `BC_*` env knobs from §2 and was not
  committed. Reapplying it to a scratch copy is about 20 lines.
- Every row uses 200 seeds unless marked 1,000.

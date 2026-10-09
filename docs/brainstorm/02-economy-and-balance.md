# 02 — Economy, Difficulty Curve & Balance (simulated) — v2

> Status: brainstorm / proposal backed by a Monte-Carlo simulation. Owner: economy & balance.
> Simulator: `docs/brainstorm/sim/economy_sim.py` (Python 3, stdlib only). Raw output with every table: `docs/brainstorm/sim/economy_sim_output.md`.
> To regenerate everything (about 25 s):
> ```
> python3 docs/brainstorm/sim/economy_sim.py > docs/brainstorm/sim/economy_sim_output.md
> python3 docs/brainstorm/sim/render_doc.py      # fills sim/02_doc_template.md -> 02-economy-and-balance.md
> ```
> All tunables are in the `PARAMETERS` block at the top of the script. Edit prose in `sim/02_doc_template.md`, not in this file. Tables and placeholder numbers are filled in from the sim output. A few inline numbers in the prose are hand-written; re-check them after retuning.
> Every table comes from the simulation: 60 full 300-level journeys per persona, seed 20261008.

## v2 changes (2026-10-08, after the product decisions in 00-overview §3 and §6)

| Change | What moved |
|---|---|
| **Gear Caches added** (00 §6.2) | Level-matched random gear boxes at the frontier tier with fixed published odds C 40 / U 33 / R 20 / E 6 / L 1 plus a published pity guarantee. Price: **14 GU of gold** (gold sink) or **50 gems**, with a cap of **1 gem cache per day**. Free sources: Gold chest 1, Mythic chest 2, weekly missions 2, 30-star chapter 1. Gold and Mythic chests no longer roll gear directly; caches replace that roll, so Epic and Legendary are no longer drop-only. New sections 6.5 and 7.3. |
| **Season pass added** (00 §6.4) | Cosmetic only: no gear, caches or gold. Proposed price **950 gems**, with 50 gems returned on the premium track. XP comes from typing (1 per word) plus missions. 40 tiers × 1,500 XP. New section 7.4. |
| **Resolutions applied** (00 §3) | C2 (Survival +2% ATK/wave, 12% heal), C3 (skill share now reported, 11–17%), C4 (Doom 15% par HP), C5/C6 (GU-scaled missions and Satchel), C7 (weekly Survival wave 20; no sim effect), C10 (revive 50% HP), C11 (★★ relative to own median; see new conflict C12). |
| **Re-check result** | Caches do **not** inflate power. Average stays at 0.90–1.06× par per chapter with the same story hours (18.8 h vs 18.8 h in v1) and clear rates (97% / 88% vs 97% / 87%). Beginner 39.8 h (v1 41.1). Fast 14.6 h (v1 14.5). Gold is still fully spent: Average puts about 76% into upgrades, 20% into caches and 4% into shop pieces. |
| **Gem caches** | Buying the daily cap (1 per day, about $12–13/month) saves Average about 1 h (6%) and Fast 0 h, but saves Beginner about 7 h (18%). That is flagged as C13. |
| **Lootbox odds** | Unchanged: cosmetic Scribe's Chest effective Legendary rate is **3.16%** with pity (fixed published odds, pity published as a guarantee). |

---

## 0. TL;DR

| | Beginner (20 WPM, 88%) | Average (40 WPM, 94%) | Fast (75 WPM, 97%) |
|---|---|---|---|
| Story hours (P10–P90) | 39.8 (36-45) | 18.8 (18-20) | 14.6 (14-15) |
| Days to finish (B 45 min/day, A/F 60) | 53 | 19 | 15 |
| Minutes per level incl. menus | 3.8 | 3.1 | 2.5 |
| First-try clear, all levels | 81% | 97% | 99% |
| First-try clear, bosses | 55% | 88% | 92% |
| Grind replays over the story | 199 | 13 | 2 |
| WPM / accuracy at story end | 38/91.3% | 45/94.6% | 78/97.2% |
| Gear power vs par at end | 1.49 | 1.24 | 0.73 |
| Stars at story end / extra h for 900 | 513/900 / +113 h | 570/900 / +25 h | 609/900 / +13 h |
| Levels needing >40 tries (hard walls) | 0 | 0 | 0 |

The main conclusions:

1. **The difficulty curve works without any skill-only walls.** Average clears 97% of levels on the first try (88% of bosses). Beginner clears 81% on the first try and grinds about 7 replays per chapter. Fast clears 99% while running gear that is only 0.73× of the par build, so fast typists can skip tiers. In 60 journeys per persona, no level needed more than 40 attempts. A Beginner whose skill never improves can still reach a 50% win rate on every boss using shop-buyable Rare +10 gear (section 9.3). Gear Caches are not needed for that.
2. **Play time.** Average finishes the story in about **18.8 h**. 100% completion (all 900 stars) adds about +25 h, which puts the full journey at about **44 h**. Beginner needs about 39.8 h, or about 29 h on the 01-doc "Story" preset. Fast needs about 14.6 h. The brief's 40–80 h target is hit for *completion*, not for the critical path. Section 10 shows that a 40-hour critical path is impossible with 300 levels of 2–4 minutes unless 60% of play is forced grind.
3. **No gold inflation, including the new Gear Caches.** Average and Beginner spend 98–99% of the gold they earn (upgrades, then caches, then a few shop pieces). The bank never holds more than about 1.5 next-tier items. Every chapter brings about one new gear piece (from caches, chests, the boss's guaranteed next-tier drop, or the shop). Fast typists run a surplus, which the cosmetic Gold Satchel sink absorbs.
4. **Gear Caches are fun without breaking the curve.** Average opens about 62 caches over the story: 18 bought with gold, the rest from chests and weeklies. About 1 in 5 improves its gear, a Rare or better shows up roughly every 3 caches (guaranteed within 8), and a Legendary roughly every 64. Players who overbuy caches for the thrill finish within ±0.3 h of pure-EV shoppers, so caches are never a trap.
5. **Gems are cosmetic plus convenience.** An engaged F2P player earns about **192 gems/week (830/month, about 1,530 per 8-week season)**. That covers the 950-gem season pass plus about 4 Scribe pulls each season. A typical retained player (about 1,080 per season) can still afford the pass. A paid revive on every failed level saves Average about 1 h. Buying the daily gem-cache cap saves Average about 1 h and Beginner about 7 h, for about $12–13 a month.

---

## 1. Alignment with docs 01 and 03 (and conflicts)

The simulator uses the combat rules from `01-combat-and-levels.md` and the gem/box rules from `03-meta-monetization-backend.md`, as follows:

| From | Mechanic | How it is modeled |
|---|---|---|
| 01 §2.2 | ATB 0–100. Sword: 8 per correct char, 10 word bonus, ×1.25 on a Perfect word, +5 Swift | Expected ATB per plate. Swift is 12% of Perfect words |
| 01 §1.5 | `ComboMult = 1 + 0.02 × min(Combo, 25)`. Combo = consecutive Perfect words. A typo halves it | Stationary distribution of a Markov chain (+1 on Perfect, halve otherwise) |
| 01 §1.3 | Word Strike chip: 15% ATK, or 25% on a Perfect word | Per completed plate |
| 01 §1.6 | Enemy interval × `(35/Pace)^0.7`, clamped 0.6–1.8. Pace = in-level net WPM | Pace = the persona's effective WPM *after* word difficulty |
| 01 §1.7 | Guard: Block takes 20% damage, Perfect Parry takes 0 | Damage × `1 − g·0.8 − g·acc⁴·0.2`, where g = guard success (persona skill, learns over time) |
| 01 §1.8 | +25% HP on each walk; Second Wind (type a sentence, revive at 30%) | Second Wind success = 0.55 + 4·(acc − 0.86), clamped 0.4–0.97 |
| 01 §6 | Normal level ≈ 2:45 and ~10 auto-attacks per encounter at Pace 35. Boss ≈ 4:10. Levels 1–20 use 2 encounters | Reference typist (35 WPM, 92%) attacks every 3.2 s and an encounter lasts 36 s, so about 11 auto-attacks. Average boss level = 4.2 min |
| 01 §5.1 | Word tiers T1–T10 by chapter | Plate length, caps, punctuation and numbers per tier. The mix is 75% current tier and 25% review |
| 03 §2 | Scribe's Chest 160 gems, rates 62/27/9/2, Epic pity 10, Legendary soft pity from 45 (+5 pp/pull), hard pity 60 | 600k-pull simulation |
| 03 §3.5 | Free gems ~200/week, cap 250/week, achievements 600 one-time, revive 30 gems, Feathers | Weekly inflow simulated. Feathers ≈ 2.5/week, cap 5 |

**Status:** C1–C11 below were adopted in 00-overview §3 (C1 kept as is). They are kept here for traceability. **New v2 conflicts are C12–C17** at the end of the table.

| # | Doc | Issue | Proposal |
|---|---|---|---|
| C1 | 01 §1.6 | Pace-adaptive *intervals* equalize pressure, but enemy *HP* is not adaptive, so a 20-WPM typist's levels take about 1.5–2× longer (Beginner 3–4.5 active min/level vs. 2.6–3.0 for Average). | Keep it this way. Speed should feel rewarding, and slow typists also get more practice per level. `HP_PACE_EXP` (default 0) can scale enemy HP by `(Pace/35)^x` if playtests show Beginner levels drag. Setting x = 0.35 brings Beginner levels under 4 min, but it also erases most of the Fast persona's ability to skip tiers. |
| C2 | 01 §7.2 | Survival scales enemy HP but not damage. Because intervals are Pace-adaptive, runs became nearly endless for fast typists in early tests. | Add **+2% enemy ATK per wave** and raise between-wave heal to **12%** (01 says 10%). Result: Average reaches wave ~22, Fast ~29, Beginner ~19. |
| C3 | 01 §3.1 | Taken at face value, the listed skill damage (e.g., Piercing Thrust 2.5× every 6 charges) would make skills >50% of DPS. | The model uses an average of **0.12 ATK per skill charge** across both slots (one damage skill + one utility skill). Skills ≈ 15–20% of damage, auto-attacks 61–76%, chip the rest. Damage skills need about 40% less than the 01 numbers, or longer charge times. |
| C4 | 01 §4.2 | Doom Spell damage "≤40% max HP" is gear-independent, which creates a pure skill wall. | Failed Doom Spell = **15% of *par* HP**, so better armor reduces it. Fail chance ≈ 6% + 2.5·(0.95 − acc). |
| C5 | 03 §3.2–3.3 | Mission gold is flat (300–600 per daily, 2–3k per weekly). That is 20+ levels' worth at chapter 1 and almost nothing at chapter 30. | Express all mission and calendar gold in **Gold Units (GU)**, where 1 GU = first-clear gold of L1 of the player's frontier chapter. Daily mission = 1 GU, weekly set = 18 GU, 7-day calendar = 3 GU/week. The numbers are in table 6.2. |
| C6 | 03 §2.1 | Gold Satchel costs a flat 5,000 gold. That is 50 levels of income at ch1 and trivial by ch20. | Price it at **25 GU** (5,000 at about ch7). The sim shows only gold-rich (Fast) players buy it, which is exactly the sink we want. |
| C7 | 03 §3.3 | Weekly mission "Reach Survival wave 30" is above Average's mean wave (~22) and Beginner's (~19). | Change it to **wave 20**, or to "beat your 4-week median wave". |
| C8 | 03 §2.2 | The published "effective Legendary incl. pity ~2.6%" is wrong under the stated soft pity. | The simulated effective rate is **3.16%** (mean 31.6 pulls). Publish the corrected figure. |
| C9 | 03 §2.5 | "Direct shop is 60–70% of the expected box cost of a specific item" does not hold. | With a pool of 20 Legendaries, a *specific* Legendary costs ~53k gems through boxes vs. 1,800 direct, which is **3%**. For *any* Legendary it is 36%. The direct shop is far better value for targeting, which is ethical but will pull revenue away from boxes. Product should decide if that is intended. |
| C10 | 03 §5 | Premium revive HP is not specified. | Revive at **50% HP**. Second Wind gives 30%. |
| C11 | 01 §6.3 | The ★★ accuracy thresholds (90/93/95% by chapter band) are absolute. Beginner ends the story at about 91%, so ★★ was mostly out of reach after ch10 (v1 sim: +361 h to 900 stars). | **Adopted:** ★★ is **relative** to the player's own 7-day median accuracy, clamped 88–97%. Absolute thresholds apply only in Hard mode. Beginner's extra time to 900 stars drops to +113 h. |
| **C12** | 00 §3 (C11) | "Median **+1 pt**" makes ★★ about a 20% roll per attempt for everyone, because per-level accuracy noise is about ±1.2 pt. In the sim it pushed Average's time to 900 stars from +25 h to **+63 h**, so 100% completion would take about 82 h instead of the about 42 h decided in 00 §6.1. | Use "**match or beat** your 7-day median" (+0 pt). The sim default (`STAR2_REL_MARGIN = 0.0`) gives +25 h, about 44 h to 100%. Keep +1 pt as a Hard-mode ★★ instead. |
| **C13** | 00 §6.2 | Gem caches only speed up story PvE, but the speed-up is uneven. At the 1-per-day cap, Average saves 6% and Fast 0%, while Beginner saves **18% (about 7 h)**, because caches replace grind replays (199 → 118). Grind is also typing practice, so this isn't harmful, but it is the largest pay-for-speed effect in the game. | Keep the cap at **1 per day** (2 per day gave Beginner −24%). Optionally make the gem cache **"first cache of the day only"** so it can't be stockpiled. Pair it with a prompt to try the free Story preset, which saves Beginner more (−11 h) at $0. |
| **C14** | 03 §2.5 | 03's "Chronicle Pass" (950 gems, pays back 1,000) is superseded by 00 §6.4: the premium track now returns about 50 gems. | Keep the **950-gem** price (about $7.91, sold as a $9.99 bundle with 250 extra gems). Engaged F2P (1,532/season) and typical F2P (1,080/season) can both afford it from free gems, so the pass is not a paywall. 03 §2.5 and the free-gem table need updating. |
| **C15** | 00 §4 / 03 §3.3 | 00 §4 still says "Epic and Legendary gear come only from drops". 03's weekly missions do not list Gear Caches. | Epic and Legendary now come from **Gear Caches** (any source, including gems). Weekly mission #10 should grant **2 Gear Caches**. Gold and Mythic chests grant 1 and 2 caches instead of a direct gear roll. |
| **C16** | 02 v1 shop | With caches, boss drops and Upgrade Transfer, Average buys only about 2 shop pieces in the whole story (v1: about 21). Gold flows to upgrades (76%) and caches (20%). | Make the shop the **deterministic fallback**: pick slot and rarity (C/U/R) at a known price. This protects against bad cache luck, and its prices are unchanged. If design wants the shop to matter more, cut cache sources from chests rather than raising cache prices. |
| **C17** | 01 §2.3 / 00 §3 (C3) | Skill damage share is 16–17% at ch1 but drops to 11–12% from ch15, because skills charge per *plate* and plates get longer (4 → 9.4 chars). | From word tier T4 on, charge skills **per 5 typed characters** instead of per plate. That holds skills at about 15–17% of damage. |

---

## 2. Player model

### 2.1 Learning curve

`WPM(t) = cap − (cap − WPM₀)·e^(−t/35)` and `acc(t) = cap − (cap − acc₀)·e^(−t/45)`, where t = **active typing hours** (combat time only, not menus). This reproduces the brief's anchor of 20 → 40 WPM after 30 h for the Beginner. Guard success learns with τ = 30 h. Each attempt adds noise: speed ×N(1, 0.10), accuracy ±1.2 pt, guard ±6 pt, damage taken ×N(1, 0.08).

| Active typing hours | Beginner | Average | Fast |
|---|---|---|---|
| 0 | 20 / 88.0% | 40 / 94.0% | 75 / 97.0% |
| 5 | 25 / 88.8% | 43 / 94.3% | 77 / 97.2% |
| 10 | 29 / 89.5% | 45 / 94.6% | 79 / 97.3% |
| 20 | 35 / 90.7% | 50 / 95.1% | 82 / 97.5% |
| 30 | 40 / 91.6% | 53 / 95.5% | 85 / 97.7% |
| 50 | 47 / 93.0% | 57 / 96.0% | 88 / 98.0% |

Personas: Beginner caps at 55 WPM / 95.5% (plays 45 min/day). Average caps at 62 / 97% (1 h/day). Fast caps at 92 / 98.5% (1 h/day). Fast is a "frugal" spender: it only buys gear when its power falls below 0.6× par, or right after a loss.

### 2.2 Word difficulty by chapter

The effective typing speed is `WPM × speed factor`, where the factor is `1 − 0.015·(len−4) − 0.6·caps − 1.0·punct − 1.2·numbers`. Accuracy drops by `0.0025·(len−4) + 0.05·caps + 0.12·punct + 0.15·numbers`. Plates are blended 75% current tier and 25% review (01 §5.1 mix rule).

| Ch | Word tier | Avg plate chars | Speed factor | Accuracy delta | 40-WPM typist -> eff. WPM |
|---|---|---|---|---|---|
| 1 | 1 | 4.2 | 1.00 | -0.1 pt | 40 |
| 3 | 1 | 4.2 | 1.00 | -0.1 pt | 40 |
| 4 | 2 | 5.0 | 0.98 | -0.3 pt | 39 |
| 7 | 3 | 6.5 | 0.96 | -0.6 pt | 39 |
| 10 | 4 | 7.7 | 0.94 | -0.9 pt | 38 |
| 13 | 5 | 7.6 | 0.89 | -1.4 pt | 36 |
| 16 | 6 | 8.1 | 0.85 | -2.0 pt | 34 |
| 19 | 7 | 9.1 | 0.80 | -2.6 pt | 32 |
| 22 | 8 | 8.8 | 0.86 | -1.9 pt | 35 |
| 25 | 9 | 9.1 | 0.84 | -2.2 pt | 33 |
| 28 | 10 | 9.4 | 0.78 | -3.0 pt | 31 |
| 30 | 10 | 9.4 | 0.78 | -3.0 pt | 31 |

Longer plates also lower *DPS per ATK*, because the word bonus, chip damage and Perfect-word chance are all per plate. A 40-WPM typist's damage per point of ATK falls from 0.66 at ch1 to 0.31 at ch30 (table 3). Enemies are authored per chapter against a reference typist reading the same words, so this is absorbed. It does mean the T7 sentence chapters (19–21) and the T10 quote chapters (28–30) feel heavier, which fits their place in the curve.

---

## 3. Combat model

Per plate of `L` chars, for a typist with effective net WPM `w` and accuracy `a`:

```
cps        = w·5/60 × 0.82                     # combat typing efficiency (reading, target switching)
t_word     = L / cps
p_perfect  = a^L
ATB/word   = (10 + L·8·ComboMult) × (1 + 0.25·p_perfect) + 5·0.12·p_perfect
attacks/s  = ATB/word / 100 / t_word
crit       = 5% + 15%·p_perfect, ×1.5
DPS / ATK  = attacks/s·(1 + 0.5·crit) + (0.15 + 0.10·p_perfect)/t_word + (1 + 0.5·p_perfect)/t_word·0.12
Hero ATK   = 10 × S_weapon × √S_charm         Hero HP = 100 × S_armor × √S_charm
Item score S = 1.40^(tier−1) × rarity × (1 + 0.07·upgrade)   rarity C 1.00 / U 1.12 / R 1.25 / E 1.40 / L 1.60
Enemy DPS  = hit / (9 s × clamp((35/Pace)^0.7, 0.6, 1.8)) × guard_mult
```

A fight is resolved by **focus fire**: monsters die one at a time, and every living monster deals its expected DPS while the current target dies. HP carries across encounters (+25% per walk). Death triggers Second Wind (probability depends on accuracy), then a Feather or gem revive if the persona's policy allows it.

| Typist | Ch | Eff WPM | Eff acc | Perfect words | Avg ComboMult | Auto-attack every | DPS per 1 ATK | Auto-attack share | Skill share | Enemy interval x |
|---|---|---|---|---|---|---|---|---|---|---|
| Beginner (start skill) | 1 | 20 | 87.9% | 58% | 1.05 | 5.9s | 0.30 | 61% | 17% | 1.48 |
| Beginner (start skill) | 15 | 18 | 86.6% | 33% | 1.01 | 8.0s | 0.18 | 72% | 12% | 1.60 |
| Beginner (start skill) | 30 | 16 | 85.0% | 22% | 1.01 | 9.8s | 0.14 | 76% | 11% | 1.77 |
| Average (start skill) | 1 | 40 | 94.0% | 77% | 1.12 | 2.7s | 0.66 | 61% | 16% | 0.91 |
| Average (start skill) | 15 | 36 | 92.6% | 56% | 1.04 | 3.7s | 0.40 | 71% | 12% | 0.99 |
| Average (start skill) | 30 | 31 | 91.0% | 41% | 1.02 | 4.6s | 0.31 | 75% | 11% | 1.09 |
| Fast (start skill) | 1 | 75 | 97.0% | 88% | 1.26 | 1.3s | 1.35 | 63% | 16% | 0.60 |
| Fast (start skill) | 15 | 67 | 95.6% | 71% | 1.09 | 1.8s | 0.81 | 72% | 12% | 0.64 |
| Fast (start skill) | 30 | 58 | 94.0% | 56% | 1.04 | 2.3s | 0.61 | 75% | 11% | 0.70 |
| Reference (Pace 35, 92%) | 1 | 35 | 92.0% | 70% | 1.08 | 3.2s | 0.55 | 61% | 17% | 1.00 |

The **Skill share** column checks resolution C3 (target 15–20%). It holds early but slides to 11–12% on long plates (see C17). Accuracy is the strongest lever, as 01 intends. Average at 94% gets 2.2× the DPS per ATK of a Beginner at 88%, even though it only has 2× the WPM. The Pace multiplier gives the Beginner 1.48× longer enemy intervals, which absorbs most of the extra damage that slow kills would cause.

---

## 4. Difficulty curve

### 4.1 Authoring method: par build + reference typist

Each level is authored against a **par build** fighting a **reference typist**. The par build is the current tier in every slot at Uncommon +5 (Common +0/+2 in ch1–2, Uncommon +3 in ch3). The reference typist is 35 → 42 WPM and 92 → 93.5% accuracy over chapters 1 → 30.

- **Encounter HP** = 36 s × reference DPS with par ATK × saw(p). The sawtooth adds +2% HP per level inside a chapter.
- **Grunt hit** is solved so the reference typist with par gear takes `DMG_FRAC(c) × par HP × saw_atk(p)` over a normal level of average composition. DMG_FRAC ramps 0.40 (ch1) → 0.65 (ch3) → 0.85 (ch6) → 0.95 (ch10) → 1.00 (ch30). The sawtooth adds +2.5% hit per level. Walk heals bring the net HP loss well below 1.0.
- **Boss level** = 1 add wave + boss (3.2 encounters of HP, 2 adds, 2.5 Doom Spells, 2 phase heals of 10%). The boss hit is solved so the boss encounter does `BOSS_ENC_DMG(c)` × a normal encounter's damage: ramps 1.4 (ch1) → 2.0 → 2.7 → 3.0 (ch10+).
- **Sawtooth:** per-level difficulty (HP × hit) rises about 4.5% per level, so L9 ≈ 1.45× L1. The boss is a spike above L9. The next chapter's L1 resets HP × hit to 1.0× par. The tier step (1.40× per chapter in one slot) is matched by new gear, which gives a **relief dip at every chapter start**.
- Group composition then varies naturally: a 4-monster group hurts more than a single Brute.

| Ch | Par gear (W/A/C tier) | Par ATK | Par HP | Enc HP L1 | Enc HP L9 | Boss HP | Grunt hit L1 | Grunt hit L9 | Boss hit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | T1/1/1 C+0 | 10 | 100 | 199 | 231 | 753 | 8.1 | 9.8 | 8.0 |
| 2 | T1/1/1 C+2 | 12 | 122 | 244 | 284 | 923 | 13.0 | 15.6 | 12.8 |
| 3 | T1/1/1 U+3 | 16 | 158 | 319 | 370 | 1,205 | 11.9 | 14.2 | 11.6 |
| 4 | T2/1/1 U+5 | 26 | 186 | 465 | 540 | 1,756 | 15.5 | 18.6 | 17.0 |
| 5 | T2/2/1 U+5 | 26 | 260 | 469 | 543 | 1,769 | 23.8 | 28.5 | 29.4 |
| 6 | T2/2/2 U+5 | 31 | 308 | 558 | 648 | 2,108 | 30.6 | 36.7 | 42.2 |
| 7 | T3/2/2 U+5 | 43 | 308 | 659 | 765 | 2,489 | 31.9 | 38.3 | 45.5 |
| 8 | T3/3/2 U+5 | 43 | 431 | 664 | 770 | 2,506 | 46.0 | 55.2 | 67.7 |
| 9 | T3/3/3 U+5 | 51 | 510 | 791 | 917 | 2,987 | 56.0 | 67.2 | 85.0 |
| 10 | T4/3/3 U+5 | 71 | 510 | 986 | 1,143 | 3,722 | 58.2 | 69.8 | 91.0 |
| 11 | T4/4/3 U+5 | 71 | 714 | 993 | 1,152 | 3,751 | 81.7 | 98.1 | 127.8 |
| 12 | T4/4/4 U+5 | 85 | 845 | 1,184 | 1,374 | 4,472 | 97.0 | 116.4 | 151.6 |
| 13 | T5/4/4 U+5 | 118 | 845 | 1,569 | 1,820 | 5,926 | 86.5 | 103.8 | 161.7 |
| 14 | T5/5/4 U+5 | 118 | 1,183 | 1,581 | 1,834 | 5,970 | 121.4 | 145.7 | 227.1 |
| 15 | T5/5/5 U+5 | 140 | 1,400 | 1,885 | 2,186 | 7,117 | 144.1 | 173.0 | 269.5 |
| 16 | T6/5/5 U+5 | 196 | 1,400 | 2,432 | 2,822 | 9,184 | 148.5 | 178.1 | 277.6 |
| 17 | T6/6/5 U+5 | 196 | 1,960 | 2,450 | 2,843 | 9,253 | 208.5 | 250.2 | 389.9 |
| 18 | T6/6/6 U+5 | 232 | 2,319 | 2,921 | 3,388 | 11.0k | 247.5 | 297.0 | 462.8 |
| 19 | T7/6/6 U+5 | 325 | 2,319 | 3,609 | 4,187 | 13.6k | 258.2 | 309.8 | 482.7 |
| 20 | T7/7/6 U+5 | 325 | 3,247 | 3,635 | 4,217 | 13.7k | 362.6 | 435.1 | 678.0 |
| 21 | T7/7/7 U+5 | 384 | 3,841 | 4,332 | 5,025 | 16.4k | 430.4 | 516.5 | 804.9 |
| 22 | T8/7/7 U+5 | 538 | 3,841 | 6,822 | 7,913 | 25.8k | 411.5 | 493.8 | 769.5 |
| 23 | T8/8/7 U+5 | 538 | 5,378 | 6,870 | 7,970 | 25.9k | 578.1 | 693.7 | 1,081.0 |
| 24 | T8/8/8 U+5 | 636 | 6,363 | 8,187 | 9,497 | 30.9k | 686.4 | 823.7 | 1,283.5 |
| 25 | T9/8/8 U+5 | 891 | 6,363 | 10.9k | 12.6k | 41.0k | 702.1 | 842.5 | 1,312.9 |
| 26 | T9/9/8 U+5 | 891 | 8,908 | 10.9k | 12.7k | 41.3k | 986.4 | 1,183.7 | 1,844.6 |
| 27 | T9/9/9 U+5 | 1,054 | 10.5k | 13.0k | 15.1k | 49.3k | 1,171.4 | 1,405.7 | 2,190.5 |
| 28 | T10/9/9 U+5 | 1,476 | 10.5k | 16.7k | 19.3k | 62.9k | 1,228.9 | 1,474.7 | 2,298.0 |
| 29 | T10/10/9 U+5 | 1,476 | 14.8k | 16.8k | 19.5k | 63.3k | 1,726.7 | 2,072.0 | 3,228.9 |
| 30 | T10/10/10 U+5 | 1,746 | 17.5k | 20.0k | 23.2k | 75.4k | 2,050.6 | 2,460.8 | 3,834.7 |

### 4.2 Calibration check: win % with *exactly* par gear and *starting* skill

Values are L1 / L9 / boss. Second Wind is included; Feathers are not.

| Ch | Reference typist | Beginner (start skill) | Average (start skill) | Fast (start skill) |
|---|---|---|---|---|
| 1 | 100/100/100 | 100/100/14 | 100/100/100 | 100/100/100 |
| 5 | 100/100/93 | 78/11/0 | 100/100/95 | 100/100/100 |
| 10 | 100/94/51 | 21/0/0 | 100/96/58 | 100/100/100 |
| 15 | 100/91/42 | 26/0/0 | 100/91/40 | 100/100/100 |
| 20 | 100/90/34 | 7/0/0 | 100/85/28 | 100/100/100 |
| 25 | 100/95/26 | 5/0/0 | 100/91/10 | 100/100/100 |
| 30 | 100/88/32 | 8/0/0 | 100/72/14 | 100/100/100 |

How to read this table: the reference typist with par gear clears normal levels at about 90–100%, and bosses at 26–51% in the mid and late game (the boss is the gear check). Average at its *starting* skill is close to the reference. In the full simulation it also learns (40 → 45 WPM) and averages 0.9–1.2× par gear. Beginner at starting skill and par gear is hopeless after ch5. Real Beginners get there through learning plus 1.0–1.5× par gear from grinding (section 5). Fast wins everything at par, so it can run 0.5–0.75× par.

---

## 5. Simulation results

### 5.1 Headline

| Persona | Story hours | P10-P90 | Active typing h | Days | Min/level (win, incl. menus) | 1st-try clear | Boss 1st-try | Story attempts | Grind replays | End WPM/acc | End power vs par | Hard walls (>40 tries) | Boss level min | Stars at story end | Extra h to 900 stars |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Beginner | 39.8 | 36-45 | 25.7 | 53 | 3.8 | 81% | 55% | 446 | 199 | 38/91.3% | 1.49 | 0 | 5.4 | 513/900 | 113 |
| Average | 18.8 | 18-20 | 9.6 | 19 | 3.1 | 97% | 88% | 314 | 13 | 45/94.6% | 1.24 | 0 | 4.3 | 570/900 | 25 |
| Fast | 14.6 | 14-15 | 5.8 | 15 | 2.5 | 99% | 92% | 303 | 2 | 78/97.2% | 0.73 | 0 | 3.4 | 609/900 | 13 |

Hardest levels (mean attempts):
- Beginner: L120 (5.7), L130 (5.4), L220 (5.3), L110 (5.1), L200 (4.7)
- Average: L280 (2.1), L190 (1.8), L160 (1.6), L300 (1.5), L290 (1.5)
- Fast: L250 (1.4), L260 (1.3), L300 (1.3), L160 (1.2), L280 (1.2)

"End power vs par" is final gear ÷ par(ch30). The per-chapter "power vs par" column below is measured at *chapter start*, before buying that chapter's new tier, so it reads lower.

### 5.2 Per-chapter summary (all personas)

| Ch | Words | Recommended gear (par) | Encounter HP L1-L9 | Boss HP | Hero DPS B / A / F | Active min/level B / A / F | 1st-try % B / A / F | Boss 1st-try % B / A / F | Hours B / A / F | Avg: gold earned | Avg: net gear+cache spend | Avg: power vs par |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | T1/1/1 C+0 | 199-231 | 753 | 3 / 8 / 14 | 3.0 / 1.7 / 1.2 | 100 / 100 / 100 | 100 / 100 / 100 | 0.7 / 0.4 / 0.4 | 2,878 | 2,633 | 1.00 |
| 2 | 1 | T1/1/1 C+2 | 244-284 | 923 | 5 / 10 / 16 | 2.8 / 1.7 / 1.3 | 100 / 100 / 100 | 98 / 100 / 100 | 0.6 / 0.4 / 0.4 | 3,242 | 3,035 | 1.42 |
| 3 | 1 | T1/1/1 U+3 | 319-370 | 1,205 | 6 / 12 / 18 | 4.0 / 2.4 / 1.8 | 98 / 100 / 100 | 98 / 100 / 100 | 0.8 / 0.6 / 0.5 | 4,295 | 3,405 | 1.22 |
| 4 | 2 | T2/1/1 U+5 | 465-540 | 1,756 | 7 / 14 / 23 | 4.6 / 2.7 / 2.0 | 79 / 100 / 100 | 97 / 100 / 100 | 1.5 / 0.6 / 0.5 | 4,621 | 4,496 | 0.90 |
| 5 | 2 | T2/2/1 U+5 | 469-543 | 1,769 | 8 / 16 / 27 | 4.0 / 2.5 / 1.9 | 76 / 100 / 100 | 78 / 100 / 100 | 1.3 / 0.6 / 0.5 | 5,006 | 4,998 | 0.94 |
| 6 | 2 | T2/2/2 U+5 | 558-648 | 2,108 | 10 / 19 / 32 | 3.8 / 2.6 / 1.9 | 67 / 100 / 100 | 68 / 100 / 100 | 1.8 / 0.6 / 0.5 | 5,985 | 5,450 | 0.90 |
| 7 | 3 | T3/2/2 U+5 | 659-765 | 2,489 | 12 / 20 / 33 | 4.0 / 2.8 / 2.0 | 75 / 100 / 100 | 63 / 100 / 100 | 1.5 / 0.6 / 0.5 | 6,018 | 6,057 | 0.91 |
| 8 | 3 | T3/3/2 U+5 | 664-770 | 2,506 | 14 / 23 / 37 | 3.4 / 2.6 / 1.9 | 72 / 98 / 100 | 55 / 95 / 98 | 1.6 / 0.6 / 0.5 | 7,495 | 6,648 | 0.93 |
| 9 | 3 | T3/3/3 U+5 | 791-917 | 2,987 | 17 / 26 / 44 | 3.4 / 2.6 / 1.9 | 78 / 98 / 100 | 53 / 92 / 97 | 1.7 / 0.6 / 0.5 | 8,070 | 8,084 | 0.94 |
| 10 | 4 | T4/3/3 U+5 | 986-1,143 | 3,722 | 20 / 30 / 47 | 3.6 / 2.8 / 2.1 | 79 / 98 / 100 | 62 / 92 / 97 | 1.6 / 0.6 / 0.5 | 8,903 | 8,284 | 0.94 |
| 11 | 4 | T4/4/3 U+5 | 993-1,152 | 3,751 | 23 / 33 / 55 | 3.2 / 2.6 / 1.9 | 76 / 97 / 100 | 33 / 78 / 97 | 1.6 / 0.6 / 0.5 | 10.9k | 10.8k | 0.91 |
| 12 | 4 | T4/4/4 U+5 | 1,184-1,374 | 4,472 | 28 / 40 / 65 | 3.1 / 2.6 / 1.9 | 75 / 97 / 100 | 28 / 87 / 95 | 1.7 / 0.6 / 0.5 | 14.3k | 14.1k | 0.93 |
| 13 | 5 | T5/4/4 U+5 | 1,569-1,820 | 5,926 | 35 / 49 / 76 | 3.4 / 2.7 / 2.0 | 82 / 98 / 99 | 33 / 87 / 90 | 1.5 / 0.6 / 0.5 | 17.5k | 16.8k | 0.98 |
| 14 | 5 | T5/5/4 U+5 | 1,581-1,834 | 5,970 | 40 / 55 / 85 | 3.0 / 2.5 / 1.9 | 84 / 98 / 99 | 50 / 93 / 90 | 1.2 / 0.6 / 0.5 | 15.3k | 14.7k | 1.06 |
| 15 | 5 | T5/5/5 U+5 | 1,885-2,186 | 7,117 | 46 / 62 / 99 | 3.1 / 2.6 / 1.9 | 80 / 96 / 100 | 45 / 82 / 98 | 1.3 / 0.6 / 0.5 | 16.4k | 16.2k | 0.96 |
| 16 | 6 | T6/5/5 U+5 | 2,432-2,822 | 9,184 | 53 / 72 / 113 | 3.4 / 2.8 / 2.1 | 79 / 96 / 98 | 43 / 80 / 78 | 1.4 / 0.7 / 0.5 | 18.8k | 17.2k | 0.92 |
| 17 | 6 | T6/6/5 U+5 | 2,450-2,843 | 9,253 | 64 / 82 / 127 | 3.0 / 2.6 / 2.0 | 80 / 96 / 100 | 50 / 80 / 95 | 1.3 / 0.6 / 0.5 | 20.5k | 20.8k | 0.95 |
| 18 | 6 | T6/6/6 U+5 | 2,921-3,388 | 11.0k | 75 / 96 / 149 | 3.0 / 2.6 / 2.0 | 80 / 98 / 99 | 38 / 90 / 90 | 1.4 / 0.6 / 0.5 | 23.3k | 21.9k | 0.94 |
| 19 | 7 | T7/6/6 U+5 | 3,609-4,187 | 13.6k | 85 / 105 / 163 | 3.2 / 2.8 / 2.1 | 79 / 96 / 99 | 37 / 78 / 88 | 1.4 / 0.7 / 0.5 | 27.7k | 26.9k | 0.94 |
| 20 | 7 | T7/7/6 U+5 | 3,635-4,217 | 13.7k | 97 / 123 / 182 | 2.9 / 2.6 / 2.0 | 80 / 96 / 99 | 35 / 83 / 93 | 1.3 / 0.6 / 0.5 | 30.8k | 28.9k | 0.94 |
| 21 | 7 | T7/7/7 U+5 | 4,332-5,025 | 16.4k | 115 / 144 / 213 | 3.0 / 2.6 / 2.0 | 83 / 97 / 100 | 45 / 93 / 98 | 1.2 / 0.6 / 0.5 | 33.7k | 33.3k | 0.96 |
| 22 | 8 | T8/7/7 U+5 | 6,822-7,913 | 25.8k | 164 / 204 / 306 | 3.1 / 2.8 / 2.1 | 80 / 96 / 99 | 42 / 83 / 87 | 1.5 / 0.7 / 0.5 | 40.1k | 40.1k | 0.95 |
| 23 | 8 | T8/8/7 U+5 | 6,870-7,970 | 25.9k | 189 / 234 / 347 | 2.9 / 2.6 / 2.0 | 84 / 96 / 98 | 55 / 83 / 88 | 1.1 / 0.6 / 0.5 | 50.0k | 46.4k | 0.97 |
| 24 | 8 | T8/8/8 U+5 | 8,187-9,497 | 30.9k | 219 / 279 / 405 | 2.9 / 2.5 / 2.0 | 79 / 95 / 98 | 43 / 80 / 88 | 1.4 / 0.6 / 0.5 | 59.4k | 57.3k | 0.99 |
| 25 | 9 | T9/8/8 U+5 | 10.9k-12.6k | 41.0k | 263 / 331 / 483 | 3.1 / 2.8 / 2.1 | 83 / 98 / 97 | 48 / 88 / 75 | 1.4 / 0.7 / 0.5 | 57.7k | 54.1k | 1.00 |
| 26 | 9 | T9/9/8 U+5 | 10.9k-12.7k | 41.3k | 308 / 377 / 542 | 2.8 / 2.5 / 2.0 | 86 / 96 / 97 | 48 / 78 / 75 | 1.1 / 0.6 / 0.5 | 60.9k | 60.5k | 1.01 |
| 27 | 9 | T9/9/9 U+5 | 13.0k-15.1k | 49.3k | 359 / 448 / 648 | 2.9 / 2.6 / 2.0 | 80 / 98 / 98 | 42 / 93 / 83 | 1.2 / 0.6 / 0.5 | 66.3k | 69.1k | 0.97 |
| 28 | 10 | T10/9/9 U+5 | 16.7k-19.3k | 62.9k | 417 / 493 / 709 | 3.1 / 2.8 / 2.2 | 83 / 93 / 98 | 53 / 68 / 80 | 1.3 / 0.8 / 0.5 | 80.9k | 74.2k | 0.97 |
| 29 | 10 | T10/10/9 U+5 | 16.8k-19.5k | 63.3k | 467 / 551 / 805 | 2.8 / 2.6 / 2.0 | 85 / 95 / 99 | 52 / 80 / 90 | 1.1 / 0.7 / 0.5 | 87.9k | 86.5k | 0.96 |
| 30 | 10 | T10/10/10 U+5 | 20.0k-23.2k | 75.4k | 548 / 625 / 947 | 2.9 / 2.7 / 2.1 | 80 / 93 / 98 | 50 / 78 / 77 | 1.2 / 0.7 / 0.5 | 102.1k | 106.9k | 0.95 |

Notes:
- **Time per level** (active, without menus or the Journal) for normal levels: Average 2.4–3.0 min, Fast 1.7–2.2, Beginner 3.0–4.5 (early chapters are slowest, because the Beginner is still at 20–23 WPM). Boss levels: Average 4.2 min, Beginner 5.4, Fast 3.4. This is inside the 2–4 min target except for early-game Beginner normal levels and Beginner boss levels (see C1).
- **Sawtooth in clear rates.** Average is 100% in ch1–7 (onboarding), then settles at 93–98% on normals and 68–93% on bosses from ch11 on. Beginner holds 67–86% first-try on normals from ch4 and 28–63% on bosses from ch6 on, because learning roughly keeps pace with the curve. Its grind is spread across the game (about 7 replays/chapter) rather than piling up at one wall.
- **No power inflation from caches.** Average's power at chapter start stays at 0.90–1.06× par from ch4 to ch30 (v1: 0.78–1.20×).
- **Recommended gear tier** = the par column: the newest tier in each slot at Uncommon +5. Fast is fine at 1 tier behind with +2–3 upgrades. Beginner wants par or 1–3 upgrade levels above it (Rare drops help).

### 5.3 Average persona: gold flow per chapter

| Ch | WPM/acc (start) | Hero DPS | 1st-try clear | Boss 1st-try | Attempts/lvl | Grind runs | New gear pieces | Min/level (active) | Hours | Cum. hours | Gold in | Gold out (gear+caches) | Satchel sink | Gold bank (end) | Gear W/A/C +avg | Power vs par |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 40/94% | 8 | 100% | 100% | 1.00 | 0.0 | 1.3 | 1.9 | 0.44 | 0.4 | 3,592 | 3,348 | 0 | 245 | T1/1/1 +0.0 | 1.00 |
| 2 | 40/94% | 10 | 100% | 100% | 1.00 | 0.0 | 0.3 | 1.9 | 0.43 | 0.9 | 3,999 | 3,792 | 0 | 452 | T1/1/1 +2.7 | 1.42 |
| 3 | 40/94% | 12 | 100% | 100% | 1.00 | 0.0 | 1.0 | 2.6 | 0.55 | 1.4 | 5,756 | 4,866 | 0 | 1,342 | T1/1/1 +4.5 | 1.22 |
| 4 | 40/94% | 14 | 100% | 100% | 1.00 | 0.0 | 1.1 | 2.9 | 0.61 | 2.0 | 6,571 | 6,446 | 0 | 1,467 | T2/1/1 +5.0 | 0.90 |
| 5 | 41/94% | 16 | 100% | 100% | 1.00 | 0.0 | 0.9 | 2.7 | 0.58 | 2.6 | 6,898 | 6,890 | 0 | 1,475 | T2/1/1 +5.7 | 0.94 |
| 6 | 41/94% | 19 | 100% | 100% | 1.00 | 0.0 | 1.2 | 2.8 | 0.59 | 3.2 | 8,996 | 8,461 | 0 | 2,009 | T2/2/1 +6.1 | 0.90 |
| 7 | 41/94% | 20 | 99% | 100% | 1.01 | 0.0 | 1.1 | 3.0 | 0.62 | 3.8 | 8,905 | 8,944 | 0 | 1,970 | T3/2/2 +6.2 | 0.91 |
| 8 | 41/94% | 23 | 98% | 95% | 1.03 | 0.3 | 1.2 | 2.8 | 0.62 | 4.5 | 11.2k | 10.4k | 0 | 2,818 | T3/2/2 +6.3 | 0.93 |
| 9 | 41/94% | 26 | 98% | 92% | 1.04 | 0.5 | 1.2 | 2.8 | 0.63 | 5.1 | 12.1k | 12.1k | 0 | 2,804 | T3/3/3 +6.2 | 0.94 |
| 10 | 42/94% | 30 | 98% | 92% | 1.02 | 0.0 | 1.0 | 3.0 | 0.63 | 5.7 | 13.2k | 12.6k | 0 | 3,423 | T4/3/3 +6.1 | 0.94 |
| 11 | 42/94% | 33 | 97% | 78% | 1.06 | 0.7 | 1.2 | 2.8 | 0.65 | 6.4 | 15.6k | 15.5k | 0 | 3,491 | T4/3/3 +6.2 | 0.91 |
| 12 | 42/94% | 40 | 97% | 87% | 1.04 | 0.3 | 1.3 | 2.8 | 0.62 | 7.0 | 20.4k | 20.1k | 0 | 3,731 | T4/4/4 +6.1 | 0.93 |
| 13 | 42/94% | 49 | 98% | 87% | 1.04 | 0.5 | 1.3 | 2.9 | 0.65 | 7.6 | 25.0k | 24.3k | 0 | 4,486 | T4/4/4 +6.3 | 0.98 |
| 14 | 42/94% | 55 | 98% | 93% | 1.04 | 0.3 | 0.9 | 2.7 | 0.60 | 8.2 | 21.9k | 21.3k | 0 | 5,031 | T5/4/4 +6.6 | 1.06 |
| 15 | 42/94% | 62 | 97% | 82% | 1.06 | 0.6 | 1.0 | 2.8 | 0.65 | 8.9 | 23.4k | 23.2k | 0 | 5,226 | T5/4/4 +6.5 | 0.96 |
| 16 | 43/94% | 72 | 96% | 80% | 1.07 | 0.8 | 1.2 | 3.0 | 0.70 | 9.6 | 28.6k | 27.0k | 0 | 6,813 | T5/5/5 +6.5 | 0.92 |
| 17 | 43/94% | 82 | 96% | 80% | 1.07 | 0.6 | 1.1 | 2.8 | 0.65 | 10.2 | 29.3k | 29.6k | 0 | 6,515 | T6/5/5 +6.3 | 0.95 |
| 18 | 43/94% | 96 | 98% | 90% | 1.03 | 0.4 | 1.1 | 2.8 | 0.63 | 10.9 | 34.6k | 33.2k | 0 | 7,911 | T6/6/5 +6.4 | 0.94 |
| 19 | 43/94% | 105 | 96% | 78% | 1.11 | 1.4 | 1.1 | 3.0 | 0.74 | 11.6 | 41.2k | 40.4k | 0 | 8,717 | T6/6/6 +6.4 | 0.94 |
| 20 | 43/94% | 123 | 96% | 83% | 1.06 | 0.4 | 1.3 | 2.8 | 0.63 | 12.2 | 46.6k | 44.7k | 0 | 10.6k | T7/6/6 +6.4 | 0.94 |
| 21 | 44/94% | 144 | 97% | 93% | 1.04 | 0.3 | 1.0 | 2.8 | 0.62 | 12.8 | 48.3k | 48.0k | 0 | 11.0k | T7/7/6 +6.2 | 0.96 |
| 22 | 44/94% | 204 | 96% | 83% | 1.07 | 0.8 | 1.2 | 3.0 | 0.69 | 13.5 | 58.1k | 58.1k | 0 | 11.0k | T8/7/7 +6.4 | 0.95 |
| 23 | 44/94% | 234 | 97% | 83% | 1.05 | 0.2 | 1.3 | 2.8 | 0.61 | 14.2 | 73.1k | 69.5k | 0 | 14.6k | T8/7/7 +6.5 | 0.97 |
| 24 | 44/94% | 279 | 95% | 80% | 1.07 | 0.6 | 1.2 | 2.7 | 0.64 | 14.8 | 84.5k | 82.4k | 0 | 16.7k | T8/8/8 +6.5 | 0.99 |
| 25 | 44/94% | 331 | 98% | 88% | 1.04 | 0.4 | 1.2 | 3.0 | 0.65 | 15.4 | 85.6k | 81.9k | 0 | 20.4k | T8/8/8 +6.6 | 1.00 |
| 26 | 44/94% | 377 | 96% | 78% | 1.07 | 0.4 | 1.0 | 2.7 | 0.63 | 16.1 | 86.5k | 86.1k | 0 | 20.8k | T9/9/8 +6.4 | 1.01 |
| 27 | 45/94% | 448 | 98% | 93% | 1.02 | 0.2 | 1.0 | 2.8 | 0.60 | 16.7 | 93.7k | 96.5k | 0 | 18.0k | T9/9/9 +6.5 | 0.97 |
| 28 | 45/95% | 493 | 93% | 68% | 1.15 | 1.7 | 1.1 | 3.0 | 0.78 | 17.4 | 116.9k | 110.1k | 0 | 24.7k | T9/9/9 +6.7 | 0.97 |
| 29 | 45/95% | 551 | 95% | 80% | 1.08 | 0.9 | 1.1 | 2.8 | 0.67 | 18.1 | 122.1k | 120.7k | 0 | 26.1k | T9/10/9 +6.5 | 0.96 |
| 30 | 45/95% | 625 | 93% | 78% | 1.11 | 1.1 | 0.6 | 2.9 | 0.71 | 18.8 | 135.0k | 139.8k | 0 | 21.4k | T10/10/9 +6.7 | 0.95 |

---

## 6. Economy

### 6.1 Units and income

- **Gold Unit (GU)** = first-clear gold of L1 in chapter c = `100 × 1.125^(c−1)`, so ch1 = 100 and ch30 = 3,044. Within a chapter, level gold rises +3% per level. The boss pays 3×.
- **Replay** pays 40% of first-clear gold, and 20% once the level is more than 1 chapter behind the frontier. After 40 replays/day, replays pay ×0.25 (soft cap).
- **Failing** keeps 50% of the gold collected before death (01 §1.8).
- **Stars:** each star pays +0.2× level gold the first time it is earned. ★★ means matching your own 7-day median accuracy (C11/C12). 10/20/30 stars in a chapter unlock an Iron/Gold/Gold chest. All 30 stars also give 10 gems and 1 Gear Cache.

| Ch | Gold Unit | L1 first clear | L9 first clear | Boss first clear | Replay (frontier) | Replay (>1 ch old) | 3-star bonus (once) | Per daily mission | Weekly missions total | Gold Satchel price |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 100 | 100 | 124 | 381 | 40 | 20 | 60 | 100 | 1,800 | 2,500 |
| 5 | 160 | 160 | 199 | 610 | 64 | 32 | 96 | 160 | 2,883 | 4,005 |
| 10 | 289 | 289 | 358 | 1,100 | 115 | 58 | 173 | 289 | 5,196 | 7,216 |
| 15 | 520 | 520 | 645 | 1,982 | 208 | 104 | 312 | 520 | 9,363 | 13.0k |
| 20 | 937 | 937 | 1,162 | 3,571 | 375 | 187 | 562 | 937 | 16.9k | 23.4k |
| 25 | 1,689 | 1,689 | 2,095 | 6,436 | 676 | 338 | 1,013 | 1,689 | 30.4k | 42.2k |
| 30 | 3,044 | 3,044 | 3,774 | 11.6k | 1,218 | 609 | 1,826 | 3,044 | 54.8k | 76.1k |

### 6.2 Chest tiers and contents

| Chest | Drop source | Gold | P(gear) | Gear rarity | Gems (first clear only) |
|---|---|---|---|---|---|
| Wooden | 30% per normal encounter on first clear (15% on replay) × 72% | 0.5 GU | 10% | C 80 / U 20 | 0 |
| Iron | normal encounter × 24%; boss 55%; 10-star milestone | 1.0 GU | 35% | C 40 / U 45 / R 15 | 0 |
| Gold | normal encounter × 3.5%; boss 38%; 20/30-star milestone | 2.5 GU | **1 Gear Cache** (v2) | cache odds | 5 |
| Mythic | normal encounter × 0.5%; boss 7% | 6.0 GU | **2 Gear Caches** (v2) | cache odds | 20 |

Bosses always drop one chest on first clear (50% chance on replay). Gear from chests is the frontier tier for a random slot, or one tier lower 30% of the time. **Each chapter boss's first clear also drops the next chapter's new-tier piece at Common.** That guarantees a meaningful upgrade moment every chapter and removes the "can't afford the new tier yet" dip.

| Persona | Wooden chests | Iron chests | Gold chests | Mythic chests | Common drops | Uncommon drops | Rare drops | Epic drops | Legendary drops | Chest gear equipped | Shop purchases |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Beginner | 275 | 141 | 30 | 4 | 40.6 | 27.9 | 7.8 | 0.0 | 0.0 | 14.6 | 4.2 |
| Average | 184 | 108 | 33 | 3 | 29.6 | 20.8 | 5.5 | 0.0 | 0.0 | 17.8 | 2.2 |
| Fast | 178 | 106 | 39 | 3 | 28.1 | 20.9 | 5.4 | 0.0 | 0.0 | 23.9 | 5.5 |

Direct chest gear is now only Common, Uncommon or Rare (Wooden and Iron chests). Every Epic and Legendary comes from a Gear Cache (section 6.5).

### 6.3 Shop prices and gold sinks

- The shop sells **Common / Uncommon / Rare** of the current tier per slot at 1× / 2.2× / 5× the Common price. It is the deterministic fallback (C16). **Epic and Legendary come only from Gear Caches.**
- **Tier unlocks rotate by slot.** In ch1 all slots are T1. Ch4 unlocks the T2 weapon, ch5 the T2 armor, ch6 the T2 charm, ch7 the T3 weapon, and so on. Every chapter from 4 on has a new item.
- **Upgrades** cost `0.25 × tier Common price × 1.30^level`. Caps: C +5, U +7, R +11, E +13, L +15. Each level gives +7% to the item's stat.
- **Upgrade Transfer:** new gear inherits ⌊50% × old upgrade level⌋. Salvage returns 25% of the item's value + 25% of the non-transferred upgrade gold. Unwanted chest drops salvage for 10% of value. Without the transfer, the sim showed Average falling to 0.78× par by ch30, because upgrade gold was stranded on old tiers.
- **Gold Satchel** (cosmetic C/R) costs 25 GU and is the overflow sink.

| Tier | Weapon/Armor/Charm unlock | Common | Uncommon | Rare | +0->+1 | +4->+5 | Sum to +5 | Sum to +9 | Sum to +12 | Base stat x | Gold Unit (lvl gold) at unlock |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | ch1-3 | 1,150 | 2,530 | 5,750 | 288 | 821 | 2,600 | 9,204 | 21.4k | 1.00 | 100 |
| T2 | ch4-6 | 1,616 | 3,555 | 8,079 | 404 | 1,154 | 3,653 | 12.9k | 30.0k | 1.40 | 142 |
| T3 | ch7-9 | 2,270 | 4,994 | 11.4k | 568 | 1,621 | 5,132 | 18.2k | 42.2k | 1.96 | 203 |
| T4 | ch10-12 | 3,190 | 7,017 | 15.9k | 797 | 2,277 | 7,211 | 25.5k | 59.3k | 2.74 | 289 |
| T5 | ch13-15 | 4,481 | 9,859 | 22.4k | 1,120 | 3,200 | 10.1k | 35.9k | 83.3k | 3.84 | 411 |
| T6 | ch16-18 | 6,296 | 13.9k | 31.5k | 1,574 | 4,496 | 14.2k | 50.4k | 117.0k | 5.38 | 585 |
| T7 | ch19-21 | 8,846 | 19.5k | 44.2k | 2,212 | 6,316 | 20.0k | 70.8k | 164.4k | 7.53 | 833 |
| T8 | ch22-24 | 12.4k | 27.3k | 62.1k | 3,107 | 8,875 | 28.1k | 99.5k | 231.0k | 10.54 | 1,186 |
| T9 | ch25-27 | 17.5k | 38.4k | 87.3k | 4,366 | 12.5k | 39.5k | 139.8k | 324.5k | 14.76 | 1,689 |
| T10 | ch28-30 | 24.5k | 54.0k | 122.7k | 6,134 | 17.5k | 55.5k | 196.4k | 455.9k | 20.66 | 2,405 |

### 6.4 Sources, sinks and inflation

| Persona | Total gold in | Levels | Stars | Chests | Missions | Salvage | Spent items | Spent upgrades | Spent Gear Caches | Satchel sink | Gear spend / earned |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Beginner | 1.79M | 30% | 7% | 19% | 16% | 28% | 75.6k | 1.16M | 535.8k | 0 | 99% |
| Average | 1.27M | 31% | 11% | 21% | 8% | 30% | 42.7k | 955.2k | 252.3k | 0 | 98% |
| Fast | 1.25M | 30% | 11% | 22% | 9% | 27% | 50.9k | 353.9k | 0 | 432.2k | 32% |

"Salvage" is gross: it is mostly the 25% refund when a piece is replaced, so it is a rebate on spending rather than new money. Net of salvage, Average gold comes from levels ~44%, chests ~30%, stars ~16% and missions ~11%. Average spends ~76% on upgrades, ~20% on Gear Caches and ~4% on shop pieces. **Inflation check:** for Average, the per-chapter bank (table 5.3) stays between 0.2k and about 26k, never more than about 1.5× the next item's price. Gold earned and gold spent track each other chapter by chapter. The Fast persona deliberately under-spends on gear (it never buys caches with gold) and banks the surplus, which the 25-GU Satchel sink absorbs (about 430k over the story).

### 6.5 Gear Caches (v2)

**Design**
- A cache rolls **one item for a random slot at the player's frontier-chapter tier**, so a cache is never obsolete. The rarity uses **fixed published odds** that never vary by player, time or spend. **Pity** is a separate published guarantee (counters, not hidden rate changes): Rare+ within 8 caches, Epic+ within 30, Legendary by 120. The new item inherits ⌊50%⌋ of the slot's upgrade levels (Upgrade Transfer), so a lucky Epic is usable right away. Items that don't help salvage for 10% of value.
- **Price: 14 GU of gold** (about 1.2× the frontier Common price at tier unlock). At that price a cache's expected power gain per gold is roughly equal to the best shop or upgrade option. A pure-EV player therefore buys one about every 1.5–2 chapters, and a player who buys them for fun pays almost nothing for doing so (table F5). Gold caches are a **gold sink**: they took about 20% of Average's gear gold and 30% of Beginner's.
- **Free sources:** Gold chest 1, Mythic chest 2, weekly mission set 2, 30-star chapter 1. None come from the season pass.
- **Gems:** 50 gems (about $0.42), **max 1 per day**, story PvE only. Ranked Survival, Boss of the Week and the Trial use standardized gear (03 §4), so gem caches can't buy leaderboard power.
- **Is pity needed?** Yes, as a *published* floor. Without it, any run of 8 caches has an 8% chance of containing nothing better than Uncommon, and that "dry streak" is what makes random loot feel rigged. The Rare+/8 floor only lifts the effective Rare+ rate from 27% to 30%, and the Legendary/120 floor matters only to heavy gem buyers. Publish both the base odds and the effective rates in the table below.

| Rarity | Published odds | Effective incl. pity (200k sim) | Stat mult | Upgrade cap |
|---|---|---|---|---|
| Common | 40.0% | 38.30% | 1.00 | 5 |
| Uncommon | 33.0% | 31.60% | 1.12 | 7 |
| Rare | 20.0% | 21.52% | 1.25 | 11 |
| Epic | 6.0% | 7.03% | 1.40 | 13 |
| Legendary | 1.0% | 1.55% | 1.60 | 15 |

- Rare+ guaranteed within 8, Epic+ within 30, Legendary by 120. Mean caches per Legendary: 64.
- Price: 14 GU gold (e.g. 4,041 at ch10, 42.6k at ch30) or 50 gems (~$0.42), gem purchases capped at 1/day.

**What players actually open over the story:**

| Persona | Bought w/ gold | From chests | From weeklies | From 30-star | Bought w/ gems | Total caches | Common | Uncommon | Rare | Epic | Legendary | Cache improved gear | Gold spent on caches | Share of gear gold |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Beginner | 40 | 39 | 14 | 0 | 0 | 93 | 35.3 | 30.5 | 19.4 | 6.2 | 1.2 | 17% | 535.8k | 30% |
| Average | 18 | 39 | 4 | 0 | 0 | 62 | 23.7 | 19.7 | 13.4 | 4.0 | 0.8 | 21% | 252.3k | 20% |
| Fast | 0 | 46 | 4 | 0 | 0 | 50 | 19.4 | 16.0 | 10.9 | 3.4 | 0.6 | 26% | 0 | 0% |

"Cache improved gear" is the share of caches that replaced an equipped piece, about 1 in 5. The rest still pay salvage gold, and the reveal still shows the rarity roll, which is the excitement beat.

**Does overbuying caches break the curve?** The greedy AI was run with cache value weighted ×2 and ×4, which models players who buy caches whenever they can:

| Scenario | Story hours | 1st-try | Boss 1st-try | Power vs par (ch10-30 start) | Caches bought with gold |
|---|---|---|---|---|---|
| Average, pure EV shopper (baseline) | 18.8 | 97% | 88% | 0.96 | 18 |
| Average, cache-lover (cache EV weighted x2) | 18.5 | 98% | 91% | 0.98 | 22 |
| Average, cache-lover (cache EV weighted x4) | 18.7 | 97% | 88% | 0.97 | 29 |

Cache-lovers end within ±0.3 h of the baseline at the same power vs par. The price is balanced: caches are neither a trap nor a shortcut.

---

## 7. Gem (premium) economy

### 7.1 Inflow and boxes

| Rarity | Published base | Effective incl. pity (600k-pull sim) |
|---|---|---|
| Common | 62.0% | 58.12% |
| Rare | 27.0% | 25.23% |
| Epic | 9.0% | 13.48% |
| Legendary | 2.0% | 3.16% |

- Pulls per Legendary: mean **31.6**, median 35, P90 51 (hard pity 60).
- Gems per (any) Legendary: 5,057 single pulls (~$42 at the $9.99 pack rate).
- EV per 160-gem pull, valued at direct-shop gem prices: **235 gems** (147% of price) for a player who still needs everything; craft-value 144 shards (new items) / 128 shards (mid-collection, 50% C/R dupes) / 24 shards if everything is a dupe.
- Expected gems for a *specific* Legendary via boxes (pool of 20 Legendaries, no-dupe rule): ~53,099 gems vs direct shop 1800 -> direct shop is 3% of the box cost (03 doc claims 60-70%; see flag).
- Expected gems per *any* Legendary via boxes: 5,057; direct shop Legendary 1800 = 36% of that.

| Pack | Gems | Gems per $ | Scribe pulls | Revives |
|---|---|---|---|---|
| $0.99 | 100 | 101 | 0.6 | 3 |
| $4.99 | 550 | 110 | 3.4 | 18 |
| $9.99 | 1,200 | 120 | 7.5 | 40 |
| $19.99 | 2,500 | 125 | 15.6 | 83 |
| $49.99 | 6,500 | 130 | 40.6 | 217 |

| Player | Free gems/week | Gems/month | Scribe pulls/month | Months per Legendary (boxes) | Months per direct-shop Legendary | Monthly value at $9.99 rate |
|---|---|---|---|---|---|---|
| Fully engaged F2P | 192 | 830 | 5.2 | 6.1 | 2.2 | $6.91 |
| Typical retained F2P (03 doc) | 135 | 585 | 3.7 | 8.6 | 3.1 | $4.87 |

| Persona | Days to finish story | Gems banked at story end (all sources, no spending) |
|---|---|---|
| Beginner | 53 | 2,502 |
| Average | 19 | 1,552 |
| Fast | 15 | 1,548 |

**Recommendations (aligned with 03):**
- Keep the 03 price points ($0.99 = 100 … $49.99 = 6,500 gems). A Scribe pull is 160 gems ≈ **$1.33** at the $9.99 rate. Drop the v1 idea of a monthly gem subscription, since the season pass (7.4) now fills that role.
- **What F2P can afford:** about 830 gems/month (about 1,530 per season) when fully engaged, and about 585/month (1,080/season) for a typical retained player. One-time progression gems come on top: boss first clears 10 each = 300, 30-star chapters, chest gems, and 600 from achievements. Free gems now compete for **four sinks**: cosmetic pulls (160), the season pass (950 per season), revives (30) and gem caches (50, max 1/day). A typical engaged F2P season is the pass + about 4 Scribe pulls. Alternatively, spending *all* free gems on caches saves Average only 0.7 h and Beginner 3.7 h (table 7.3), so gems pull players toward cosmetics, not power.
- **Pity EV:** a Legendary arrives on average every 31.6 pulls (P90 51, hard 60) ≈ 5,060 gems ≈ $42. Valued at direct-shop prices, the expected value of a pull is 235 gems (147% of price) for someone who still needs everything. It falls to 24 shards once everything is owned (dupes only). Shards keep box spending from feeling wasted, and they can't be bought.

### 7.2 Revive pricing and the pay-to-win check

| Scenario | Story hours | Story attempts | 1st-try clear | Gem revives used | USD equiv. |
|---|---|---|---|---|---|
| Average F2P (feathers on bosses) | 18.8 | 314 | 97.4% | 0 | $0 |
| Average, gem revive on every failing level | 17.8 | 303 | 99.3% | 15 | $4 |

A 30-gem revive (about $0.25) on every failing level raises Average's first-try rate by about 2 points and saves about 1 h out of 19. It does not change which content a player *can* clear, since Feathers (≈2.5/week free) and Second Wind already exist, and Ranked Survival, the Trial, and Boss of the Week disable revives (03 §7). **Proposal:** cap paid revives at 3 per day and never show a revive offer after a Second Wind fails on a normal level. Show "practice this passage" instead, per 03 §7.

### 7.3 Gem-bought Gear Caches: how much faster can money make the story?

| Scenario | Story h (no gem caches) | Story h (with) | Saved | 1st-try | Boss 1st-try | Grind replays | Gems spent on caches | USD over story | USD per month |
|---|---|---|---|---|---|---|---|---|---|
| Beginner: buys the daily cap (1/day) with paid gems | 39.8 | 32.9 | -7.0 h (18%) | 81% -> 86% | 55% -> 64% | 199 -> 118 | 2,172 | $18 | $13 |
| Average: buys the daily cap (1/day) with paid gems | 18.8 | 17.7 | -1.1 h (6%) | 97% -> 99% | 88% -> 94% | 13 -> 5 | 860 | $7 | $12 |
| Fast: buys the daily cap (1/day) with paid gems | 14.6 | 14.5 | -0.1 h (1%) | 99% -> 99% | 92% -> 92% | 2 -> 1 | 700 | $6 | $12 |
| Beginner: F2P, spends ALL free gems on caches (0.55/day) | 39.8 | 36.1 | -3.7 h (9%) | 81% -> 84% | 55% -> 59% | 199 -> 156 | 1,308 | $0 (free gems) | - |
| Average: F2P, spends ALL free gems on caches (0.55/day) | 18.8 | 18.1 | -0.7 h (4%) | 97% -> 98% | 88% -> 92% | 13 -> 9 | 472 | $0 (free gems) | - |

- **Max spender** (1 cache/day, every day): about **$12–13/month**. Average saves 1.1 h (6%) and Fast saves nothing. Fast typists don't need gear, so a gem cache is a cosmetic-grade purchase for them. Beginner saves about 7 h (18%), almost all of it from skipped grind replays; see conflict C13.
- **F2P spending all free gems on caches** (about 0.55/day): Average −0.7 h, Beginner −3.7 h. This is a legitimate choice and it costs them their cosmetic budget.
- For comparison, the free Story preset saves Beginner about 11 h (section 9.4). Money is never the best lever for progress.

### 7.4 Season pass (cosmetic only, v2)

**Structure:** 8-week seasons, 40 tiers × 1,500 XP. XP = 1 per correct word typed in story, Survival or the Trial, plus 400 for completing all 4 dailies and 1,500 for the weekly set. Missions make up 30–47% of XP, so slow typists aren't locked out. There is **no gear, cache or gold on either track** (00 §6.4).

| Persona | Min/day | Words typed/day | Pass XP/day | Days to finish 40 tiers | Tiers in an 8-week season | XP share from missions |
|---|---|---|---|---|---|---|
| Beginner | 45 | 629 | 1,183 | 51 | 40/40 | 47% |
| Average | 60 | 941 | 1,495 | 40 | 40/40 | 37% |
| Fast | 60 | 1,295 | 1,849 | 32 | 40/40 | 30% |

| Player | Free gems per 8-week season | Pass cost (net) | Left after pass | Scribe pulls left | Scribe pulls if no pass |
|---|---|---|---|---|---|
| Fully engaged F2P | 1,532 | 950 - 50 back | 632 | 4.0 | 9.6 |
| Typical retained F2P | 1,080 | 950 - 50 back | 180 | 1.1 | 6.8 |

- Premium track: 16 cosmetics worth 5,280 gems at direct-shop prices + 50 gems, for 950 gems (~$7.91): 5.6x value. The same 950 gems in Scribe pulls = 5.9 pulls, EV 1,394 gems of shop value (1.5x).

- **Price: 950 gems** (about $7.91; sell it as a $9.99 bundle with 250 bonus gems). The premium track holds 16 cosmetics (1 Legendary, 3 Epic, 6 Rare, 6 Common, e.g., season aura, typing trail, keyboard sound pack, name color, frame, victory pose, pet) **+ 50 gems**. That is worth about 5.6× its price at direct-shop prices, versus about 1.5× for the same gems in Scribe pulls, so the pass is the best-value purchase in the game, as a pass should be.
- **Free track:** about 300 Ink Shards, profile items, 1 Epic headline cosmetic and 2 Rares.
- Every persona finishes all 40 tiers within the season at their normal daily play (Beginner by about day 50, Average day 40, Fast day 32). A typical player who plays about 4 days a week reaches about tier 25–32. The pass rewards practice time, not speed.
- **Not self-funding:** after buying the pass, engaged F2P still has about 630 gems a season and typical F2P about 180, so both can buy the next pass from free gems. That meets 00 §6.4 ("does not fund the next pass" refers to the 50-gem return, not to F2P income).

---

## 8. Survival mode

Scaling: wave-0 monsters have 0.5× story-L1 encounter HP (split over 2) and 0.18× the L1 grunt hit. Per wave: HP +8%, hit +2%, interval −1.2% (floor 0.55×). There are 2 + ⌊w/10⌋ monsters (max 5), a mini-boss every 10 waves, +12% HP between waves, and word tier +1 every 8 waves. **Ranked** uses the par build as the standardized kit (03 §4).

**Rewards** (story must stay the best gold source): wave w pays `0.12 GU / (1 + w/25)`. Only waves up to 60 pay, and only for 3 rewarded runs per day; later runs are practice/leaderboard only. Survival gems come only from weekly milestones (03).

| Persona | Frontier ch | WPM then | Mean wave (ranked kit = par gear) | P10-P90 wave | Mean wave (own gear) | Run minutes | Gold/run (rewarded) | Survival gold/min | Story progress gold/min (levels+chests+stars) | Story replay gold/min (approx) |
|---|---|---|---|---|---|---|---|---|---|---|
| Beginner | 10 | 27 | 16.8 | 16-18 | 18.7 | 16.5 | 475 | 28 | 138 | 41 |
| Beginner | 20 | 33 | 19.0 | 19-19 | 19.8 | 14.1 | 1,618 | 111 | 521 | 156 |
| Beginner | 30 | 37 | 19.1 | 19-19 | 20.1 | 13.2 | 5,300 | 386 | 1,794 | 538 |
| Average | 10 | 42 | 20.1 | 19-21 | 19.4 | 13.6 | 490 | 35 | 220 | 66 |
| Average | 20 | 44 | 22.8 | 21-24 | 22.2 | 13.6 | 1,761 | 125 | 763 | 229 |
| Average | 30 | 46 | 22.7 | 21-24 | 22.3 | 13.3 | 5,732 | 415 | 2,306 | 692 |
| Fast | 10 | 76 | 27.5 | 26-29 | 21.8 | 11.3 | 535 | 45 | 291 | 87 |
| Fast | 20 | 77 | 29.2 | 29-30 | 24.7 | 11.5 | 1,903 | 159 | 943 | 283 |
| Fast | 30 | 79 | 29.2 | 29-30 | 24.1 | 11.1 | 6,076 | 522 | 2,962 | 888 |

Survival pays **about 20% of story gold per minute**, so it can't replace the story. Spread between personas is deliberately narrow (Beginner ~19, Average ~22, Fast ~29 at par) because Pace-adaptive intervals equalize pressure. Pace-band leaderboards (01 §7.4) handle the rest. A mean run lasts 11–16 min.

---

## 9. Sanity checks and exploits

### 9.1 Replay farming, bots and AFK

| Player (ch15, par gear) | First clear + 3 stars gold/min | Replay same chapter gold/min | Replay 5 ch old gold/min | Max replay gold/day before soft cap | = current-tier Common items/day |
|---|---|---|---|---|---|
| Beginner | 289 | 72 | 22 | 9,321 | 2.1 |
| Average | 343 | 86 | 34 | 9,321 | 2.1 |
| Fast | 487 | 121 | 43 | 9,321 | 2.1 |
| BOT 200 WPM / 100% | 784 | 195 | 63 | 9,321 | 2.1 |

AFK: an idle hero at ch15 (par gear, no guards) dies in ~26s of encounter 1 and earns 0 gold (gauge only fills on correct keys).

- **Replay farming:** first clears with stars pay about 4× the gold/min of replays. Replays more than a chapter old pay about 10%. The 40-replays/day soft cap limits farming to about 2 Common items/day at the frontier. Gear power also has a ceiling (Rare +11 shop; Epic +13 and Legendary +15 from caches), so farming can't trivialize content. It only buys back the Beginner's skill gap, which is intended.
- **Bots/macros:** a 200 WPM, 100% bot earns 2.3× human gold/min on replays but hits the same daily soft cap, and it can't repeat first-clear rewards. That makes story botting low-value. Leaderboards are the real bot target. **Anti-cheat flags** (server-side keystroke-log validation, building on 03 §4):
  - sustained > 200 WPM over 60 s, or > 150 WPM with ≥ 99.5% accuracy for 10+ min
  - inter-key interval coefficient of variation < 0.08 over 300 keys (humans typically show 0.3–0.6)
  - key-down durations with SD < 3 ms
  - reaction to a new plate < 80 ms in more than 50% of plates
  - zero typos over 2,000+ chars at > 120 WPM
  - bursts > 25 chars/s
  - any multi-character input event (paste or injected IME)
  - claimed level duration shorter than `chars / 20 cps`
  - Flagged runs keep their story progress (no false-positive bans in a learning game). They are excluded from boards, and their gold is reduced to replay rate pending review.
- **AFK:** the gauge only fills on correct keys, so an idle hero at ch15 dies in about 26 s and earns 0 gold. There are no idle or offline rewards.
- **Level skip:** don't sell or grant sweep/skip tickets. Typing *is* the product, and a gem-bought skip would be pay-to-win. The accessibility route is the 01 "Story" preset (9.4) plus Zen mode. Players can replay cleared levels for stars, but there is no auto-resolve.

### 9.2 Hard walls

In 60 Beginner journeys, no level took more than 40 attempts. The worst levels average 6–7 attempts (mid- and late-game bosses: L130, L220, L160).

### 9.3 Skill-only wall check

This test takes a Beginner who *never* improves (20 WPM / 88% / 40% guard) and asks what gear reaches a 50% win rate:

| Ch | Par gear | Frozen Beginner needs (L9, 50% win) | Frozen Beginner needs (boss, 50% win) |
|---|---|---|---|
| 1 | Common +0 | Common +0 | Common +1 |
| 5 | Uncommon +5 | Uncommon +7 | Rare +6 |
| 10 | Uncommon +5 | Rare +6 | Rare +9 |
| 15 | Uncommon +5 | Rare +7 | Rare +9 |
| 20 | Uncommon +5 | Rare +7 | Rare +9 |
| 25 | Uncommon +5 | Rare +7 | Rare +10 |
| 30 | Uncommon +5 | Rare +7 | Rare +10 |

Everything is reachable with **shop-buyable Rare gear (cap +11)**. So the "gear compensates for skill" promise holds even with zero learning. This is why the Rare cap is +11 (with +9 the sim needed Epic +7/+8 for ch25–30 bosses, which only come from random caches).

### 9.4 Difficulty presets

| Scenario | Story hours | 1st-try clear | Boss 1st-try | Grind replays |
|---|---|---|---|---|
| Beginner, Standard | 39.8 | 81% | 55% | 199 |
| Beginner, Story preset (intervals x1.4) | 28.8 | 93% | 76% | 49 |
| Average, Standard | 18.8 | 97% | 88% | 13 |

The 01-doc **Story** preset (enemy intervals ×1.4) cuts Beginner time from about 40 h to about 29 h and raises boss first-try clears from about 55% to about 76%. The game should suggest it after 3 failed attempts on the same level when Pace < 30.

---

## 10. Play-time target and justification

- **Target: Average story ≈ 18–22 h (critical path) and ≈ 40–45 h to 100% stars, plus open-ended Survival and Hard mode.** The simulation gives 18.8 h (P10–P90 18-20 h) and +25 h for 900 stars.
- **Why not 40 h for the story alone:** 300 levels × 2–4 min is a 10–20 h hard ceiling on first-clear time. Reaching 40 h would need about 20 h of forced replays (60% of play), and the sim shows grind is where Beginners churn. For a typing-*practice* product, the better lever is optional replay with value (stars, Weak-word SRS injection, Hard mode, Survival), which the Average persona's +25 h of star-chasing shows exists.
- **If product insists on a 40 h critical path,** the honest options are (a) more content, either 4 encounters per level from ch6 plus a third tier of chapters, or (b) a 5–6 min level length. Both break the 2–4 min session premise.
- **Sessions:** at 1 h/day, Average finishes in about 19 days and Beginner (45 min/day) in about 55. Beginner's journey is the retention risk. Mitigate with the Story preset, a mid-game WPM milestone celebration (Beginner crosses 30 WPM around ch13 and 35 WPM around ch22), and Training Grounds.
- **Active typing:** Average spends about 9.6 h actually typing during the story. Beginner spends about 26 h, which takes them from 20 to about 38 WPM and from 88 to 91% accuracy. That is the product's learning promise in numbers.

---

## 11. Final parameter values (as tuned)

| Group | Parameter | Value |
|---|---|---|
| Authoring | Encounter TTK (ref typist, par gear) | 36 s |
| | Reference typist | 35→37→39.5→42 WPM at ch1/10/20/30; acc 92→93.5%; guard 60→66% |
| | DMG_FRAC (ref damage/HP per normal level at L1) | 0.40 / 0.65 / 0.85 / 0.95 / 1.00 at ch1/3/6/10/30 |
| | Sawtooth per level in chapter | HP +2%, hit +2.5% |
| | Boss | 1 add wave; boss HP 3.2 encounters; boss-encounter dmg ×1.4→3.0 of a normal encounter (ch1→10+); 2.5 Doom Spells at 15% par HP |
| Combat | ATB / combo / chip | 01 values (8/10, ×1.25, 0.02×25, 15%/25%) |
| | Combat typing efficiency | 0.82 |
| | Skill damage | 0.12 ATK per word-charge (both slots) |
| | Hero base | ATK 10, HP 100; walk heal 25%; Second Wind 30%; paid revive 50% |
| Gear | Tier growth / rarity mult / upgrade | ×1.40 per tier; C 1.00, U 1.12, R 1.25, E 1.40, L 1.60; +7%/level |
| | Upgrade caps | C 5, U 7, R 11, E 13, L 15 |
| | Prices | T1 Common 1,150; ×1.405 per tier; U ×2.2, R ×5; upgrade 25% × 1.30^lvl |
| | Transfer / salvage | 50% of levels transfer; salvage 25%; unwanted drops 10% |
| | Par build | ch1 C+0, ch2 C+2, ch3 U+3, then U+5 at current tier |
| Gold | Gold Unit | 100 × 1.125^(c−1); +3%/level; boss ×3 |
| | Replay / stale / softcap | 40% / 20% / ×0.25 after 40 per day |
| | Stars | +0.2× per star (once); star chests at 10/20/30; ★★ = match own 7-day median accuracy (88–97%) |
| | Missions | daily 4 × 1 GU; weekly 18 GU; 7-day calendar 3 GU/week |
| | Satchel | 25 GU |
| Chests | Per normal encounter | 30% first clear / 15% replay; tier mix W72/I24/G3.5/M0.5 |
| | Boss | 1 guaranteed; I55/G38/M7; next-tier Common piece on first clear |
| | Gear rolls (v2) | Wooden 10% (C80/U20), Iron 35% (C40/U45/R15); Gold → 1 cache, Mythic → 2 caches |
| Gear Caches (v2) | Odds / pity | C 40 / U 33 / R 20 / E 6 / L 1; Rare+ ≤ 8, Epic+ ≤ 30, Legendary ≤ 120 |
| | Price / cap | 14 GU gold; 50 gems, max 1 gem cache/day |
| | Free sources | Gold chest 1, Mythic 2, weekly set 2, 30-star chapter 1 |
| Season pass (v2) | Price / return | 950 gems; premium track returns 50 gems; cosmetics only |
| | XP | 1/word; dailies 400; weekly 1,500; 40 tiers × 1,500 |
| Gems | Free | dailies 10/day, login 40/week, calendar 12/week, weeklies 80/week (cap 250/week); achievements 600; boss first clear 10; 30-star chapter 10 |
| | Spend | revive 30; Scribe 160 (10-pull 1,440); direct C/R/E/L 80/200/600/1,800 |
| Survival | Base / growth | HP 0.5×, hit 0.18× of story L1; +8% HP, +2% hit, −1.2% interval per wave; heal 12% |
| | Rewards | 0.12 GU/(1 + w/25) per wave, waves ≤ 60, 3 rewarded runs/day |

## 12. Open questions and next steps

1. **Playtest calibration:** the model assumes 0.82 combat typing efficiency and guard success rates of 40/60/75%. Instrument both in the first prototype, then refit `COMBAT_TYPING_EFF` and `REF_*`.
2. **Weapon archetypes:** only the Sword is simulated. Dagger, Hammer and Staff should be tuned to within ±5% of Sword DPS at Pace 35. Hammer should get the Beginner edge 01 suggests: fewer, bigger hits are better when enemy intervals are long.
3. **Companions (01 §2.4):** cap them at ≤10% of hero DPS, or the par curve shifts.
4. **Passives with economy effects** (01 "Treasure Sense +15% gold"): cap at +10%, and exclude replay soft-capped gold from it.
5. **Hard mode** (+1 word tier, Strict combo) should re-use these curves with DMG_FRAC +15% and pay 1.5× first-clear gold once per level.

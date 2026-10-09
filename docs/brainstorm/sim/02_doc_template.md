# 02 — Economy, Difficulty Curve & Balance (simulated) — v2

> Status: brainstorm / proposal backed by a Monte-Carlo simulation. Owner: economy & balance.
> Simulator: `docs/brainstorm/sim/economy_sim.py` (Python 3, stdlib only). Raw output with every table: `docs/brainstorm/sim/economy_sim_output.md`.
> To regenerate everything (about 25 s):
> ```
> python3 docs/brainstorm/sim/economy_sim.py > docs/brainstorm/sim/economy_sim_output.md
> python3 docs/brainstorm/sim/render_doc.py      # fills sim/02_doc_template.md -> 02-economy-and-balance.md
> ```
> All tunables are in the `PARAMETERS` block at the top of the script. Edit prose in `sim/02_doc_template.md`, not in this file. Tables and placeholder numbers are filled in from the sim output. A few inline numbers in the prose are hand-written; re-check them after retuning.
> Every table comes from the simulation: <<RUNS>> full 300-level journeys per persona, seed 20261008.

## v2 changes (2026-10-08, after the product decisions in 00-overview §3 and §6)

| Change | What moved |
|---|---|
| **Gear Caches added** (00 §6.2) | Level-matched random gear boxes at the frontier tier with fixed published odds C 40 / U 33 / R 20 / E 6 / L 1 plus a published pity guarantee. Price: **14 GU of gold** (gold sink) or **50 gems**, with a cap of **1 gem cache per day**. Free sources: Gold chest 1, Mythic chest 2, weekly missions 2, 30-star chapter 1. Gold and Mythic chests no longer roll gear directly; caches replace that roll, so Epic and Legendary are no longer drop-only. New sections 6.5 and 7.3. |
| **Season pass added** (00 §6.4) | Cosmetic only: no gear, caches or gold. Proposed price **950 gems**, with 50 gems returned on the premium track. XP comes from typing (1 per word) plus missions. 40 tiers × 1,500 XP. New section 7.4. |
| **Resolutions applied** (00 §3) | C2 (Survival +2% ATK/wave, 12% heal), C3 (skill share now reported, 11–17%), C4 (Doom 15% par HP), C5/C6 (GU-scaled missions and Satchel), C7 (weekly Survival wave 20; no sim effect), C10 (revive 50% HP), C11 (★★ relative to own median; see new conflict C12). |
| **Re-check result** | Caches do **not** inflate power. Average stays at 0.90–1.06× par per chapter with the same story hours (<<AVG_H>> h vs 18.8 h in v1) and clear rates (<<AVG_FT>> / <<AVG_BOSS>> vs 97% / 87%). Beginner <<BEG_H>> h (v1 41.1). Fast <<FAST_H>> h (v1 14.5). Gold is still fully spent: Average puts about 76% into upgrades, 20% into caches and 4% into shop pieces. |
| **Gem caches** | Buying the daily cap (1 per day, about $12–13/month) saves Average about 1 h (6%) and Fast 0 h, but saves Beginner about 7 h (18%). That is flagged as C13. |
| **Lootbox odds** | Unchanged: cosmetic Scribe's Chest effective Legendary rate is **<<LEG_RATE>>** with pity (fixed published odds, pity published as a guarantee). |

---

## 0. TL;DR

| | Beginner (20 WPM, 88%) | Average (40 WPM, 94%) | Fast (75 WPM, 97%) |
|---|---|---|---|
<<TLDR>>

The main conclusions:

1. **The difficulty curve works without any skill-only walls.** Average clears <<AVG_FT>> of levels on the first try (<<AVG_BOSS>> of bosses). Beginner clears <<BEG_FT>> on the first try and grinds about 7 replays per chapter. Fast clears <<FAST_FT>> while running gear that is only <<FAST_POW>> of the par build, so fast typists can skip tiers. In 60 journeys per persona, no level needed more than 40 attempts. A Beginner whose skill never improves can still reach a 50% win rate on every boss using shop-buyable Rare +10 gear (section 9.3). Gear Caches are not needed for that.
2. **Play time.** Average finishes the story in about **<<AVG_H>> h**. 100% completion (all 900 stars) adds about +<<AVG_STAR_H>> h, which puts the full journey at about **<<AVG_TOTAL>> h**. Beginner needs about <<BEG_H>> h, or about 29 h on the 01-doc "Story" preset. Fast needs about <<FAST_H>> h. The brief's 40–80 h target is hit for *completion*, not for the critical path. Section 10 shows that a 40-hour critical path is impossible with 300 levels of 2–4 minutes unless 60% of play is forced grind.
3. **No gold inflation, including the new Gear Caches.** Average and Beginner spend 98–99% of the gold they earn (upgrades, then caches, then a few shop pieces). The bank never holds more than about 1.5 next-tier items. Every chapter brings about one new gear piece (from caches, chests, the boss's guaranteed next-tier drop, or the shop). Fast typists run a surplus, which the cosmetic Gold Satchel sink absorbs.
4. **Gear Caches are fun without breaking the curve.** Average opens about 62 caches over the story: 18 bought with gold, the rest from chests and weeklies. About 1 in 5 improves its gear, a Rare or better shows up roughly every 3 caches (guaranteed within 8), and a Legendary roughly every 64. Players who overbuy caches for the thrill finish within ±0.3 h of pure-EV shoppers, so caches are never a trap.
5. **Gems are cosmetic plus convenience.** An engaged F2P player earns about **<<F2P_WEEK>> gems/week (<<F2P_MONTH>>/month, about 1,530 per 8-week season)**. That covers the 950-gem season pass plus about 4 Scribe pulls each season. A typical retained player (about 1,080 per season) can still afford the pass. A paid revive on every failed level saves Average about 1 h. Buying the daily gem-cache cap saves Average about 1 h and Beginner about 7 h, for about $12–13 a month.

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
| C8 | 03 §2.2 | The published "effective Legendary incl. pity ~2.6%" is wrong under the stated soft pity. | The simulated effective rate is **<<LEG_RATE>>** (mean <<LEG_GAP>> pulls). Publish the corrected figure. |
| C9 | 03 §2.5 | "Direct shop is 60–70% of the expected box cost of a specific item" does not hold. | With a pool of 20 Legendaries, a *specific* Legendary costs ~53k gems through boxes vs. 1,800 direct, which is **3%**. For *any* Legendary it is 36%. The direct shop is far better value for targeting, which is ethical but will pull revenue away from boxes. Product should decide if that is intended. |
| C10 | 03 §5 | Premium revive HP is not specified. | Revive at **50% HP**. Second Wind gives 30%. |
| C11 | 01 §6.3 | The ★★ accuracy thresholds (90/93/95% by chapter band) are absolute. Beginner ends the story at about 91%, so ★★ was mostly out of reach after ch10 (v1 sim: +361 h to 900 stars). | **Adopted:** ★★ is **relative** to the player's own 7-day median accuracy, clamped 88–97%. Absolute thresholds apply only in Hard mode. Beginner's extra time to 900 stars drops to +<<BEG_STAR_H>> h. |
| **C12** | 00 §3 (C11) | "Median **+1 pt**" makes ★★ about a 20% roll per attempt for everyone, because per-level accuracy noise is about ±1.2 pt. In the sim it pushed Average's time to 900 stars from +25 h to **+63 h**, so 100% completion would take about 82 h instead of the about 42 h decided in 00 §6.1. | Use "**match or beat** your 7-day median" (+0 pt). The sim default (`STAR2_REL_MARGIN = 0.0`) gives +<<AVG_STAR_H>> h, about <<AVG_TOTAL>> h to 100%. Keep +1 pt as a Hard-mode ★★ instead. |
| **C13** | 00 §6.2 | Gem caches only speed up story PvE, but the speed-up is uneven. At the 1-per-day cap, Average saves 6% and Fast 0%, while Beginner saves **18% (about 7 h)**, because caches replace grind replays (199 → 118). Grind is also typing practice, so this isn't harmful, but it is the largest pay-for-speed effect in the game. | Keep the cap at **1 per day** (2 per day gave Beginner −24%). Optionally make the gem cache **"first cache of the day only"** so it can't be stockpiled. Pair it with a prompt to try the free Story preset, which saves Beginner more (−11 h) at $0. |
| **C14** | 03 §2.5 | 03's "Chronicle Pass" (950 gems, pays back 1,000) is superseded by 00 §6.4: the premium track now returns about 50 gems. | Keep the **950-gem** price (about $7.91, sold as a $9.99 bundle with 250 extra gems). Engaged F2P (1,532/season) and typical F2P (1,080/season) can both afford it from free gems, so the pass is not a paywall. 03 §2.5 and the free-gem table need updating. |
| **C15** | 00 §4 / 03 §3.3 | 00 §4 still says "Epic and Legendary gear come only from drops". 03's weekly missions do not list Gear Caches. | Epic and Legendary now come from **Gear Caches** (any source, including gems). Weekly mission #10 should grant **2 Gear Caches**. Gold and Mythic chests grant 1 and 2 caches instead of a direct gear roll. |
| **C16** | 02 v1 shop | With caches, boss drops and Upgrade Transfer, Average buys only about 2 shop pieces in the whole story (v1: about 21). Gold flows to upgrades (76%) and caches (20%). | Make the shop the **deterministic fallback**: pick slot and rarity (C/U/R) at a known price. This protects against bad cache luck, and its prices are unchanged. If design wants the shop to matter more, cut cache sources from chests rather than raising cache prices. |
| **C17** | 01 §2.3 / 00 §3 (C3) | Skill damage share is 16–17% at ch1 but drops to 11–12% from ch15, because skills charge per *plate* and plates get longer (4 → 9.4 chars). | From word tier T4 on, charge skills **per 5 typed characters** instead of per plate. That holds skills at about 15–17% of damage. |

---

## 2. Player model

### 2.1 Learning curve

`WPM(t) = cap − (cap − WPM₀)·e^(−t/35)` and `acc(t) = cap − (cap − acc₀)·e^(−t/45)`, where t = **active typing hours** (combat time only, not menus). This reproduces the brief's anchor of 20 → 40 WPM after 30 h for the Beginner. Guard success learns with τ = 30 h. Each attempt adds noise: speed ×N(1, 0.10), accuracy ±1.2 pt, guard ±6 pt, damage taken ×N(1, 0.08).

<<SEC:## L.>>

Personas: Beginner caps at 55 WPM / 95.5% (plays 45 min/day). Average caps at 62 / 97% (1 h/day). Fast caps at 92 / 98.5% (1 h/day). Fast is a "frugal" spender: it only buys gear when its power falls below 0.6× par, or right after a loss.

### 2.2 Word difficulty by chapter

The effective typing speed is `WPM × speed factor`, where the factor is `1 − 0.015·(len−4) − 0.6·caps − 1.0·punct − 1.2·numbers`. Accuracy drops by `0.0025·(len−4) + 0.05·caps + 0.12·punct + 0.15·numbers`. Plates are blended 75% current tier and 25% review (01 §5.1 mix rule).

<<SEC:## A.>>

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

<<SEC:## B.>>

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

<<SEC:## C.>>

### 4.2 Calibration check: win % with *exactly* par gear and *starting* skill

Values are L1 / L9 / boss. Second Wind is included; Feathers are not.

<<SEC:## C2>>

How to read this table: the reference typist with par gear clears normal levels at about 90–100%, and bosses at 26–51% in the mid and late game (the boss is the gear check). Average at its *starting* skill is close to the reference. In the full simulation it also learns (40 → 45 WPM) and averages 0.9–1.2× par gear. Beginner at starting skill and par gear is hopeless after ch5. Real Beginners get there through learning plus 1.0–1.5× par gear from grinding (section 5). Fast wins everything at par, so it can run 0.5–0.75× par.

---

## 5. Simulation results

### 5.1 Headline

<<SEC:## 0. Headline>>

"End power vs par" is final gear ÷ par(ch30). The per-chapter "power vs par" column below is measured at *chapter start*, before buying that chapter's new tier, so it reads lower.

### 5.2 Per-chapter summary (all personas)

<<SEC:## S.>>

Notes:
- **Time per level** (active, without menus or the Journal) for normal levels: Average 2.4–3.0 min, Fast 1.7–2.2, Beginner 3.0–4.5 (early chapters are slowest, because the Beginner is still at 20–23 WPM). Boss levels: Average 4.2 min, Beginner 5.4, Fast 3.4. This is inside the 2–4 min target except for early-game Beginner normal levels and Beginner boss levels (see C1).
- **Sawtooth in clear rates.** Average is 100% in ch1–7 (onboarding), then settles at 93–98% on normals and 68–93% on bosses from ch11 on. Beginner holds 67–86% first-try on normals from ch4 and 28–63% on bosses from ch6 on, because learning roughly keeps pace with the curve. Its grind is spread across the game (about 7 replays/chapter) rather than piling up at one wall.
- **No power inflation from caches.** Average's power at chapter start stays at 0.90–1.06× par from ch4 to ch30 (v1: 0.78–1.20×).
- **Recommended gear tier** = the par column: the newest tier in each slot at Uncommon +5. Fast is fine at 1 tier behind with +2–3 upgrades. Beginner wants par or 1–3 upgrade levels above it (Rare drops help).

### 5.3 Average persona: gold flow per chapter

<<SEC:## D. Per-chapter summary: Average>>

---

## 6. Economy

### 6.1 Units and income

- **Gold Unit (GU)** = first-clear gold of L1 in chapter c = `100 × 1.125^(c−1)`, so ch1 = 100 and ch30 = 3,044. Within a chapter, level gold rises +3% per level. The boss pays 3×.
- **Replay** pays 40% of first-clear gold, and 20% once the level is more than 1 chapter behind the frontier. After 40 replays/day, replays pay ×0.25 (soft cap).
- **Failing** keeps 50% of the gold collected before death (01 §1.8).
- **Stars:** each star pays +0.2× level gold the first time it is earned. ★★ means matching your own 7-day median accuracy (C11/C12). 10/20/30 stars in a chapter unlock an Iron/Gold/Gold chest. All 30 stars also give 10 gems and 1 Gear Cache.

<<SEC:## F2.>>

### 6.2 Chest tiers and contents

| Chest | Drop source | Gold | P(gear) | Gear rarity | Gems (first clear only) |
|---|---|---|---|---|---|
| Wooden | 30% per normal encounter on first clear (15% on replay) × 72% | 0.5 GU | 10% | C 80 / U 20 | 0 |
| Iron | normal encounter × 24%; boss 55%; 10-star milestone | 1.0 GU | 35% | C 40 / U 45 / R 15 | 0 |
| Gold | normal encounter × 3.5%; boss 38%; 20/30-star milestone | 2.5 GU | **1 Gear Cache** (v2) | cache odds | 5 |
| Mythic | normal encounter × 0.5%; boss 7% | 6.0 GU | **2 Gear Caches** (v2) | cache odds | 20 |

Bosses always drop one chest on first clear (50% chance on replay). Gear from chests is the frontier tier for a random slot, or one tier lower 30% of the time. **Each chapter boss's first clear also drops the next chapter's new-tier piece at Common.** That guarantees a meaningful upgrade moment every chapter and removes the "can't afford the new tier yet" dip.

<<SEC:## F.>>

Direct chest gear is now only Common, Uncommon or Rare (Wooden and Iron chests). Every Epic and Legendary comes from a Gear Cache (section 6.5).

### 6.3 Shop prices and gold sinks

- The shop sells **Common / Uncommon / Rare** of the current tier per slot at 1× / 2.2× / 5× the Common price. It is the deterministic fallback (C16). **Epic and Legendary come only from Gear Caches.**
- **Tier unlocks rotate by slot.** In ch1 all slots are T1. Ch4 unlocks the T2 weapon, ch5 the T2 armor, ch6 the T2 charm, ch7 the T3 weapon, and so on. Every chapter from 4 on has a new item.
- **Upgrades** cost `0.25 × tier Common price × 1.30^level`. Caps: C +5, U +7, R +11, E +13, L +15. Each level gives +7% to the item's stat.
- **Upgrade Transfer:** new gear inherits ⌊50% × old upgrade level⌋. Salvage returns 25% of the item's value + 25% of the non-transferred upgrade gold. Unwanted chest drops salvage for 10% of value. Without the transfer, the sim showed Average falling to 0.78× par by ch30, because upgrade gold was stranded on old tiers.
- **Gold Satchel** (cosmetic C/R) costs 25 GU and is the overflow sink.

<<SEC:## G.>>

### 6.4 Sources, sinks and inflation

<<SEC:## E.>>

"Salvage" is gross: it is mostly the 25% refund when a piece is replaced, so it is a rebate on spending rather than new money. Net of salvage, Average gold comes from levels ~44%, chests ~30%, stars ~16% and missions ~11%. Average spends ~76% on upgrades, ~20% on Gear Caches and ~4% on shop pieces. **Inflation check:** for Average, the per-chapter bank (table 5.3) stays between 0.2k and about 26k, never more than about 1.5× the next item's price. Gold earned and gold spent track each other chapter by chapter. The Fast persona deliberately under-spends on gear (it never buys caches with gold) and banks the surplus, which the 25-GU Satchel sink absorbs (about 430k over the story).

### 6.5 Gear Caches (v2)

**Design**
- A cache rolls **one item for a random slot at the player's frontier-chapter tier**, so a cache is never obsolete. The rarity uses **fixed published odds** that never vary by player, time or spend. **Pity** is a separate published guarantee (counters, not hidden rate changes): Rare+ within 8 caches, Epic+ within 30, Legendary by 120. The new item inherits ⌊50%⌋ of the slot's upgrade levels (Upgrade Transfer), so a lucky Epic is usable right away. Items that don't help salvage for 10% of value.
- **Price: 14 GU of gold** (about 1.2× the frontier Common price at tier unlock). At that price a cache's expected power gain per gold is roughly equal to the best shop or upgrade option. A pure-EV player therefore buys one about every 1.5–2 chapters, and a player who buys them for fun pays almost nothing for doing so (table F5). Gold caches are a **gold sink**: they took about 20% of Average's gear gold and 30% of Beginner's.
- **Free sources:** Gold chest 1, Mythic chest 2, weekly mission set 2, 30-star chapter 1. None come from the season pass.
- **Gems:** 50 gems (about $0.42), **max 1 per day**, story PvE only. Ranked Survival, Boss of the Week and the Trial use standardized gear (03 §4), so gem caches can't buy leaderboard power.
- **Is pity needed?** Yes, as a *published* floor. Without it, any run of 8 caches has an 8% chance of containing nothing better than Uncommon, and that "dry streak" is what makes random loot feel rigged. The Rare+/8 floor only lifts the effective Rare+ rate from 27% to 30%, and the Legendary/120 floor matters only to heavy gem buyers. Publish both the base odds and the effective rates in the table below.

<<SEC:## F4.>>

**What players actually open over the story:**

<<SEC:## F3.>>

"Cache improved gear" is the share of caches that replaced an equipped piece, about 1 in 5. The rest still pay salvage gold, and the reveal still shows the rarity roll, which is the excitement beat.

**Does overbuying caches break the curve?** The greedy AI was run with cache value weighted ×2 and ×4, which models players who buy caches whenever they can:

<<SEC:## F5.>>

Cache-lovers end within ±0.3 h of the baseline at the same power vs par. The price is balanced: caches are neither a trap nor a shortcut.

---

## 7. Gem (premium) economy

### 7.1 Inflow and boxes

<<SEC:## J. Gems>>

**Recommendations (aligned with 03):**
- Keep the 03 price points ($0.99 = 100 … $49.99 = 6,500 gems). A Scribe pull is 160 gems ≈ **$1.33** at the $9.99 rate. Drop the v1 idea of a monthly gem subscription, since the season pass (7.4) now fills that role.
- **What F2P can afford:** about 830 gems/month (about 1,530 per season) when fully engaged, and about 585/month (1,080/season) for a typical retained player. One-time progression gems come on top: boss first clears 10 each = 300, 30-star chapters, chest gems, and 600 from achievements. Free gems now compete for **four sinks**: cosmetic pulls (160), the season pass (950 per season), revives (30) and gem caches (50, max 1/day). A typical engaged F2P season is the pass + about 4 Scribe pulls. Alternatively, spending *all* free gems on caches saves Average only 0.7 h and Beginner 3.7 h (table 7.3), so gems pull players toward cosmetics, not power.
- **Pity EV:** a Legendary arrives on average every <<LEG_GAP>> pulls (P90 51, hard 60) ≈ 5,060 gems ≈ $42. Valued at direct-shop prices, the expected value of a pull is 235 gems (147% of price) for someone who still needs everything. It falls to 24 shards once everything is owned (dupes only). Shards keep box spending from feeling wasted, and they can't be bought.

### 7.2 Revive pricing and the pay-to-win check

<<SEC:## J2>>

A 30-gem revive (about $0.25) on every failing level raises Average's first-try rate by about 2 points and saves about 1 h out of 19. It does not change which content a player *can* clear, since Feathers (≈2.5/week free) and Second Wind already exist, and Ranked Survival, the Trial, and Boss of the Week disable revives (03 §7). **Proposal:** cap paid revives at 3 per day and never show a revive offer after a Second Wind fails on a normal level. Show "practice this passage" instead, per 03 §7.

### 7.3 Gem-bought Gear Caches: how much faster can money make the story?

<<SEC:## J4>>

- **Max spender** (1 cache/day, every day): about **$12–13/month**. Average saves 1.1 h (6%) and Fast saves nothing. Fast typists don't need gear, so a gem cache is a cosmetic-grade purchase for them. Beginner saves about 7 h (18%), almost all of it from skipped grind replays; see conflict C13.
- **F2P spending all free gems on caches** (about 0.55/day): Average −0.7 h, Beginner −3.7 h. This is a legitimate choice and it costs them their cosmetic budget.
- For comparison, the free Story preset saves Beginner about 11 h (section 9.4). Money is never the best lever for progress.

### 7.4 Season pass (cosmetic only, v2)

**Structure:** 8-week seasons, 40 tiers × 1,500 XP. XP = 1 per correct word typed in story, Survival or the Trial, plus 400 for completing all 4 dailies and 1,500 for the weekly set. Missions make up 30–47% of XP, so slow typists aren't locked out. There is **no gear, cache or gold on either track** (00 §6.4).

<<SEC:## J5>>

- **Price: 950 gems** (about $7.91; sell it as a $9.99 bundle with 250 bonus gems). The premium track holds 16 cosmetics (1 Legendary, 3 Epic, 6 Rare, 6 Common, e.g., season aura, typing trail, keyboard sound pack, name color, frame, victory pose, pet) **+ 50 gems**. That is worth about 5.6× its price at direct-shop prices, versus about 1.5× for the same gems in Scribe pulls, so the pass is the best-value purchase in the game, as a pass should be.
- **Free track:** about 300 Ink Shards, profile items, 1 Epic headline cosmetic and 2 Rares.
- Every persona finishes all 40 tiers within the season at their normal daily play (Beginner by about day 50, Average day 40, Fast day 32). A typical player who plays about 4 days a week reaches about tier 25–32. The pass rewards practice time, not speed.
- **Not self-funding:** after buying the pass, engaged F2P still has about 630 gems a season and typical F2P about 180, so both can buy the next pass from free gems. That meets 00 §6.4 ("does not fund the next pass" refers to the 50-gem return, not to F2P income).

---

## 8. Survival mode

Scaling: wave-0 monsters have 0.5× story-L1 encounter HP (split over 2) and 0.18× the L1 grunt hit. Per wave: HP +8%, hit +2%, interval −1.2% (floor 0.55×). There are 2 + ⌊w/10⌋ monsters (max 5), a mini-boss every 10 waves, +12% HP between waves, and word tier +1 every 8 waves. **Ranked** uses the par build as the standardized kit (03 §4).

**Rewards** (story must stay the best gold source): wave w pays `0.12 GU / (1 + w/25)`. Only waves up to 60 pay, and only for 3 rewarded runs per day; later runs are practice/leaderboard only. Survival gems come only from weekly milestones (03).

<<SEC:## I.>>

Survival pays **about 20% of story gold per minute**, so it can't replace the story. Spread between personas is deliberately narrow (Beginner ~19, Average ~22, Fast ~29 at par) because Pace-adaptive intervals equalize pressure. Pace-band leaderboards (01 §7.4) handle the rest. A mean run lasts 11–16 min.

---

## 9. Sanity checks and exploits

### 9.1 Replay farming, bots and AFK

<<SEC:## K.>>

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

<<SEC:## H.>>

Everything is reachable with **shop-buyable Rare gear (cap +11)**. So the "gear compensates for skill" promise holds even with zero learning. This is why the Rare cap is +11 (with +9 the sim needed Epic +7/+8 for ch25–30 bosses, which only come from random caches).

### 9.4 Difficulty presets

<<SEC:## J3>>

The 01-doc **Story** preset (enemy intervals ×1.4) cuts Beginner time from about 40 h to about 29 h and raises boss first-try clears from about 55% to about 76%. The game should suggest it after 3 failed attempts on the same level when Pace < 30.

---

## 10. Play-time target and justification

- **Target: Average story ≈ 18–22 h (critical path) and ≈ 40–45 h to 100% stars, plus open-ended Survival and Hard mode.** The simulation gives <<AVG_H>> h (P10–P90 <<AVG_P>>) and +<<AVG_STAR_H>> h for 900 stars.
- **Why not 40 h for the story alone:** 300 levels × 2–4 min is a 10–20 h hard ceiling on first-clear time. Reaching 40 h would need about 20 h of forced replays (60% of play), and the sim shows grind is where Beginners churn. For a typing-*practice* product, the better lever is optional replay with value (stars, Weak-word SRS injection, Hard mode, Survival), which the Average persona's +<<AVG_STAR_H>> h of star-chasing shows exists.
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

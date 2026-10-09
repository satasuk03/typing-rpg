#!/usr/bin/env python3
"""
HD-2D Typing RPG -- difficulty / play-time / economy / drop-rate simulation.

Python 3 stdlib only.  Run:
    python3 economy_sim.py            # full run, prints markdown tables
    python3 economy_sim.py --quick    # fewer Monte-Carlo runs

Every tunable lives in the PARAMETERS block below.  Combat formulas follow
docs/brainstorm/01-combat-and-levels.md (ATB 0-100, Sword char charge 8 / word
bonus 10, Perfect word x1.25, ComboMult = 1 + 0.02*min(combo,25) with typo
halving combo, Word Strike chip 15%/25% ATK, Pace-adaptive enemy intervals
(35/Pace)^0.7 clamped 0.6-1.8, guard words, +25% HP on walks, Second Wind).
Gem side follows docs/brainstorm/03-meta-monetization-backend.md (160-gem
Scribe's Chest, pity 10/60, soft pity 45 +5pp, 30-gem revive, Feathers).

Model notes
-----------
* Persona WPM is NET WPM (correct chars/min / 5).  Accuracy = correct / all
  keystrokes (stop-on-error: a typo costs a keystroke, never progress).
* Combat damage is resolved analytically per "kill phase" (focus-fire one
  monster at a time; every living monster deals its expected damage-per-
  second).  Per-attempt randomness: speed performance, accuracy, guard
  success and a combat-RNG factor.  This is cheap enough to run thousands of
  full 300-level journeys.
"""
import math
import random
import statistics
import sys
from collections import defaultdict

# =============================================================================
# PARAMETERS  (all tuning lives here)
# =============================================================================
SEED = 20261008
N_RUNS = 60                       # Monte-Carlo journeys per persona
if "--quick" in sys.argv:
    N_RUNS = 12

# ---- Story structure --------------------------------------------------------
CHAPTERS = 30
LEVELS_PER_CH = 10
TWO_ENCOUNTER_LEVELS = 20         # levels 1..20 have 2 encounters (01 doc 6.1)
# encounter group sizes (monsters per encounter), cycled per level
ENC_SIZES_EARLY = [[1, 2], [2, 2], [1, 3]]                  # levels 1-20
ENC_SIZES_MID = [[2, 2, 3], [1, 3, 3], [2, 3, 2]]           # ch3-12
ENC_SIZES_LATE = [[2, 3, 3], [3, 2, 4], [2, 4, 3]]          # ch13+

# Non-typing time per level (seconds)
LEVEL_INTRO_S = 7
WALK_S = 8                        # scene-break walk between encounters
REWARD_S = 5                      # reward burst after each encounter
LEVEL_END_S = 10                  # chest / stars / journal (skippable)
MENU_S_PER_LEVEL = 20             # shop, loadout, map between levels
JOURNAL_S_PER_LEVEL = 12          # Word Journal learning card (skippable after 3s)
STORY_SCENE_S_PER_CH = 240        # town + story scenes per chapter
BOSS_EXTRA_S = 30                 # intro dialogue, phase breathers, finisher

# ---- Personas ----------------------------------------------------------------
# wpm/acc: start, cap.  guard: probability of successfully typing a Guard word.
# hours_per_day: session length (drives dailies/weeklies & calendar).
PERSONAS = {
    "Beginner": dict(wpm0=20, wpm_cap=55, acc0=0.88, acc_cap=0.955,
                     guard0=0.40, guard_cap=0.66, hours_per_day=0.75,
                     revive_policy="boss"),
    "Average": dict(wpm0=40, wpm_cap=62, acc0=0.94, acc_cap=0.970,
                    guard0=0.60, guard_cap=0.76, hours_per_day=1.0,
                    revive_policy="boss"),
    "Fast": dict(wpm0=75, wpm_cap=92, acc0=0.97, acc_cap=0.985,
                 guard0=0.75, guard_cap=0.86, hours_per_day=1.0,
                 revive_policy="never", spend="as_needed"),
}
LEARN_TAU_H = 35.0     # WPM: w(t)=cap-(cap-w0)*exp(-t/tau), t = active typing h
ACC_TAU_H = 45.0
GUARD_TAU_H = 30.0
PERF_SD = 0.10         # per-attempt speed performance (x mean)
ACC_SD = 0.012         # per-attempt accuracy noise (absolute)
GUARD_SD = 0.06
COMBAT_RNG_SD = 0.08   # damage-taken noise (which monster hits, crit luck)

# Reference typist the content is AUTHORED against ("Pace 35" in 01 doc),
# drifting up as the population learns.
REF_WPM = [(1, 35.0), (10, 37.0), (20, 39.5), (30, 42.0)]   # (chapter, net WPM)
REF_ACC = [(1, 0.92), (10, 0.925), (30, 0.935)]
REF_GUARD = [(1, 0.60), (10, 0.62), (30, 0.66)]

# ---- Word difficulty by tier (01 doc 5.1) -----------------------------------
# tier: (avg chars per plate, caps share, punct share, numbers/symbols share)
WORD_TIERS = {
    1: (4.2, 0.00, 0.00, 0.00),   # top 500, 3-5 letters
    2: (5.3, 0.00, 0.00, 0.00),   # top 1000
    3: (7.2, 0.00, 0.00, 0.00),   # top 2000, suffixes
    4: (8.5, 0.00, 0.00, 0.00),   # collocations (incl. inner space)
    5: (7.8, 0.12, 0.00, 0.00),   # capitals
    6: (8.0, 0.06, 0.08, 0.00),   # punctuation, contractions
    7: (9.5, 0.06, 0.06, 0.04),   # short sentences + numbers (per-word avg)
    8: (9.0, 0.03, 0.03, 0.00),   # AWL / B2 vocabulary
    9: (9.0, 0.03, 0.05, 0.00),   # idioms
    10: (9.5, 0.06, 0.09, 0.04),  # quotes, symbols ; : " ( )
}
TIER_MIX_CURRENT = 0.75          # 60% current + 15% biome; 25% easier review
LEN_SPEED_PEN = 0.015            # -1.5% speed per char above 4
CAPS_SPEED_PEN = 0.6             # speed penalty per share of caps chars
PUNCT_SPEED_PEN = 1.0
NUM_SPEED_PEN = 1.2
LEN_ACC_PEN = 0.0025
CAPS_ACC_PEN = 0.05
PUNCT_ACC_PEN = 0.12
NUM_ACC_PEN = 0.15

# ---- Combat (01 doc section 2) ------------------------------------------------
COMBAT_TYPING_EFF = 0.82   # reading/target switching: 35 WPM -> ~2.4 chars/s
ATB_FULL = 100.0
WEAPON = dict(name="Sword", char_charge=8.0, word_bonus=10.0, atk_mult=1.0)
PERFECT_ATB_MULT = 1.25
SWIFT_ATB = 5.0
SWIFT_RATE = 0.12          # share of perfect words that are also Swift
COMBO_PER = 0.02
COMBO_CAP = 25
CHIP_NORMAL = 0.15
CHIP_PERFECT = 0.25
BASE_CRIT = 0.05
PERFECT_CRIT_BONUS = 0.15  # Perfect words raise crit roll (accuracy = damage)
CRIT_MULT = 1.5
SKILL_DMG_PER_CHARGE = 0.12  # avg ATK-equivalent per word-charge, both slots
PERFECT_SKILL_CHARGE = 1.5
HERO_ATK0 = 10.0
HERO_HP0 = 100.0
WALK_HEAL = 0.25           # +25% max HP on each scene-break walk
PHASE_HEAL = 0.10          # boss phase-transition pickup
BLOCK_MULT = 0.2           # Block takes 20%; Perfect Parry takes 0
ENEMY_BASE_INTERVAL = 9.0  # Grunt 9s (Brute 12 / Speedster 5 average out)
BOSS_BASE_INTERVAL = 10.0
PACE_REF = 35.0
PACE_EXP = 0.7
PACE_CLAMP = (0.6, 1.8)
HP_PACE_EXP = 0.0          # optional: scale enemy HP by (Pace/35)^x (OFF)
PRESET_INTERVAL_MULT = 1.0 # 01 doc "Story" preset = 1.4 (enemy intervals x1.4); Standard = 1.0
SECOND_WIND_HP = 0.30
PREMIUM_REVIVE_HP = 0.50

# ---- Enemy authoring (par curve) ------------------------------------------------
ENC_TTK_S = 36.0           # ref typist + par gear kills one encounter in ~36s (~10 attacks)
SAW_HP_STEP = 0.02         # +2% HP per level inside a chapter
SAW_ATK_STEP = 0.025       # +2.5% ATK per level inside a chapter
DMG_FRAC = [(1, 0.40), (3, 0.65), (6, 0.85), (10, 0.95), (30, 1.00)]  # ref dmg / HP at L1 of chapter (piecewise-linear)
BOSS_WAVE_ENC = 1          # 1 add wave before the boss arena
BOSS_HP_ENC = 3.2          # boss HP in "encounter units" (3 phases)
BOSS_ADDS_HP_ENC = 0.5     # phase-1 adds
BOSS_ENC_DMG = [(1, 1.4), (3, 2.0), (6, 2.7), (10, 3.0)]  # boss encounter dmg vs a normal encounter, by chapter

BOSS_HIT_MULT = 2.4        # survival mini-boss hit vs grunt hit (story bosses are calibrated via BOSS_ENC_DMG)
DOOM_SPELLS = 2.5
DOOM_DMG = 0.15            # fraction of max HP per failed Doom Spell (<=40% per 01)
# P(fail doom) = clamp(DOOM_FAIL_BASE + DOOM_FAIL_SLOPE*(0.95-acc_eff), lo, hi)
DOOM_FAIL_BASE, DOOM_FAIL_SLOPE, DOOM_FAIL_LO, DOOM_FAIL_HI = 0.06, 2.5, 0.02, 0.45

# ---- Gear ------------------------------------------------------------------------
SLOTS = ["weapon", "armor", "charm"]   # weapon->ATK, armor->HP, charm->sqrt both
TIER_GROWTH = 1.40         # stat multiplier per gear tier
RARITIES = ["C", "U", "R", "E", "L"]
RARITY_NAME = dict(C="Common", U="Uncommon", R="Rare", E="Epic", L="Legendary")
RARITY_MULT = dict(C=1.00, U=1.12, R=1.25, E=1.40, L=1.60)
RARITY_UPG_CAP = dict(C=5, U=7, R=11, E=13, L=15)
UPG_STEP = 0.07            # +7% item stat per upgrade level
SHOP_RARITY_PRICE = dict(C=1.0, U=2.2, R=5.0)     # shop sells C/U/R only
VALUE_RARITY_PRICE = dict(C=1.0, U=2.2, R=5.0, E=8.0, L=12.0)  # for salvage
PRICE_T1 = 1150            # Common T1 item
PRICE_GROWTH = 1.405       # per tier (slightly below GOLD_GROWTH_CH**3 = 1.424, so late tiers stay affordable)
UPG_COST_BASE = 0.25       # +0 -> +1 costs 25% of the tier's Common price
UPG_COST_GROWTH = 1.30
SALVAGE_RATE = 0.25        # replaced gear returns 25% of (price + non-transferred upgrade gold)
UPG_TRANSFER = 0.5         # Upgrade Transfer: new gear inherits floor(50% x old upgrade level)
BOSS_NEXT_TIER_DROP = "C"  # chapter boss first clear drops next chapter's new-tier piece (rarity), or None
DROP_SALVAGE_RATE = 0.10   # unwanted chest gear: 10% of its shop-equivalent value
PAR_RARITY = "U"
PAR_RARITY_BY_CH = {1: "C", 2: "C"}   # starter gear is Common; par becomes Uncommon from ch3
PAR_UPG = {1: 0, 2: 2, 3: 3}   # par upgrade level by chapter (default PAR_UPG_DEFAULT)
PAR_UPG_DEFAULT = 5

# ---- Gold ------------------------------------------------------------------------
GOLD_L1 = 100              # first-clear gold, chapter 1 level 1 (= 1 "Gold Unit")
GOLD_GROWTH_CH = 1.125
GOLD_IN_CH_STEP = 0.03
BOSS_GOLD_MULT = 3.0
REPLAY_GOLD_MULT = 0.40
STALE_REPLAY_MULT = 0.50   # extra x0.5 if the level is >1 chapter behind frontier
SATCHEL_PRICE_GU = 25      # Gold Satchel (cosmetic C/R) priced in Gold Units (5,000 at ~ch7)
SATCHEL_RESERVE_GU = 80    # only bought with gold above this reserve
MIN_POWER_AS_NEEDED = 0.60 # 'as_needed' spenders top up only below this x par
AS_NEEDED_TARGET = 0.70    # ...and stop buying once back at this x par
REPLAY_SOFTCAP_PER_DAY = 40
REPLAY_SOFTCAP_MULT = 0.25
FAIL_GOLD_KEEP = 0.50      # keep 50% of gold collected before failing (01 doc)
STAR_GOLD = 0.20           # first-time bonus per star, x level gold
STAR2_ACC = [(10, 0.90), (20, 0.93), (30, 0.95)]   # absolute gates: Hard mode only (C11)
STAR2_RELATIVE = True      # C11: 2nd star = beat own 7-day median accuracy + 1 pt
STAR2_REL_MARGIN = 0.0        # C11 says +1 pt; +1 pt pushes Average 100% completion to ~80 h (see 02 doc C12)
STAR2_REL_CLAMP = (0.88, 0.97)
STAR3_HP_FRAC = 0.40       # rotating challenge proxy: end with >=40% HP ...
STAR3_PERF = 0.97          # ... and a decent run (perf >= 0.97)
STAR_CHEST = {10: "Iron", 20: "Gold", 30: "Gold"}   # per-chapter star milestones

# Missions (in Gold Units of the player's frontier chapter, see 03 doc 3.2/3.3)
DAILY_GOLD_GU = 4.0        # 4 missions ~1 GU each
WEEKLY_GOLD_GU = 18.0
LOGIN7_GOLD_GU = 3.0       # 7-day calendar gold, per week
DAILY_COMPLETION = 0.85    # share of days dailies fully done (engaged)

# ---- Chests ------------------------------------------------------------------------
CHEST_P_ENCOUNTER = 0.30           # first clear, per normal encounter
CHEST_P_ENCOUNTER_REPLAY = 0.15
CHEST_TIER_NORMAL = dict(Wooden=0.72, Iron=0.24, Gold=0.035, Mythic=0.005)
CHEST_TIER_BOSS = dict(Wooden=0.0, Iron=0.55, Gold=0.38, Mythic=0.07)  # boss always drops 1
BOSS_CHEST_REPLAY_P = 0.5
CHEST = {
    #            gold (GU)  P(gear)  gear rarity table                     gems (first clear only)
    "Wooden": dict(gold=0.5, gear=0.10, rar=dict(C=0.80, U=0.20), gems=0),
    "Iron":   dict(gold=1.0, gear=0.35, rar=dict(C=0.40, U=0.45, R=0.15), gems=0),
    "Gold":   dict(gold=2.5, gear=0.00, rar=dict(U=0.35, R=0.45, E=0.17, L=0.03), gems=5),   # v2: gear -> 1 Gear Cache
    "Mythic": dict(gold=6.0, gear=0.00, rar=dict(R=0.25, E=0.55, L=0.20), gems=20),  # v2: gear -> 2 Gear Caches
}
CHEST_GEAR_TIER_DOWN_P = 0.30      # 30% of chest gear is one tier below frontier

# ---- Gems (03 doc) ------------------------------------------------------------------
GEMS_DAILY_ALL4 = 10
GEMS_LOGIN7_WEEK = 40
GEMS_CAL28_WEEK = 12
GEMS_WEEKLY = 80
FREE_GEM_WEEKLY_CAP = 250
ACHIEVEMENT_GEMS_TOTAL = 600       # one-time, spread over the story
BOSS_FIRST_CLEAR_GEMS = 10         # one-time progression gems (outside cap)
STAR30_CHAPTER_GEMS = 10
REVIVE_GEMS = 30
FEATHERS_PER_WEEK = 2.5            # login day2 + weekly #9 + calendar 2/28d
FEATHER_CAP = 5
SCRIBE_PRICE = 160
SCRIBE_10PULL = 1440
FEATURED_PRICE = 200
GEM_PACKS = [(0.99, 100), (4.99, 550), (9.99, 1200), (19.99, 2500), (49.99, 6500)]
BOX_RATES = dict(C=0.62, R=0.27, E=0.09, L=0.02)
EPIC_PITY = 10
LEG_SOFT_PITY_START = 45
LEG_SOFT_STEP = 0.05
LEG_HARD_PITY = 60
SHARD_FROM_DUPE = dict(C=5, R=20, E=60, L=250)   # 03 doc 1.x
SHARD_CRAFT = dict(C=25, R=100, E=400, L=1600)
DIRECT_SHOP_GEMS = dict(C=80, R=200, E=600, L=1800)
POOL_SIZE = dict(C=20, R=20, E=20, L=20)          # standard pool items per rarity (assumed)
DUPE_RATE_C_R = 0.5                               # mid-collection dupe share for C/R

# ---- Gear Caches (v2, 00-overview 6.2) ---------------------------------------------------
# Level-matched random gear box: random slot, FRONTIER-chapter tier, fixed published odds.
CACHE_ENABLED = True
CACHE_GOLD_GU = 14                 # gold price in Gold Units of the frontier chapter (gold sink)
CACHE_GEM_PRICE = 50               # gem price (story PvE only; ranked uses standardized gear)
CACHE_GEM_DAILY_CAP = 1            # max gem-bought caches per day
CACHE_ODDS = dict(C=0.40, U=0.33, R=0.20, E=0.06, L=0.01)   # fixed, published
CACHE_PITY_RARE = 8                # published guarantee: >=1 Rare+ in every 8 caches
CACHE_PITY_EPIC = 30               # >=1 Epic+ in every 30 caches
CACHE_PITY_LEG = 120               # Legendary by cache 120
CACHE_FROM_WEEKLY = 2              # free caches from the weekly mission set
CACHE_FROM_CHEST = dict(Wooden=0, Iron=0, Gold=1, Mythic=2)
CACHE_FROM_STAR30 = 1              # 30-star chapter milestone
CACHE_GOLD_EFF_BIAS = 1.0          # >1 makes the greedy AI favour caches (thrill premium); 1.0 = pure EV

# ---- Season pass (v2, cosmetic only, 00-overview 6.4) ------------------------------------
SEASON_WEEKS = 8
PASS_PRICE_GEMS = 950
PASS_GEM_RETURN = 50               # premium track pays back ~50 gems total
PASS_TIERS = 40
PASS_XP_PER_TIER = 1500
PASS_XP_PER_WORD = 1               # per correct 5-char word typed (story, survival, trial)
PASS_XP_DAILY_ALL = 400            # all 4 dailies done
PASS_XP_WEEKLY = 1500              # weekly set (8 of 10)
PASS_PREMIUM_ITEMS = dict(C=6, R=6, E=3, L=1)   # cosmetic items on the premium track (+50 gems)
PASS_FREE_ITEMS = dict(C=6, R=2, E=1, L=0)      # free track headline items (+ shards)
PASS_FREE_SHARDS = 300

# ---- Survival (01 doc section 7) -------------------------------------------------------
SURV_HP_BASE = 0.50        # wave-0 monster HP = 0.5 x (story L1 encounter HP / 2)
SURV_ATK_BASE = 0.18       # wave-0 monster hit = 0.18 x story L1 grunt hit
SURV_HP_PER_WAVE = 0.08    # HP x(1+0.08w)
SURV_INTERVAL_PER_WAVE = 0.012
SURV_INTERVAL_FLOOR = 0.55
SURV_ATK_PER_WAVE = 0.02   # proposal: +2% ATK per wave (01 has none -> runs never end for fast typists)
SURV_HEAL = 0.12           # 01 doc says +10%; 12% keeps Beginner runs >15 waves
SURV_TIER_EVERY = 8
SURV_GOLD_GU = 0.12        # gold per wave in GU, with diminishing returns
SURV_GOLD_DECAY = 25.0     # wave w pays GU*0.12/(1+w/25)
SURV_REWARD_WAVE_CAP = 60
SURV_REWARDED_RUNS_PER_DAY = 3
SURV_CHECKPOINTS = [10, 20, 30]
SURV_MC = 400

# =============================================================================
# Helpers
# =============================================================================
def lerp(a, b, t):
    return a + (b - a) * t


def piecewise(points, x):
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return lerp(y0, y1, (x - x0) / (x1 - x0))
    return points[-1][1]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def ch_of(level):
    return (level - 1) // LEVELS_PER_CH + 1


def pos_of(level):
    return (level - 1) % LEVELS_PER_CH + 1


def word_tier(c):
    return min(10, (c - 1) // 3 + 1)


def _tier_profile(t):
    ln, caps, punct, num = WORD_TIERS[t]
    sf = 1 - LEN_SPEED_PEN * (ln - 4) - CAPS_SPEED_PEN * caps - PUNCT_SPEED_PEN * punct - NUM_SPEED_PEN * num
    ad = LEN_ACC_PEN * (ln - 4) + CAPS_ACC_PEN * caps + PUNCT_ACC_PEN * punct + NUM_ACC_PEN * num
    return ln, sf, ad


def word_profile(c):
    """Blend of current tier and review words -> (avg plate len, speed factor, acc penalty)."""
    t = word_tier(c)
    a = _tier_profile(t)
    b = _tier_profile(max(1, t - 2))
    w = TIER_MIX_CURRENT
    return tuple(w * x + (1 - w) * y for x, y in zip(a, b))


_combo_cache = {}


def combo_mean_mult(p_perfect):
    """Stationary mean ComboMult. Perfect word -> combo+1, otherwise combo halves."""
    key = round(p_perfect, 3)
    if key in _combo_cache:
        return _combo_cache[key]
    n = 80
    pi = [0.0] * (n + 1)
    pi[0] = 1.0
    for _ in range(400):
        nxt = [0.0] * (n + 1)
        for k, pr in enumerate(pi):
            if pr == 0:
                continue
            nxt[min(k + 1, n)] += pr * p_perfect
            nxt[k // 2] += pr * (1 - p_perfect)
        pi = nxt
    m = sum(pr * (1 + COMBO_PER * min(k, COMBO_CAP)) for k, pr in enumerate(pi))
    _combo_cache[key] = m
    return m


def typing_combat(wpm_net, acc, c):
    """Return dict of per-ATK damage rate and timing for a typist in chapter c."""
    ln, sf, ad = word_profile(c)
    acc_e = clamp(acc - ad, 0.6, 0.995)
    wpm_e = wpm_net * sf
    ccps = wpm_e * 5 / 60 * COMBAT_TYPING_EFF          # correct chars / s in combat
    t_word = ln / ccps
    p = acc_e ** ln
    cm = combo_mean_mult(p)
    atb = (WEAPON["word_bonus"] + ln * WEAPON["char_charge"] * cm) * (1 + (PERFECT_ATB_MULT - 1) * p) \
        + SWIFT_ATB * SWIFT_RATE * p
    attacks_ps = atb / ATB_FULL / t_word
    crit = BASE_CRIT + PERFECT_CRIT_BONUS * p
    basic = attacks_ps * WEAPON["atk_mult"] * (1 + crit * (CRIT_MULT - 1))
    chip = (CHIP_NORMAL + (CHIP_PERFECT - CHIP_NORMAL) * p) / t_word
    skill = (1 + (PERFECT_SKILL_CHARGE - 1) * p) / t_word * SKILL_DMG_PER_CHARGE
    pace = wpm_e   # in-level net WPM drives enemy intervals (01 doc 1.6)
    ifac = clamp((PACE_REF / max(pace, 1)) ** PACE_EXP, *PACE_CLAMP)
    return dict(dps_per_atk=basic + chip + skill, attacks_ps=attacks_ps, p_perfect=p,
                combo=cm, acc_eff=acc_e, wpm_eff=wpm_e, interval_fac=ifac, pace=pace,
                basic_share=basic / (basic + chip + skill), skill_share=skill / (basic + chip + skill))


def guard_mult(g, acc_e):
    parry = acc_e ** 4
    return 1 - g * (1 - BLOCK_MULT) - g * parry * BLOCK_MULT


# ---- Gear --------------------------------------------------------------------
def slot_tier(slot, c):
    """Tier unlocked for a slot at chapter c. Ch1 all T1; ch4 weapon T2, ch5 armor T2, ch6 charm T2 ..."""
    off = SLOTS.index(slot)
    return max(1, (c - 1 - off) // 3 + 1) if c >= 1 + off else 1


def item_score(tier, rarity, upg):
    return TIER_GROWTH ** (tier - 1) * RARITY_MULT[rarity] * (1 + UPG_STEP * upg)


def tier_price(tier):
    return PRICE_T1 * PRICE_GROWTH ** (tier - 1)


def upg_cost(tier, u):
    return tier_price(tier) * UPG_COST_BASE * UPG_COST_GROWTH ** u


def hero_stats(scores):
    w, a, ch = scores["weapon"], scores["armor"], scores["charm"]
    return HERO_ATK0 * w * math.sqrt(ch), HERO_HP0 * a * math.sqrt(ch)


def par_scores(c):
    u = PAR_UPG.get(c, PAR_UPG_DEFAULT)
    r = PAR_RARITY_BY_CH.get(c, PAR_RARITY)
    return {s: item_score(slot_tier(s, c), r, u) for s in SLOTS}


def par_power(c):
    s = par_scores(c)
    return s["weapon"] * s["armor"] * s["charm"]


# ---- Gold ----------------------------------------------------------------------
def gold_unit(c):
    return GOLD_L1 * GOLD_GROWTH_CH ** (c - 1)


def level_gold(level):
    c, p = ch_of(level), pos_of(level)
    g = gold_unit(c) * (1 + GOLD_IN_CH_STEP * (p - 1))
    return g * (BOSS_GOLD_MULT if p == 10 else 1)


# =============================================================================
# Level authoring
# =============================================================================
def ref_typing(c):
    return piecewise(REF_WPM, c), piecewise(REF_ACC, c), piecewise(REF_GUARD, c)


_level_cache = {}


def level_spec(level):
    """Build encounters for a level, calibrated against the reference typist + par gear."""
    if level in _level_cache:
        return _level_cache[level]
    c, p = ch_of(level), pos_of(level)
    rw, ra, rg = ref_typing(c)
    tc = typing_combat(rw, ra, c)
    atk_par, hp_par = hero_stats(par_scores(c))
    d_ref = tc["dps_per_atk"] * atk_par
    enc_hp = ENC_TTK_S * d_ref
    saw_hp = 1 + SAW_HP_STEP * (p - 1)
    saw_atk = 1 + SAW_ATK_STEP * (p - 1)
    if level <= TWO_ENCOUNTER_LEVELS:
        sizes = ENC_SIZES_EARLY[level % len(ENC_SIZES_EARLY)]
    elif c <= 12:
        sizes = ENC_SIZES_MID[level % len(ENC_SIZES_MID)]
    else:
        sizes = ENC_SIZES_LATE[level % len(ENC_SIZES_LATE)]
    boss = (p == 10)
    if boss:
        sizes = sizes[:BOSS_WAVE_ENC]
    # monsters: (hp, unit_atk, base_interval).  unit atk = 1 now, scaled below.
    encs = []
    for n in sizes:
        encs.append(dict(kind="normal", mons=[[enc_hp * saw_hp / n, 1.0, ENEMY_BASE_INTERVAL] for _ in range(n)]))
    if boss:
        bh = enc_hp * saw_hp * BOSS_HP_ENC
        adds = [[enc_hp * saw_hp * BOSS_ADDS_HP_ENC / 2, 1.0, ENEMY_BASE_INTERVAL] for _ in range(2)]
        encs.append(dict(kind="boss", mons=adds + [[bh, BOSS_HIT_MULT, BOSS_BASE_INTERVAL]]))
    # calibrate the grunt hit per chapter against the *average* composition of this level band
    # (so individual levels keep natural variety: a 4-monster group hurts more than a single brute).
    gm = guard_mult(rg, tc["acc_eff"])
    band = ENC_SIZES_EARLY if level <= TWO_ENCOUNTER_LEVELS else (ENC_SIZES_MID if c <= 12 else ENC_SIZES_LATE)
    unit_level = statistics.mean(
        sum(_enc_damage([[enc_hp / n, 1.0, ENEMY_BASE_INTERVAL] for _ in range(n)], d_ref, tc["interval_fac"], gm)
            for n in pat) for pat in band)
    target = piecewise(DMG_FRAC, c) * hp_par * saw_atk
    hit = target / unit_level
    for e in encs:
        for m in e["mons"]:
            m[1] *= hit
    if boss:
        # calibrate boss hit (superposition: damage is linear in each monster's hit)
        mons = encs[-1]["mons"]
        bh_unit = mons[-1][1]
        mons[-1][1] = 0.0
        d_adds = _enc_damage(mons, d_ref, tc["interval_fac"], gm)
        mons[-1][1] = 1.0
        saved = [m[1] for m in mons[:-1]]
        for m in mons[:-1]:
            m[1] = 0.0
        d_b1 = _enc_damage(mons, d_ref, tc["interval_fac"], gm)
        for m, v in zip(mons[:-1], saved):
            m[1] = v
        norm_enc = hit * saw_hp * unit_level / len(band[0])   # avg normal encounter at this saw step
        target_b = piecewise(BOSS_ENC_DMG, c) * norm_enc
        mons[-1][1] = max(hit * 0.8, (target_b - d_adds) / d_b1)
    spec = dict(level=level, c=c, p=p, boss=boss, encs=encs, enc_hp=enc_hp * saw_hp,
                grunt_hit=hit, par_hp=hp_par, n_monsters=sum(len(e["mons"]) for e in encs))
    _level_cache[level] = spec
    return spec


def _enc_damage(mons, dps, ifac, gm):
    """Expected damage of an encounter with focus fire (kill in listed order)."""
    total, alive = 0.0, list(mons)
    for i, m in enumerate(mons):
        tau = m[0] / dps
        rate = sum(x[1] / (x[2] * ifac) for x in mons[i:]) * gm
        total += rate * tau
    return total


# =============================================================================
# Fight resolution
# =============================================================================
def fight(spec, atk, hp_max, wpm, acc, guard, rng, revives):
    """Resolve one attempt. revives: list of (hp_frac) available in order.
    Returns dict(win, t_typing, hp_frac, enc_cleared, perf, acc_run, revives_used)."""
    c = spec["c"]
    perf = max(0.45, rng.gauss(1.0, PERF_SD))
    acc_run = clamp(acc + rng.gauss(0, ACC_SD), 0.70, 0.995)
    g = clamp(guard + rng.gauss(0, GUARD_SD), 0.0, 0.95)
    tc = typing_combat(wpm * perf, acc_run, c)
    dps = tc["dps_per_atk"] * atk
    if HP_PACE_EXP:
        dps /= clamp((tc["pace"] / PACE_REF) ** HP_PACE_EXP, 0.7, 1.4)
    gm = guard_mult(g, tc["acc_eff"]) * max(0.6, rng.gauss(1.0, COMBAT_RNG_SD))
    ifac = tc["interval_fac"] * PRESET_INTERVAL_MULT
    hp = hp_max
    t = 0.0
    used = []
    revs = list(revives)
    enc_cleared = 0
    for ei, e in enumerate(spec["encs"]):
        if ei > 0:
            hp = min(hp_max, hp + WALK_HEAL * hp_max)
        mons = e["mons"]
        for i, m in enumerate(mons):
            tau = m[0] / dps
            rate = sum(x[1] / (x[2] * ifac) for x in mons[i:]) * gm
            if e["kind"] == "boss" and m is mons[-1]:
                # boss phases: doom spells + phase heals
                pf = clamp(DOOM_FAIL_BASE + DOOM_FAIL_SLOPE * (0.95 - tc["acc_eff"]) + (1 - perf) * 0.5,
                           DOOM_FAIL_LO, DOOM_FAIL_HI)
                fails = sum(1 for _ in range(int(DOOM_SPELLS)) if rng.random() < pf)
                if rng.random() < DOOM_SPELLS - int(DOOM_SPELLS) and rng.random() < pf:
                    fails += 1
                doom = fails * DOOM_DMG * spec["par_hp"]
                heal = 2 * PHASE_HEAL * hp_max
                dmg = rate * tau + doom - heal
            else:
                dmg = rate * tau
            remaining = dmg
            while hp - remaining <= 0:
                if not revs:
                    frac_done = hp / dmg if dmg > 0 else 1
                    t += tau * frac_done
                    return dict(win=False, t_typing=t, hp_frac=0.0, enc_cleared=enc_cleared,
                                perf=perf, acc_run=acc_run, revives_used=used, tc=tc)
                remaining -= hp
                kind, frac = revs.pop(0)
                used.append(kind)
                hp = frac * hp_max
            hp -= remaining
            t += tau
        enc_cleared += 1
    return dict(win=True, t_typing=t, hp_frac=hp / hp_max, enc_cleared=enc_cleared,
                perf=perf, acc_run=acc_run, revives_used=used, tc=tc)


def level_overhead_s(spec):
    n = len(spec["encs"])
    s = LEVEL_INTRO_S + WALK_S * (n - 1) + REWARD_S * n + LEVEL_END_S
    if spec["boss"]:
        s += BOSS_EXTRA_S
    return s


def star2_acc(c):
    for cap, a in STAR2_ACC:
        if c <= cap:
            return a
    return STAR2_ACC[-1][1]


# =============================================================================
# Player journey
# =============================================================================
class Player:
    def __init__(self, name, cfg, rng):
        self.name, self.cfg, self.rng = name, cfg, rng
        self.typing_h = 0.0      # active typing hours (learning clock)
        self.play_s = 0.0        # all in-game seconds
        self.gold = 0.0
        self.gems = 0.0
        self.feathers = 1
        self.cache_pity = dict(R=0, E=0, L=0)
        self.cache_free = 0
        self.words = 0.0
        self.gear = {s: dict(tier=1, rar="C", upg=0, invested=tier_price(1) * 0.0) for s in SLOTS}
        self.frontier = 1
        self.stars = {}
        self.day = 0
        self.week = 0
        self.week_gems = 0.0
        self.replays_today = 0
        self.log = defaultdict(lambda: defaultdict(float))
        self.ach_paid = 0.0

    # --- skill ---
    def wpm(self):
        c = self.cfg
        return c["wpm_cap"] - (c["wpm_cap"] - c["wpm0"]) * math.exp(-self.typing_h / LEARN_TAU_H)

    def acc(self):
        c = self.cfg
        return c["acc_cap"] - (c["acc_cap"] - c["acc0"]) * math.exp(-self.typing_h / ACC_TAU_H)

    def guard(self):
        c = self.cfg
        return c["guard_cap"] - (c["guard_cap"] - c["guard0"]) * math.exp(-self.typing_h / GUARD_TAU_H)

    # --- gear ---
    def scores(self):
        return {s: item_score(g["tier"], g["rar"], g["upg"]) for s, g in self.gear.items()}

    def power(self):
        s = self.scores()
        return s["weapon"] * s["armor"] * s["charm"]

    def stats(self):
        return hero_stats(self.scores())

    def chapter(self):
        return ch_of(min(self.frontier, 300))

    def add_gold(self, amt, src):
        self.gold += amt
        self.log[self.chapter()]["in_" + src] += amt

    def spend(self, amt, what):
        self.gold -= amt
        self.log[self.chapter()]["out_" + what] += amt

    def add_gems(self, amt, src, capped=True):
        if capped:
            room = max(0.0, FREE_GEM_WEEKLY_CAP - self.week_gems)
            amt = min(amt, room)
            self.week_gems += amt
        self.gems += amt
        self.log[self.chapter()]["gems_" + src] += amt

    def salvage_value(self, g):
        return SALVAGE_RATE * (tier_price(g["tier"]) * VALUE_RARITY_PRICE[g["rar"]] + g["invested"] * (1 - UPG_TRANSFER))

    @staticmethod
    def inherit(g, rar):
        """Upgrade Transfer: a new item inherits floor(UPG_TRANSFER x old level), capped by its rarity."""
        return min(RARITY_UPG_CAP[rar], int(UPG_TRANSFER * g["upg"]))

    def shop(self, force=False):
        """Greedy shopper with bundle look-ahead: candidate = buy item + k upgrades.
        policy 'greedy' spends whenever useful; 'as_needed' only after a loss or when
        power falls below MIN_POWER_AS_NEEDED x par (fast typists skipping tiers)."""
        c = self.chapter()
        if self.cfg.get("spend", "greedy") == "as_needed" and not force:
            if self.power() >= MIN_POWER_AS_NEEDED * par_power(c):
                return
        while True:
            best, best_eff = None, 0.0
            for s in SLOTS:
                g = self.gear[s]
                cur = item_score(g["tier"], g["rar"], g["upg"])
                if g["upg"] < RARITY_UPG_CAP[g["rar"]]:
                    cost = upg_cost(g["tier"], g["upg"])
                    if cost <= self.gold:
                        eff = math.log((1 + UPG_STEP * (g["upg"] + 1)) / (1 + UPG_STEP * g["upg"])) / cost
                        if eff > best_eff:
                            best, best_eff = ("upg", s, cost), eff
                t = slot_tier(s, c)
                sv = self.salvage_value(g)
                for r, pm in SHOP_RARITY_PRICE.items():
                    price = tier_price(t) * pm
                    if price > self.gold:
                        continue
                    ucost = 0.0
                    u0 = self.inherit(g, r)
                    for u in range(u0, RARITY_UPG_CAP[r] + 1):
                        if u > u0:
                            ucost += upg_cost(t, u - 1)
                        if price + ucost > self.gold:
                            break
                        new = item_score(t, r, u)
                        if new <= cur * 1.02:
                            continue
                        eff = math.log(new / cur) / max(price + ucost - sv, 1)
                        if eff > best_eff:
                            best, best_eff = ("buy", s, (t, r, price, u)), eff
            if CACHE_ENABLED:
                price = CACHE_GOLD_GU * gold_unit(c)
                if price <= self.gold:
                    gain, salv = self.cache_ev()
                    eff = CACHE_GOLD_EFF_BIAS * gain / max(price - salv, 1)
                    if eff > best_eff:
                        best, best_eff = ("cache", None, price), eff
            if not best:
                break
            if self.cfg.get("spend", "greedy") == "as_needed" and self.power() >= AS_NEEDED_TARGET * par_power(c):
                break
            if best[0] == "cache":
                self.spend(best[2], "caches")
                self.open_cache("gold")
                continue
            if best[0] == "upg":
                _, s, cost = best
                self.spend(cost, "upgrades")
                self.gear[s]["upg"] += 1
                self.gear[s]["invested"] += cost
            else:
                _, s, (t, r, price, u) = best
                u0 = self.inherit(self.gear[s], r)
                self.add_gold(self.salvage_value(self.gear[s]), "salvage")
                self.spend(price, "items")
                self.gear[s] = dict(tier=t, rar=r, upg=u0, invested=0.0)
                self.log[c]["buys"] += 1
                for k in range(u0, u):
                    cost = upg_cost(t, k)
                    self.spend(cost, "upgrades")
                    self.gear[s]["upg"] += 1
                    self.gear[s]["invested"] += cost
        # cosmetic gold sink (Gold Satchel, 03 doc) with excess gold
        reserve = SATCHEL_RESERVE_GU * gold_unit(c)
        price = SATCHEL_PRICE_GU * gold_unit(c)
        while self.gold - price > reserve:
            self.spend(price, "satchels")

    def roll_cache_rarity(self):
        """Fixed published odds + published pity guarantees (counters, never hidden rate changes)."""
        p = self.cache_pity
        for k in p:
            p[k] += 1
        if p["L"] >= CACHE_PITY_LEG:
            r = "L"
        elif p["E"] >= CACHE_PITY_EPIC:
            r = _pick(self.rng, {k: v for k, v in CACHE_ODDS.items() if k in ("E", "L")})
        elif p["R"] >= CACHE_PITY_RARE:
            r = _pick(self.rng, {k: v for k, v in CACHE_ODDS.items() if k in ("R", "E", "L")})
        else:
            r = _pick(self.rng, CACHE_ODDS)
        if r in ("R", "E", "L"):
            p["R"] = 0
        if r in ("E", "L"):
            p["E"] = 0
        if r == "L":
            p["L"] = 0
        return r

    def open_cache(self, source):
        c = self.chapter()
        slot = self.rng.choice(SLOTS)
        t = slot_tier(slot, c)
        r = self.roll_cache_rarity()
        lg = self.log[c]
        lg["cache_" + source] += 1
        lg["cache_r_" + r] += 1
        before = self.gear[slot]["tier"], self.gear[slot]["rar"], self.gear[slot]["upg"]
        self.receive_gear(slot, t, r, counted="cache_equips")
        if (self.gear[slot]["tier"], self.gear[slot]["rar"], self.gear[slot]["upg"]) != before:
            lg["cache_upgrade_hits"] += 1

    def cache_ev(self):
        """Expected log-power gain and expected salvage gold of one cache at the frontier."""
        c = self.chapter()
        gain, salv = 0.0, 0.0
        for s in SLOTS:
            g = self.gear[s]
            cur = item_score(g["tier"], g["rar"], g["upg"])
            t = slot_tier(s, c)
            for r, pr in CACHE_ODDS.items():
                u0 = self.inherit(g, r)
                new = item_score(t, r, u0)
                if new > cur:
                    gain += pr / 3 * math.log(new / cur)
                    salv += pr / 3 * self.salvage_value(g)
                else:
                    salv += pr / 3 * DROP_SALVAGE_RATE * tier_price(t) * VALUE_RARITY_PRICE[r]
        return gain, salv

    def receive_gear(self, slot, tier, rar, counted="chest_equips"):
        g = self.gear[slot]
        u0 = self.inherit(g, rar)
        new = dict(tier=tier, rar=rar, upg=u0, invested=0.0)
        if item_score(tier, rar, u0) > item_score(g["tier"], g["rar"], g["upg"]):
            self.add_gold(self.salvage_value(g), "salvage")
            self.gear[slot] = new
            self.log[self.chapter()][counted] += 1
        else:
            self.add_gold(DROP_SALVAGE_RATE * tier_price(tier) * VALUE_RARITY_PRICE[rar], "salvage")

    def roll_chest(self, kind, level, first):
        rng = self.rng
        spec = CHEST[kind]
        c = ch_of(level)
        self.add_gold(spec["gold"] * gold_unit(c), "chests")
        self.log[self.chapter()]["chest_" + kind] += 1
        if first and spec["gems"]:
            self.add_gems(spec["gems"], "chests", capped=False)
        if CACHE_ENABLED:
            for _ in range(CACHE_FROM_CHEST[kind]):
                self.open_cache("chest")
        if rng.random() < spec["gear"]:
            slot = rng.choice(SLOTS)
            t = slot_tier(slot, c)
            if rng.random() < CHEST_GEAR_TIER_DOWN_P:
                t = max(1, t - 1)
            r = _pick(rng, spec["rar"])
            self.log[self.chapter()]["gear_" + r] += 1
            self.receive_gear(slot, t, r)

    def tick_time(self, secs):
        before_day = int(self.play_s / 3600 / self.cfg["hours_per_day"])
        self.play_s += secs
        after_day = int(self.play_s / 3600 / self.cfg["hours_per_day"])
        for d in range(before_day + 1, after_day + 1):
            self.new_day(d)

    def new_day(self, d):
        c = self.chapter()
        self.replays_today = 0
        if self.rng.random() < DAILY_COMPLETION:
            self.add_gold(DAILY_GOLD_GU * gold_unit(c), "missions")
            self.add_gems(GEMS_DAILY_ALL4, "dailies")
        if d % 7 == 0:
            self.week_gems = 0.0
            self.add_gold((WEEKLY_GOLD_GU + LOGIN7_GOLD_GU) * gold_unit(c), "missions")
            self.add_gems(GEMS_WEEKLY + GEMS_LOGIN7_WEEK + GEMS_CAL28_WEEK, "weeklies")
            if CACHE_ENABLED:
                for _ in range(CACHE_FROM_WEEKLY):
                    self.open_cache("mission")
        n_gem = min(self.cfg.get("gem_caches_per_day", 0), CACHE_GEM_DAILY_CAP)
        n_gem = int(n_gem) + (1 if self.rng.random() < n_gem - int(n_gem) else 0)
        if CACHE_ENABLED and n_gem:
            for _ in range(n_gem):
                self.log[c]["gems_spent_caches"] += CACHE_GEM_PRICE
                self.open_cache("gems")
            self.shop()
        if self.rng.random() < FEATHERS_PER_WEEK / 7:
            self.feathers = min(FEATHER_CAP, self.feathers + 1)
        self.log[c]["days"] += 1

    def attempt(self, level, replay):
        spec = level_spec(level)
        atk, hp = self.stats()
        c = spec["c"]
        revs = [("second_wind", SECOND_WIND_HP)]
        # Second Wind: type a sentence in 8s; success depends on accuracy
        sw_ok = self.rng.random() < clamp(0.55 + 4.0 * (self.acc() - 0.86), 0.4, 0.97)
        if not sw_ok:
            revs = []
        pol = self.cfg["revive_policy"]
        if not replay and pol == "boss" and spec["boss"] and self.feathers > 0:
            revs.append(("feather", PREMIUM_REVIVE_HP))
        if not replay and pol == "paid_all":
            revs.append(("gem", PREMIUM_REVIVE_HP))
        r = fight(spec, atk, hp, self.wpm(), self.acc(), self.guard(), self.rng, revs)
        if "feather" in r["revives_used"]:
            self.feathers -= 1
        if "gem" in r["revives_used"]:
            self.log[self.chapter()]["gem_revives"] += 1
        secs = r["t_typing"] + level_overhead_s(spec) + MENU_S_PER_LEVEL + (0 if replay else JOURNAL_S_PER_LEVEL)
        if not r["win"]:
            secs = r["t_typing"] + LEVEL_INTRO_S + WALK_S * r["enc_cleared"] + 10 + MENU_S_PER_LEVEL
        self.typing_h += r["t_typing"] / 3600
        self.tick_time(secs)
        lg = self.log[self.chapter()]
        lg["attempts"] += 1
        lg["secs"] += secs
        lg["typing_secs"] += r["t_typing"]
        lg["words"] += r["t_typing"] / 60 * r["tc"]["wpm_eff"] * COMBAT_TYPING_EFF
        # gold
        base = level_gold(level)
        n_enc = len(spec["encs"])
        if replay:
            mult = REPLAY_GOLD_MULT * (STALE_REPLAY_MULT if ch_of(level) < self.chapter() - 1 else 1)
            if self.replays_today >= REPLAY_SOFTCAP_PER_DAY:
                mult *= REPLAY_SOFTCAP_MULT
            self.replays_today += 1
        else:
            mult = 1.0
        if r["win"]:
            self.add_gold(base * mult, "levels")
        else:
            self.add_gold(base * mult * FAIL_GOLD_KEEP * r["enc_cleared"] / n_enc, "levels")
        # chests per cleared encounter
        p_chest = CHEST_P_ENCOUNTER_REPLAY if replay else CHEST_P_ENCOUNTER
        for ei in range(r["enc_cleared"]):
            e = spec["encs"][ei]
            if e["kind"] == "boss":
                if not replay or self.rng.random() < BOSS_CHEST_REPLAY_P:
                    self.roll_chest(_pick(self.rng, CHEST_TIER_BOSS), level, not replay)
            elif self.rng.random() < p_chest:
                self.roll_chest(_pick(self.rng, CHEST_TIER_NORMAL), level, not replay)
        if r["win"]:
            st = self.stars.setdefault(level, set())
            new = {1}
            if STAR2_RELATIVE:
                thr = clamp(self.acc() - word_profile(c)[2] + STAR2_REL_MARGIN, *STAR2_REL_CLAMP)
                ok2 = r["tc"]["acc_eff"] >= thr
            else:
                ok2 = r["acc_run"] - word_profile(c)[2] >= star2_acc(c)
            if ok2:
                new.add(2)
            if r["hp_frac"] >= STAR3_HP_FRAC and r["perf"] >= STAR3_PERF:
                new.add(3)
            if not replay:
                lg["first_wins"] += 1
                lg["star3_first"] += 1 if 3 in new else 0
                lg["star2_first"] += 1 if 2 in new else 0
            if spec["boss"]:
                lg["boss_win_secs"] += secs
                lg["boss_wins"] += 1
            gained = new - st
            if gained:
                self.add_gold(STAR_GOLD * len(gained) * base, "stars")
                before = self.chapter_stars(c)
                st |= new
                after = self.chapter_stars(c)
                for ms, kind in STAR_CHEST.items():
                    if before < ms <= after:
                        self.roll_chest(kind, level, True)
                        if ms == 30:
                            self.add_gems(STAR30_CHAPTER_GEMS, "progress", capped=False)
                            if CACHE_ENABLED:
                                for _ in range(CACHE_FROM_STAR30):
                                    self.open_cache("stars")
            lg["win_secs"] += secs
            lg["wins"] += 1
            lg["hp_left"] += r["hp_frac"]
        lg["dps_sum"] += r["tc"]["dps_per_atk"] * atk
        lg["wpm_eff_sum"] += r["tc"]["wpm_eff"]
        return r

    def chapter_stars(self, c):
        return sum(len(self.stars.get(l, ())) for l in range((c - 1) * 10 + 1, c * 10 + 1))


def _pick(rng, table):
    x = rng.random() * sum(table.values())
    for k, v in table.items():
        x -= v
        if x <= 0:
            return k
    return k


GRIND_AFTER_FAILS = 2
GRIND_RUNS_MAX = 4
WALL_ATTEMPTS = 40


def run_journey(name, cfg, seed):
    rng = random.Random(seed)
    pl = Player(name, cfg, rng)
    ach_per_level = ACHIEVEMENT_GEMS_TOTAL / 300
    per_level = {}
    walls = 0
    while pl.frontier <= 300:
        L = pl.frontier
        c = ch_of(L)
        lg = pl.log[c]
        if pos_of(L) == 1 and "power_ratio" not in lg:
            lg["power_ratio"] = pl.power() / par_power(c)
            lg["wpm_start"] = pl.wpm()
            lg["acc_start"] = pl.acc()
            lg["gold_start"] = pl.gold
            lg["gear_tiers"] = "/".join(str(pl.gear[s]["tier"]) for s in SLOTS)
            lg["gear_upg"] = statistics.mean(pl.gear[s]["upg"] for s in SLOTS)
            lg["gear_rar"] = "".join(pl.gear[s]["rar"] for s in SLOTS)
            lg["hours_start"] = pl.play_s / 3600
            pl.tick_time(STORY_SCENE_S_PER_CH)
            lg["secs"] += STORY_SCENE_S_PER_CH
        fails = 0
        tries = 0
        first = True
        while True:
            r = pl.attempt(L, replay=False)
            tries += 1
            if first:
                lg["first_try_wins"] += 1 if r["win"] else 0
                if pos_of(L) == 10:
                    lg["boss_first_try"] += 1 if r["win"] else 0
                first = False
            pl.shop(force=not r["win"])
            if r["win"]:
                break
            fails += 1
            if fails >= GRIND_AFTER_FAILS:
                # grind: replay the most valuable cleared level (missing stars first)
                for _ in range(GRIND_RUNS_MAX):
                    cand = [l for l in range(max(1, L - 10), L) if len(pl.stars.get(l, ())) < 3]
                    tgt = cand[-1] if cand else L - 1
                    if tgt < 1:
                        break
                    gold_before = pl.gold
                    rr = pl.attempt(tgt, replay=True)
                    lg["grind_runs"] += 1
                    p_before = pl.power()
                    pl.shop()
                    if pl.power() > p_before * 1.0001:
                        break
                fails = 0
            if tries > WALL_ATTEMPTS:
                walls += 1
                break
        lg["level_attempts"] += tries
        if pos_of(L) == 10:
            pl.add_gems(BOSS_FIRST_CLEAR_GEMS, "progress", capped=False)
            if BOSS_NEXT_TIER_DROP and c < CHAPTERS:
                slot = SLOTS[c % 3]          # the slot whose tier unlocks in chapter c+1
                t = slot_tier(slot, c + 1)
                if t > pl.gear[slot]["tier"]:
                    pl.receive_gear(slot, t, BOSS_NEXT_TIER_DROP)
                    pl.log[c]["boss_drops"] += 1
        pl.add_gems(ach_per_level, "achievements", capped=False)
        per_level[L] = tries
        pl.frontier += 1
    return pl, per_level, walls


# =============================================================================
# Aggregation & reports
# =============================================================================
def fmt(x, d=0):
    if isinstance(x, str):
        return x
    if abs(x) >= 1e6:
        return f"{x/1e6:.2f}M"
    if abs(x) >= 1e4:
        return f"{x/1e3:.1f}k"
    return f"{x:,.{d}f}"


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(x) for x in r) + " |")
    return "\n".join(out)


def simulate_all():
    results = {}
    for i, (name, cfg) in enumerate(PERSONAS.items()):
        runs = [run_journey(name, cfg, SEED + 1000 * i + k) for k in range(N_RUNS)]
        results[name] = runs
    return results


def chapter_agg(runs, c, key):
    return statistics.mean(r[0].log[c].get(key, 0.0) for r in runs)


def report(results):
    out = []
    P = out.append

    # ---------- Parameters snapshot
    P("## A. Word difficulty by chapter (effect on effective WPM)\n")
    rows = []
    for c in [1, 3, 4, 7, 10, 13, 16, 19, 22, 25, 28, 30]:
        ln, sf, ad = word_profile(c)
        rows.append([c, word_tier(c), f"{ln:.1f}", f"{sf:.2f}", f"-{ad*100:.1f} pt",
                     f"{40*sf:.0f}"])
    P(table(["Ch", "Word tier", "Avg plate chars", "Speed factor", "Accuracy delta",
             "40-WPM typist -> eff. WPM"], rows))

    # ---------- Combat reference
    P("\n## B. Combat model reference (Sword, on-curve gear)\n")
    rows = []
    for name, cfg in PERSONAS.items():
        for c in [1, 15, 30]:
            tc = typing_combat(cfg["wpm0"], cfg["acc0"], c)
            rows.append([name + " (start skill)", c, f"{tc['wpm_eff']:.0f}", f"{tc['acc_eff']*100:.1f}%",
                         f"{tc['p_perfect']*100:.0f}%", f"{tc['combo']:.2f}",
                         f"{1/tc['attacks_ps']:.1f}s", f"{tc['dps_per_atk']:.2f}",
                         f"{tc['basic_share']*100:.0f}%", f"{tc['skill_share']*100:.0f}%", f"{tc['interval_fac']:.2f}"])
    rw, ra, rg = ref_typing(1)
    tc = typing_combat(rw, ra, 1)
    rows.append(["Reference (Pace 35, 92%)", 1, f"{tc['wpm_eff']:.0f}", f"{tc['acc_eff']*100:.1f}%",
                 f"{tc['p_perfect']*100:.0f}%", f"{tc['combo']:.2f}", f"{1/tc['attacks_ps']:.1f}s",
                 f"{tc['dps_per_atk']:.2f}", f"{tc['basic_share']*100:.0f}%", f"{tc['skill_share']*100:.0f}%", f"{tc['interval_fac']:.2f}"])
    P(table(["Typist", "Ch", "Eff WPM", "Eff acc", "Perfect words", "Avg ComboMult", "Auto-attack every",
             "DPS per 1 ATK", "Auto-attack share", "Skill share", "Enemy interval x"], rows))

    # ---------- Enemy curve
    P("\n## C. Enemy / par curve per chapter\n")
    rows = []
    for c in range(1, 31):
        s1 = level_spec((c - 1) * 10 + 1)
        s9 = level_spec((c - 1) * 10 + 9)
        sb = level_spec(c * 10)
        atk, hp = hero_stats(par_scores(c))
        boss_hp = sb["encs"][-1]["mons"][-1][0]
        par = f"T{slot_tier('weapon', c)}/{slot_tier('armor', c)}/{slot_tier('charm', c)} {PAR_RARITY_BY_CH.get(c, PAR_RARITY)}+{PAR_UPG.get(c, PAR_UPG_DEFAULT)}"
        rows.append([c, par, fmt(atk), fmt(hp), fmt(s1["enc_hp"]), fmt(s9["enc_hp"]), fmt(boss_hp),
                     fmt(s1["grunt_hit"], 1), fmt(s9["grunt_hit"], 1), fmt(sb["encs"][-1]["mons"][-1][1], 1)])
    P(table(["Ch", "Par gear (W/A/C tier)", "Par ATK", "Par HP", "Enc HP L1", "Enc HP L9", "Boss HP",
             "Grunt hit L1", "Grunt hit L9", "Boss hit"], rows))

    # ---------- Per-persona chapter summary
    summary = {}
    for name, runs in results.items():
        P(f"\n## D. Per-chapter summary: {name} ({N_RUNS} simulated journeys, means)\n")
        rows = []
        cum_h = 0.0
        tot = defaultdict(float)
        for c in range(1, 31):
            g = lambda k: chapter_agg(runs, c, k)
            attempts = g("attempts")
            wins = g("wins")
            secs = g("secs")
            cum_h += secs / 3600
            gin = sum(statistics.mean(r[0].log[c].get(k, 0) for r in runs)
                      for k in ["in_levels", "in_chests", "in_stars", "in_missions", "in_salvage"])
            gout = g("out_items") + g("out_upgrades") + g("out_caches")
            gsat = g("out_satchels")
            tot["in"] += gin
            tot["out"] += gout
            dps = g("dps_sum") / max(attempts, 1)
            ft = g("first_try_wins") / 10
            boss = g("boss_first_try")
            tl = g("win_secs") / max(wins, 1) / 60
            act = (g("win_secs") / max(wins, 1) - MENU_S_PER_LEVEL) / 60
            pr = g("power_ratio")
            tiers = statistics.mode(r[0].log[c]["gear_tiers"] for r in runs)
            upg = g("gear_upg")
            rows.append([c, f"{g('wpm_start'):.0f}/{g('acc_start')*100:.0f}%", fmt(dps), f"{ft*100:.0f}%",
                         f"{boss*100:.0f}%", f"{g('level_attempts')/10:.2f}", f"{g('grind_runs'):.1f}",
                         f"{g('buys') + g('chest_equips') + g('cache_equips'):.1f}",
                         f"{act:.1f}", f"{secs/3600:.2f}", f"{cum_h:.1f}", fmt(gin), fmt(gout), fmt(gsat),
                         fmt(statistics.mean(r[0].log[c+1]['gold_start'] if c < 30 else r[0].gold for r in runs)),
                         f"T{tiers} +{upg:.1f}", f"{pr:.2f}"])
        P(table(["Ch", "WPM/acc (start)", "Hero DPS", "1st-try clear", "Boss 1st-try", "Attempts/lvl",
                 "Grind runs", "New gear pieces", "Min/level (active)", "Hours", "Cum. hours", "Gold in", "Gold out (gear+caches)", "Satchel sink",
                 "Gold bank (end)", "Gear W/A/C +avg", "Power vs par"], rows))
        hours = [r[0].play_s / 3600 for r in runs]
        typing_h = [r[0].typing_h for r in runs]
        walls = sum(r[2] for r in runs)
        summary[name] = dict(
            hours=statistics.mean(hours), hours_p10=sorted(hours)[len(hours) // 10],
            hours_p90=sorted(hours)[(len(hours) * 9) // 10], typing_h=statistics.mean(typing_h),
            first_try=statistics.mean(sum(r[0].log[c]["first_try_wins"] for c in range(1, 31)) / 300 for r in runs),
            boss_first=statistics.mean(sum(r[0].log[c]["boss_first_try"] for c in range(1, 31)) / 30 for r in runs),
            attempts=statistics.mean(sum(r[1].values()) for r in runs),
            grind=statistics.mean(sum(r[0].log[c]["grind_runs"] for c in range(1, 31)) for r in runs),
            end_wpm=statistics.mean(r[0].wpm() for r in runs), end_acc=statistics.mean(r[0].acc() for r in runs),
            gold_in=tot["in"], gold_out=tot["out"], walls=walls,
            end_gold=statistics.mean(r[0].gold for r in runs),
            gems=statistics.mean(r[0].gems for r in runs),
            days=statistics.mean(r[0].play_s / 3600 / r[0].cfg["hours_per_day"] for r in runs),
            power_end=statistics.mean(r[0].power() / par_power(30) for r in runs),
            min_level=statistics.mean(sum(r[0].log[c]["win_secs"] for c in range(1, 31)) /
                                      max(1, sum(r[0].log[c]["wins"] for c in range(1, 31))) for r in runs) / 60,
            hardest=_hardest(runs),
            boss_min=statistics.mean(sum(r[0].log[c]["boss_win_secs"] for c in range(1, 31)) /
                                     max(1, sum(r[0].log[c]["boss_wins"] for c in range(1, 31))) for r in runs) / 60,
            stars=statistics.mean(sum(len(v) for v in r[0].stars.values()) for r in runs),
            extra_star_h=statistics.mean(_extra_star_hours(r[0]) for r in runs),
        )
    return out, summary


def _extra_star_hours(pl):
    """Estimated extra hours to reach 900/900 stars with end-of-story skill."""
    fw = sum(pl.log[c]["first_wins"] for c in range(1, 31))
    r2 = max(0.05, sum(pl.log[c]["star2_first"] for c in range(1, 31)) / fw)
    r3 = max(0.05, sum(pl.log[c]["star3_first"] for c in range(1, 31)) / fw)
    m2 = sum(1 for L in range(1, 301) if 2 not in pl.stars.get(L, ()))
    m3 = sum(1 for L in range(1, 301) if 3 not in pl.stars.get(L, ()))
    attempts = max(m2 / r2, m3 / r3)
    secs = sum(pl.log[c]["win_secs"] for c in range(1, 31)) / max(1, sum(pl.log[c]["wins"] for c in range(1, 31)))
    return attempts * secs / 3600


def _hardest(runs):
    agg = defaultdict(float)
    for r in runs:
        for L, t in r[1].items():
            agg[L] += t
    top = sorted(agg.items(), key=lambda kv: -kv[1])[:5]
    return [(L, v / len(runs)) for L, v in top]


def combined_table(results):
    """One row per chapter: enemy curve, per-persona DPS / time / clear rate, Average gold flow."""
    names = list(PERSONAS)
    rows = []
    for c in range(1, 31):
        s1, s9, sb = level_spec((c - 1) * 10 + 1), level_spec((c - 1) * 10 + 9), level_spec(c * 10)
        par = (f"T{slot_tier('weapon', c)}/{slot_tier('armor', c)}/{slot_tier('charm', c)} "
               f"{PAR_RARITY_BY_CH.get(c, PAR_RARITY)}+{PAR_UPG.get(c, PAR_UPG_DEFAULT)}")
        dps, mins, ft, bt, hrs = [], [], [], [], []
        for n in names:
            runs = results[n]
            g = lambda k: chapter_agg(runs, c, k)
            dps.append(fmt(g("dps_sum") / max(g("attempts"), 1)))
            mins.append(f"{(g('win_secs') / max(g('wins'), 1) - MENU_S_PER_LEVEL - JOURNAL_S_PER_LEVEL) / 60:.1f}")
            ft.append(f"{g('first_try_wins') * 10:.0f}")
            bt.append(f"{g('boss_first_try') * 100:.0f}")
            hrs.append(f"{g('secs') / 3600:.1f}")
        ra = results["Average"]
        ga = lambda k: chapter_agg(ra, c, k)
        gin = sum(ga(k) for k in ["in_levels", "in_chests", "in_stars", "in_missions"])
        sal = ga("in_salvage")
        gout = ga("out_items") + ga("out_upgrades") + ga("out_caches") - sal
        rows.append([c, word_tier(c), par, f"{fmt(s1['enc_hp'])}-{fmt(s9['enc_hp'])}",
                     fmt(sb["encs"][-1]["mons"][-1][0]), " / ".join(dps), " / ".join(mins), " / ".join(ft),
                     " / ".join(bt), " / ".join(hrs), fmt(gin), fmt(gout), f"{ga('power_ratio'):.2f}"])
    return table(["Ch", "Words", "Recommended gear (par)", "Encounter HP L1-L9", "Boss HP",
                  "Hero DPS B / A / F", "Active min/level B / A / F", "1st-try % B / A / F",
                  "Boss 1st-try % B / A / F", "Hours B / A / F", "Avg: gold earned", "Avg: net gear+cache spend",
                  "Avg: power vs par"], rows)


def gold_sources(results):
    rows = []
    for name, runs in results.items():
        keys = ["in_levels", "in_stars", "in_chests", "in_missions", "in_salvage"]
        tot = {k: statistics.mean(sum(r[0].log[c].get(k, 0) for c in range(1, 31)) for r in runs) for k in keys}
        s = sum(tot.values())
        outs = {k: statistics.mean(sum(r[0].log[c].get(k, 0) for c in range(1, 31)) for r in runs)
                for k in ["out_items", "out_upgrades", "out_caches", "out_satchels"]}
        rows.append([name, fmt(s)] + [f"{tot[k]/s*100:.0f}%" for k in keys] +
                    [fmt(outs["out_items"]), fmt(outs["out_upgrades"]), fmt(outs["out_caches"]), fmt(outs["out_satchels"]),
                     f"{(outs['out_items']+outs['out_upgrades']+outs['out_caches'])/s*100:.0f}%"])
    return table(["Persona", "Total gold in", "Levels", "Stars", "Chests", "Missions", "Salvage",
                  "Spent items", "Spent upgrades", "Spent Gear Caches", "Satchel sink", "Gear spend / earned"], rows)


def cache_stats(results):
    rows = []
    srcs = ["gold", "chest", "mission", "stars", "gems"]
    for name, runs in results.items():
        tot = lambda k: statistics.mean(sum(r[0].log[c].get(k, 0) for c in range(1, 31)) for r in runs)
        n = {s_: tot("cache_" + s_) for s_ in srcs}
        allc = max(sum(n.values()), 1e-9)
        rar = {k: tot("cache_r_" + k) for k in RARITIES}
        hits = tot("cache_upgrade_hits")
        gold_in = sum(tot(k) for k in ["in_levels", "in_stars", "in_chests", "in_missions"])
        spent = tot("out_caches")
        gear_sp = tot("out_items") + tot("out_upgrades") + spent
        rows.append([name] + [f"{n[s_]:.0f}" for s_ in srcs] + [f"{allc:.0f}"] +
                    [f"{rar[k]:.1f}" for k in RARITIES] + [f"{hits/allc*100:.0f}%", fmt(spent),
                    f"{spent/max(gear_sp,1)*100:.0f}%"])
    return table(["Persona", "Bought w/ gold", "From chests", "From weeklies", "From 30-star", "Bought w/ gems",
                  "Total caches"] + [RARITY_NAME[k] for k in RARITIES] +
                 ["Cache improved gear", "Gold spent on caches", "Share of gear gold"], rows)


def chest_stats(results):
    rows = []
    for name, runs in results.items():
        cnt = {k: statistics.mean(sum(r[0].log[c].get("chest_" + k, 0) for c in range(1, 31)) for r in runs)
               for k in CHEST}
        rar = {k: statistics.mean(sum(r[0].log[c].get("gear_" + k, 0) for c in range(1, 31)) for r in runs)
               for k in RARITIES}
        eq = statistics.mean(sum(r[0].log[c].get("chest_equips", 0) for c in range(1, 31)) for r in runs)
        buys = statistics.mean(sum(r[0].log[c].get("buys", 0) for c in range(1, 31)) for r in runs)
        rows.append([name] + [f"{cnt[k]:.0f}" for k in CHEST] + [f"{rar[k]:.1f}" for k in RARITIES] +
                    [f"{eq:.1f}", f"{buys:.1f}"])
    return table(["Persona"] + [f"{k} chests" for k in CHEST] + [f"{RARITY_NAME[k]} drops" for k in RARITIES] +
                 ["Chest gear equipped", "Shop purchases"], rows)


# ---- Clear-rate-at-par calibration table ----
def calibration_table():
    rng = random.Random(SEED + 3)
    rows = []
    typists = [("Ref", None)] + [(n, c) for n, c in PERSONAS.items()]
    for c in [1, 5, 10, 15, 20, 25, 30]:
        row = [c]
        for nm, cfg in typists:
            if cfg is None:
                w, a, g = ref_typing(c)
            else:
                w, a, g = cfg["wpm0"], cfg["acc0"], cfg["guard0"]
            atk, hp = hero_stats(par_scores(c))
            cells = []
            for p in (1, 9, 10):
                spec = level_spec((c - 1) * 10 + p)
                n = 300
                wins = 0
                for _ in range(n):
                    revs = [("second_wind", SECOND_WIND_HP)] if rng.random() < clamp(0.55 + 4.0 * (a - 0.86), 0.4, 0.97) else []
                    wins += fight(spec, atk, hp, w, a, g, rng, revs)["win"]
                cells.append(f"{wins/n*100:.0f}")
            row.append("/".join(cells))
        rows.append(row)
    return table(["Ch"] + ["Reference typist" , "Beginner (start skill)", "Average (start skill)", "Fast (start skill)"], rows)


# ---- Gold per level & mission conversion ----
def gold_level_table():
    rows = []
    for c in [1, 5, 10, 15, 20, 25, 30]:
        gu = gold_unit(c)
        l1 = level_gold((c - 1) * 10 + 1)
        l9 = level_gold((c - 1) * 10 + 9)
        lb = level_gold(c * 10)
        rows.append([c, fmt(gu), fmt(l1), fmt(l9), fmt(lb), fmt(l1 * REPLAY_GOLD_MULT),
                     fmt(l1 * REPLAY_GOLD_MULT * STALE_REPLAY_MULT), fmt(3 * STAR_GOLD * l1),
                     fmt(DAILY_GOLD_GU * gu / 4), fmt(WEEKLY_GOLD_GU * gu), fmt(SATCHEL_PRICE_GU * gu)])
    return table(["Ch", "Gold Unit", "L1 first clear", "L9 first clear", "Boss first clear", "Replay (frontier)",
                  "Replay (>1 ch old)", "3-star bonus (once)", "Per daily mission", "Weekly missions total",
                  "Gold Satchel price"], rows)


# ---- Price table ----
def price_table():
    rows = []
    for t in range(1, 11):
        c_unlock = 1 if t == 1 else 3 * (t - 1) + 1
        up5 = sum(upg_cost(t, u) for u in range(5))
        up9 = sum(upg_cost(t, u) for u in range(9))
        up12 = sum(upg_cost(t, u) for u in range(12))
        rows.append([f"T{t}", f"ch{c_unlock}-{c_unlock+2}", fmt(tier_price(t)), fmt(tier_price(t) * 2.2),
                     fmt(tier_price(t) * 5), fmt(upg_cost(t, 0)), fmt(upg_cost(t, 4)), fmt(up5), fmt(up9), fmt(up12),
                     f"{TIER_GROWTH**(t-1):.2f}", fmt(gold_unit(c_unlock))])
    return table(["Tier", "Weapon/Armor/Charm unlock", "Common", "Uncommon", "Rare", "+0->+1", "+4->+5",
                  "Sum to +5", "Sum to +9", "Sum to +12", "Base stat x", "Gold Unit (lvl gold) at unlock"], rows)


# ---- Survival ----
def survival_run(atk, hp_max, wpm, acc, guard, c, rng):
    """Return (wave reached (last cleared), seconds)."""
    base = level_spec((c - 1) * 10 + 1)
    enc_hp = base["enc_hp"] * SURV_HP_BASE
    hit = base["grunt_hit"] * SURV_ATK_BASE
    hp = hp_max
    t = 0.0
    run_perf = rng.gauss(1.0, 0.06)
    sw = True
    w = 0
    while w < 400:
        w += 1
        tier_c = min(30, 1 + 3 * ((w - 1) // SURV_TIER_EVERY))
        perf = max(0.5, run_perf * rng.gauss(1.0, 0.07))
        tc = typing_combat(wpm * perf, clamp(acc + rng.gauss(0, ACC_SD), 0.7, 0.995), tier_c)
        dps = tc["dps_per_atk"] * atk
        gm = guard_mult(clamp(guard + rng.gauss(0, GUARD_SD), 0, 0.95), tc["acc_eff"])
        n = min(5, 2 + w // 10)
        mhp = enc_hp * (1 + SURV_HP_PER_WAVE * w) / 2
        mhit = hit * (1 + SURV_ATK_PER_WAVE * w)
        ifac = tc["interval_fac"] * max(SURV_INTERVAL_FLOOR, 1 - SURV_INTERVAL_PER_WAVE * w)
        mons = [[mhp, mhit, ENEMY_BASE_INTERVAL] for _ in range(n)]
        if w % 10 == 0:
            mons.append([mhp * 4, mhit * BOSS_HIT_MULT, BOSS_BASE_INTERVAL])
        for i, m in enumerate(mons):
            tau = m[0] / dps
            rate = sum(x[1] / (x[2] * ifac) for x in mons[i:]) * gm
            hp -= rate * tau
            t += tau
            if hp <= 0:
                if sw and rng.random() < 0.85:
                    sw = False
                    hp = SECOND_WIND_HP * hp_max
                else:
                    return w - 1, t
        hp = min(hp_max, hp + SURV_HEAL * hp_max)
        t += 4
    return w, t


def surv_gold(wave, c):
    w = min(wave, SURV_REWARD_WAVE_CAP)
    return sum(SURV_GOLD_GU * gold_unit(c) / (1 + i / SURV_GOLD_DECAY) for i in range(1, w + 1))


def survival_report(results):
    rows = []
    rng = random.Random(SEED + 99)
    surv_summary = {}
    for name, cfg in PERSONAS.items():
        runs = results[name]
        for cp in SURV_CHECKPOINTS:
            # snapshot skill at the hours this persona reached chapter cp, gear = par (ranked kit) and own (avg ratio)
            h = statistics.mean(r[0].log[cp].get("hours_start", 0) for r in runs)
            ty = h * 0.62
            wpm = cfg["wpm_cap"] - (cfg["wpm_cap"] - cfg["wpm0"]) * math.exp(-ty / LEARN_TAU_H)
            acc = cfg["acc_cap"] - (cfg["acc_cap"] - cfg["acc0"]) * math.exp(-ty / ACC_TAU_H)
            gd = cfg["guard_cap"] - (cfg["guard_cap"] - cfg["guard0"]) * math.exp(-ty / GUARD_TAU_H)
            pr = statistics.mean(r[0].log[cp].get("power_ratio", 1) for r in runs)
            atk, hp = hero_stats(par_scores(cp))
            s = pr ** (1 / 2)
            waves_par, waves_own, times = [], [], []
            for _ in range(SURV_MC):
                w1, t1 = survival_run(atk, hp, wpm, acc, gd, cp, rng)
                w2, t2 = survival_run(atk * s, hp * s, wpm, acc, gd, cp, rng)
                waves_par.append(w1)
                waves_own.append(w2)
                times.append(t2)
            wo = statistics.mean(waves_own)
            tm = statistics.mean(times) / 60
            gold = statistics.mean(surv_gold(w, cp) for w in waves_own)
            gpm = gold / max(tm + 0.5, 0.1)
            story_gpm = statistics.mean(
                (r[0].log[cp]["in_levels"] + r[0].log[cp]["in_chests"] + r[0].log[cp]["in_stars"]) /
                (r[0].log[cp]["secs"] / 60) for r in runs)
            rows.append([name, cp, f"{wpm:.0f}", f"{statistics.mean(waves_par):.1f}",
                         f"{sorted(waves_par)[len(waves_par)//10]}-{sorted(waves_par)[(len(waves_par)*9)//10]}",
                         f"{wo:.1f}", f"{tm:.1f}", fmt(gold), fmt(gpm), fmt(story_gpm),
                         fmt(story_gpm * REPLAY_GOLD_MULT * 0.75)])
            surv_summary[(name, cp)] = (statistics.mean(waves_par), wo, gpm, story_gpm)
    return table(["Persona", "Frontier ch", "WPM then", "Mean wave (ranked kit = par gear)", "P10-P90 wave",
                  "Mean wave (own gear)", "Run minutes", "Gold/run (rewarded)", "Survival gold/min",
                  "Story progress gold/min (levels+chests+stars)", "Story replay gold/min (approx)"], rows), surv_summary


# ---- Lootbox ----
def lootbox_sim(n_pulls=600000, seed=SEED + 7):
    rng = random.Random(seed)
    since_epic = since_leg = 0
    counts = defaultdict(int)
    leg_gaps = []
    for _ in range(n_pulls):
        since_epic += 1
        since_leg += 1
        pl = BOX_RATES["L"]
        if since_leg >= LEG_SOFT_PITY_START:
            pl += LEG_SOFT_STEP * (since_leg - LEG_SOFT_PITY_START + 1)
        if since_leg >= LEG_HARD_PITY:
            pl = 1.0
        x = rng.random()
        if x < pl:
            r = "L"
        elif since_epic >= EPIC_PITY:
            r = "E"
        else:
            y = rng.random() * (1 - BOX_RATES["L"])
            if y < BOX_RATES["E"]:
                r = "E"
            elif y < BOX_RATES["E"] + BOX_RATES["R"]:
                r = "R"
            else:
                r = "C"
        counts[r] += 1
        if r in ("E", "L"):
            since_epic = 0
        if r == "L":
            leg_gaps.append(since_leg)
            since_leg = 0
    rates = {k: counts[k] / n_pulls for k in RARITIES if k in counts or k in BOX_RATES}
    mean_gap = statistics.mean(leg_gaps)
    return rates, mean_gap, leg_gaps


def gem_report(summary):
    rates, gap, gaps = lootbox_sim()
    out = []
    rows = [[RARITY_NAME[k], f"{BOX_RATES.get(k,0)*100:.1f}%", f"{rates.get(k,0)*100:.2f}%"] for k in ["C", "R", "E", "L"]]
    out.append(table(["Rarity", "Published base", "Effective incl. pity (600k-pull sim)"], rows))
    p50 = sorted(gaps)[len(gaps) // 2]
    p90 = sorted(gaps)[(len(gaps) * 9) // 10]
    usd_per_gem = 9.99 / 1200
    out.append(f"\n- Pulls per Legendary: mean **{gap:.1f}**, median {p50}, P90 {p90} (hard pity {LEG_HARD_PITY}).")
    out.append(f"- Gems per (any) Legendary: {gap*SCRIBE_PRICE:,.0f} single pulls "
               f"(~${gap*SCRIBE_PRICE*usd_per_gem:,.0f} at the $9.99 pack rate).")
    # EV per box in shards (new items valued at craft cost, dupes at shard value)
    ev_craft = sum(rates[k] * SHARD_CRAFT[k] for k in ["C", "R", "E", "L"])
    ev_dupe = sum(rates[k] * SHARD_FROM_DUPE[k] for k in ["C", "R", "E", "L"])
    ev_mid = sum(rates[k] * (SHARD_CRAFT[k] * (1 - DUPE_RATE_C_R) + SHARD_FROM_DUPE[k] * DUPE_RATE_C_R
                             if k in ("C", "R") else SHARD_CRAFT[k]) for k in ["C", "R", "E", "L"])
    ev_shop = sum(rates[k] * DIRECT_SHOP_GEMS[k] for k in ["C", "R", "E", "L"])
    out.append(f"- EV per 160-gem pull, valued at direct-shop gem prices: **{ev_shop:.0f} gems** "
               f"({ev_shop/SCRIBE_PRICE*100:.0f}% of price) for a player who still needs everything; "
               f"craft-value {ev_craft:.0f} shards (new items) / {ev_mid:.0f} shards (mid-collection, 50% C/R dupes) / "
               f"{ev_dupe:.0f} shards if everything is a dupe.")
    spec_leg = (POOL_SIZE["L"] + 1) / 2 * gap * SCRIBE_PRICE
    out.append(f"- Expected gems for a *specific* Legendary via boxes (pool of {POOL_SIZE['L']} Legendaries, "
               f"no-dupe rule): ~{spec_leg:,.0f} gems vs direct shop {DIRECT_SHOP_GEMS['L']} -> direct shop is "
               f"{DIRECT_SHOP_GEMS['L']/spec_leg*100:.0f}% of the box cost (03 doc claims 60-70%; see flag).")
    out.append(f"- Expected gems per *any* Legendary via boxes: {gap*SCRIBE_PRICE:,.0f}; direct shop Legendary "
               f"{DIRECT_SHOP_GEMS['L']} = {DIRECT_SHOP_GEMS['L']/(gap*SCRIBE_PRICE)*100:.0f}% of that.")
    # Packs
    rows = []
    for usd, gems in GEM_PACKS:
        rows.append([f"${usd}", f"{gems:,}", f"{gems/usd:.0f}", f"{gems/SCRIBE_PRICE:.1f}",
                     f"{gems/REVIVE_GEMS:.0f}"])
    out.append("\n" + table(["Pack", "Gems", "Gems per $", "Scribe pulls", "Revives"], rows))
    # F2P monthly
    weekly = GEMS_DAILY_ALL4 * 7 * DAILY_COMPLETION + GEMS_WEEKLY + GEMS_LOGIN7_WEEK + GEMS_CAL28_WEEK
    weekly = min(weekly, FREE_GEM_WEEKLY_CAP)
    typical = 135
    rows = []
    for label, wk in [("Fully engaged F2P", weekly), ("Typical retained F2P (03 doc)", typical)]:
        m = wk * 52 / 12
        rows.append([label, f"{wk:.0f}", f"{m:.0f}", f"{m/SCRIBE_PRICE:.1f}", f"{SCRIBE_PRICE*gap/m:.1f}",
                     f"{DIRECT_SHOP_GEMS['L']/m:.1f}", f"${m*usd_per_gem:.2f}"])
    out.append("\n" + table(["Player", "Free gems/week", "Gems/month", "Scribe pulls/month",
                             "Months per Legendary (boxes)", "Months per direct-shop Legendary",
                             "Monthly value at $9.99 rate"], rows))
    # story one-time gems
    rows = []
    for name, s in summary.items():
        rows.append([name, f"{s['days']:.0f}", fmt(s['gems'])])
    out.append("\n" + table(["Persona", "Days to finish story", "Gems banked at story end (all sources, no spending)"], rows))
    return "\n".join(out), dict(rates=rates, gap=gap, ev_shop=ev_shop, weekly=weekly)


# ---- Skill-only wall check ----
def wall_check():
    """Beginner who NEVER improves (20 WPM / 88% / guard .40): minimum gear to reach a 50% win
    rate on L9 and the boss of each chapter, vs the best gear obtainable (Rare +9 shop, Epic +12 chest)."""
    rows = []
    rng = random.Random(SEED + 5)
    cfg = PERSONAS["Beginner"]
    for c in [1, 5, 10, 15, 20, 25, 30]:
        res = []
        for lvl in [(c - 1) * 10 + 9, c * 10]:
            spec = level_spec(lvl)
            found = None
            for rar in ["C", "U", "R", "E"]:
                for u in range(0, RARITY_UPG_CAP[rar] + 1):
                    sc = {s: item_score(slot_tier(s, c), rar, u) for s in SLOTS}
                    atk, hp = hero_stats(sc)
                    wins = sum(fight(spec, atk, hp, cfg["wpm0"], cfg["acc0"], cfg["guard0"], rng,
                                     [("second_wind", SECOND_WIND_HP)] if rng.random() < 0.65 else [])["win"]
                               for _ in range(150))
                    if wins / 150 >= 0.5:
                        found = (rar, u)
                        break
                if found:
                    break
            res.append(f"{RARITY_NAME[found[0]]} +{found[1]}" if found else "NOT REACHABLE")
        rows.append([c, f"{RARITY_NAME[PAR_RARITY_BY_CH.get(c, PAR_RARITY)]} +{PAR_UPG.get(c, PAR_UPG_DEFAULT)}"] + res)
    return table(["Ch", "Par gear", "Frozen Beginner needs (L9, 50% win)", "Frozen Beginner needs (boss, 50% win)"], rows)


# ---- Exploit / gold-per-minute table ----
def exploit_report(results):
    rows = []
    rng = random.Random(SEED + 11)
    c = 15
    for name, cfg in list(PERSONAS.items()) + [("BOT 200 WPM / 100%", dict(wpm0=200, acc0=0.995, guard0=0.95))]:
        sc = par_scores(c)
        atk, hp = hero_stats(sc)
        def gpm(level, mult):
            spec = level_spec(level)
            ts = []
            for _ in range(200):
                r = fight(spec, atk, hp, cfg["wpm0"] if name.startswith("BOT") else cfg["wpm0"] * 1.15,
                          cfg["acc0"], cfg["guard0"], rng, [])
                ts.append(r["t_typing"] + level_overhead_s(spec) + (5 if name.startswith("BOT") else MENU_S_PER_LEVEL))
            return level_gold(level) * mult / (statistics.mean(ts) / 60)
        cur = (c - 1) * 10 + 5
        old = (c - 6) * 10 + 5
        first = gpm(cur, 1 + 3 * STAR_GOLD)
        rep = gpm(cur, REPLAY_GOLD_MULT)
        rep_old = gpm(old, REPLAY_GOLD_MULT * STALE_REPLAY_MULT)
        daily_cap_gold = REPLAY_SOFTCAP_PER_DAY * level_gold(cur) * REPLAY_GOLD_MULT
        rows.append([name, fmt(first), fmt(rep), fmt(rep_old), fmt(daily_cap_gold),
                     f"{daily_cap_gold / (tier_price(slot_tier('weapon', c))):.1f}"])
    # AFK
    spec = level_spec(145)
    atk, hp = hero_stats(par_scores(15))
    rate = sum(m[1] / m[2] for m in spec["encs"][0]["mons"])
    afk_s = hp / rate
    return table(["Player (ch15, par gear)", "First clear + 3 stars gold/min", "Replay same chapter gold/min",
                  "Replay 5 ch old gold/min", "Max replay gold/day before soft cap",
                  "= current-tier Common items/day"], rows), afk_s


def p2w_check(results):
    """Average persona that buys a 30-gem revive on EVERY level where it would die."""
    cfg = dict(PERSONAS["Average"], revive_policy="paid_all")
    runs = [run_journey("Average+paid", cfg, SEED + 5000 + k) for k in range(N_RUNS)]
    base = results["Average"]
    def m(rs, f):
        return statistics.mean(f(r) for r in rs)
    hrs_b = m(base, lambda r: r[0].play_s / 3600)
    hrs_p = m(runs, lambda r: r[0].play_s / 3600)
    att_b = m(base, lambda r: sum(r[1].values()))
    att_p = m(runs, lambda r: sum(r[1].values()))
    rev = m(runs, lambda r: sum(r[0].log[c]["gem_revives"] for c in range(1, 31)))
    ft_b = m(base, lambda r: sum(r[0].log[c]["first_try_wins"] for c in range(1, 31)) / 300)
    ft_p = m(runs, lambda r: sum(r[0].log[c]["first_try_wins"] for c in range(1, 31)) / 300)
    usd = rev * REVIVE_GEMS * 9.99 / 1200
    rows = [["Average F2P (feathers on bosses)", f"{hrs_b:.1f}", f"{att_b:.0f}", f"{ft_b*100:.1f}%", "0", "$0"],
            ["Average, gem revive on every failing level", f"{hrs_p:.1f}", f"{att_p:.0f}", f"{ft_p*100:.1f}%",
             f"{rev:.0f}", f"${usd:.0f}"]]
    return table(["Scenario", "Story hours", "Story attempts", "1st-try clear", "Gem revives used", "USD equiv."], rows)


def preset_check(results):
    """Beginner on the 01-doc 'Story' preset (enemy intervals x1.4)."""
    global PRESET_INTERVAL_MULT
    PRESET_INTERVAL_MULT = 1.4
    runs = [run_journey("Beginner-Story", PERSONAS["Beginner"], SEED + 7000 + k) for k in range(N_RUNS)]
    PRESET_INTERVAL_MULT = 1.0
    rows = []
    for label, rs in [("Beginner, Standard", results["Beginner"]), ("Beginner, Story preset (intervals x1.4)", runs),
                      ("Average, Standard", results["Average"])]:
        rows.append([label, f"{statistics.mean(r[0].play_s/3600 for r in rs):.1f}",
                     f"{statistics.mean(sum(r[0].log[c]['first_try_wins'] for c in range(1, 31))/300 for r in rs)*100:.0f}%",
                     f"{statistics.mean(sum(r[0].log[c]['boss_first_try'] for c in range(1, 31))/30 for r in rs)*100:.0f}%",
                     f"{statistics.mean(sum(r[0].log[c]['grind_runs'] for c in range(1, 31)) for r in rs):.0f}"])
    return table(["Scenario", "Story hours", "1st-try clear", "Boss 1st-try", "Grind replays"], rows)


def _summ(rs):
    m = statistics.mean
    return dict(h=m(r[0].play_s / 3600 for r in rs),
                ft=m(sum(r[0].log[c]["first_try_wins"] for c in range(1, 31)) / 300 for r in rs),
                bt=m(sum(r[0].log[c]["boss_first_try"] for c in range(1, 31)) / 30 for r in rs),
                grind=m(sum(r[0].log[c]["grind_runs"] for c in range(1, 31)) for r in rs),
                gems=m(sum(r[0].log[c]["gems_spent_caches"] for c in range(1, 31)) for r in rs),
                days=m(r[0].play_s / 3600 / r[0].cfg["hours_per_day"] for r in rs),
                pw=m(r[0].log[c].get("power_ratio", 0) for r in rs for c in range(10, 31)))


def gem_cache_check(results):
    """Hours saved by buying Gear Caches with gems (story PvE only)."""
    usd_per_gem = 9.99 / 1200
    weekly_free = min(GEMS_DAILY_ALL4 * 7 * DAILY_COMPLETION + GEMS_WEEKLY + GEMS_LOGIN7_WEEK + GEMS_CAL28_WEEK,
                      FREE_GEM_WEEKLY_CAP)
    f2p_rate = weekly_free / 7 / CACHE_GEM_PRICE
    rows = []
    scen = [(n, CACHE_GEM_DAILY_CAP, f"{n}: buys the daily cap ({CACHE_GEM_DAILY_CAP}/day) with paid gems")
            for n in PERSONAS] + \
           [("Beginner", f2p_rate, f"Beginner: F2P, spends ALL free gems on caches ({f2p_rate:.2f}/day)"),
            ("Average", f2p_rate, f"Average: F2P, spends ALL free gems on caches ({f2p_rate:.2f}/day)")]
    for k, (n, rate, label) in enumerate(scen):
        cfg = dict(PERSONAS[n], gem_caches_per_day=rate)
        rs = [run_journey(n, cfg, SEED + 9000 + 100 * k + i) for i in range(N_RUNS)]
        b, x = _summ(results[n]), _summ(rs)
        paid = rate >= 1
        usd = x["gems"] * usd_per_gem if paid else 0.0
        per_month = usd / max(x["days"], 1) * 30.4
        rows.append([label, f"{b['h']:.1f}", f"{x['h']:.1f}", f"-{b['h']-x['h']:.1f} h ({(b['h']-x['h'])/b['h']*100:.0f}%)",
                     f"{b['ft']*100:.0f}% -> {x['ft']*100:.0f}%", f"{b['bt']*100:.0f}% -> {x['bt']*100:.0f}%",
                     f"{b['grind']:.0f} -> {x['grind']:.0f}", f"{x['gems']:,.0f}", f"${usd:,.0f}" if paid else "$0 (free gems)",
                     f"${per_month:,.0f}" if paid else "-"])
    return table(["Scenario", "Story h (no gem caches)", "Story h (with)", "Saved", "1st-try", "Boss 1st-try",
                  "Grind replays", "Gems spent on caches", "USD over story", "USD per month"], rows)


def cache_bias_check(results):
    """Players who overbuy caches for the thrill (greedy AI weights cache EV x bias)."""
    global CACHE_GOLD_EFF_BIAS
    rows = []
    b = _summ(results["Average"])
    rows.append(["Average, pure EV shopper (baseline)", f"{b['h']:.1f}", f"{b['ft']*100:.0f}%", f"{b['bt']*100:.0f}%",
                 f"{b['pw']:.2f}", f"{statistics.mean(sum(r[0].log[c]['cache_gold'] for c in range(1, 31)) for r in results['Average']):.0f}"])
    for bias in (2.0, 4.0):
        CACHE_GOLD_EFF_BIAS = bias
        rs = [run_journey("Average", PERSONAS["Average"], SEED + 9900 + int(bias * 10) + i) for i in range(N_RUNS)]
        CACHE_GOLD_EFF_BIAS = 1.0
        x = _summ(rs)
        rows.append([f"Average, cache-lover (cache EV weighted x{bias:.0f})", f"{x['h']:.1f}", f"{x['ft']*100:.0f}%",
                     f"{x['bt']*100:.0f}%", f"{x['pw']:.2f}",
                     f"{statistics.mean(sum(r[0].log[c]['cache_gold'] for c in range(1, 31)) for r in rs):.0f}"])
    return table(["Scenario", "Story hours", "1st-try", "Boss 1st-try", "Power vs par (ch10-30 start)",
                  "Caches bought with gold"], rows)


def cache_odds_table():
    rng = random.Random(SEED + 77)
    pl = Player("x", PERSONAS["Average"], rng)
    n = 200000
    cnt = defaultdict(int)
    gaps, since = [], 0
    for _ in range(n):
        r = pl.roll_cache_rarity()
        cnt[r] += 1
        since += 1
        if r == "L":
            gaps.append(since)
            since = 0
    rows = [[RARITY_NAME[k], f"{CACHE_ODDS[k]*100:.1f}%", f"{cnt[k]/n*100:.2f}%",
             f"{RARITY_MULT[k]:.2f}", f"{RARITY_UPG_CAP[k]}"] for k in RARITIES]
    t = table(["Rarity", "Published odds", "Effective incl. pity (200k sim)", "Stat mult", "Upgrade cap"], rows)
    return t + (f"\n\n- Rare+ guaranteed within {CACHE_PITY_RARE}, Epic+ within {CACHE_PITY_EPIC}, Legendary by "
                f"{CACHE_PITY_LEG}. Mean caches per Legendary: {statistics.mean(gaps):.0f}.\n"
                f"- Price: {CACHE_GOLD_GU} GU gold (e.g. {fmt(CACHE_GOLD_GU*gold_unit(10))} at ch10, "
                f"{fmt(CACHE_GOLD_GU*gold_unit(30))} at ch30) or {CACHE_GEM_PRICE} gems "
                f"(~${CACHE_GEM_PRICE*9.99/1200:.2f}), gem purchases capped at {CACHE_GEM_DAILY_CAP}/day.")


def season_pass_report(results):
    usd_per_gem = 9.99 / 1200
    rows = []
    need = PASS_TIERS * PASS_XP_PER_TIER
    for n, runs in results.items():
        words = statistics.mean(sum(r[0].log[c]["words"] for c in range(1, 31)) for r in runs)
        days = statistics.mean(r[0].play_s / 3600 / r[0].cfg["hours_per_day"] for r in runs)
        wpd = words / days
        xpd = wpd * PASS_XP_PER_WORD + PASS_XP_DAILY_ALL * DAILY_COMPLETION + PASS_XP_WEEKLY / 7
        rows.append([n, f"{PERSONAS[n]['hours_per_day']*60:.0f}", f"{wpd:,.0f}", f"{xpd:,.0f}",
                     f"{need/xpd:.0f}", f"{min(PASS_TIERS, xpd*SEASON_WEEKS*7/PASS_XP_PER_TIER):.0f}/{PASS_TIERS}",
                     f"{(PASS_XP_DAILY_ALL*DAILY_COMPLETION + PASS_XP_WEEKLY/7)/xpd*100:.0f}%"])
    t1 = table(["Persona", "Min/day", "Words typed/day", "Pass XP/day", "Days to finish 40 tiers",
                "Tiers in an 8-week season", "XP share from missions"], rows)
    prem_val = sum(PASS_PREMIUM_ITEMS[k] * DIRECT_SHOP_GEMS[k] for k in PASS_PREMIUM_ITEMS)
    weekly = min(GEMS_DAILY_ALL4 * 7 * DAILY_COMPLETION + GEMS_WEEKLY + GEMS_LOGIN7_WEEK + GEMS_CAL28_WEEK,
                 FREE_GEM_WEEKLY_CAP)
    rows = []
    for label, wk in [("Fully engaged F2P", weekly), ("Typical retained F2P", 135.0)]:
        season = wk * SEASON_WEEKS
        left = season - PASS_PRICE_GEMS + PASS_GEM_RETURN
        rows.append([label, f"{season:,.0f}", f"{PASS_PRICE_GEMS} - {PASS_GEM_RETURN} back",
                     f"{left:,.0f}", f"{max(left,0)/SCRIBE_PRICE:.1f}", f"{season/SCRIBE_PRICE:.1f}"])
    t2 = table(["Player", "Free gems per 8-week season", "Pass cost (net)", "Left after pass",
                "Scribe pulls left", "Scribe pulls if no pass"], rows)
    return t1, t2, prem_val, PASS_PRICE_GEMS * usd_per_gem


def learning_table():
    rows = []
    for h in [0, 5, 10, 20, 30, 50]:
        row = [h]
        for n, c in PERSONAS.items():
            w = c["wpm_cap"] - (c["wpm_cap"] - c["wpm0"]) * math.exp(-h / LEARN_TAU_H)
            a = c["acc_cap"] - (c["acc_cap"] - c["acc0"]) * math.exp(-h / ACC_TAU_H)
            row.append(f"{w:.0f} / {a*100:.1f}%")
        rows.append(row)
    return table(["Active typing hours"] + list(PERSONAS), rows)


def main():
    results = simulate_all()
    out, summary = report(results)
    print("# Simulation output (generated by economy_sim.py)\n")
    print(f"Runs per persona: {N_RUNS}, seed {SEED}\n")
    print("## 0. Headline\n")
    rows = []
    for name, s in summary.items():
        rows.append([name, f"{s['hours']:.1f}", f"{s['hours_p10']:.0f}-{s['hours_p90']:.0f}", f"{s['typing_h']:.1f}",
                     f"{s['days']:.0f}", f"{s['min_level']:.1f}", f"{s['first_try']*100:.0f}%",
                     f"{s['boss_first']*100:.0f}%", f"{s['attempts']:.0f}", f"{s['grind']:.0f}",
                     f"{s['end_wpm']:.0f}/{s['end_acc']*100:.1f}%", f"{s['power_end']:.2f}", s["walls"],
                     f"{s['boss_min']:.1f}", f"{s['stars']:.0f}/900", f"{s['extra_star_h']:.0f}"])
    print(table(["Persona", "Story hours", "P10-P90", "Active typing h", "Days", "Min/level (win, incl. menus)",
                 "1st-try clear", "Boss 1st-try", "Story attempts", "Grind replays", "End WPM/acc",
                 "End power vs par", "Hard walls (>40 tries)", "Boss level min", "Stars at story end",
                 "Extra h to 900 stars"], rows))
    print("\nHardest levels (mean attempts):")
    for name, s in summary.items():
        print(f"- {name}: " + ", ".join(f"L{L} ({v:.1f})" for L, v in s["hardest"]))
    print()
    print("\n## S. Combined per-chapter summary (B = Beginner, A = Average, F = Fast)\n")
    print(combined_table(results))
    print()
    print("\n".join(out))
    print("\n## C2. Win % with exactly par gear (L1 / L9 / Boss), Second Wind included, no feathers\n")
    print(calibration_table())
    print("\n## E. Gold sources & sinks over the whole story\n")
    print(gold_sources(results))
    print("\n## F. Chests opened & gear found over the story\n")
    print(chest_stats(results))
    print("\n## F3. Gear Caches opened over the story\n")
    print(cache_stats(results))
    print("\n## F4. Gear Cache odds, pity and price\n")
    print(cache_odds_table())
    print("\n## F5. Do cache-lovers break the curve? (overbuying caches with gold)\n")
    print(cache_bias_check(results))
    print("\n## F2. Gold per level and mission gold (scaled by Gold Unit of the frontier chapter)\n")
    print(gold_level_table())
    print("\n## G. Shop price list\n")
    print(price_table())
    print("\n## H. Skill-only wall check (Beginner who never improves)\n")
    print(wall_check())
    print("\n## I. Survival mode\n")
    st, _ = survival_report(results)
    print(st)
    print("\n## J. Gems & lootboxes\n")
    gr, _ = gem_report(summary)
    print(gr)
    print("\n## J2. Pay-to-win check: paid revives\n")
    print(p2w_check(results))
    print("\n## J4. Gem-bought Gear Caches: story speed-up check\n")
    print(gem_cache_check(results))
    print("\n## J5. Season pass (cosmetic only)\n")
    t1, t2, pv, usd = season_pass_report(results)
    print(t1)
    print()
    print(t2)
    rates, gap, _ = lootbox_sim(300000, seed=SEED + 8)
    ev_shop = sum(rates[k] * DIRECT_SHOP_GEMS[k] for k in ["C", "R", "E", "L"])
    print(f"\n- Premium track: {sum(PASS_PREMIUM_ITEMS.values())} cosmetics worth {pv:,} gems at direct-shop prices "
          f"+ {PASS_GEM_RETURN} gems, for {PASS_PRICE_GEMS} gems (~${usd:.2f}): {pv/PASS_PRICE_GEMS:.1f}x value. "
          f"The same {PASS_PRICE_GEMS} gems in Scribe pulls = {PASS_PRICE_GEMS/SCRIBE_PRICE:.1f} pulls, EV "
          f"{PASS_PRICE_GEMS/SCRIBE_PRICE*ev_shop:,.0f} gems of shop value ({PASS_PRICE_GEMS/SCRIBE_PRICE*ev_shop/PASS_PRICE_GEMS:.1f}x).")
    print("\n## J3. Difficulty preset check\n")
    print(preset_check(results))
    print("\n## L. Learning curve (net WPM / accuracy vs active typing hours)\n")
    print(learning_table())
    print("\n## K. Farming / exploit check (chapter 15)\n")
    et, afk = exploit_report(results)
    print(et)
    print(f"\nAFK: an idle hero at ch15 (par gear, no guards) dies in ~{afk:.0f}s of encounter 1 and earns 0 gold "
          "(gauge only fills on correct keys).")


if __name__ == "__main__":
    main()

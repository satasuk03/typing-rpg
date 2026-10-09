#!/usr/bin/env python3
"""Dumps economy_sim.py constants and reference points to packages/sim/tests/fixtures/economy-reference.json.

The sim tests compare BALANCE and every ported formula against this file, so the TypeScript port is checked against
the Python source of truth without needing Python at test time. Regenerate only when economy_sim.py changes:

    python3 -I packages/sim/scripts/dump-economy-reference.py
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SIM_DIR = os.path.normpath(os.path.join(HERE, "../../../docs/brainstorm/sim"))
OUT = os.path.normpath(os.path.join(HERE, "../tests/fixtures/economy-reference.json"))
sys.path.insert(0, SIM_DIR)
sys.argv = [sys.argv[0]]
import economy_sim as E  # noqa: E402


def jsonable(v):
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    raise TypeError(type(v))


constants = {}
for name in dir(E):
    if not name.isupper() or name.startswith("_"):
        continue
    try:
        constants[name] = jsonable(getattr(E, name))
    except TypeError:
        pass

ref = {}
ref["slot_tier"] = {s: [E.slot_tier(s, c) for c in range(1, 31)] for s in E.SLOTS}
ref["item_score"] = [
    {"tier": t, "rarity": r, "upg": u, "score": E.item_score(t, r, u)}
    for t in (1, 2, 4, 7, 10)
    for r in E.RARITIES
    for u in (0, 1, 5, 15)
]
ref["hero_stats_par"] = []
for c in range(1, 31):
    atk, hp = E.hero_stats(E.par_scores(c))
    ref["hero_stats_par"].append({"chapter": c, "atk": atk, "hp": hp})
ref["hero_stats_mixed"] = []
for (w, a, ch) in [
    ((2, "U", 5), (1, "C", 0), (3, "R", 2)),
    ((4, "E", 13), (3, "L", 15), (2, "C", 0)),
    ((1, "C", 0), (1, "C", 0), (1, "C", 0)),
]:
    scores = {
        "weapon": E.item_score(*w),
        "armor": E.item_score(*a),
        "charm": E.item_score(*ch),
    }
    atk, hp = E.hero_stats(scores)
    ref["hero_stats_mixed"].append(
        {"weapon": list(w), "armor": list(a), "charm": list(ch), "atk": atk, "hp": hp}
    )
ref["tier_price"] = [E.tier_price(t) for t in range(1, 11)]
ref["upg_cost"] = [[E.upg_cost(t, u) for u in range(15)] for t in range(1, 11)]
ref["gold_unit"] = [E.gold_unit(c) for c in range(1, 31)]
ref["level_gold"] = [[E.level_gold((c - 1) * 10 + p) for p in range(1, 11)] for c in range(1, 31)]
ref["pace_factor"] = {
    str(p): E.clamp((E.PACE_REF / p) ** E.PACE_EXP, *E.PACE_CLAMP) for p in range(15, 121)
}
ref["par_scores"] = {str(c): E.par_scores(c) for c in (1, 2, 3, 4, 10, 30)}

# Combat reference: the reference typist (35 WPM, 92%) and the 94% variant, chapter 1.
tc92 = E.typing_combat(35, 0.92, 1)
tc94 = E.typing_combat(35, 0.94, 1)
ref["typing_combat"] = {"35_92": tc92, "35_94": tc94}
# ATB per Perfect 5-letter word at ComboMult 1.0 and 1.2 (doc 01 section 2.2 worked example: 72.5)
ref["atb_perfect_5"] = {
    "cm_1.0": (E.WEAPON["word_bonus"] + 5 * E.WEAPON["char_charge"] * 1.0) * E.PERFECT_ATB_MULT,
    "cm_1.2": (E.WEAPON["word_bonus"] + 5 * E.WEAPON["char_charge"] * 1.2) * E.PERFECT_ATB_MULT,
}
ref["combo_mean_mult"] = {str(p): E.combo_mean_mult(p) for p in (0.5, 0.7, 0.9)}
ref["guard_mult"] = {"g0.6_acc0.92": E.guard_mult(0.6, 0.92)}
# Chapter 1 level specs (encounter HP pool, grunt hit, monster counts)
specs = {}
for lv in range(1, 11):
    s = E.level_spec(lv)
    specs[str(lv)] = {
        "enc_hp": s["enc_hp"],
        "grunt_hit": s["grunt_hit"],
        "par_hp": s["par_hp"],
        "boss": s["boss"],
        "encs": [
            {"kind": e["kind"], "mons": [[m[0], m[1], m[2]] for m in e["mons"]]} for e in s["encs"]
        ],
        "overhead_s": E.level_overhead_s(s),
    }
ref["level_specs_ch1"] = specs

json.dump({"constants": constants, "ref": ref}, open(OUT, "w"), indent=1, sort_keys=True)
print("wrote", OUT)

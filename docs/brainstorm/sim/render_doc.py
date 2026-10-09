#!/usr/bin/env python3
"""Render docs/brainstorm/02-economy-and-balance.md from sim/02_doc_template.md + sim/economy_sim_output.md.

Usage (after running the sim):
    python3 economy_sim.py > economy_sim_output.md
    python3 render_doc.py

Template syntax:
    <<SEC:## X.>>   -> body of the output section whose heading starts with "## X." (up to the next "## ")
    <<NAME>>        -> scalar pulled from the headline / gem tables (see SCALARS below)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "economy_sim_output.md")
TPL = os.path.join(HERE, "02_doc_template.md")
DOC = os.path.join(HERE, "..", "02-economy-and-balance.md")

out = open(OUT, encoding="utf-8").read()
tpl = open(TPL, encoding="utf-8").read()
lines = out.split("\n")


def section(prefix):
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            buf = []
            for l2 in lines[i + 1:]:
                if l2.startswith("## "):
                    break
                buf.append(l2)
            return "\n".join(buf).strip()
    sys.exit(f"render_doc: section not found in sim output: {prefix!r}")


def row(first_cell):
    for l in lines:
        if l.startswith("| " + first_cell + " |"):
            return [c.strip() for c in l.strip().strip("|").split("|")]
    sys.exit(f"render_doc: row not found: {first_cell!r}")


P = ["Beginner", "Average", "Fast"]
h = {n: row(n) for n in P}   # first match = headline table
# headline cols: 0 persona,1 hours,2 p10-90,3 typing h,4 days,5 min/level,6 1st-try,7 boss,8 attempts,
#                9 grind,10 end wpm/acc,11 power,12 walls,13 boss min,14 stars,15 extra star h


def tl(label, fn):
    return "| " + label + " | " + " | ".join(fn(h[n]) for n in P) + " |"


tldr = "\n".join([
    tl("Story hours (P10–P90)", lambda r: f"{r[1]} ({r[2]})"),
    tl("Days to finish (B 45 min/day, A/F 60)", lambda r: r[4]),
    tl("Minutes per level incl. menus", lambda r: r[5]),
    tl("First-try clear, all levels", lambda r: r[6]),
    tl("First-try clear, bosses", lambda r: r[7]),
    tl("Grind replays over the story", lambda r: r[9]),
    tl("WPM / accuracy at story end", lambda r: r[10]),
    tl("Gear power vs par at end", lambda r: r[11]),
    tl("Stars at story end / extra h for 900", lambda r: f"{r[14]} / +{r[15]} h"),
    tl("Levels needing >40 tries (hard walls)", lambda r: r[12]),
])
leg = [l for l in section("## J. Gems").split("\n") if l.startswith("| Legendary |")][0].strip("|").split("|")[2].strip()
gap = re.search(r"mean \*\*([\d.]+)\*\*", out).group(1)
f2p = row("Fully engaged F2P")
SCALARS = {
    "<<TLDR>>": tldr,
    "<<RUNS>>": re.search(r"Runs per persona: (\d+)", out).group(1),
    "<<AVG_FT>>": h["Average"][6], "<<AVG_BOSS>>": h["Average"][7],
    "<<BEG_FT>>": h["Beginner"][6], "<<FAST_FT>>": h["Fast"][6],
    "<<FAST_POW>>": h["Fast"][11] + "×",
    "<<AVG_H>>": h["Average"][1], "<<AVG_P>>": h["Average"][2] + " h",
    "<<AVG_STAR_H>>": h["Average"][15], "<<BEG_STAR_H>>": h["Beginner"][15],
    "<<AVG_TOTAL>>": f"{float(h['Average'][1]) + float(h['Average'][15]):.0f}",
    "<<BEG_H>>": h["Beginner"][1], "<<FAST_H>>": h["Fast"][1],
    "<<LEG_RATE>>": leg, "<<LEG_GAP>>": gap,
    "<<F2P_WEEK>>": f2p[1], "<<F2P_MONTH>>": f2p[2],
}
for k, v in SCALARS.items():
    tpl = tpl.replace(k, v)
tpl = re.sub(r"<<SEC:(.+?)>>", lambda m: section(m.group(1)), tpl)
left = re.findall(r"<<[^>]*>>", tpl)
if left:
    sys.exit(f"render_doc: unresolved placeholders {left}")
open(DOC, "w", encoding="utf-8").write(tpl)
print(f"wrote {os.path.normpath(DOC)} ({len(tpl):,} chars)")

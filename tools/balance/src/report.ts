// Aggregation, plan §9 verdicts and the markdown / JSON report.
import { contentBundle } from "@hd2d/content";
import type { RunRecord } from "./bot.ts";
import { PERSONAS, type PersonaId } from "./personas.ts";
import { pyActiveSeconds, pyEncounterHp } from "./pymodel.ts";
import type { JobResult } from "./runner.ts";
import type { WhatIf } from "./whatif.ts";

// ---------------------------------------------------------------- targets

/** Plan §9 (economy_sim v2, docs/brainstorm/02 §"Time per level"). Times in minutes, rates as fractions. */
export const PLAN_TARGETS: Record<
  "beginner" | "average" | "fast",
  {
    normalMin: [number, number];
    bossMin: number;
    clearNormal: number;
    clearBoss: number;
    skillShare: [number, number];
  }
> = {
  beginner: {
    normalMin: [3.0, 4.5],
    bossMin: 5.4,
    clearNormal: 0.8,
    clearBoss: 0.5,
    skillShare: [0.15, 0.2],
  },
  average: {
    normalMin: [2.4, 3.0],
    bossMin: 4.2,
    clearNormal: 0.97,
    clearBoss: 0.85,
    skillShare: [0.15, 0.2],
  },
  fast: {
    normalMin: [1.7, 2.2],
    bossMin: 3.4,
    clearNormal: 0.99,
    clearBoss: 0.9,
    skillShare: [0.15, 0.2],
  },
};
/** Plan §9: auto-attacks per encounter for the 35 WPM reference typist. */
export const REF_AUTO_ATTACKS = 11;
/** economy_sim_output.md "S" table, chapter 1 row (2-encounter levels, boss included in the mean). */
export const PY_CH1_ROW = {
  beginner: { activeMin: 3.0, clear: 1, boss: 1 },
  average: { activeMin: 1.7, clear: 1, boss: 1 },
  fast: { activeMin: 1.2, clear: 1, boss: 1 },
} as const;
export const TOL = 0.15;

// ---------------------------------------------------------------- aggregation

const mean = (a: readonly number[]): number =>
  a.length === 0 ? Number.NaN : a.reduce((x, y) => x + y, 0) / a.length;
const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

export interface LevelRow {
  persona: PersonaId;
  levelId: string;
  index: number;
  isBoss: boolean;
  n: number;
  clear: number;
  activeMin: number;
  simMin: number;
  combatMin: number;
  pyActiveMin: number;
  autoPerEnc: number;
  skillShare: number;
  dmgShare: Record<string, number>;
  dmgBySkill: Record<string, number>;
  gold: number;
  hitsTaken: number;
  dmgTaken: number;
  guardSuccess: number;
  guardAttemptRate: number;
  parryRate: number;
  secondWind: number;
  doomFail: string;
  rubbleMiss: string;
  bossPhaseMin: number[] | null;
  netWpm: number;
  accuracy: number;
}

/**
 * HP the Python model budgets for a level: normal levels = encounters x economy_sim enc_hp(p) (the authored 36 s TTK, so
 * the content's ENC_HP_MULT, which compensates the real sim's extra damage, is NOT in it); the boss level = its content
 * pools (pre-boss waves + boss + adds), which the T6.1 tuning leaves as authored.
 */
export function pyLevelHp(levelId: string): { hp: number; encounters: number; boss: boolean } {
  const c = levelHp(levelId);
  const lv = contentBundle.levels.find((l) => l.id === levelId);
  if (c.boss || lv === undefined) return c;
  return { ...c, hp: c.encounters * pyEncounterHp(lv.index) };
}

/** Total HP the hero must remove in a content level (encounter pools + boss + boss adds), from the content bundle. */
export function levelHp(levelId: string): { hp: number; encounters: number; boss: boolean } {
  const lv = contentBundle.levels.find((l) => l.id === levelId);
  if (lv === undefined) throw new Error(levelId);
  let hp = 0;
  let encounters = 0;
  let boss = false;
  for (const s of lv.segments) {
    if (s.kind === "encounter") {
      hp += s.encounter.hp * s.encounter.waves.length; // the pool is per wave (sim: hpPoolM split by hpWeight per wave)
      encounters++;
    } else if (s.kind === "boss") {
      const b = contentBundle.bosses.find((x) => x.id === s.bossId);
      if (b === undefined) throw new Error(s.bossId);
      hp += b.hp * (1 + 0.5 / 3.2); // the adds' pool: BOSS_ADDS_HP_ENC / BOSS_HP_ENC of the boss HP
      encounters++;
      boss = true;
    }
  }
  return { hp, encounters, boss };
}

export function levelRow(persona: PersonaId, rs: readonly RunRecord[]): LevelRow {
  const first = rs[0] as RunRecord;
  const won = rs.filter((r) => r.cleared);
  const totalDmg = sum(rs.map((r) => sum(Object.values(r.dmgByOrigin))));
  const dmgShare: Record<string, number> = {};
  for (const o of Object.keys(first.dmgByOrigin))
    dmgShare[o] = sum(rs.map((r) => r.dmgByOrigin[o as keyof RunRecord["dmgByOrigin"]])) / totalDmg;
  const dmgBySkill: Record<string, number> = {};
  for (const r of rs)
    for (const [k, v] of Object.entries(r.dmgBySkill))
      dmgBySkill[k] = (dmgBySkill[k] ?? 0) + v / totalDmg;
  const p = PERSONAS.find((x) => x.id === persona);
  if (p === undefined) throw new Error(persona);
  const lh = pyLevelHp(first.levelId);
  const guardShown = sum(rs.map((r) => r.guardShown));
  const ok = sum(rs.map((r) => r.blocked + r.parried));
  const landed = sum(
    rs.map((r) => r.attacks.hit + r.attacks.blocked + r.attacks.parried + r.attacks.barrier),
  );
  const bossRuns = won.filter((r) => r.bossPhaseS !== null);
  return {
    persona,
    levelId: first.levelId,
    index: first.index,
    isBoss: first.isBoss,
    n: rs.length,
    clear: won.length / rs.length,
    activeMin: mean(won.map((r) => r.activeS)) / 60,
    simMin: mean(won.map((r) => r.simS)) / 60,
    combatMin: mean(won.map((r) => r.combatS)) / 60,
    pyActiveMin: pyActiveSeconds(lh.hp, lh.encounters, lh.boss, p.wpm, p.acc) / 60,
    autoPerEnc: sum(won.map((r) => r.autoAttacks)) / Math.max(1, sum(won.map((r) => r.encounters))),
    skillShare: dmgShare.skill ?? 0,
    dmgShare,
    dmgBySkill,
    gold: mean(rs.map((r) => r.gold)),
    hitsTaken: mean(rs.map((r) => r.hitsTaken)),
    dmgTaken: mean(rs.map((r) => r.dmgTaken.attack + r.dmgTaken.doom + r.dmgTaken.minigame)),
    guardSuccess: landed === 0 ? Number.NaN : ok / landed,
    guardAttemptRate:
      guardShown === 0 ? Number.NaN : sum(rs.map((r) => r.guardAttempted)) / guardShown,
    parryRate: ok === 0 ? Number.NaN : sum(rs.map((r) => r.parried)) / ok,
    secondWind: rs.filter((r) => r.secondWind).length / rs.length,
    doomFail: `${sum(rs.map((r) => r.doomFailed))}/${sum(rs.map((r) => r.doomStarted))}`,
    rubbleMiss: `${sum(rs.map((r) => r.rubbleMissed))}/${sum(rs.map((r) => r.rubbleSpawned))}`,
    bossPhaseMin:
      bossRuns.length === 0
        ? null
        : [0, 1, 2, 3, 4].map(
            (i) => mean(bossRuns.map((r) => (r.bossPhaseS as number[])[i] ?? 0)) / 60,
          ),
    netWpm: mean(rs.map((r) => r.netWpm)),
    accuracy: mean(rs.map((r) => r.accuracy)),
  };
}

export interface PersonaSummary {
  persona: PersonaId;
  normalActiveMin: number;
  normalActiveMin3Enc: number;
  normalClear: number;
  normalClearMin: number;
  bossActiveMin: number;
  bossClear: number;
  skillShare: number;
  skillShareNormal: number;
  autoPerEnc: number;
  pyNormalActiveMin: number;
  pyBossActiveMin: number;
  chapterGold: number;
}

export function summarize(persona: PersonaId, rows: readonly LevelRow[]): PersonaSummary {
  const normal = rows.filter((r) => !r.isBoss);
  const boss = rows.find((r) => r.isBoss);
  const skillW = (rs: readonly LevelRow[]): number => mean(rs.map((r) => r.skillShare));
  const threeEnc = normal.filter((r) => levelHp(r.levelId).encounters >= 3);
  return {
    persona,
    normalActiveMin: mean(normal.map((r) => r.activeMin)),
    normalActiveMin3Enc: mean(threeEnc.map((r) => r.activeMin)),
    normalClear: mean(normal.map((r) => r.clear)),
    normalClearMin: Math.min(...normal.map((r) => r.clear)),
    bossActiveMin: boss?.activeMin ?? Number.NaN,
    bossClear: boss?.clear ?? Number.NaN,
    skillShare: skillW(rows),
    skillShareNormal: skillW(normal),
    autoPerEnc: mean(normal.map((r) => r.autoPerEnc)),
    pyNormalActiveMin: mean(normal.map((r) => r.pyActiveMin)),
    pyBossActiveMin: boss?.pyActiveMin ?? Number.NaN,
    chapterGold: sum(rows.map((r) => r.gold)),
  };
}

// ---------------------------------------------------------------- verdicts

/** FAIL* = a known structural miss documented in docs/balance-ch1.md (KNOWN_MISSES); it does not fail the exit code. */
export type Verdict = "PASS" | "PASS(±15%)" | "FAIL" | "FAIL*";
export interface Cell {
  persona: string;
  metric: string;
  value: number;
  target: string;
  verdict: Verdict;
}

/**
 * Plan §9 cells that cannot be met without a rule change (docs/balance-ch1.md "Remaining deltas"): §9's boss times are
 * economy_sim's 30-chapter averages, and its own Chapter 1 model puts a 20 WPM Ruin Golem at ~7.4 min (8.1 on this
 * content). Listed as persona:metric.
 */
export const KNOWN_MISSES: readonly string[] = ["beginner:boss active min"];

const inRange = (v: number, lo: number, hi: number): Verdict =>
  v >= lo && v <= hi ? "PASS" : v >= lo * (1 - TOL) && v <= hi * (1 + TOL) ? "PASS(±15%)" : "FAIL";
const atLeast = (v: number, t: number): Verdict => (v >= t ? "PASS" : "FAIL");

export function verdicts(sums: readonly PersonaSummary[]): Cell[] {
  const cells: Cell[] = [];
  for (const s of sums) {
    if (s.persona === "ref") {
      cells.push({
        persona: "ref",
        metric: "auto-attacks / encounter",
        value: s.autoPerEnc,
        target: `~${REF_AUTO_ATTACKS}`,
        verdict: inRange(s.autoPerEnc, REF_AUTO_ATTACKS, REF_AUTO_ATTACKS),
      });
      continue;
    }
    const t = PLAN_TARGETS[s.persona];
    const at = cells.length;
    cells.push(
      {
        persona: s.persona,
        metric: "normal active min (L1-L9 mean)",
        value: s.normalActiveMin,
        target: `${t.normalMin[0]}-${t.normalMin[1]}`,
        verdict: inRange(s.normalActiveMin, t.normalMin[0], t.normalMin[1]),
      },
      {
        persona: s.persona,
        metric: "boss active min",
        value: s.bossActiveMin,
        target: `~${t.bossMin}`,
        verdict: inRange(s.bossActiveMin, t.bossMin, t.bossMin),
      },
      {
        persona: s.persona,
        metric: "first-try clear normal (mean)",
        value: s.normalClear,
        target: `>=${t.clearNormal}`,
        verdict: atLeast(s.normalClear, t.clearNormal),
      },
      {
        persona: s.persona,
        metric: "first-try clear boss",
        value: s.bossClear,
        target: `>=${t.clearBoss}`,
        verdict: atLeast(s.bossClear, t.clearBoss),
      },
      {
        persona: s.persona,
        metric: "skill damage share",
        value: s.skillShare,
        target: `${t.skillShare[0]}-${t.skillShare[1]}`,
        verdict: inRange(s.skillShare, t.skillShare[0], t.skillShare[1]),
      },
    );
    for (const c of cells.slice(at))
      if (c.verdict === "FAIL" && KNOWN_MISSES.includes(`${c.persona}:${c.metric}`))
        c.verdict = "FAIL*";
  }
  return cells;
}

/**
 * Parity with economy_sim's Chapter 1 model on this content (the "Py" columns): level time within ±15% of the analytic
 * prediction (persona mean over L1-L9, the boss level, and the worst single level), and first-try clears within 15 points
 * of the Python's Chapter 1 row (100% for every persona, normal and boss).
 */
export function parityCells(rows: readonly LevelRow[], sums: readonly PersonaSummary[]): Cell[] {
  const cells: Cell[] = [];
  const band = (r: number): Verdict => (Math.abs(r - 1) <= TOL ? "PASS" : "FAIL");
  for (const s of sums) {
    if (s.persona === "ref") continue;
    const normal = rows.filter((r) => r.persona === s.persona && !r.isBoss);
    const worst = normal.reduce(
      (w, r) =>
        Math.abs(r.activeMin / r.pyActiveMin - 1) > Math.abs(w - 1)
          ? r.activeMin / r.pyActiveMin
          : w,
      1,
    );
    const py = PY_CH1_ROW[s.persona];
    cells.push(
      {
        persona: s.persona,
        metric: "normal active / Py (L1-L9 mean)",
        value: s.normalActiveMin / s.pyNormalActiveMin,
        target: "1 ±15%",
        verdict: band(s.normalActiveMin / s.pyNormalActiveMin),
      },
      {
        persona: s.persona,
        metric: "normal active / Py (worst level)",
        value: worst,
        target: "1 ±15%",
        verdict: band(worst),
      },
      {
        persona: s.persona,
        metric: "boss active / Py",
        value: s.bossActiveMin / s.pyBossActiveMin,
        target: "1 ±15%",
        verdict: band(s.bossActiveMin / s.pyBossActiveMin),
      },
      {
        persona: s.persona,
        metric: "first-try clear normal vs Py Ch1",
        value: s.normalClear,
        target: `>=${py.clear - TOL}`,
        verdict: atLeast(s.normalClear, py.clear - TOL),
      },
      {
        persona: s.persona,
        metric: "first-try clear boss vs Py Ch1",
        value: s.bossClear,
        target: `>=${py.boss - TOL}`,
        verdict: atLeast(s.bossClear, py.boss - TOL),
      },
    );
  }
  return cells;
}

// ---------------------------------------------------------------- markdown

const f1 = (x: number): string => (Number.isNaN(x) ? "-" : x.toFixed(1));
const f2 = (x: number): string => (Number.isNaN(x) ? "-" : x.toFixed(2));
const pct = (x: number): string => (Number.isNaN(x) ? "-" : `${(100 * x).toFixed(0)}%`);
const pct1 = (x: number): string => (Number.isNaN(x) ? "-" : `${(100 * x).toFixed(1)}%`);
const table = (head: string[], rows: string[][]): string =>
  [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

export interface Report {
  config: { seeds: number; noise: boolean; workers: number; seconds: number; whatif: WhatIf };
  rows: LevelRow[];
  summaries: PersonaSummary[];
  cells: Cell[];
  parity: Cell[];
}

export function buildReport(results: readonly JobResult[], config: Report["config"]): Report {
  const rows = results.map((r) => levelRow(r.job.persona, r.records));
  const personas = [...new Set(rows.map((r) => r.persona))];
  const summaries = personas.map((p) =>
    summarize(
      p,
      rows.filter((r) => r.persona === p),
    ),
  );
  return {
    config,
    rows,
    summaries,
    cells: verdicts(summaries),
    parity: parityCells(rows, summaries),
  };
}

export function markdown(rep: Report): string {
  const out: string[] = [];
  const label = (p: string): string => PERSONAS.find((x) => x.id === p)?.label ?? p;
  out.push(
    `# Chapter 1 balance (${rep.config.seeds} seeds per level per persona, noise ${rep.config.noise ? "on" : "off"})`,
    ...(Object.keys(rep.config.whatif).length > 0
      ? ["", `**What-if:** ${JSON.stringify(rep.config.whatif)} (Py columns ignore it)`]
      : []),
    "",
    "Active time = sim time (intro, walks, wave intros, combat, rewards, boss breathers) + LEVEL_END_S 10 s, i.e.",
    "economy_sim's `win_secs - MENU_S - JOURNAL_S`. Means over cleared runs. Py = economy_sim's analytic model on this content.",
    "",
    "## Plan §9 verdicts",
    "",
    table(
      ["Persona", "Metric", "Value", "Target", "Verdict"],
      rep.cells.map((c) => [
        label(c.persona),
        c.metric,
        c.metric.includes("clear") || c.metric.includes("share") ? pct1(c.value) : f2(c.value),
        c.target,
        c.verdict,
      ]),
    ),
    "",
    "FAIL* = known structural miss (no tuning knob can reach it without a rule change), see docs/balance-ch1.md.",
    "",
    "## Parity with economy_sim's Chapter 1 model",
    "",
    table(
      ["Persona", "Metric", "Value", "Target", "Verdict"],
      rep.parity.map((c) => [
        label(c.persona),
        c.metric,
        c.metric.includes("clear") ? pct1(c.value) : f2(c.value),
        c.target,
        c.verdict,
      ]),
    ),
    "",
    "## Persona summary",
    "",
    table(
      [
        "Persona",
        "Normal active (L1-9)",
        "3-enc levels",
        "Py model",
        "Py Ch1 row",
        "Boss active",
        "Py boss",
        "Clear normal (min)",
        "Clear boss",
        "Skill share",
        "Auto/enc",
        "Ch1 gold",
      ],
      rep.summaries.map((s) => [
        label(s.persona),
        f2(s.normalActiveMin),
        f2(s.normalActiveMin3Enc),
        f2(s.pyNormalActiveMin),
        s.persona === "ref" ? "-" : f1(PY_CH1_ROW[s.persona].activeMin),
        f2(s.bossActiveMin),
        f2(s.pyBossActiveMin),
        `${pct(s.normalClear)} (${pct(s.normalClearMin)})`,
        pct(s.bossClear),
        pct1(s.skillShare),
        f1(s.autoPerEnc),
        s.chapterGold.toFixed(0),
      ]),
    ),
  );
  for (const p of [...new Set(rep.rows.map((r) => r.persona))]) {
    out.push(
      "",
      `## ${label(p)}`,
      "",
      table(
        [
          "Level",
          "Clear",
          "Active min",
          "Py min",
          "Δ vs py",
          "Sim min",
          "Combat min",
          "Auto/enc",
          "Skill",
          "Weapon/chip/counter/minigame/finisher",
          "Gold",
          "Hits",
          "Dmg taken",
          "Guard ok (try)",
          "SW",
          "Doom fail",
          "Rubble miss",
        ],
        rep.rows
          .filter((r) => r.persona === p)
          .map((r) => [
            r.levelId,
            pct(r.clear),
            f2(r.activeMin),
            f2(r.pyActiveMin),
            `${r.activeMin >= r.pyActiveMin ? "+" : ""}${pct(r.activeMin / r.pyActiveMin - 1)}`,
            f2(r.simMin),
            f2(r.combatMin),
            f1(r.autoPerEnc),
            pct1(r.skillShare),
            ["weapon", "chip", "counter", "minigame", "finisher"]
              .map((o) => pct(r.dmgShare[o] ?? 0))
              .join("/"),
            r.gold.toFixed(0),
            f1(r.hitsTaken),
            f1(r.dmgTaken),
            `${pct(r.guardSuccess)} (${pct(r.guardAttemptRate)})`,
            pct(r.secondWind),
            r.doomFail,
            r.rubbleMiss,
          ]),
      ),
    );
    const b = rep.rows.find((r) => r.persona === p && r.bossPhaseMin !== null);
    if (b?.bossPhaseMin)
      out.push(
        "",
        `Boss level phases (min, cleared runs): pre-boss ${f2(b.bossPhaseMin[0] as number)}, phase 1 ${f2(b.bossPhaseMin[1] as number)}, phase 2 ${f2(b.bossPhaseMin[2] as number)}, phase 3 + finisher ${f2(b.bossPhaseMin[3] as number)}. Skill damage by skill: ${Object.entries(
          b.dmgBySkill,
        )
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k} ${pct1(v)}`)
          .join(", ")}`,
      );
  }
  out.push(
    "",
    `_${rep.rows.reduce((a, r) => a + r.n, 0)} runs in ${rep.config.seconds.toFixed(1)} s on ${rep.config.workers} workers._`,
  );
  return out.join("\n");
}

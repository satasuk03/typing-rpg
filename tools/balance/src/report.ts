// Aggregation, plan §9 verdicts and the markdown / JSON report.

import { CHAPTER_KNOBS } from "@hd2d/content";
import { computeHeroStats, resolveLevel } from "@hd2d/sim";
import type { RunRecord } from "./bot.ts";
import { describeGear, guardLeakBp, parseGear } from "./gear.ts";
import { PERSONAS, type PersonaId } from "./personas.ts";
import { pyActiveSeconds, pyEncounterHp } from "./pymodel.ts";
import {
  bundleForLevel,
  chapterLevels,
  chapterOfLevel,
  type JobResult,
  starterLoadout,
} from "./runner.ts";
import type { WhatIf } from "./whatif.ts";

// ---------------------------------------------------------------- targets

/**
 * Plan §9 (economy_sim v2, docs/brainstorm/02 §"Time per level"). Times in minutes, rates as fractions.
 * Boss times: PO decision 2026-10-09 (T6.1 follow-up): §9's 5.4 / 4.2 / 3.4 are 30-chapter averages, so Chapter 1 uses
 * economy_sim's own Chapter 1 model on this content (8.1 / 4.4 / 2.8 min, ±15%). Normal-level times keep §9's ranges.
 */
export interface PersonaTargets {
  normalMin: [number, number];
  bossMin: number;
  /** First-try clear, mean over L1-L9 (and the per-level floor the bot gate checks). */
  clearNormal: number;
  /** Ch2: the worst single normal level's first-try clear (CH2_PLAN §4.2 "worst level >= 85%"). */
  clearNormalWorst?: number;
  clearBoss: number;
  /** PO 2026-10-09 ("add some risk"): first-try boss clear window, checked as its own cell. */
  clearBossWindow?: [number, number];
  /**
   * Ch2 (PO 2026-10-10, CH2_PLAN §4.3): the boss window at a gear offset, keyed by the --gear label. Checked instead of
   * clearBossWindow when the report runs at that offset (par-2 = no upgrades in Ch2: 55-70%; armor+5: >= 85%).
   */
  clearBossWindowByGear?: Readonly<Record<string, [number, number]>>;
  skillShare: [number, number];
}

export const PLAN_TARGETS: Record<"beginner" | "average" | "fast", PersonaTargets> = {
  beginner: {
    normalMin: [3.0, 4.5],
    bossMin: 8.1,
    clearNormal: 0.8,
    clearBoss: 0.5,
    clearBossWindow: [0.8, 0.9],
    skillShare: [0.15, 0.2],
  },
  average: {
    normalMin: [2.4, 3.0],
    bossMin: 4.4,
    clearNormal: 0.97,
    clearBoss: 0.85,
    skillShare: [0.15, 0.2],
  },
  fast: {
    normalMin: [1.7, 2.2],
    bossMin: 2.8,
    clearNormal: 0.99,
    clearBoss: 0.9,
    skillShare: [0.15, 0.2],
  },
};
/**
 * Chapter 2 targets (T5.1, docs/CH2_PLAN.md §4.2 / §4.3, PO 2026-10-10). Times: plan §9 ranges for normal levels and the
 * Ch1 boss times kept for Ch2 (the riddle replaces rubble at about equal time). Clears are at par gear (T1 Common +2).
 * Beginner boss: the PO window 75-90% at par, 55-70% with no upgrades (C+0 = par-2 in Ch2), and >= 85% with armor +5
 * (§4.3 "armor C+5: >= 85%"; armor+3 from par = C+5, the Common cap).
 */
export const PLAN_TARGETS_CH2: Record<"beginner" | "average" | "fast", PersonaTargets> = {
  beginner: {
    normalMin: [3.0, 4.5],
    bossMin: 8.1,
    clearNormal: 0.9,
    clearNormalWorst: 0.85,
    clearBoss: 0.75,
    clearBossWindow: [0.75, 0.9],
    // armor+3 and armor+5 are the same loadout in Ch2 (par C+2 + 3 = C+5, the Common cap; +5 clamps there).
    clearBossWindowByGear: { "par-2": [0.55, 0.7], "armor+3": [0.85, 1], "armor+5": [0.85, 1] },
    skillShare: [0.15, 0.2],
  },
  average: {
    normalMin: [2.4, 3.0],
    bossMin: 4.4,
    clearNormal: 0.97,
    clearBoss: 0.9,
    skillShare: [0.15, 0.2],
  },
  fast: {
    normalMin: [1.7, 2.2],
    bossMin: 2.8,
    clearNormal: 0.99,
    clearBoss: 0.95,
    skillShare: [0.15, 0.2],
  },
};
/** Per-chapter targets (T1.1; Ch2 from T5.1). */
export const PLAN_TARGETS_BY_CHAPTER: Record<number, typeof PLAN_TARGETS> = {
  1: PLAN_TARGETS,
  2: PLAN_TARGETS_CH2,
};
export function planTargetsFor(chapter: number): typeof PLAN_TARGETS {
  const t = PLAN_TARGETS_BY_CHAPTER[chapter];
  if (t === undefined) throw new Error(`planTargetsFor: no targets for chapter ${chapter}`);
  return t;
}
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
  const lv = bundleForLevel(levelId).levels.find((l) => l.id === levelId);
  if (c.boss || lv === undefined) return c;
  return { ...c, hp: c.encounters * pyEncounterHp(lv.index, lv.chapter) };
}

/** Total HP the hero must remove in a content level (encounter pools + boss + boss adds), from the content bundle. */
export function levelHp(levelId: string): { hp: number; encounters: number; boss: boolean } {
  const lv = bundleForLevel(levelId).levels.find((l) => l.id === levelId);
  if (lv === undefined) throw new Error(levelId);
  let hp = 0;
  let encounters = 0;
  let boss = false;
  for (const s of lv.segments) {
    if (s.kind === "encounter") {
      hp += s.encounter.hp * s.encounter.waves.length; // the pool is per wave (sim: hpPoolM split by hpWeight per wave)
      encounters++;
    } else if (s.kind === "boss") {
      const b = bundleForLevel(levelId).bosses.find((x) => x.id === s.bossId);
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
    pyActiveMin:
      pyActiveSeconds(lh.hp, lh.encounters, lh.boss, p.wpm, p.acc, chapterOfLevel(first.levelId)) /
      60,
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
    // A riddle boss (Ch2) has no rubble: the column shows riddle misses (wrong + timeout) / riddles. Ch1: rubble, unchanged.
    rubbleMiss: rs.some((r) => r.riddles.right + r.riddles.wrong + r.riddles.timeout > 0)
      ? `${sum(rs.map((r) => r.riddles.wrong + r.riddles.timeout))}/${sum(rs.map((r) => r.riddles.right + r.riddles.wrong + r.riddles.timeout))} (${sum(rs.map((r) => r.riddles.timeout))} t/o)`
      : `${sum(rs.map((r) => r.rubbleMissed))}/${sum(rs.map((r) => r.rubbleSpawned))}`,
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
 * Target cells that cannot be met without a rule change, listed as persona:metric (docs/balance-ch1.md). Empty since the
 * PO set the Chapter 1 boss targets from economy_sim's Chapter 1 model (2026-10-09).
 */
export const KNOWN_MISSES: readonly string[] = [];

const inRange = (v: number, lo: number, hi: number): Verdict =>
  v >= lo && v <= hi ? "PASS" : v >= lo * (1 - TOL) && v <= hi * (1 + TOL) ? "PASS(±15%)" : "FAIL";
const atLeast = (v: number, t: number): Verdict => (v >= t ? "PASS" : "FAIL");

export function verdicts(sums: readonly PersonaSummary[], chapter = 1, gear?: string): Cell[] {
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
    const t = planTargetsFor(chapter)[s.persona];
    // The boss window: at par the PO window; at a gear offset the chapter's per-gear window when it has one (Ch2), else
    // none. Chapters without per-gear windows (Ch1) keep the par window at every gear (pre-T5.1 behaviour).
    const g = gear ?? "par";
    const win =
      t.clearBossWindowByGear === undefined || g === "par"
        ? t.clearBossWindow
        : t.clearBossWindowByGear[g];
    const winLabel =
      t.clearBossWindowByGear === undefined || g === "par"
        ? "first-try clear boss (PO window)"
        : `first-try clear boss (PO window, ${g})`;
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
      ...(t.clearNormalWorst === undefined
        ? []
        : [
            {
              persona: s.persona,
              metric: "first-try clear normal (worst level)",
              value: s.normalClearMin,
              target: `>=${t.clearNormalWorst}`,
              verdict: atLeast(s.normalClearMin, t.clearNormalWorst),
            },
          ]),
      {
        persona: s.persona,
        metric: "first-try clear boss",
        value: s.bossClear,
        target: `>=${t.clearBoss}`,
        verdict: atLeast(s.bossClear, t.clearBoss),
      },
      ...(win === undefined
        ? []
        : [
            {
              persona: s.persona,
              metric: winLabel,
              value: s.bossClear,
              target: `${win[0]}-${win[1]}`,
              verdict:
                s.bossClear >= win[0] && s.bossClear <= win[1]
                  ? ("PASS" as const)
                  : ("FAIL" as const),
            },
          ]),
      {
        persona: s.persona,
        metric: "skill damage share",
        value: s.skillShare,
        target: `${t.skillShare[0]}-${t.skillShare[1]}`,
        verdict: inRange(s.skillShare, t.skillShare[0], t.skillShare[1]),
      },
    );
    // A chapter without a boss level (none ship today) has no boss cells: drop the NaN ones (Ch1 never has any).
    for (let i = cells.length - 1; i >= at; i--)
      if (Number.isNaN((cells[i] as Cell).value)) cells.splice(i, 1);
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
export function parityCells(
  rows: readonly LevelRow[],
  sums: readonly PersonaSummary[],
  chapter = 1,
): Cell[] {
  const cells: Cell[] = [];
  // Ch2 (T5.1, CH2_PLAN §4.2 "parity vs Py Ch2 model, ±15% per cell"): the time cells only. economy_sim has no Ch2 clear
  // row on this content, and §4.2 sets the Ch2 clear targets directly (verdicts()).
  if (chapter !== 1) {
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
      const add = (metric: string, value: number): void => {
        if (!Number.isNaN(value))
          cells.push({ persona: s.persona, metric, value, target: "1 ±15%", verdict: band(value) });
      };
      add("normal active / Py (L1-L9 mean)", s.normalActiveMin / s.pyNormalActiveMin);
      add("normal active / Py (worst level)", worst);
      add("boss active / Py", s.bossActiveMin / s.pyBossActiveMin);
    }
    return cells;
  }
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
    );
    // The Beginner's boss clear is set by the PO window (80-90%) instead: economy_sim's 100% leans on the 50% feather
    // revive, which the slice does not ship.
    if (PLAN_TARGETS[s.persona].clearBossWindow === undefined)
      cells.push({
        persona: s.persona,
        metric: "first-try clear boss vs Py Ch1",
        value: s.bossClear,
        target: `>=${py.boss - TOL}`,
        verdict: atLeast(s.bossClear, py.boss - TOL),
      });
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
  config: {
    seeds: number;
    noise: boolean;
    workers: number;
    seconds: number;
    whatif: WhatIf;
    /** Absent = 1. Ch2 has its own targets (T5.1, PLAN_TARGETS_CH2) and time-only Python parity. */
    chapter?: number;
    /** T1.5: the --gear value (absent = par). */
    gear?: string;
    /** T5.1: the --kit value (absent = the chapter's default kit, runner.ts defaultKit). */
    kit?: string;
  };
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
    cells: verdicts(summaries, config.chapter ?? 1, config.gear),
    parity: parityCells(rows, summaries, config.chapter ?? 1),
  };
}

/**
 * Gear header + per-persona boss guard leak and damage-taken-vs-budget (T1.5). Empty without --gear (or with --gear par) in Chapter 1, so the default
 * report stays byte-identical to before the option existed; shown for any offset and for later chapters.
 */
export function gearSection(rep: Report): string[] {
  const chapter = rep.config.chapter ?? 1;
  const spec = parseGear(rep.config.gear);
  if (rep.config.gear === undefined && chapter === 1) return [];
  const l = starterLoadout("starter", chapter, rep.config.gear);
  const d = describeGear(l, spec, chapter);
  const bossId = chapterLevels(chapter)[9] as string;
  const lv = resolveLevel(bundleForLevel(bossId), bossId, { dueWeakWords: [] });
  const boss = lv.boss;
  // A level without a boss: fall back to the strongest encounter Attack Power of the level.
  const apBp =
    boss?.attackPowerBp ??
    Math.max(0, ...lv.segments.map((s) => (s as { attackPowerBp?: number }).attackPowerBp ?? 0));
  const bossName =
    boss === null ? `${bossId}, no boss: strongest encounter` : `${bossId} ${boss.name}`;
  const leak = apBp === 0 ? Number.NaN : guardLeakBp(l, chapter, apBp) / 10_000;
  const hp = computeHeroStats(l).maxHp / 1000;
  const out = [
    "",
    `**Gear:** ${d.label} | ${d.slots.map((x) => `${x.slot} ${x.text}`).join("; ")}; hero max HP ${hp.toFixed(0)}`,
    ...d.notes.map((n) => `- clamped: ${n}`),
    "",
    `Boss (${bossName}) guard leak at this gear: ${pct1(leak)}. Budget = hero max HP (${hp.toFixed(0)}); a run that takes more than the budget needs Second Wind or fails.`,
    "",
  ];
  // Ch2+ (T5.1, CH2_PLAN §4.3): the leak of every attacker class at this gear, from the chapter's knobs.
  const k = CHAPTER_KNOBS[chapter];
  if (chapter >= 2 && k !== undefined) {
    const lk = (p: number): string => pct1(guardLeakBp(l, chapter, Math.round(p * 10_000)) / 10_000);
    out.splice(
      out.length - 1,
      0,
      "",
      `Guard leak by attacker at this gear: grunt (P ${k.gruntAttackPower}) ${lk(k.gruntAttackPower)}, elite (P ${k.eliteAttackPower ?? "-"}) ${k.eliteAttackPower === null ? "-" : lk(k.eliteAttackPower)}, boss adds (P ${k.bossAddsAttackPower}) ${lk(k.bossAddsAttackPower)}, boss (P ${k.bossAttackPower}) ${lk(k.bossAttackPower)}.`,
    );
  }
  const rows = [...new Set(rep.rows.map((r) => r.persona))].flatMap((p) => {
    const r = rep.rows.find((x) => x.persona === p && x.levelId === bossId);
    if (r === undefined) return [];
    const normal = rep.rows.filter((x) => x.persona === p && !x.isBoss);
    const nmax = Math.max(0, ...normal.map((x) => x.dmgTaken));
    return [
      [
        PERSONAS.find((x) => x.id === p)?.label ?? p,
        pct1(leak),
        pct(r.clear),
        f1(r.dmgTaken),
        pct(r.dmgTaken / hp),
        f1(nmax),
        pct(nmax / hp),
        pct(r.secondWind),
      ],
    ];
  });
  out.push(
    table(
      [
        "Persona",
        "Boss guard leak",
        "Boss clear",
        "Boss dmg taken",
        "vs budget",
        "Worst normal-level dmg",
        "vs budget",
        "Boss Second Wind",
      ],
      rows,
    ),
  );
  return out;
}

export function markdown(rep: Report): string {
  const out: string[] = [];
  const label = (p: string): string => PERSONAS.find((x) => x.id === p)?.label ?? p;
  const ch = rep.config.chapter ?? 1;
  // Ch1 strings are frozen (byte-identical report); Ch2+ get their own headings.
  out.push(
    `# Chapter ${ch} balance (${rep.config.seeds} seeds per level per persona, noise ${rep.config.noise ? "on" : "off"})`,
    ...(ch === 1
      ? []
      : [
          "",
          `**Kit:** ${rep.config.kit ?? "default (the Ch2 player: starter kit, Reveal for Aegis from L4, Calm Mind for Steady Hands from L6)"}`,
        ]),
    ...(Object.keys(rep.config.whatif).length > 0
      ? ["", `**What-if:** ${JSON.stringify(rep.config.whatif)} (Py columns ignore it)`]
      : []),
    ...gearSection(rep),
    "",
    "Active time = sim time (intro, walks, wave intros, combat, rewards, boss breathers) + LEVEL_END_S 10 s, i.e.",
    "economy_sim's `win_secs - MENU_S - JOURNAL_S`. Means over cleared runs. Py = economy_sim's analytic model on this content.",
    "",
    ch === 1
      ? "## Plan §9 verdicts (boss times: economy_sim Ch1 model, PO 2026-10-09)"
      : `## CH2_PLAN §4.2 verdicts (Chapter ${ch}; Beginner boss window: PO 2026-10-10)`,
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
    `## Parity with economy_sim's Chapter ${ch} model`,
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
        `Ch${ch} gold`,
      ],
      rep.summaries.map((s) => [
        label(s.persona),
        f2(s.normalActiveMin),
        f2(s.normalActiveMin3Enc),
        f2(s.pyNormalActiveMin),
        s.persona === "ref" || ch !== 1 ? "-" : f1(PY_CH1_ROW[s.persona].activeMin),
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
          ch === 1 ? "Doom fail" : "Doom/Hush fail",
          ch === 1 ? "Rubble miss" : "Riddle miss",
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

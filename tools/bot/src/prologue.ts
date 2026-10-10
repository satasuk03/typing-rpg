// Prologue gate (P1.3): "The Unwriting" through prologueRunConfig(bundle) x 20/40/75 WPM personas x N seeds, using the
// balance persona bot (same keystroke model as Ch1/Ch2). Targets are docs/PROLOGUE_PLAN.md §5 P1.3.
//  - typing time = run.activeTicks (ticks spent in "combat") when PrologueClimax is emitted;
//  - kit casts = SkillCast events per active; passives = distinct PassiveTriggered ids (the sim emits it directly);
//  - min HP% = lowest heroHpM / heroMaxHpM seen on any tick.
import { drawAttempt, MAIN_PERSONAS, PERSONAS, type PersonaId, playLevel } from "@hd2d/balance";
import { contentBundle } from "@hd2d/content";
import { prologueRunConfig } from "@hd2d/sim";

export interface PrologueRun {
  persona: PersonaId;
  seed: number;
  climax: boolean;
  failed: boolean;
  /** Seconds of live typing (combat ticks) at PrologueClimax; null when the climax never came. */
  typingS: number | null;
  simS: number;
  casts: Record<string, number>;
  passives: string[];
  minHpPct: number;
  /** Share of combat ticks (%) with hero HP below 50%. */
  lowHpPct: number;
}

export interface PrologueRow {
  persona: PersonaId;
  n: number;
  typingMin: number;
  typingMean: number;
  typingMax: number;
  /** Casts per kit active: mean and minimum over the runs. */
  castsMean: Record<string, number>;
  castsMin: Record<string, number>;
  passivesMin: number;
  passivesUnion: string[];
  castsPerMinMax: number;
  minHpPct: number;
  lowHpMean: number;
  lowHpMax: number;
  maxTypingS: number;
  failures: number;
  noClimax: number;
  /** Runs in which the hero never lost any HP. */
  unhurt: number;
}

/** Plan §5 P1.3 targets. The typing window is judged on the persona mean (each run draws +-10% WPM noise). */
export const PROLOGUE_TARGETS = {
  typingS: { beginner: [50, 65], average: [38, 50], fast: [28, 40] } as Record<
    string,
    [number, number]
  >,
  minCastsEach: 1,
  minPassives: 5,
  maxLowHpMeanPct: 25,
  maxBeginnerTypingS: 75,
  maxCastsPerMin: 40,
} as const;

const SEED_BASE = 20_261_010;

export function runPrologue(persona: PersonaId, i: number): PrologueRun {
  const p = PERSONAS.find((x) => x.id === persona);
  if (p === undefined) throw new Error(`unknown persona ${persona}`);
  const seed = (SEED_BASE + PERSONAS.indexOf(p) * 1_000_003 + i * 7_919) >>> 0;
  const cfg = prologueRunConfig(contentBundle);
  const casts: Record<string, number> = {};
  for (const a of contentBundle.prologue?.kit.actives ?? []) casts[a.id] = 0;
  const passives = new Set<string>();
  let climaxTicks: number | null = null;
  let minHp = 1;
  let lastTick = -1;
  let combatTicks = 0;
  let lowTicks = 0;
  const rec = playLevel({
    def: cfg.def,
    loadout: cfg.loadout,
    seed,
    attempt: drawAttempt(p, seed, true),
    options: cfg.options,
    observe: (s, evs) => {
      const frac = s.run.heroHpM / s.run.heroMaxHpM;
      minHp = Math.min(minHp, frac);
      if (s.tick !== lastTick && s.phase === "combat") {
        lastTick = s.tick;
        combatTicks++;
        if (frac < 0.5) lowTicks++;
      }
      for (const e of evs) {
        if (e.type === "SkillCast") casts[e.skillId] = (casts[e.skillId] ?? 0) + 1;
        else if (e.type === "PassiveTriggered") passives.add(e.passiveId);
        else if (e.type === "PrologueClimax") climaxTicks = s.run.activeTicks;
      }
    },
  });
  return {
    persona,
    seed,
    climax: climaxTicks !== null,
    failed: rec.failReason !== null,
    typingS: climaxTicks === null ? null : climaxTicks / 60,
    simS: rec.simS,
    casts,
    passives: [...passives].sort(),
    minHpPct: minHp * 100,
    lowHpPct: combatTicks === 0 ? 0 : (lowTicks * 100) / combatTicks,
  };
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarize(runs: readonly PrologueRun[], persona: PersonaId): PrologueRow {
  const rs = runs.filter((r) => r.persona === persona);
  const typ = rs.flatMap((r) => (r.typingS === null ? [] : [r.typingS]));
  const ids = Object.keys(rs[0]?.casts ?? {});
  const castsMean: Record<string, number> = {};
  const castsMin: Record<string, number> = {};
  for (const id of ids) {
    castsMean[id] = mean(rs.map((r) => r.casts[id] ?? 0));
    castsMin[id] = Math.min(...rs.map((r) => r.casts[id] ?? 0));
  }
  const perMin = rs.map((r) =>
    r.typingS === null ? 0 : (Object.values(r.casts).reduce((a, b) => a + b, 0) * 60) / r.typingS,
  );
  return {
    persona,
    n: rs.length,
    typingMin: Math.min(...typ),
    typingMean: mean(typ),
    typingMax: Math.max(...typ),
    castsMean,
    castsMin,
    passivesMin: Math.min(...rs.map((r) => r.passives.length)),
    passivesUnion: [...new Set(rs.flatMap((r) => r.passives))].sort(),
    castsPerMinMax: Math.max(...perMin),
    minHpPct: Math.min(...rs.map((r) => r.minHpPct)),
    lowHpMean: mean(rs.map((r) => r.lowHpPct)),
    lowHpMax: Math.max(...rs.map((r) => r.lowHpPct)),
    maxTypingS: Math.max(...typ),
    failures: rs.filter((r) => r.failed).length,
    unhurt: rs.filter((r) => r.minHpPct >= 99.9).length,
    noClimax: rs.filter((r) => !r.climax).length,
  };
}

export interface PrologueGate {
  runs: PrologueRun[];
  rows: PrologueRow[];
  failures: string[];
}

export function runPrologueGate(seeds: number): PrologueGate {
  const runs: PrologueRun[] = [];
  const failures: string[] = [];
  for (const persona of MAIN_PERSONAS)
    for (let i = 0; i < seeds; i++) {
      try {
        runs.push(runPrologue(persona, i));
      } catch (e) {
        failures.push(`prologue sim exception: ${persona} #${i}: ${String(e)}`);
      }
    }
  const rows = MAIN_PERSONAS.map((p) => summarize(runs, p));
  const T = PROLOGUE_TARGETS;
  for (const r of rows) {
    if (r.failures > 0) failures.push(`prologue ${r.persona}: ${r.failures} fails`);
    if (r.noClimax > 0)
      failures.push(`prologue ${r.persona}: ${r.noClimax} runs never reached the climax`);
    const [lo, hi] = T.typingS[r.persona] as [number, number];
    if (r.typingMean < lo || r.typingMean > hi)
      failures.push(
        `prologue ${r.persona}: mean typing ${r.typingMean.toFixed(1)}s outside ${lo}-${hi}s`,
      );
    const need = T.minCastsEach;
    for (const [id, m] of Object.entries(r.castsMin))
      if (m < need) failures.push(`prologue ${r.persona}: ${id} min casts ${m} < ${need}`);
    // Passive proxy = the sim's own PassiveTriggered event. Calm Mind (a permanent guard-window bonus) never emits it, so
    // at most 8 of the 9 can show. Judged as the union over the persona's runs. Typing time is judged on the MEAN.
    if (r.passivesUnion.length < T.minPassives)
      failures.push(
        `prologue ${r.persona}: ${r.passivesUnion.length} distinct passives over ${r.n} runs < ${T.minPassives}`,
      );
    if (r.lowHpMean > T.maxLowHpMeanPct)
      failures.push(
        `prologue ${r.persona}: hero below 50% HP for ${r.lowHpMean.toFixed(1)}% of combat (> ${T.maxLowHpMeanPct}%)`,
      );
    if (r.persona === "beginner" && r.maxTypingS > T.maxBeginnerTypingS)
      failures.push(
        `prologue beginner: slowest run ${r.maxTypingS.toFixed(1)}s > ${T.maxBeginnerTypingS}s`,
      );
    if (r.castsPerMinMax > T.maxCastsPerMin)
      failures.push(
        `prologue ${r.persona}: casts/min ${r.castsPerMinMax.toFixed(1)} > ${T.maxCastsPerMin}`,
      );
  }
  return { runs, rows, failures };
}

const fmt = (head: string[], rows: string[][]): string[] => {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (r: string[]): string => r.map((x, i) => x.padEnd(w[i] as number)).join("  ");
  return [line(head), line(w.map((n) => "-".repeat(n))), ...rows.map(line)];
};

export function prologueTable(g: PrologueGate): string {
  const f1 = (x: number): string => x.toFixed(1);
  const lines = fmt(
    [
      "persona",
      "typing s min/mean/max",
      "window",
      "passives min",
      "casts/min max",
      "min HP%",
      "HP<50% ticks mean/max",
      "fails",
      "runs never hurt",
    ],
    g.rows.map((r) => [
      r.persona,
      `${f1(r.typingMin)} / ${f1(r.typingMean)} / ${f1(r.typingMax)}`,
      (PROLOGUE_TARGETS.typingS[r.persona] as [number, number]).join("-"),
      `${r.passivesMin} (union ${r.passivesUnion.length})`,
      f1(r.castsPerMinMax),
      f1(r.minHpPct),
      `${f1(r.lowHpMean)}% / ${f1(r.lowHpMax)}%`,
      String(r.failures + r.noClimax),
      String(r.unhurt),
    ]),
  );
  const ids = Object.keys(g.rows[0]?.castsMean ?? {});
  lines.push(
    "",
    "casts per kit active (mean / min over runs; typing window is judged on the persona MEAN)",
  );
  lines.push(
    ...fmt(
      ["persona", ...ids],
      g.rows.map((r) => [
        r.persona,
        ...ids.map((id) => `${f1(r.castsMean[id] ?? 0)} / ${r.castsMin[id] ?? 0}`),
      ]),
    ),
  );
  lines.push(
    "",
    `passives seen (union): ${[...new Set(g.rows.flatMap((r) => r.passivesUnion))].join(", ")}`,
  );
  return lines.join("\n");
}

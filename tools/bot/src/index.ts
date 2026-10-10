// Headless sim playtest gate (plan T6.2 / §8 gate 3): all levels x 3 personas x N seeds through packages/sim, using
// tools/balance's persona runner as a library.
import {
  bundleForLevel,
  CH1_LEVELS,
  chapterLevels,
  type GimmickMode,
  type Job,
  type JobResult,
  MAIN_PERSONAS,
  PERSONAS,
  type PersonaId,
  planTargetsFor,
  type RunRecord,
  runJob,
  runJobs,
} from "@hd2d/balance";

export const NAME = "@hd2d/bot";

/** The bot's tick cap (20 min of sim time): a run that reaches it ended neither cleared nor failed. */
const MAX_SIM_S = 72_000 / 60;
const BOSS = CH1_LEVELS[CH1_LEVELS.length - 1] as string;

export interface GateOptions {
  seeds: number;
  workers?: number;
  gimmicks: GimmickMode;
  personas?: readonly PersonaId[];
  levels?: readonly string[];
  /** Chapter to gate (default 1). Ch2 runs the placeholder stub levels until T4.3 (the L10 stub has no boss). */
  chapter?: number;
}

export interface Cell {
  persona: PersonaId;
  levelId: string;
  n: number;
  cleared: number;
  /** Mean "active" minutes (sim time + results screen) over all runs. */
  activeMin: number;
}

export interface GateResult {
  cells: Cell[];
  failures: string[];
  runs: number;
  records: JobResult[];
}

/** Wilson score interval for k / n at z (default 2.58 = 99%). */
export function wilson(k: number, n: number, z = 2.58): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

export function cellsOf(results: readonly JobResult[]): Cell[] {
  return results.map(({ job, records }) => ({
    persona: job.persona,
    levelId: job.levelId,
    n: records.length,
    cleared: records.filter((r) => r.cleared).length,
    activeMin: mean(records.map((r) => r.activeS)) / 60,
  }));
}

export async function runGate(o: GateOptions): Promise<GateResult> {
  const personas = o.personas ?? MAIN_PERSONAS;
  const chapter = o.chapter ?? 1;
  const levels = o.levels ?? chapterLevels(chapter);
  const targets = planTargetsFor(chapter);
  const isBossLevel = (id: string): boolean =>
    bundleForLevel(id).levels.find((l) => l.id === id)?.kind === "boss";
  const bossId = levels.find(isBossLevel);
  const jobs: Job[] = [];
  for (const persona of personas)
    for (const levelId of levels)
      jobs.push({ persona, levelId, seeds: o.seeds, noise: true, gimmicks: o.gimmicks });
  const failures: string[] = [];
  let records: JobResult[] = [];
  try {
    records = await runJobs(jobs, o.workers);
  } catch (e) {
    failures.push(`sim exception: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return { cells: [], failures, runs: 0, records };
  }
  const cells = cellsOf(records);
  let runs = 0;
  for (const { job, records: rs } of records) {
    runs += rs.length;
    for (const r of rs) {
      if ((!r.cleared && r.failReason === null) || r.simS >= MAX_SIM_S)
        failures.push(`timeout: ${job.persona} ${job.levelId} seed ${r.seed} (${r.simS}s sim)`);
    }
  }
  for (const c of cells)
    if (c.cleared === 0) failures.push(`never cleared: ${c.persona} ${c.levelId} (0/${c.n})`);

  // First-try clear targets (plan §9 via PLAN_TARGETS), judged on the 99% Wilson interval so a small seed count
  // (--quick) cannot fail a target by luck: fail only when the whole interval misses the target.
  for (const persona of personas) {
    if (persona === "ref") continue;
    const t = targets[persona];
    const mine = cells.filter((c) => c.persona === persona);
    for (const c of mine) {
      const target = c.levelId === bossId ? t.clearBoss : t.clearNormal;
      const [, hi] = wilson(c.cleared, c.n);
      if (hi < target)
        failures.push(
          `clear target: ${persona} ${c.levelId} ${c.cleared}/${c.n} (upper 99% bound ${pct(hi)} < ${pct(target)})`,
        );
    }
    const boss = mine.find((c) => c.levelId === bossId);
    if (boss !== undefined && t.clearBossWindow !== undefined) {
      const [lo, hi] = wilson(boss.cleared, boss.n);
      const [wlo, whi] = t.clearBossWindow;
      if (hi < wlo || lo > whi)
        failures.push(
          `boss clear window: ${persona} ${boss.cleared}/${boss.n} (99% CI ${pct(lo)}-${pct(hi)} misses ${pct(wlo)}-${pct(whi)})`,
        );
    }
  }

  // Determinism: re-run the first seed of every job inline and compare the final state hash.
  for (const { job, records: rs } of records) {
    const first = rs[0];
    if (first === undefined) continue;
    let again: RunRecord | undefined;
    try {
      again = runJob({ ...job, seeds: 1 })[0];
    } catch (e) {
      failures.push(`sim exception on rerun: ${job.persona} ${job.levelId}: ${String(e)}`);
      continue;
    }
    if (again === undefined || again.stateHash !== first.stateHash)
      failures.push(
        `non-deterministic: ${job.persona} ${job.levelId} seed ${first.seed}: ${first.stateHash} vs ${again?.stateHash}`,
      );
  }
  return { cells, failures, runs, records };
}

/** Compact table: one row per level, one column per persona (clears/seeds, %, mean active minutes). */
export function table(cells: readonly Cell[], personas: readonly PersonaId[]): string {
  const levels = [...new Set(cells.map((c) => c.levelId))];
  const label = (p: PersonaId): string => PERSONAS.find((x) => x.id === p)?.label ?? p;
  const head = ["level", ...personas.map(label)];
  const rows = levels.map((l) => [
    l,
    ...personas.map((p) => {
      const c = cells.find((x) => x.persona === p && x.levelId === l);
      return c === undefined
        ? "-"
        : `${c.cleared}/${c.n} ${pct(c.cleared / c.n).padStart(4)}  ${c.activeMin.toFixed(2)}m`;
    }),
  ]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (r: string[]): string => r.map((x, i) => x.padEnd(w[i] as number)).join("  ");
  return [line(head), line(w.map((n) => "-".repeat(n))), ...rows.map(line)].join("\n");
}

export interface Delta {
  persona: PersonaId;
  bossClearFree: number;
  bossClearReal: number;
  /** L4..L9 mean active minutes per level, free then realistic. */
  levelMinFree: number[];
  levelMinReal: number[];
  bossMinFree: number;
  bossMinReal: number;
  decodedPerRun: number;
  unreadFadedPerRun: number;
}

export function gimmickDeltas(free: GateResult, real: GateResult): Delta[] {
  const out: Delta[] = [];
  for (const persona of MAIN_PERSONAS) {
    const pick = (g: GateResult, l: string): Cell =>
      g.cells.find((x) => x.persona === persona && x.levelId === l) as Cell;
    const mids = CH1_LEVELS.slice(3, 9);
    const rr = real.records.filter((r) => r.job.persona === persona).flatMap((r) => r.records);
    out.push({
      persona,
      bossClearFree: pick(free, BOSS).cleared / pick(free, BOSS).n,
      bossClearReal: pick(real, BOSS).cleared / pick(real, BOSS).n,
      levelMinFree: mids.map((l) => pick(free, l).activeMin),
      levelMinReal: mids.map((l) => pick(real, l).activeMin),
      bossMinFree: pick(free, BOSS).activeMin,
      bossMinReal: pick(real, BOSS).activeMin,
      decodedPerRun: mean(rr.map((r) => r.decoded)),
      unreadFadedPerRun: mean(rr.map((r) => r.unreadFaded)),
    });
  }
  return out;
}

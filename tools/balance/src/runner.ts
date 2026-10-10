// Runs persona x level x seed jobs through the real sim. `runJob` is pure (same inputs -> same records), so the worker
// pool only changes wall time, never numbers.
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { type ContentBundle, contentBundle } from "@hd2d/content";
import {
  type LevelOptions,
  type Loadout,
  parLoadout,
  parseLevelId,
  type ResolvedLevel,
  resolveLevel,
} from "@hd2d/sim";
import { type GimmickMode, playLevel, type RunRecord } from "./bot.ts";
import { applyGear, parseGear } from "./gear.ts";
import { drawAttempt, PERSONAS, type PersonaId } from "./personas.ts";
import { applyWhatIf, type WhatIf } from "./whatif.ts";

export const CH1_LEVELS = Array.from(
  { length: 10 },
  (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`,
);

/** Level ids of chapter c (10 levels: ch{c}-l01 .. ch{c}-l10). */
export const chapterLevels = (chapter: number): string[] =>
  Array.from({ length: 10 }, (_, i) => `ch${chapter}-l${String(i + 1).padStart(2, "0")}`);

/** The bundle a level runs against: the shipped bundle (it holds every chapter). */
export const bundleForLevel = (_levelId: string): ContentBundle => contentBundle;

/** Chapter of a level id (1 when the id does not parse). */
export const chapterOfLevel = (levelId: string): number => parseLevelId(levelId)?.chapter ?? 1;

export interface Job {
  persona: PersonaId;
  levelId: string;
  seeds: number;
  noise: boolean;
  whatif?: WhatIf;
  /** starter (default): the Ch1 starter kit. bare: Fireball only, Clean Cut + Steady Hands (no Aegis, no Iron Will). */
  kit?: "starter" | "bare";
  /** free (default): scrambled/faded words are decoded for free. realistic: the T6.2 reading model (bot.ts). */
  gimmicks?: GimmickMode;
  /** T1.5 gear offset (the --gear value): par (default) | par-N | armor+N | weapon+N | all+N. See gear.ts. */
  gear?: string;
}

/** Ch1 starter kit (content skills.ts, no unlockLevel): Fireball + Aegis, Clean Cut + Steady Hands + Iron Will, par gear. */
export function starterLoadout(
  kit: "starter" | "bare" = "starter",
  chapter = 1,
  gear?: string,
): Loadout {
  const l = applyGear(parLoadout(chapter), parseGear(gear));
  l.actives = kit === "bare" ? ["fireball", null] : ["fireball", "aegis"];
  l.passives =
    kit === "bare" ? ["cleanCut", "steadyHands", null] : ["cleanCut", "steadyHands", "ironWill"];
  return l;
}

const defs = new Map<string, ResolvedLevel>();
function def(levelId: string): ResolvedLevel {
  let d = defs.get(levelId);
  if (d === undefined) {
    d = resolveLevel(bundleForLevel(levelId), levelId, { dueWeakWords: [] });
    defs.set(levelId, d);
  }
  return d;
}

/** Seed of the i-th run of (persona, level): distinct per level so chest/loot draws never repeat across levels. */
export const runSeed = (persona: PersonaId, levelId: string, i: number): number => {
  const p = PERSONAS.findIndex((x) => x.id === persona);
  const p2 = parseLevelId(levelId);
  // Ch1: the level's position 0-9 (unchanged); later chapters continue the sequence so seeds stay distinct.
  const l = p2 === null ? -1 : (p2.chapter - 1) * 10 + p2.index - 1;
  return (20_261_008 + p * 1_000_003 + l * 104_729 + i * 7_919) >>> 0;
};

export function runJob(job: Job): RunRecord[] {
  const persona = PERSONAS.find((p) => p.id === job.persona);
  if (persona === undefined) throw new Error(`unknown persona ${job.persona}`);
  const d = def(job.levelId);
  const out: RunRecord[] = [];
  for (let i = 0; i < job.seeds; i++) {
    const seed = runSeed(job.persona, job.levelId, i);
    const attempt = drawAttempt(persona, seed, job.noise);
    const w = job.whatif ?? {};
    if (w.guard !== undefined) attempt.guardAttempt = Math.min(1, attempt.guardAttempt * w.guard);
    const level = applyWhatIf(d, w, attempt.pace);
    const options: LevelOptions = {
      pace: attempt.pace,
      difficulty: "standard",
      comboMode: "gentle",
      caseMode: "auto",
      autoUnlockAfterTypos: 0,
      firstClear: true,
      frontierChapter: chapterOfLevel(job.levelId),
      goldMultBp: 10_000,
      allowExternalRevive: false,
      tutorial: d.tutorial,
    };
    out.push(
      playLevel({
        def: level,
        loadout: starterLoadout(job.kit, chapterOfLevel(job.levelId), job.gear),
        seed,
        attempt,
        options,
        gimmicks: job.gimmicks,
      }),
    );
  }
  return out;
}

export interface JobResult {
  job: Job;
  records: RunRecord[];
}

/** Runs the jobs on a worker pool (`workers <= 1` runs inline). Results come back in job order. */
export async function runJobs(jobs: Job[], workers = availableParallelism()): Promise<JobResult[]> {
  const n = Math.max(1, Math.min(workers, jobs.length));
  if (n <= 1) return jobs.map((job) => ({ job, records: runJob(job) }));
  const results: (JobResult | undefined)[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from(
      { length: n },
      () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL("./worker.ts", import.meta.url));
          const feed = (): void => {
            if (next >= jobs.length) {
              void w.terminate().then(() => resolve());
              return;
            }
            const i = next++;
            w.postMessage({ i, job: jobs[i] });
          };
          w.on("message", (m: { i: number; records: RunRecord[] }) => {
            results[m.i] = { job: jobs[m.i] as Job, records: m.records };
            feed();
          });
          w.on("error", reject);
          feed();
        }),
    ),
  );
  return results as JobResult[];
}

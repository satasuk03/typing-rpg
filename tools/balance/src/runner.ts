// Runs persona x level x seed jobs through the real sim. `runJob` is pure (same inputs -> same records), so the worker
// pool only changes wall time, never numbers.
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { type ContentBundle, contentBundle, isFutureUnlock } from "@hd2d/content";
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
  /** Absent = defaultKit(chapter). See starterLoadout for the kits. */
  kit?: Kit;
  /** free (default): scrambled/faded words are decoded for free. realistic: the T6.2 reading model (bot.ts). */
  gimmicks?: GimmickMode;
  /** T1.5 gear offset (the --gear value): par (default) | par-N | armor+N | weapon+N | all+N. See gear.ts. */
  gear?: string;
}

export type Kit = "progress" | "starter" | "ch1-full" | "bare" | "ch2-reveal";
export const KITS: readonly Kit[] = ["progress", "starter", "ch1-full", "bare", "ch2-reveal"];

/**
 * The balance default kit (PO 2026-10-10 "slow drip"): every chapter plays "progress", the kit a real player holds when the
 * level starts under content skills.ts's unlock schedule (docs/balance-ch1.md §10, balance-ch2.md §10).
 */
export const defaultKit = (_chapter: number): Kit => "progress";

/** Level order key: chapter x 100 + index (an id that does not parse sorts first). */
const levelKey = (levelId: string): number => {
  const p = parseLevelId(levelId);
  return p === null ? 0 : p.chapter * 100 + p.index;
};

/**
 * True when skill `id` is in play when `levelId` starts: no `unlockLevel` (starter kit), or its unlockLevel was
 * first-cleared earlier (a level's own unlock arrives with its first clear, so it is not in play on that level's first
 * try). `levelId` undefined = after every shipped level (every unlock in play). A FUTURE_UNLOCK skill is never in play.
 * Reads content skills.ts, so it cannot drift.
 */
export function unlockedBefore(id: string, levelId: string | undefined): boolean {
  const d = [...contentBundle.actives, ...contentBundle.passives].find((x) => x.id === id);
  if (d === undefined) throw new Error(`unknown skill ${id}`);
  if (isFutureUnlock(d)) return false;
  if (d.unlockLevel === undefined || levelId === undefined) return true;
  return levelKey(d.unlockLevel) < levelKey(levelId);
}

/** Second active slot preference of the "progress" player: Aegis whenever it is owned (balance-ch2.md §1.1). */
const PROGRESS_ACTIVE_2 = ["aegis", "piercingThrust", "slashWave", "reveal"] as const;

/**
 * The balance loadout: par gear (+ the --gear offset) and a kit.
 *  - progress (default): the kit a real player owns when `levelId` starts (content unlock schedule), equipped as
 *    Fireball + Aegis (once owned; else the first owned of Piercing Thrust / Slash Wave / Reveal), and Clean Cut +
 *    (Calm Mind, else Steady Hands) + Iron Will, each once owned. Fireball stays: it is the only damage active the
 *    skill-share target counts on. Aegis keeps slot 2: it is worth ~30 points of Beginner boss clear (balance-ch2.md
 *    §1.1). Piercing Thrust, Slash Wave and Riposte are owned from ch1-l07 / ch2-l07 / ch2-l09 but not equipped.
 *  - starter: the new-save kit only (content skills.ts, no unlockLevel): Fireball, Clean Cut.
 *  - ch1-full: the pre-"slow drip" balance kit on every level: Fireball + Aegis, Clean Cut + Steady Hands + Iron Will
 *    (the T6.1 baseline; `--kit ch1-full` reproduces the Ch1 "before" table).
 *  - bare: Fireball, Clean Cut + Steady Hands (the solve-hits reference build: no barrier, no reduced block damage).
 *  - ch2-reveal: progress plus Reveal in Aegis's slot once owned (ch2-l02 clear, so from ch2-l03). Sensitivity only: the
 *    player who equips the new active (PO question, balance-ch2.md §8).
 * `levelId` gates the unlocks (undefined = every shipped unlock in play).
 */
export function starterLoadout(
  kit: Kit = "ch1-full",
  chapter = 1,
  gear?: string,
  levelId?: string,
): Loadout {
  const l = applyGear(parLoadout(chapter), parseGear(gear));
  const has = (id: string): boolean => unlockedBefore(id, levelId);
  if (kit === "bare") {
    l.actives = ["fireball", null];
    l.passives = ["cleanCut", "steadyHands", null];
  } else if (kit === "starter") {
    l.actives = ["fireball", null];
    l.passives = ["cleanCut", null, null];
  } else if (kit === "ch1-full") {
    l.actives = ["fireball", "aegis"];
    l.passives = ["cleanCut", "steadyHands", "ironWill"];
  } else {
    const second =
      kit === "ch2-reveal" && has("reveal")
        ? "reveal"
        : (PROGRESS_ACTIVE_2.find((id) => has(id)) ?? null);
    l.actives = ["fireball", second];
    l.passives = [
      "cleanCut",
      has("calmMind") ? "calmMind" : has("steadyHands") ? "steadyHands" : null,
      has("ironWill") ? "ironWill" : null,
    ];
  }
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
    if (w.readWpm !== undefined) attempt.readWpm = w.readWpm;
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
        loadout: starterLoadout(
          job.kit ?? defaultKit(chapterOfLevel(job.levelId)),
          chapterOfLevel(job.levelId),
          job.gear,
          job.levelId,
        ),
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

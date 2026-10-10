// The three economy_sim personas at their Chapter 1 starting skill (docs/brainstorm/sim/economy_sim.py PERSONAS, wpm0 /
// acc0 / guard0) and the per-attempt noise model of economy_sim.fight():
//   perf     = max(0.45, gauss(1, PERF_SD 0.10))      -> attempt WPM = wpm0 x perf ("+-10% WPM noise")
//   acc_run  = clamp(acc0 + gauss(0, ACC_SD 0.012), 0.70, 0.995)
//   guard    = clamp(guard0 + gauss(0, GUARD_SD 0.06), 0, 0.95)
// The game's pace (enemy intervals, guard window, Doom timer) is the in-level net WPM, as in economy_sim (pace = wpm_eff).

export type PersonaId = "beginner" | "average" | "fast" | "ref";

export interface Persona {
  id: PersonaId;
  label: string;
  wpm: number;
  acc: number;
  /** economy_sim guard0: probability that a guard word is typed in time (block; a perfect one parries). */
  guard: number;
  /**
   * Bot attempt rate for guard words, calibrated so that the measured guarded share of LANDED attacks ((blocked +
   * parried) / every impact: hit, blocked, parried or absorbed by a barrier) equals `guard` (economy_sim's guard_mult has
   * no barrier, so an absorbed hit is an unguarded one). An attempted guard word can still fail (too slow, typos), and an
   * ignored one is sometimes answered by killing or Breaking the enemy before the impact (not an attack in economy_sim).
   * Calibration: tools/balance --calibrate-guard (docs/balance-ch1.md).
   */
  guardAttempt: number;
  /**
   * T5.1: silent reading speed (words per minute) for the Ch2 Riddle of Leaves clue (bot.ts RIDDLE_READ). English typing
   * speed tracks English fluency, so it rises with the persona: a learner ~120, a fluent adult ~220 (native silent reading
   * is ~240). Documented guesses (docs/balance-ch2.md §1); Ch1 never reads a riddle.
   */
  readWpm: number;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "beginner",
    label: "Beginner 20 WPM",
    wpm: 20,
    acc: 0.88,
    guard: 0.4,
    guardAttempt: 0.6,
    readWpm: 120,
  },
  {
    id: "average",
    label: "Average 40 WPM",
    wpm: 40,
    acc: 0.94,
    guard: 0.6,
    guardAttempt: 0.71,
    readWpm: 170,
  },
  {
    id: "fast",
    label: "Fast 75 WPM",
    wpm: 75,
    acc: 0.97,
    guard: 0.75,
    guardAttempt: 0.74,
    readWpm: 220,
  },
  // economy_sim's authoring reference typist (REF_WPM / REF_ACC / REF_GUARD at chapter 1): only for plan §9's
  // "auto-attacks per encounter (35 WPM ref) ~11" row.
  {
    id: "ref",
    label: "Reference 35 WPM",
    wpm: 35,
    acc: 0.92,
    guard: 0.6,
    guardAttempt: 0.73,
    readWpm: 150,
  },
];

export const MAIN_PERSONAS: readonly PersonaId[] = ["beginner", "average", "fast"];

export const PERF_SD = 0.1;
export const ACC_SD = 0.012;
export const GUARD_SD = 0.06;
/** economy_sim COMBAT_TYPING_EFF: reading + target switching, 35 WPM -> ~2.4 chars/s in combat. */
export const COMBAT_TYPING_EFF = 0.82;

export interface Attempt {
  wpm: number;
  acc: number;
  /** economy_sim guard draw of this attempt. */
  guard: number;
  /** The bot's guard attempt probability for this attempt (guard draw x guardAttempt / guard). */
  guardAttempt: number;
  pace: number;
  /** T5.1: the persona's reading speed for riddle clues (no noise). Absent = bot.ts RIDDLE_READ.wpm. */
  readWpm?: number;
}

/** mulberry32: a small seeded PRNG for the persona noise (tools only; the sim keeps its own RNG streams). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** One attempt's skill draw (economy_sim.fight). `noise: false` returns the persona's nominal values. */
export function drawAttempt(p: Persona, seed: number, noise = true): Attempt {
  if (!noise)
    return {
      wpm: p.wpm,
      acc: p.acc,
      guard: p.guard,
      guardAttempt: p.guardAttempt,
      pace: p.wpm,
      readWpm: p.readWpm,
    };
  const r = prng(seed ^ 0x9e3779b9);
  const perf = Math.max(0.45, 1 + PERF_SD * gauss(r));
  const acc = clamp(p.acc + ACC_SD * gauss(r), 0.7, 0.995);
  const guard = clamp(p.guard + GUARD_SD * gauss(r), 0, 0.95);
  const wpm = p.wpm * perf;
  const guardAttempt = Math.min(1, (guard * p.guardAttempt) / p.guard);
  return { wpm, acc, guard, guardAttempt, pace: Math.round(wpm), readWpm: p.readWpm };
}

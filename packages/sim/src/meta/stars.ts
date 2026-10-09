// Pace and star evaluation (docs/interfaces.md §8; doc 01 §6.3, doc 02 C11/C12). Pure integer math.
import type { StarChallenge } from "@hd2d/content";
import { K } from "../balance.ts";
import { type Bp, bp, clampInt, cmpStr, divCeil, mulDiv } from "../fixed.ts";
import type { Difficulty, LevelResult, ResolvedStar } from "../types.ts";

/** Pace: median of the last 10 level net WPM values, else the calibration WPM, else PACE_REF (35); clamped 15..120. */
export function computePace(
  lastLevelNetWpm: readonly number[],
  calibrationWpm: number | null,
): number {
  let p: number;
  if (lastLevelNetWpm.length > 0) {
    const s = lastLevelNetWpm.slice(-10).sort((a, b) => a - b);
    const mid = s.length >> 1;
    // even count: floor of the mean of the two middle values (integers only)
    p =
      s.length % 2 === 1
        ? (s[mid] as number)
        : Math.floor(((s[mid - 1] as number) + (s[mid] as number)) / 2);
  } else if (calibrationWpm !== null) p = calibrationWpm;
  else p = K.PACE_DEFAULT;
  return clampInt(Math.round(p), K.PACE_MIN, K.PACE_MAX);
}

/**
 * Median accuracy (bp) of the days within the last 7 days ending `today` (inclusive), or null with no history.
 * Day keys are "YYYY-MM-DD"; they sort and compare as strings (cmpStr). The window start is computed from the key
 * by civil-calendar arithmetic, never from a clock. An even count takes the floor of the mean of the middle two.
 */
export function median7dAccuracyBp(
  daily: readonly { day: string; accuracyBp: Bp }[],
  today: string,
): Bp | null {
  const from = addDays(today, -6);
  const xs: number[] = [];
  for (const d of daily)
    if (cmpStr(d.day, from) >= 0 && cmpStr(d.day, today) <= 0) xs.push(d.accuracyBp);
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  const mid = xs.length >> 1;
  return xs.length % 2 === 1
    ? (xs[mid] as number)
    : Math.floor(((xs[mid - 1] as number) + (xs[mid] as number)) / 2);
}

/** Days since 1970-01-01 of a "YYYY-MM-DD" key (civil-from-days algorithm; integers only). */
function dayNumber(key: string): number {
  const y0 = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
const pad = (n: number, w: number): string => String(n).padStart(w, "0");
function fromDayNumber(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}
/** Day key `n` days from `key` (n may be negative). */
export const addDays = (key: string, n: number): string => fromDayNumber(dayNumber(key) + n);

/** The accuracy (bp) needed for the second star: clamp(median + margin, 88%, 97%); no history -> the lower clamp. */
export function star2ThresholdBp(median7d: Bp | null): Bp {
  if (median7d === null) return K.STAR2_CLAMP_LO_BP;
  return clampInt(median7d + K.STAR2_REL_MARGIN_BP, K.STAR2_CLAMP_LO_BP, K.STAR2_CLAMP_HI_BP);
}

/** Converts a content StarChallenge to the sim's integer form (parTime.slack -> slackBp); a resolved one passes through. */
export function resolveStar3(s: StarChallenge | ResolvedStar): ResolvedStar {
  if (s.kind !== "parTime") return s;
  return "slackBp" in s ? s : { kind: "parTime", slackBp: bp(s.slack) };
}

/** Par time in ticks: ceil(parRefTicks x 35 / pace x slack), with the slack in basis points. */
export function parTimeTicksBp(parRefTicks: number, pace: number, slackBp: Bp): number {
  return divCeil(mulDiv(parRefTicks, K.PACE_DEFAULT * slackBp, 1), pace * 10_000);
}

/** Par time of a parTime challenge in ticks (slack as authored, e.g. 1.15). */
export function parTimeTicks(parRefTicks: number, pace: number, slack: number): number {
  return parTimeTicksBp(parRefTicks, pace, bp(slack));
}

/** Whether the level's third-star challenge was met by this result (the result must be a clear). */
export function challengeMet(
  result: LevelResult,
  star3Input: StarChallenge | ResolvedStar,
  parRefTicks: number,
  pace: number,
): boolean {
  if (result.outcome !== "cleared") return false;
  const star3 = resolveStar3(star3Input);
  const s = result.stats;
  switch (star3.kind) {
    case "untouched":
      return s.hitsTaken <= star3.maxHits; // hitsTaken counts hits that dealt HP damage (blocked / barrier hits do not)
    case "parTime":
      return result.activeTicks <= parTimeTicksBp(parRefTicks, pace, star3.slackBp);
    case "streak":
      return s.maxCombo >= star3.combo;
    case "guardian":
      return s.perfectParries >= star3.parries;
    case "noSkills":
      return s.skillsCast === 0;
  }
}

/**
 * Stars: 1 = cleared. 2 = cleared and accuracy >= star2ThresholdBp(median7d). 3 = cleared and the level challenge met.
 * Zen difficulty (enemies never attack) earns no stars beyond the first (doc 01 Zen Mode); pass `difficulty` to apply it.
 */
export function evaluateStars(input: {
  result: LevelResult;
  star3: StarChallenge | ResolvedStar;
  parRefTicks: number;
  pace: number;
  median7dAccuracyBp: Bp | null;
  difficulty?: Difficulty;
}): [boolean, boolean, boolean] {
  const { result } = input;
  const cleared = result.outcome === "cleared";
  if (!cleared) return [false, false, false];
  if (input.difficulty === "zen") return [true, false, false];
  return [
    true,
    result.stats.accuracyBp >= star2ThresholdBp(input.median7dAccuracyBp),
    challengeMet(result, input.star3, input.parRefTicks, input.pace),
  ];
}

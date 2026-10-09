// Weak-word spaced repetition: a Leitner scheduler with 5 boxes (docs/interfaces.md §8, doc 01 §5.4, D29).
// Intervals are in LEVELS PLAYED: [1, 2, 4, 8, 16]. Pure and deterministic; never touches a clock or localeCompare.
import { cmpStr } from "../fixed.ts";
import type { SrsEntry, SrsState, WordResult } from "../types.ts";

export const SRS_INTERVALS: readonly number[] = [1, 2, 4, 8, 16];
export const NEW_SRS: SrsState = { levelsPlayed: 0, entries: {}, mastered: [] };

type Box = SrsEntry["box"];
const interval = (box: Box): number => SRS_INTERVALS[box - 1] as number;

/** Keys that are due now (due <= levelsPlayed), ordered by (due, box, key by cmpStr), at most `limit`. */
export function srsDue(srs: SrsState, limit: number): string[] {
  const due: [string, SrsEntry][] = [];
  for (const key of Object.keys(srs.entries)) {
    const e = srs.entries[key] as SrsEntry;
    if (e.due <= srs.levelsPlayed) due.push([key, e]);
  }
  due.sort((a, b) => a[1].due - b[1].due || a[1].box - b[1].box || cmpStr(a[0], b[0]));
  return due.slice(0, Math.max(0, limit)).map(([k]) => k);
}

/**
 * Applies one level's word results. Only `word` plates count (guard / sentence plates are not SRS material), and a
 * word seen several times in the level is judged once: it FAILED if any occurrence had a typo or ran below 50% of
 * `pace` WPM (wpm x 2 < pace), and was PERFECT if every occurrence was perfect and none was slow.
 *  - failed, absent: enters box 1, due next level. Failed, present: box = max(1, box - 1), lapses++ (D29); due = levelsPlayed + interval(box).
 *  - perfect, present and due: box 5 -> mastered (leaves the entries, joins `mastered`); else box + 1,
 *    due = levelsPlayed + interval(new box). Perfect but not due, or absent: unchanged.
 *  - a mastered word that fails again re-enters box 1 and leaves `mastered`.
 * `levelsPlayed` is incremented after applying. Returns a new state; the input is not mutated.
 */
export function srsUpdate(srs: SrsState, words: readonly WordResult[], pace: number): SrsState {
  const n = srs.levelsPlayed;
  const entries: Record<string, SrsEntry> = {};
  for (const k of Object.keys(srs.entries)) entries[k] = { ...(srs.entries[k] as SrsEntry) };
  const mastered = [...srs.mastered];

  const order: string[] = [];
  const seen: Record<string, { failed: boolean; perfect: boolean }> = {};
  for (const w of words) {
    if (w.kind !== "word") continue;
    const slow = w.wpm * 2 < pace;
    const failed = w.typos > 0 || slow;
    const cur = seen[w.wordKey];
    if (cur === undefined) {
      seen[w.wordKey] = { failed, perfect: w.perfect && !slow };
      order.push(w.wordKey);
    } else {
      cur.failed = cur.failed || failed;
      cur.perfect = cur.perfect && w.perfect && !slow;
    }
  }

  for (const key of order) {
    const r = seen[key] as { failed: boolean; perfect: boolean };
    const e = entries[key];
    if (r.failed) {
      if (e === undefined) {
        entries[key] = { box: 1, due: n + interval(1), lapses: 0 };
        const mi = mastered.indexOf(key);
        if (mi >= 0) mastered.splice(mi, 1);
      } else {
        const box = Math.max(1, e.box - 1) as Box;
        entries[key] = { box, due: n + interval(box), lapses: e.lapses + 1 };
      }
    } else if (r.perfect && e !== undefined && e.due <= n) {
      if (e.box === 5) {
        delete entries[key];
        if (!mastered.includes(key)) mastered.push(key);
      } else {
        const box = (e.box + 1) as Box;
        entries[key] = { box, due: n + interval(box), lapses: e.lapses };
      }
    }
  }
  return { levelsPlayed: n + 1, entries, mastered };
}

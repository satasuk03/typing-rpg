// Typing gimmicks (T1.5; doc 01 §4.1, interfaces §3.2 step 4, §4 "gimmicks", §5 PlateView.faded / display).
//  - Fading word: a gimmick enemy's word plate fades FADE_DELAY after it is shown (WordFaded; PlateView.faded). The typed
//    chars stay visible; the renderer hides the not-yet-typed letters. Escape does not bring the letters back.
//  - Scrambled word: the plate shows its letters scrambled; the typed answer is the unscrambled word. The first correct
//    letter locks the target and unscrambles the plate for good (WordUnscrambled, typing.ts).
// Gimmicks never break the distinct-first-letter rule: a scrambled plate's first VISIBLE letter differs from its answer's
// first letter and from every other plate's first letter (visibleFirstLetters also reports it, so later plates avoid it).
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import { below, type RngState } from "./rng.ts";
import type { EncounterState } from "./state.ts";
import type { LevelState } from "./types.ts";
import { firstLetter } from "./words.ts";

/**
 * The scrambled display for `text`, or null when it cannot be scrambled while keeping the rule (every candidate first
 * letter is the answer's own letter or is taken). `forbidden` = case-folded first letters of the other visible plates.
 * Draws from the encounter's `gimmick` stream: one `below` to pick the first visible letter, then a Fisher-Yates pass.
 */
export function scrambleWord(
  rng: RngState,
  text: string,
  forbidden: readonly string[],
): string | null {
  const own = firstLetter(text);
  const candidates: number[] = [];
  for (let j = 1; j < text.length; j++) {
    const c = text.charAt(j);
    const f = firstLetter(c);
    if (c === " " || f === own || forbidden.includes(f)) continue;
    candidates.push(j);
  }
  if (candidates.length === 0) return null;
  const pick = candidates[below(rng, candidates.length)] as number;
  const rest: string[] = [];
  for (let j = 0; j < text.length; j++) if (j !== pick) rest.push(text.charAt(j));
  for (let i = rest.length - 1; i > 0; i--) {
    const k = below(rng, i + 1);
    const tmp = rest[i] as string;
    rest[i] = rest[k] as string;
    rest[k] = tmp;
  }
  return text.charAt(pick) + rest.join("");
}

/** Tick-step 4: Fading words whose fade tick has arrived fade (once). */
export function stepGimmicks(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  for (const p of enc.plates) {
    if (p.fadeAt === null || t < p.fadeAt) continue;
    p.fadeAt = null;
    p.faded = true;
    emit({ type: "WordFaded", tick: t, plateId: p.id, enemyId: p.ownerId as number });
  }
}

/** The tick a Fading plate shown at `shownTick` fades. */
export const fadeTick = (shownTick: number): number => shownTick + K.FADE_DELAY_T;

// Chapter plumbing (docs/interfaces.md §8 v2.0, §13.2): pure helpers over level ids and the bundle. No sim state.
import type { ContentBundle } from "@hd2d/content";

const LEVEL_ID = /^ch(\d+)-l(\d\d)$/;
/** The last level index of a chapter: clearing it ends the chapter and opens the next one. */
const CHAPTER_LAST_INDEX = 10;

/** "ch2-l07" -> { chapter: 2, index: 7 }; null if the id does not match /^ch(\d+)-l(\d\d)$/. */
export function parseLevelId(id: string): { chapter: number; index: number } | null {
  const m = LEVEL_ID.exec(id);
  if (m === null) return null;
  return { chapter: Number(m[1]), index: Number(m[2]) };
}

/** The chapters present in the bundle, ascending (from LevelDef.chapter). */
export function bundleChapters(bundle: ContentBundle): number[] {
  return [...new Set(bundle.levels.map((l) => l.chapter))].sort((a, b) => a - b);
}

/**
 * Unlock rule, by id (never by bundle array order): ch1-l01 is always open; (c, 1) opens when (c-1, 10) is cleared;
 * (c, i>1) opens when (c, i-1) is cleared. Unknown ids (not in the bundle, or malformed) are locked.
 */
export function levelUnlocked(
  cleared: (levelId: string) => boolean,
  bundle: ContentBundle,
  levelId: string,
): boolean {
  if (!bundle.levels.some((l) => l.id === levelId)) return false;
  const p = parseLevelId(levelId);
  if (p === null) return false;
  if (p.chapter === 1 && p.index === 1) return true;
  const prev =
    p.index > 1
      ? { chapter: p.chapter, index: p.index - 1 }
      : { chapter: p.chapter - 1, index: CHAPTER_LAST_INDEX };
  if (prev.chapter < 1) return false;
  return cleared(`ch${prev.chapter}-l${String(prev.index).padStart(2, "0")}`);
}

/**
 * Derived frontier: max(stored, 1 + the highest chapter c whose level (c, 10) is cleared), capped at the highest chapter
 * in the bundle. The client applies it after every result AND on load (old saves with Ch1 cleared open Ch2 with no migration).
 */
export function frontierChapterOf(
  stored: number,
  cleared: (levelId: string) => boolean,
  bundle: ContentBundle,
): number {
  const chapters = bundleChapters(bundle);
  const top = chapters[chapters.length - 1] ?? 1;
  let derived = 1;
  for (const c of chapters) {
    if (cleared(`ch${c}-l${String(CHAPTER_LAST_INDEX).padStart(2, "0")}`)) derived = c + 1;
  }
  return Math.min(Math.max(stored, derived), Math.max(top, 1));
}

/** Chapter tabs on the map: the chapters the game knows about, and which of them the content bundle ships. */
import type { ContentBundle, WordEntry } from "@hd2d/content";
import type { Save } from "../meta/ops";
import { levelUnlocked } from "../meta/ops";

export interface ChapterInfo {
  n: number;
  /** Tab label and map eyebrow. */
  label: string;
  /** Map title. */
  title: string;
  /** Shown while the chapter is locked. */
  lockHint: string;
}

/** Display data per chapter. A chapter whose levels are not in the bundle shows "Coming soon". */
export const CHAPTERS: readonly ChapterInfo[] = [
  { n: 1, label: "Chapter I", title: "The Ember Road", lockHint: "" },
  {
    n: 2,
    label: "Chapter II",
    title: "The Lantern Road",
    lockHint: "Clear Level 10 of Chapter I to enter the Hushwood.",
  },
];

export type ChapterState = "open" | "locked" | "soon";

export const chapterState = (save: Save, bundle: ContentBundle, n: number): ChapterState => {
  const first = bundle.levels.find((l) => l.chapter === n && l.index === 1);
  if (!first) return "soon";
  return levelUnlocked(save, bundle, first.id) ? "open" : "locked";
};

/** The chapter the map should open on: the one the focused level is in, else the frontier (if open). */
export const defaultChapter = (save: Save, bundle: ContentBundle, focus?: string): number => {
  const f = focus ? bundle.levels.find((l) => l.id === focus) : undefined;
  if (f) return f.chapter;
  const fr = save.progress.frontierChapter;
  return chapterState(save, bundle, fr) === "open" ? fr : 1;
};

/** The chapter whose intro card opens before `levelId`, or null (only the first level of a chapter above 1). */
export const introChapterOf = (bundle: ContentBundle, levelId: string): number | null => {
  const l = bundle.levels.find((x) => x.id === levelId);
  return l && l.chapter > 1 && l.index === 1 ? l.chapter : null;
};

/** The chapter intro lines (`uses: intro`), in bundle order, for the biome of the chapter's first level. */
export const introLines = (bundle: ContentBundle, chapter: number): WordEntry[] => {
  const biome = bundle.levels.find((l) => l.chapter === chapter && l.index === 1)?.biome;
  return bundle.words.filter(
    (w) =>
      w.uses.includes("intro") && (biome === undefined || (w.biomes as string[]).includes(biome)),
  );
};

/** Q2: the Willow (ch2-l10) pre-level hint level and the skill it recommends. */
export const WILLOW_LEVEL = "ch2-l10";
export const WILLOW_HINT =
  "The Willow's adds hit hard. A defensive skill such as Aegis helps here.";

/** True when starting `levelId` should first show the Willow loadout hint (Aegis unlocked but not equipped). */
export const needsWillowHint = (save: Save, levelId: string): boolean =>
  levelId === WILLOW_LEVEL &&
  save.unlocks.actives.includes("aegis") &&
  !save.loadout.actives.includes("aegis");

import { contentBundle } from "@hd2d/content";
import type { Page } from "@playwright/test";

/** Word keys (single words) from the shipped content, for journal seeding. */
export const sampleWordKeys = (n: number): string[] =>
  contentBundle.words
    .filter((w) => w.kind === "word")
    .slice(0, n)
    .map((w) => w.key);

export interface SeedOpts {
  /** Levels cleared (1..10), each with 3 stars if `stars`. */
  cleared: number;
  gold?: number;
  caches?: number;
  words?: number;
}

/**
 * Seeds a mid-game profile through the dev hook (`?dev=1`): cleared levels with stars, unlocked skills, a few extra
 * pieces of gear across rarities, journal words with SRS state. Test-only; the app has no such entry point.
 */
export async function seedProgress(page: Page, o: SeedOpts): Promise<void> {
  const words = sampleWordKeys(o.words ?? 48);
  const levelIds = contentBundle.levels.slice(0, o.cleared).map((l) => l.id);
  await page.evaluate(
    ({ levelIds, words, gold, caches }) => {
      const dev = (window as unknown as { __dev: { mutate(fn: (s: never) => void): void } }).__dev;
      dev.mutate(((s: {
        progress: { levels: Record<string, unknown> };
        wallet: { gold: number };
        inventory: {
          gear: { uid: number; defId: string; rarity: string; upgrade: number }[];
          nextGearUid: number;
          unopenedCaches: number;
        };
        unlocks: { actives: string[]; passives: string[] };
        journal: { firstSeen: Record<string, number>; notes: Record<string, string> };
        srs: { levelsPlayed: number; entries: Record<string, unknown>; mastered: string[] };
        cachePity: { sinceRare: number; sinceEpic: number; sinceLegendary: number };
      }) => {
        levelIds.forEach((id, i) => {
          const stars =
            i % 3 === 0
              ? [true, true, true]
              : i % 3 === 1
                ? [true, true, false]
                : [true, false, false];
          s.progress.levels[id] = {
            cleared: true,
            stars,
            bestTicks: 7000 + i * 100,
            attempts: 1 + (i % 2),
          };
        });
        s.wallet.gold = gold;
        s.inventory.unopenedCaches = caches;
        const gear = s.inventory.gear;
        let uid = s.inventory.nextGearUid;
        for (const [defId, rarity, upgrade] of [
          ["sword-t1", "R", 2],
          ["dagger-t1", "L", 0],
          ["staff-t1", "E", 1],
          ["hammer-t1", "U", 0],
          ["armor-t1", "R", 1],
          ["charm-t1", "E", 0],
        ] as const)
          gear.push({ uid: uid++, defId, rarity, upgrade });
        s.inventory.nextGearUid = uid;
        s.unlocks.actives = ["fireball", "aegis", "slashWave", "piercingThrust"];
        s.unlocks.passives = ["cleanCut", "steadyHands", "ironWill", "openingGambit"];
        words.forEach((k, i) => {
          s.journal.firstSeen[k] = i % 5;
        });
        s.srs.levelsPlayed = 8;
        words.slice(0, 6).forEach((k, i) => {
          s.srs.entries[k] = { box: (i % 5) + 1, due: i < 3 ? 6 : 12, lapses: i % 3 };
        });
        s.srs.mastered = words.slice(6, 9);
        s.cachePity = { sinceRare: 3, sinceEpic: 11, sinceLegendary: 47 };
      }) as never);
    },
    { levelIds, words, gold: o.gold ?? 1800, caches: o.caches ?? 3 },
  );
}

/**
 * Building a `RunConfig` for a story level: resolved level data, the starter loadout and level options.
 * Pure (no DOM, no three), so Node tests and the browser build the identical config from the same inputs.
 */
import { type ContentBundle, contentBundle } from "@hd2d/content";
import {
  type ActiveSkillId,
  type LevelOptions,
  type Loadout,
  type PassiveId,
  parLoadout,
  resolveLevel,
} from "@hd2d/sim";
import type { RunConfig } from "./runner";

/** `parLoadout(chapter)` plus the chapter starter kit (actives/passives without an `unlockLevel`). */
export function starterLoadout(bundle: ContentBundle = contentBundle, chapter = 1): Loadout {
  const l = parLoadout(chapter);
  const actives = bundle.actives.filter((a) => a.unlockLevel === undefined).map((a) => a.id);
  const passives = bundle.passives.filter((p) => p.unlockLevel === undefined).map((p) => p.id);
  l.actives = [
    (actives[0] ?? null) as ActiveSkillId | null,
    (actives[1] ?? null) as ActiveSkillId | null,
  ];
  l.passives = [
    (passives[0] ?? null) as PassiveId | null,
    (passives[1] ?? null) as PassiveId | null,
    (passives[2] ?? null) as PassiveId | null,
  ];
  return l;
}

/** A fresh random seed per level run (loot derives from seed + encounter index). Client-side only; never used inside the sim. */
export function freshSeed(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

export interface PlayParams {
  levelId: string;
  seed?: number;
  /** Net WPM the level paces to (15..120). */
  pace?: number;
  difficulty?: LevelOptions["difficulty"];
}

export function makeRunConfig(p: PlayParams, bundle: ContentBundle = contentBundle): RunConfig {
  const def = resolveLevel(bundle, p.levelId, { dueWeakWords: [] });
  const options: LevelOptions = {
    pace: p.pace ?? 35,
    difficulty: p.difficulty ?? "standard",
    comboMode: "gentle",
    caseMode: "auto",
    autoUnlockAfterTypos: 0,
    firstClear: true,
    frontierChapter: def.chapter,
    goldMultBp: 10_000,
    allowExternalRevive: false,
    tutorial: def.tutorial,
  };
  return {
    def,
    loadout: starterLoadout(bundle, def.chapter),
    seed: (p.seed ?? freshSeed()) >>> 0,
    options,
  };
}

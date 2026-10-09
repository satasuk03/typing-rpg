// packages/shared/src/save.ts

import { Rarity } from "@hd2d/content";
import type { LoadoutSource } from "@hd2d/sim";
import { z } from "zod";

export const SAVE_SCHEMA_VERSION = 1;
const U32 = z.number().int().min(0).max(0xffffffff);
const Vol = z.number().min(0).max(1);
const Mode = z.enum(["smart", "asap"]);
export const GearInstance = z.object({
  uid: z.number().int().positive(),
  defId: z.string(),
  rarity: Rarity,
  upgrade: z.number().int().min(0).max(15),
});
export const SaveSummary = z.object({
  schemaVersion: z.number().int(),
  levelMax: z.number().int().min(0),
  stars: z.number().int().min(0).max(900),
  playtimeSec: z.number().int().min(0),
});
export type SaveSummary = z.infer<typeof SaveSummary>;
export const SaveBlobV1 = z.object({
  schemaVersion: z.literal(1),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
  playtimeSec: z.number().int().min(0),
  settings: z.object({
    comboMode: z.enum(["gentle", "strict", "zen"]),
    difficulty: z.enum(["story", "standard", "hard", "zen"]),
    caseMode: z.enum(["auto", "strict"]),
    autoUnlock: z.boolean(),
    effectsIntensity: z.number().min(0).max(1),
    reducedMotion: z.boolean(),
    reducedFlash: z.boolean(),
    volumes: z.object({ master: Vol, sfx: Vol, ambience: Vol, music: Vol, ui: Vol }),
    translationLang: z.string().nullable(),
  }),
  progress: z.object({
    frontierChapter: z.number().int().min(1),
    levels: z.record(
      z.string(),
      z.object({
        cleared: z.boolean(),
        stars: z.tuple([z.boolean(), z.boolean(), z.boolean()]),
        bestTicks: z.number().int().nullable(),
        attempts: z.number().int(),
      }),
    ),
    starChestsClaimed: z.record(z.string(), z.array(z.number().int())), // chapter -> claimed milestones [10,20,30]
  }),
  pace: z.object({
    calibrationWpm: z.number().int().nullable(),
    recentNetWpm: z.array(z.number().int()).max(10),
  }),
  accuracyDaily: z.array(z.object({ day: z.string(), accuracyBp: z.number().int() })).max(14),
  wallet: z.object({ gold: z.number().int().min(0) }),
  inventory: z.object({
    gear: z.array(GearInstance),
    nextGearUid: z.number().int().positive(),
    unopenedCaches: z.number().int().min(0),
  }),
  equipped: z.object({
    weapon: z.number().int(),
    armor: z.number().int(),
    charm: z.number().int(),
  }), // gear uids
  loadout: z.object({
    actives: z.tuple([z.string().nullable(), z.string().nullable()]),
    activeModes: z.tuple([Mode, Mode]),
    passives: z.tuple([z.string().nullable(), z.string().nullable(), z.string().nullable()]),
  }),
  unlocks: z.object({ actives: z.array(z.string()), passives: z.array(z.string()) }),
  cachePity: z.object({
    sinceRare: z.number().int(),
    sinceEpic: z.number().int(),
    sinceLegendary: z.number().int(),
  }), // client-owned
  metaRng: z.tuple([U32, U32, U32, U32]), // drives cache rolls and per-attempt story seeds
  srs: z.object({
    levelsPlayed: z.number().int(),
    entries: z.record(
      z.string(),
      z.object({
        box: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        due: z.number().int(),
        lapses: z.number().int(),
      }),
    ),
    mastered: z.array(z.string()),
  }),
  journal: z.object({ firstSeen: z.record(z.string(), z.number().int()) }), // wordKey -> levelsPlayed index
  replays: z.object({ day: z.string(), count: z.number().int() }),
  lifetime: z.object({ words: z.number().int(), chars: z.number().int(), typos: z.number().int() }),
});
export const SaveBlob = SaveBlobV1; // alias to the latest version
export type SaveBlob = z.infer<typeof SaveBlob>;
/** Compile-time proof that a save can feed buildLoadout. */
export const saveIsLoadoutSource = (s: SaveBlob): LoadoutSource => s;

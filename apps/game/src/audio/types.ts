/** Shared audio types. No Web Audio calls here, so everything is importable from node tests. */

export type BusId = "sfx" | "ui" | "ambience" | "music";
export type MixerChannel = "master" | BusId;
export const BUS_IDS: readonly BusId[] = ["sfx", "ui", "ambience", "music"];
export const MIXER_CHANNELS: readonly MixerChannel[] = ["master", ...BUS_IDS];

export type BiomeName = "forest" | "ruins" | "cave" | "boss" | "hushwood" | "fen" | "grove";
export const BIOMES: readonly BiomeName[] = [
  "forest",
  "ruins",
  "cave",
  "boss",
  "hushwood",
  "fen",
  "grove",
];

export type MusicState = "walk" | "battle" | "boss" | "victory";
export const MUSIC_STATES: readonly MusicState[] = ["walk", "battle", "boss", "victory"];

/** Every procedural sound effect. `key` is the T2.6 critical path. */
export const SFX_IDS = [
  "key",
  "typo",
  "wordComplete",
  "perfectWord",
  "tierUp",
  "slash",
  "hit",
  "crit",
  "guard",
  "parry",
  "enemyWindup",
  "heroHurt",
  "enemyDeath",
  "break",
  "chestLand",
  "chestOpen",
  "coin",
  "skillFire",
  "skillMagic",
  "explode",
  "heal",
  "encounter",
  "levelUp",
  "victory",
  "bossIntro",
  "uiClick",
  "uiConfirm",
  // ---- Chapter 2 (T3.3) ----
  "wispChime",
  "shadeHiss",
  "mothFlutter",
  "healChime",
  "toadCroak",
  "toadSplash",
  "wolfHowl",
  "wolfBite",
  "willowCreak",
  "whisperLoop",
  "leafStorm",
  "leafRustle",
  "leafPick",
  "riddleRight",
  "riddleWrong",
  "riddleTimeout",
  "capitalKey",
  "willowSigh",
  "chapterSting",
] as const;
export type Sfx = (typeof SFX_IDS)[number];

export interface SfxParams {
  /** Consecutive correct chars (sim `streak`). Drives key pitch and timbre. */
  streak?: number;
  /** Streak tier 1..4 for `tierUp`. */
  tier?: number;
  /** -1..1 */
  pan?: number;
  heavy?: boolean;
  /** Coin count for `coin`, etc. */
  count?: number;
  /** Boss variant for `enemyDeath`. */
  boss?: boolean;
  /** v1.9: `guard` / `parry` that let damage through (cracked-shield accent). */
  leak?: boolean;
}

/** Streak tiers (PO decision): 10 / 25 / 50 / 100 correct chars in a row. */
export type StreakTier = 0 | 1 | 2 | 3 | 4;

export type Rng = () => number;

import type { SpriteFrame } from "./SpriteSource";

type Palette = readonly (readonly number[])[];
export type MonsterArt = "slimeG" | "slimeP" | "bat" | "goblin" | "goblinR" | "golem";
/** Chapter II enemy ids (T2.3, ch2Monsters.ts): `monster.<id>`, plus `monster.<id>.elite` and `monster.willow.lash`. */
export type Ch2MonsterArt = "wisp" | "shade" | "moth" | "toad" | "wolf" | "willow";
export type HeroAnim = "idle" | "walk" | "raise" | "slash" | "cast" | "hurt" | "win";
export type PrologueArt = "nul"; // sprite key monster.nul (EnemyDef.spriteId "nul")
export type NulAnimKey = "idle" | "atk" | "cast" | "write" | "catch" | "hurt" | "rise"; // idle + atk are what the stage plays in combat
export type ProloguePropKey = "wordgate" | "runestone" | "sword"; // prop.prologue.<key>[.<n>] (+ .flip twins, the ch2Props convention)
export type HeroCutsceneAnimKey = "kneel" | "rise" | "reach" | "swordOut"; // added to the `hero` entry by P2.3; HeroAnim itself is unchanged

/** Typed surface of the (untyped, ported) procedural art module. */
export interface ProceduralArt {
  HERO: Record<HeroAnim | HeroCutsceneAnimKey, SpriteFrame[]>;
  MSPR: Record<MonsterArt, { idle: SpriteFrame[]; atk: SpriteFrame[] }>;
  CHEST: { closed: SpriteFrame; open: SpriteFrame };
  BD_MTN: HTMLCanvasElement;
  BD_FAR: HTMLCanvasElement;
  BD_SKY: HTMLCanvasElement;
  LEAF_AUT: Palette;
  CAVE: Palette;
  makeTree(seed: number, autumn?: boolean): SpriteFrame;
  makeBush(seed: number, w?: number, h?: number, palette?: Palette): SpriteFrame;
  makeFern(seed: number, w?: number, h?: number, dark?: number): SpriteFrame;
  makeGrass(seed: number, w?: number, h?: number): SpriteFrame;
  makeRock(seed: number, w: number, h: number, palette?: Palette, mossy?: boolean): SpriteFrame;
  makePillar(seed: number, h: number, broken: boolean): SpriteFrame;
  makeArch(seed: number): SpriteFrame;
  makeStalagmite(seed: number, w: number, h: number): SpriteFrame;
  makeStalactite(seed: number, w: number, h: number): SpriteFrame;
  makeCrystal(seed: number, color: "blue" | "purple"): SpriteFrame;
  makeShrooms(seed: number): SpriteFrame;
  makeTorchPost(tall?: number): SpriteFrame;
  makeSconce(): SpriteFrame;
  makeVines(seed: number, w?: number, h?: number): SpriteFrame;
  makeTrunk(seed: number, w?: number, h?: number): SpriteFrame;
}

import type { SpriteFrame } from "./SpriteSource";

type Palette = readonly (readonly number[])[];
export type MonsterArt = "slimeG" | "slimeP" | "bat" | "goblin" | "goblinR" | "golem";
export type HeroAnim = "idle" | "walk" | "raise" | "slash" | "cast" | "hurt" | "win";

/** Typed surface of the (untyped, ported) procedural art module. */
export interface ProceduralArt {
  HERO: Record<HeroAnim, SpriteFrame[]>;
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

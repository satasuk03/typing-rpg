import type { ProceduralArt } from "./artTypes";
import { ch2Backdrop, registerCh2Props } from "./ch2Props";
import { buildProceduralArt } from "./proceduralArt";
import {
  type BackdropKind,
  DEFAULT_ANIM,
  type SpriteFrame,
  type SpriteSource,
} from "./SpriteSource";

type Art = ProceduralArt;
type Anims = Record<string, SpriteFrame[]>;

const one = (f: SpriteFrame): Anims => ({ [DEFAULT_ANIM]: [f] });

/**
 * Keys:
 *  - `hero`; `monster.{slimeG,slimeP,bat,goblin,goblinR,golem}`; `chest`
 *  - props: `prop.<kind>` or `prop.<kind>.<n>` for the variants the POC generates
 *    (tree 0-4, bush 0-2, fern 0-1, fernD 0-1, grass 0-3, rock 0-2, pillar 0-2, arch, smite 0-3,
 *    stite 0-2, crystalB, crystalP, crystalB2, shroom, post, sconce, vines 0-1, trunk, cRock 0-2)
 *  - Chapter II props: `prop.ch2.<name>[.<n>]` and their `.flip` twins (normal.x negated), see ch2Props.ts
 */
export class ProceduralSpriteSource implements SpriteSource {
  readonly name = "procedural-poc-v2";
  private art: Art | null = null;
  private readonly table = new Map<string, () => Anims>();
  private readonly cache = new Map<string, Anims>();

  constructor() {
    const t = this.table;
    const a = (): Art => {
      this.art ??= buildProceduralArt();
      return this.art;
    };
    t.set("hero", () => {
      const H = a().HERO;
      return {
        idle: H.idle,
        walk: H.walk,
        raise: H.raise,
        slash: H.slash,
        cast: H.cast,
        hurt: H.hurt,
        win: H.win,
      };
    });
    for (const k of ["slimeG", "slimeP", "bat", "goblin", "goblinR", "golem"] as const) {
      t.set(`monster.${k}`, () => {
        const m = a().MSPR[k];
        return { idle: m.idle, atk: m.atk };
      });
    }
    t.set("chest", () => ({ closed: [a().CHEST.closed], open: [a().CHEST.open] }));
    const variants = (
      kind: string,
      n: number,
      fn: (i: number) => SpriteFrame | undefined,
    ): void => {
      for (let i = 0; i < n; i++) {
        t.set(`prop.${kind}.${i}`, () => {
          const f = fn(i);
          if (!f) throw new Error(`no variant ${kind}.${i}`);
          return one(f);
        });
      }
    };
    // The generators are deterministic per seed; the seed lists mirror the POC's world builder.
    const treeSeeds: [number, boolean][] = [
      [3, false],
      [11, false],
      [29, false],
      [41, true],
      [57, true],
    ];
    variants("tree", 5, (i) => a().makeTree(treeSeeds[i]?.[0] ?? 3, treeSeeds[i]?.[1] ?? false));
    variants("bush", 3, (i) =>
      i === 0
        ? a().makeBush(5)
        : i === 1
          ? a().makeBush(9, 64, 30)
          : a().makeBush(13, 44, 24, a().LEAF_AUT),
    );
    variants("fern", 2, (i) => (i === 0 ? a().makeFern(2) : a().makeFern(8, 110, 80)));
    variants("fernD", 2, (i) =>
      i === 0 ? a().makeFern(17, 120, 88, 1) : a().makeFern(23, 104, 84, 1),
    );
    variants(
      "grass",
      4,
      (i) =>
        [
          a().makeGrass(1),
          a().makeGrass(2, 24, 14),
          a().makeGrass(3, 18, 10),
          a().makeGrass(4, 26, 16),
        ][i],
    );
    variants(
      "rock",
      3,
      (i) => [a().makeRock(7, 34, 20), a().makeRock(19, 48, 26), a().makeRock(31, 26, 14)][i],
    );
    variants(
      "pillar",
      3,
      (i) =>
        [a().makePillar(3, 54, true), a().makePillar(8, 36, true), a().makePillar(13, 70, false)][
          i
        ],
    );
    t.set("prop.arch", () => one(a().makeArch(5)));
    variants(
      "smite",
      4,
      (i) =>
        [
          a().makeStalagmite(4, 36, 80),
          a().makeStalagmite(6, 28, 56),
          a().makeStalagmite(9, 46, 110),
          a().makeStalagmite(12, 22, 34),
        ][i],
    );
    variants(
      "stite",
      3,
      (i) =>
        [
          a().makeStalactite(14, 34, 90),
          a().makeStalactite(15, 26, 64),
          a().makeStalactite(16, 44, 120),
        ][i],
    );
    t.set("prop.crystalB", () => one(a().makeCrystal(3, "blue")));
    t.set("prop.crystalP", () => one(a().makeCrystal(5, "purple")));
    t.set("prop.crystalB2", () => one(a().makeCrystal(9, "blue")));
    t.set("prop.shroom", () => one(a().makeShrooms(4)));
    t.set("prop.post", () => one(a().makeTorchPost(34)));
    t.set("prop.sconce", () => one(a().makeSconce()));
    variants("vines", 2, (i) => (i === 0 ? a().makeVines(3) : a().makeVines(7, 56, 140)));
    t.set("prop.trunk", () => one(a().makeTrunk(5)));
    variants(
      "cRock",
      3,
      (i) =>
        [
          a().makeRock(41, 60, 34, a().CAVE, false),
          a().makeRock(43, 40, 26, a().CAVE, false),
          a().makeRock(47, 90, 50, a().CAVE, false),
        ][i],
    );
    registerCh2Props(this.table);
  }

  has(key: string): boolean {
    return this.table.has(key);
  }

  keys(): readonly string[] {
    return [...this.table.keys()];
  }

  frames(key: string, anim: string = DEFAULT_ANIM): readonly SpriteFrame[] {
    let set = this.cache.get(key);
    if (!set) {
      const make = this.table.get(key);
      if (!make) throw new Error(`ProceduralSpriteSource: unknown sprite key "${key}"`);
      set = make();
      this.cache.set(key, set);
    }
    const f = set[anim];
    if (!f) throw new Error(`ProceduralSpriteSource: "${key}" has no animation "${anim}"`);
    return f;
  }

  backdrop(kind: BackdropKind): HTMLCanvasElement {
    if (kind === "skyNight" || kind === "mountainsNight" || kind === "treelineNight") {
      return ch2Backdrop(kind);
    }
    this.art ??= buildProceduralArt();
    const art = this.art;
    return kind === "sky" ? art.BD_SKY : kind === "mountains" ? art.BD_MTN : art.BD_FAR;
  }

  dispose(): void {
    this.cache.clear();
    this.art = null;
  }
}

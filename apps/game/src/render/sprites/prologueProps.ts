import type { SpriteFrame } from "./SpriteSource";

type Anims = Record<string, SpriteFrame[]>;

// v2.2 placeholder; P2.2 adds prop.prologue.*
export function registerPrologueProps(_table: Map<string, () => Anims>): void {}

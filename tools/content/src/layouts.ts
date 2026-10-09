import { existsSync, readdirSync, readFileSync } from "node:fs";

/** What the validator needs from one world layout (LDtk subset, apps/game/src/assets/levels/ch1-lNN.json). */
export interface LayoutEncounter {
  index: number;
  slots: number;
  waves: number;
  boss: boolean;
}
export interface Layout {
  id: string;
  name: string;
  biome: string;
  encounters: LayoutEncounter[];
}

export const LAYOUT_DIR = new URL("../../../apps/game/src/assets/levels/", import.meta.url);

interface LdtkField {
  __identifier: string;
  __value: unknown;
}
interface LdtkFile {
  levels?: { fieldInstances?: LdtkField[] }[];
}

export function parseLayout(json: unknown, source: string): Layout {
  const lvl = (json as LdtkFile).levels?.[0];
  const f = Object.fromEntries((lvl?.fieldInstances ?? []).map((x) => [x.__identifier, x.__value]));
  if (typeof f.id !== "string" || !Array.isArray(f.encounters)) {
    throw new Error(`${source}: not a recognised world layout (missing id/encounters fields)`);
  }
  return {
    id: f.id,
    name: String(f.name ?? ""),
    biome: String(f.biome ?? ""),
    encounters: (f.encounters as LayoutEncounter[]).map((e) => ({
      index: Number(e.index),
      slots: Number(e.slots),
      waves: Number(e.waves),
      boss: e.boss === true,
    })),
  };
}

/** Reads every ch*-lNN.json layout. Returns [] when the directory is missing (layout checks are then skipped with a warning). */
export function loadLayouts(dir: URL = LAYOUT_DIR): Layout[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^ch\d+-l\d+\.json$/.test(n))
    .sort()
    .map((n) => parseLayout(JSON.parse(readFileSync(new URL(n, dir), "utf8")), n));
}

/** The procedural sound ids the audio engine implements (apps/game/src/audio/types.ts SFX_IDS). */
export const SFX_FILE = new URL("../../../apps/game/src/audio/types.ts", import.meta.url);
export function loadSfxIds(file: URL = SFX_FILE): string[] | null {
  if (!existsSync(file)) return null;
  const m = /SFX_IDS = \[([\s\S]*?)\] as const/.exec(readFileSync(file, "utf8"));
  if (!m?.[1]) return null;
  return [...m[1].matchAll(/"([A-Za-z0-9]+)"/g)].map((x) => x[1] as string);
}

/** The procedural monster sprite keys the renderer has (apps/game/src/render/sprites/artTypes.ts MonsterArt). */
export const ART_FILE = new URL(
  "../../../apps/game/src/render/sprites/artTypes.ts",
  import.meta.url,
);
export function loadMonsterSprites(file: URL = ART_FILE): string[] | null {
  if (!existsSync(file)) return null;
  const m = /type MonsterArt = ([^;]+);/.exec(readFileSync(file, "utf8"));
  if (!m?.[1]) return null;
  return [...m[1].matchAll(/"([A-Za-z0-9]+)"/g)].map((x) => x[1] as string);
}

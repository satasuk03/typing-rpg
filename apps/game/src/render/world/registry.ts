/**
 * Level registry: every `src/assets/levels/ch*-l*.json` file, parsed + validated on first access.
 * Vite inlines the JSON; vitest resolves the same glob.
 */
import { type LevelLayout, parseLevelLayout } from "./layout";

const files = import.meta.glob<unknown>("../../assets/levels/ch*-l*.json", {
  eager: true,
  import: "default",
});

const raw = new Map<string, unknown>();
for (const [path, json] of Object.entries(files)) {
  const id = /\/(ch\d+-l\d+)\.json$/.exec(path)?.[1];
  if (id) raw.set(id, json);
}

const cache = new Map<string, LevelLayout>();

/** All known level ids, sorted. */
export function levelIds(): string[] {
  return [...raw.keys()].sort();
}

/** Raw JSON for a level id (for tests / tools). */
export function rawLevel(id: string): unknown {
  return raw.get(id);
}

/** Parse + validate a level layout by id (cached). Throws `LayoutError` for an invalid file. */
export function loadLevel(id: string): LevelLayout {
  const hit = cache.get(id);
  if (hit) return hit;
  const json = raw.get(id);
  if (json === undefined) throw new Error(`unknown level "${id}" (have: ${levelIds().join(", ")})`);
  const layout = parseLevelLayout(json);
  cache.set(id, layout);
  return layout;
}

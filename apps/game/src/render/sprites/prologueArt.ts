// v2.2 placeholder; P2.1 replaces it
/** Until P2.1: `monster.nul` reuses the `monster.shade` anims and `monster.nul.ward` is an empty set. */
export function registerPrologueArt(table: Map<string, () => unknown>): void {
  const shade = table.get("monster.shade");
  if (!shade)
    throw new Error(
      "registerPrologueArt: monster.shade is missing (run registerCh2Monsters first)",
    );
  table.set("monster.nul", shade);
  table.set("monster.nul.ward", () => ({ idle: [] }));
}

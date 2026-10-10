import type { Layout } from "./layouts.ts";
import { type Issue, issue } from "./types.ts";

/**
 * Chapter 2 world-layout rules (T2.4). The render-side validator (`render/world/layout.ts`) already checks each file's
 * schema, hero lane and anchors; this one checks the plan: CH2_PLAN section 3.1 (biome per level, encounter counts, the
 * boss arena) plus the anchors the spec / HUD / T4.3 content will rely on. It runs on the layout files alone, so it works
 * before the Ch2 LevelDefs exist.
 */
export const CH2_LAYOUT_PLAN: readonly { id: string; biome: string; encounters: number }[] = [
  { id: "ch2-l01", biome: "hushwood", encounters: 2 },
  { id: "ch2-l02", biome: "hushwood", encounters: 2 },
  { id: "ch2-l03", biome: "hushwood", encounters: 3 },
  { id: "ch2-l04", biome: "hushwood", encounters: 3 },
  { id: "ch2-l05", biome: "fen", encounters: 3 },
  { id: "ch2-l06", biome: "fen", encounters: 3 },
  { id: "ch2-l07", biome: "fen", encounters: 3 },
  { id: "ch2-l08", biome: "fen", encounters: 3 },
  { id: "ch2-l09", biome: "fen", encounters: 3 },
  { id: "ch2-l10", biome: "grove", encounters: 3 },
];

const GROUND: Readonly<Record<string, string>> = { hushwood: "leaf", fen: "fen", grove: "roots" };
const BACKDROP_SUFFIX: Readonly<Record<string, string>> = {
  hushwood: "Night",
  fen: "Dusk",
  grove: "Night",
};
/** The Willow arena's named anchors (the riddle lane is `riddle.leaf0..2` in lane order). */
export const WILLOW_ANCHORS = [
  "boss.face",
  "boss.arena",
  "riddle.leaf0",
  "riddle.leaf1",
  "riddle.leaf2",
  "riddle.clue",
] as const;

export function ruleCh2Layouts(layouts: Layout[]): Issue[] {
  const ch2 = layouts.filter((l) => l.id.startsWith("ch2-"));
  if (ch2.length === 0) return [];
  const out: Issue[] = [];
  const err = (m: string): void => void out.push(issue("layouts-ch2", "error", m));
  const byId = new Map(ch2.map((l) => [l.id, l]));
  for (const p of CH2_LAYOUT_PLAN) {
    const l = byId.get(p.id);
    if (!l) {
      err(`${p.id}: missing world layout`);
      continue;
    }
    if (l.chapter !== 2) err(`${l.id}: chapter field is ${l.chapter}, expected 2`);
    if (l.biome !== p.biome) err(`${l.id}: biome ${l.biome}, plan says ${p.biome}`);
    if (l.encounters.length !== p.encounters)
      err(`${l.id}: ${l.encounters.length} encounters, plan says ${p.encounters}`);
    const bosses = l.encounters.filter((e) => e.boss);
    if (bosses.length !== (p.id === "ch2-l10" ? 1 : 0)) err(`${l.id}: boss arena only in L10`);
    if (l.groundKind !== GROUND[p.biome]) err(`${l.id}: ground kind ${l.groundKind}`);
    if (l.segmentBiomes.length === 0 || l.segmentBiomes.some((b) => b !== p.biome))
      err(`${l.id}: segments must be ${p.biome} (mixed-biome transitions are not in the plan)`);
    const suffix = BACKDROP_SUFFIX[p.biome] ?? "";
    if (l.backdropKinds.length !== 3 || l.backdropKinds.some((k) => !k.endsWith(suffix)))
      err(`${l.id}: needs the 3 ${suffix} backdrop strips`);
    const have = new Set(l.anchors);
    for (const n of ["start", "end", "walkshot"])
      if (!have.has(n)) err(`${l.id}: missing anchor ${n}`);
    if (!l.cameras.includes("walk")) err(`${l.id}: missing Camera walk`);
    for (const e of l.encounters) {
      if (e.slots < 1 || e.slots > 5) err(`${l.id} encounter ${e.index}: ${e.slots} slots`);
      if (!have.has(`enc${e.index}.hero`)) err(`${l.id}: missing anchor enc${e.index}.hero`);
      if (!have.has(`enc${e.index}.pool`))
        err(`${l.id}: missing lantern-pool anchor enc${e.index}.pool`);
      if (!l.cameras.includes(`battle:${e.index}`))
        err(`${l.id}: missing Camera battle:${e.index}`);
      for (let s = 0; s < e.slots; s++)
        if (!have.has(`enc${e.index}.slot${s}`))
          err(`${l.id}: missing anchor enc${e.index}.slot${s}`);
      if (e.boss && e.slots < 3)
        err(`${l.id}: boss encounter needs the boss slot plus >= 2 add slots`);
    }
    if (p.id === "ch2-l10") {
      for (const n of WILLOW_ANCHORS) if (!have.has(n)) err(`${l.id}: missing Willow anchor ${n}`);
      if (!l.cameras.includes("boss")) err(`${l.id}: missing Camera boss`);
    }
  }
  for (const l of ch2)
    if (!CH2_LAYOUT_PLAN.some((p) => p.id === l.id)) err(`${l.id}: not in the Ch2 plan`);
  return out;
}

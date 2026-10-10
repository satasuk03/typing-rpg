import type { ContentBundle } from "@hd2d/content";
import { K } from "@hd2d/sim";
import { isPlate } from "./rules.ts";
import { type Issue, issue } from "./types.ts";

const firstLetter = (s: string): string => s.charAt(0).toLowerCase();
const initials = (ws: readonly string[]): number => new Set(ws.map(firstLetter)).size;

/** Minimum distinct first letters (interfaces 14.2). */
export const PROLOGUE_MIN_WORD_INITIALS = 14;
export const PROLOGUE_MIN_GUARD_INITIALS = 8;

/**
 * v2.2 validator rules for `bundle.prologue` (interfaces 14.2). Absent prologue = no issues (story-only bundles stay valid).
 * Schema refinements already cover distinct words, 3-5 lowercase letters, one boss segment, last.
 */
export function rulePrologue(b: ContentBundle): Issue[] {
  const p = b.prologue;
  if (!p) return [];
  const out: Issue[] = [];
  const err = (m: string): void => {
    out.push(issue("prologue", "error", m));
  };
  const warn = (m: string): void => {
    out.push(issue("prologue", "warn", m));
  };
  const enemies = new Map(b.enemies.map((e) => [e.id, e]));
  const bosses = new Map(b.bosses.map((x) => [x.id, x]));

  // Segments: ids resolve, no gimmicks / elites, normal enemies only in encounters.
  p.segments.forEach((s, i) => {
    if (s.kind === "encounter") {
      s.encounter.waves.forEach((w, wi) => {
        for (const r of w) {
          const e = enemies.get(r.enemy);
          if (!e) err(`prologue seg ${i} wave ${wi}: unknown enemy "${r.enemy}"`);
          else if (e.archetype === "boss")
            err(`prologue seg ${i}: boss enemy "${r.enemy}" in a wave`);
          if (r.gimmick !== undefined)
            err(`prologue seg ${i}: gimmick "${r.gimmick}" (none allowed)`);
          if (r.elite === true) err(`prologue seg ${i}: elite ref "${r.enemy}" (none allowed)`);
        }
      });
    } else if (s.kind === "boss") {
      const boss = bosses.get(s.bossId);
      if (!boss) {
        err(`prologue seg ${i}: unknown boss "${s.bossId}"`);
        return;
      }
      const e = enemies.get(boss.enemyId);
      if (!e) err(`prologue boss ${boss.id}: unknown enemy "${boss.enemyId}"`);
      else if (e.archetype !== "boss")
        err(`prologue boss ${boss.id}: enemy must be archetype boss`);
      if (boss.phase3.minigame.kind !== "fallingRubble") {
        err(
          `prologue boss ${boss.id}: minigame must be fallingRubble (is ${boss.phase3.minigame.kind})`,
        );
      }
      for (const r of boss.phase1.adds) {
        const a = enemies.get(r.enemy);
        if (!a) err(`prologue boss ${boss.id}: unknown add "${r.enemy}"`);
        else if (a.archetype === "boss") err(`prologue boss ${boss.id}: boss add "${r.enemy}"`);
        if (r.gimmick !== undefined)
          err(`prologue boss ${boss.id}: add gimmick "${r.gimmick}" (none allowed)`);
        if (r.elite === true)
          err(`prologue boss ${boss.id}: elite add "${r.enemy}" (none allowed)`);
      }
      if (boss.phase1.endAtHpPct <= boss.phase2.endAtHpPct || boss.phase1.endAtHpPct <= 0) {
        err(
          `prologue boss ${boss.id}: climax gate ${boss.phase1.endAtHpPct}% must be above the phase-2 gate`,
        );
      }
    }
  });

  // Kit: ids exist, no Reveal.
  const actives = new Set(b.actives.map((a) => a.id as string));
  for (const a of p.kit.actives) {
    if (!actives.has(a.id)) err(`prologue kit: unknown active "${a.id}"`);
    if (a.id === "reveal") err(`prologue kit: "reveal" is not in the prologue kit (PO)`);
  }
  const passives = new Set(b.passives.map((x) => x.id as string));
  for (const id of p.kit.passives) {
    if (!passives.has(id)) err(`prologue kit: unknown passive "${id}"`);
  }

  // Words: length band (belt and braces over the schema), initials, no overlap.
  for (const w of [...p.words, ...p.guardWords]) {
    if (!/^[a-z]{3,5}$/.test(w)) err(`prologue word "${w}": must be 3-5 lowercase letters`);
  }
  if (initials(p.words) < PROLOGUE_MIN_WORD_INITIALS) {
    err(
      `prologue words: ${initials(p.words)} distinct first letters (need ${PROLOGUE_MIN_WORD_INITIALS})`,
    );
  }
  if (initials(p.guardWords) < PROLOGUE_MIN_GUARD_INITIALS) {
    err(
      `prologue guardWords: ${initials(p.guardWords)} distinct first letters (need ${PROLOGUE_MIN_GUARD_INITIALS})`,
    );
  }
  const plate = new Set(p.words);
  for (const g of p.guardWords) {
    if (plate.has(g)) err(`prologue guard word "${g}" is also a plate word`);
  }

  // Floor must sit below Last Stand and Mending Light so both can show (warning).
  const floorBp = p.heroHpFloorPct * 100;
  const lastStand = K.LAST_STAND_HP_BELOW_BP;
  const mending = K.MENDING_HP_BELOW_BP;
  if (floorBp >= lastStand || floorBp >= mending) {
    warn(
      `prologue heroHpFloorPct ${p.heroHpFloorPct}% is not below Last Stand (${lastStand / 100}%) and Mending Light (${mending / 100}%)`,
    );
  }

  // Freshness (warning, orchestrator ruling): prologue words that also sit in a level pool. D46 already isolates them.
  const pooled = new Set(
    b.words.filter((w) => isPlate(w) && w.kind === "word").map((w) => w.text.toLowerCase()),
  );
  const shared = [...p.words, ...p.guardWords].filter((w) => pooled.has(w));
  if (shared.length > 0) {
    warn(
      `${shared.length} prologue words are also in a level plate pool (fresh-words goal, warning only): ${shared.slice(0, 8).join(" ")} ...`,
    );
  }
  return out;
}

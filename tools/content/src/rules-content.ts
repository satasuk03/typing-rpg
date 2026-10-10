import type { ContentBundle, LevelDef } from "@hd2d/content";
import { CONFIG } from "./config.ts";
import type { Layout } from "./layouts.ts";
import { biomePool, isPlate, usePool } from "./rules.ts";
import { ruleCh2Layouts } from "./rules-layouts.ts";
import { type Issue, issue } from "./types.ts";

/** Files read from the app (null = not available, the matching check is skipped with a warning). */
export interface ContentContext {
  layouts: Layout[];
  sfxIds: readonly string[] | null;
  monsterSprites: readonly string[] | null;
}

const firstLetter = (s: string): string => s.charAt(0).toLowerCase();
const initials = (ws: readonly { text: string }[]): number =>
  new Set(ws.map((w) => firstLetter(w.text))).size;
const inBand = (w: { text: string }, lo: number, hi: number): boolean =>
  w.text.length >= lo && w.text.length <= hi;

// ------------------------------------------------------------ ids and references

export function ruleIdsAndRefs(b: ContentBundle): Issue[] {
  const out: Issue[] = [];
  const groups: [string, string[]][] = [
    ["enemy", b.enemies.map((e) => e.id)],
    ["boss", b.bosses.map((x) => x.id)],
    ["level", b.levels.map((l) => l.id)],
    ["gear", b.gear.map((g) => g.id)],
    ["active", b.actives.map((a) => a.id)],
    ["passive", b.passives.map((p) => p.id)],
  ];
  for (const [kind, ids] of groups) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) out.push(issue("ids", "error", `duplicate ${kind} id "${id}"`));
      seen.add(id);
    }
  }
  const enemies = new Map(b.enemies.map((e) => [e.id, e]));
  const bosses = new Map(b.bosses.map((x) => [x.id, x]));
  const refCheck = (where: string, enemy: string, allowBoss = false): void => {
    const e = enemies.get(enemy);
    if (!e) out.push(issue("refs", "error", `${where}: unknown enemy "${enemy}"`));
    else if (e.archetype === "boss" && !allowBoss) {
      out.push(issue("refs", "error", `${where}: boss enemy "${enemy}" used as a normal enemy`));
    }
  };
  for (const l of b.levels) {
    l.segments.forEach((s, i) => {
      if (s.kind === "encounter") {
        s.encounter.waves.forEach((w, wi) => {
          for (const r of w) refCheck(`${l.id} seg ${i} wave ${wi}`, r.enemy);
        });
      } else if (s.kind === "boss") {
        if (!bosses.has(s.bossId)) {
          out.push(issue("refs", "error", `${l.id} seg ${i}: unknown boss "${s.bossId}"`));
        }
        if (i !== l.segments.length - 1) {
          out.push(issue("refs", "error", `${l.id}: the boss segment must be last`));
        }
      }
    });
    const hasBoss = l.segments.some((s) => s.kind === "boss");
    if ((l.kind === "boss") !== hasBoss) {
      out.push(issue("refs", "error", `${l.id}: kind "${l.kind}" does not match its boss segment`));
    }
    const m = /^ch(\d+)-l(\d+)$/.exec(l.id);
    if (m && (Number(m[1]) !== l.chapter || Number(m[2]) !== l.index)) {
      out.push(issue("refs", "error", `${l.id}: chapter/index fields disagree with the id`));
    }
    if (l.layoutId !== l.id) {
      out.push(issue("refs", "error", `${l.id}: layoutId "${l.layoutId}" must equal the level id`));
    }
  }
  for (const x of b.bosses) {
    const e = enemies.get(x.enemyId);
    if (!e) out.push(issue("refs", "error", `boss ${x.id}: unknown enemy "${x.enemyId}"`));
    else if (e.archetype !== "boss") {
      out.push(issue("refs", "error", `boss ${x.id}: enemy "${x.enemyId}" must be archetype boss`));
    }
    for (const r of x.phase1.adds) refCheck(`boss ${x.id} adds`, r.enemy);
    if (x.phase1.endAtHpPct !== 66 || x.phase2.endAtHpPct !== 33) {
      out.push(issue("boss", "error", `boss ${x.id}: phase gates must be 66/33 (doc 01 4.2)`));
    }
    const finishers = usePool(b.words, "finisher").map((w) => w.text);
    if (!finishers.includes(x.phase3.finisherText)) {
      out.push(issue("boss", "error", `boss ${x.id}: finisherText is not in the finisher pool`));
    }
    if (usePool(b.words, "doom").length < x.phase2.minDoomSpells) {
      out.push(issue("boss", "error", `boss ${x.id}: fewer doom sentences than minDoomSpells`));
    }
    if (x.phase2.minDoomSpells < 2) {
      out.push(issue("boss", "error", `boss ${x.id}: minDoomSpells must be >= 2 (D16)`));
    }
    // Falling Rubble only: a riddle minigame has its own pool rule (T4.x validator, not written yet).
    if (
      x.phase3.minigame.kind === "fallingRubble" &&
      usePool(b.words, "minigame").length < x.phase3.minigame.lanes * 2
    ) {
      out.push(issue("boss", "error", `boss ${x.id}: minigame pool too small for its lanes`));
    }
  }
  return out;
}

// ------------------------------------------------------------ levels vs world layouts

export function ruleLayouts(b: ContentBundle, layouts: Layout[]): Issue[] {
  if (layouts.length === 0) {
    return [issue("layouts", "warn", "no world layouts found: layout checks skipped")];
  }
  const out: Issue[] = [];
  const byId = new Map(layouts.map((l) => [l.id, l]));
  for (const l of b.levels) {
    if (!byId.has(l.id))
      out.push(issue("layouts", "error", `${l.id}: no world layout with this id`));
  }
  const chapters = new Set(b.levels.map((l) => l.chapter));
  for (const lay of layouts) {
    const m = /^ch(\d+)-/.exec(lay.id);
    if (m && chapters.has(Number(m[1])) && !b.levels.some((l) => l.id === lay.id)) {
      out.push(issue("layouts", "error", `layout ${lay.id} has no LevelDef`));
    }
  }
  for (const l of b.levels) {
    const lay = byId.get(l.id);
    if (!lay) continue;
    if (lay.biome !== l.biome) {
      out.push(
        issue("layouts", "error", `${l.id}: biome ${l.biome} but the layout is ${lay.biome}`),
      );
    }
    if (lay.name !== l.name) {
      out.push(
        issue("layouts", "error", `${l.id}: name "${l.name}" but the layout says "${lay.name}"`),
      );
    }
    const fights = l.segments.flatMap((s) => (s.kind === "encounter" ? [s.encounter] : []));
    const hasBoss = l.segments.some((s) => s.kind === "boss");
    const layFights = lay.encounters.filter((e) => !e.boss);
    const layBoss = lay.encounters.some((e) => e.boss);
    if (hasBoss !== layBoss) {
      out.push(issue("layouts", "error", `${l.id}: boss segment presence differs from the layout`));
    }
    if (fights.length !== layFights.length) {
      out.push(
        issue(
          "layouts",
          "error",
          `${l.id}: ${fights.length} encounters but the layout has ${layFights.length}`,
        ),
      );
      continue;
    }
    fights.forEach((f, i) => {
      const slot = layFights[i];
      if (!slot) return;
      if (f.waves.length !== slot.waves) {
        out.push(
          issue(
            "layouts",
            "error",
            `${l.id} encounter ${i + 1}: ${f.waves.length} waves, layout has ${slot.waves}`,
          ),
        );
      }
      f.waves.forEach((w, wi) => {
        if (w.length > slot.slots) {
          out.push(
            issue(
              "layouts",
              "error",
              `${l.id} encounter ${i + 1} wave ${wi + 1}: ${w.length} enemies but only ${slot.slots} slots`,
            ),
          );
        }
        // an exactly-fitting first wave keeps the anchors filled (single-wave encounters use every slot)
        if (slot.waves === 1 && w.length !== slot.slots) {
          out.push(
            issue(
              "layouts",
              "warn",
              `${l.id} encounter ${i + 1}: ${w.length} enemies for ${slot.slots} slots (empty anchors)`,
            ),
          );
        }
      });
    });
  }
  // contiguous indices per chapter
  for (const c of chapters) {
    const idx = b.levels.filter((l) => l.chapter === c).map((l) => l.index);
    const expected = idx.map((_, i) => i + 1);
    if (idx.some((v, i) => v !== expected[i])) {
      out.push(issue("layouts", "error", `chapter ${c}: level indices must run 1..${idx.length}`));
    }
  }
  return out;
}

// ------------------------------------------------------------ words per level

export function ruleLevelWords(b: ContentBundle): Issue[] {
  const out: Issue[] = [];
  const { guardSwaps } = CONFIG.feasibility;
  for (const l of b.levels) {
    const m = l.tierMix;
    if (m.current !== 60 || m.review !== 20 || m.biome !== 15 || m.weak !== 5) {
      out.push(issue("levelwords", "error", `${l.id}: tier mix must be 60/20/15/5 (locked)`));
    }
    const [lo, hi] = l.plateLength;
    if (lo < 3 || hi > 10 || lo > hi) {
      out.push(issue("levelwords", "error", `${l.id}: plate band ${lo}-${hi} outside 3-10`));
    }
    const biome = biomePool(b.words, l.biome).filter((w) => inBand(w, lo, hi));
    if (biomePool(b.words, l.biome).length === 0) {
      out.push(
        issue(
          "levelwords",
          "warn",
          `${l.id}: biome "${l.biome}" has no vocabulary (its ${m.biome}% share goes to the current tier)`,
        ),
      );
    } else if (biome.length < 20 || initials(biome) < 12) {
      out.push(
        issue(
          "levelwords",
          "error",
          `${l.id}: biome pool in band ${lo}-${hi} has ${biome.length} words / ${initials(biome)} initials (need 20 / 12)`,
        ),
      );
    }
    const current = b.words.filter(
      (w) => isPlate(w) && w.biomes.length === 0 && w.tier === l.wordTier && inBand(w, lo, hi),
    );
    const peak = peakVisible(l);
    if (initials(current) < peak + guardSwaps) {
      out.push(
        issue("levelwords", "error", `${l.id}: current tier lacks distinct initials in band`),
      );
    }
    // per-enemy bands (the sim picks plate words inside the enemy's own band)
    const enemies = new Map(b.enemies.map((e) => [e.id, e]));
    const used = new Set<string>();
    for (const s of l.segments) {
      if (s.kind === "encounter")
        for (const w of s.encounter.waves) for (const r of w) used.add(r.enemy);
    }
    for (const id of used) {
      const e = enemies.get(id);
      if (!e) continue;
      const pool = b.words.filter(
        (w) =>
          isPlate(w) &&
          ((w.biomes.length === 0 && w.tier === l.wordTier) ||
            (w.biomes as string[]).includes(l.biome)) &&
          inBand(w, Math.max(lo, e.plateLength[0]), Math.min(hi, e.plateLength[1])),
      );
      if (initials(pool) < 6) {
        out.push(
          issue(
            "levelwords",
            "error",
            `${l.id}: ${id} (band ${e.plateLength.join("-")}) has only ${initials(pool)} word initials in the level band`,
          ),
        );
      }
    }
  }
  return out;
}

function peakVisible(l: LevelDef): number {
  let max = 1;
  for (const s of l.segments) {
    if (s.kind === "boss") max = Math.max(max, CONFIG.feasibility.bossVisiblePlates);
    if (s.kind === "encounter") for (const w of s.encounter.waves) max = Math.max(max, w.length);
  }
  return max;
}

// ------------------------------------------------------------ gimmick introduction and stars

export function ruleGimmicks(b: ContentBundle): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const l of b.levels) {
    for (const s of l.segments) {
      if (s.kind !== "encounter") continue;
      const refs = s.encounter.waves.flat().filter((r) => r.gimmick !== undefined);
      const kinds = new Set(refs.map((r) => r.gimmick as string));
      const fresh = [...kinds].filter((k) => !seen.has(k));
      if (fresh.length > 0 && (refs.length !== 1 || kinds.size !== 1)) {
        out.push(
          issue(
            "gimmick",
            "error",
            `${l.id} "${s.encounter.name}": ${fresh.join("+")} debuts but is not alone in its encounter (doc 01 4.1)`,
          ),
        );
      }
      for (const k of kinds) seen.add(k);
    }
  }
  for (const g of ["fading", "scrambled"]) {
    if (!seen.has(g)) out.push(issue("gimmick", "error", `gimmick "${g}" is never used`));
  }
  return out;
}

export function ruleStars(b: ContentBundle): Issue[] {
  const out: Issue[] = [];
  for (const l of b.levels) {
    const c = l.star3;
    const plates = l.parRefS / 2.1; // doc 01 section 6: one plate per ~2.1 s
    if (l.parRefS < 20 * l.segments.filter((s) => s.kind !== "walk").length || l.parRefS > 600) {
      out.push(issue("stars", "error", `${l.id}: parRefS ${l.parRefS} s is implausible`));
    }
    if (c.kind === "parTime" && (c.slack < 1.0 || c.slack > 2.0)) {
      out.push(issue("stars", "error", `${l.id}: parTime slack ${c.slack} outside 1.0-2.0`));
    }
    if (c.kind === "untouched" && c.maxHits > 6) {
      out.push(
        issue("stars", "error", `${l.id}: untouched maxHits ${c.maxHits} is not a challenge`),
      );
    }
    if (c.kind === "streak" && (c.combo < 3 || c.combo > plates / 2)) {
      out.push(
        issue(
          "stars",
          "error",
          `${l.id}: streak ${c.combo} is out of reach (~${Math.floor(plates)} plates)`,
        ),
      );
    }
    if (c.kind === "guardian" && (c.parries < 1 || c.parries > 8)) {
      out.push(issue("stars", "error", `${l.id}: guardian ${c.parries} parries outside 1-8`));
    }
  }
  const kinds = new Set(b.levels.map((l) => l.star3.kind));
  if (b.levels.length >= 5 && kinds.size < 4) {
    out.push(
      issue("stars", "error", `challenges rotate through only ${kinds.size} kinds (need >= 4)`),
    );
  }
  b.levels.forEach((l, i) => {
    const prev = b.levels[i - 1];
    if (prev && prev.chapter === l.chapter && prev.star3.kind === l.star3.kind) {
      out.push(issue("stars", "error", `${l.id}: same challenge kind as the previous level`));
    }
  });
  return out;
}

// ------------------------------------------------------------ enemies, gear, skills

export function ruleEnemies(b: ContentBundle, sprites: readonly string[] | null): Issue[] {
  const out: Issue[] = [];
  if (sprites === null) {
    out.push(issue("enemies", "warn", "renderer sprite list not found: spriteId check skipped"));
  }
  for (const e of b.enemies) {
    if (sprites !== null && !sprites.includes(e.spriteId)) {
      out.push(
        issue("enemies", "error", `${e.id}: spriteId "${e.spriteId}" is not a renderer sprite`),
      );
    }
    const base = { grunt: 9, brute: 12, speedster: 5, boss: 10 }[e.archetype];
    if (e.baseIntervalS !== base) {
      out.push(
        issue(
          "enemies",
          "warn",
          `${e.id}: baseIntervalS ${e.baseIntervalS} != ${base} for ${e.archetype}`,
        ),
      );
    }
    if (e.plateLength[0] > e.plateLength[1]) {
      out.push(issue("enemies", "error", `${e.id}: plateLength min > max`));
    }
  }
  const weak = new Set(b.enemies.flatMap((e) => e.weaknesses));
  for (const t of ["slash", "pierce", "arcane", "blunt", "fire"]) {
    if (!weak.has(t as never)) out.push(issue("enemies", "error", `no enemy is weak to ${t}`));
  }
  const used = new Set<string>();
  for (const l of b.levels) {
    for (const s of l.segments) {
      if (s.kind === "encounter")
        for (const w of s.encounter.waves) for (const r of w) used.add(r.enemy);
    }
  }
  for (const x of b.bosses) {
    used.add(x.enemyId);
    for (const r of x.phase1.adds) used.add(r.enemy);
  }
  for (const e of b.enemies) {
    if (!used.has(e.id)) out.push(issue("enemies", "warn", `${e.id} is never used`));
  }
  return out;
}

export function ruleGear(b: ContentBundle): Issue[] {
  const out: Issue[] = [];
  for (const tier of [1, 2]) {
    for (const arch of ["sword", "dagger", "staff", "hammer"]) {
      const n = b.gear.filter(
        (g) => g.slot === "weapon" && g.archetype === arch && g.tier === tier,
      );
      if (n.length !== 1)
        out.push(issue("gear", "error", `tier ${tier} ${arch}: ${n.length} defs (need 1)`));
    }
    for (const slot of ["armor", "charm"]) {
      const n = b.gear.filter((g) => g.slot === slot && g.tier === tier);
      if (n.length !== 1)
        out.push(issue("gear", "error", `tier ${tier} ${slot}: ${n.length} defs (need 1)`));
    }
  }
  for (const key of ["name", "spriteId"] as const) {
    const seen = new Set<string>();
    for (const g of b.gear) {
      if (seen.has(g[key])) out.push(issue("gear", "error", `duplicate ${key} "${g[key]}"`));
      seen.add(g[key]);
    }
  }
  for (const g of b.gear) {
    if (!g.flavor) out.push(issue("gear", "warn", `${g.id}: no flavor text`));
  }
  return out;
}

const KNOWN_PLACEHOLDERS = new Set(["dmg", "charge", "secs"]);

export function ruleSkills(b: ContentBundle, sfxIds: readonly string[] | null): Issue[] {
  const out: Issue[] = [];
  const A = ["slashWave", "piercingThrust", "fireball", "frostLock", "mendingLight", "aegis"];
  const P = [
    "cleanCut",
    "bulwarkStreak",
    "steadyHands",
    "riposte",
    "ironWill",
    "openingGambit",
    "lastStand",
    "comeback",
  ];
  for (const id of A) {
    if (!b.actives.some((a) => a.id === id))
      out.push(issue("skills", "error", `missing active "${id}"`));
  }
  for (const id of P) {
    if (!b.passives.some((p) => p.id === id))
      out.push(issue("skills", "error", `missing passive "${id}"`));
  }
  if (sfxIds === null)
    out.push(issue("skills", "warn", "audio SFX list not found: sfxId check skipped"));
  const levels = new Set(b.levels.map((l) => l.id));
  for (const a of b.actives) {
    if (sfxIds !== null && !sfxIds.includes(a.sfxId)) {
      out.push(issue("skills", "error", `${a.id}: sfxId "${a.sfxId}" is not an audio effect`));
    }
    for (const m of a.description.matchAll(/\{(\w+)\}/g)) {
      if (!KNOWN_PLACEHOLDERS.has(m[1] as string)) {
        out.push(issue("skills", "error", `${a.id}: unknown placeholder {${m[1]}}`));
      }
    }
    if (a.unlockLevel !== undefined && !levels.has(a.unlockLevel)) {
      out.push(issue("skills", "error", `${a.id}: unlockLevel "${a.unlockLevel}" does not exist`));
    }
  }
  for (const p of b.passives) {
    if (/\d/.test(p.description)) {
      out.push(issue("skills", "warn", `${p.id}: numbers in text drift from BALANCE; avoid`));
    }
    if (p.unlockLevel !== undefined && !levels.has(p.unlockLevel)) {
      out.push(issue("skills", "error", `${p.id}: unlockLevel "${p.unlockLevel}" does not exist`));
    }
  }
  const starterA = b.actives.filter((a) => a.unlockLevel === undefined).map((a) => a.id as string);
  const starterP = b.passives.filter((p) => p.unlockLevel === undefined);
  if (starterA.length < 2) out.push(issue("skills", "error", "starter kit needs >= 2 actives"));
  if (!starterA.includes("fireball") || !starterA.includes("aegis")) {
    out.push(issue("skills", "error", "starter kit must include fireball and aegis (HUD mock)"));
  }
  if (starterP.length < 3) out.push(issue("skills", "error", "starter kit needs >= 3 passives"));
  return out;
}

export function runContentRules(b: ContentBundle, ctx: ContentContext): Issue[] {
  return [
    ...ruleIdsAndRefs(b),
    ...ruleLayouts(b, ctx.layouts),
    ...ruleCh2Layouts(ctx.layouts),
    ...ruleLevelWords(b),
    ...ruleGimmicks(b),
    ...ruleStars(b),
    ...ruleEnemies(b, ctx.monsterSprites),
    ...ruleGear(b),
    ...ruleSkills(b, ctx.sfxIds),
  ];
}

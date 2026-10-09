// Generates src/tables.generated.ts from BALANCE. NOT sim runtime, so it may use Math.pow and floats
// (docs/interfaces.md §1.2, §7). Run: node packages/sim/scripts/gen-tables.ts
// A unit test regenerates every table in memory and diffs it against the file (node-tests/tables.test.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCE as B } from "../src/balance.ts";

export const PACE_MIN = B.PACE_MIN;
export const PACE_MAX = B.PACE_MAX;
const BP = 10_000;

/** (PACE_REF/Pace)^PACE_EXP clamped to PACE_CLAMP, in basis points, for integer pace 15..120 (index = pace - 15). */
export function computePaceFactorBp(): number[] {
  const out: number[] = [];
  for (let pace = PACE_MIN; pace <= PACE_MAX; pace++) {
    const f = Math.min(
      B.PACE_CLAMP[1],
      Math.max(B.PACE_CLAMP[0], (B.PACE_REF / pace) ** B.PACE_EXP),
    );
    out.push(Math.round(f * BP));
  }
  return out;
}

/** TIER_GROWTH^(tier-1) in basis points, tier 1..10 (index = tier - 1). py item_score. */
export function computeTierGrowthBp(): number[] {
  return Array.from({ length: 10 }, (_, i) => Math.round(B.TIER_GROWTH ** i * BP));
}

const tierPriceF = (tier: number): number => B.PRICE_T1 * B.PRICE_GROWTH ** (tier - 1);

/** PRICE_T1 x PRICE_GROWTH^(tier-1), whole gold, tier 1..10. py tier_price. */
export function computeTierPrice(): number[] {
  return Array.from({ length: 10 }, (_, i) => Math.round(tierPriceF(i + 1)));
}

/** UPG_COST[tier-1][u]: tier_price x UPG_COST_BASE x UPG_COST_GROWTH^u, whole gold, u = 0..14. py upg_cost. */
export function computeUpgCost(): number[][] {
  return Array.from({ length: 10 }, (_, t) =>
    Array.from({ length: 15 }, (_, u) =>
      Math.round(tierPriceF(t + 1) * B.UPG_COST_BASE * B.UPG_COST_GROWTH ** u),
    ),
  );
}

const goldUnitF = (c: number): number => B.GOLD_L1 * B.GOLD_GROWTH_CH ** (c - 1);

/** GOLD_L1 x GOLD_GROWTH_CH^(chapter-1), whole gold, chapter 1..30 (index = chapter - 1). py gold_unit. */
export function computeGoldUnit(): number[] {
  return Array.from({ length: B.CHAPTERS }, (_, i) => Math.round(goldUnitF(i + 1)));
}

/** LEVEL_GOLD[chapter-1][index-1], whole gold. py level_gold (boss = index 10 pays BOSS_GOLD_MULT). */
export function computeLevelGold(): number[][] {
  return Array.from({ length: B.CHAPTERS }, (_, c) =>
    Array.from({ length: B.LEVELS_PER_CH }, (_, p) => {
      const g = goldUnitF(c + 1) * (1 + B.GOLD_IN_CH_STEP * p);
      return Math.round(p === B.LEVELS_PER_CH - 1 ? g * B.BOSS_GOLD_MULT : g);
    }),
  );
}

type Pity = readonly [r: number, e: number, l: number];
/**
 * Exact long-run per-cache rarity frequencies under the published pity (economy_sim.roll_cache_rarity), by power
 * iteration on the pity-counter Markov chain (no sampling). Returns raw probabilities per rarity.
 */
export function computeCacheEffective(): Record<"C" | "U" | "R" | "E" | "L", number> {
  const O = B.CACHE_ODDS;
  const keys = ["C", "U", "R", "E", "L"] as const;
  type K5 = (typeof keys)[number];
  const trans = (st: Pity): { k: K5; p: number; next: Pity }[] => {
    const r = st[0] + 1;
    const e = st[1] + 1;
    const l = st[2] + 1;
    let pool: readonly K5[] = keys;
    if (l >= B.CACHE_PITY_LEG) pool = ["L"];
    else if (e >= B.CACHE_PITY_EPIC) pool = ["E", "L"];
    else if (r >= B.CACHE_PITY_RARE) pool = ["R", "E", "L"];
    let tot = 0;
    for (const k of pool) tot += O[k];
    return pool.map((k) => ({
      k,
      p: O[k] / tot,
      next: [
        k === "R" || k === "E" || k === "L" ? 0 : r,
        k === "E" || k === "L" ? 0 : e,
        k === "L" ? 0 : l,
      ] as const,
    }));
  };
  const id = (s: Pity): string => `${s[0]},${s[1]},${s[2]}`;
  const states: Pity[] = [[0, 0, 0]];
  const index = new Map<string, number>([[id([0, 0, 0]), 0]]);
  const edges: { k: K5; p: number; to: number }[][] = [];
  for (let i = 0; i < states.length; i++) {
    const row: { k: K5; p: number; to: number }[] = [];
    for (const t of trans(states[i] as Pity)) {
      let j = index.get(id(t.next));
      if (j === undefined) {
        j = states.length;
        index.set(id(t.next), j);
        states.push(t.next);
      }
      row.push({ k: t.k, p: t.p, to: j });
    }
    edges.push(row);
  }
  let v = new Array<number>(states.length).fill(0);
  v[0] = 1;
  for (let it = 0; it < 100_000; it++) {
    const nv = new Array<number>(states.length).fill(0);
    for (let i = 0; i < states.length; i++) {
      const vi = v[i] as number;
      if (vi === 0) continue;
      for (const e of edges[i] as { p: number; to: number }[])
        nv[e.to] = (nv[e.to] as number) + vi * e.p;
    }
    let d = 0;
    for (let i = 0; i < nv.length; i++) d += Math.abs((nv[i] as number) - (v[i] as number));
    v = nv;
    if (d < 1e-15) break;
  }
  const out = { C: 0, U: 0, R: 0, E: 0, L: 0 };
  for (let i = 0; i < states.length; i++)
    for (const e of edges[i] as { k: K5; p: number }[]) out[e.k] += (v[i] as number) * e.p;
  return out;
}

/** Effective rarity table in basis points: rounded, the remainder (|d| <= 2) goes to Common so it sums to 10000. */
export function computeCacheEffectiveBp(): Record<"C" | "U" | "R" | "E" | "L", number> {
  const p = computeCacheEffective();
  const o = {
    C: 0,
    U: Math.round(p.U * BP),
    R: Math.round(p.R * BP),
    E: Math.round(p.E * BP),
    L: Math.round(p.L * BP),
  };
  o.C = BP - o.U - o.R - o.E - o.L;
  return o;
}

const rows1 = (name: string, doc: string, t: readonly number[], per = 10): string => {
  const rows: string[] = [];
  for (let i = 0; i < t.length; i += per) rows.push(`  ${t.slice(i, i + per).join(", ")},`);
  return `/** ${doc} */\nexport const ${name}: readonly number[] = [\n${rows.join("\n")}\n];\n`;
};
const rows2 = (name: string, doc: string, t: readonly (readonly number[])[]): string => {
  const rows = t.map((r) => `  [${r.join(", ")}],`);
  return `/** ${doc} */\nexport const ${name}: readonly (readonly number[])[] = [\n${rows.join("\n")}\n];\n`;
};

export function renderTables(): string {
  const eff = computeCacheEffectiveBp();
  return `// GENERATED by packages/sim/scripts/gen-tables.ts from BALANCE. Do not edit; a unit test diffs a fresh generation.
${rows1("PACE_FACTOR_BP", "PACE_FACTOR_BP[pace - 15], pace = 15..120: (35/pace)^0.7 clamped to 0.6..1.8, in basis points.", computePaceFactorBp())}
${rows1("TIER_GROWTH_BP", "TIER_GROWTH_BP[tier - 1], tier 1..10: 1.40^(tier-1) in basis points (economy_sim item_score).", computeTierGrowthBp())}
${rows1("TIER_PRICE", "TIER_PRICE[tier - 1], tier 1..10: 1150 x 1.405^(tier-1), whole gold (economy_sim tier_price).", computeTierPrice())}
${rows2("UPG_COST", "UPG_COST[tier - 1][u], u = 0..14: tier price x 0.25 x 1.3^u, whole gold (economy_sim upg_cost).", computeUpgCost())}
${rows1("GOLD_UNIT", "GOLD_UNIT[chapter - 1], chapter 1..30: 100 x 1.125^(chapter-1), whole gold (economy_sim gold_unit).", computeGoldUnit())}
/** Effective cache rarity in basis points with the published pity (exact Markov chain, doc 02 section 6.5). */
export const CACHE_EFFECTIVE_BP = { C: ${eff.C}, U: ${eff.U}, R: ${eff.R}, E: ${eff.E}, L: ${eff.L} } as const;
${rows2("LEVEL_GOLD", "LEVEL_GOLD[chapter - 1][index - 1], index 1..10: first-clear gold, boss = index 10 (economy_sim level_gold).", computeLevelGold())}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/tables.generated.ts",
  );
  fs.writeFileSync(dest, renderTables());
  console.log(`wrote ${dest}`);
}

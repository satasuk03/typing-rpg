// Gear Caches (docs/interfaces.md §8): fixed odds + published pity, exactly economy_sim.roll_cache_rarity.
// Draw order (normative): rarity, then slot (uniform), then archetype if weapon (equipped 40%, each other 20%).
import type { GearSlot, Rarity, WeaponArchetype } from "@hd2d/content";
import { K } from "../balance.ts";
import type { MetaEvent } from "../events.ts";
import type { Bp } from "../fixed.ts";
import { pickWeighted, type RngState } from "../rng.ts";
import { CACHE_EFFECTIVE_BP } from "../tables.generated.ts";
import type { CachePity, GearRoll } from "../types.ts";
import { GEAR_SLOTS, rollArchetype, rollSlot } from "./chests.ts";
import { slotTier } from "./gear.ts";

const RARITIES = K.RARITY_ORDER;

/** The rarity subset a pity branch draws from, with the base weights (Python: `{k: v for k in ODDS if k in subset}`). */
function weightsOf(subset: readonly Rarity[]): Record<Rarity, number> {
  const w = {} as Record<Rarity, number>;
  for (const r of RARITIES) w[r] = subset.includes(r) ? K.CACHE_ODDS_BP[r] : 0;
  return w;
}
const W_RARE_UP = weightsOf(["R", "E", "L"]);
const W_EPIC_UP = weightsOf(["E", "L"]);

/** One pity-aware rarity step (pure on `pity`; mutates only `rng`). Returns the rarity, the branch used and the new counters. */
export function rollCacheRarity(
  rng: RngState,
  pity: CachePity,
): { rarity: Rarity; guaranteed: "none" | "rare" | "epic" | "legendary"; pity: CachePity } {
  const p = {
    sinceRare: pity.sinceRare + 1,
    sinceEpic: pity.sinceEpic + 1,
    sinceLegendary: pity.sinceLegendary + 1,
  };
  let rarity: Rarity;
  let guaranteed: "none" | "rare" | "epic" | "legendary" = "none";
  if (p.sinceLegendary >= K.CACHE_PITY_LEG) {
    rarity = "L";
    guaranteed = "legendary";
  } else if (p.sinceEpic >= K.CACHE_PITY_EPIC) {
    rarity = pickWeighted(rng, W_EPIC_UP, RARITIES);
    guaranteed = "epic";
  } else if (p.sinceRare >= K.CACHE_PITY_RARE) {
    rarity = pickWeighted(rng, W_RARE_UP, RARITIES);
    guaranteed = "rare";
  } else {
    rarity = pickWeighted(rng, K.CACHE_ODDS_BP, RARITIES);
  }
  if (rarity === "R" || rarity === "E" || rarity === "L") p.sinceRare = 0;
  if (rarity === "E" || rarity === "L") p.sinceEpic = 0;
  if (rarity === "L") p.sinceLegendary = 0;
  return { rarity, guaranteed, pity: p };
}

/**
 * Opens one Gear Cache. The caller persists `rng` (save.metaRng) and the returned `pity` (save.cachePity).
 * tier = slotTier(slot, frontierChapter). The weapon archetype is drawn only for weapons.
 */
export function rollCache(
  rng: RngState,
  pity: CachePity,
  ctx: { frontierChapter: number; equippedArchetype: WeaponArchetype },
): { roll: GearRoll; pity: CachePity; event: MetaEvent } {
  const r = rollCacheRarity(rng, pity);
  const slot = rollSlot(rng);
  const archetype = slot === "weapon" ? rollArchetype(rng, ctx.equippedArchetype) : null;
  const tier = slotTier(slot, ctx.frontierChapter);
  const roll: GearRoll = { slot, tier, rarity: r.rarity, archetype };
  return {
    roll,
    pity: r.pity,
    event: {
      type: "CacheRolled",
      rarity: r.rarity,
      slot,
      tier,
      archetype,
      guaranteed: r.guaranteed,
      pity: { ...r.pity },
    },
  };
}

/** Data for the published-odds screen; the UI renders from this, never from hand-written copy. */
export function publishedCacheOdds(): {
  rarityBp: Record<Rarity, Bp>;
  pity: { rare: number; epic: number; legendary: number };
  effectiveRarityBp: Record<Rarity, Bp>;
  slotBp: Record<GearSlot, Bp>;
  weaponArchetypeBp: { equipped: Bp; otherEach: Bp };
} {
  let total = 0;
  for (const s of GEAR_SLOTS) total += K.CACHE_SLOT_W[s];
  const slotBp = {} as Record<GearSlot, Bp>;
  let used = 0;
  for (const s of GEAR_SLOTS) {
    slotBp[s] = Math.floor((K.CACHE_SLOT_W[s] * 10_000) / total);
    used += slotBp[s];
  }
  slotBp.weapon += 10_000 - used; // the remainder goes to the first slot: 3334 / 3333 / 3333
  return {
    rarityBp: { ...K.CACHE_ODDS_BP },
    pity: { rare: K.CACHE_PITY_RARE, epic: K.CACHE_PITY_EPIC, legendary: K.CACHE_PITY_LEG },
    effectiveRarityBp: { ...CACHE_EFFECTIVE_BP },
    slotBp,
    weaponArchetypeBp: { equipped: K.CACHE_ARCH_EQUIPPED_BP, otherEach: K.CACHE_ARCH_OTHER_BP },
  };
}

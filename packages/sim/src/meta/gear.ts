// Gear scores, tiers, prices and gold lookups (docs/interfaces.md §8). Pure integer math over generated tables.
// Python source: economy_sim.py slot_tier / item_score / tier_price / upg_cost / gold_unit / level_gold.
import type { GearSlot, Rarity } from "@hd2d/content";
import { K } from "../balance.ts";
import { SimError } from "../errors.ts";
import { BP, type Bp, mulBp } from "../fixed.ts";
import {
  GOLD_UNIT,
  LEVEL_GOLD,
  TIER_GROWTH_BP,
  TIER_PRICE,
  UPG_COST,
} from "../tables.generated.ts";

const SLOT_INDEX: Readonly<Record<GearSlot, number>> = { weapon: 0, armor: 1, charm: 2 };

/**
 * Tier unlocked for a slot at chapter c (economy_sim.slot_tier): ch1 all T1; the weapon reaches T2 at ch4, armor at
 * ch5, charm at ch6, then +1 tier every 3 chapters per slot. Capped at 10.
 */
export function slotTier(slot: GearSlot, chapter: number): number {
  const off = SLOT_INDEX[slot];
  if (chapter < 1 + off) return 1;
  return Math.min(10, Math.max(1, Math.floor((chapter - 1 - off) / 3) + 1));
}

/** Item score in basis points: TIER_GROWTH^(tier-1) x RARITY_MULT x (1 + UPG_STEP x upgrade) (economy_sim.item_score). */
export function itemScoreBp(tier: number, rarity: Rarity, upgrade: number): Bp {
  const g = TIER_GROWTH_BP[tier - 1];
  if (g === undefined) throw new SimError(`itemScoreBp: bad tier ${tier}`);
  return mulBp(mulBp(g, K.RARITY_MULT_BP[rarity]), BP + K.UPG_STEP_BP * upgrade);
}

export const upgradeCap = (rarity: Rarity): number => K.RARITY_UPG_CAP[rarity];

/** Whole-gold price of a Common item of this tier (economy_sim.tier_price). */
export function tierPrice(tier: number): number {
  const p = TIER_PRICE[tier - 1];
  if (p === undefined) throw new SimError(`tierPrice: bad tier ${tier}`);
  return p;
}

/** Cost of upgrade level `fromLevel` -> `fromLevel + 1` (economy_sim.upg_cost), whole gold. */
export function upgradeCost(tier: number, fromLevel: number): number {
  const c = UPG_COST[tier - 1]?.[fromLevel];
  if (c === undefined) throw new SimError(`upgradeCost: bad tier ${tier} / level ${fromLevel}`);
  return c;
}

/** Gold Unit of a chapter (economy_sim.gold_unit), whole gold. */
export function goldUnit(chapter: number): number {
  const g = GOLD_UNIT[chapter - 1];
  if (g === undefined) throw new SimError(`goldUnit: bad chapter ${chapter}`);
  return g;
}

/** First-clear gold of a level (economy_sim.level_gold), whole gold; index 10 is the boss. */
export function levelGold(chapter: number, index: number): number {
  const g = LEVEL_GOLD[chapter - 1]?.[index - 1];
  if (g === undefined) throw new SimError(`levelGold: bad level ${chapter}-${index}`);
  return g;
}

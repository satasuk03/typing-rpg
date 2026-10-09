// Prices, upgrade transfer, salvage, replay pay and the deterministic shop (docs/interfaces.md §8, doc 02 C16).
// Python source: economy_sim.py shop / inherit / salvage_value / attempt (replay multipliers). Pure integer math.
import type { GearSlot, Rarity } from "@hd2d/content";
import { K } from "../balance.ts";
import { SimError } from "../errors.ts";
import { BP, type Bp, mulBp } from "../fixed.ts";
import type { GearStats } from "../types.ts";
import { goldUnit, slotTier, tierPrice, upgradeCap } from "./gear.ts";

export type ShopRarity = "C" | "U" | "R";
export const SHOP_RARITIES: readonly ShopRarity[] = ["C", "U", "R"];

/** Shop price of a piece of this tier (economy_sim: tier_price x SHOP_RARITY_PRICE); the shop sells C / U / R only. */
export function shopPrice(tier: number, rarity: ShopRarity): number {
  return mulBp(tierPrice(tier), K.SHOP_RARITY_PRICE_BP[rarity]);
}

/** Gold price of a Gear Cache: CACHE_GOLD_GU Gold Units of the frontier chapter (a gold sink). */
export const cacheGoldPrice = (frontierChapter: number): number =>
  K.CACHE_GOLD_GU * goldUnit(frontierChapter);

/**
 * Upgrade Transfer: a new piece inherits floor(UPG_TRANSFER x old level), capped by its rarity
 * (economy_sim.inherit: `min(cap, int(0.5 * upg))`).
 */
export function transferUpgrade(oldUpgrade: number, newRarity: Rarity): number {
  return Math.min(upgradeCap(newRarity), mulBp(oldUpgrade, K.UPG_TRANSFER_BP));
}

/**
 * Gold returned when a piece is replaced (economy_sim.salvage_value) or when unwanted chest/cache gear is sold.
 * `nonTransferredUpgradeGold` = invested upgrade gold x (1 - UPG_TRANSFER); the caller tracks the investment.
 */
export function salvageValue(
  item: GearStats & { slot: GearSlot },
  ctx: { fromChestUnwanted: boolean; nonTransferredUpgradeGold: number },
): number {
  const base = mulBp(tierPrice(item.tier), K.VALUE_RARITY_PRICE_BP[item.rarity]);
  if (ctx.fromChestUnwanted) return mulBp(base, K.DROP_SALVAGE_RATE_BP);
  return mulBp(base + ctx.nonTransferredUpgradeGold, K.SALVAGE_RATE_BP);
}

/**
 * Gold multiplier of a level attempt (economy_sim.attempt): 100% on first clear; otherwise REPLAY_GOLD_MULT (40%),
 * x STALE_REPLAY_MULT (50%) when the level is more than one chapter behind the frontier, x REPLAY_SOFTCAP_MULT (25%)
 * once `replaysToday` has reached REPLAY_SOFTCAP_PER_DAY (40). The replay count is "today's" count BEFORE this replay.
 */
export function replayGoldMultBp(ctx: {
  firstClear: boolean;
  chapter: number;
  frontierChapter: number;
  replaysToday: number;
}): Bp {
  if (ctx.firstClear) return BP;
  let m = K.REPLAY_GOLD_MULT_BP;
  if (ctx.chapter < ctx.frontierChapter - 1) m = mulBp(m, K.STALE_REPLAY_MULT_BP);
  if (ctx.replaysToday >= K.REPLAY_SOFTCAP_PER_DAY) m = mulBp(m, K.REPLAY_SOFTCAP_MULT_BP);
  return m;
}

/**
 * Replays done today. The sim never reads the clock: the caller passes `today` (a day key such as "2026-10-09").
 * A stored count for another day is stale and counts as 0.
 */
export const replaysToday = (replays: { day: string; count: number }, today: string): number =>
  replays.day === today ? replays.count : 0;

/** The save's `replays` after one more replay on `today` (a new day key resets the count). */
export const recordReplay = (
  replays: { day: string; count: number },
  today: string,
): { day: string; count: number } => ({ day: today, count: replaysToday(replays, today) + 1 });

/** Gold bonus for newly earned stars on a level: STAR_GOLD x level gold per new star (economy_sim.attempt). */
export const starGold = (newStars: number, baseLevelGold: number): number =>
  newStars <= 0 ? 0 : mulBp(baseLevelGold, K.STAR_GOLD_BP) * newStars;

/** A deterministic shop offer: the slot and rarity are chosen by the player; tier is the slot's frontier tier. */
export interface ShopOffer {
  slot: GearSlot;
  tier: number;
  rarity: ShopRarity;
  price: number;
  /** Upgrade level the new piece starts at after Upgrade Transfer from the piece it replaces. */
  startUpgrade: number;
}

/** Shop fallback (C16): known price for the chosen slot and C/U/R rarity; no randomness. Throws for E/L. */
export function shopOffer(
  slot: GearSlot,
  rarity: Rarity,
  ctx: { frontierChapter: number; currentUpgrade: number },
): ShopOffer {
  if (rarity !== "C" && rarity !== "U" && rarity !== "R")
    throw new SimError(`shop: ${rarity} is not sold (Epic and Legendary come from Gear Caches)`);
  const tier = slotTier(slot, ctx.frontierChapter);
  return {
    slot,
    tier,
    rarity,
    price: shopPrice(tier, rarity),
    startUpgrade: transferUpgrade(ctx.currentUpgrade, rarity),
  };
}

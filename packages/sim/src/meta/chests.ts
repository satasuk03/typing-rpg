// Chests (docs/interfaces.md §8). Python source: economy_sim.py CHEST*, Player.roll_chest, attempt (chest drops).
// All draws come from the caller's RngState: in a level that is the `loot` stream derived at roll time
// (deriveRng(seed, "loot", encounterIndex)), so loot never depends on how the fight went.
import type { GearSlot, Rarity, WeaponArchetype } from "@hd2d/content";
import { K } from "../balance.ts";
import type { ChestTier } from "../events.ts";
import { BP, mulBp } from "../fixed.ts";
import { chance, pickWeighted, type RngState } from "../rng.ts";
import type { ChestContents, GearRoll } from "../types.ts";
import { goldUnit, slotTier } from "./gear.ts";

export const GEAR_SLOTS = ["weapon", "armor", "charm"] as const satisfies readonly GearSlot[];
export const WEAPON_ARCHETYPES = [
  "sword",
  "dagger",
  "staff",
  "hammer",
] as const satisfies readonly WeaponArchetype[];

/** Draws a weapon archetype: the equipped one 40%, each other 20% (PO decision; BALANCE.CACHE_ARCHETYPE_ODDS). */
export function rollArchetype(rng: RngState, equipped: WeaponArchetype): WeaponArchetype {
  const w = {} as Record<WeaponArchetype, number>;
  for (const a of WEAPON_ARCHETYPES)
    w[a] = a === equipped ? K.CACHE_ARCH_EQUIPPED_BP : K.CACHE_ARCH_OTHER_BP;
  return pickWeighted(rng, w, WEAPON_ARCHETYPES);
}

/** Uniform (weighted by BALANCE.CACHE_SLOT_ODDS) slot draw: one below() draw. */
export const rollSlot = (rng: RngState): GearSlot => pickWeighted(rng, K.CACHE_SLOT_W, GEAR_SLOTS);

/**
 * Does this encounter drop a chest, and of which tier? Normal encounters: 30% (15% on replay), tier 72/24/3.5/0.5.
 * Boss: always on first clear, 50% on replay, tier 55/38/7 (Iron/Gold/Mythic). One draw for the drop (always consumed),
 * one for the tier when it drops.
 */
export function rollEncounterChest(
  rng: RngState,
  ctx: { boss: boolean; firstClear: boolean },
): ChestTier | null {
  const p = ctx.boss
    ? ctx.firstClear
      ? BP
      : K.BOSS_CHEST_REPLAY_BP
    : ctx.firstClear
      ? K.CHEST_P_ENCOUNTER_BP
      : K.CHEST_P_ENCOUNTER_REPLAY_BP;
  if (!chance(rng, p)) return null;
  return pickWeighted(
    rng,
    ctx.boss ? K.CHEST_TIER_BOSS_BP : K.CHEST_TIER_NORMAL_BP,
    K.CHEST_TIER_ORDER,
  );
}

/**
 * Rolls a chest's contents (economy_sim.roll_chest). Gold = chest gold x Gold Unit of the LEVEL's chapter. Gold and
 * Mythic chests hold Gear Caches (1 / 2; opened later with the save's metaRng) and no gear. Wooden / Iron chests hold
 * gear with 10% / 35%: uniform slot, tier of `frontierChapter` (30% one tier lower), rarity from the chest table.
 * `gemsUncredited` is non-zero on first clear only (the server credits gems; D33).
 * Additive ctx fields: `firstClear` (default true) and `equippedArchetype` (default "sword") for weapon gear.
 */
export function openChest(
  rng: RngState,
  tier: ChestTier,
  ctx: {
    chapter: number;
    frontierChapter: number;
    firstClear?: boolean;
    equippedArchetype?: WeaponArchetype;
  },
): ChestContents {
  const spec = K.CHEST[tier];
  let gear: GearRoll | null = null;
  if (chance(rng, spec.gearBp)) {
    const slot = rollSlot(rng);
    let t = slotTier(slot, ctx.frontierChapter);
    if (chance(rng, K.CHEST_GEAR_TIER_DOWN_BP)) t = Math.max(1, t - 1);
    const rarity: Rarity = pickWeighted(rng, spec.rar, K.RARITY_ORDER);
    const archetype =
      slot === "weapon" ? rollArchetype(rng, ctx.equippedArchetype ?? "sword") : null;
    gear = { slot, tier: t, rarity, archetype };
  }
  return {
    tier,
    gold: mulBp(goldUnit(ctx.chapter), spec.goldBp),
    gear,
    caches: spec.caches,
    gemsUncredited: ctx.firstClear === false ? 0 : spec.gems,
  };
}

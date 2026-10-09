import type { Rarity } from "../schemas.ts";
import { GearDef } from "../schemas.ts";

/**
 * Gear for tiers 1 and 2 (interfaces section 6: GearDef holds names, art and flavor only).
 * Stats are derived from BALANCE: score = TIER_GROWTH^(tier-1) x RARITY_MULT[rarity] x (1 + UPG_STEP x upgrade).
 * Rarity and upgrade level are per instance (save GearInstance), so there is one def per (slot, archetype, tier);
 * RARITY_INFO below gives the five rarities their display names and colours.
 * Tier 1 is the chapter 1-3 kit, tier 2 the chapter 4-6 kit (doc 02 section 6.3).
 * `spriteId` is the icon key T2.x binds to art (the renderer has no gear sprites yet).
 */
const weapon = (
  archetype: "sword" | "dagger" | "staff" | "hammer",
  tier: number,
  name: string,
  flavor: string,
): GearDef =>
  GearDef.parse({
    id: `${archetype}-t${tier}`,
    slot: "weapon",
    archetype,
    tier,
    name,
    spriteId: `gear.weapon.${archetype}.t${tier}`,
    flavor,
  });

const armor = (tier: number, name: string, flavor: string): GearDef =>
  GearDef.parse({
    id: `armor-t${tier}`,
    slot: "armor",
    tier,
    name,
    spriteId: `gear.armor.t${tier}`,
    flavor,
  });

const charm = (tier: number, name: string, flavor: string): GearDef =>
  GearDef.parse({
    id: `charm-t${tier}`,
    slot: "charm",
    tier,
    name,
    spriteId: `gear.charm.t${tier}`,
    flavor,
  });

export const GEAR: GearDef[] = [
  // ---- tier 1 (chapters 1-3)
  weapon("sword", 1, "Wayfarer's Blade", "Plain steel, well balanced. It has walked a long road."),
  weapon("dagger", 1, "Thornleaf Dagger", "Two quick cuts before the foe can blink."),
  weapon("staff", 1, "Oakheart Staff", "A branch that remembers every spell it has heard."),
  weapon("hammer", 1, "Mason's Maul", "Slow to swing. It rings like a bell when it lands."),
  armor(1, "Traveler's Jerkin", "Patched leather that smells of rain and woodsmoke."),
  charm(1, "Acorn Charm", "A small seed of luck on a leather cord."),
  // ---- tier 2 (chapters 4-6)
  weapon("sword", 2, "Emberfall Sword", "Forged at the Ember Gate, still warm at dusk."),
  weapon("dagger", 2, "Duskfang Dagger", "Thin as a shadow and twice as quiet."),
  weapon("staff", 2, "Cinderbloom Staff", "A flower of ash blooms at its tip when you cast."),
  weapon("hammer", 2, "Ironhead Hammer", "Quarry stone and a cold iron head. Doors fear it."),
  armor(2, "Ranger's Brigandine", "Riveted plates sewn under green cloth."),
  charm(2, "Brass Compass", "It never points north. It points to where you should be."),
];

export interface RarityInfo {
  name: string;
  /** sRGB hex for the rarity frame, label and drop beam. */
  color: string;
  tagline: string;
}

/** Display data for the five gear rarities (BALANCE.RARITIES order). Odds and multipliers live in BALANCE. */
export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  C: { name: "Common", color: "#b9b4a6", tagline: "Honest gear for an honest road." },
  U: { name: "Uncommon", color: "#6fd16e", tagline: "A cut above the rest." },
  R: { name: "Rare", color: "#58a8ff", tagline: "The kind of piece guards remember." },
  E: { name: "Epic", color: "#b772ff", tagline: "Hums quietly when held." },
  L: { name: "Legendary", color: "#ffb43a", tagline: "Songs are written about gear like this." },
};

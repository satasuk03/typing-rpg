// Hero stats and loadouts (docs/interfaces.md §3 computeHeroStats, §8 buildLoadout / parLoadout / parHpM).
// Python source: economy_sim.py hero_stats, par_scores. Hero ATK = ATK0 x S_weapon x sqrt(S_charm); HP = HP0 x S_armor x sqrt(S_charm).
import type { ContentBundle, GearDef, GearSlot } from "@hd2d/content";
import { K } from "../balance.ts";
import { SimError } from "../errors.ts";
import { BP, isqrt, type Milli, mulBp } from "../fixed.ts";
import type {
  ActiveSkillId,
  CastMode,
  GearStats,
  Loadout,
  LoadoutSource,
  PassiveId,
} from "../types.ts";
import { itemScoreBp, slotTier } from "./gear.ts";

/** sqrt of a score given in basis points, in basis points: sqrt(x / BP) x BP = isqrt(x x BP). */
export const sqrtBp = (xBp: number): number => isqrt(xBp * BP);

const scoreOf = (g: GearStats): number => itemScoreBp(g.tier, g.rarity, g.upgrade);

/** Hero ATK and max HP in milli-points. The charm contributes its square root to both (economy_sim.hero_stats). */
export function computeHeroStats(loadout: Loadout): { atk: Milli; maxHp: Milli } {
  const root = sqrtBp(scoreOf(loadout.charm));
  return {
    atk: mulBp(mulBp(K.HERO_ATK0_M, scoreOf(loadout.weapon)), root),
    maxHp: mulBp(mulBp(K.HERO_HP0_M, scoreOf(loadout.armor)), root),
  };
}

/** Par build of chapter c: slotTier at PAR_RARITY_BY_CH / PAR_RARITY and PAR_UPG / PAR_UPG_DEFAULT; sword; no skills or passives. */
export function parLoadout(chapter: number): Loadout {
  const rarity = K.PAR_RARITY_BY_CH[chapter] ?? K.PAR_RARITY;
  const upgrade = K.PAR_UPG[chapter] ?? K.PAR_UPG_DEFAULT;
  const gear = (slot: GearSlot): GearStats => ({ tier: slotTier(slot, chapter), rarity, upgrade });
  return {
    weapon: { ...gear("weapon"), archetype: "sword" },
    armor: gear("armor"),
    charm: gear("charm"),
    actives: [null, null],
    activeModes: ["smart", "smart"],
    passives: [null, null, null],
  };
}

/** Par max HP of chapter c in milli (ResolvedLevel.parHpM: the Doom Spell damage base). */
export const parHpM = (chapter: number): Milli => computeHeroStats(parLoadout(chapter)).maxHp;

const ACTIVES: readonly string[] = [
  "slashWave",
  "piercingThrust",
  "fireball",
  "frostLock",
  "mendingLight",
  "aegis",
];
const PASSIVES: readonly string[] = [
  "cleanCut",
  "bulwarkStreak",
  "steadyHands",
  "riposte",
  "ironWill",
  "openingGambit",
  "lastStand",
  "comeback",
];

const active = (id: string | null): ActiveSkillId | null => {
  if (id === null) return null;
  if (!ACTIVES.includes(id)) throw new SimError(`unknown active skill ${id}`);
  return id as ActiveSkillId;
};
const passive = (id: string | null): PassiveId | null => {
  if (id === null) return null;
  if (!PASSIVES.includes(id)) throw new SimError(`unknown passive ${id}`);
  return id as PassiveId;
};

/** Throws SimError if an equipped uid/def is missing, a slot mismatches, or a skill/passive id is unknown. */
export function buildLoadout(src: LoadoutSource, bundle: ContentBundle): Loadout {
  const pick = (slot: GearSlot): { def: GearDef; stats: GearStats } => {
    const uid = src.equipped[slot];
    const inst = src.inventory.gear.find((g) => g.uid === uid);
    if (inst === undefined) throw new SimError(`equipped ${slot}: no gear with uid ${uid}`);
    const def = bundle.gear.find((g) => g.id === inst.defId);
    if (def === undefined) throw new SimError(`equipped ${slot}: unknown gear def ${inst.defId}`);
    if (def.slot !== slot) throw new SimError(`equipped ${slot}: ${def.id} is a ${def.slot}`);
    return { def, stats: { tier: def.tier, rarity: inst.rarity, upgrade: inst.upgrade } };
  };
  const w = pick("weapon");
  if (w.def.archetype === undefined) throw new SimError(`weapon ${w.def.id} has no archetype`);
  const modes = src.loadout.activeModes as readonly [CastMode, CastMode];
  return {
    weapon: { ...w.stats, archetype: w.def.archetype },
    armor: pick("armor").stats,
    charm: pick("charm").stats,
    actives: [active(src.loadout.actives[0]), active(src.loadout.actives[1])],
    activeModes: [modes[0], modes[1]],
    passives: [
      passive(src.loadout.passives[0]),
      passive(src.loadout.passives[1]),
      passive(src.loadout.passives[2]),
    ],
  };
}

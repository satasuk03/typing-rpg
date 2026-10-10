// Gear offsets for the balance tool (T1.5). `--gear par` (default) | `par-N` | `armor+N` | `weapon+N` | `all+N`.
// Item scores are real: the loadout is parLoadout(chapter) with GearStats.upgrade moved, and every score is read back
// through the sim's itemScoreBp / guardRatingBp (the functions the game runs).
// packages/sim has no `upgradeGear` helper, so `upgradeSteps` here applies the same rule the game's upgrade uses
// (+UPG_STEP per step, capped at upgradeCap(rarity), e.g. Common +5) directly to GearStats.
import {
  BP,
  computeHeroStats,
  type GearStats,
  guardRatingBp,
  itemScoreBp,
  K,
  type Loadout,
  mulBp,
  mulDiv,
  parArmorBp,
  parLoadout,
  upgradeCap,
} from "@hd2d/sim";

export type GearTarget = "armor" | "weapon" | "all";

type Slot = "weapon" | "armor" | "charm";

export interface GearSpec {
  /**
   * par: no offset. below: every slot N steps under par (floored at +0). above: `target` slot(s) N steps over par.
   * slots (T5.1): a signed offset per slot from par, e.g. "weapon-2,armor+1,charm-2" (the Ch1 hint-path arrival in Ch2).
   */
  kind: "par" | "below" | "above" | "slots";
  target: GearTarget;
  steps: number;
  /** kind "slots" only: signed steps per slot (absent slot = par). */
  perSlot?: Partial<Record<Slot, number>>;
}

export const PAR_GEAR: GearSpec = { kind: "par", target: "all", steps: 0 };

/** Parses the --gear value; throws a readable Error on anything else. */
export function parseGear(s: string | undefined): GearSpec {
  if (s === undefined || s === "par") return PAR_GEAR;
  let m = /^par-(\d+)$/.exec(s);
  if (m) return { kind: "below", target: "all", steps: Number(m[1]) };
  m = /^(armor|weapon|all)\+(\d+)$/.exec(s);
  if (m) return { kind: "above", target: m[1] as GearTarget, steps: Number(m[2]) };
  if (/^(weapon|armor|charm)[+-]\d+(,(weapon|armor|charm)[+-]\d+)+$/.test(s)) {
    const perSlot: Partial<Record<Slot, number>> = {};
    for (const part of s.split(",")) {
      const p = /^(weapon|armor|charm)([+-]\d+)$/.exec(part);
      if (p) perSlot[p[1] as Slot] = Number(p[2]);
    }
    return { kind: "slots", target: "all", steps: 0, perSlot };
  }
  throw new Error(
    `--gear: expected par | par-N | armor+N | weapon+N | all+N | slot±N,slot±N (e.g. weapon-2,armor+1,charm-2), got "${s}"`,
  );
}

export const gearLabel = (g: GearSpec): string =>
  g.kind === "par"
    ? "par"
    : g.kind === "below"
      ? `par-${g.steps}`
      : g.kind === "slots"
        ? Object.entries(g.perSlot ?? {})
            .map(([k, v]) => `${k}${v >= 0 ? "+" : ""}${v}`)
            .join(",")
        : `${g.target}+${g.steps}`;

export const isPar = (g: GearSpec): boolean => g.kind === "par" || g.steps === 0;

/** `steps` upgrade steps applied to a piece (negative = down), clamped to 0..upgradeCap(rarity). */
export function upgradeSteps<T extends GearStats>(g: T, steps: number): T {
  return { ...g, upgrade: Math.max(0, Math.min(upgradeCap(g.rarity), g.upgrade + steps)) };
}

const touches = (spec: GearSpec, slot: Slot): boolean =>
  spec.kind === "slots"
    ? spec.perSlot?.[slot] !== undefined
    : spec.kind === "below" || spec.target === "all" || spec.target === slot;
const delta = (spec: GearSpec, slot: Slot): number =>
  spec.kind === "slots"
    ? (spec.perSlot?.[slot] ?? 0)
    : spec.kind === "below"
      ? -spec.steps
      : spec.steps;

/** Applies the offset to a loadout (returns a new one; skills and passives untouched). par-N moves all three slots. */
export function applyGear(l: Loadout, spec: GearSpec): Loadout {
  if (spec.kind === "par") return l;
  const out: Loadout = { ...l };
  if (touches(spec, "weapon")) out.weapon = upgradeSteps(l.weapon, delta(spec, "weapon"));
  if (touches(spec, "armor")) out.armor = upgradeSteps(l.armor, delta(spec, "armor"));
  if (touches(spec, "charm")) out.charm = upgradeSteps(l.charm, delta(spec, "charm"));
  return out;
}

/** Guard leak (bp) of a hit with Attack Power `attackPowerBp` (x par armor): clamp(1 - G/P, 0, cap). Mirrors sim combat.ts. */
export function guardLeakBp(l: Loadout, chapter: number, attackPowerBp: number): number {
  const p = mulBp(parArmorBp(chapter), attackPowerBp);
  if (p <= 0) return 0;
  return Math.max(0, Math.min(K.GUARD_LEAK_CAP_BP, BP - mulDiv(guardRatingBp(l), BP, p)));
}

export interface GearDescription {
  label: string;
  slots: { slot: string; text: string }[];
  /** Requests cut by the floor (+0) or the rarity cap. */
  notes: string[];
}

/** Human-readable gear (tier, rarity, +upgrade, item score vs par) and the clamps that bit, for the report header. */
export function describeGear(l: Loadout, spec: GearSpec, chapter: number): GearDescription {
  const par = parLoadout(chapter);
  const slots = (["weapon", "armor", "charm"] as const).map((slot) => {
    const g = l[slot];
    const score = itemScoreBp(g.tier, g.rarity, g.upgrade);
    const parScore = itemScoreBp(par[slot].tier, par[slot].rarity, par[slot].upgrade);
    return {
      slot,
      text: `T${g.tier} ${g.rarity}+${g.upgrade} (score ${(score / BP).toFixed(3)}, ${((100 * score) / parScore).toFixed(0)}% of par)`,
    };
  });
  const notes: string[] = [];
  if (spec.kind !== "par") {
    for (const slot of ["weapon", "armor", "charm"] as const) {
      const d = delta(spec, slot);
      if (touches(spec, slot) && l[slot].upgrade !== par[slot].upgrade + d)
        notes.push(
          `${slot}: ${d >= 0 ? "+" : ""}${d} steps clamped to +${l[slot].upgrade} (${d < 0 ? "floor +0" : `${l[slot].rarity} cap +${upgradeCap(l[slot].rarity)}`})`,
        );
    }
  }
  return { label: gearLabel(spec), slots, notes };
}

export { computeHeroStats };

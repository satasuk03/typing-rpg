/**
 * Skill and passive description text with the real numbers (T3.2 gap): `{dmg}`, `{charge}`, `{secs}`, `{heal}`, `{hits}`
 * are filled from BALANCE.SKILLS / BALANCE.PASSIVES, so the screen can never disagree with the sim.
 */
import { BALANCE } from "@hd2d/sim";

type Row = Record<string, number | string | undefined>;

const rowOf = (id: string): Row | undefined => {
  const sk = BALANCE.SKILLS as unknown as Record<string, Row>;
  const ps = BALANCE.PASSIVES as unknown as Record<string, Row>;
  return sk[id] ?? ps[id];
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const num = (x: number): string =>
  Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10);

export function fillSkillText(text: string, id: string): string {
  const r = rowOf(id);
  if (!r) return text;
  const n = (k: string): number | undefined =>
    typeof r[k] === "number" ? (r[k] as number) : undefined;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    switch (k) {
      case "dmg": {
        const v = n("atk_mult") ?? n("atk_mult_all") ?? n("counter");
        return v === undefined ? m : pct(v);
      }
      case "charge": {
        const v = n("charge");
        return v === undefined ? m : num(v);
      }
      case "secs": {
        const v = n("burn_s") ?? n("freeze_s") ?? n("duration_s");
        return v === undefined ? m : num(v);
      }
      case "heal": {
        const v = n("heal");
        return v === undefined ? m : pct(v);
      }
      case "hits": {
        const v = n("barrier_hits") ?? n("shield_hits");
        return v === undefined ? m : num(v);
      }
      default:
        return m;
    }
  });
}

// pnpm --filter @hd2d/balance solve-hits [--chapter 1|2] [--seeds 200] [--iters 3] [--global] [--gear par|par-N|...]
// Re-solves each normal level's gruntHit on the REAL sim with the rule the content was authored with (economy_sim
// level_spec): the reference typist (35 WPM, 92%, REF_GUARD 0.60) takes DMG_FRAC(chapter) x par HP x
// (1 + SAW_ATK_STEP (p - 1)) gross damage per level. The reference build has no defensive picks (Fireball, Clean Cut,
// Steady Hands; no Aegis, no Iron Will) because economy_sim's guard model has no barrier or reduced block damage: the
// starter kit's defensive picks then show up as damage taken BELOW the budget, which is their value.
// Ch2 (T5.1, CH2_PLAN §4.3): DMG_FRAC 0.525, par HP 121.7, and the guard leak is ON (it is in the content: per-encounter
// and per-ref attackPower), so the solved HIT_MULT is "with leak on, at par gear". `--gear par-2 --iters 1` measures the
// §4.3 lever (expected 1.25-1.35x budget) without solving.
// Damage is close to linear in the hit, so a few fixed-point iterations converge. Prints the solved hits for levels-chN.ts.
import { contentBundle } from "@hd2d/content";
import { parHpM } from "@hd2d/sim";
import { runJobs } from "./runner.ts";

const DMG_FRAC_CH1 = 0.4; // economy_sim DMG_FRAC at chapter 1
const PAR_HP_CH1 = 100;
/** economy_sim DMG_FRAC by chapter (CH2_PLAN §4.1: 0.525 at chapter 2). */
const DMG_FRAC: Readonly<Record<number, number>> = { 1: DMG_FRAC_CH1, 2: 0.525 };
const SAW_ATK_STEP = 0.025;
/** Reference damage budget of level `index` of `chapter`: DMG_FRAC x par HP x saw. Ch1: 40 at L1 (literal, unchanged). */
export const levelDamageBudget = (index: number, chapter = 1): number => {
  const frac = DMG_FRAC[chapter];
  if (frac === undefined) throw new Error(`solve-hits: no DMG_FRAC for chapter ${chapter}`);
  const parHp = chapter === 1 ? PAR_HP_CH1 : parHpM(chapter) / 1000;
  return frac * parHp * (1 + SAW_ATK_STEP * (index - 1));
};

const args = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(opt("--seeds") ?? 200);
const iters = Number(opt("--iters") ?? 3);
const chapter = Number(opt("--chapter") ?? 1);
const gear = opt("--gear");
/** --global: one multiplier for every level (sum of budgets / sum of damage) instead of one per level. */
const global = args.includes("--global");
const levels = contentBundle.levels.filter((l) => l.kind === "normal" && l.chapter === chapter);
const mult = new Map(levels.map((l) => [l.id, 1]));
let last: { id: string; dmg: number }[] = [];
for (let it = 0; it < iters; it++) {
  const res = await runJobs(
    levels.map((l) => ({
      persona: "ref" as const,
      levelId: l.id,
      seeds,
      noise: false, // the authoring rule is for the nominal reference typist
      kit: "bare" as const,
      whatif: { hit: mult.get(l.id) as number },
      ...(gear === undefined ? {} : { gear }),
    })),
  );
  last = res.map((r) => ({
    id: r.job.levelId,
    dmg:
      r.records.reduce((a, x) => a + x.dmgTaken.attack + x.dmgTaken.doom + x.dmgTaken.minigame, 0) /
      r.records.length,
  }));
  const budget = levels.reduce((a, l) => a + levelDamageBudget(l.index, chapter), 0);
  const dmg = last.reduce((a, x) => a + x.dmg, 0);
  if (global) {
    for (const l of levels) mult.set(l.id, (mult.get(l.id) as number) * (budget / dmg));
  } else {
    for (const { id, dmg } of last) {
      const lv = levels.find((l) => l.id === id);
      if (lv === undefined) continue;
      mult.set(
        id,
        (mult.get(id) as number) * (levelDamageBudget(lv.index, chapter) / Math.max(0.1, dmg)),
      );
    }
  }
  console.log(
    `iteration ${it + 1}: ${last.map((x) => `${x.id} ${x.dmg.toFixed(1)}`).join(", ")}${chapter === 1 ? "" : ` | total ${dmg.toFixed(1)} / budget ${budget.toFixed(1)} = ${(dmg / budget).toFixed(3)}x`}`,
  );
}
if (global)
  console.log(
    `\nglobal hit multiplier (vs the current content): ${(mult.get(levels[0]?.id ?? "") as number).toFixed(3)}`,
  );
console.log(
  "\n| Level | Budget | Damage (last run) | Authored hit | Solved hit |\n|---|---|---|---|---|",
);
for (const lv of levels) {
  const enc = lv.segments.find((s) => s.kind === "encounter");
  const hit = enc?.kind === "encounter" ? enc.encounter.gruntHit : Number.NaN;
  const d = last.find((x) => x.id === lv.id)?.dmg ?? Number.NaN;
  console.log(
    `| ${lv.id} | ${levelDamageBudget(lv.index, chapter).toFixed(1)} | ${d.toFixed(1)} | ${hit} | ${(hit * (mult.get(lv.id) as number)).toFixed(2)} |`,
  );
}

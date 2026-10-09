// What-if knobs: transforms of the ResolvedLevel (pure data) applied before a run, so tuning ideas can be measured on the
// real sim without editing content or rules first. The shipped balance never depends on them (all default to "off").
// Usage: pnpm balance --whatif encHp=1.1,hpPaceExp=0.3,bossPace=1
import type { ResolvedLevel } from "@hd2d/sim";

export interface WhatIf {
  /** x encounter HP pools of normal levels. */
  encHp?: number;
  /** x encounter HP pools of the boss level's pre-boss waves. */
  preBossHp?: number;
  /** x boss HP (and the adds' pool, which is derived from it). */
  bossHp?: number;
  /** x grunt hit of every encounter. */
  hit?: number;
  /** economy_sim HP_PACE_EXP: every HP x clamp((pace / 35)^x, 0.7, 1.4). */
  hpPaceExp?: number;
  /** 1: Doom cadence, rubble spawn period and fall time x the enemy-interval pace factor (35/pace)^0.7 in 0.6..1.8.
   *  2: the same, but the Doom cadence never shrinks below its authored value (factor >= 1). */
  bossPace?: number;
  doomEveryS?: number;
  minDoom?: number;
  spawnEveryS?: number;
  fallS?: number;
  missHit?: number;
  /** x every persona's guard probability (bot attempt rate). */
  guard?: number;
}

export function parseWhatIf(s: string | undefined): WhatIf {
  const w: Record<string, number> = {};
  if (s === undefined || s === "") return w;
  for (const kv of s.split(",")) {
    const [k, v] = kv.split("=");
    if (k === undefined || v === undefined || Number.isNaN(Number(v)))
      throw new Error(`bad --whatif entry ${kv}`);
    w[k] = Number(v);
  }
  return w;
}

const paceFactor = (pace: number): number => Math.min(1.8, Math.max(0.6, (35 / pace) ** 0.7));
const r = (x: number): number => Math.max(1, Math.round(x));

export function applyWhatIf(def: ResolvedLevel, w: WhatIf, pace: number): ResolvedLevel {
  if (Object.keys(w).length === 0) return def;
  const d: ResolvedLevel = structuredClone(def);
  const hpPace =
    w.hpPaceExp === undefined ? 1 : Math.min(1.4, Math.max(0.7, (pace / 35) ** w.hpPaceExp));
  for (const s of d.segments) {
    if (s.kind !== "encounter") continue;
    const m = (d.isBoss ? (w.preBossHp ?? 1) : (w.encHp ?? 1)) * hpPace;
    s.hpPoolM = r(s.hpPoolM * m);
    s.gruntHitM = r(s.gruntHitM * (w.hit ?? 1));
  }
  const b = d.boss;
  if (b !== null) {
    const m = (w.bossHp ?? 1) * hpPace;
    b.hpM = r(b.hpM * m);
    if (b.phase1.addsHpPoolM !== undefined) b.phase1.addsHpPoolM = r(b.phase1.addsHpPoolM * m);
    if (b.phase1.addsGruntHitM !== undefined)
      b.phase1.addsGruntHitM = r(b.phase1.addsGruntHitM * (w.hit ?? 1));
    const pf = w.bossPace === 1 || w.bossPace === 2 ? paceFactor(pace) : 1;
    const pfDoom = w.bossPace === 2 ? Math.max(1, pf) : pf;
    if (w.doomEveryS !== undefined) b.phase2.doomEveryTicks = r(w.doomEveryS * 60);
    if (w.minDoom !== undefined) b.phase2.minDoomSpells = w.minDoom;
    if (w.spawnEveryS !== undefined) b.phase3.minigame.spawnEveryTicks = r(w.spawnEveryS * 60);
    if (w.fallS !== undefined) b.phase3.minigame.fallTicks = r(w.fallS * 60);
    if (w.missHit !== undefined) b.phase3.minigame.missHitM = r(w.missHit * 1000);
    b.phase2.doomEveryTicks = r(b.phase2.doomEveryTicks * pfDoom);
    b.phase3.minigame.spawnEveryTicks = r(b.phase3.minigame.spawnEveryTicks * pf);
    b.phase3.minigame.fallTicks = r(b.phase3.minigame.fallTicks * pf);
  }
  return d;
}

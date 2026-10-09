// Statuses (T1.4): hero barrier charges, enemy burn / bleed DoTs and Frost Lock's freeze. No damage is dealt here (DoT
// ticks live in skills.ts because they need the damage chain); this module only depends on state and the event bus.
import { K } from "./balance.ts";
import type { Emit } from "./bus.ts";
import type { HitOrigin } from "./events.ts";
import type { DotState, EncounterState, EnemyState } from "./state.ts";
import type { ActiveSkillId, LevelState } from "./types.ts";

/** Adds barrier charges (capped at BARRIER_CAP). Emits StatusApplied{barrier} with the new stack count. */
export function grantBarrier(
  state: LevelState,
  hits: number,
  origin: HitOrigin | null,
  skillId: ActiveSkillId | null,
  emit: Emit,
): void {
  const run = state.run;
  const next = Math.min(K.BARRIER_CAP, run.barrier + hits);
  if (next === run.barrier) return;
  run.barrier = next;
  emit({
    type: "StatusApplied",
    tick: state.tick,
    targetId: 0,
    status: "barrier",
    untilTick: null,
    stacks: next,
    origin,
    skillId,
  });
}

/** An enemy attack was absorbed: one charge is spent; StatusEnded{barrier} when the last one goes. */
export function consumeBarrier(state: LevelState, emit: Emit): void {
  const run = state.run;
  run.barrier--;
  if (run.barrier === 0)
    emit({ type: "StatusEnded", tick: state.tick, targetId: 0, status: "barrier" });
}

/** Applies (or refreshes) a burn / bleed. The first DoT tick lands DOT_TICK_T after application. */
export function applyDot(
  state: LevelState,
  enemy: EnemyState,
  dot: Omit<DotState, "untilTick" | "nextTick"> & { durationT: number },
  emit: Emit,
): void {
  const t = state.tick;
  const { durationT, ...rest } = dot;
  const next: DotState = { ...rest, untilTick: t + durationT, nextTick: t + K.DOT_TICK_T };
  const i = enemy.dots.findIndex((d) => d.status === dot.status);
  if (i >= 0) enemy.dots[i] = next;
  else enemy.dots.push(next);
  emit({
    type: "StatusApplied",
    tick: t,
    targetId: enemy.id,
    status: dot.status,
    untilTick: next.untilTick,
    stacks: 1,
    origin: dot.origin,
    skillId: dot.skillId,
  });
}

/** Frost Lock: freezes the enemy's attack gauge until `t + ticks` (refreshes a running freeze). */
export function freezeEnemy(
  state: LevelState,
  enemy: EnemyState,
  ticks: number,
  skillId: ActiveSkillId,
  emit: Emit,
): void {
  enemy.frozenUntil = state.tick + ticks;
  emit({
    type: "StatusApplied",
    tick: state.tick,
    targetId: enemy.id,
    status: "freeze",
    untilTick: enemy.frozenUntil,
    stacks: 1,
    origin: "skill",
    skillId,
  });
}

/**
 * Step 1 of the tick: a frozen enemy's attack timer (cycle start, impact and a shown guard word's deadline) is held back
 * by one tick, so the freeze delays the impact by exactly its length; the status ends on its last tick.
 */
export function stepFreezes(state: LevelState, emit: Emit): void {
  const enc = state.enc as EncounterState;
  const t = state.tick;
  for (const e of enc.enemies) {
    if (!e.alive || e.frozenUntil === null) continue;
    if (e.nextImpact !== null) {
      e.nextImpact++;
      e.cycleStart++;
      const plate = enc.plates.find((p) => p.id === e.plateId);
      if (plate !== undefined && plate.kind === "guard" && plate.expiresAt !== null)
        plate.expiresAt++;
    }
    if (t >= e.frozenUntil) {
      e.frozenUntil = null;
      emit({ type: "StatusEnded", tick: t, targetId: e.id, status: "freeze" });
    }
  }
}

/** An enemy died: its statuses end (one StatusEnded each) and its timers are cleared. */
export function clearEnemyStatuses(state: LevelState, enemy: EnemyState, emit: Emit): void {
  for (const d of enemy.dots)
    emit({ type: "StatusEnded", tick: state.tick, targetId: enemy.id, status: d.status });
  enemy.dots = [];
  if (enemy.staggerUntil !== null)
    emit({ type: "StatusEnded", tick: state.tick, targetId: enemy.id, status: "stagger" });
  enemy.staggerUntil = null;
  if (enemy.frozenUntil !== null)
    emit({ type: "StatusEnded", tick: state.tick, targetId: enemy.id, status: "freeze" });
  enemy.frozenUntil = null;
}

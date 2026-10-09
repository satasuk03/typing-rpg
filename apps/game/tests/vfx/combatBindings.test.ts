/**
 * T2.3 binding AC: every SimEventType's combat-VFX column (`fx`) is a real effect or an explicitly justified
 * `fxNone`, and every real effect calls a method the CombatFx director really has.
 */
import type { SimEvent } from "@hd2d/sim";
import { ALL_EVENT_TYPES } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import {
  BINDINGS,
  type BindingCtx,
  type EventBinding,
  type RenderActions,
} from "../../src/level/eventBindings";
import { CombatFx } from "../../src/render/vfx/combat/CombatFx";

describe("combat VFX bindings (plan T2.3 AC)", () => {
  it("every event type has a combat effect or a justified none, never both, never neither", () => {
    for (const t of ALL_EVENT_TYPES) {
      const b = BINDINGS[t] as EventBinding<typeof t>;
      const hasFx = b.fx !== undefined;
      const none = (b.fxNone ?? "").trim();
      expect(hasFx || none.length > 0, `${t} has neither fx nor a fxNone reason`).toBe(true);
      expect(hasFx && none.length > 0, `${t} has both fx and fxNone`).toBe(false);
      if (!hasFx) expect(none.length, `${t}: the fxNone reason is too short`).toBeGreaterThan(15);
    }
  });

  it("the non-typing combat events all have a real effect", () => {
    const need = [
      "AutoAttack",
      "Hit",
      "WeaknessRevealed",
      "ShieldDamaged",
      "Break",
      "StatusApplied",
      "StatusEnded",
      "SkillCast",
      "PassiveTriggered",
      "EnemyAttackWindup",
      "EnemyAttack",
      "GuardBlocked",
      "GuardParried",
      "EnemyDeath",
      "HeroHealed",
      "HeroDowned",
      "SecondWindSucceeded",
      "ChestDropped",
      "GoldGained",
      "BossIntroStarted",
      "BossPhaseChanged",
      "DoomSpellStarted",
      "DoomSpellCompleted",
      "DoomSpellFailed",
      "MinigameWordMissed",
    ] as const;
    for (const t of need) expect(BINDINGS[t].fx, `${t} must have a combat effect`).toBeDefined();
  });

  it("an fx column calls exactly one method of the sink, and CombatFx implements it", () => {
    const methods = new Set(Object.getOwnPropertyNames(CombatFx.prototype));
    for (const t of ALL_EVENT_TYPES) {
      const b = BINDINGS[t] as EventBinding<typeof t>;
      if (!b.fx) continue;
      const calls: string[] = [];
      const fx = new Proxy({} as NonNullable<BindingCtx["fx"]>, {
        get: (_o, name: string) => () => calls.push(name),
      });
      const ctx: BindingCtx = {
        render: {} as RenderActions,
        ui: { hint: () => {}, secondWind: () => {} },
        fx,
      };
      (b.fx as (e: SimEvent, c: BindingCtx) => void)({ type: t, tick: 0 } as SimEvent, ctx);
      expect(calls.length, `${t} fx must call the sink once`).toBe(1);
      expect(methods.has(calls[0] as string), `CombatFx has no method ${calls[0]} (${t})`).toBe(
        true,
      );
    }
  });

  it("without a sink (tests, effects off) the fx column is a safe no-op", () => {
    for (const t of ALL_EVENT_TYPES) {
      const b = BINDINGS[t] as EventBinding<typeof t>;
      const ctx: BindingCtx = {
        render: {} as RenderActions,
        ui: { hint: () => {}, secondWind: () => {} },
      };
      expect(() =>
        (b.fx as ((e: SimEvent, c: BindingCtx) => void) | undefined)?.(
          { type: t, tick: 0 } as SimEvent,
          ctx,
        ),
      ).not.toThrow();
    }
  });

  it("typing events are never double-presented by the combat library", () => {
    for (const t of [
      "CharCorrect",
      "Typo",
      "WordCompleted",
      "SentenceWordDone",
      "ComboTierChanged",
      "KeyStreakTierChanged",
      "AtbFilled",
    ] as const)
      expect(BINDINGS[t].fx, t).toBeUndefined();
  });
});

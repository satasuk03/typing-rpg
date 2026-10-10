/**
 * DEV-ONLY combat VFX demo (T2.3) on the real level runner: `?scene=play&level=ch1-l01&demo=1` exposes
 * `window.__play.demo(name)`, which feeds a SYNTHETIC sim event through the render and fx columns of the binding
 * table (never the HUD or audio: no fake damage pops) at the first living enemy, so every effect can be seen and
 * captured on the real stage, camera and post pipeline without waiting for the sim to produce it.
 *
 *   demo("slash" | "dagger" | "staff" | "hammer" | "crit" | "weak" | "chip" | "shield" | "break" | "fireball" |
 *        "slashWave" | "thrust" | "frost" | "aegis" | "mend" | "burn" | "bleed" | "stagger" | "windup" | "lunge" |
 *        "block" | "parry" | "death" | "chest:Wooden|Iron|Gold|Mythic" | "coins" | "bossIntro" | "doom" |
 *        "doomFail" | "phase" | "rubble" | "revive" | "passive")
 *
 * `demo("off")` clears the forced barrier / statuses. Returns false when there is nothing to aim at.
 */
import type { EventOf, SimEvent, SimEventType } from "@hd2d/sim";
import { BINDINGS, type BindingCtx, type EventBinding } from "../level/eventBindings";
import type { PlaySession } from "../level/session";
import { makeCh2Demo } from "./ch2FxDemo";

export const DEMO_NAMES = [
  "slash",
  "dagger",
  "staff",
  "hammer",
  "crit",
  "weak",
  "chip",
  "shield",
  "break",
  "fireball",
  "slashWave",
  "thrust",
  "frost",
  "aegis",
  "mend",
  "burn",
  "bleed",
  "stagger",
  "windup",
  "lunge",
  "block",
  "parry",
  "death",
  "chest:Wooden",
  "chest:Iron",
  "chest:Gold",
  "chest:Mythic",
  "coins",
  "bossIntro",
  "doom",
  "doomFail",
  "phase",
  "rubble",
  "revive",
  "passive",
] as const;

export function makeDemo(session: PlaySession): (name: string) => boolean {
  const present = (e: SimEvent): void => {
    const b = BINDINGS[e.type as SimEventType] as EventBinding<SimEventType>;
    const ctx: BindingCtx = { render: session.stage, ui: session.screens, fx: session.combat?.fx };
    (b.render as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, ctx);
    (b.fx as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, ctx);
  };
  // follow-up events run on the STAGE clock (it pauses with a freeze), so captures do not depend on the frame rate
  const sched: { t: number; fn: () => void }[] = [];
  const later = (ms: number, fn: () => void): void => {
    sched.push({ t: session.stage.time + ms / 1000, fn });
  };
  const pump = (): void => {
    for (let i = sched.length - 1; i >= 0; i--) {
      const s = sched[i];
      if (s && session.stage.time >= s.t) {
        sched.splice(i, 1);
        s.fn();
      }
    }
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);

  let ch2: ((name: string) => boolean) | null = null;
  return (name: string): boolean => {
    // T3.2: `ch2:<name>` Chapter II demos (dev/ch2FxDemo.ts); built on first use
    if (name.startsWith("ch2:")) {
      ch2 ??= makeCh2Demo(session);
      return ch2(name);
    }
    const fx = session.combat?.fx;
    if (!fx) return false;
    if (name === "off") {
      fx.debug.barrier = 0;
      fx.debug.statuses.clear();
      fx.debug.archetype = null;
      fx.clear();
      return true;
    }
    const view = session.stage.view;
    if (!view) return false;
    const tick = view.tick;
    const foes = view.enemies.filter((e) => e.alive);
    const foe = foes.find((e) => e.isBoss) ?? foes[0];
    const tid = foe?.id ?? 0;
    const hit = (o: Partial<EventOf<"Hit">>): EventOf<"Hit"> => ({
      type: "Hit",
      tick,
      sourceId: 0,
      targetId: tid,
      kind: "auto",
      origin: "weapon",
      skillId: null,
      damageType: "slash",
      damage: 12,
      damageM: 12000,
      hpAfter: 50,
      maxHp: 100,
      crit: false,
      weak: false,
      broken: false,
      atbKnockback: false,
      hitIndex: 0,
      hitCount: 1,
      killed: false,
      ...o,
    });
    const auto = (
      arche: "sword" | "dagger" | "staff" | "hammer",
      crit: boolean,
      hits: number,
    ): void => {
      fx.debug.archetype = arche;
      present({
        type: "AutoAttack",
        tick,
        targetId: tid,
        archetype: arche,
        hits,
        impactTick: tick + 18,
        crit,
      });
      later(300, () => {
        for (let i = 0; i < hits; i++)
          later(i * 130, () =>
            present(hit({ crit: crit && i === hits - 1, hitIndex: i, hitCount: hits })),
          );
      });
    };
    const need = (): boolean => foe !== undefined;
    switch (name) {
      case "slash":
        if (!need()) return false;
        auto("sword", false, 2);
        return true;
      case "dagger":
        if (!need()) return false;
        auto("dagger", false, 3);
        return true;
      case "staff":
        if (!need()) return false;
        auto("staff", false, 1);
        return true;
      case "hammer":
        if (!need()) return false;
        auto("hammer", false, 1);
        return true;
      case "crit":
        if (!need()) return false;
        auto("sword", true, 3);
        return true;
      case "weak":
        if (!need()) return false;
        present({ type: "WeaknessRevealed", tick, enemyId: tid, damageType: "fire" });
        later(250, () => present(hit({ weak: true, damageType: "fire" })));
        return true;
      case "chip":
        if (!need()) return false;
        present(hit({ kind: "chip", origin: "chip", damageType: "ice", damage: 3 }));
        fx.chipImpact(hit({ kind: "chip", origin: "chip", damageType: "ice", damage: 3 }));
        return true;
      case "shield":
        if (!need()) return false;
        present({ type: "ShieldDamaged", tick, enemyId: tid, shield: 2, shieldMax: 4 });
        return true;
      case "break":
        if (!need()) return false;
        present({ type: "Break", tick, enemyId: tid, untilTick: tick + 300 });
        return true;
      case "fireball":
        if (!need()) return false;
        present({
          type: "SkillCast",
          tick,
          slot: 0,
          skillId: "fireball",
          targetIds: [tid],
          impactTick: tick + 24,
        });
        later(420, () =>
          present(
            hit({
              kind: "skill",
              origin: "skill",
              skillId: "fireball",
              damageType: "fire",
              damage: 30,
            }),
          ),
        );
        fx.debug.statuses.set(tid, ["burn"]);
        return true;
      case "slashWave":
        if (!need()) return false;
        present({
          type: "SkillCast",
          tick,
          slot: 0,
          skillId: "slashWave",
          targetIds: foes.map((e) => e.id),
          impactTick: tick + 24,
        });
        later(420, () => {
          for (const e of foes)
            present(
              hit({
                targetId: e.id,
                kind: "skill",
                origin: "skill",
                skillId: "slashWave",
                damage: 20,
              }),
            );
        });
        return true;
      case "thrust":
        if (!need()) return false;
        present({
          type: "SkillCast",
          tick,
          slot: 0,
          skillId: "piercingThrust",
          targetIds: [tid],
          impactTick: tick + 24,
        });
        later(380, () =>
          present(
            hit({
              kind: "skill",
              origin: "skill",
              skillId: "piercingThrust",
              damageType: "pierce",
              damage: 26,
            }),
          ),
        );
        return true;
      case "frost":
        if (!need()) return false;
        present({
          type: "SkillCast",
          tick,
          slot: 0,
          skillId: "frostLock",
          targetIds: foes.map((e) => e.id),
          impactTick: tick + 24,
        });
        later(420, () => {
          for (const e of foes) {
            present({
              type: "StatusApplied",
              tick,
              targetId: e.id,
              status: "freeze",
              untilTick: tick + 600,
              stacks: 1,
              origin: "skill",
              skillId: "frostLock",
            });
            fx.debug.statuses.set(e.id, ["freeze"]);
          }
        });
        return true;
      case "aegis":
        present({
          type: "SkillCast",
          tick,
          slot: 1,
          skillId: "aegis",
          targetIds: [],
          impactTick: tick + 24,
        });
        later(380, () => {
          present({
            type: "StatusApplied",
            tick,
            targetId: 0,
            status: "barrier",
            untilTick: null,
            stacks: 2,
            origin: "skill",
            skillId: "aegis",
          });
          fx.debug.barrier = 2;
        });
        return true;
      case "mend":
        present({
          type: "SkillCast",
          tick,
          slot: 1,
          skillId: "mendingLight",
          targetIds: [],
          impactTick: tick + 24,
        });
        later(380, () =>
          present({
            type: "HeroHealed",
            tick,
            cause: "skill",
            amount: 30,
            hpAfter: 90,
            maxHp: 100,
          }),
        );
        return true;
      case "burn":
      case "bleed":
      case "stagger":
        if (!need()) return false;
        present({
          type: "StatusApplied",
          tick,
          targetId: tid,
          status: name,
          untilTick: tick + 300,
          stacks: 1,
          origin: "skill",
          skillId: null,
        });
        fx.debug.statuses.set(tid, [name]);
        return true;
      case "windup":
        if (!need()) return false;
        present({
          type: "EnemyAttackWindup",
          tick,
          enemyId: tid,
          impactTick: tick + 90,
          heavy: false,
        });
        return true;
      case "lunge":
        if (!need()) return false;
        present({ type: "EnemyAttack", tick, enemyId: tid, outcome: "hit", damage: 10 });
        return true;
      case "block":
        present({ type: "GuardBlocked", tick, enemyId: tid, damage: 0 });
        return true;
      case "parry":
        present({ type: "GuardParried", tick, enemyId: tid, counterDamage: 8 });
        return true;
      case "death":
        if (!need()) return false;
        present({
          type: "EnemyDeath",
          tick,
          enemyId: tid,
          defId: foe?.defId ?? "",
          isBoss: foe?.isBoss ?? false,
          byKind: "auto",
        });
        return true;
      case "chest:Wooden":
      case "chest:Iron":
      case "chest:Gold":
      case "chest:Mythic":
        present({
          type: "ChestDropped",
          tick,
          tier: name.slice(6) as "Wooden",
          encounterIndex: 0,
          enemyId: foe ? tid : null,
        });
        return true;
      case "coins":
        present({ type: "GoldGained", tick, amount: 240, source: "encounter", total: 240 });
        return true;
      case "bossIntro":
        if (!need()) return false;
        present({
          type: "BossIntroStarted",
          tick,
          enemyId: tid,
          bossId: "demo",
          name: "Demo",
          title: "Demo",
          untilTick: tick + 240,
        });
        return true;
      case "doom":
        if (!need()) return false;
        present({
          type: "DoomSpellStarted",
          tick,
          enemyId: tid,
          plateId: 1,
          text: "doom",
          deadlineTick: tick + 900,
        });
        return true;
      case "doomFail":
        if (!need()) return false;
        present({ type: "DoomSpellFailed", tick, enemyId: tid, plateId: 1, damage: 10 });
        return true;
      case "phase":
        if (!need()) return false;
        present({
          type: "BossPhaseChanged",
          tick,
          enemyId: tid,
          from: 1,
          to: 2,
          breatherUntilTick: tick + 120,
        });
        return true;
      case "rubble":
        present({ type: "MinigameWordMissed", tick, plateId: 1, lane: 1, damage: 8 });
        return true;
      case "revive":
        present({ type: "SecondWindSucceeded", tick, hpAfter: 40, maxHp: 100 });
        return true;
      case "passive":
        present({ type: "PassiveTriggered", tick, passiveId: "riposte", targetId: null });
        return true;
      default:
        return false;
    }
  };
}

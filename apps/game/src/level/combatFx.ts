/**
 * The T2.3 combat VFX inside the real level session (`render/vfx/combat/`).
 *
 *   sim events --> EventRouter --> BINDINGS[type].fx --> Sinks.fx (CombatFx)         (eventBindings.ts)
 *   TypingFxHandle callbacks chipImpact / dissolve ----> CombatFx                      (when the queue releases them)
 *   per frame:  stage.update(...) --> combat.update(stage.dt)                          (hit-stop freezes the arcs too)
 *
 * It shares the typing VFX's particle pools (one draw call per blend mode) and its capped post flash; it owns 3
 * point lights of its own. Without the typing VFX (`?fx=0`) it builds pools of its own.
 */
import type { LevelView } from "@hd2d/sim";
import type { Hud } from "../hud";
import type { RenderWorld } from "../render";
import { CombatFx } from "../render/vfx/combat/CombatFx";
import type { EventRouter } from "./eventBindings";
import type { LevelStage } from "./stage";
import type { SessionTypingFx } from "./typingFx";

export interface SessionCombatFxOptions {
  stage: LevelStage;
  world: RenderWorld;
  hud: Hud;
  router: EventRouter;
  typing: SessionTypingFx | null;
  seed?: number;
}

export interface SessionCombatFx {
  readonly fx: CombatFx;
  /** Once per frame, AFTER `stage.update`. */
  update(view: LevelView): void;
  /** A new attempt: drop everything in flight. */
  reset(): void;
  dispose(): void;
}

export function attachCombatFx(o: SessionCombatFxOptions): SessionCombatFx {
  const { stage, world, hud, router, typing } = o;
  const worldFx = typing?.handle.worldFx ?? null;
  const fx = new CombatFx({
    world,
    anchors: {
      hero: (out) => stage.heroPos(out),
      enemy: (id, out) => stage.enemyBody(id, out),
    },
    shared: worldFx ? { add: worldFx.poolA, norm: worldFx.poolB } : null,
    getView: () => stage.view,
    heroSnapshot: (out) => stage.heroSnapshot(out),
    enemyInfo: (id, out) => stage.enemyInfo(id, out),
    rim: (who, amount, rgb) => stage.rimFlash(who, amount, rgb),
    postFlash: worldFx ? (a, rgb, ms, cap) => worldFx.postFlash(a, rgb, ms, cap) : undefined,
    seed: o.seed,
  });
  // the typing handle presents the chip impact and the death through its callbacks (queue order); take them over
  if (typing) {
    typing.handle.callbacks.chipImpact = (hit) => fx.chipImpact(hit);
    typing.handle.callbacks.dissolve = (id, byKind) => fx.dissolve(id, byKind);
    fx.viaCallbacks = true;
  }
  router.sinks.fx = fx;
  const off = router.register(["LevelStarted"], () => fx.clear());
  const apply = (): void => {
    const s = hud.getSettings();
    fx.setSettings(s, world.qualityTier);
  };
  apply();
  return {
    fx,
    update(view) {
      apply();
      fx.setView(view);
      fx.update(stage.dt);
    },
    reset() {
      fx.clear();
    },
    dispose() {
      off();
      if (router.sinks.fx === fx) router.sinks.fx = undefined;
      if (typing) {
        typing.handle.callbacks.chipImpact = () => {};
        typing.handle.callbacks.dissolve = () => {};
      }
      fx.dispose();
    },
  };
}

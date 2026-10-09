/**
 * The T2.6 typing VFX inside the real level session (spec §11, `render/vfx/README.md`).
 *
 *   sim events --> router gate (TypingFxHandle.onEvent) --> built-in bindings --> HUD / stage / audio
 *                     |                                          ^
 *                     +-- held-back events (chip hits, events queued behind them) --> onPresent --> router.present
 *
 *   per frame:  worldDt = fx.update(dt, dt, view)  -->  stage.update(view, alpha, worldDt)   (the world sees the
 *               dilated time; the HUD and the audio stay in real time)
 *
 * The T2.3-style callbacks are implemented on the stage's actors where the stage has the equivalent:
 *   actorFlash -> outline flash (`SpriteActor.setRimFlash`)       cameraPose -> stage camera override
 *   heroPush   -> hero push-back on a guard block                  dash(finisher) -> hero lunge at the boss
 *   sfx        -> AudioEngine.play                                 slashArc / chipImpact / dissolve -> no-ops: the
 *   stage already plays them from the bindings (`Hit`, `EnemyDeath`) when the presented event reaches it, and the
 *   finisher draws its own arcs.
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import type { AudioApi } from "../audio";
import type { Sfx } from "../audio/types";
import type { Hud } from "../hud";
import type { RenderWorld } from "../render";
import { createTypingFx, type TypingFxHandle } from "../render/vfx/TypingFxHandle";
import type { TypingFxSettings } from "../render/vfx/types";
import type { EventRouter } from "./eventBindings";
import type { LevelStage } from "./stage";

export interface SessionTypingFxOptions {
  stage: LevelStage;
  world: RenderWorld;
  hud: Hud;
  router: EventRouter;
  audio: AudioApi | null;
  seed?: number;
  settings?: Partial<TypingFxSettings>;
}

export interface SessionTypingFx {
  readonly handle: TypingFxHandle;
  /** Once per frame, BEFORE `stage.update`: returns the dt the world (stage) must use. */
  update(dt: number, view: LevelView): number;
  /** A new attempt: drop everything in flight. */
  reset(): void;
  dispose(): void;
}

const SFX = new Set<string>(["slash", "crit", "hit", "guard", "parry"]);

export function attachTypingFx(o: SessionTypingFxOptions): SessionTypingFx {
  const { stage, world, hud, router } = o;
  if (o.settings) hud.setSettings(o.settings);
  const handle = createTypingFx({
    hud,
    world,
    seed: o.seed,
    quality: world.qualityTier,
    anchors: {
      hero: (out) => stage.heroPos(out),
      enemy: (id, out) => stage.enemyBody(id, out),
    },
    callbacks: {
      actorFlash: (who, amount, rgb) => stage.rimFlash(who, amount, rgb),
      cameraPose: (pose, rate, snap) => stage.setCameraOverride(pose, rate, snap),
      heroPush: (dist, outMs, backMs) => stage.heroPush(dist, outMs, backMs),
      dash: (startInMs, _durationMs, targetId, source) => {
        // the auto-attack's own binding already starts the stage's attack animation
        if (source === "finisher") stage.dashLater(startInMs, targetId);
      },
      sfx: (id) => {
        if (o.audio && SFX.has(id)) o.audio.play(id as Sfx);
      },
    },
    onPresent: (e: SimEvent) => router.present(e),
  });
  handle.setSettings(o.settings ?? {});
  router.setPresentationGate((e) => handle.onEvent(e));
  return {
    handle,
    update(dt, view) {
      return handle.update(dt, dt, view);
    },
    reset() {
      handle.queue.clear();
      handle.setEnabled(false);
      handle.setEnabled(true);
    },
    dispose() {
      router.setPresentationGate(null);
      stage.setCameraOverride(null, 2.6, false);
      handle.dispose();
    },
  };
}

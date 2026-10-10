/**
 * TypingFxHandle: the single object the level runner registers to get the T2.6 typing VFX.
 * See README.md in this folder for the wiring.
 *
 *   const fx = createTypingFx({ hud, world, anchors, callbacks, onPresent });
 *   // per sim event:   if (fx.onEvent(e)) present(e);        // false = held back, comes out via onPresent
 *   // per frame:       const worldDt = fx.update(dt);         // then world.update(worldDt, alpha)
 *   // teardown:        fx.dispose();
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import { TypingHudFx } from "../../hud/fx/typing/TypingHudFx";
import type { Hud } from "../../hud/hud";
import type { QualityTier } from "../quality";
import type { RenderWorld } from "../RenderWorld";
import { CapitalAccent } from "./CapitalAccent";
import { CHIP_DELAY_MS, flushesQueue, PresentationQueue } from "./PresentationQueue";
import { TimeDilation } from "./TimeDilation";
import { TypingWorldFx } from "./TypingWorldFx";
import {
  NOOP_CALLBACKS,
  type TypingFxCallbacks,
  type TypingFxSettings,
  type WorldAnchors,
} from "./types";

export interface TypingFxOptions {
  hud: Hud;
  world: RenderWorld;
  anchors: WorldAnchors;
  /** Presentation PRNG seed (captures are reproducible). */
  seed?: number;
  quality?: QualityTier;
  /** T2.3 hooks; any left out stay no-ops. They can also be assigned later on `handle.callbacks`. */
  callbacks?: Partial<TypingFxCallbacks>;
  /** Receives every event the queue held back, when it is due (in order). */
  onPresent?: (e: SimEvent) => void;
}

export interface TypingFxHandle {
  /**
   * Feed every sim event, in order, as it is produced. The typing visuals react immediately.
   * Returns true when the caller should present the event now (HUD pushEvent, audio, T2.3 handlers) and
   * false when it was held back (a chip hit, or an event gated behind one for the same enemy); held-back
   * events come out of `onPresent` later, in causal order.
   */
  onEvent(e: SimEvent): boolean;
  /**
   * Once per frame, before `world.update`. `dt` is the frame time (s). `realDt` (default `dt`) is the
   * undilated clock for the queue and the HUD. Returns the world dt to pass to `world.update`
   * (`dt * TimeDilation.scale`): 0.25x for the ATB-filled slow, 0 during a hit-stop.
   */
  update(dt: number, realDt?: number, view?: LevelView): number;
  setQuality(q: QualityTier): void;
  setSettings(s: Partial<TypingFxSettings>): void;
  /** A/B switch: off = no typing VFX at all and nothing is held back. */
  setEnabled(on: boolean): void;
  dispose(): void;
  /** Assign real T2.3 implementations onto its properties (do not replace the object). */
  readonly callbacks: TypingFxCallbacks;
  /** Mutable: where held-back events come out. */
  onPresent: (e: SimEvent) => void;
  readonly hud: TypingHudFx;
  /** T3.2 Hush Spell capital accent (HUD above layer). */
  readonly capital: CapitalAccent;
  readonly worldFx: TypingWorldFx;
  readonly timeDilation: TimeDilation;
  readonly queue: PresentationQueue;
}

/** Presentation time of the finisher's `EnemyDeath` (spec 9.2). */
export const FINISHER_DEATH_MS = 1060;

/** Default `cameraPose`: drive the world camera directly (dev scenes); the level stage overrides it. */
function defaultCameraPose(world: RenderWorld): TypingFxCallbacks["cameraPose"] {
  let saved: { pose: Record<string, number>; rate: number } | null = null;
  return (pose, followRate, snap) => {
    const cam = world.camera;
    if (pose) {
      if (!saved) saved = { pose: { ...cam.target }, rate: cam.followRate };
      cam.setTarget(pose);
      cam.followRate = followRate;
    } else if (saved) {
      cam.setTarget(saved.pose);
      cam.followRate = saved.rate;
      saved = null;
    }
    if (snap) cam.snap();
  };
}

export function createTypingFx(o: TypingFxOptions): TypingFxHandle {
  const hudFx = new TypingHudFx(o.hud, { seed: o.seed, quality: o.quality ?? 0 });
  hudFx.attach();
  // T3.2: the Hush Spell capital accent (CharCorrect.shifted), drawn in the HUD above layer
  const capital = new CapitalAccent(o.hud);
  const detachCapital = capital.attach();
  const td = new TimeDilation();
  const queue = new PresentationQueue();
  const callbacks: TypingFxCallbacks = {
    ...NOOP_CALLBACKS,
    cameraPose: defaultCameraPose(o.world),
    ...o.callbacks,
  };
  const worldFx = new TypingWorldFx(o.world, o.anchors, td, callbacks);
  worldFx.setSettings(o.hud.getSettings());
  let clockMs = 0;
  let enabled = true;
  let lastTier: QualityTier = o.quality ?? 0;
  const offView = o.hud.onUpdate((_dt, view) => worldFx.setView(view));
  // the HUD collapses a finished sentence word into an orb and hands it over at 120 ms: the world launches the bolt
  hudFx.onBolt = (x, y, p) => {
    if (enabled) worldFx.launchBolt(x, y, p, o.hud.getCssW(), o.hud.getCssH());
  };

  const handle: TypingFxHandle = {
    callbacks,
    onPresent: o.onPresent ?? (() => {}),
    hud: hudFx,
    capital,
    worldFx,
    timeDilation: td,
    queue,
    onEvent(e) {
      if (!enabled) return true;
      hudFx.onEvent(e);
      capital.onEvent(e);
      worldFx.onEvent(e);
      if (e.type === "LevelStarted") {
        queue.clear();
        capital.clear();
      }
      if (e.type === "FinisherCompleted") {
        // EnemyDeath and the finishing Hit wait for the cinematic (1060 ms; 300 ms at intensity 0)
        const k0 = o.hud.getSettings().effectsIntensity;
        queue.holdEntity(e.enemyId, clockMs + (k0 > 0 ? FINISHER_DEATH_MS : 300) - 16);
      }
      if (flushesQueue(e)) {
        // a finisher in progress: the clear waits until the death has been presented (spec 9.2), in order
        const holdEnd = queue.holdUntil(clockMs);
        if (holdEnd >= 0) {
          queue.defer(e, holdEnd + 32);
          return false;
        }
        queue.flushAll(release);
        return true;
      }
      const k = o.hud.getSettings().effectsIntensity;
      if (queue.gate(e, clockMs, k > 0 ? CHIP_DELAY_MS : 0)) return false;
      hooks(e);
      return true;
    },
    update(dt, realDt = dt, view) {
      if (view) worldFx.setView(view);
      // follow `hud.setSettings` calls made elsewhere (the world half reads the same settings object)
      worldFx.setSettings(o.hud.getSettings());
      clockMs += realDt * 1000;
      if (queue.count > 0) queue.flush(clockMs, release);
      const t = o.world.qualityTier;
      if (t !== lastTier) {
        lastTier = t;
        hudFx.setQuality(t);
      }
      const worldDt = enabled ? dt * td.scale(realDt) : dt;
      worldFx.update(worldDt, realDt);
      return worldDt;
    },
    setQuality(q) {
      lastTier = q;
      hudFx.setQuality(q);
    },
    setSettings(s) {
      o.hud.setSettings(s);
      worldFx.setSettings(o.hud.getSettings());
    },
    setEnabled(on) {
      enabled = on;
      hudFx.setEnabled(on);
      worldFx.setEnabled(on);
      if (!on) {
        capital.clear();
        queue.flushAll(release);
        td.reset();
      }
    },
    dispose() {
      offView();
      queue.clear();
      detachCapital();
      hudFx.dispose();
      worldFx.dispose();
    },
  };

  /** The T2.3 hooks that belong to the moment an event is actually presented. */
  function hooks(e: SimEvent): void {
    if (e.type === "Hit" && e.kind === "chip") handle.callbacks.chipImpact(e);
    else if (e.type === "EnemyDeath") handle.callbacks.dissolve(e.enemyId, e.byKind);
  }
  function release(e: SimEvent): void {
    hooks(e);
    handle.onPresent(e);
  }
  return handle;
}

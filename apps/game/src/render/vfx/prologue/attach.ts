/**
 * `attachPrologueFx` (P3.2): the wiring of the prologue world VFX into a level session, the same shape as `attachCombatFx` /
 * `attachTypingFx`. P3.5 (the prologue session mode) calls it ONLY when the session is a prologue, so story levels never build a
 * `PrologueFx` and their frames are untouched:
 *
 *   const pfx = attachPrologueFx({ stage, world, hud, router, typing });   // router.sinks.prologue = pfx.fx (bindings call it)
 *   per frame, AFTER the stage and the typing fx updated:  pfx.update(dt, view, cutscene?.vfx, cutscene?.moodBlend)
 *   per frame, AFTER the typing world fx wrote the post effects:  pfx.fx.applyPost(world.postFx.effects)   (done by `update`)
 *
 * It resolves Nul as the live enemy whose `defId` is `nul`, takes the gate / tear markers and the runestones from the level
 * layout (`stage.handle`), drives `HeroAura`'s prologue modes through `typing.handle.worldFx.aura`, and keeps world effects 40 px
 * away from the plates (Part B) or whatever rect list `extraKeepOut` supplies (Part C: the dialogue box inflated by 24 px).
 */
import type { LevelView } from "@hd2d/sim";
import type { Hud } from "../../../hud";
import type { EventRouter } from "../../../level/eventBindings";
import type { LevelStage } from "../../../level/stage";
import type { SessionTypingFx } from "../../../level/typingFx";
import type { RenderWorld } from "../../RenderWorld";
import { PrologueFx } from "./PrologueFx";
import type { CueInstance } from "./types";

export interface SessionPrologueFxOptions {
  stage: LevelStage;
  world: RenderWorld;
  hud: Hud;
  router: EventRouter;
  typing: SessionTypingFx | null;
  /** Part C: extra CSS-px rects (x, y, w, h each) the world effects keep away from: the dialogue box and the ink line. */
  extraKeepOut?: (out: Float32Array, offset: number) => number;
}

export interface SessionPrologueFx {
  readonly fx: PrologueFx;
  /** Once per frame after `stage.update`: `scripted` = `CutsceneState.vfx`, `moodBlend` = `CutsceneState.moodBlend`. */
  update(dt: number, view: LevelView, scripted?: readonly CueInstance[], moodBlend?: number): void;
  reset(): void;
  dispose(): void;
}

const RECT = { x: 0, y: 0, w: 0, h: 0 };

export function attachPrologueFx(o: SessionPrologueFxOptions): SessionPrologueFx {
  const { stage, world, hud, router, typing } = o;
  const layout = stage.handle.layout;
  const gate = stage.handle.getAnchor("gate");
  const tear = stage.handle.getAnchor("tear");
  const gateProp = layout.props.find((p) => p.key === "prop.prologue.wordgate");
  let nulId = -1;
  /** The enemy's feet (`enemyBody` is the body centre). */
  const feet = (id: number, out: { x: number; y: number; z: number }): boolean => {
    if (id < 0 || !stage.enemyBody(id, out)) return false;
    out.y = 0;
    return true;
  };
  const fx = new PrologueFx({
    world,
    anchors: {
      hero: (out) => {
        stage.heroPos(out);
        out.y = 0;
      },
      boss: (out) => feet(nulId, out),
      gate: (out) => {
        out.x = gate.x;
        out.y = 0;
        out.z = gate.z;
        out.scale = gateProp?.scale ?? 0.85;
      },
      tear: (out) => {
        out.x = tear.x;
        out.y = tear.y ?? 7;
        out.z = tear.z;
      },
      enemy: (id, out) => feet(id, out),
      runes: (out) => {
        let n = 0;
        for (const p of layout.props) {
          const m = /^prop\.prologue\.runestone\.(\d)/.exec(p.key);
          const r = out[n];
          if (!m || !r) continue;
          r.x = p.x;
          r.y = p.y ?? 0;
          r.z = p.z;
          r.n = Number(m[1]);
          r.scale = p.scale ?? 1;
          r.flip = p.flip === true;
          n++;
        }
        return n;
      },
    },
    keepOutRects: (out) => {
      const v = stage.view;
      let n = 0;
      if (v)
        for (const p of v.plates) {
          if (n >= out.length / 4 - 2) break;
          if (!hud.getPlateRectInto(p.id, RECT)) continue;
          out[n * 4] = RECT.x;
          out[n * 4 + 1] = RECT.y;
          out[n * 4 + 2] = RECT.w;
          out[n * 4 + 3] = RECT.h;
          n++;
        }
      if (o.extraKeepOut) n += o.extraKeepOut(out, n * 4);
      return n;
    },
    heroRim: (amount, rgb) => stage.rimFlash("hero", amount, rgb),
    defOf: (id) => stage.view?.enemies.find((e) => e.id === id)?.defId ?? null,
  });
  router.sinks.prologue = fx;
  const off = router.register(["LevelStarted"], () => fx.clear());
  if (typing) fx.attachAura(typing.handle.worldFx.aura);
  fx.setSettings(hud.getSettings(), world.qualityTier);
  return {
    fx,
    update(dt, view, scripted, moodBlend) {
      fx.setSettings(hud.getSettings(), world.qualityTier);
      fx.setView(view);
      nulId = -1;
      for (const e of view.enemies) if (e.defId === "nul") nulId = e.id;
      fx.frame(dt, scripted ?? [], moodBlend ?? 0);
      fx.applyPost(world.postFx.effects);
    },
    reset() {
      fx.clear();
    },
    dispose() {
      off();
      if (router.sinks.prologue === fx) router.sinks.prologue = undefined;
      fx.dispose();
    },
  };
}

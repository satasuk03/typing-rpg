/**
 * A small TEST timeline for the engine (dev route `?scene=prologue&part=cutscene`, unit tests, stills).
 * Not the prologue: the real timelines are P3.6's. It moves the camera, blends the mood toward a desaturated one and
 * walks the hero.
 */
import type { Timeline } from "./types";

export const TEST_TIMELINE: Timeline = {
  id: "prologue.test",
  durationMs: 9000,
  setup: "standalone",
  cues: [
    {
      at: 0,
      kind: "camera",
      pose: { anchor: "walk", offset: { dist: 9, pitch: 9, x: -2 } },
      ease: "cut",
    },
    { at: 0, kind: "actor", who: "hero", anim: "idle" },
    { at: 800, kind: "sfx", id: "key" },
    {
      at: 1000,
      dur: 3000,
      kind: "camera",
      pose: { anchor: "walk", offset: { dist: -2, pitch: -3, x: 3, fov: -6 } },
      ease: "inOut",
      shake: 0.2,
    },
    { at: 1000, dur: 3500, kind: "actor", who: "hero", anim: "walk", move: { dx: 5, dz: 0 } },
    { at: 1500, dur: 3000, kind: "mood", to: "unwritten" },
    { at: 2500, kind: "vfx", id: "ember", dur: 3000 },
    { at: 4500, kind: "actor", who: "hero", anim: "idle" },
    { at: 4500, kind: "line", speaker: "nul", text: "The road is quiet." },
    {
      at: 5000,
      dur: 2500,
      kind: "camera",
      pose: { anchor: "walk", offset: { x: 5 } },
      ease: "out",
    },
    { at: 6500, dur: 1500, kind: "mood", to: 0.4 },
    { at: 9000, kind: "end" },
  ],
};

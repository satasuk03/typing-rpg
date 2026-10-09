/**
 * DEV-ONLY data-driven level scene:
 *   ?scene=level&id=ch1-l03&pose=walk|battle:1|boss[&at=<x>][&tier=0|1|2][&freeze=1][&hero=0][&raw=1]
 *
 * Builds the level from `src/assets/levels/<id>.json` through the WorldBuilder, drops the hero (and
 * placeholder monsters on the slot anchors) and frames the camera with the layout's camera hints.
 * Every coordinate comes from the layout; nothing is hard-coded here.
 *
 * Test hooks: `window.__renderTest` (same shape as the render-test scene) and `window.__levelScene`.
 */

import type { QualityTier } from "../render";
import { isQualityTier, RenderWorld } from "../render";
import {
  buildWorld,
  levelIds,
  loadLevel,
  type PoseName,
  toRenderBiome,
  type WorldHandle,
} from "../render/world";

declare global {
  interface Window {
    __levelScene?: {
      handle: WorldHandle;
      world: RenderWorld;
      pose: string;
      ready: boolean;
      /** Move the camera + hero to another pose and re-render. */
      setPose(pose: string, at?: number): void;
    };
  }
}

/** Placeholder enemy sprites cycled over the slot anchors (dev only; real enemy data comes from content). */
const PLACEHOLDERS: readonly { key: string; scale: number; flyY: number }[] = [
  { key: "monster.goblin", scale: 1.35, flyY: 0 },
  { key: "monster.bat", scale: 1.35, flyY: 1.7 },
  { key: "monster.slimeG", scale: 1.35, flyY: 0 },
  { key: "monster.goblinR", scale: 1.35, flyY: 0 },
  { key: "monster.slimeP", scale: 1.35, flyY: 0 },
];

function parsePose(raw: string | null): PoseName {
  if (raw === "boss" || (raw?.startsWith("battle:") ?? false)) return raw as PoseName;
  return "walk";
}

export function start(canvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const id = q.get("id") ?? levelIds()[0] ?? "ch1-l01";
  const tierParam = Number(q.get("tier") ?? "0");
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : 0;
  const frozen = q.get("freeze") === "1";
  const layout = loadLevel(id);

  const world = new RenderWorld({
    biome: toRenderBiome(layout.biome),
    quality: tier,
    autoQuality: q.get("auto") === "1",
  });
  world.init(canvas);
  const handle = buildWorld(layout, world, world.source);

  let actors: { dispose(): void }[] = [];
  const clearActors = (): void => {
    for (const a of actors) a.dispose();
    actors = [];
  };

  const heroAt = (x: number, z: number, anim: "walk" | "idle"): void => {
    const a = world.addActor("hero", anim, { rim: 1.3, blobW: 1.25 });
    const frames = world.source.frames("hero", anim);
    a.setFrame(frames[anim === "walk" ? 1 : 0] ?? (frames[0] as NonNullable<(typeof frames)[0]>));
    a.place(x, 0, z);
    world.shadowFor(a, x, z);
    actors.push(a);
  };

  const monsterAt = (key: string, scale: number, x: number, y: number, z: number): void => {
    const a = world.addActor(key, "idle", { scale, rim: 1.4, blobW: scale * 1.1 });
    a.place(x, y, z);
    world.shadowFor(a, x, z);
    actors.push(a);
  };

  const applyPose = (poseRaw: string, at?: number): string => {
    const pose = parsePose(poseRaw);
    clearActors();
    handle.setLetterbox(pose === "boss");
    const cam = handle.cameraPose(pose);
    if (at !== undefined) cam.x = at;
    if (pose === "walk") {
      // POC framing: the camera leads the hero by a few metres.
      const shot = handle.hasAnchor("walkshot") ? handle.getAnchor("walkshot") : null;
      const hx = at === undefined && shot ? shot.x : cam.x - 3.2;
      heroAt(hx, handle.walkPath.zAtX(hx), "walk");
    } else {
      const index =
        pose === "boss"
          ? (layout.encounters.find((e) => e.boss)?.index ?? 1)
          : Number(pose.split(":")[1]);
      const enc = handle.encounter(index);
      heroAt(enc.hero.x, enc.hero.z, "idle");
      enc.slots.forEach((s, i) => {
        const p =
          pose === "boss" || enc.def.boss
            ? { key: "monster.golem", scale: 1.6, flyY: 0 }
            : (PLACEHOLDERS[i % PLACEHOLDERS.length] as (typeof PLACEHOLDERS)[number]);
        monsterAt(p.key, p.scale, s.x, p.flyY, s.z);
      });
    }
    world.camera.setTarget(cam);
    world.camera.snap();
    handle.update(1 / 60, cam.x);
    world.update(1 / 60);
    handle.warmUp(3, cam.x);
    return pose;
  };

  const atParam = q.get("at");
  let pose: string = applyPose(
    q.get("pose") ?? "walk",
    atParam === null ? undefined : Number(atParam),
  );
  if (q.get("raw") === "1") world.setFx(false);

  const step = (n: number, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) {
      handle.update(dt, world.camera.pose.x);
      world.update(dt, 0);
      if (i === n - 1) world.render();
    }
  };

  window.__levelScene = {
    handle,
    world,
    get pose() {
      return pose;
    },
    ready: true,
    setPose(p, at) {
      pose = applyPose(p, at);
      step(2);
    },
  };
  // Same hook shape as the render-test scene so shared specs/tools keep working.
  window.__renderTest = {
    world,
    step,
    bench: () => ({ avgMs: 0, p95Ms: 0, maxMs: 0 }),
    setBiome: (b) => world.setBiome(b, true),
    ready: true,
  };

  if (frozen) {
    step(2);
    return;
  }
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    handle.update(dt, world.camera.pose.x);
    world.update(dt, 0);
    world.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => {
    handle.dispose();
    world.dispose();
  });
}

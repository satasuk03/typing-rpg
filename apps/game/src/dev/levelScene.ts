/**
 * DEV-ONLY data-driven level scene:
 *   ?scene=level&id=ch1-l03&pose=walk|battle:1|boss[&at=<x>][&tier=0|1|2][&freeze=1][&hero=0][&raw=1][&anchors=1]
 * Works for every layout JSON (Ch1 and Ch2; Ch2 needs no LevelDef). `anchors=1` overlays every named anchor (dev QA).
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

/** Same value as `HERO_CAVE_RIM` in level/stage.ts (not exported there). */
const HERO_CAVE_RIM = 0.6;

/**
 * Chapter 2 boss stand-in (the real Willow sprite is T2.3's; this only fills the arena in the viewer): the willow core prop at
 * the boss anchor and frond curtains, as offsets from it. Dev viewer only.
 */
const WILLOW_STANDIN: readonly { key: string; dx: number; y: number; dz: number; scale: number }[] =
  [
    { key: "prop.ch2.willowCore", dx: 0, y: 0, dz: 0, scale: 1 },
    { key: "prop.ch2.fronds.silver.0", dx: -4.6, y: 9.3, dz: 0.35, scale: 1.25 },
    { key: "prop.ch2.fronds.silver.1", dx: -3.7, y: 9.9, dz: 0.5, scale: 1.15 },
    { key: "prop.ch2.fronds.silver.2", dx: 3.7, y: 9.8, dz: 0.5, scale: 1.2 },
    { key: "prop.ch2.fronds.silver.3", dx: 4.8, y: 9.2, dz: 0.35, scale: 1.3 },
  ];

const ANCHOR_COLORS: Readonly<Record<string, string>> = {
  hero: "#4cf",
  slot: "#fc4",
  boss: "#f55",
  marker: "#8f8",
  start: "#fff",
  end: "#fff",
};

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
    // Ch2 (night moods, caveK > 0) uses the game's hero cave-rim lift (level/stage.ts HERO_CAVE_RIM); Ch1 views stay as they were.
    const a = world.addActor("hero", anim, {
      rim: 1.3,
      blobW: 1.25,
      ...(layout.chapter >= 2 ? { caveRim: HERO_CAVE_RIM } : {}),
    });
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
        const ch2Boss = layout.chapter >= 2 && enc.def.boss;
        if (ch2Boss && s.kind === "boss") {
          for (const w of WILLOW_STANDIN) {
            const prop = world.addProp(w.key, s.x + w.dx, w.y, s.z + w.dz, {
              scale: w.scale,
              rim: 1.2,
              emis: w.y > 0 ? 1.8 : 2.4,
            });
            actors.push({ dispose: () => world.remove(prop) });
          }
          return;
        }
        const p =
          !ch2Boss && (pose === "boss" || enc.def.boss)
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

  /** Dev QA overlay: every named anchor projected onto the frame (`&anchors=1`). */
  const overlay = q.get("anchors") === "1" ? document.createElement("div") : null;
  if (overlay) {
    overlay.style.cssText =
      "position:fixed;inset:0;pointer-events:none;font:11px monospace;z-index:9";
    document.body.appendChild(overlay);
  }
  const drawAnchors = (): void => {
    if (!overlay) return;
    overlay.replaceChildren();
    const rect = canvas.getBoundingClientRect();
    for (const name of handle.anchorNames()) {
      const a = handle.getAnchor(name);
      const p = world.camera.project(a.x, a.y ?? 0, a.z);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      const special = name.startsWith("riddle") || name.startsWith("boss.");
      const col = special ? "#f6f" : (ANCHOR_COLORS[a.kind] ?? "#fff");
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;left:${rect.left + ((p.x + 1) / 2) * rect.width}px;top:${rect.top + ((1 - p.y) / 2) * rect.height}px;color:${col};text-shadow:0 0 3px #000,0 0 3px #000`;
      d.textContent = `● ${name}`;
      overlay.appendChild(d);
    }
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
      if (i === n - 1) {
        world.render();
        drawAnchors();
      }
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
    drawAnchors();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => {
    handle.dispose();
    world.dispose();
  });
}

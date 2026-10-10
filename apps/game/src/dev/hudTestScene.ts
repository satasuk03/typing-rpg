/**
 * DEV-ONLY HUD test scene:
 *   ?scene=hud-test&scenario=forest|cave|boss|stress&wpm=40|90
 *     &at=SECONDS (fast-forward the mock first) &pause=1 (freeze after the seek)
 *     &intensity=0..1 &reducedFlash=1 &reducedMotion=1 &fonts=0 (skip Google Fonts)
 * A plain painted backdrop stands in for the 3D scene (placeholder silhouettes show where the
 * fake projector puts the enemies). Test hooks: `window.__hudDebug`.
 */

import type { HudAnchor, HudDebugSnapshot, HudProjector } from "../hud";
import { Hud } from "../hud";
import { loadHudFonts } from "../hud/fonts";
import { checkSnapshot } from "../hud/invariants";
import type { MockScenario } from "../hud/mock/mockDriver";
import { MockDriver } from "../hud/mock/mockDriver";
import { HERO_LUM_CAP } from "../render/vfx/colors";

export interface HudDebugApi {
  ready: boolean;
  hud: Hud;
  driver: () => MockDriver;
  snapshot(): HudDebugSnapshot;
  /** Step the mock for `seconds`, rendering each tick, checking invariants every `stepSec`. */
  sweep(
    seconds: number,
    stepSec: number,
  ): { samples: number; maxPlates: number; violations: string[] };
  /** Render `frames` frames of the current scenario and return per-frame HUD cost stats (ms). */
  bench(frames: number): HudDebugSnapshot["frame"] & { maxPlates: number; maxPops: number };
  consoleErrors: string[];
}

declare global {
  interface Window {
    __hudDebug?: HudDebugApi;
  }
}

const SCENARIOS: MockScenario[] = ["forest", "cave", "boss", "stress"];

/** Fake projector: placeholder world positions per scenario (CSS px). */
export function makeProjector(scenario: MockScenario, w: number, h: number) {
  return (a: HudAnchor): { x: number; y: number } | null => {
    if (a.kind === "hero")
      return { x: w * 0.2, y: h * (a.part === "head" ? 0.5 : a.part === "feet" ? 0.74 : 0.62) };
    const boss = scenario === "boss";
    const x = boss ? w * 0.56 : w * (0.36 + a.slot * 0.2);
    const headY = boss ? h * 0.36 : h * (0.5 + (a.slot % 2) * 0.03);
    const feetY = boss ? h * 0.74 : h * (0.72 + (a.slot % 2) * 0.04);
    return { x, y: a.part === "head" ? headY : a.part === "feet" ? feetY : (headY + feetY) / 2 };
  };
}

export function drawBackdrop(cv: HTMLCanvasElement, scenario: MockScenario): void {
  const c = cv.getContext("2d");
  if (!c) return;
  const w = cv.width;
  const h = cv.height;
  const cols: Record<string, [string, string]> = {
    forest: ["#5d8a5a", "#1c3a26"],
    cave: ["#5a2a1c", "#120a0e"],
    boss: ["#3a2a2a", "#0a0608"],
    stress: ["#46506a", "#14161e"],
  };
  const [a, b] = cols[scenario] ?? cols.forest ?? ["#444", "#111"];
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(0.62, b);
  g.addColorStop(1, "#06060a");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(0, h * 0.7, w, h * 0.3);
  // silhouettes where the projector puts the actors
  const proj = makeProjector(scenario, w, h);
  const blob = (x: number, headY: number, feetY: number, col: string, ww: number) => {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, (headY + feetY) / 2, ww, (feetY - headY) / 2, 0, 0, Math.PI * 2);
    c.fill();
  };
  const hero = proj({ kind: "hero", part: "feet" });
  if (hero) blob(hero.x, h * 0.5, hero.y, "#2c4a6a", 30);
  const slots = scenario === "boss" ? [1] : scenario === "cave" ? [0, 1] : [0, 1, 2];
  for (const slot of slots) {
    const head = proj({ kind: "enemy", id: 0, slot, part: "head" });
    const feet = proj({ kind: "enemy", id: 0, slot, part: "feet" });
    if (head && feet)
      blob(
        head.x,
        head.y,
        feet.y,
        scenario === "boss" ? "#5a4a44" : (["#3aa890", "#6a3a8a", "#c0508a"][slot] ?? "#888"),
        scenario === "boss" ? 110 : 48,
      );
  }
}

export interface WorldBackdrop {
  /** Project an enemy/hero anchor through the REAL camera of a level built from layout data. */
  projector: HudProjector;
  frame(dt: number): void;
  /** Advance the level and the world by dt (no GPU render): lets a caller step many fixed substeps. */
  advance(dt: number): void;
  /** The real render world (the typing VFX attach their meshes, lights and post flash to it). */
  world: import("../render").RenderWorld;
  /** Hero placement and sprite actor (for the actor flash hook). */
  hero: { x: number; z: number; actor: import("../render/materials/sprite").SpriteActor };
  /** World-space centre of an enemy slot's body. False when the slot does not exist. */
  slotBody(slot: number, out: { x: number; y: number; z: number }): boolean;
  /** Sprite actor of an enemy slot (stand-in for the T2.3 hit flash). */
  slotActor(slot: number): import("../render/materials/sprite").SpriteActor | null;
  /** Project a world point to CSS px through the real camera. */
  project(x: number, y: number, z: number): { x: number; y: number };
}

/**
 * `?backdrop=world[&id=<levelId>]`: builds a level with WorldBuilder + RenderWorld (like ?scene=level)
 * and projects the HUD anchors through its camera, using the encounter's slot anchors. Enemy sprites
 * are the same placeholders levelScene uses. Proves the projector contract on the real renderer.
 */
export async function makeWorldBackdrop(
  glCanvas: HTMLCanvasElement,
  scenario: MockScenario,
  q: URLSearchParams,
): Promise<WorldBackdrop> {
  const { RenderWorld } = await import("../render");
  const { buildWorld, levelIds, loadLevel, toRenderBiome } = await import("../render/world");
  const boss = scenario === "boss";
  const wanted = q.get("id");
  const id =
    wanted ??
    (boss
      ? levelIds().find((l) => loadLevel(l).encounters.some((e) => e.boss))
      : levelIds().find((l) => loadLevel(l).biome === (scenario === "cave" ? "cave" : "forest"))) ??
    levelIds()[0] ??
    "ch1-l01";
  const layout = loadLevel(id);
  const world = new RenderWorld({
    biome: toRenderBiome(layout.biome),
    quality: 0,
    autoQuality: false,
  });
  world.init(glCanvas);
  const handle = buildWorld(layout, world, world.source);
  const encIndex = boss
    ? (layout.encounters.find((e) => e.boss)?.index ?? 1)
    : Number(q.get("enc") ?? 1);
  // `pose=battle` keeps the combat camera on the boss encounter (the typing VFX scene fights in it)
  const closeUp = boss && q.get("pose") !== "battle";
  const pose = closeUp ? "boss" : (`battle:${encIndex}` as const);
  const enc = handle.encounter(encIndex);

  const hero = world.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
  hero.setLumCap(HERO_LUM_CAP);
  const frames = world.source.frames("hero", "idle");
  const f0 = frames[0];
  if (f0) hero.setFrame(f0);
  hero.place(enc.hero.x, 0, enc.hero.z);
  world.shadowFor(hero, enc.hero.x, enc.hero.z);
  const kinds = [
    { key: "monster.goblin", scale: 1.35, flyY: 0 },
    { key: "monster.bat", scale: 1.35, flyY: 1.7 },
    { key: "monster.slimeG", scale: 1.35, flyY: 0 },
  ];
  const slots = enc.slots.map((sl, i) => {
    const k = boss
      ? { key: "monster.golem", scale: 1.6, flyY: 0 }
      : (kinds[i % kinds.length] ?? { key: "monster.goblin", scale: 1.35, flyY: 0 });
    const a = world.addActor(k.key, "idle", { scale: k.scale, rim: 1.4, blobW: k.scale * 1.1 });
    a.place(sl.x, k.flyY, sl.z);
    world.shadowFor(a, sl.x, sl.z);
    return { x: sl.x, z: sl.z, scale: k.scale, flyY: k.flyY, actor: a };
  });

  handle.setLetterbox(closeUp);
  const cam = handle.cameraPose(pose);
  world.camera.setTarget(cam);
  world.camera.snap();
  handle.update(1 / 60, cam.x);
  world.update(1 / 60);
  handle.warmUp(3, cam.x);

  const toPx = (x: number, y: number, z: number): { x: number; y: number } => {
    const n = world.camera.project(x, y, z);
    return { x: (n.x * 0.5 + 0.5) * window.innerWidth, y: (-n.y * 0.5 + 0.5) * window.innerHeight };
  };
  return {
    projector(a) {
      if (a.kind === "hero") {
        if (a.part === "weapon") return toPx(enc.hero.x + 0.45, 0.95, enc.hero.z);
        const y = a.part === "head" ? 2.2 : a.part === "feet" ? 0 : 1.1;
        return toPx(enc.hero.x, y, enc.hero.z);
      }
      const sl = slots[a.slot % Math.max(1, slots.length)];
      if (!sl) return null;
      const h = 2.0 * sl.scale;
      const y = sl.flyY + (a.part === "head" ? h : a.part === "feet" ? 0 : h / 2);
      return toPx(sl.x, y, sl.z);
    },
    frame(dt) {
      handle.update(dt, world.camera.pose.x);
      world.update(dt, 0);
      world.render();
    },
    advance(dt) {
      handle.update(dt, world.camera.pose.x);
      world.update(dt, 0);
    },
    world,
    hero: { x: enc.hero.x, z: enc.hero.z, actor: hero },
    slotBody(slot, out) {
      const sl = slots[slot % Math.max(1, slots.length)];
      if (!sl) return false;
      out.x = sl.x;
      out.y = sl.flyY + sl.scale;
      out.z = sl.z;
      return true;
    },
    slotActor(slot) {
      return slots[slot % Math.max(1, slots.length)]?.actor ?? null;
    },
    project: toPx,
  };
}

export function start(glCanvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const scenarioParam = q.get("scenario") as MockScenario | null;
  const riddleMode = q.get("riddle") === "1";
  const scenario: MockScenario = riddleMode
    ? "boss"
    : SCENARIOS.includes(scenarioParam as MockScenario)
      ? (scenarioParam as MockScenario)
      : "forest";
  const wpm = Number(q.get("wpm") ?? 40) || 40;
  const at = Number(q.get("at") ?? 0) || 0;
  const pause = q.get("pause") === "1";

  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
  // backdrop canvas behind the HUD in place of the WebGL scene
  const worldMode = q.get("backdrop") === "world";
  const back = document.createElement("canvas");
  back.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  if (!worldMode) {
    glCanvas.style.display = "none";
    glCanvas.parentElement?.insertBefore(back, hudCanvas);
  }
  let worldBackdrop: WorldBackdrop | null = null;

  const hud = new Hud(hudCanvas);
  hud.setSettings({
    effectsIntensity: q.has("intensity") ? Number(q.get("intensity")) : 1,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  });

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    hud.resize(w, h, window.devicePixelRatio || 1);
    if (worldMode) {
      if (worldBackdrop) hud.setProjector(worldBackdrop.projector);
      return;
    }
    back.width = w;
    back.height = h;
    drawBackdrop(back, scenario);
    hud.setProjector(makeProjector(scenario, w, h));
  };
  window.addEventListener("resize", resize);
  resize();

  const driver = new MockDriver({
    scenario,
    wpm,
    leakBp: Math.round(Number(q.get("leak") ?? 0) * 100) || 0,
    riddle: riddleMode,
    shift: q.get("shift") === "1",
    healer: q.get("healer") === "1",
    elite: q.get("elite") === "1",
  });
  const DT = 1 / 60;
  const stepOnce = (renderFrame: boolean): void => {
    const ev = driver.step();
    hud.pushEvents(ev);
    if (renderFrame) hud.render(driver.view, 1, DT);
    else hud.update(driver.view, 1, DT);
  };

  const api: HudDebugApi = {
    ready: false,
    hud,
    driver: () => driver,
    snapshot: () => hud.debugSnapshot(),
    sweep(seconds, stepSec) {
      const violations: string[] = [];
      let samples = 0;
      let maxPlates = 0;
      const every = Math.max(1, Math.round(stepSec * 60));
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) {
        stepOnce(true);
        if (i % every === 0) {
          const snap = hud.debugSnapshot();
          samples++;
          maxPlates = Math.max(maxPlates, snap.plates.length);
          for (const v of checkSnapshot(snap))
            violations.push(`t=${(driver.tick / 60).toFixed(2)}s ${v}`);
        }
      }
      return { samples, maxPlates, violations };
    },
    bench(frames) {
      hud.resetFrameStats();
      let maxPlates = 0;
      let maxPops = 0;
      for (let i = 0; i < frames; i++) {
        stepOnce(true);
        const s = hud.debugSnapshot();
        maxPlates = Math.max(maxPlates, s.plates.length);
        maxPops = Math.max(maxPops, s.pops);
      }
      return { ...hud.debugSnapshot().frame, maxPlates, maxPops };
    },
    consoleErrors,
  };
  window.__hudDebug = api;

  const boot = async (): Promise<void> => {
    if (q.get("fonts") !== "0") await loadHudFonts();
    if (worldMode) {
      worldBackdrop = await makeWorldBackdrop(glCanvas, scenario, q);
      hud.setProjector(worldBackdrop.projector);
    }
    hud.pushEvents(driver.start());
    const total = Math.round(at * 60);
    for (let i = 0; i < total; i++) stepOnce(i >= total - 90);
    if (total === 0) hud.render(driver.view, 1, 0);
    api.ready = true;

    if (pause) {
      const loop = (): void => {
        worldBackdrop?.frame(0);
        hud.render(driver.view, 1, 0);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return;
    }
    let last = performance.now();
    let acc = 0;
    const loop = (now: number): void => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      let stepped = false;
      while (acc >= DT) {
        const ev = driver.step();
        hud.pushEvents(ev);
        acc -= DT;
        stepped = true;
        if (acc >= DT) hud.update(driver.view, 1, DT);
      }
      worldBackdrop?.frame(stepped ? DT : 0);
      hud.render(driver.view, acc / DT, stepped ? DT : 0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  void boot();
}

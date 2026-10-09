/**
 * DEV-ONLY render test scene (`?scene=render-test&biome=forest|ruins|cave|boss&tier=0|1|2`).
 * Hard-coded diorama that recreates the compositions of poc/v2-forest-walk.png, v2-ruins-guard-words.png,
 * v2-cave-entrance.png and v2-boss-intro.png (no HUD, no VFX). Hard-coded coordinates are allowed here
 * only; T2.2 replaces this with world-from-data.
 *
 * Test hooks: `window.__renderStats` (frame-time stats) and `window.__renderTest` (deterministic stepping).
 */

import type { BiomeId, QualityTier } from "../render";
import {
  BATTLE_POSE,
  BOSS_INTRO_POSE,
  isBiomeId,
  isQualityTier,
  percentile,
  RenderWorld,
  WALK_POSE,
} from "../render";
import { makeRng } from "../render/util";

const BATTLE_OFF = 5.6;
const ENCX = [26, 70, 142, 190];

export interface RenderStats {
  tier: QualityTier;
  biome: BiomeId;
  frames: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  drawCalls: number;
  triangles: number;
  perTier: Record<string, { avgMs: number; p95Ms: number; frames: number }>;
}

declare global {
  interface Window {
    __renderStats?: RenderStats;
    __renderTest?: {
      world: RenderWorld;
      /** Advance `n` fixed steps of `dt` seconds and render the last one. */
      step(n: number, dt?: number): void;
      /** Render `frames` back-to-back (gl.finish after each) at tier `t`; returns ms stats. */
      bench(t: QualityTier, frames: number): { avgMs: number; p95Ms: number; maxMs: number };
      setBiome(b: BiomeId): void;
      ready: boolean;
    };
  }
}

function buildWorld(world: RenderWorld): void {
  const R = makeRng(1337);
  const P = world.addProp.bind(world);
  const ground = world.addGround(420, 44, 110, -6);
  void ground;
  world.addWall(200, 18, 97 + 100, 9, -9.2, 97);
  world.addBackdrop("sky", 300, 70, [40, 22, -150], [1.05, 1.0, 0.98], 0.0, 1, true);
  world.addBackdrop("mountains", 460, 43.2, [40, 11.0, -105], [1, 1, 1], 0.42, 3);
  world.addBackdrop("treeline", 420, 19.44, [30, 6.4, -58], [0.95, 1.0, 0.95], 0.3, 6);

  // forest tree rows
  const rows: [number, number, [number, number, number], number][] = [
    [-19, 1.35, [0.62, 0.7, 0.7], 5.5],
    [-13, 1.18, [0.8, 0.86, 0.82], 6.5],
    [-7.2, 1.0, [1, 1, 1], 9],
  ];
  for (const [z, s, tint, sp] of rows) {
    for (let x = -30; x < 104; x += sp * (0.7 + R() * 0.6)) {
      if (z > -8 && x > 50 && x < 96 && R() < 0.6) continue;
      const autumn = x > 46 || R() < 0.15;
      const ti = autumn ? 3 + ((R() * 2) | 0) : (R() * 3) | 0;
      P(`prop.tree.${ti}`, x, 0, z + R() * 1.2, {
        scale: s * (0.9 + R() * 0.25),
        tint,
        flip: R() < 0.5,
        rim: 0.5,
      });
    }
  }
  for (let x = -26; x < 100; x += 2.4 + R() * 3) {
    const bi = x > 50 ? 2 : (R() * 2) | 0;
    P(`prop.bush.${bi}`, x, 0, -4.2 - R() * 1.6, { scale: 0.9 + R() * 0.5, flip: R() < 0.5 });
  }
  for (let x = -26; x < 100; x += 1.2 + R() * 2.2) {
    P(`prop.grass.${(R() * 4) | 0}`, x, 0, -2.6 - R() * 1.2, { flip: R() < 0.5 });
    P(`prop.grass.${(R() * 4) | 0}`, x + R(), 0, 2.4 + R() * 3.0, { flip: R() < 0.5 });
  }
  for (let x = -20; x < 96; x += 7 + R() * 9)
    P(`prop.rock.${(R() * 3) | 0}`, x, 0, -3.2 - R() * 2.5, { flip: R() < 0.5 });

  // god rays
  for (let x = -16; x < 92; x += 5 + R() * 6) {
    const col: [number, number, number] = x > 48 ? [1.0, 0.62, 0.3] : [1.0, 0.86, 0.6];
    const inten = 0.55 + R() * 0.35;
    const w = 1.6 + R() * 3.2;
    world.addGodRay(x, 6.5, -4.5 - R() * 4, w, 17, -0.42, col, inten);
  }

  // ruins
  const ruinsX = [52, 57, 63, 74, 82, 88, 93];
  ruinsX.forEach((x, i) => {
    P(`prop.pillar.${i % 3}`, x + R(), 0, i % 2 ? -3.6 : -6.4, { flip: i % 2 === 0 });
  });
  P("prop.arch", 79, 0, -6.8, { scale: 1.15 });
  P("prop.arch", 61, 0, -10.5, { scale: 1.0, tint: [0.75, 0.75, 0.8] });
  const postFlameY = world.flameY("prop.post");
  for (const x of [58.5, 66, 76.2, 85, 95]) {
    P("prop.post", x, 0, -2.9);
    world.addFlame(x, postFlameY, -2.9, 0.5);
  }
  for (let x = 92; x < 112; x += 2.5 + R() * 2)
    P(`prop.rock.${(R() * 3) | 0}`, x, 0, -4 - R() * 3, { scale: 1.2 + R() * 0.8 });

  // cave
  for (let x = 102; x < 250; x += 3.4 + R() * 4)
    P(`prop.cRock.${(R() * 2) | 0}`, x, 0, -8.0 - R() * 0.8, {
      scale: 0.7 + R() * 0.5,
      flip: R() < 0.5,
      rim: 0.7,
    });
  for (let x = 104; x < 250; x += 4.5 + R() * 5) {
    const k = (R() * 4) | 0;
    P(`prop.smite.${k}`, x, 0, -5.2 - R() * 2.4, {
      scale: 0.6 + R() * 0.4,
      flip: R() < 0.5,
      rim: 0.8,
    });
  }
  for (let x = 108; x < 250; x += 5 + R() * 6)
    P("prop.smite.3", x, 0, -3.4 - R() * 0.6, { scale: 0.7 + R() * 0.3, rim: 0.8 });
  for (let x = 106; x < 250; x += 2.6 + R() * 3) {
    const k = (R() * 3) | 0;
    P(`prop.stite.${k}`, x, 7.2 + R() * 1.2, -4.5 - R() * 4, {
      scale: 0.45 + R() * 0.3,
      flip: R() < 0.5,
      rim: 0.6,
    });
  }
  for (let x = 104; x < 248; x += 7.4) {
    P("prop.sconce", x, 3.1, -8.95);
    world.addFlame(x, 3.05, -8.9, 0.5);
  }
  for (const x of [128, 137.5, 151, 161, 176, 186, 205, 214]) {
    P("prop.post", x, 0, -2.9);
    world.addFlame(x, postFlameY, -2.9, 0.5);
  }
  const crystals: [number, number, "B" | "P" | "B2"][] = [
    [118, -5.8, "B"],
    [133, -6.4, "P"],
    [149.5, -7.2, "B"],
    [166, -5.6, "P"],
    [181, -6.8, "B"],
    [194, -6.8, "B"],
    [201.5, -7.0, "P"],
    [207, -6.9, "B2"],
    [224, -5.6, "P"],
  ];
  for (const [x, z, k] of crystals) {
    const key = k === "B" ? "prop.crystalB" : k === "P" ? "prop.crystalP" : "prop.crystalB2";
    const s = x > 190 && x < 210 ? 1.7 : 1.3;
    P(key, x, 0, z, { scale: s, emis: 0.5, rim: 0.6, tint: [0.7, 0.7, 0.8] });
    world.lights.addStatic({
      x,
      y: 1.8,
      z: z + 1.8,
      radius: (5.5 * s) / 1.4,
      color: k === "P" ? [0.62, 0.42, 1.0] : [0.35, 0.7, 1.0],
      intensity: 0.55,
      scatter: 0.003,
      flicker: false,
    });
  }
  for (let x = 110; x < 246; x += 6 + R() * 8) {
    P("prop.shroom", x, 0, -3.6 - R() * 1.5, { emis: 2.5 });
    world.lights.addStatic({
      x,
      y: 0.4,
      z: -3.4,
      radius: 2.5,
      color: [0.3, 1.0, 0.85],
      intensity: 0.5,
      scatter: 0,
      flicker: false,
    });
  }
  world.addRuneCircle(ENCX[3]! + 8.3, -1.0, 6.4, 1.0);

  // foreground framing (separately blurred layer)
  const centers = ENCX.map((x) => x + BATTLE_OFF);
  const nearBattle = (x: number): boolean => centers.some((c) => Math.abs(x - c) < 3.4);
  const fg = (o: { scale?: number; flip?: boolean; dark?: number }) => ({
    foreground: true,
    dark: 0.4,
    rim: 1.6,
    wrap: 0.6,
    ...o,
  });
  centers.forEach((c, i) => {
    if (c > 110) {
      P("prop.smite.2", c - 5.0, 0, 7.4, fg({ scale: 0.85 }));
      P("prop.cRock.2", c + 5.2, 0, 7.0, fg({ scale: 0.9, flip: true }));
      P("prop.stite.2", c + 3.6, 8.9, 7.6, fg({ scale: 0.5 }));
      if (i === 2) {
        P("prop.post", c - 3.4, 0, 6.8, fg({ dark: 0.1 }));
        world.addFlame(c - 3.4, postFlameY, 6.8, 0.55, true);
      }
      if (i === 3) {
        P("prop.post", c + 4.1, 0, 6.6, fg({ dark: 0.1 }));
        world.addFlame(c + 4.1, postFlameY, 6.6, 0.55, true);
      }
    } else {
      P(`prop.fernD.${i % 2}`, c - 5.3, 0, 7.2, fg({ scale: 0.9 }));
      P(`prop.fernD.${(i + 1) % 2}`, c + 5.6, 0, 7.6, fg({ scale: 0.95, flip: true }));
      P(`prop.vines.${i % 2}`, c - 3.2, 9.0, 7.4, fg({ scale: 1.0 }));
    }
  });
  for (let x = -24; x < 250; x += 4.5 + R() * 5) {
    if (nearBattle(x)) continue;
    const cave = x > 106;
    const k = R();
    if (!cave) {
      if (k < 0.45)
        P(
          `prop.fernD.${(R() * 2) | 0}`,
          x,
          0,
          6.6 + R() * 1.5,
          fg({ scale: 0.7 + R() * 0.4, flip: R() < 0.5 }),
        );
      else if (k < 0.65) P(`prop.vines.${(R() * 2) | 0}`, x, 8.8 + R(), 7.2, fg({}));
      else if (k < 0.8)
        P(`prop.fernD.${(R() * 2) | 0}`, x, 0, 7.4, fg({ scale: 1.1 + R() * 0.3, dark: 0.45 }));
      else if (k < 0.9 && x > 2) P("prop.trunk", x, 0, 8.4, fg({ scale: 1.3, dark: 0.45 }));
      else P("prop.grass.3", x, 0, 6.2, fg({ scale: 3 }));
    } else if (k < 0.4)
      P(
        `prop.smite.${(R() * 3) | 0}`,
        x,
        0,
        6.8 + R() * 1.2,
        fg({ scale: 0.7 + R() * 0.4, flip: R() < 0.5 }),
      );
    else if (k < 0.7)
      P(`prop.stite.${(R() * 3) | 0}`, x, 8.4 + R() * 0.6, 7.4, fg({ scale: 0.55 + R() * 0.25 }));
    else if (k < 0.85) P(`prop.cRock.${(R() * 3) | 0}`, x, 0, 6.8, fg({ scale: 1.0 + R() * 0.5 }));
    else {
      P("prop.post", x, 0, 6.8, fg({ dark: 0.1 }));
      world.addFlame(x, postFlameY, 6.8, 0.55, true);
    }
  }
  for (let x = 104; x < 252; x += 2.8 + R() * 2.5)
    P(
      "prop.stite.1",
      x,
      8.0 + R() * 0.8,
      5.8 + R() * 1.4,
      fg({ scale: 0.55 + R() * 0.35, dark: 0.55 }),
    );
}

interface Comp {
  biome: BiomeId;
  pose: { x: number; y: number; dist: number; pitch: number; fov: number };
}

function setupComposition(world: RenderWorld, biome: BiomeId): Comp {
  const heroOpts = { rim: 1.3, blobW: 1.25 };
  const monster = (
    key: string,
    anim: string,
    x: number,
    y: number,
    z: number,
    scale: number,
    blobW: number,
  ): void => {
    const a = world.addActor(`monster.${key}`, anim, { scale, rim: 1.4, blobW });
    a.place(x, y, z);
    world.shadowFor(a, x, z);
  };
  const hero = (x: number, anim: string, idx: number): void => {
    const a = world.addActor("hero", anim, heroOpts);
    a.setFrame(world.source.frames("hero", anim)[idx] ?? world.source.frames("hero", anim)[0]!);
    a.place(x, 0, 0.25);
    world.shadowFor(a, x, 0.25);
  };
  if (biome === "forest") {
    hero(19, "walk", 1);
    return { biome, pose: { ...WALK_POSE, x: 19 + 3.2 } };
  }
  if (biome === "cave") {
    hero(130, "walk", 1);
    return { biome, pose: { ...WALK_POSE, x: 130 + 3.2 } };
  }
  if (biome === "ruins") {
    const hx = ENCX[1]!;
    hero(hx, "idle", 0);
    const bx = hx + BATTLE_OFF;
    const slot = (s: number): number => hx + s;
    monster("goblin", "idle", slot(4.8), 0, -0.9, 1.35, 1.35 * 1.1);
    monster("bat", "idle", slot(7.9), 1.7, 0.9, 1.35, 1.35 * 0.8);
    monster("slimeG", "idle", slot(10.9), 0, -0.25, 1.35, 1.35 * 1.1);
    return { biome, pose: { ...BATTLE_POSE, x: bx } };
  }
  // boss intro close-up
  const hx = ENCX[3]!;
  const bossX = hx + 8.3;
  monster("golem", "idle", bossX, 0, -1.0, 1.6, 1.6 * 1.1);
  return { biome, pose: { ...BOSS_INTRO_POSE, x: bossX - 0.4 } };
}

export function start(canvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const biomeParam = q.get("biome");
  const tierParam = Number(q.get("tier") ?? "0");
  const biome: BiomeId = isBiomeId(biomeParam) ? biomeParam : "forest";
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : 0;
  const auto = q.get("auto") === "1";
  const frozen = q.get("freeze") === "1";
  const rawMode = q.get("raw") === "1";

  const world = new RenderWorld({ biome, quality: tier, autoQuality: auto });
  world.init(canvas);
  world.setBiome(biome, true);
  buildWorld(world);
  const comp = setupComposition(world, biome);
  world.camera.setTarget(comp.pose);
  world.camera.snap();
  world.update(1 / 60);
  world.warmUpAmbient(3);
  if (rawMode) world.setFx(false);

  const times: number[] = [];
  const perTier: RenderStats["perTier"] = {};
  const stats: RenderStats = {
    tier,
    biome,
    frames: 0,
    avgMs: 0,
    p95Ms: 0,
    maxMs: 0,
    drawCalls: 0,
    triangles: 0,
    perTier,
  };
  window.__renderStats = stats;
  world.renderer.info.autoReset = false;

  const step = (n: number, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) {
      world.update(dt, 0);
      if (i === n - 1) world.render();
    }
  };
  const bench = (
    t: QualityTier,
    frames: number,
  ): { avgMs: number; p95Ms: number; maxMs: number } => {
    world.setAutoQuality(false);
    world.setQuality(t);
    const gl = world.renderer.getContext();
    const ms: number[] = [];
    const px = new Uint8Array(4);
    for (let i = 0; i < frames + 5; i++) {
      const t0 = performance.now();
      world.update(1 / 60, 0);
      world.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (i >= 5) ms.push(performance.now() - t0);
    }
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    const r = { avgMs: avg, p95Ms: percentile(ms, 0.95), maxMs: Math.max(...ms) };
    perTier[`tier${t}`] = { avgMs: r.avgMs, p95Ms: r.p95Ms, frames: ms.length };
    return r;
  };
  window.__renderTest = {
    world,
    step,
    bench,
    setBiome: (b) => world.setBiome(b, true),
    ready: true,
  };

  if (frozen) {
    step(2);
    return;
  }
  let last = performance.now();
  const loop = (now: number): void => {
    const raw = now - last;
    last = now;
    const dt = Math.min(raw / 1000, 0.05);
    world.update(dt, 0);
    world.renderer.info.reset();
    world.render();
    world.reportFrameTime(raw);
    times.push(raw);
    if (times.length > 600) times.shift();
    stats.tier = world.qualityTier;
    stats.frames++;
    stats.avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    stats.p95Ms = percentile(times, 0.95);
    stats.maxMs = Math.max(...times);
    const info = world.renderer.info.render;
    stats.drawCalls = info.calls;
    stats.triangles = info.triangles;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => world.dispose());
}

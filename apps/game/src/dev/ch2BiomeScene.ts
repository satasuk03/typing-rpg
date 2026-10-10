/**
 * DEV-ONLY Chapter II biome diorama (T2.1): `?scene=render-test&biome=hushwood|grove[&tier=0|1|2][&freeze=1][&bars=1][&hero=0]`.
 * A hard-coded battle pose (hero vs Ch1 enemies as stand-ins: the Ch2 sprites are T2.3 and the layouts T2.4) that exercises
 * the new moods, the five depth layers, the Ch2 props, the `leaf` / `roots` ground, fog cards and the ambient kinds.
 * Hard-coded coordinates are allowed here only (same rule as renderTestScene.ts).
 *
 * Test hooks: `window.__renderTest` (as the render-test scene) and `window.__ch2Scene` (hero visibility, hero screen rect).
 */
import { type BiomeId, isQualityTier, percentile, type QualityTier, RenderWorld } from "../render";
import type { SpriteActor } from "../render/materials/sprite";
import { makeRng } from "../render/util";

type V3 = [number, number, number];

declare global {
  interface Window {
    __ch2Scene?: {
      world: RenderWorld;
      setHeroVisible(v: boolean): void;
      heroWorld(): { x: number; z: number };
      /** Hero's on-screen box in CSS px: x, y, w, h. */
      heroRect(): { x: number; y: number; w: number; h: number };
      ready: boolean;
    };
  }
}

const LANTERN: V3 = [1.0, 0.56, 0.22];
const FG = { foreground: true, dark: 0.5, rim: 1.6, wrap: 0.6 } as const;

interface Built {
  camX: number;
  camY: number;
  dist: number;
  pitch: number;
  fov: number;
  hero: SpriteActor;
  /** Per-frame emitters for scene-specific particles (hush motes etc). */
  emit: (dt: number) => void;
}

function build(world: RenderWorld, biome: "hushwood" | "grove"): Built {
  const rng = makeRng(0xc2c2 + biome.length);
  const R = (a: number, b: number): number => a + (b - a) * rng();
  const P = world.addProp.bind(world);
  const light = (
    x: number,
    y: number,
    z: number,
    color: V3,
    intensity: number,
    radius: number,
    scatter = 0.02,
    flicker = true,
  ): void => {
    world.lights.addStatic({ x, y, z, radius, color, intensity, scatter, flicker });
  };
  const addGlow = (
    x: number,
    y: number,
    z: number,
    size: number,
    color: V3,
    intensity: number,
    fg = false,
  ): void => {
    world.addGlow(x, y, z, size, color, intensity, fg);
  };
  /** Hanging paper lantern: prop + warm point light + halo (the paper is the emissive: no flame mesh). */
  const lantern = (
    key: string,
    x: number,
    topY: number,
    z: number,
    int = 1.5,
    fg = false,
  ): void => {
    P(key, x, topY, z, fg ? { ...FG, dark: 0.2, emis: 2.2 } : { emis: 2.2 });
    const ly = topY - world.propHeight(key) + 0.55;
    if (!fg) {
      light(x, ly, z + 0.35, LANTERN, int, 6.5, 0.03);
      addGlow(x, ly, z - 0.05, 1.5, [1.0, 0.48, 0.16], 0.55);
    } else addGlow(x, ly, z - 0.05, 2.2, [1.0, 0.48, 0.16], 0.5, true);
  };
  /** Stilt lantern post: the lamp hangs off the arm tip (x + 1.06 m, mirrored when flipped). */
  const lpost = (
    key: string,
    x: number,
    z: number,
    int: number,
    flip = false,
    fg = false,
  ): void => {
    P(key, x, 0, z, fg ? { ...FG, dark: 0.25, emis: 2.2, flip } : { emis: 2.2, flip });
    const lx = x + (flip ? -1.06 : 1.06);
    const fy = world.flameY(key);
    if (!fg) {
      light(lx, fy, z + 0.35, [1.0, 0.62, 0.24], int, 6.5, 0.025);
      addGlow(lx, fy, z - 0.05, 1.5, [1.0, 0.5, 0.16], 0.5);
    } else addGlow(lx, fy, z - 0.05, 2.4, [1.0, 0.5, 0.16], 0.55, true);
  };
  const actor = (
    key: string,
    x: number,
    y: number,
    z: number,
    scale: number,
    anim = "idle",
    hero = false,
  ): SpriteActor => {
    const a = world.addActor(key, anim, {
      scale,
      rim: hero ? 1.3 : 1.4,
      blobW: hero ? 1.25 : scale * 1.1,
      ...(hero
        ? { caveRim: Number(new URLSearchParams(location.search).get("heroRim") ?? 0.6) }
        : {}),
    });
    a.place(x, y, z);
    world.shadowFor(a, x, z);
    return a;
  };
  const backdrops = (a: V3, b: V3, c: V3): void => {
    world.addBackdrop("skyNight", 300, 70, [40, 22, -150], a, 0, 1, true);
    world.addBackdrop("mountainsNight", 460, 43.2, [40, 11, -105], b, 0.55, 3);
    world.addBackdrop("treelineNight", 420, 19.44, [30, 6.4, -58], c, 0.4, 6);
  };
  const emitters: ((dt: number) => void)[] = [];
  const rate = (r: number, dt: number, fn: () => void): void => {
    const n = r * dt;
    for (let i = 0; i < n || rng() < n - i; i++) fn();
  };

  if (biome === "hushwood") {
    backdrops([0.85, 0.85, 1.0], [0.75, 0.8, 1.0], [0.8, 0.85, 1.0]);
    world.addGround(140, 70, 30, -15, "leaf");
    world.addFogCards("hushwood");
    const camX = 31;
    // back + far rows: big twisted oaks in the fog
    for (let x = 6; x < 60; x += R(4.5, 7.5))
      P(`prop.ch2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-20, -16), {
        scale: R(1.3, 1.6),
        tint: [0.5, 0.55, 0.75],
        rim: 0.6,
        flip: rng() < 0.5,
      });
    for (let x = 4; x < 60; x += R(6, 9))
      P(`prop.ch2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-11, -8.5), {
        scale: R(1.0, 1.25),
        tint: [0.75, 0.78, 0.9],
        rim: 0.7,
        flip: rng() < 0.5,
      });
    // mid: framing oaks, root arch, waystone, mushroom rings, ferns
    P("prop.ch2.oak.0", 21.5, 0, -5.2, { scale: 1.05, rim: 0.9 });
    P("prop.ch2.oak.2", 41.5, 0, -5.8, { scale: 1.1, rim: 0.9, flip: true });
    P("prop.ch2.rootarch", 31.5, 0, -7.0, { scale: 1.15, rim: 0.8 });
    P("prop.ch2.waystone", 27.2, 0, -3.1, { scale: 1.1 });
    light(27.2, 1.4, -2.4, [0.35, 1.2, 1.25], 0.9, 3.2, 0.02, false);
    for (const [x, z, v] of [
      [24.0, -2.7, "T"],
      [35.6, -2.9, "V"],
      [38.6, -2.6, "T"],
      [17.5, -3.4, "T"],
    ] as const) {
      P(`prop.ch2.shroom${v}`, x, 0, z, { scale: 1.15, emis: 1.5 });
      light(x, 0.4, z + 0.5, v === "T" ? [0.25, 1.0, 0.9] : [0.7, 0.45, 1.2], 0.55, 2.8, 0, false);
    }
    for (let x = 8; x < 56; x += R(2.2, 4.4))
      if (Math.abs(x - 31) > 4)
        P(`prop.ch2.fern.${Math.floor(R(0, 2))}`, x, 0, R(-4.6, -3.4), {
          scale: R(0.8, 1.15),
          rim: 1.0,
          flip: rng() < 0.5,
        });
    // hanging lanterns along the road
    lantern("prop.ch2.lantern.0", 23.4, 5.4, -4.6, 1.7);
    lantern("prop.ch2.lantern.1", 39.6, 6.6, -5.0, 1.7);
    lantern("prop.ch2.lantern.2", 31.0, 5.1, -6.4, 1.3);
    lantern("prop.ch2.lantern.0", 13.0, 5.2, -6.0, 1.4);
    lantern("prop.ch2.lantern.0", 48.5, 5.2, -6.5, 1.4);
    // moon shafts through the canopy
    for (const [x, w, i] of [
      [18, 2.2, 0.55],
      [26.5, 1.4, 0.4],
      [33.5, 3.0, 0.7],
      [44, 1.8, 0.45],
      [51, 2.6, 0.5],
    ] as const)
      world.addGodRay(x, 6.5, -6.5 + R(-1, 1), w, 17, -0.32, [0.42, 0.56, 1.0], i);
    addGlow(14, 13, -60, 34, [0.25, 0.32, 0.7], 0.45); // moon halo behind the far canopy
    // foreground (z 6-7: the frame is only camX +- 6 m wide here): near trunk + moss on the edges, ferns, a lantern
    P("prop.ch2.oak.4", camX - 8.6, 0, 7.2, { ...FG, dark: 0.6, scale: 1.2 });
    P("prop.ch2.moss.0", camX - 5.6, 7.6, 6.6, { ...FG, dark: 0.5, scale: 0.9 });
    P("prop.ch2.moss.1", camX + 6.4, 7.9, 6.8, { ...FG, dark: 0.5, scale: 0.85, flip: true });
    P("prop.ch2.fern.1", camX - 8.2, 0, 6.3, { ...FG, scale: 1.25 });
    P("prop.ch2.fern.0", camX + 4.8, 0, 6.0, { ...FG, scale: 1.4, flip: true });
    lantern("prop.ch2.lantern.1", camX - 4.6, 8.4, 6.6, 1.0, true);
    // cast: hero vs three Ch1 stand-ins (a flyer, a grunt and a heavy)
    const hero = actor("hero", 25.6, 0, 0.3, 1, "idle", true);
    actor("monster.bat", 30.4, 1.45, -0.5, 1.2);
    actor("monster.goblin", 33.6, 0, 0.55, 1.2);
    actor("monster.slimeP", 36.9, 0, -0.15, 1.3);
    light(30.4, 2.1, 0.0, [0.4, 1.2, 1.6], 0.7, 3.5, 0.015, false); // the wisp-stand-in's own light
    addGlow(30.4, 2.25, -0.55, 1.5, [0.3, 0.9, 1.3], 0.5);
    return { camX, camY: 1.9, dist: 18.6, pitch: 16, fov: 32, hero, emit: () => undefined };
  }

  // ---------------------------------------------------------------- grove (the Willow's Heart)
  backdrops([0.7, 0.7, 0.95], [0.55, 0.55, 0.85], [0.6, 0.6, 0.9]);
  const wx = 35.5;
  const wz = -3.6;
  world.addGround(140, 70, 30, -15, "roots", [wx, wz]);
  world.addFogCards("grove");
  const camX = 32;
  // the vast canopy: dark frond curtains far behind, hanging off-frame
  for (let x = 14; x < 58; x += R(2.6, 4))
    P(`prop.ch2.fronds.silver.${Math.floor(R(0, 4))}`, x, R(11.5, 13.5), R(-13, -9), {
      scale: R(1.4, 1.8),
      tint: [0.45, 0.5, 0.7],
      rim: 0.6,
      flip: rng() < 0.5,
    });
  for (let x = 6; x < 60; x += R(5, 8))
    if (Math.abs(x - wx) > 9)
      P(`prop.ch2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-19, -14), {
        scale: R(1.1, 1.35),
        tint: [0.45, 0.45, 0.65],
        rim: 0.5,
        flip: rng() < 0.5,
      });
  // the Willow stand-in (T2.3 owns the real one): trunk + front frond curtains + rune ring
  P("prop.ch2.willowCore", wx, 0, wz, { scale: 1.0, rim: 1.2, emis: 2.4 });
  for (const [dx, y, dz, i, s] of [
    [-4.6, 9.3, 0.35, 0, 1.25],
    [-3.7, 9.9, 0.5, 1, 1.15],
    [3.7, 9.8, 0.5, 2, 1.2],
    [4.8, 9.2, 0.35, 3, 1.3],
    [-6.4, 10.4, -0.4, 2, 1.4],
    [6.6, 10.6, -0.4, 1, 1.4],
    [0.0, 11.4, -0.6, 3, 1.3],
  ] as const)
    P(`prop.ch2.fronds.silver.${i}`, wx + dx, y, wz + dz, {
      scale: s,
      rim: 1.3,
      flip: dx > 0,
      emis: 1.8,
    });
  const hushCol: V3 = [0.75, 0.45, 1.8];
  world.addRuneCircle(wx, wz + 0.4, 10.5, 0.75, hushCol);
  light(wx, 3.6, wz + 1.8, [0.45, 0.42, 1.15], 0.9, 9, 0.015, false); // Willow key (phase 1)
  addGlow(wx, 3.5, wz + 0.2, 6, [0.3, 0.22, 0.8], 0.15);
  // lantern ring: 7 lamps on the back arc behind the lane
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (1.08 + k * 0.14);
    lpost(
      k % 2 ? "prop.ch2.lpost.1" : "prop.ch2.lpost.0",
      wx + Math.cos(a) * 11.5,
      -1.2 + wz + Math.sin(a) * 3.6,
      1.3,
    );
  }
  light(wx, 5.2, wz + 2.4, [0.5, 0.62, 1.0], 0.8, 6, 0, false); // moon on the face
  lpost("prop.ch2.lpost.0", 19.5, 6.2, 1.0, false, true);
  lpost("prop.ch2.lpost.1", 45.5, 6.6, 1.0, true, true);
  // moon shaft onto the willow + side shafts
  world.addGodRay(wx - 0.5, 7.5, wz - 0.6, 5.5, 20, -0.08, [0.45, 0.58, 1.0], 0.85);
  world.addGodRay(wx - 7.5, 7.0, wz - 2.0, 2.0, 17, -0.2, [0.45, 0.58, 1.0], 0.4);
  world.addGodRay(wx + 8.0, 7.0, wz - 2.5, 2.4, 17, 0.12, [0.45, 0.58, 1.0], 0.45);
  // foreground: moss, a near frond curtain, a fern
  P("prop.ch2.moss.0", 17.0, 9.6, 6.6, { ...FG, dark: 0.5 });
  P("prop.ch2.fronds.silver.2", 47.8, 9.8, 6.9, { ...FG, dark: 0.45, scale: 1.6 });
  P("prop.ch2.fern.0", 23.0, 0, 6.1, { ...FG, scale: 1.3 });
  // cast: hero vs phase-1 adds (Ch1 stand-ins)
  const hero = actor("hero", 26.4, 0, 0.35, 1, "idle", true);
  actor("monster.goblinR", 30.8, 0, 1.6, 1.2);
  actor("monster.bat", 40.0, 1.35, 1.2, 1.2);
  // hush motes rising off the rune ring
  emitters.push((dt) =>
    rate(10, dt, () => {
      const a = rng() * Math.PI * 2;
      world.particles.additive.spawn({
        x: wx + Math.cos(a) * 5,
        y: 0.1,
        z: wz + 0.4 + Math.sin(a) * 2.6,
        vy: R(0.3, 0.7),
        life: R(1.5, 2.6),
        size: R(0.03, 0.06),
        kind: 0,
        r: hushCol[0],
        g: hushCol[1],
        b: hushCol[2],
        a: 0.9,
        sway: 0.6,
        ph: rng() * 6,
        fadeIn: 0.2,
      });
    }),
  );
  return {
    camX,
    camY: 2.6,
    dist: 20.5,
    pitch: 13,
    fov: 34,
    hero,
    emit: (dt) => {
      for (const e of emitters) e(dt);
    },
  };
}

export function start(
  canvas: HTMLCanvasElement,
  biome: "hushwood" | "grove",
  q: URLSearchParams,
): void {
  const tierParam = Number(q.get("tier") ?? "0");
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : 0;
  const frozen = q.get("freeze") === "1";
  const id: BiomeId = biome;
  const world = new RenderWorld({ biome: id, quality: tier, autoQuality: q.get("auto") === "1" });
  world.init(canvas);
  world.setBiome(id, true);
  if (q.get("bars") !== "1") world.postFx.effects.bars = 0; // the grove intro letterbox is a separate still
  const b = build(world, biome);
  world.camera.setTarget({ x: b.camX, y: b.camY, dist: b.dist, pitch: b.pitch, fov: b.fov });
  world.camera.snap();
  world.update(1 / 60);
  for (let i = 0; i < 90; i++) {
    b.emit(1 / 30);
    world.update(1 / 30);
  }
  world.warmUpAmbient(3);
  if (q.get("hero") === "0") b.hero.mesh.visible = false;
  if (q.get("raw") === "1") world.setFx(false);

  const step = (n: number, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) {
      b.emit(dt);
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
      b.emit(1 / 60);
      world.update(1 / 60, 0);
      world.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (i >= 5) ms.push(performance.now() - t0);
    }
    return {
      avgMs: ms.reduce((a, c) => a + c, 0) / ms.length,
      p95Ms: percentile(ms, 0.95),
      maxMs: Math.max(...ms),
    };
  };
  window.__renderTest = {
    world,
    step,
    bench,
    setBiome: (bm) => world.setBiome(bm, true),
    ready: true,
  };
  window.__ch2Scene = {
    world,
    setHeroVisible: (v) => {
      b.hero.mesh.visible = v;
      world.render();
    },
    heroWorld: () => ({ x: b.hero.mesh.position.x, z: b.hero.mesh.position.z }),
    heroRect: () => {
      const r = canvas.getBoundingClientRect();
      const pos = b.hero.mesh.position;
      const feet = world.camera.project(pos.x, 0, pos.z);
      const head = world.camera.project(pos.x, 2.4, pos.z);
      const fx = (feet.x * 0.5 + 0.5) * r.width + r.left;
      const fy = (1 - (feet.y * 0.5 + 0.5)) * r.height + r.top;
      const hy = (1 - (head.y * 0.5 + 0.5)) * r.height + r.top;
      const hh = fy - hy;
      return { x: fx - hh * 0.2, y: hy, w: hh * 0.4, h: hh };
    },
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
    b.emit(dt);
    world.update(dt, 0);
    world.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => world.dispose());
}

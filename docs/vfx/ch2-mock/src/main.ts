/**
 * C0.2 SCRATCH scene: three Ch2 mood stills built on the REAL render core (RenderWorld, LightRig, PostPipeline,
 * sprite materials) with scratch art and scratch ground/water materials. Kept out of apps/game/src on purpose.
 *
 *   ?mood=hushwood|fen|grove [&tier=0|1|2] [&willow=p1|spell|riddle|freed] [&fx=0]
 *
 * Every number that matters for production lives in moods.ts and in the brief; this file is just placement.
 */
import { type Material, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Vector4 } from "three";
import { FxKind, fxMaterial } from "../../../../apps/game/src/render/materials/fx";
import type { SpriteActor } from "../../../../apps/game/src/render/materials/sprite";
import type { QualityTier } from "../../../../apps/game/src/render/quality";
import { RenderWorld } from "../../../../apps/game/src/render/RenderWorld";
import { ProceduralSpriteSource } from "../../../../apps/game/src/render/sprites/ProceduralSpriteSource";
import type {
  BackdropKind,
  SpriteFrame,
  SpriteSource,
} from "../../../../apps/game/src/render/sprites/SpriteSource";
import { makeRng } from "../../../../apps/game/src/render/util";
import * as A from "./ch2Art";
import {
  ch2GroundMaterial,
  ch2WaterMaterial,
  fogCardMaterial,
  reflectionMaterial,
} from "./ch2Materials";
import { MOODS, type MoodId } from "./moods";

type V3 = [number, number, number];
type Anims = Record<string, SpriteFrame[]>;

const q = new URLSearchParams(location.search);
const moodId = (q.get("mood") ?? "hushwood") as MoodId;
const tier = Number(q.get("tier") ?? "0") as QualityTier;
const willowState = q.get("willow") ?? "p1";

// ------------------------------------------------------------------ sprite source (Ch1 procedural + Ch2 scratch keys)
class Ch2Source implements SpriteSource {
  readonly name = "ch2-mock";
  private readonly base = new ProceduralSpriteSource();
  private readonly makers = new Map<string, () => Anims>();
  private readonly cache = new Map<string, Anims>();
  private readonly bds: Partial<Record<BackdropKind, HTMLCanvasElement>> = {};
  constructor(private readonly mood: MoodId) {
    const one = (f: () => SpriteFrame) => () => ({ idle: [f()] });
    const m = this.makers;
    [3, 17, 29, 41, 53].forEach((s, i) => m.set(`c2.oak.${i}`, one(() => A.makeNightOak(s, i % 2 === 0))));
    m.set("c2.lantern.0", one(() => A.makeHangingLantern(22)));
    m.set("c2.lantern.1", one(() => A.makeHangingLantern(44)));
    m.set("c2.lantern.2", one(() => A.makeHangingLantern(10)));
    m.set("c2.lpost.0", one(() => A.makeLanternPost(3, 90)));
    m.set("c2.lpost.1", one(() => A.makeLanternPost(8, 74)));
    m.set("c2.waystone", one(() => A.makeWaystone(5)));
    m.set("c2.shroom.t", one(() => A.makeMushrooms(4, false)));
    m.set("c2.shroom.v", one(() => A.makeMushrooms(9, true)));
    m.set("c2.rootarch", one(() => A.makeRootArch(7)));
    m.set("c2.moss.0", one(() => A.makeMossCurtain(9)));
    m.set("c2.moss.1", one(() => A.makeMossCurtain(21)));
    m.set("c2.fern.0", one(() => A.makeNightFern(2)));
    m.set("c2.fern.1", one(() => A.makeNightFern(8, 120, 84)));
    [11, 19, 31].forEach((s, i) => m.set(`c2.cypress.${i}`, one(() => A.makeCypress(s))));
    [13, 15, 27].forEach((s, i) => m.set(`c2.reeds.${i}`, one(() => A.makeReeds(s, 48 + i * 6, 60 + i * 8))));
    m.set("c2.post", one(() => A.makePost(2)));
    m.set("c2.column.0", one(() => A.makeSunkenColumn(3, 64)));
    m.set("c2.column.1", one(() => A.makeSunkenColumn(6, 44)));
    for (const st of ["p1", "spell", "riddle", "freed"]) m.set(`c2.willow.${st}`, one(() => A.makeWillowCore(st)));
    for (const t of ["silver", "hush", "gold", "bloom"]) for (let i = 0; i < 4; i++) m.set(`c2.fronds.${t}.${i}`, one(() => A.makeWillowFronds(i * 7 + 1, t, 60 + i * 6, 120 + i * 14)));
    for (const t of ["neutral", "bloom", "wither"]) m.set(`c2.leaf.${t}`, one(() => A.makeRiddleLeaf(t)));
    const anim = (frames: SpriteFrame[]) => {
      const a = frames[0] as SpriteFrame;
      for (const f of frames) { f.ax = a.ax; f.ay = a.ay; }
      return frames;
    };
    m.set("c2.wisp", () => ({ idle: anim([A.makeWisp(0), A.makeWisp(1.6), A.makeWisp(3.2)]), atk: anim([A.makeWisp(0, true)]) }));
    m.set("c2.shade", () => ({ idle: anim([A.makeShade(0), A.makeShade(1.5)]), atk: anim([A.makeShade(0, true)]) }));
    m.set("c2.moth", () => ({ idle: anim([A.makeMoth(0), A.makeMoth(1.6), A.makeMoth(3.1)]), cast: anim([A.makeMoth(0, true)]) }));
    m.set("c2.toad", () => ({ idle: anim([A.makeToad(0), A.makeToad(1.6)]), atk: anim([A.makeToad(0, true)]) }));
    m.set("c2.wolf", () => ({ idle: anim([A.makeWolf(0), A.makeWolf(1.6)]), howl: anim([A.makeWolf(0, "howl")]), atk: anim([A.makeWolf(0, "atk")]) }));
  }
  has(k: string): boolean { return this.makers.has(k) || this.base.has(k); }
  keys(): readonly string[] { return [...this.makers.keys(), ...this.base.keys()]; }
  frames(k: string, anim = "idle"): readonly SpriteFrame[] {
    const mk = this.makers.get(k);
    if (!mk) return this.base.frames(k, anim);
    let set = this.cache.get(k);
    if (!set) { set = mk(); this.cache.set(k, set); }
    const f = set[anim];
    if (!f) throw new Error(`${k} has no ${anim}`);
    return f;
  }
  backdrop(kind: BackdropKind): HTMLCanvasElement {
    const have = this.bds[kind];
    if (have) return have;
    const fen = this.mood === "fen";
    const c =
      kind === "sky" ? (fen ? A.skyDusk() : A.skyNight())
        : kind === "mountains" ? (fen ? A.farForest("#2a3228", "#3c4636", "#58644c", 31, 160, 0, true) : A.farForest("#141632", "#1e2244", "#2e3660", 23, 168, 0.65))
          : fen ? A.farForest("#1a2018", "#262e22", "#3a4632", 47, 178, 0, true) : A.farForest("#0c0e1e", "#141830", "#222a48", 37, 176, 0.45);
    this.bds[kind] = c;
    return c;
  }
}

// ------------------------------------------------------------------ world
const canvas = document.getElementById("gl") as HTMLCanvasElement;
const src = new Ch2Source(moodId);
const world = new RenderWorld({ source: src, quality: tier, autoQuality: false });
world.init(canvas);
const mood = MOODS[moodId];
world.setMood(mood, "forest");
if (q.get("fx") === "0") world.setFx(false);
if (q.get("bars") !== "1") world.postFx.effects.bars = 0; // the intro letterbox is a separate still

const rng = makeRng(0xc2c2 + moodId.length);
const R = (a: number, b: number): number => a + (b - a) * rng();
const props: Mesh[] = [];
const actors: SpriteActor[] = [];
const quad = new PlaneGeometry(1, 1);

interface PO { scale?: number; flip?: boolean; fg?: boolean; tint?: V3; dark?: number; rim?: number; wrap?: number; emis?: number }
function prop(key: string, x: number, y: number, z: number, o: PO = {}): Mesh {
  const m = world.addProp(key, x, y, z, {
    scale: o.scale ?? 1, flip: o.flip ?? false, foreground: o.fg ?? false,
    ...(o.tint ? { tint: o.tint } : {}), ...(o.dark !== undefined ? { dark: o.dark } : {}),
    ...(o.rim !== undefined ? { rim: o.rim } : {}), ...(o.wrap !== undefined ? { wrap: o.wrap } : {}), ...(o.emis !== undefined ? { emis: o.emis } : {}),
  });
  if (!o.fg) props.push(m);
  return m;
}
const FG = { fg: true, dark: 0.5, rim: 1.6, wrap: 0.6 } as const;
function light(x: number, y: number, z: number, color: V3, intensity: number, radius: number, scatter = 0.02, flicker = true): void {
  world.lights.addStatic({ x, y, z, radius, color, intensity, scatter, flicker });
}
function glow(x: number, y: number, z: number, size: number, color: V3, intensity: number, fg = false): Mesh {
  const m = new Mesh(quad, world.sprites.adopt(fxMaterial(world.lighting, FxKind.Glow, color, [1, 1, 1], intensity, rng() * 100)));
  m.scale.set(size, size, 1);
  m.position.set(x, y, z);
  m.renderOrder = 6;
  (fg ? world.fgScene : world.scene).add(m);
  return m;
}
/** A hanging lantern from a bough: prop + warm point light + halo quad. */
const LANTERN: V3 = [1.0, 0.56, 0.22];
function lantern(key: string, x: number, topY: number, z: number, int = 1.5, fg = false): void {
  const m = prop(key, x, topY, z, fg ? { ...FG, dark: 0.2, emis: 2.2 } : { emis: 2.2 });
  const hgt = world.propHeight(key);
  const ly = topY - hgt + 0.55;
  if (!fg) { light(x, ly, z + 0.35, LANTERN, int, 6.5, 0.03); glow(x, ly, z - 0.05, 1.5, [1.0, 0.48, 0.16], 0.55); }
  else glow(x, ly, z - 0.05, 2.2, [1.0, 0.48, 0.16], 0.5, true);
  void m;
}
function fogCard(x: number, y: number, z: number, w: number, h: number, color: V3, a: number, fg = false): void {
  const m = new Mesh(quad, world.sprites.adopt(fogCardMaterial(world.lighting, color, a, rng() * 50)));
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  m.renderOrder = 8;
  (fg ? world.fgScene : world.scene).add(m);
}
function ground(variant: number, arena?: [number, number]): ShaderMaterial {
  const mat = world.sprites.adopt(ch2GroundMaterial(world.lighting, variant));
  if (arena) (mat.uniforms.uArena?.value as Vector4).set(arena[0], arena[1], 6, 0);
  const g = new Mesh(world.sprites.trackGeo(new PlaneGeometry(140, 70).rotateX(-Math.PI / 2)), mat);
  g.position.set(30, 0, -15);
  world.scene.add(g);
  return mat;
}
function actor(key: string, x: number, y: number, z: number, scale: number, anim = "idle", frame = 0, rim = 1.4): SpriteActor {
  const a = world.addActor(key, anim, { scale, rim, blobW: scale * 1.1, ...(key === "hero" ? { caveRim: 0.6 } : {}) });
  const fr = world.source.frames(key, anim);
  a.setFrame(fr[frame] ?? (fr[0] as SpriteFrame));
  a.place(x, y, z);
  world.shadowFor(a, x, z);
  actors.push(a);
  return a;
}
function backdrops(tint: V3, tint2: V3, tint3: V3): void {
  world.addBackdrop("sky", 300, 70, [40, 22, -150], tint, 0, 1, true);
  world.addBackdrop("mountains", 460, 43.2, [40, 11, -105], tint2, 0.55, 3);
  world.addBackdrop("treeline", 420, 19.44, [30, 6.4, -58], tint3, 0.4, 6);
}
type Spawner = (dt: number, camX: number) => void;
const spawners: Spawner[] = [];
const PA = () => world.particles.additive;
const PB = () => world.particles.normal;
function every(rate: number, dt: number, fn: () => void): void {
  const n = rate * dt;
  for (let i = 0; i < n || rng() < n - i; i++) fn();
}

// ------------------------------------------------------------------ HUSHWOOD (L2 "Lantern Path": wisp + shade + mender)
function buildHushwood(): number {
  backdrops([0.85, 0.85, 1.0], [0.75, 0.8, 1.0], [0.8, 0.85, 1.0]);
  ground(0);
  const camX = 31;
  // far + back rows: big twisted oaks in the fog
  for (let x = 6; x < 60; x += R(4.5, 7.5)) prop(`c2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-20, -16), { scale: R(1.3, 1.6), tint: [0.5, 0.55, 0.75], rim: 0.6, flip: rng() < 0.5 });
  for (let x = 4; x < 60; x += R(6, 9)) prop(`c2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-11, -8.5), { scale: R(1.0, 1.25), tint: [0.75, 0.78, 0.9], rim: 0.7, flip: rng() < 0.5 });
  // mid: oaks framing the clearing, a root arch, waystone, mushroom ring, ferns
  prop("c2.oak.0", 21.5, 0, -5.2, { scale: 1.05, rim: 0.9 });
  prop("c2.oak.2", 41.5, 0, -5.8, { scale: 1.1, rim: 0.9, flip: true });
  prop("c2.rootarch", 31.5, 0, -7.0, { scale: 1.15, rim: 0.8 });
  prop("c2.waystone", 27.2, 0, -3.1, { scale: 1.1 });
  light(27.2, 1.4, -2.4, [0.35, 1.2, 1.25], 0.9, 3.2, 0.02, false);
  for (const [x, z, v] of [[24.0, -2.7, "t"], [35.6, -2.9, "v"], [38.6, -2.6, "t"], [17.5, -3.4, "t"]] as const) {
    prop(`c2.shroom.${v}`, x, 0, z, { scale: 1.15, emis: 1.5 });
    light(x, 0.4, z + 0.5, v === "t" ? [0.25, 1.0, 0.9] : [0.7, 0.45, 1.2], 0.55, 2.8, 0.0, false);
  }
  for (let x = 8; x < 56; x += R(2.2, 4.4)) if (Math.abs(x - 31) > 4) prop(`c2.fern.${Math.floor(R(0, 2))}`, x, 0, R(-4.6, -3.4), { scale: R(0.8, 1.15), rim: 1.0, flip: rng() < 0.5 });
  // hanging lanterns along the road (from the framing oaks' boughs + the arch)
  lantern("c2.lantern.0", 23.4, 5.4, -4.6, 1.7);
  lantern("c2.lantern.1", 39.6, 6.6, -5.0, 1.7);
  lantern("c2.lantern.2", 31.0, 5.1, -6.4, 1.3);
  lantern("c2.lantern.0", 13.0, 5.2, -6.0, 1.4);
  lantern("c2.lantern.0", 48.5, 5.2, -6.5, 1.4);
  // moon shafts through the canopy
  for (const [x, w, i] of [[18, 2.2, 0.55], [26.5, 1.4, 0.4], [33.5, 3.0, 0.7], [44, 1.8, 0.45], [51, 2.6, 0.5]] as const) world.addGodRay(x, 6.5, -6.5 + R(-1, 1), w, 17, -0.32, [0.42, 0.56, 1.0], i);
  glow(14, 13, -60, 34, [0.25, 0.32, 0.7], 0.45); // moon halo behind the far canopy
  // foreground (the frame at z 6-7 is only camX +- 6 m wide): a near trunk + moss curtain on the left edge,
  // a fern mound bottom-right, a hanging lantern top-right, low mist
  prop("c2.oak.4", camX - 8.6, 0, 7.2, { ...FG, dark: 0.6, scale: 1.2 });
  prop("c2.moss.0", camX - 5.6, 7.6, 6.6, { ...FG, dark: 0.5, scale: 0.9 });
  prop("c2.moss.1", camX + 6.4, 7.9, 6.8, { ...FG, dark: 0.5, scale: 0.85, flip: true });
  prop("c2.fern.1", camX - 8.2, 0, 6.3, { ...FG, scale: 1.25 });
  prop("c2.fern.0", camX + 4.8, 0, 6.0, { ...FG, scale: 1.4, flip: true });
  lantern("c2.lantern.1", camX - 4.6, 8.4, 6.6, 1.0, true);
  fogCard(31, 0.45, -1.8, 46, 1.3, [0.09, 0.12, 0.22], 0.3);
  fogCard(31, 0.9, -9.5, 60, 2.6, [0.08, 0.11, 0.21], 0.5);
  fogCard(31, 0.35, 4.6, 40, 1.2, [0.08, 0.1, 0.2], 0.28, true);
  // cast: hero vs Lantern Wisp, Hush Shade, Moth Mender (L2 enc 2)
  actor("hero", 25.6, 0, 0.3, 1);
  actor("c2.wisp", 30.4, 1.45, -0.5, 1.2);
  actor("c2.shade", 33.6, 0.18, 0.55, 1.1);
  actor("c2.moth", 36.9, 1.25, -0.15, 1.15);
  // wisps' own glow + the mender's heal motes
  glow(30.4, 2.25, -0.55, 1.5, [0.3, 0.9, 1.3], 0.5);
  light(30.4, 2.1, 0.0, [0.4, 1.2, 1.6], 0.7, 3.5, 0.015, false);
  spawners.push((dt) => {
    every(10, dt, () => PA().spawn({ x: 36.9 + R(-1.1, 1.1), y: 2.0 + R(-0.3, 0.3), z: -0.1, vy: -R(0.25, 0.5), vx: R(-0.1, 0.1), life: R(1.2, 2.0), size: R(0.035, 0.06), kind: 0, r: 0.5, g: 2.4, b: 0.9, a: 0.9, sway: 0.6, ph: rng() * 6, fadeIn: 0.2 }));
  });
  // ambient: teal wisp motes, a few big drifting wisp-lights, sparse russet leaves
  spawners.push((dt, cx) => {
    every(16, dt, () => PA().spawn({ x: cx + R(-13, 13), y: R(0.3, 4.5), z: R(-7, 4), vx: R(-0.08, 0.12), vy: R(0.04, 0.2), life: R(4, 6), size: R(0.03, 0.06), kind: 0, r: 0.45, g: 1.3, b: 1.6, a: 0.8, sway: 0.7, ph: rng() * 6, fadeIn: 0.5 }));
    every(1.6, dt, () => PA().spawn({ x: cx + R(-12, 12), y: R(0.8, 3.5), z: R(-6, 3), vx: R(-0.15, 0.15), vy: R(-0.05, 0.12), life: R(5, 7), size: R(0.1, 0.15), kind: 0, r: 0.5, g: 1.5, b: 1.9, a: 0.75, sway: 1.1, ph: rng() * 6, fadeIn: 0.8 }));
    every(1.4, dt, () => PB().spawn({ x: cx + R(-12, 14), y: 8, z: R(-4, 4), vx: R(-0.5, 0.2), vy: -0.6, life: 10, size: 0.08, kind: 1, r: 0.24, g: 0.13, b: 0.09, sway: 1.6, ph: rng() * 6, spin: 3 }));
  });
  world.camera.setTarget({ x: camX, y: 1.9, dist: 18.6, pitch: 16, fov: 32 });
  return camX;
}

// ------------------------------------------------------------------ FEN (L7 "Reedmaze": toad + wisp + elite wolf)
let waterMat: ShaderMaterial | null = null;
function buildFen(): number {
  backdrops([1, 1, 1], [0.85, 0.9, 0.8], [0.8, 0.85, 0.75]);
  ground(1);
  const camX = 31;
  waterMat = world.sprites.adopt(ch2WaterMaterial(world.lighting));
  (waterMat.uniforms.uWaterTier as { value: number }).value = tier;
  const water = new Mesh(world.sprites.trackGeo(new PlaneGeometry(140, 70).rotateX(-Math.PI / 2)), waterMat);
  water.position.set(30, 0.0, -15);
  world.scene.add(water);
  // under-water sky card: what the reflected rays see where there is no mirrored geometry (the mood's fog colour,
  // darkened). Without it the clear colour shows through at full brightness and the pools read as white blotches.
  const skyCard = new Mesh(quad, world.sprites.adopt(new ShaderMaterial({
    uniforms: { uC: { value: new Vector3(mood.fogCol[0] * 0.5, mood.fogCol[1] * 0.55, mood.fogCol[2] * 0.6) } },
    vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }",
  })));
  skyCard.scale.set(260, 60, 1);
  skyCard.position.set(30, -30, -40);
  world.scene.add(skyCard);
  // far cypress line standing in the water
  for (let x = 4; x < 62; x += R(3.5, 6)) prop(`c2.cypress.${Math.floor(R(0, 3))}`, x, 0, R(-21, -15), { scale: R(1.1, 1.4), tint: [0.62, 0.68, 0.58], rim: 0.5, flip: rng() < 0.5 });
  for (let x = 6; x < 58; x += R(7, 11)) prop(`c2.cypress.${Math.floor(R(0, 3))}`, x, 0, R(-10, -7.5), { scale: R(0.95, 1.15), rim: 0.7, flip: rng() < 0.5 });
  prop("c2.column.0", 24.5, -0.5, -6.0, { scale: 1.1 });
  prop("c2.column.1", 27.0, -0.7, -6.6, { scale: 1.0, flip: true });
  prop("c2.column.0", 43.5, -0.6, -5.2, { scale: 0.95 });
  for (let x = 6; x < 58; x += R(1.6, 3.4)) if (Math.abs(x - 31) > 3.5 || rng() < 0.3) prop(`c2.reeds.${Math.floor(R(0, 3))}`, x, 0, R(-4.2, -2.8), { scale: R(0.9, 1.3), rim: 1.0, flip: rng() < 0.5 });
  // stilt lanterns along the boardwalk and out in the water
  const posts: [number, number, string][] = [[22.0, -2.5, "c2.lpost.0"], [38.5, -2.4, "c2.lpost.1"], [47.5, -4.5, "c2.lpost.0"], [14.0, -4.0, "c2.lpost.1"]];
  for (const [x, z, k] of posts) {
    prop(k, x, 0, z, { emis: 2.2 });
    const fy = world.flameY(k);
    light(x + 1.06, fy, z + 0.35, [1.0, 0.62, 0.24], 1.8, 7, 0.03);
    glow(x + 1.06, fy, z - 0.05, 1.6, [1.0, 0.5, 0.16], 0.55);
  }
  for (let x = 14; x < 50; x += 2.6) { prop("c2.post", x, 0, -2.45, {}); prop("c2.post", x + 1.3, 0, 2.45, { scale: 0.5 }); }
  // low dusk sun shafts through the fog bank (warm, from the right)
  for (const [x, w, i] of [[36, 3.2, 0.85], [43, 2.2, 0.7], [50, 3.6, 0.9], [27, 1.6, 0.5], [19, 2.4, 0.6]] as const) world.addGodRay(x, 6.0, -8 + R(-1, 1), w, 16, 0.38, [1.0, 0.8, 0.4], i);
  // foreground: reeds + a cypress trunk + Spanish moss + fog
  prop("c2.reeds.2", 21.0, 0, 6.0, { ...FG, scale: 1.8 });
  prop("c2.reeds.1", 24.0, 0, 6.4, { ...FG, scale: 1.5, flip: true });
  prop("c2.reeds.0", 42.0, 0, 6.2, { ...FG, scale: 1.9 });
  prop("c2.cypress.1", 47.5, 0, 7.4, { ...FG, dark: 0.55, scale: 1.2 });
  prop("c2.moss.1", 15.5, 9.4, 6.8, { ...FG, dark: 0.5, tint: [0.75, 0.85, 0.7] });
  fogCard(31, 0.45, -1.6, 50, 1.4, [0.42, 0.44, 0.28], 0.4);
  fogCard(31, 0.8, -6.5, 70, 2.8, [0.38, 0.4, 0.26], 0.6);
  fogCard(31, 1.2, -13, 80, 4.0, [0.36, 0.38, 0.25], 0.65);
  fogCard(31, 0.35, 4.8, 44, 1.2, [0.36, 0.38, 0.24], 0.32, true);
  // cast: hero on the boardwalk vs Mire Toad, Lantern Wisp, Gloom Wolf (elite)
  actor("hero", 25.4, 0, 0.25, 1);
  actor("c2.toad", 30.8, 0, -0.35, 1.3);
  actor("c2.wisp", 33.8, 1.6, 0.4, 1.2);
  const wolf = actor("c2.wolf", 37.6, 0, 0.05, 1.45, "idle");
  wolf.setRimFlash(0.42, [1.9, 1.35, 0.45]); // elite: persistent gold rim
  world.addRuneCircle(37.6, 0.05, 3.4, 0.55, [1.5, 1.05, 0.3]); // elite: gold sigil underfoot
  light(37.6, 1.2, 0.6, [1.0, 0.75, 0.3], 0.6, 3.2, 0.0, false);
  glow(33.8, 2.4, 0.35, 1.5, [0.3, 0.9, 1.3], 0.5);
  light(33.8, 2.3, 0.9, [0.4, 1.2, 1.6], 0.7, 3.5, 0.015, false);
  spawners.push((dt, cx) => {
    every(9, dt, () => PA().spawn({ x: cx + R(-13, 13), y: R(0.3, 2.6), z: R(-7, 4), vx: R(-0.25, 0.25), vy: R(-0.15, 0.2), life: R(2, 4), size: R(0.06, 0.1), kind: 0, r: 1.5, g: 2.2, b: 0.45, a: 1, sway: 1.3, ph: rng() * 6, fadeIn: 0.4 }));
    every(8, dt, () => PA().spawn({ x: cx + R(-13, 13), y: R(0.3, 5), z: R(-7, 4), vx: R(0.05, 0.2), vy: R(-0.05, 0.08), life: R(4, 6), size: R(0.025, 0.045), kind: 0, r: 1.3, g: 1.1, b: 0.55, a: 0.6, sway: 0.4, ph: rng() * 6, fadeIn: 0.4 }));
    // gold elite motes rising off the wolf
    every(7, dt, () => PA().spawn({ x: 37.6 + R(-1.2, 1.2), y: R(0.1, 0.5), z: 0.1, vy: R(0.4, 0.8), life: R(0.8, 1.3), size: R(0.03, 0.05), kind: 0, r: 2.2, g: 1.5, b: 0.4, a: 0.9, sway: 0.5, ph: rng() * 6, fadeIn: 0.1 }));
  });
  world.camera.setTarget({ x: camX, y: 1.9, dist: 18.6, pitch: 16, fov: 32 });
  return camX;
}

// ------------------------------------------------------------------ GROVE (L10 Willow's Heart, phase 1)
function buildGrove(): number {
  backdrops([0.7, 0.7, 0.95], [0.55, 0.55, 0.85], [0.6, 0.6, 0.9]);
  const wx = 35.5, wz = -3.6;
  ground(2, [wx, wz]);
  const camX = 32;
  // the vast canopy: dark frond curtains far behind, hanging off-frame
  for (let x = 14; x < 58; x += R(2.6, 4)) prop(`c2.fronds.silver.${Math.floor(R(0, 4))}`, x, R(11.5, 13.5), R(-13, -9), { scale: R(1.4, 1.8), tint: [0.45, 0.5, 0.7], rim: 0.6, flip: rng() < 0.5 });
  for (let x = 6; x < 60; x += R(5, 8)) if (Math.abs(x - wx) > 9) prop(`c2.oak.${Math.floor(R(0, 5))}`, x, 0, R(-19, -14), { scale: R(1.1, 1.35), tint: [0.45, 0.45, 0.65], rim: 0.5, flip: rng() < 0.5 });
  // the Willow: core + front frond curtains + rune ring
  const core = world.addProp(`c2.willow.${willowState}`, wx, 0, wz, { scale: 1.0, rim: 1.2, emis: 2.4 });
  props.push(core);
  const ft = willowState === "spell" ? "hush" : willowState === "riddle" ? "gold" : willowState === "freed" ? "bloom" : "silver";
  for (const [dx, y, dz, i, s] of [[-4.6, 9.3, 0.35, 0, 1.25], [-2.8, 9.9, 0.5, 1, 1.15], [3.0, 9.8, 0.5, 2, 1.2], [4.8, 9.2, 0.35, 3, 1.3], [-6.4, 10.4, -0.4, 2, 1.4], [6.6, 10.6, -0.4, 1, 1.4], [0.0, 11.4, -0.6, 3, 1.3]] as const) {
    prop(`c2.fronds.${ft}.${i}`, wx + dx, y, wz + dz, { scale: s, rim: 1.3, flip: dx > 0, emis: 1.8 });
  }
  const hushCol: V3 = willowState === "freed" ? [1.4, 1.2, 0.5] : willowState === "riddle" ? [1.2, 1.0, 0.35] : [0.75, 0.45, 1.8];
  world.addRuneCircle(wx, wz + 0.4, 10.5, 0.75, hushCol);
  light(wx, 3.6, wz + 1.8, willowState === "freed" ? [1.0, 0.85, 0.5] : [0.45, 0.42, 1.15], 0.9, 9, 0.015, false);
  glow(wx, 3.5, wz + 0.2, 6, willowState === "freed" ? [0.8, 0.7, 0.3] : [0.3, 0.22, 0.8], 0.15);
  // the lantern ring: back arc behind the lane + two foreground posts
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (1.08 + k * 0.14);
    const x = wx + Math.cos(a) * 11.5, z = wz - 1.2 + Math.sin(a) * 3.6;
    const key = k % 2 ? "c2.lpost.1" : "c2.lpost.0";
    prop(key, x, 0, z, { emis: 2.2 });
    const fy = world.flameY(key);
    light(x + 1.06, fy, z + 0.35, LANTERN, 1.3, 6.5, 0.025);
    glow(x + 1.06, fy, z - 0.05, 1.5, [1.0, 0.5, 0.16], 0.5);
  }
  light(wx, 5.2, wz + 2.4, [0.5, 0.62, 1.0], 0.8, 6, 0.0, false); // moonlight on the face
  prop("c2.lpost.0", 19.5, 0, 6.2, { ...FG, dark: 0.25, emis: 2.2 });
  glow(20.56, world.flameY("c2.lpost.0"), 6.15, 2.4, [1.0, 0.5, 0.16], 0.55, true);
  prop("c2.lpost.1", 45.5, 0, 6.6, { ...FG, dark: 0.25, emis: 2.2, flip: true });
  // moon shaft straight down onto the willow + side shafts
  world.addGodRay(wx - 0.5, 7.5, wz - 0.6, 5.5, 20, -0.08, [0.45, 0.58, 1.0], 0.85);
  world.addGodRay(wx - 7.5, 7.0, wz - 2.0, 2.0, 17, -0.2, [0.45, 0.58, 1.0], 0.4);
  world.addGodRay(wx + 8.0, 7.0, wz - 2.5, 2.4, 17, 0.12, [0.45, 0.58, 1.0], 0.45);
  // foreground: moss curtains + near frond curtain + fog
  prop("c2.moss.0", 17.0, 9.6, 6.6, { ...FG, dark: 0.5 });
  prop("c2.fronds.silver.2", 47.8, 9.8, 6.9, { ...FG, dark: 0.45, scale: 1.6 });
  prop("c2.fern.0", 23.0, 0, 6.1, { ...FG, scale: 1.3 });
  fogCard(32, 0.5, -1.0, 50, 1.4, [0.07, 0.11, 0.2], 0.34);
  fogCard(32, 1.0, -8.0, 70, 3.0, [0.06, 0.1, 0.19], 0.5);
  fogCard(32, 0.35, 4.8, 44, 1.2, [0.06, 0.09, 0.18], 0.28, true);
  // cast: hero vs phase-1 adds (Hush Shade fading + Moth Mender)
  actor("hero", 26.4, 0, 0.35, 1);
  actor("c2.shade", 30.8, 0.18, 1.6, 1.1);
  actor("c2.moth", 40.0, 1.35, 1.2, 1.15);
  spawners.push((dt, cx) => {
    // the leaf storm (silver-teal, a few gold riddle leaves)
    every(9, dt, () => { const gold = rng() < 0.12; PB().spawn({ x: cx + R(-13, 14), y: R(8, 10), z: R(-6, 5), vx: R(-0.5, 0.3), vy: -R(0.55, 0.8), life: 12, size: R(0.07, 0.1), kind: 1, r: gold ? 0.7 : 0.16, g: gold ? 0.5 : 0.34, b: gold ? 0.12 : 0.32, sway: 1.6, ph: rng() * 6, spin: 3 }); });
    // hush motes rising from the rune ring
    every(10, dt, () => { const a = rng() * Math.PI * 2; PA().spawn({ x: wx + Math.cos(a) * 5, y: 0.1, z: wz + 0.4 + Math.sin(a) * 2.6, vy: R(0.3, 0.7), life: R(1.5, 2.6), size: R(0.03, 0.06), kind: 0, r: hushCol[0], g: hushCol[1], b: hushCol[2], a: 0.9, sway: 0.6, ph: rng() * 6, fadeIn: 0.2 }); });
    every(10, dt, () => PA().spawn({ x: 40 + R(-1.1, 1.1), y: 2.1 + R(-0.3, 0.3), z: 1.25, vy: -R(0.25, 0.5), life: R(1.2, 2.0), size: R(0.035, 0.06), kind: 0, r: 0.5, g: 2.4, b: 0.9, a: 0.9, sway: 0.6, ph: rng() * 6, fadeIn: 0.2 }));
  });
  world.camera.setTarget({ x: camX, y: 2.6, dist: 20.5, pitch: 13, fov: 34 });
  return camX;
}

// ------------------------------------------------------------------ build, mirror (fen), warm up, render
const camX = moodId === "fen" ? buildFen() : moodId === "grove" ? buildGrove() : buildHushwood();
if (moodId === "fen" && tier < 2 && q.get("refl") !== "0") {
  // planar reflection by mirrored billboards (tier 0/1): every prop and actor gets a flipped twin under y = 0.
  // The ground hides them except where it discards for water; the water surface draws over them, alpha-blended.
  const mirror = (src: Mesh, darken: number): void => {
    const mat = reflectionMaterial(src.material as ShaderMaterial, darken);
    world.sprites.adopt(mat);
    const m = new Mesh(src.geometry, mat);
    m.position.set(src.position.x, -src.position.y, src.position.z);
    m.scale.set(src.scale.x, -src.scale.y, 1);
    m.frustumCulled = false;
    world.scene.add(m);
  };
  for (const p of props) if (Math.abs(p.position.x - camX) < 22) mirror(p, 0.62);
  if (tier === 0) for (const a of actors) mirror(a.mesh, 0.7);
}
world.camera.snap();
const dt = 1 / 30;
for (let i = 0; i < 150; i++) {
  for (const s of spawners) s(dt, camX);
  world.update(dt);
}
world.warmUpAmbient(2);
world.render();
world.update(1 / 60);
world.render();
(window as unknown as { __ready: boolean }).__ready = true;
(window as unknown as { __mock: unknown }).__mock = {
  world,
  bench(frames: number) {
    const ts: number[] = [];
    let last = performance.now();
    return new Promise<{ avg: number; p95: number }>((res) => {
      const loop = (): void => {
        for (const s of spawners) s(1 / 60, camX);
        world.update(1 / 60);
        world.render();
        const now = performance.now();
        ts.push(now - last);
        last = now;
        if (ts.length < frames) requestAnimationFrame(loop);
        else { const s = ts.slice(10).sort((a, b) => a - b); res({ avg: s.reduce((a, b) => a + b, 0) / s.length, p95: s[Math.floor(s.length * 0.95)] ?? 0 }); }
      };
      requestAnimationFrame(loop);
    });
  },
};
void ({} as Material);

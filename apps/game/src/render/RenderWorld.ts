import {
  Color,
  type Material,
  Mesh,
  type Object3D,
  PlaneGeometry,
  Scene,
  type ShaderMaterial,
  Vector3,
  type WebGLRenderer,
} from "three";
import { AmbientDirector, type FlameRef } from "./ambient/ambient";
import { Particles } from "./ambient/particles";
import { BIOMES, type BiomeId, type BiomeMood, blendMood } from "./biomes";
import { DioramaCamera } from "./camera";
import {
  createLightingUniforms,
  type DynamicLight,
  type LightingUniforms,
  LightRig,
  TORCH_COLOR,
} from "./lighting";
import { FxKind, fxMaterial } from "./materials/fx";
import {
  makePropMesh,
  pixelTexture,
  SpriteActor,
  type SpriteActor as SpriteActorType,
  type SpriteMaterialOptions,
  type SpriteOptions,
  SpriteResources,
} from "./materials/sprite";
import { backdropMaterial, groundMaterial, wallMaterial } from "./materials/terrain";
import { PostPipeline } from "./post/pipeline";
import { AutoQuality, type QualityTier, tierSettings } from "./quality";
import {
  computeOutputSize,
  createRenderer,
  type RendererHandle,
  type RendererHooks,
} from "./renderer";
import { ProceduralSpriteSource } from "./sprites/ProceduralSpriteSource";
import type { BackdropKind, SpriteSource } from "./sprites/SpriteSource";
import { clamp, makeRng, PX, type Vec3Tuple } from "./util";

/** Default colour of a layout Rune decal (linear HDR). */
export const RUNE_COLOR: Vec3Tuple = [0.25, 1.4, 1.5];

export interface RenderWorldOptions {
  /** Sprite provider. Defaults to the POC procedural generators. */
  source?: SpriteSource;
  biome?: BiomeId;
  quality?: QualityTier;
  /** Enable the rolling frame-time auto fallback (feed it via `reportFrameTime`). Default true. */
  autoQuality?: boolean;
  /** Seconds for a biome crossfade started by `setBiome`. */
  biomeFadeSec?: number;
  hooks?: RendererHooks;
}

export interface PropOptions extends SpriteMaterialOptions {
  scale?: number;
  flip?: boolean;
  /** Put the prop in the heavily blurred foreground layer. */
  foreground?: boolean;
}

interface Flame {
  mesh: Mesh;
  glow: Mesh;
  ref: FlameRef;
  foreground: boolean;
}

interface GodRay {
  mesh: Mesh;
  base: number;
  x: number;
}

/**
 * Facade over the render core. Rendering never owns game logic: time arrives as `update(dt, alpha)`,
 * and the world only ever reads the data it is handed (positions, frames, light defs).
 *
 *   const world = new RenderWorld(); world.init(canvas);
 *   world.setBiome("cave"); ... each frame: world.update(dt, alpha); world.render();
 *   world.dispose();
 */
const FOREST_ADD_GAIN = 0.6;
/** W5: the cave runs exposure 1.3, so the same additive amount clips earlier than on the forest: 0.5 there (was 1; the forest runs 0.6). */
const CAVE_ADD_GAIN = 0.5;
/** W5: cave dim of the additive white discs (see `RenderWorld.discGain`). */
const CAVE_DISC_DIM = 0.6;
const CAVE_DISC_SIZE = 0.5;
const CAVE_ARC_DIM = 0.55;

export class RenderWorld {
  readonly scene = new Scene();
  /** Foreground layer: rendered separately and blurred hard (framing pieces near the lens). */
  readonly fgScene = new Scene();
  readonly camera = new DioramaCamera();
  readonly lighting: LightingUniforms = createLightingUniforms();
  readonly lights = new LightRig(this.lighting);
  source: SpriteSource;
  /** Seconds. Advanced only by `update(dt)`. */
  time = 0;
  /** Sim interpolation factor from the last `update`, for actors that interpolate between ticks. */
  alpha = 0;
  /** DOF tilt-shift focus row (uv y). */
  focusY = 0.42;

  private handle: RendererHandle | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private res: SpriteResources | null = null;
  private post: PostPipelineRef | null = null;
  private ambientPa: Particles | null = null;
  private ambientPb: Particles | null = null;
  private ambient: AmbientDirector | null = null;
  private fillLight: DynamicLight | null = null;
  private resizeObs: ResizeObserver | null = null;

  private readonly auto: AutoQuality;
  private tier: QualityTier;
  private mood: BiomeMood;
  private fromMood: BiomeMood;
  private biomeId: BiomeId;
  private fade = 1;
  private readonly fadeSec: number;
  private lastDt = 1 / 60;
  private contextLost = false;
  private disposed = false;
  private readonly flames: Flame[] = [];
  /** Colour arrays of torch lights (the default and the layout's `flameColor`s): `shadowFor` aims away from these. */
  private readonly torchColors = new Set<readonly number[]>([TORCH_COLOR]);
  private readonly rays: GodRay[] = [];
  private readonly followCam: Object3D[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private readonly clear = new Color();
  private readonly tmp = new Vector3();
  private readonly hooks: RendererHooks;
  private readonly rng = makeRng(1337);

  constructor(opts: RenderWorldOptions = {}) {
    this.source = opts.source ?? new ProceduralSpriteSource();
    this.tier = opts.quality ?? 0;
    this.biomeId = opts.biome ?? "forest";
    this.mood = BIOMES[this.biomeId];
    this.fromMood = this.mood;
    this.fadeSec = opts.biomeFadeSec ?? 1.2;
    this.auto = new AutoQuality(this.tier);
    this.auto.enabled = opts.autoQuality ?? true;
    this.hooks = opts.hooks ?? {};
  }

  // ---------------------------------------------------------------- lifecycle

  init(canvas: HTMLCanvasElement): void {
    if (this.handle) throw new Error("RenderWorld.init called twice");
    this.canvas = canvas;
    this.handle = createRenderer(canvas, {
      onContextLost: () => {
        this.contextLost = true;
        this.hooks.onContextLost?.();
      },
      onContextRestored: () => {
        this.contextLost = false;
        this.post?.reset(true);
        this.resizeToCanvas();
        this.hooks.onContextRestored?.();
      },
    });
    this.res = new SpriteResources(this.lighting);
    this.post = new PostPipeline(this.handle.renderer, this.res.black);
    this.ambientPa = new Particles(5000, true, this.scene);
    this.ambientPb = new Particles(1800, false, this.scene);
    this.ambient = new AmbientDirector(this.ambientPa, this.ambientPb);
    this.lights.clearUniforms();
    this.fillLight = this.lights.hold({
      x: 0,
      y: 3.2,
      z: 5.5,
      radius: 13,
      color: [1.0, 0.78, 0.55],
      intensity: 0,
      scatter: 0,
    });
    this.applyMood(this.mood);
    this.applyQuality();
    this.resizeToCanvas();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.resizeToCanvas());
      this.resizeObs.observe(canvas);
    }
    this.camera.snap();
    this.lighting.uCam.value.copy(this.camera.camera.position);
  }

  /** The underlying renderer (for stats like `info.render.calls`). */
  get renderer(): WebGLRenderer {
    return this.requireHandle().renderer;
  }

  get sprites(): SpriteResources {
    return this.requireRes();
  }

  get postFx(): PostPipeline {
    return this.requirePost();
  }

  /** Ambient particle systems (additive, normal). The VFX library may spawn into them. */
  get particles(): { additive: Particles; normal: Particles } {
    if (!this.ambientPa || !this.ambientPb) throw new Error("RenderWorld not initialised");
    return { additive: this.ambientPa, normal: this.ambientPb };
  }

  get qualityTier(): QualityTier {
    return this.tier;
  }

  get biome(): BiomeId {
    return this.biomeId;
  }

  get currentMood(): BiomeMood {
    return this.mood;
  }

  /**
   * W4: gain on every additive fx quad / pooled additive particle: 0.6 on the bright forest (caveK 0), 1 in the cave. Stacked
   * additive flares clip a 96 px window of a bright backdrop to white; this is the one knob that keeps them coloured.
   */
  get additiveGain(): number {
    return (
      FOREST_ADD_GAIN +
      (CAVE_ADD_GAIN - FOREST_ADD_GAIN) * Math.min(1, Math.max(0, this.mood.caveK))
    );
  }

  /**
   * W5 (R3-1): extra gain on the additive white discs (glow and star quads, and glow-kind particles): 1 on the forest (it
   * already runs `additiveGain` 0.6), `1 - CAVE_DISC_DIM` in the cave, where a stack of them clipped a 96 px window white.
   * Rings, beams, lines, shards and sparks are not touched, so a hit still reads by shape.
   */
  get discGain(): number {
    return 1 - CAVE_DISC_DIM * Math.min(1, Math.max(0, this.mood.caveK));
  }

  /**
   * W5: size factor of the same white discs in the cave. A hit flare that keeps its peak but covers less area punches
   * without clipping a 96 px window white around the target.
   */
  get discSize(): number {
    return 1 - CAVE_DISC_SIZE * Math.min(1, Math.max(0, this.mood.caveK));
  }

  /** W5: arc (slash / crit crescent) gain: the 3-4 HDR cores clip a white blob where two crescents cross in the cave. */
  get arcGain(): number {
    return 1 - CAVE_ARC_DIM * Math.min(1, Math.max(0, this.mood.caveK));
  }

  /** Set the HD-2D look on/off ("raw pixels" comparison mode). */
  setFx(on: boolean): void {
    const post = this.requirePost();
    post.fx = on;
    this.lighting.uFlat.value = on ? 0 : 1;
    for (const f of this.flames) f.glow.visible = on;
  }

  private requireHandle(): RendererHandle {
    if (!this.handle) throw new Error("RenderWorld not initialised: call init(canvas)");
    return this.handle;
  }

  private requireRes(): SpriteResources {
    if (!this.res) throw new Error("RenderWorld not initialised: call init(canvas)");
    return this.res;
  }

  private requirePost(): PostPipeline {
    if (!this.post) throw new Error("RenderWorld not initialised: call init(canvas)");
    return this.post;
  }

  // ---------------------------------------------------------------- mood / quality

  /** Switch biome mood. Crossfades over `biomeFadeSec` of `update` time unless `instant`. */
  setBiome(id: BiomeId, instant = false): void {
    if (id === this.biomeId && this.fade >= 1) return;
    this.fromMood = this.mood;
    this.biomeId = id;
    if (instant || !this.handle) {
      this.mood = BIOMES[id];
      this.fromMood = this.mood;
      this.fade = 1;
      if (this.handle) this.applyMood(this.mood);
    } else {
      this.fade = 0;
    }
  }

  /**
   * Apply an explicit (already blended / tweaked) mood immediately, e.g. a level-specific variation of a
   * biome. `id` only labels the biome for `world.biome`; the mood values are what is rendered.
   */
  setMood(m: BiomeMood, id?: BiomeId): void {
    if (id) this.biomeId = id;
    this.mood = m;
    this.fromMood = m;
    this.fade = 1;
    if (this.handle) this.applyMood(m);
  }

  setQuality(tier: QualityTier): void {
    this.tier = tier;
    this.auto.setTier(tier);
    if (this.handle) this.applyQuality();
  }

  /** Disable/enable the automatic tier fallback. */
  setAutoQuality(on: boolean): void {
    this.auto.enabled = on;
  }

  /** Feed the wall-clock duration of the last frame (ms). May step the quality tier down (or back up). */
  reportFrameTime(ms: number): void {
    const next = this.auto.push(ms);
    if (next !== null && next !== this.tier) {
      this.tier = next;
      this.applyQuality();
    }
  }

  private applyMood(m: BiomeMood): void {
    this.lights.applyMood(m);
    this.requirePost().applyMood(m);
  }

  private applyQuality(): void {
    const q = tierSettings(this.tier);
    this.requirePost().setQuality(q);
    this.requireRes().castShadows = q.castShadows;
    if (this.ambient) this.ambient.density = q.ambientDensity;
    if (this.canvas) this.resizeToCanvas();
  }

  // ---------------------------------------------------------------- sizing

  /** Resize to the canvas' CSS box (also called by the internal ResizeObserver). */
  resizeToCanvas(): void {
    if (!this.canvas || !this.handle) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.resize(r.width || this.canvas.width, r.height || this.canvas.height, dpr);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const handle = this.requireHandle();
    const q = tierSettings(this.tier);
    const out = computeOutputSize(cssW, cssH, dpr, q.maxDpr);
    handle.renderer.setSize(out.w, out.h, false);
    this.requirePost().resize(out.w, out.h);
    this.camera.setAspect(out.w / out.h);
  }

  // ---------------------------------------------------------------- scene building helpers (used by T2.2 and the dev scene)

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }

  /** Add a lit static prop (tree, pillar...) by SpriteSource key. Returns the mesh. */
  addProp(key: string, x: number, y: number, z: number, o: PropOptions = {}): Mesh {
    const f = this.source.frames(key)[0];
    if (!f) throw new Error(`no frame for ${key}`);
    const m = makePropMesh(this.requireRes(), f, o);
    m.position.set(x, y, z);
    (o.foreground ? this.fgScene : this.scene).add(m);
    return m;
  }

  /** Frame height in world units for a prop key (scaled). */
  propHeight(key: string, scale = 1): number {
    const f = this.source.frames(key)[0];
    return f ? f.h * PX * scale : 0;
  }

  /** Flame attach-point height of a torch prop. */
  flameY(key: string): number {
    return this.source.frames(key)[0]?.flameY ?? 0;
  }

  /** Billboard actor (hero, monster, chest) from a SpriteSource key + animation. */
  addActor(key: string, anim = "idle", o: SpriteOptions = {}): SpriteActorType {
    const f = this.source.frames(key, anim)[0];
    if (!f) throw new Error(`no frame for ${key}/${anim}`);
    return new SpriteActor(this.requireRes(), this.scene, f, o);
  }

  /**
   * Pixel flame + glow quads + a flickering point light + torch embers. `color` (layout `flameColor`, linear near 1)
   * recolours the flame, its glow and its light; absent = the default torch orange (TORCH_COLOR).
   */
  addFlame(
    x: number,
    y: number,
    z: number,
    size = 0.55,
    foreground = false,
    light = true,
    color?: readonly [number, number, number],
  ): void {
    const res = this.requireRes();
    const lightCol: Vec3Tuple = color ? [color[0], color[1], color[2]] : TORCH_COLOR;
    if (color) this.torchColors.add(lightCol);
    // flame palette from the colour: saturated (pow 2.2 of c / max), so [1, 0.55, 1.1] reads violet, not white
    const m = Math.max(color?.[0] ?? 1, color?.[1] ?? 1, color?.[2] ?? 1, 0.001);
    const sat: Vec3Tuple = color
      ? [(color[0] / m) ** 2.2, (color[1] / m) ** 2.2, (color[2] / m) ** 2.2]
      : [1, 1, 1];
    const quad = res.trackGeo(new PlaneGeometry(1, 1));
    const layer = foreground ? this.fgScene : this.scene;
    const fm = res.adopt(
      fxMaterial(this.lighting, FxKind.Flame, sat, [1, 1, 1], 1, this.rng() * 100),
    );
    // uP > 0.5 selects the tinted palette in the Flame shader (0 = the original orange, untouched)
    (fm.uniforms.uP as { value: number }).value = color ? 1 : 0;
    const mesh = new Mesh(quad, fm);
    mesh.scale.set(size * 0.62, size, 1);
    mesh.position.set(x, y + size * 0.42, z + 0.02);
    mesh.renderOrder = 6;
    layer.add(mesh);
    const gm = res.adopt(
      fxMaterial(
        this.lighting,
        FxKind.Glow,
        color ? [sat[0] * 1.0, sat[1] * 1.0, sat[2] * 1.0] : [1.0, 0.45, 0.14],
        [1, 1, 1],
        0.9,
        this.rng() * 100,
      ),
    );
    const glow = new Mesh(quad, gm);
    glow.scale.set(size * 4.2, size * 4.2, 1);
    glow.position.set(x, y + size * 0.35, z - 0.03);
    glow.renderOrder = 6;
    layer.add(glow);
    const ref: FlameRef = { x, y, z, foreground };
    this.flames.push({ mesh, glow, ref, foreground });
    if (light) {
      this.lights.addStatic({
        x,
        y: y + size * 0.6,
        z: z + 0.35,
        radius: foreground ? 7 : 9.5,
        color: lightCol,
        intensity: foreground ? 1.8 : 2.3,
        scatter: foreground ? 0 : 0.009,
        flicker: true,
      });
    }
  }

  /** Tilted additive god-ray quad (forest/dusk dressing). Intensity follows the biome's `rays`. */
  addGodRay(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotZ: number,
    color: readonly [number, number, number],
    intensity: number,
  ): void {
    const res = this.requireRes();
    const m = new Mesh(
      res.trackGeo(new PlaneGeometry(1, 1)),
      res.adopt(
        fxMaterial(this.lighting, FxKind.GodRay, color, [1, 1, 1], intensity, this.rng() * 100),
      ),
    );
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.rotation.z = rotZ;
    m.renderOrder = 7;
    this.scene.add(m);
    this.rays.push({ mesh: m, base: intensity, x });
  }

  /** Glowing ground rune circle (boss hollow). `intensity` can be driven by the caller via the returned material. */
  addRuneCircle(
    x: number,
    z: number,
    size: number,
    intensity: number,
    color: readonly [number, number, number] = RUNE_COLOR,
  ): ShaderMaterial {
    const res = this.requireRes();
    const mat = res.adopt(fxMaterial(this.lighting, FxKind.Rune, color, [1, 1, 1], intensity));
    const m = new Mesh(res.trackGeo(new PlaneGeometry(1, 1)), mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(size, size, 1);
    m.position.set(x, 0.03, z);
    m.renderOrder = 2;
    this.scene.add(m);
    return mat;
  }

  addGround(width: number, depth: number, cx: number, cz: number): Mesh {
    const res = this.requireRes();
    const geo = res.trackGeo(new PlaneGeometry(width, depth).rotateX(-Math.PI / 2));
    const m = new Mesh(geo, res.adopt(groundMaterial(this.lighting)));
    m.position.set(cx, 0, cz);
    this.scene.add(m);
    return m;
  }

  /** Cave back wall / forest cliff. `edgeX` is where the cliff face starts. */
  addWall(width: number, height: number, cx: number, cy: number, cz: number, edgeX: number): Mesh {
    const res = this.requireRes();
    const mat = res.adopt(wallMaterial(this.lighting));
    (mat.uniforms.uEdgeX as { value: number }).value = edgeX;
    const m = new Mesh(res.trackGeo(new PlaneGeometry(width, height)), mat);
    m.position.set(cx, cy, cz);
    this.scene.add(m);
    return m;
  }

  /** Far backdrop strip from the SpriteSource. `followCamera` keeps it centred on the camera x. */
  addBackdrop(
    kind: BackdropKind,
    width: number,
    height: number,
    pos: readonly [number, number, number],
    tint: readonly [number, number, number],
    fogK: number,
    rep = 1,
    followCamera = false,
  ): Mesh {
    const res = this.requireRes();
    const tex = res.track(pixelTexture(this.source.backdrop(kind), true, true));
    const m = new Mesh(
      res.trackGeo(new PlaneGeometry(width, height)),
      res.adopt(backdropMaterial(this.lighting, tex, tint, fogK, rep)),
    );
    m.position.set(...pos);
    this.scene.add(m);
    if (followCamera) this.followCam.push(m);
    return m;
  }

  /**
   * Point an actor's cast shadow away from the nearest torch (falls back to a soft sun direction).
   * Ported from the POC `shadowFor`.
   */
  shadowFor(actor: SpriteActorType, x: number, z: number): void {
    const caveK = this.mood.caveK;
    let best: { x: number; z: number } | null = null;
    let bd = 1e9;
    for (const L of this.lights.staticLights) {
      if (!this.torchColors.has(L.color) || L.z > 4) continue;
      const d = Math.abs(L.x - x) + Math.abs(L.z - z) * 0.5;
      if (d < bd) {
        bd = d;
        best = L;
      }
    }
    let sx = 0.55;
    let sz = -0.75;
    let op = 0.32 * (1 - caveK);
    if (best && bd < 9) {
      const dx = x - best.x;
      const dz = z - best.z;
      const l = Math.hypot(dx, dz) + 0.6;
      const k = clamp(1 - bd / 9, 0, 1) * (0.25 + caveK * 0.75);
      sx += ((dx / l) * 1.2 - sx) * k;
      sz += ((dz / l) * 1.2 - sz) * k;
      op = Math.max(op, 0.42 * k);
    }
    actor.setShear(sx, sz, op);
  }

  /** Remove a mesh created by one of the helpers (geometry/material are released by `dispose`). */
  remove(o: Object3D): void {
    o.parent?.remove(o);
  }

  /** Forget flames/god rays whose meshes were removed from their scene (call after `remove`). */
  pruneRemoved(): void {
    const keep = <T extends { mesh: Mesh }>(a: T[]): void => {
      for (let i = a.length - 1; i >= 0; i--) if (!a[i]?.mesh.parent) a.splice(i, 1);
    };
    keep(this.flames);
    keep(this.rays);
  }

  // ---------------------------------------------------------------- per-frame

  /**
   * Advance presentation by `dt` seconds. `alpha` (0..1) is the fixed-tick interpolation factor the caller
   * may use for actors; it is stored on `this.alpha`.
   */
  update(dt: number, alpha = 0): void {
    if (!this.handle) return;
    this.lastDt = dt;
    this.alpha = alpha;
    this.time += dt;
    const post = this.requirePost();

    // biome crossfade
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / Math.max(0.01, this.fadeSec));
      this.mood = blendMood(this.fromMood, BIOMES[this.biomeId], this.fade);
      this.applyMood(this.mood);
    }
    const m = this.mood;

    this.camera.update(dt, this.time);
    const cam = this.camera;
    const x = cam.pose.x;
    this.lighting.uCam.value.copy(cam.camera.position);
    this.lighting.uTime.value = this.time;

    // camera-driven post effects
    const e = post.effects;
    e.ca = cam.caAmount;
    e.zoom = cam.zoomAmount;
    e.zoomCenter.set(cam.zoomCenter.x, cam.zoomCenter.y);
    post.setFocus(cam.pose.dist, this.focusY);

    for (const o of this.followCam) o.position.x = x;
    for (const r of this.rays) {
      (r.mesh.material as ShaderMaterial).uniforms.uI!.value =
        r.base * m.rays * (0.8 + 0.2 * Math.sin(this.time * 0.5 + r.x));
    }
    if (this.fillLight) {
      this.fillLight.x = x - 1;
      this.fillLight.y = 3.2;
      this.fillLight.z = 5.5;
      this.fillLight.intensity = m.fill;
    }
    this.lights.update(dt, x, this.time);

    for (const f of this.flames) {
      const d = Math.abs(f.ref.x - x);
      f.glow.visible = d < 20 && post.fx;
      (f.glow.material as ShaderMaterial).uniforms.uI!.value =
        0.7 + 0.15 * Math.sin(this.time * 11 + f.ref.x) + 0.1 * Math.sin(this.time * 23 + f.ref.x);
    }

    // heat haze above the nearest background torch
    const H = e.heat;
    const slot = H[3];
    if (slot) {
      slot.set(0, 0, 0, 0);
      for (const f of this.flames) {
        if (!f.foreground && Math.abs(f.ref.x - x) < 5) {
          this.camera.project(f.ref.x, f.ref.y + 0.6, f.ref.z, this.tmp);
          slot.set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, 0.035, 0.35);
          break;
        }
      }
    }

    if (this.ambient && this.ambientPa && this.ambientPb) {
      this.ambient.update(
        dt,
        x,
        m,
        this.flames.map((f) => f.ref),
        this.time,
      );
      this.ambientPa.update(dt);
      this.ambientPb.update(dt);
    }
  }

  /** Pre-simulate ambient particles so a still frame already has embers/pollen in the air. */
  warmUpAmbient(seconds = 3): void {
    if (!this.ambient || !this.ambientPa || !this.ambientPb) return;
    this.ambient.warmUp(
      seconds,
      this.camera.pose.x,
      this.mood,
      this.flames.map((f) => f.ref),
    );
  }

  render(): void {
    if (!this.handle || this.contextLost || this.disposed) return;
    this.ambientPa?.upload();
    this.ambientPb?.upload();
    this.clear.setRGB(this.mood.clear[0], this.mood.clear[1], this.mood.clear[2]);
    this.requirePost().render(
      this.lastDt,
      this.scene,
      this.fgScene,
      this.camera.camera,
      this.clear,
    );
  }

  // ---------------------------------------------------------------- teardown

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.ambientPa?.dispose();
    this.ambientPb?.dispose();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    const disposeTree = (root: Scene): void => {
      root.traverse((obj) => {
        const mesh = obj as Mesh;
        const mat = mesh.material as Material | Material[] | undefined;
        if (Array.isArray(mat)) for (const mm of mat) mm.dispose();
        else mat?.dispose();
      });
      root.clear();
    };
    disposeTree(this.scene);
    disposeTree(this.fgScene);
    this.res?.dispose();
    this.post?.dispose();
    this.source.dispose?.();
    this.handle?.dispose();
    this.handle = null;
    this.res = null;
    this.post = null;
  }
}

type PostPipelineRef = PostPipeline;

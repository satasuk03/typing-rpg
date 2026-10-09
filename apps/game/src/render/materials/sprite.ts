import {
  type BufferGeometry,
  DoubleSide,
  Mesh,
  NearestFilter,
  NoColorSpace,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  type Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from "three";
import type { LightingUniforms } from "../lighting";
import { normalMapCanvas } from "../sprites/normalMap";
import type { SpriteFrame } from "../sprites/SpriteSource";
import { clamp, PX } from "../util";
import { GLSL_COMMON, VS_WORLD } from "./glsl";

/** Pixel-art texture: nearest sampling, no mips. `srgb` for colour data, false for normal/data maps. */
export function pixelTexture(src: TexImageSource, srgb = true, repeatX = false): Texture {
  const t = new Texture(src as unknown as HTMLCanvasElement);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  if (repeatX) t.wrapS = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Cave hero lift: albedo-lit fill and outline rim, both x uCaveRim (0.6) x caveK. */
const CAVE_FILL = "0.4";
const CAVE_RIM = "0.3";

const FS_SPRITE = /* glsl */ `
${GLSL_COMMON}
#define CAVE_FILL ${CAVE_FILL}
#define CAVE_RIM ${CAVE_RIM}
uniform sampler2D map, nmap, emap; uniform vec2 uTexSize; uniform vec3 uTint, uFlashCol, uEdgeCol, uRimFlashCol;
uniform float uFlash, uDissolve, uEmis, uRim, uWrap, uDark, uGhost, uRimFlash, uLumCap, uCaveRim, uCaveK;
uniform vec3 uHiTint;
varying vec2 vUv; varying vec3 vWP;
void main(){
  vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard;
  vec2 tp = floor(vUv * uTexSize);
  float edge = 0.0;
  if (uDissolve > 0.0) {
    float n = hash12(tp * 1.37) * 0.55 + (vUv.y) * 0.45;
    float th = 1.0 - uDissolve * 1.12;
    if (n > th + 0.0 && uDissolve > 0.0) { if (n > th + 0.12) discard; edge = 1.0; }
  }
  vec3 nn = texture2D(nmap, vUv).xyz * 2.0 - 1.0;
  vec3 L = lightAt(vWP, normalize(nn), uWrap, uRim);
  vec3 col = c.rgb * uTint * L * (1.0 - uDark);
  // cave rim lift (hero only, T6.3 #4): in a dark cave the lit sprite sits on a dark ground at ~1.5:1 luminance. A fill
  // that scales with caveK keeps the body off the floor, and the outline pixels take the mood hi tint (an orange
  // torch rim in the L8 cave, violet in the L10 hollow). 0 in the forest (caveK 0) and for every non-hero sprite.
  float caveLift = uCaveRim * uCaveK;
  vec3 rimTint = mix(uHiTint / max(max(uHiTint.r, uHiTint.g), max(uHiTint.b, 1e-3)), vec3(1.0), 0.35);
  col += c.rgb * uTint * rimTint * (CAVE_FILL * caveLift);
  col += texture2D(emap, vUv).rgb * uEmis;
  // hit flash: on the bright forest a full white sprite (plus bloom) is a 100 px glare blob, so the flash is weaker and
  // a little dimmer there; in the cave (caveK 1) it is unchanged
  col = mix(col, uFlashCol * mix(0.8, 1.0, uCaveK), uFlash * mix(0.55, 1.0, uCaveK));
  col += edge * uEdgeCol;
  col = applyFog(col, vWP);
  if (uRimFlash > 0.0 || caveLift > 0.0) {
    // silhouette outline pixels (rim flash from the typing VFX, and the cave rim light)
    vec2 px = 1.0 / uTexSize;
    float nb = min(min(texture2D(map, vUv + vec2(px.x, 0.0)).a, texture2D(map, vUv - vec2(px.x, 0.0)).a),
                   min(texture2D(map, vUv + vec2(0.0, px.y)).a, texture2D(map, vUv - vec2(0.0, px.y)).a));
    float rimPx = nb < 0.5 ? 1.0 : 0.0;
    col += rimTint * (CAVE_RIM * caveLift * rimPx);
    col = mix(col, uRimFlashCol, uRimFlash * rimPx);
  }
  // hard luminance cap (hero while typing FX are up): the silhouette never washes out
  float lm = max(col.r, max(col.g, col.b));
  if (lm > uLumCap) col *= uLumCap / lm;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface SpriteMaterialOptions {
  tint?: readonly [number, number, number];
  /** Emissive layer strength. */
  emis?: number;
  /** Rim light strength. */
  rim?: number;
  /** Wrap lighting (soft terminator). */
  wrap?: number;
  /** Cave rim light strength (the hero uses 0.6): scales with the mood's caveK, tinted by its `hi`. */
  caveRim?: number;
  /** 0..1 darkening (foreground silhouettes). */
  dark?: number;
}

export interface SpriteOptions extends SpriteMaterialOptions {
  scale?: number;
  /** Render into this scene instead of the main one (e.g. the blurred foreground layer). */
  layer?: Scene;
  shadow?: boolean;
  blobW?: number;
}

interface GpuFrame {
  tex: Texture;
  ntex: Texture;
  etex: Texture;
  derived: Texture[];
  geos: Map<number, PlaneGeometry>;
}

/**
 * GPU-side cache for sprite frames and the shared sprite/shadow shaders.
 * Owns every texture, geometry and material it creates and releases them in `dispose()`.
 */
export class SpriteResources {
  readonly black: Texture;
  readonly blobGeo: PlaneGeometry;
  /** When false, cast-shadow silhouettes are hidden (quality tier 2). */
  castShadows = true;
  private readonly frames = new Map<SpriteFrame, GpuFrame>();
  private readonly mats = new Set<ShaderMaterial>();
  private readonly propMats = new Map<string, ShaderMaterial>();
  private readonly frameIds = new WeakMap<SpriteFrame, number>();
  private nextId = 1;
  private readonly textures = new Set<Texture>();
  private readonly geometries = new Set<BufferGeometry>();

  constructor(readonly uniforms: LightingUniforms) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1, 1);
    }
    this.black = this.track(pixelTexture(c, false));
    this.blobGeo = this.trackGeo(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  }

  track(t: Texture): Texture {
    this.textures.add(t);
    return t;
  }

  trackGeo<G extends BufferGeometry>(g: G): G {
    this.geometries.add(g);
    return g;
  }

  gpu(f: SpriteFrame): GpuFrame {
    let g = this.frames.get(f);
    if (!g) {
      const tex = this.track(pixelTexture(f.img, true));
      const normalSrc =
        f.normal ??
        normalMapCanvas(
          f.img as CanvasImageSource & { width: number; height: number },
          f.bulge ?? 1,
        );
      const ntex = this.track(pixelTexture(normalSrc, false));
      const etex = f.glow ? this.track(pixelTexture(f.glow, true)) : this.black;
      g = { tex, ntex, etex, derived: [], geos: new Map() };
      this.frames.set(f, g);
    }
    return g;
  }

  /** Plane whose origin is the sprite's foot anchor. `s` scales it. */
  geometry(f: SpriteFrame, s = 1): PlaneGeometry {
    const g = this.gpu(f);
    let geo = g.geos.get(s);
    if (!geo) {
      geo = this.trackGeo(new PlaneGeometry(f.w * PX * s, f.h * PX * s));
      geo.translate((f.w / 2 - f.ax) * PX * s, (f.ay - f.h / 2) * PX * s, 0);
      g.geos.set(s, geo);
    }
    return geo;
  }

  private mat<M extends ShaderMaterial>(m: M): M {
    this.mats.add(m);
    return m;
  }

  /** Lit pixel-billboard material: normal map + wrap light + rim + emissive, fogged. */
  spriteMaterial(o: SpriteMaterialOptions & { frame?: SpriteFrame } = {}): ShaderMaterial {
    const g = o.frame ? this.gpu(o.frame) : null;
    const tint = o.tint ?? [1, 1, 1];
    return this.mat(
      new ShaderMaterial({
        uniforms: {
          ...this.uniforms,
          map: { value: g?.tex ?? this.black },
          nmap: { value: g?.ntex ?? this.black },
          emap: { value: g?.etex ?? this.black },
          uTexSize: { value: new Vector2(o.frame?.w ?? 16, o.frame?.h ?? 16) },
          uTint: { value: new Vector3(...tint) },
          uFlashCol: { value: new Vector3(1.25, 1.2, 1.1) },
          uEdgeCol: { value: new Vector3(4, 2.2, 0.8) },
          uFlash: { value: 0 },
          uDissolve: { value: 0 },
          uEmis: { value: o.emis ?? 2.2 },
          uRim: { value: o.rim ?? 1.1 },
          uWrap: { value: o.wrap ?? 0.45 },
          uDark: { value: o.dark ?? 0 },
          uGhost: { value: 0 },
          uRimFlash: { value: 0 },
          uRimFlashCol: { value: new Vector3(1.6, 1.6, 1.6) },
          uLumCap: { value: 1e3 },
          uCaveRim: { value: o.caveRim ?? 0 },
        },
        vertexShader: VS_WORLD,
        fragmentShader: FS_SPRITE,
        side: DoubleSide,
      }),
    );
  }

  /** Cached material for static props (shared between all meshes with the same frame + options). */
  propMaterial(f: SpriteFrame, o: SpriteMaterialOptions = {}): ShaderMaterial {
    let id = this.frameIds.get(f);
    if (id === undefined) {
      id = this.nextId++;
      this.frameIds.set(f, id);
    }
    const key = `${id}|${o.tint?.join(",") ?? ""}|${o.emis ?? ""}|${o.rim ?? ""}|${o.wrap ?? ""}|${o.dark ?? ""}`;
    let m = this.propMats.get(key);
    if (!m) {
      m = this.spriteMaterial({
        frame: f,
        emis: o.emis ?? 1.6,
        rim: o.rim ?? 0.8,
        wrap: o.wrap ?? 0.5,
        ...(o.tint ? { tint: o.tint } : {}),
        ...(o.dark !== undefined ? { dark: o.dark } : {}),
      });
      this.propMats.set(key, m);
    }
    return m;
  }

  /** Sprite silhouette sheared onto the ground (cast shadow). */
  castMaterial(f: SpriteFrame | null): ShaderMaterial {
    return this.mat(
      new ShaderMaterial({
        uniforms: {
          map: { value: f ? this.gpu(f).tex : this.black },
          uBase: { value: new Vector3() },
          uShear: { value: new Vector2(0.5, -0.6) },
          uOp: { value: 0.4 },
        },
        vertexShader: `uniform vec3 uBase; uniform vec2 uShear; varying vec2 vUv; varying float vH;
    void main(){ vUv = uv; vec3 p = position; vH = p.y; vec3 w = uBase + vec3(p.x + p.y * uShear.x, 0.025, p.y * uShear.y); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
        fragmentShader: `uniform sampler2D map; uniform float uOp; varying vec2 vUv; varying float vH;
    void main(){ if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(0.02, 0.01, 0.03, uOp * clamp(1.0 - vH * 0.22, 0.25, 1.0)); }`,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
  }

  /** Soft blob shadow decal. */
  blobMaterial(): ShaderMaterial {
    return this.mat(
      new ShaderMaterial({
        uniforms: { uOp: { value: 0.55 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uOp; varying vec2 vUv; void main(){ float r = length((vUv - 0.5) * 2.0); float a = smoothstep(1.0, 0.15, r); gl_FragColor = vec4(0.015, 0.01, 0.02, a * a * uOp); }`,
        transparent: true,
        depthWrite: false,
      }),
    );
  }

  /** Register an externally created material so `dispose()` releases it. */
  adopt<M extends ShaderMaterial>(m: M): M {
    return this.mat(m);
  }

  disposeMaterial(m: ShaderMaterial): void {
    this.mats.delete(m);
    m.dispose();
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.mats.clear();
    this.propMats.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries.clear();
    for (const t of this.textures) t.dispose();
    this.textures.clear();
    this.frames.clear();
  }
}

/**
 * A billboard actor (hero, monster, chest): lit sprite + blob shadow + sheared cast shadow.
 * Pure presentation: the caller feeds it positions and frames; it owns no game state.
 */
export class SpriteActor {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly blob: Mesh | null = null;
  private readonly cast: Mesh | null = null;
  private readonly blobW: number;
  private frame: SpriteFrame | null = null;
  private readonly scale: number;
  private readonly parent: Object3D;
  private readonly shadowParent: Object3D;
  private shown = true;

  constructor(
    private readonly res: SpriteResources,
    scene: Scene,
    f: SpriteFrame,
    o: SpriteOptions = {},
  ) {
    this.scale = o.scale ?? 1;
    this.material = res.spriteMaterial(o);
    this.parent = o.layer ?? scene;
    this.shadowParent = scene;
    this.mesh = new Mesh(res.geometry(f, this.scale), this.material);
    this.mesh.frustumCulled = false;
    this.parent.add(this.mesh);
    this.blobW = o.blobW ?? f.w * PX * this.scale * 0.7;
    if (o.shadow !== false) {
      this.blob = new Mesh(res.blobGeo, res.blobMaterial());
      this.blob.renderOrder = 1;
      scene.add(this.blob);
      this.cast = new Mesh(res.geometry(f, this.scale), res.castMaterial(f));
      this.cast.frustumCulled = false;
      this.cast.renderOrder = 1;
      scene.add(this.cast);
    }
    this.setFrame(f);
  }

  setFrame(f: SpriteFrame): void {
    if (this.frame === f) return;
    this.frame = f;
    const g = this.res.gpu(f);
    this.mesh.geometry = this.res.geometry(f, this.scale);
    const u = this.material.uniforms;
    (u.map as { value: Texture }).value = g.tex;
    (u.nmap as { value: Texture }).value = g.ntex;
    (u.emap as { value: Texture }).value = g.etex;
    (u.uTexSize as { value: Vector2 }).value.set(f.w, f.h);
    if (this.cast) {
      this.cast.geometry = this.mesh.geometry;
      ((this.cast.material as ShaderMaterial).uniforms.map as { value: Texture }).value = g.tex;
    }
  }

  /** Place the foot anchor at (x, y, z); `groundY` is the floor height under the actor. */
  place(x: number, y: number, z: number, groundY = 0): void {
    this.mesh.position.set(x, y, z);
    if (!this.blob || !this.cast) return;
    const hgt = Math.max(0, y - groundY);
    const k = 1 / (1 + hgt * 0.5);
    this.blob.position.set(x, groundY + 0.02, z + 0.05);
    this.blob.scale.set(this.blobW * (0.7 + 0.3 * k), 1, this.blobW * 0.42 * (0.7 + 0.3 * k));
    ((this.blob.material as ShaderMaterial).uniforms.uOp as { value: number }).value = 0.6 * k;
    const cu = (this.cast.material as ShaderMaterial).uniforms;
    (cu.uBase as { value: Vector3 }).value.set(x, groundY, z);
    this.cast.visible = this.shown && this.res.castShadows && hgt < 0.3;
  }

  /** Direction/opacity of the cast shadow (away from the dominant light). */
  setShear(sx: number, sz: number, op: number): void {
    if (!this.cast) return;
    const u = (this.cast.material as ShaderMaterial).uniforms;
    (u.uShear as { value: Vector2 }).value.set(sx, sz);
    (u.uOp as { value: number }).value = op;
  }

  /** Hit flash / dissolve / tint hooks for the VFX layer. */
  setFlash(amount: number, color?: readonly [number, number, number]): void {
    const u = this.material.uniforms;
    (u.uFlash as { value: number }).value = amount;
    if (color) (u.uFlashCol as { value: Vector3 }).value.set(...color);
  }

  /** Outline-only flash: lights the silhouette's edge pixels (never the body). */
  setRimFlash(amount: number, color?: readonly [number, number, number]): void {
    const u = this.material.uniforms;
    (u.uRimFlash as { value: number }).value = amount;
    if (color) (u.uRimFlashCol as { value: Vector3 }).value.set(...color);
  }

  /** Hard cap on the sprite's final HDR brightness (1e3 = off). Keeps a hero legible under strong light FX. */
  setLumCap(cap: number): void {
    (this.material.uniforms.uLumCap as { value: number }).value = cap;
  }

  setDissolve(v: number): void {
    (this.material.uniforms.uDissolve as { value: number }).value = clamp(v, 0, 1);
  }

  get visible(): boolean {
    return this.shown;
  }

  set visible(v: boolean) {
    this.shown = v;
    this.mesh.visible = v;
    if (this.blob) this.blob.visible = v;
    if (this.cast) this.cast.visible = v && this.res.castShadows;
  }

  /** World-space height of the sprite (for placing plates above it). */
  get height(): number {
    return (this.frame?.h ?? 0) * PX * this.scale;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.res.disposeMaterial(this.material);
    if (this.blob) {
      this.shadowParent.remove(this.blob);
      this.res.disposeMaterial(this.blob.material as ShaderMaterial);
    }
    if (this.cast) {
      this.shadowParent.remove(this.cast);
      this.res.disposeMaterial(this.cast.material as ShaderMaterial);
    }
  }
}

/** Static prop mesh (tree, pillar, torch post...). Geometry/material/texture are cache-owned. */
export function makePropMesh(
  res: SpriteResources,
  f: SpriteFrame,
  o: SpriteMaterialOptions & { scale?: number; flip?: boolean } = {},
): Mesh {
  const m = new Mesh(res.geometry(f, o.scale ?? 1), res.propMaterial(f, o));
  if (o.flip) m.scale.x = -1;
  return m;
}

/**
 * Planar still-water reflection by MIRRORED BILLBOARDS (T2.2, brief section 4). A billboard standing on a horizontal plane
 * reflects as the same billboard mirrored about y = 0, so no render-to-texture is needed: every prop / actor near the water
 * gets a twin (same geometry, `scale.y = -1`, `position.y = -y`) under the waterline. The `fen` ground discards where the
 * water is, so the twins show only through the pools; the surface (alpha-blended, water.ts) draws over them.
 *
 * Budget (brief hard caps): at most `MAX_TWINS` visible twins in the camX +- 22 window (the window shrinks if more would
 * qualify), twins share the source geometry, ONE material per source prop material (cached), actors get one each, and
 * `update` allocates nothing.
 *
 * Tiers (`QualitySettings.waterReflect`): 0 = props + actors, 1 = props only, 2 = no twins, no sky card, opaque matte bog.
 */
import {
  type BufferGeometry,
  Mesh,
  type PlaneGeometry,
  type Scene,
  type ShaderMaterial,
} from "three";
import type { LightingUniforms } from "../lighting";
import { reflectionMaterial, skyCardMaterial, waterSurfaceMaterial } from "./water";

/** Mirrored-mesh cap (brief 4: <= 60 in the camX +- 22 window). */
export const MAX_TWINS = 60;
/** Half-width of the reflection window around the camera x (m). */
export const REFLECT_WINDOW = 22;
/** Props / actors whose base is further than this from the water plane are not mirrored (hanging lanterns, moss). */
const MAX_BASE_Y = 1.5;
const PROP_TINT = 0.62;
const ACTOR_TINT = 0.7;

interface Twin {
  src: Mesh;
  twin: Mesh;
  actor: boolean;
}

export class WaterReflections {
  readonly surface: Mesh;
  readonly surfaceMat: ShaderMaterial;
  readonly skyCard: Mesh;
  private readonly twins: Twin[] = [];
  private readonly propMats = new Map<ShaderMaterial, ShaderMaterial>();
  private readonly known = new Set<Mesh>();
  private tier: 0 | 1 | 2 = 0;

  constructor(
    private readonly scene: Scene,
    lighting: LightingUniforms,
    geometry: BufferGeometry,
    quad: PlaneGeometry,
    pos: readonly [number, number, number],
    fogCol: readonly [number, number, number],
    /** Registers a material with the owner's disposal list (`SpriteResources.adopt`). */
    private readonly adopt: <M extends ShaderMaterial>(m: M) => M,
  ) {
    this.surfaceMat = adopt(waterSurfaceMaterial(lighting));
    this.surface = new Mesh(geometry, this.surfaceMat);
    this.surface.position.set(pos[0], 0, pos[2]);
    scene.add(this.surface);
    const skyMat = adopt(skyCardMaterial(fogCol));
    this.skyCard = new Mesh(quad, skyMat);
    this.skyCard.scale.set(260, 60, 1);
    this.skyCard.position.set(pos[0], -30, -40);
    scene.add(this.skyCard);
  }

  /** Re-tint the sky card when the mood changes. */
  setFogColor(fogCol: readonly [number, number, number]): void {
    const c = (this.skyCard.material as ShaderMaterial).uniforms.uC?.value as
      | { set(x: number, y: number, z: number): void }
      | undefined;
    c?.set(fogCol[0] * 0.5, fogCol[1] * 0.55, fogCol[2] * 0.6);
  }

  /** Register a prop mesh (static) or an actor mesh (its transform / geometry / visibility are re-read every frame). */
  add(src: Mesh, actor: boolean): void {
    if (this.known.has(src)) return;
    const sm = src.material as ShaderMaterial;
    if (!sm.uniforms || !sm.fragmentShader) return;
    this.known.add(src);
    let mat: ShaderMaterial | undefined = actor ? undefined : this.propMats.get(sm);
    if (!mat) {
      const k = actor ? ACTOR_TINT : PROP_TINT;
      const t = sm.uniforms.uTint?.value as { x: number; y: number; z: number } | undefined;
      mat = this.adopt(
        reflectionMaterial(sm, [k * (t?.x ?? 1), k * 1.04 * (t?.y ?? 1), k * 1.06 * (t?.z ?? 1)]),
      );
      if (!actor) this.propMats.set(sm, mat);
    }
    const twin = new Mesh(src.geometry, mat);
    twin.frustumCulled = false;
    twin.visible = false;
    this.scene.add(twin);
    this.twins.push({ src, twin, actor });
  }

  get count(): number {
    return this.twins.length;
  }

  /** Number of twins visible after the last `update` (<= MAX_TWINS). */
  visibleCount = 0;

  setTier(tier: 0 | 1 | 2): void {
    this.tier = tier;
    const matte = tier >= 2;
    const u = this.surfaceMat.uniforms.uWaterTier;
    if (u) u.value = tier;
    this.surfaceMat.transparent = !matte;
    this.skyCard.visible = !matte;
  }

  get waterTier(): 0 | 1 | 2 {
    return this.tier;
  }

  update(camX: number): void {
    this.skyCard.position.x = camX;
    let n = 0;
    if (this.tier < 2) {
      // shrink the window until at most MAX_TWINS qualify (a typical fen battle is far below the cap: one pass)
      let win = REFLECT_WINDOW;
      for (let iter = 0; iter < 12; iter++) {
        n = 0;
        for (const t of this.twins) if (this.eligible(t, camX, win)) n++;
        if (n <= MAX_TWINS) break;
        win -= 2;
      }
      for (const t of this.twins) {
        const on = this.eligible(t, camX, win);
        const tw = t.twin;
        tw.visible = on;
        if (!on) continue;
        const s = t.src;
        if (tw.geometry !== s.geometry) tw.geometry = s.geometry;
        tw.position.set(s.position.x, -s.position.y, s.position.z);
        tw.scale.set(s.scale.x, -s.scale.y, 1);
      }
    } else {
      for (const t of this.twins) t.twin.visible = false;
    }
    this.visibleCount = n;
  }

  private eligible(t: Twin, camX: number, win: number): boolean {
    const s = t.src;
    if (!s.parent || !s.visible) return false;
    if (t.actor && this.tier !== 0) return false;
    if (Math.abs(s.position.x - camX) > win) return false;
    return s.position.y < MAX_BASE_Y && s.position.y > -MAX_BASE_Y;
  }
}

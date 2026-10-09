import { Mesh, PlaneGeometry, type ShaderMaterial, type Vector3 } from "three";
import { type FxKindId, fxMaterial } from "../materials/fx";
import { HERO_DAMP } from "../materials/heroGuard";
import type { RenderWorld } from "../RenderWorld";

/**
 * One additive fx quad (Glow, Star, Ring, Beam, GodRay, Rune...) with cheap setters. The typing VFX
 * create a fixed set of these once (spec §10.2: 14 meshes toggled by `visible`) and drive them.
 */
export class FxQuad {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  private readonly col: Vector3;
  private readonly col2: Vector3;
  private readonly geo: PlaneGeometry;

  constructor(
    private readonly world: RenderWorld,
    kind: FxKindId,
    renderOrder = 7,
    seed = 0,
  ) {
    this.geo = new PlaneGeometry(1, 1);
    this.mat = fxMaterial(world.lighting, kind, [1, 1, 1], [1, 1, 1], 0, seed, HERO_DAMP);
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.col = this.mat.uniforms.uColor?.value as Vector3;
    this.col2 = this.mat.uniforms.uColor2?.value as Vector3;
    world.scene.add(this.mesh);
  }

  color(r: number, g: number, b: number): this {
    this.col.set(r, g, b);
    return this;
  }
  color2(r: number, g: number, b: number): this {
    this.col2.set(r, g, b);
    return this;
  }
  /** Intensity (`uI`); the quad is hidden at <= 0. */
  intensity(v: number): this {
    (this.mat.uniforms.uI as { value: number }).value = v;
    this.mesh.visible = v > 0.002;
    return this;
  }
  /** Progress uniform (`uP`) used by Ring / Guard. */
  progress(v: number): this {
    (this.mat.uniforms.uP as { value: number }).value = v;
    return this;
  }
  at(x: number, y: number, z: number): this {
    this.mesh.position.set(x, y, z);
    return this;
  }
  size(w: number, h: number = w): this {
    this.mesh.scale.set(w, h, 1);
    return this;
  }
  get visible(): boolean {
    return this.mesh.visible;
  }

  dispose(): void {
    this.world.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

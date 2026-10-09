/**
 * Ghosts: the POC's hero afterimages (a tinted additive copy of the current sprite frame that fades over ~0.3 s),
 * pooled. The geometry and texture come from the shared `SpriteResources` cache, so spawning one only swaps two
 * references and sets four uniforms.
 */
import {
  AddEquation,
  CustomBlending,
  Mesh,
  OneFactor,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
  Vector3,
  ZeroFactor,
} from "three";
import type { RenderWorld } from "../../RenderWorld";
import type { SpriteFrame } from "../../sprites/SpriteSource";
import type { Rgb } from "./params";

const VS =
  "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const FS = `uniform sampler2D map; uniform vec3 uCol; uniform float uA; varying vec2 vUv;
void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(uCol * uA * (0.15 + c.rgb * 0.8), 1.0); }`;

interface Slot {
  mesh: Mesh;
  mat: ShaderMaterial;
  on: boolean;
  t: number;
  life: number;
  a: number;
}

export class Ghosts {
  private readonly slots: Slot[] = [];
  private readonly placeholder: PlaneGeometry;
  private next = 0;

  constructor(
    private readonly world: RenderWorld,
    n = 8,
  ) {
    this.placeholder = new PlaneGeometry(1, 1);
    for (let i = 0; i < n; i++) {
      const mat = new ShaderMaterial({
        uniforms: {
          map: { value: world.sprites.black as Texture },
          uCol: { value: new Vector3() },
          uA: { value: 1 },
        },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
      });
      const mesh = new Mesh(this.placeholder, mat);
      mesh.renderOrder = 7;
      mesh.frustumCulled = false;
      mesh.visible = false;
      world.scene.add(mesh);
      this.slots.push({ mesh, mat, on: false, t: 0, life: 0.28, a: 0.5 });
    }
  }

  get live(): number {
    let n = 0;
    for (const s of this.slots) if (s.on) n++;
    return n;
  }

  /** Drop a ghost of `f` at the actor's foot position. `gain` scales the opacity (intensity, reduced flash). */
  spawn(
    f: SpriteFrame,
    x: number,
    y: number,
    z: number,
    col: Rgb,
    life: number,
    gain: number,
  ): void {
    let s = this.slots[this.next] as Slot;
    for (let i = 0; i < this.slots.length; i++) {
      const c = this.slots[(this.next + i) % this.slots.length] as Slot;
      if (!c.on) {
        s = c;
        break;
      }
    }
    this.next = (this.next + 1) % this.slots.length;
    s.on = true;
    s.t = 0;
    s.life = life;
    s.a = 0.5 * gain;
    s.mesh.geometry = this.world.sprites.geometry(f, 1);
    (s.mat.uniforms.map as { value: Texture }).value = this.world.sprites.gpu(f).tex;
    (s.mat.uniforms.uCol as { value: Vector3 }).value.set(col[0], col[1], col[2]);
    s.mesh.position.set(x, y, z - 0.05);
    s.mesh.visible = true;
  }

  /** @hot */
  update(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      if (!s.on) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.on = false;
        s.mesh.visible = false;
        continue;
      }
      (s.mat.uniforms.uA as { value: number }).value = (1 - k) * (1 - k) * s.a;
    }
  }

  clear(): void {
    for (const s of this.slots) {
      s.on = false;
      s.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      this.world.scene.remove(s.mesh);
      s.mat.dispose();
    }
    this.placeholder.dispose();
  }
}

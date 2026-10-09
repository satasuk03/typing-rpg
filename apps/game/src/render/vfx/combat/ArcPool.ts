/**
 * ArcPool: the POC's slash-arc ribbon (a 64-segment strip bent along an arc by the vertex shader, with a head and a
 * tail sweep and a banded white-hot core), pooled: N meshes and materials built once, reused round-robin.
 * An arc may also travel (`vx`), which is how the Slash Wave crosses the stage.
 */
import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  Mesh,
  OneFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
} from "three";
import { GLSL_HERO_INSIDE, HERO_NDC } from "../../materials/heroGuard";
import type { RenderWorld } from "../../RenderWorld";
import { eIn2, eOut3, type Rgb } from "./params";

/** Light left of an arc over the hero's body box: a slash may cross the hero but never covers the sprite. */
const ARC_HERO_DAMP = 0.45;

const VS = /* glsl */ `uniform float uR, uW, uA0, uSweep; varying vec2 vUv; varying vec2 vNdc;
void main(){ float u = uv.x, v = uv.y; float ang = uA0 + u * uSweep; float tp = pow(sin(clamp(u, 0.0, 1.0) * 3.14159), 0.55);
  float r = uR + (v - 0.5) * uW * tp; vec3 p = vec3(cos(ang) * r, sin(ang) * r, 0.0); vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); vNdc = gl_Position.xy / gl_Position.w; }`;
const FS = /* glsl */ `${GLSL_HERO_INSIDE}
uniform float uHead, uTail, uI; uniform vec3 uCore, uEdge; varying vec2 vUv; varying vec2 vNdc;
void main(){ float u = vUv.x; if (u > uHead || u < uTail) discard;
  float k = (u - uTail) / max(uHead - uTail, 1e-3); k = floor(k * 14.0) / 14.0;
  float across = vUv.y; float core = smoothstep(0.62, 0.95, across); float body = smoothstep(0.0, 0.85, across);
  vec3 col = (uEdge * body * (0.35 + 0.65 * k) + uCore * core * k * k) * uI;
  col *= 1.0 - (1.0 - ${ARC_HERO_DAMP.toFixed(2)}) * heroInside(vNdc);
  gl_FragColor = vec4(col, 1.0); }`;

interface Slot {
  mesh: Mesh;
  mat: ShaderMaterial;
  on: boolean;
  t: number;
  dur: number;
  tail: number;
  r: number;
  grow: number;
  vx: number;
  delay: number;
}

export interface ArcOpts {
  r: number;
  w: number;
  a0: number;
  sweep: number;
  rx: number;
  ry: number;
  rz: number;
  dur: number;
  tail: number;
  intensity: number;
  /** World units per second along x (0 = stays). */
  vx?: number;
  /** Seconds before the arc starts drawing (multi-hit combos). */
  delay?: number;
}

export class ArcPool {
  private readonly slots: Slot[] = [];
  private readonly geo = new PlaneGeometry(1, 1, 64, 1);
  private next = 0;

  constructor(
    private readonly world: RenderWorld,
    n = 8,
  ) {
    for (let i = 0; i < n; i++) {
      const mat = new ShaderMaterial({
        uniforms: {
          uR: { value: 1.6 },
          uW: { value: 0.5 },
          uA0: { value: 0 },
          uSweep: { value: 2.6 },
          uHead: { value: 0 },
          uTail: { value: 0 },
          uCore: { value: new Vector3(6, 6, 6) },
          uEdge: { value: new Vector3(3, 1.2, 0.3) },
          uI: { value: 1 },
          uHero: HERO_NDC,
        },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
        side: DoubleSide,
      });
      const mesh = new Mesh(this.geo, mat);
      mesh.renderOrder = 9;
      mesh.frustumCulled = false;
      mesh.visible = false;
      world.scene.add(mesh);
      this.slots.push({
        mesh,
        mat,
        on: false,
        t: 0,
        dur: 0.08,
        tail: 0.24,
        r: 1,
        grow: 0.35,
        vx: 0,
        delay: 0,
      });
    }
  }

  get live(): number {
    let n = 0;
    for (const s of this.slots) if (s.on) n++;
    return n;
  }

  /** Biome glare scale (1 cave .. lower on bright worlds), set by the kit each frame. */
  gain = 1;

  fire(x: number, y: number, z: number, o: ArcOpts, core: Rgb, edge: Rgb): void {
    // reuse a free slot, else steal the oldest in round-robin order
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
    s.t = -(o.delay ?? 0);
    s.dur = o.dur;
    s.tail = o.tail;
    s.r = o.r;
    s.vx = o.vx ?? 0;
    const u = s.mat.uniforms;
    (u.uR as { value: number }).value = o.r;
    (u.uW as { value: number }).value = o.w;
    (u.uA0 as { value: number }).value = o.a0;
    (u.uSweep as { value: number }).value = o.sweep;
    (u.uHead as { value: number }).value = 0;
    (u.uTail as { value: number }).value = 0;
    (u.uI as { value: number }).value = o.intensity * this.gain;
    (u.uCore as { value: Vector3 }).value.set(core[0], core[1], core[2]);
    (u.uEdge as { value: Vector3 }).value.set(edge[0], edge[1], edge[2]);
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(o.rx, o.ry, o.rz);
    s.mesh.visible = false; // shown once its delay has run out
  }

  /** @hot */
  update(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as Slot;
      if (!s.on) continue;
      s.t += dt;
      if (s.t < 0) continue;
      s.mesh.visible = true;
      const u = s.mat.uniforms;
      (u.uHead as { value: number }).value = eOut3(s.t / s.dur) * 1.01;
      (u.uTail as { value: number }).value =
        s.t < s.dur * 0.6 ? 0 : eIn2((s.t - s.dur * 0.6) / s.tail) * 1.02;
      (u.uR as { value: number }).value = s.r * (1 + s.t * s.grow);
      if (s.vx) s.mesh.position.x += s.vx * dt;
      if ((u.uTail as { value: number }).value >= 1) {
        s.on = false;
        s.mesh.visible = false;
      }
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
    this.geo.dispose();
  }
}

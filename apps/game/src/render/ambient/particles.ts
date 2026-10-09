import {
  AddEquation,
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  OneFactor,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  ZeroFactor,
} from "three";
import { lerp } from "../util";

/** Shared with `render/vfx/PooledParticles` (the allocation-free typing VFX pools). */
export const PARTICLE_VS = `attribute vec3 iPos, iVel; attribute vec4 iCol, iSz; varying vec4 vCol; varying vec2 vUv; varying float vKind;
        void main(){ vec4 vp = viewMatrix * vec4(iPos, 1.0); vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz; float sp = length(vv.xy);
          vec2 dir = (sp > 1e-4 && iSz.y > 0.0) ? vv.xy / sp : vec2(1.0, 0.0);
          float sx = iSz.x * (1.0 + iSz.y * sp), sy = iSz.x;
          if (iSz.w != 0.0) sx = iSz.x * max(abs(cos(iSz.w)), 0.15);
          vec2 perp = vec2(-dir.y, dir.x); vp.xy += dir * position.x * sx + perp * position.y * sy;
          gl_Position = projectionMatrix * vp; vUv = position.xy + 0.5; vCol = iCol; vKind = iSz.z; }`;
export const PARTICLE_FS = `uniform float uAdd; varying vec4 vCol; varying vec2 vUv; varying float vKind;
        void main(){ vec2 p = vUv - 0.5; float a; vec3 rc = vCol.rgb;
          if (vKind < 0.5) { a = smoothstep(0.5, 0.0, length(p)); a *= a; }
          else if (vKind < 1.5) { a = 1.0; }
          else if (vKind < 2.5) { a = smoothstep(0.5, 0.0, abs(p.y)) * smoothstep(0.5, 0.15, abs(p.x)); }
          else if (vKind < 3.5) { vec2 q = abs(p) * 2.0; float h = max(q.x * 0.8660254 + q.y * 0.5, q.y);
            a = step(h, 0.8660254) * (0.55 + 0.9 * smoothstep(0.58, 0.8660254, h)); }
          else { // T6.3 W3: a solid hex with a dark blue rim (reads on bright bokeh; use the normal-blend pool)
            vec2 q = abs(p) * 2.0; float h = max(q.x * 0.8660254 + q.y * 0.5, q.y);
            a = step(h, 0.8660254); rc = h > 0.66 ? vec3(0.04, 0.16, 0.33) : vCol.rgb; }
          if (uAdd > 0.5) gl_FragColor = vec4(rc * vCol.a * a, 1.0);
          else { if (vCol.a * a < 0.02) discard; gl_FragColor = vec4(rc, vCol.a * a); } }`;

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** End size (defaults to `size`). */
  size1?: number;
  /** Streak stretch along velocity. */
  st?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  /** 0 = soft glow, 1 = hard pixel quad, 2 = streak. */
  kind?: 0 | 1 | 2;
  grav?: number;
  drag?: number;
  spin?: number;
  ph?: number;
  bounce?: number;
  delay?: number;
  sway?: number;
  fadeIn?: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  size1: number;
  st: number;
  r: number;
  g: number;
  b: number;
  a: number;
  kind: number;
  grav: number;
  drag: number;
  spin: number;
  ph: number;
  bounce: number;
  delay: number;
  sway: number;
  fadeIn: number;
}

/**
 * Instanced camera-facing particle quads (glow / pixel / streak), one draw call per system.
 * The render core uses two instances for AMBIENT particles (embers, pollen, falling leaves). The VFX
 * library reuses the class for hit/spell particles. Update is driven by the `dt` passed in.
 */
export class Particles {
  readonly mesh: Mesh;
  private list: Particle[] = [];
  private readonly geo: InstancedBufferGeometry;
  private readonly base: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aVel: InstancedBufferAttribute;
  private readonly aCol: InstancedBufferAttribute;
  private readonly aSz: InstancedBufferAttribute;

  constructor(
    private readonly cap: number,
    additive: boolean,
    private readonly layer: Scene,
  ) {
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    this.base = base;
    g.index = base.index;
    g.setAttribute("position", base.attributes.position!);
    this.aPos = new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(
      DynamicDrawUsage,
    );
    this.aVel = new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(
      DynamicDrawUsage,
    );
    this.aCol = new InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(
      DynamicDrawUsage,
    );
    this.aSz = new InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(
      DynamicDrawUsage,
    );
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iVel", this.aVel);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iSz", this.aSz);
    g.instanceCount = 0;
    this.geo = g;
    this.material = new ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: { uAdd: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      ...(additive
        ? {
            blending: CustomBlending,
            blendEquation: AddEquation,
            blendSrc: OneFactor,
            blendDst: OneFactor,
            blendSrcAlpha: ZeroFactor,
            blendDstAlpha: OneFactor,
          }
        : { blending: NormalBlending }),
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 5 : 4;
    layer.add(this.mesh);
  }

  get count(): number {
    return this.list.length;
  }

  spawn(o: ParticleSpawn): void {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({
      x: o.x,
      y: o.y,
      z: o.z,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      vz: o.vz ?? 0,
      life: o.life,
      max: o.life,
      size: o.size,
      size1: o.size1 ?? o.size,
      st: o.st ?? 0,
      r: o.r ?? 1,
      g: o.g ?? 1,
      b: o.b ?? 1,
      a: o.a ?? 1,
      kind: o.kind ?? 1,
      grav: o.grav ?? 0,
      drag: o.drag ?? 0,
      spin: o.spin ?? 0,
      ph: o.ph ?? 0,
      bounce: o.bounce ?? 0,
      delay: o.delay ?? 0,
      sway: o.sway ?? 0,
      fadeIn: o.fadeIn ?? 0,
    });
  }

  clear(): void {
    this.list.length = 0;
  }

  update(dt: number): void {
    const keep: Particle[] = [];
    for (const q of this.list) {
      if (q.delay > 0) {
        q.delay -= dt;
        keep.push(q);
        continue;
      }
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vy -= q.grav * dt;
      const dr = Math.max(0, 1 - q.drag * dt);
      q.vx *= dr;
      q.vy *= dr;
      q.vz *= dr;
      q.x += q.vx * dt + (q.sway ? Math.sin(q.ph + q.life * 3) * q.sway * dt : 0);
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.bounce && q.y < 0.03) {
        q.y = 0.03;
        q.vy = Math.abs(q.vy) * q.bounce;
        q.vx *= 0.6;
        q.vz *= 0.6;
        if (Math.abs(q.vy) < 0.4) {
          q.vy = 0;
          q.grav = 0;
        }
      }
      if (q.spin) q.ph += q.spin * dt;
      keep.push(q);
    }
    this.list = keep;
  }

  /** Copy live particles into the instance buffers. Call once per frame before rendering. */
  upload(): void {
    let n = 0;
    const P = this.aPos.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const S = this.aSz.array as Float32Array;
    for (const q of this.list) {
      if (q.delay > 0) continue;
      const k = 1 - q.life / q.max;
      let a = q.a * Math.min(1, (q.life / q.max) * 2.2);
      if (q.fadeIn) a *= Math.min(1, k / q.fadeIn);
      P[n * 3] = q.x;
      P[n * 3 + 1] = q.y;
      P[n * 3 + 2] = q.z;
      V[n * 3] = q.vx;
      V[n * 3 + 1] = q.vy;
      V[n * 3 + 2] = q.vz;
      C[n * 4] = q.r;
      C[n * 4 + 1] = q.g;
      C[n * 4 + 2] = q.b;
      C[n * 4 + 3] = a;
      S[n * 4] = lerp(q.size, q.size1, k);
      S[n * 4 + 1] = q.st;
      S[n * 4 + 2] = q.kind;
      S[n * 4 + 3] = q.spin ? q.ph : 0;
      n++;
    }
    this.geo.instanceCount = n;
    for (const at of [this.aPos, this.aVel, this.aCol, this.aSz]) {
      at.needsUpdate = true;
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
    }
  }

  dispose(): void {
    this.layer.remove(this.mesh);
    this.geo.dispose();
    this.base.dispose();
    this.material.dispose();
    this.list.length = 0;
  }
}

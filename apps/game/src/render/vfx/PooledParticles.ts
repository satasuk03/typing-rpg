/**
 * PooledParticles: the allocation-free world particle pool of the typing VFX (spec §10.2).
 * Structure-of-arrays in typed arrays, fixed capacity, swap-remove compaction. Instance attributes are
 * written in place and `instanceCount` is the live count, so the whole pool is one draw call.
 * It reuses the shader of `render/ambient/particles.ts`.
 *
 * Overflow steals the oldest slot (the one with the least life left in proportion). Spawning is done
 * with a reused `ParticleSpec` scratch object: nothing here allocates after construction.
 */
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
import { PARTICLE_FS, PARTICLE_VS } from "../ambient/particles";

export const PK_GLOW = 0;
export const PK_PIXEL = 1;
export const PK_STREAK = 2;
/** A hard-edged hexagon with a bright rim (flat shard; `spin` flips it). */
export const PK_HEX = 3;
/** T6.3 W3: a solid hex with a dark blue rim (normal-blend pool B). */
export const PK_HEXR = 4;

/** Reusable spawn description. Create one per owner and fill it per spawn (`resetSpec` first). */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
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
  sway: number;
  ph: number;
  fadeIn: number;
  delay: number;
  /** T2.3: ground bounce restitution (0 = none; bounces at y <= 0.03) and flip spin rate (rad/s, 0 = none). */
  bounce: number;
  spin: number;
}

export function newSpec(): ParticleSpec {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 1,
    size: 0.1,
    size1: -1,
    st: 0,
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    kind: PK_GLOW,
    grav: 0,
    drag: 0,
    sway: 0,
    ph: 0,
    fadeIn: 0,
    delay: 0,
    bounce: 0,
    spin: 0,
  };
}
export function resetSpec(s: ParticleSpec): ParticleSpec {
  s.x = s.y = s.z = s.vx = s.vy = s.vz = 0;
  s.life = 1;
  s.size = 0.1;
  s.size1 = -1;
  s.st = 0;
  s.r = s.g = s.b = s.a = 1;
  s.kind = PK_GLOW;
  s.grav = s.drag = s.sway = s.ph = s.fadeIn = s.delay = s.bounce = s.spin = 0;
  return s;
}

export class PooledParticles {
  readonly mesh: Mesh;
  count = 0;
  /** Capacity actually used (quality tiers lower it, §10.4). */
  used: number;
  readonly cap: number;
  private readonly geo: InstancedBufferGeometry;
  private readonly base: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aVel: InstancedBufferAttribute;
  private readonly aCol: InstancedBufferAttribute;
  private readonly aSz: InstancedBufferAttribute;
  private readonly attrs: InstancedBufferAttribute[];
  // simulation state (SoA)
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly st: Float32Array;
  private readonly col: Float32Array; // r g b a
  private readonly kind: Uint8Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly sway: Float32Array;
  private readonly ph: Float32Array;
  private readonly fadeIn: Float32Array;
  private readonly delay: Float32Array;
  private readonly bnc: Float32Array;
  private readonly spn: Float32Array;
  private readonly rot: Float32Array;

  /** W4: alpha gain applied at upload; TypingWorldFx sets the additive pool to `world.additiveGain` (0.6 forest, 0.5 cave). */
  gain = 1;
  /** W5: extra alpha gain for glow-kind particles (soft white discs); sparks, pixels and hex shards keep `gain`. */
  glowGain = 1;
  /** W5: size factor for glow-kind particles. */
  glowSize = 1;

  constructor(
    cap: number,
    additive: boolean,
    private readonly layer: Scene,
    renderOrder = additive ? 9 : 8,
  ) {
    this.cap = cap;
    this.used = cap;
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    this.base = base;
    g.index = base.index;
    g.setAttribute("position", base.attributes.position as never);
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
    this.attrs = [this.aPos, this.aVel, this.aCol, this.aSz];
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
    this.mesh.renderOrder = renderOrder;
    layer.add(this.mesh);
    const f = (): Float32Array => new Float32Array(cap);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.max = f();
    this.size0 = f();
    this.size1 = f();
    this.st = f();
    this.col = new Float32Array(cap * 4);
    this.kind = new Uint8Array(cap);
    this.grav = f();
    this.drag = f();
    this.sway = f();
    this.ph = f();
    this.fadeIn = f();
    this.delay = f();
    this.bnc = f();
    this.spn = f();
    this.rot = f();
  }

  /** Spawn one particle (steals the slot with the least remaining life fraction when full). */
  emit(s: ParticleSpec): void {
    let i: number;
    if (this.count < this.used) i = this.count++;
    else {
      i = 0;
      let best = 2;
      for (let j = 0; j < this.count; j++) {
        const f = (this.life[j] as number) / ((this.max[j] as number) || 1);
        if (f < best) {
          best = f;
          i = j;
        }
      }
    }
    this.px[i] = s.x;
    this.py[i] = s.y;
    this.pz[i] = s.z;
    this.vx[i] = s.vx;
    this.vy[i] = s.vy;
    this.vz[i] = s.vz;
    this.life[i] = s.life;
    this.max[i] = s.life;
    this.size0[i] = s.size;
    this.size1[i] = s.size1 < 0 ? s.size : s.size1;
    this.st[i] = s.st;
    const c = i * 4;
    this.col[c] = s.r;
    this.col[c + 1] = s.g;
    this.col[c + 2] = s.b;
    this.col[c + 3] = s.a;
    this.kind[i] = s.kind;
    this.grav[i] = s.grav;
    this.drag[i] = s.drag;
    this.sway[i] = s.sway;
    this.ph[i] = s.ph;
    this.fadeIn[i] = s.fadeIn;
    this.delay[i] = s.delay;
    this.bnc[i] = s.bounce;
    this.spn[i] = s.spin;
    this.rot[i] = s.ph;
  }

  clear(): void {
    this.count = 0;
    this.geo.instanceCount = 0;
  }

  /** @hot Advance by dt seconds (already dilated by the caller) and swap-remove the dead. */
  update(dt: number): void {
    const n0 = this.count;
    for (let i = n0 - 1; i >= 0; i--) {
      const dl = this.delay[i] as number;
      if (dl > 0) {
        this.delay[i] = dl - dt;
        continue;
      }
      const l = (this.life[i] as number) - dt;
      if (l <= 0) {
        this.removeAt(i);
        continue;
      }
      this.life[i] = l;
      this.vy[i] = (this.vy[i] as number) - (this.grav[i] as number) * dt;
      const dr = Math.max(0, 1 - (this.drag[i] as number) * dt);
      this.vx[i] = (this.vx[i] as number) * dr;
      this.vy[i] = (this.vy[i] as number) * dr;
      this.vz[i] = (this.vz[i] as number) * dr;
      const sw = this.sway[i] as number;
      this.px[i] =
        (this.px[i] as number) +
        (this.vx[i] as number) * dt +
        (sw ? Math.sin((this.ph[i] as number) + l * 3) * sw * dt : 0);
      this.py[i] = (this.py[i] as number) + (this.vy[i] as number) * dt;
      this.pz[i] = (this.pz[i] as number) + (this.vz[i] as number) * dt;
      const bn = this.bnc[i] as number;
      if (bn && (this.py[i] as number) < 0.03 && (this.vy[i] as number) < 0) {
        this.py[i] = 0.03;
        this.vy[i] = -(this.vy[i] as number) * bn;
      }
      const sp = this.spn[i] as number;
      if (sp) this.rot[i] = (this.rot[i] as number) + sp * dt;
    }
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.px[i] = this.px[last] as number;
    this.py[i] = this.py[last] as number;
    this.pz[i] = this.pz[last] as number;
    this.vx[i] = this.vx[last] as number;
    this.vy[i] = this.vy[last] as number;
    this.vz[i] = this.vz[last] as number;
    this.life[i] = this.life[last] as number;
    this.max[i] = this.max[last] as number;
    this.size0[i] = this.size0[last] as number;
    this.size1[i] = this.size1[last] as number;
    this.st[i] = this.st[last] as number;
    const a = i * 4;
    const b = last * 4;
    this.col[a] = this.col[b] as number;
    this.col[a + 1] = this.col[b + 1] as number;
    this.col[a + 2] = this.col[b + 2] as number;
    this.col[a + 3] = this.col[b + 3] as number;
    this.kind[i] = this.kind[last] as number;
    this.grav[i] = this.grav[last] as number;
    this.drag[i] = this.drag[last] as number;
    this.sway[i] = this.sway[last] as number;
    this.ph[i] = this.ph[last] as number;
    this.fadeIn[i] = this.fadeIn[last] as number;
    this.delay[i] = this.delay[last] as number;
    this.bnc[i] = this.bnc[last] as number;
    this.spn[i] = this.spn[last] as number;
    this.rot[i] = this.rot[last] as number;
  }

  /** @hot Copy live particles into the instance buffers. Call once per frame before rendering. */
  upload(): void {
    const P = this.aPos.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const S = this.aSz.array as Float32Array;
    const gain = this.gain;
    const glowGain = this.glowGain;
    const glowSize = this.glowSize;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if ((this.delay[i] as number) > 0) continue;
      const mx = this.max[i] as number;
      const k = 1 - (this.life[i] as number) / mx;
      let a = (this.col[i * 4 + 3] as number) * Math.min(1, (1 - k) * 2.2) * gain;
      if ((this.kind[i] as number) === PK_GLOW) a *= glowGain;
      const fi = this.fadeIn[i] as number;
      if (fi) a *= Math.min(1, k / fi);
      P[n * 3] = this.px[i] as number;
      P[n * 3 + 1] = this.py[i] as number;
      P[n * 3 + 2] = this.pz[i] as number;
      V[n * 3] = this.vx[i] as number;
      V[n * 3 + 1] = this.vy[i] as number;
      V[n * 3 + 2] = this.vz[i] as number;
      C[n * 4] = this.col[i * 4] as number;
      C[n * 4 + 1] = this.col[i * 4 + 1] as number;
      C[n * 4 + 2] = this.col[i * 4 + 2] as number;
      C[n * 4 + 3] = a;
      const s0 = this.size0[i] as number;
      S[n * 4] =
        (s0 + ((this.size1[i] as number) - s0) * k) *
        ((this.kind[i] as number) === PK_GLOW ? glowSize : 1);
      S[n * 4 + 1] = this.st[i] as number;
      S[n * 4 + 2] = this.kind[i] as number;
      S[n * 4 + 3] = (this.spn[i] as number) ? (this.rot[i] as number) : 0;
      n++;
    }
    this.geo.instanceCount = n;
    for (let j = 0; j < 4; j++) {
      const at = this.attrs[j] as InstancedBufferAttribute;
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
    this.count = 0;
  }
}

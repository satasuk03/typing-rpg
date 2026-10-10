/**
 * AnalyticParticles (P3.2): a per-frame particle batch for the prologue cues. Unlike `PooledParticles` it holds NO simulation
 * state: every cue renderer writes each live particle at its closed-form position for (seed, age) with `push`, once per frame.
 * That is what makes the cues seekable and reproducible (the cutscene engine's rule): the same cue at the same age is the same
 * picture, however the playhead got there. It reuses the shader of `PooledParticles` (`ambient/particles`), one draw call per
 * blend mode, and the same attribute layout (`iPos`, `iVel` for streak orientation, `iCol`, `iSz` = size / stretch / kind / spin).
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
import { PARTICLE_FS, PARTICLE_VS } from "../../ambient/particles";

export { PK_GLOW, PK_HEX, PK_PIXEL, PK_STREAK } from "../PooledParticles";

export class AnalyticParticles {
  readonly mesh: Mesh;
  /** Live particles written this frame. */
  count = 0;
  /** Particles dropped this frame because the batch was full (diagnostics). */
  dropped = 0;
  /** Alpha gain at push time (the additive batch takes `world.additiveGain`, like the typing VFX pool). */
  gain = 1;
  private readonly geo: InstancedBufferGeometry;
  private readonly base: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly P: Float32Array;
  private readonly V: Float32Array;
  private readonly C: Float32Array;
  private readonly S: Float32Array;
  private readonly attrs: InstancedBufferAttribute[];

  constructor(
    readonly cap: number,
    additive: boolean,
    private readonly layer: Scene,
    renderOrder = additive ? 9 : 8,
  ) {
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    this.base = base;
    g.index = base.index;
    g.setAttribute("position", base.attributes.position as never);
    const mk = (n: number): InstancedBufferAttribute =>
      new InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(DynamicDrawUsage);
    const aPos = mk(3);
    const aVel = mk(3);
    const aCol = mk(4);
    const aSz = mk(4);
    g.setAttribute("iPos", aPos);
    g.setAttribute("iVel", aVel);
    g.setAttribute("iCol", aCol);
    g.setAttribute("iSz", aSz);
    this.P = aPos.array as Float32Array;
    this.V = aVel.array as Float32Array;
    this.C = aCol.array as Float32Array;
    this.S = aSz.array as Float32Array;
    this.attrs = [aPos, aVel, aCol, aSz];
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
  }

  /** Start a frame. */
  begin(): void {
    this.count = 0;
    this.dropped = 0;
  }

  /**
   * One particle. `vx/vy/vz` only orient a streak (kind 2, with `st` > 0); the position is already final. `rot` (kind 3 hex
   * spin) is 0 for none. Alpha is multiplied by `gain` here, so callers pass the cue's own alpha.
   */
  push(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    a: number,
    size: number,
    st: number,
    kind: number,
    rot = 0,
  ): void {
    const n = this.count;
    if (n >= this.cap) {
      this.dropped++;
      return;
    }
    if (a <= 0.002 || size <= 0) return;
    const i3 = n * 3;
    const i4 = n * 4;
    this.P[i3] = x;
    this.P[i3 + 1] = y;
    this.P[i3 + 2] = z;
    this.V[i3] = vx;
    this.V[i3 + 1] = vy;
    this.V[i3 + 2] = vz;
    this.C[i4] = r;
    this.C[i4 + 1] = g;
    this.C[i4 + 2] = b;
    this.C[i4 + 3] = a * this.gain;
    this.S[i4] = size;
    this.S[i4 + 1] = st;
    this.S[i4 + 2] = kind;
    this.S[i4 + 3] = rot;
    this.count = n + 1;
  }

  /** Finish the frame: publish `count` instances. */
  end(): void {
    this.geo.instanceCount = this.count;
    for (const at of this.attrs) {
      at.needsUpdate = true;
      at.clearUpdateRanges();
      at.addUpdateRange(0, this.count * at.itemSize);
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

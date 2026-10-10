import {
  type Color,
  DepthTexture,
  HalfFloatType,
  type IUniform,
  LinearFilter,
  Mesh,
  OrthographicCamera as OrthoCam,
  type OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type { BiomeMood } from "../biomes";
import type { QualitySettings } from "../quality";
import {
  BLOOM_PRE_FS,
  BLOOM_UP_FS,
  BLUR_FS,
  COMBINE_FS,
  COPY_DOWN_FS,
  dofFragment,
  FINAL_FS,
  VS_POST,
} from "./shaders";

type U<T> = { value: T };

/** Per-frame overrides driven by VFX/camera (zoom punch, CA, heat, flash). Defaults are all "off". */
export interface PostEffects {
  /** Chromatic aberration amount (0.004 is strong). */
  ca: number;
  /** Radial zoom-blur punch amount (0..~0.1) toward `zoomCenter` (uv). */
  zoom: number;
  zoomCenter: Vector2;
  /** Extra vignette (damage flash). */
  vignetteBoost: number;
  /** Full-screen colour flash mix (0..1). */
  flash: number;
  flashColor: Vector3;
  /** Up to 4 heat-haze sources: x,y in uv, z radius (aspect-corrected), w strength (<= 0 disables). */
  heat: Vector4[];
  /** Letterbox override; negative = use the biome's bars. */
  bars: number;
}

export function createPostEffects(): PostEffects {
  return {
    ca: 0,
    zoom: 0,
    zoomCenter: new Vector2(0.5, 0.5),
    vignetteBoost: 0,
    flash: 0,
    flashColor: new Vector3(1, 1, 1),
    heat: Array.from({ length: 4 }, () => new Vector4(0, 0, 0, 0)),
    bars: -1,
  };
}

interface Targets {
  w: number;
  h: number;
  scene: WebGLRenderTarget;
  fg: WebGLRenderTarget;
  comb: WebGLRenderTarget;
  dof: WebGLRenderTarget;
  fq1: WebGLRenderTarget;
  fq2: WebGLRenderTarget;
  bd: WebGLRenderTarget[];
  bu: WebGLRenderTarget[];
}

/**
 * The full post chain, configurable per biome mood and quality tier:
 *   scene (+depth) -> DOF (depth + tilt-shift) ; foreground layer -> downsample -> separable blur
 *   -> combine -> bloom (threshold + mip chain) -> final (CA / zoom punch / heat / ACES / grade / vignette / grain / bars).
 * Raw mode (`fx = false`) skips DOF/bloom/grade and just presents the unlit pixels ("HD-2D off").
 */
export class PostPipeline {
  fx = true;
  readonly effects: PostEffects = createPostEffects();
  private mood: BiomeMood | null = null;
  private q: QualitySettings | null = null;
  private t: Targets | null = null;
  private outW = 0;
  private outH = 0;
  private time = 0;
  private bloomMix = 0.78;
  private dofSamples = 0;

  private readonly postCam: OrthographicCamera = new OrthoCam(-1, 1, 1, -1, 0, 1);
  private readonly postScene = new Scene();
  private readonly quad: Mesh;
  private readonly quadGeo = new PlaneGeometry(2, 2);
  private readonly disposables: { dispose(): void }[] = [];

  private readonly dofU = {
    tCol: { value: null as Texture | null },
    tDep: { value: null as Texture | null },
    uTexel: { value: new Vector2() },
    uNear: { value: 0.5 },
    uFar: { value: 260 },
    uFocus: { value: 19 },
    uRangeFar: { value: 9 },
    uRangeNear: { value: 7 },
    uTilt: { value: 0.35 },
    uFocusY: { value: 0.45 },
    uMaxR: { value: 14 },
  };
  private readonly preU = {
    tSrc: { value: null as Texture | null },
    uTexel: { value: new Vector2() },
    uThr: { value: 1.0 },
    uKnee: { value: 0.6 },
  };
  private readonly finU = {
    tComb: { value: null as Texture | null },
    tBloom: { value: null as Texture | null },
    uRes: { value: new Vector2() },
    uBloom: { value: 0.8 },
    uExposure: { value: 1 },
    uCA: { value: 0 },
    uZoom: { value: 0 },
    uZoomC: { value: new Vector2(0.5, 0.5) },
    uVig: { value: 0.45 },
    uGrain: { value: 0.022 },
    uTime: { value: 0 },
    uLift: { value: new Vector3() },
    uGamma: { value: new Vector3(1, 1, 1) },
    uGain: { value: new Vector3(1, 1, 1) },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uShadowTint: { value: new Vector3() },
    uHighTint: { value: new Vector3() },
    uHeat: { value: Array.from({ length: 4 }, () => new Vector4(0, 0, 0, 0)) },
    uFlash: { value: 0 },
    uFlashCol: { value: new Vector3(1, 1, 1) },
    uRaw: { value: 0 },
    uBars: { value: 0 },
  };
  private dofMat: ShaderMaterial | null = null;
  private readonly copyDownMat: ShaderMaterial;
  private readonly blurMat: ShaderMaterial;
  private readonly combMat: ShaderMaterial;
  private readonly preMat: ShaderMaterial;
  private readonly upMat: ShaderMaterial;
  private readonly finMat: ShaderMaterial;
  private readonly blackTex: Texture;
  private readonly halfFloat: boolean;

  constructor(
    private readonly renderer: WebGLRenderer,
    blackTex: Texture,
  ) {
    this.blackTex = blackTex;
    this.halfFloat =
      renderer.extensions.has("EXT_color_buffer_float") ||
      renderer.extensions.has("EXT_color_buffer_half_float");
    this.quad = new Mesh(this.quadGeo);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    const pass = (fs: string, uniforms: Record<string, U<unknown>>): ShaderMaterial => {
      const m = new ShaderMaterial({
        uniforms,
        vertexShader: VS_POST,
        fragmentShader: fs,
        depthTest: false,
        depthWrite: false,
      });
      this.disposables.push(m);
      return m;
    };
    this.copyDownMat = pass(COPY_DOWN_FS, {
      tSrc: { value: null },
      uTexel: { value: new Vector2() },
    });
    this.blurMat = pass(BLUR_FS, { tSrc: { value: null }, uDir: { value: new Vector2() } });
    this.combMat = pass(COMBINE_FS, {
      ...this.dofU,
      tScene: { value: null },
      tDof: { value: null },
      tFg: { value: null },
      uDofOn: { value: 1 },
    });
    this.preMat = pass(BLOOM_PRE_FS, this.preU);
    this.upMat = pass(BLOOM_UP_FS, {
      tLow: { value: null },
      tHigh: { value: null },
      uTexel: { value: new Vector2() },
      uMix: { value: 1 },
    });
    this.finMat = pass(FINAL_FS, this.finU);
    this.disposables.push(this.quadGeo);
  }

  /** Apply the grade/post part of a biome mood. */
  applyMood(m: BiomeMood): void {
    this.mood = m;
    const f = this.finU;
    f.uExposure.value = m.exposure;
    f.uLift.value.set(...m.lift);
    f.uGamma.value.set(...m.gamma);
    f.uGain.value.set(...m.gain);
    f.uSat.value = m.sat;
    f.uContrast.value = m.contrast;
    f.uShadowTint.value.set(...m.sh);
    f.uHighTint.value.set(...m.hi);
    f.uBloom.value = m.bloom;
    this.preU.uThr.value = m.thr;
    this.dofU.uRangeFar.value = m.rangeFar;
    this.dofU.uTilt.value = m.tilt;
  }

  setQuality(q: QualitySettings): void {
    this.q = q;
    if (this.dofSamples !== q.dofSamples) {
      this.dofSamples = q.dofSamples;
      if (this.dofMat) {
        const i = this.disposables.indexOf(this.dofMat);
        if (i >= 0) this.disposables.splice(i, 1);
        this.dofMat.dispose();
      }
      this.dofMat = new ShaderMaterial({
        uniforms: this.dofU,
        vertexShader: VS_POST,
        fragmentShader: dofFragment(q.dofSamples),
        depthTest: false,
        depthWrite: false,
      });
      this.disposables.push(this.dofMat);
    }
    if (this.outW > 0) this.resize(this.outW, this.outH);
  }

  /** Output (drawing-buffer) size in pixels. Internal targets are scaled by the quality tier. */
  resize(outW: number, outH: number): void {
    this.outW = outW;
    this.outH = outH;
    const q = this.q;
    const scale = q?.scale ?? 1;
    const w = Math.max(64, Math.round(outW * scale));
    const h = Math.max(36, Math.round(outH * scale));
    if (this.t && this.t.w === w && this.t.h === h) return;
    this.disposeTargets();
    const type = this.halfFloat ? HalfFloatType : UnsignedByteType;
    const mk = (tw: number, th: number, depth: false | true | "tex"): WebGLRenderTarget => {
      const t = new WebGLRenderTarget(tw, th, {
        type,
        format: RGBAFormat,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: !!depth,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      if (depth === "tex") {
        t.depthTexture = new DepthTexture(tw, th);
        t.depthTexture.type = UnsignedIntType;
      }
      return t;
    };
    const hw = Math.max(2, w >> 1);
    const hh = Math.max(2, h >> 1);
    const qw = Math.max(2, w >> 2);
    const qh = Math.max(2, h >> 2);
    const bd: WebGLRenderTarget[] = [];
    const bu: WebGLRenderTarget[] = [];
    let bw = hw;
    let bh = hh;
    for (let i = 0; i < 6; i++) {
      bd.push(mk(Math.max(2, bw), Math.max(2, bh), false));
      bu.push(mk(Math.max(2, bw), Math.max(2, bh), false));
      bw >>= 1;
      bh >>= 1;
    }
    this.t = {
      w,
      h,
      scene: mk(w, h, "tex"),
      fg: mk(w, h, true),
      comb: mk(w, h, false),
      dof: mk(hw, hh, false),
      fq1: mk(qw, qh, false),
      fq2: mk(qw, qh, false),
      bd,
      bu,
    };
    this.dofU.uMaxR.value = ((15 * h) / 1080) * 1.0 + 4;
  }

  private runPass(mat: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }

  /** Focus distance for the DOF (camera distance to the action plane). */
  setFocus(distance: number, focusY: number): void {
    this.dofU.uFocus.value = distance;
    this.dofU.uFocusY.value = focusY;
  }

  render(dt: number, scene: Scene, fgScene: Scene, camera: PerspectiveCamera, clear: Color): void {
    const t = this.t;
    const q = this.q;
    if (!t || !q || !this.dofMat) return;
    this.time += dt;
    const r = this.renderer;
    const { w, h } = t;
    this.dofU.uNear.value = camera.near;
    this.dofU.uFar.value = camera.far;

    // 1. main scene (with depth texture) and the foreground layer
    r.setRenderTarget(t.scene);
    r.setClearColor(clear, 1);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(t.fg);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(fgScene, camera);

    // 2. DOF + foreground blur
    let fgTex: Texture = t.fg.texture;
    if (this.fx) {
      this.dofU.tCol.value = t.scene.texture;
      this.dofU.tDep.value = t.scene.depthTexture;
      this.dofU.uTexel.value.set(1 / w, 1 / h);
      this.runPass(this.dofMat, t.dof);
      uni(this.copyDownMat.uniforms, "tSrc").value = t.fg.texture;
      (uni(this.copyDownMat.uniforms, "uTexel").value as Vector2).set(1 / w, 1 / h);
      this.runPass(this.copyDownMat, t.fq1);
      const qw = t.fq1.width;
      const qh = t.fq1.height;
      for (let i = 0; i < q.fgBlurPasses; i++) {
        const s = 1.0 + i * 1.2;
        uni(this.blurMat.uniforms, "tSrc").value = t.fq1.texture;
        (uni(this.blurMat.uniforms, "uDir").value as Vector2).set(s / qw, 0);
        this.runPass(this.blurMat, t.fq2);
        uni(this.blurMat.uniforms, "tSrc").value = t.fq2.texture;
        (uni(this.blurMat.uniforms, "uDir").value as Vector2).set(0, s / qh);
        this.runPass(this.blurMat, t.fq1);
      }
      fgTex = t.fq1.texture;
    }

    // 3. combine
    const cu = this.combMat.uniforms;
    uni(cu, "tScene").value = t.scene.texture;
    uni(cu, "tDof").value = t.dof.texture;
    uni(cu, "tFg").value = fgTex;
    uni(cu, "uDofOn").value = this.fx ? 1 : 0;
    this.runPass(this.combMat, t.comb);

    // 4. bloom
    let bloomTex: Texture = this.blackTex;
    if (this.fx) {
      const n = Math.min(q.bloomLevels, t.bd.length);
      this.preU.tSrc.value = t.comb.texture;
      this.preU.uTexel.value.set(1 / w, 1 / h);
      this.runPass(this.preMat, at(t.bd, 0));
      for (let i = 1; i < n; i++) {
        const prev = at(t.bd, i - 1);
        uni(this.copyDownMat.uniforms, "tSrc").value = prev.texture;
        (uni(this.copyDownMat.uniforms, "uTexel").value as Vector2).set(
          1 / prev.width,
          1 / prev.height,
        );
        this.runPass(this.copyDownMat, at(t.bd, i));
      }
      let low = at(t.bd, n - 1);
      for (let i = n - 2; i >= 0; i--) {
        const uu = this.upMat.uniforms;
        uni(uu, "tLow").value = low.texture;
        uni(uu, "tHigh").value = at(t.bd, i).texture;
        (uni(uu, "uTexel").value as Vector2).set(1 / low.width, 1 / low.height);
        uni(uu, "uMix").value = this.bloomMix;
        this.runPass(this.upMat, at(t.bu, i));
        low = at(t.bu, i);
      }
      bloomTex = low.texture;
    }

    // 5. final
    const f = this.finU;
    const e = this.effects;
    const m = this.mood;
    f.tComb.value = t.comb.texture;
    f.tBloom.value = bloomTex;
    f.uRes.value.set(this.outW, this.outH);
    f.uRaw.value = this.fx ? 0 : 1;
    f.uTime.value = this.time;
    f.uVig.value = (m?.vig ?? 0.45) + e.vignetteBoost * 0.25;
    f.uCA.value = e.ca;
    f.uZoom.value = e.zoom;
    f.uZoomC.value.copy(e.zoomCenter);
    f.uFlash.value = e.flash;
    f.uFlashCol.value.copy(e.flashColor);
    f.uBars.value = e.bars >= 0 ? e.bars : (m?.bars ?? 0);
    for (let i = 0; i < 4; i++) {
      const src = e.heat[i];
      const dst = f.uHeat.value[i];
      if (!src || !dst) continue;
      if (q.heatHaze) dst.copy(src);
      else dst.set(0, 0, 0, 0);
    }
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.outW, this.outH);
    this.runPass(this.finMat, null);
  }

  /** Recreate render targets (after a context restore). */
  /**
   * Rebuild the render targets. After a context loss pass `contextLost = true`: the old GL objects died with the
   * context, and `dispose()` on them would call gl.delete* on handles from the dead context (INVALID_OPERATION warnings),
   * so the old targets are only forgotten (three.js frees nothing: the driver already did).
   */
  reset(contextLost = false): void {
    if (contextLost) this.t = null;
    else this.disposeTargets();
    if (this.outW > 0) this.resize(this.outW, this.outH);
  }

  private disposeTargets(): void {
    const t = this.t;
    if (!t) return;
    const all = [t.scene, t.fg, t.comb, t.dof, t.fq1, t.fq2, ...t.bd, ...t.bu];
    for (const rt of all) {
      rt.depthTexture?.dispose();
      rt.dispose();
    }
    this.t = null;
  }

  /** Release render targets, materials and geometry. Safe to call twice. */
  dispose(): void {
    this.disposeTargets();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.dofMat = null;
  }

  /** Internal render size (for stats/tests). */
  get internalSize(): { w: number; h: number } {
    return { w: this.t?.w ?? 0, h: this.t?.h ?? 0 };
  }
}

/** Look up a uniform known to exist on a pass material (throws if the shader lacks it). */
function uni(uniforms: Record<string, IUniform>, name: string): IUniform {
  const u = uniforms[name];
  if (u === undefined) throw new Error(`missing uniform ${name}`);
  return u;
}

/** Index into a render-target chain whose length is fixed at construction. */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`missing chain entry ${i}`);
  return v;
}

/**
 * AuraQuad: a soft light shape (disc, column, pulse ring, sunburst) with a blend that is part "over" and
 * part additive. Purely additive glows turn white on a bright world (the forest) and lose their hue; an
 * "over" blend keeps the colour, so the aura reads on any backdrop, and the additive share still feeds
 * the bloom. `uAdd` 0 = normal alpha blend, 1 = fully additive.
 *
 * Blend: `out = colour * a + dst * (1 - a * (1 - uAdd))` (premultiplied; ONE, ONE_MINUS_SRC_ALPHA).
 */
import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { GLSL_HERO_INSIDE, HERO_CAP, HERO_NDC } from "../materials/heroGuard";
import type { RenderWorld } from "../RenderWorld";

export { setHeroGuard } from "../materials/heroGuard";

export const AuraKind = { Disc: 0, Column: 1, Ring: 2, Burst: 3, Halo: 4 } as const;
export type AuraKindId = (typeof AuraKind)[keyof typeof AuraKind];

const FS = /* glsl */ `
${GLSL_HERO_INSIDE}
uniform vec3 uColor; uniform float uA, uP, uTime, uAdd, uSeed, uCap; uniform int uKind; varying vec2 vUv; varying vec2 vNdc;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = 0.0;
  if (uKind == 0) {
    float t = clamp(1.0 - r, 0.0, 1.0); a = t * t * (3.0 - 2.0 * t); a = a * (0.55 + 0.45 * t);
  } else if (uKind == 1) {
    float x = abs(p.x) * 2.0;
    float edge = smoothstep(1.0, 0.25, x);
    float core = smoothstep(0.5, 0.0, x);
    float v = pow(1.0 - vUv.y, 1.15) * smoothstep(0.0, 0.05, vUv.y);
    float band = 0.82 + 0.18 * sin(vUv.y * 16.0 - uTime * 3.2 + p.x * 7.0 + uSeed);
    a = (edge * 0.55 + core * 0.65) * v * band;
  } else if (uKind == 2) {
    float w = 0.05 + 0.08 * (1.0 - uP);
    a = smoothstep(w, 0.0, abs(r - uP)) * (1.0 - uP * uP);
  } else if (uKind == 3) {
    float ang = atan(p.y, p.x);
    float rays = 0.5 + 0.5 * cos(ang * 6.0 + uSeed);
    float rays2 = 0.5 + 0.5 * cos(ang * 11.0 - uSeed * 1.7);
    a = (pow(rays, 9.0) * 0.95 + pow(rays2, 14.0) * 0.6) * smoothstep(1.0, 0.05, r) * smoothstep(0.0, 0.12, r);
  } else {
    // halo ring with a soft body: a glowing circle outline (used behind the hero)
    float ring = smoothstep(0.16, 0.0, abs(r - 0.78));
    float body = smoothstep(1.0, 0.2, r) * 0.35;
    a = ring + body;
  }
  a = clamp(a * uA, 0.0, 1.0);
  // keep the hero sprite readable: inside its body rect (soft edge) the alpha never exceeds uCap
  a = mix(a, min(a, uCap), heroInside(vNdc));
  gl_FragColor = vec4(uColor * a, a * (1.0 - uAdd));
}`;

export class AuraQuad {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  private readonly col: Vector3;
  private readonly geo: PlaneGeometry;

  constructor(
    private readonly world: RenderWorld,
    kind: AuraKindId,
    renderOrder = 6,
    seed = 0,
    add = 0.45,
  ) {
    this.geo = new PlaneGeometry(1, 1);
    this.mat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Vector3(1, 1, 1) },
        uA: { value: 0 },
        uP: { value: 0 },
        uTime: world.lighting.uTime,
        uAdd: { value: add },
        uSeed: { value: seed },
        uKind: { value: kind },
        uHero: HERO_NDC,
        uCap: HERO_CAP,
      },
      vertexShader:
        "varying vec2 vUv; varying vec2 vNdc; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vNdc = gl_Position.xy / gl_Position.w; }",
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.col = this.mat.uniforms.uColor?.value as Vector3;
    world.scene.add(this.mesh);
  }

  color(r: number, g: number, b: number): this {
    this.col.set(r, g, b);
    return this;
  }
  /** Opacity (`uA`); the quad is hidden at <= 0. */
  alpha(v: number): this {
    (this.mat.uniforms.uA as { value: number }).value = v;
    this.mesh.visible = v > 0.003;
    return this;
  }
  /** Additive share (0 = plain alpha blend). Bright worlds use less so hues stay saturated. */
  additive(v: number): this {
    (this.mat.uniforms.uAdd as { value: number }).value = v;
    return this;
  }
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
  /** Lie flat on the ground (normal up). */
  flat(): this {
    this.mesh.rotation.x = -Math.PI / 2;
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

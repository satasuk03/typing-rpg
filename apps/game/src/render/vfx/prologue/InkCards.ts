/**
 * InkCards (P3.2): a fixed set of normal-blend soft quads for what must NOT be additive: the ink pool of `inkRise` (a dark disc
 * lying on the ground), the grey fog cards of `silenceFog` (vertical cards with a soft, noisy edge) and the dark lens behind the
 * `skyTear` (so the slit reads as a hole on a bright sky). Additive light can't draw
 * ink: it only brightens. Built once; `card` takes the next free slot, `end` hides the unused ones. No state beyond the frame.
 */
import {
  DoubleSide,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector3,
} from "three";

export const CardShape = { Disc: 0, Fog: 1, Slit: 2 } as const;
export type CardShapeId = (typeof CardShape)[keyof typeof CardShape];

const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */ `uniform vec3 uCol; uniform float uA, uSeed; uniform int uShape; varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){ vec2 p = vUv - 0.5; float a;
  if (uShape == 0) { float r = length(p) * 2.0; a = smoothstep(1.0, 0.8, r) * (0.82 + 0.18 * smoothstep(0.9, 0.3, r)); }
  else if (uShape == 2) { float t = abs(p.y) * 2.0; float hw = 0.5 * (1.0 - t * t); a = smoothstep(hw, hw * 0.5, abs(p.x)) * smoothstep(1.0, 0.8, t); }
  else { float n = 0.55 + 0.45 * vn(vUv * vec2(5.0, 3.0) + uSeed);
    a = smoothstep(0.5, 0.12, abs(p.x)) * smoothstep(0.5, 0.05, abs(p.y)) * n; }
  gl_FragColor = vec4(uCol, a * uA); }`;

interface Card {
  mesh: Mesh;
  mat: ShaderMaterial;
  col: Vector3;
}

export class InkCards {
  private readonly cards: Card[] = [];
  private readonly geo = new PlaneGeometry(1, 1);
  private used = 0;
  private shown = 0;

  constructor(
    cap: number,
    private readonly scene: Scene,
    renderOrder = 5,
  ) {
    for (let i = 0; i < cap; i++) {
      const col = new Vector3(0, 0, 0);
      const mat = new ShaderMaterial({
        uniforms: {
          uCol: { value: col },
          uA: { value: 0 },
          uSeed: { value: i * 7.3 },
          uShape: { value: 0 },
        },
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        side: DoubleSide,
      });
      const mesh = new Mesh(this.geo, mat);
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.cards.push({ mesh, mat, col });
    }
  }

  begin(): void {
    this.used = 0;
  }

  /** `flat` lies the card on the ground (an ink pool); otherwise it stands facing +z (a fog card). `w` along x, `d` along z (flat) or y (upright). */
  card(
    shape: CardShapeId,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    r: number,
    g: number,
    b: number,
    a: number,
    flat: boolean,
    seed = 0,
  ): void {
    if (this.used >= this.cards.length || a <= 0.003 || w <= 0 || d <= 0) return;
    const c = this.cards[this.used++] as Card;
    c.col.set(r, g, b);
    (c.mat.uniforms.uA as { value: number }).value = a;
    (c.mat.uniforms.uShape as { value: number }).value = shape;
    (c.mat.uniforms.uSeed as { value: number }).value = seed;
    c.mesh.position.set(x, y, z);
    c.mesh.rotation.x = flat ? -Math.PI / 2 : 0;
    c.mesh.scale.set(w, d, 1);
    c.mesh.visible = true;
  }

  end(): void {
    for (let i = this.used; i < this.shown; i++) (this.cards[i] as Card).mesh.visible = false;
    this.shown = this.used;
  }

  get live(): number {
    return this.used;
  }

  dispose(): void {
    for (const c of this.cards) {
      this.scene.remove(c.mesh);
      c.mat.dispose();
    }
    this.geo.dispose();
    this.cards.length = 0;
  }
}

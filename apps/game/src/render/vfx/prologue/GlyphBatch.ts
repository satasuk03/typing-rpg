/**
 * GlyphBatch (P3.2): camera-facing 3x5 pixel-font letters for `letterVortex` (art direction §3: "a spiral of 3x5 pixel glyph
 * sprites"), one instanced draw call, normal blend. The atlas is a tiny canvas texture built once (26 letters, nearest-filtered
 * so the pixels stay hard). Like `AnalyticParticles` it keeps no simulation state: `push` each live glyph every frame.
 */
import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  NormalBlending,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
} from "three";

/** 3 x 5 bitmaps, rows top to bottom. */
export const FONT_3X5: Readonly<Record<string, readonly string[]>> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
};
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CELL_W = 4;
const CELL_H = 6;

/** Atlas column of a letter (A..Z), 0 for anything else. */
export function glyphIndex(ch: string): number {
  const i = LETTERS.indexOf(ch.toUpperCase());
  return i < 0 ? 0 : i;
}

const VS = /* glsl */ `attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iData; varying vec4 vCol; varying vec2 vUv; varying float vG;
void main(){ vec4 vp = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.z), s = sin(iData.z); vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  vp.xy += q * iData.x * vec2(0.6, 1.0);
  gl_Position = projectionMatrix * vp; vUv = position.xy + 0.5; vCol = iCol; vG = iData.y; }`;
const FS = /* glsl */ `uniform sampler2D uAtlas; varying vec4 vCol; varying vec2 vUv; varying float vG;
void main(){ vec2 uv = vec2((vG * 4.0 + clamp(vUv.x, 0.0, 0.999) * 3.0) / 104.0, 1.0 - (1.0 - vUv.y) * 5.0 / 6.0);
  float a = texture2D(uAtlas, uv).a;
  if (a * vCol.a < 0.02) discard;
  gl_FragColor = vec4(vCol.rgb, a * vCol.a); }`;

function buildAtlas(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = CELL_W * 26;
  cv.height = CELL_H;
  const c = cv.getContext("2d") as CanvasRenderingContext2D;
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#fff";
  for (let g = 0; g < 26; g++) {
    const rows = FONT_3X5[LETTERS[g] as string] as readonly string[];
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 3; x++) if (rows[y]?.[x] === "1") c.fillRect(g * CELL_W + x, y, 1, 1);
  }
  const t = new CanvasTexture(cv);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.flipY = true;
  return t;
}

export class GlyphBatch {
  readonly mesh: Mesh;
  count = 0;
  private readonly geo: InstancedBufferGeometry;
  private readonly base: PlaneGeometry;
  private readonly material: ShaderMaterial;
  private readonly tex: CanvasTexture;
  private readonly P: Float32Array;
  private readonly C: Float32Array;
  private readonly D: Float32Array;
  private readonly attrs: InstancedBufferAttribute[];

  constructor(
    readonly cap: number,
    private readonly layer: Scene,
    renderOrder = 10,
  ) {
    const g = new InstancedBufferGeometry();
    const base = new PlaneGeometry(1, 1);
    this.base = base;
    g.index = base.index;
    g.setAttribute("position", base.attributes.position as never);
    const mk = (n: number): InstancedBufferAttribute =>
      new InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(DynamicDrawUsage);
    const aPos = mk(3);
    const aCol = mk(4);
    const aData = mk(4);
    g.setAttribute("iPos", aPos);
    g.setAttribute("iCol", aCol);
    g.setAttribute("iData", aData);
    this.P = aPos.array as Float32Array;
    this.C = aCol.array as Float32Array;
    this.D = aData.array as Float32Array;
    this.attrs = [aPos, aCol, aData];
    g.instanceCount = 0;
    this.geo = g;
    this.tex = buildAtlas();
    this.material = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uAtlas: { value: this.tex } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    layer.add(this.mesh);
  }

  begin(): void {
    this.count = 0;
  }

  /** One glyph billboard: `size` is the height in metres (the width is 0.6 of it, the 3:5 cell), `rot` radians. */
  push(
    x: number,
    y: number,
    z: number,
    size: number,
    letter: number,
    rot: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    const n = this.count;
    if (n >= this.cap || a <= 0.002) return;
    this.P[n * 3] = x;
    this.P[n * 3 + 1] = y;
    this.P[n * 3 + 2] = z;
    this.C[n * 4] = r;
    this.C[n * 4 + 1] = g;
    this.C[n * 4 + 2] = b;
    this.C[n * 4 + 3] = a;
    this.D[n * 4] = size;
    this.D[n * 4 + 1] = letter;
    this.D[n * 4 + 2] = rot;
    this.count = n + 1;
  }

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
    this.tex.dispose();
    this.count = 0;
  }
}

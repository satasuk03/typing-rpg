/**
 * FxCtx (P3.2): the drawing surface the cue renderers share. One per `PrologueFx`; built once; every frame `begin()` resets the
 * slot counters, the renderers draw into it (particles, quads, ink cards, glyphs, two lights) and `end()` publishes the batches and
 * hides whatever was not used. It holds no cue state: each renderer is a function of (seed, age) and the anchors, so a seek or a
 * second capture draws the same frame.
 *
 * Scaling (all in one place): `k` effectsIntensity, `q` quality multiplier (tier 0 / 1 / 2 = 1 / 0.75 / 0.5), `flashK` 0.5 under
 * reducedFlash. Keep-out: `keepK(x, y, z)` dims a bright effect within 40 CSS px of a plate / dialogue rect (the K2 rule, 1.5 HDR cap).
 */
import { Vector3 } from "three";
import type { DynamicLight } from "../../lighting";
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { FxQuad } from "../FxQuad";
import type { TypingFxSettings } from "../types";
import { AnalyticParticles } from "./AnalyticParticles";
import { GlyphBatch } from "./GlyphBatch";
import { type CardShapeId, InkCards } from "./InkCards";
import { QUALITY_Q, type Rgb } from "./params";
import type { GateInfo, PrologueOut, RuneStone, V3 } from "./types";

/** K2 / brief: nothing brighter than 1.5 HDR within this many CSS px of an active plate or dialogue rect. */
export const KEEP_OUT_PX = 40;
/** What a bright effect is dimmed to inside the band (a 3 HDR colour drops to <= 1.5). */
export const KEEP_OUT_DIM = 0.4;
const KEEP_OUT_CAP = 16;
const NDC = new Vector3();

const POOL = {
  add: 640,
  norm: 320,
  glyph: 128,
  cards: 10,
  glow: 8,
  star: 3,
  line: 5,
  beam: 4,
  disc: 3,
} as const;

export class FxCtx {
  readonly add: AnalyticParticles;
  readonly norm: AnalyticParticles;
  readonly glyphs: GlyphBatch;
  readonly cards: InkCards;
  private readonly glows: FxQuad[] = [];
  private readonly stars: FxQuad[] = [];
  private readonly lines: FxQuad[] = [];
  private readonly beams: FxQuad[] = [];
  private readonly discs: FxQuad[] = [];
  private gi = 0;
  private si = 0;
  private li = 0;
  private bi = 0;
  private di = 0;
  private gShown = 0;
  private sShown = 0;
  private lShown = 0;
  private bShown = 0;
  private dShown = 0;
  private readonly lights: DynamicLight[] = [];
  private lightUsed = [false, false];

  /** effectsIntensity 0..1. */
  k = 1;
  /** Quality multiplier. */
  q = 1;
  tier = 0;
  reducedFlash = false;
  reducedMotion = false;
  /** 0.5 under reducedFlash, else 1: the bright flashes take it. */
  flashK = 1;

  readonly hero: V3 = { x: 0, y: 0, z: 0 };
  readonly boss: V3 = { x: 0, y: 0, z: 0 };
  bossOk = false;
  readonly gate: GateInfo = { x: 0, y: 0, z: 0, scale: 1 };
  readonly tear: V3 = { x: 0, y: 7, z: 0 };
  /** The runestones (up to 6), refreshed each frame. */
  readonly runes: RuneStone[] = Array.from({ length: 6 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    n: 0,
    scale: 1,
    flip: false,
  }));
  runeN = 0;
  readonly out: PrologueOut = {
    vignette: 0,
    flash: 0,
    fogDensity: null,
    heroRim: 0,
    auraSurge: null,
    auraCollapseMs: null,
  };

  /** CSS-px rects (x, y, w, h) the HUD supplies each frame: plates in Part B, the dialogue box (inflated) and ink line in Part C. */
  private readonly ko = new Float32Array(KEEP_OUT_CAP * 4);
  private koN = 0;
  /** Keep-out probe counters (like the Ch2 `kit`): bright spawns checked / dimmed. */
  keepOutChecked = 0;
  keepOutDimmed = 0;

  constructor(readonly world: RenderWorld) {
    const sc = world.scene;
    this.add = new AnalyticParticles(POOL.add, true, sc, 9);
    this.norm = new AnalyticParticles(POOL.norm, false, sc, 12);
    this.glyphs = new GlyphBatch(POOL.glyph, sc, 13);
    this.cards = new InkCards(POOL.cards, sc, 8);
    for (let i = 0; i < POOL.glow; i++) this.glows.push(new FxQuad(world, FxKind.Glow, 8));
    for (let i = 0; i < POOL.star; i++) this.stars.push(new FxQuad(world, FxKind.Star, 10));
    for (let i = 0; i < POOL.line; i++) this.lines.push(new FxQuad(world, FxKind.Line, 10));
    for (let i = 0; i < POOL.beam; i++) this.beams.push(new FxQuad(world, FxKind.Beam, 9));
    for (let i = 0; i < POOL.disc; i++) this.discs.push(new FxQuad(world, FxKind.Disc, 9));
    for (let i = 0; i < 2; i++)
      this.lights.push(
        world.lights.hold({
          x: 0,
          y: 1.2,
          z: 0.6,
          radius: 0,
          color: [1, 1, 1],
          intensity: 0,
          scatter: 0,
        }),
      );
  }

  setSettings(s: TypingFxSettings, tier: number): void {
    this.k = s.effectsIntensity;
    this.reducedFlash = s.reducedFlash;
    this.reducedMotion = s.reducedMotion;
    this.flashK = s.reducedFlash ? 0.5 : 1;
    this.tier = tier;
    this.q = QUALITY_Q[tier] ?? 1;
  }

  /** Count for a base count: x k x q, at least 1 while k > 0. */
  n(base: number): number {
    if (this.k <= 0 || base <= 0) return 0;
    return Math.max(1, Math.round(base * this.k * this.q));
  }
  /** Alpha / intensity factor from effectsIntensity: 0.5 + 0.5 k (0 at k = 0). */
  get ak(): number {
    return this.k <= 0 ? 0 : 0.5 + 0.5 * this.k;
  }

  /** Install this frame's keep-out rects (CSS px). */
  setKeepOut(rects: Float32Array | null, n: number): void {
    if (!rects || n <= 0) {
      this.koN = 0;
      return;
    }
    this.koN = Math.min(KEEP_OUT_CAP, n);
    this.ko.set(rects.subarray(0, this.koN * 4));
  }
  get keepOutRects(): number {
    return this.koN;
  }

  /** True when the world point projects within `pad` CSS px of a keep-out rect. */
  insideKeepOut(x: number, y: number, z: number, pad = KEEP_OUT_PX): boolean {
    if (this.koN === 0 || typeof window === "undefined") return false;
    const n = this.world.camera.project(x, y, z, NDC);
    const px = (n.x * 0.5 + 0.5) * window.innerWidth;
    const py = (-n.y * 0.5 + 0.5) * window.innerHeight;
    const r = this.ko;
    for (let i = 0; i < this.koN; i++) {
      const rx = r[i * 4] as number;
      const ry = r[i * 4 + 1] as number;
      if (
        px >= rx - pad &&
        px <= rx + (r[i * 4 + 2] as number) + pad &&
        py >= ry - pad &&
        py <= ry + (r[i * 4 + 3] as number) + pad
      )
        return true;
    }
    return false;
  }

  /** 1 clear of the rects, `KEEP_OUT_DIM` inside the band. */
  keepK(x: number, y: number, z: number): number {
    this.keepOutChecked++;
    if (!this.insideKeepOut(x, y, z)) return 1;
    this.keepOutDimmed++;
    return KEEP_OUT_DIM;
  }

  // ------------------------------------------------------------------------------------------ frame

  begin(): void {
    this.add.begin();
    this.norm.begin();
    this.glyphs.begin();
    this.cards.begin();
    this.gi = this.si = this.li = this.bi = this.di = 0;
    this.lightUsed[0] = this.lightUsed[1] = false;
    const o = this.out;
    o.vignette = 0;
    o.flash = 0;
    o.fogDensity = null;
    o.heroRim = 0;
    o.auraSurge = null;
    o.auraCollapseMs = null;
    this.add.gain = this.world.additiveGain;
  }

  end(): void {
    this.add.end();
    this.norm.end();
    this.glyphs.end();
    this.cards.end();
    for (let i = this.gi; i < this.gShown; i++) (this.glows[i] as FxQuad).intensity(0);
    for (let i = this.si; i < this.sShown; i++) (this.stars[i] as FxQuad).intensity(0);
    for (let i = this.li; i < this.lShown; i++) (this.lines[i] as FxQuad).intensity(0);
    for (let i = this.bi; i < this.bShown; i++) (this.beams[i] as FxQuad).intensity(0);
    for (let i = this.di; i < this.dShown; i++) (this.discs[i] as FxQuad).intensity(0);
    this.gShown = this.gi;
    this.sShown = this.si;
    this.lShown = this.li;
    this.bShown = this.bi;
    this.dShown = this.di;
    for (let i = 0; i < 2; i++) {
      if (this.lightUsed[i]) continue;
      const L = this.lights[i] as DynamicLight;
      L.intensity = 0;
      L.radius = 0;
    }
  }

  /** Everything off (effects intensity 0, menus). */
  hideAll(): void {
    this.begin();
    this.end();
  }

  // ------------------------------------------------------------------------------------------ particles

  /** Additive particle (glow kind 0, pixel 1, streak 2, hex 3). */
  pa(
    x: number,
    y: number,
    z: number,
    c: Rgb,
    a: number,
    size: number,
    kind = 0,
    vx = 0,
    vy = 0,
    vz = 0,
    st = 0,
  ): void {
    this.add.push(x, y, z, vx, vy, vz, c[0], c[1], c[2], a * this.ak, size, st, kind);
  }
  /** Normal-blend particle (ink, smoke, ash). */
  pn(
    x: number,
    y: number,
    z: number,
    c: Rgb,
    a: number,
    size: number,
    kind = 1,
    vx = 0,
    vy = 0,
    vz = 0,
    st = 0,
  ): void {
    this.norm.push(x, y, z, vx, vy, vz, c[0], c[1], c[2], a, size, st, kind);
  }

  // ------------------------------------------------------------------------------------------ quads

  glow(x: number, y: number, z: number, size: number, c: Rgb, intensity: number): void {
    if (this.gi >= this.glows.length || intensity <= 0) return;
    const q = this.glows[this.gi++] as FxQuad;
    q.color(c[0], c[1], c[2])
      .at(x, y, z)
      .size(size)
      .intensity(intensity * this.ak);
  }

  star(x: number, y: number, z: number, size: number, c: Rgb, intensity: number): void {
    if (this.si >= this.stars.length || intensity <= 0) return;
    const q = this.stars[this.si++] as FxQuad;
    q.color(c[0], c[1], c[2])
      .at(x, y, z)
      .size(size)
      .intensity(intensity * this.ak);
  }

  /** A crisp outline ring (`w` x `h` ellipse), colour c -> c2 over `p`. `flat` lies it on the ground. */
  line(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    p: number,
    c: Rgb,
    c2: Rgb,
    intensity: number,
    flat = false,
  ): void {
    if (this.li >= this.lines.length || intensity <= 0) return;
    const q = this.lines[this.li++] as FxQuad;
    q.color(c[0], c[1], c[2])
      .color2(c2[0], c2[1], c2[2])
      .progress(p)
      .at(x, y, z)
      .size(w, h)
      .intensity(intensity * this.ak);
    q.mesh.rotation.x = flat ? -Math.PI / 2 : 0;
  }

  /** A vertical beam quad bright at its base; `flip` makes it bright at the top. `core` white-ish, `edge` the halo. */
  beam(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    flip: boolean,
    edge: Rgb,
    core: Rgb,
    intensity: number,
  ): void {
    if (this.bi >= this.beams.length || intensity <= 0) return;
    const q = this.beams[this.bi++] as FxQuad;
    q.color(edge[0], edge[1], edge[2])
      .color2(core[0], core[1], core[2])
      .at(x, y, z)
      .size(w, h)
      .intensity(intensity * this.ak);
    q.mesh.rotation.z = flip ? Math.PI : 0;
  }

  /** A flash disc: bright core fading to a crisp rim. */
  disc(
    x: number,
    y: number,
    z: number,
    size: number,
    core: Rgb,
    rim: Rgb,
    intensity: number,
  ): void {
    if (this.di >= this.discs.length || intensity <= 0) return;
    const q = this.discs[this.di++] as FxQuad;
    q.color(core[0], core[1], core[2])
      .color2(rim[0], rim[1], rim[2])
      .at(x, y, z)
      .size(size)
      .intensity(intensity * this.ak);
  }

  card(
    shape: CardShapeId,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    c: Rgb,
    a: number,
    flat: boolean,
    seed = 0,
  ): void {
    this.cards.card(shape, x, y, z, w, d, c[0], c[1], c[2], a, flat, seed);
  }

  glyph(
    x: number,
    y: number,
    z: number,
    size: number,
    letter: number,
    rot: number,
    c: Rgb,
    a: number,
  ): void {
    this.glyphs.push(x, y, z, size, letter, rot, c[0], c[1], c[2], a);
  }

  /** One of two point lights (`slot` 0 / 1): re-set every frame; unused ones go dark in `end`. */
  light(
    slot: 0 | 1,
    x: number,
    y: number,
    z: number,
    c: Rgb,
    intensity: number,
    radius: number,
  ): void {
    const L = this.lights[slot] as DynamicLight;
    this.lightUsed[slot] = true;
    L.x = x;
    L.y = y;
    L.z = z;
    L.radius = intensity > 0.001 ? radius : 0;
    const col = L.color as unknown as number[];
    col[0] = c[0];
    col[1] = c[1];
    col[2] = c[2];
    L.intensity = intensity * this.k * (this.reducedFlash ? 0.5 : 1);
  }

  /** Diagnostics for tests and the dev overlay. */
  diagnostics(): {
    additive: number;
    normal: number;
    glyphs: number;
    cards: number;
    quads: number;
    dropped: number;
  } {
    return {
      additive: this.add.count,
      normal: this.norm.count,
      glyphs: this.glyphs.count,
      cards: this.cards.live,
      quads: this.gi + this.si + this.li + this.bi + this.di,
      dropped: this.add.dropped + this.norm.dropped,
    };
  }

  dispose(): void {
    this.add.dispose();
    this.norm.dispose();
    this.glyphs.dispose();
    this.cards.dispose();
    for (const q of [...this.glows, ...this.stars, ...this.lines, ...this.beams, ...this.discs])
      q.dispose();
    for (const L of this.lights) L.dead = true;
  }
}

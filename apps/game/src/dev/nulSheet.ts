// biome-ignore-all lint: dense art/measurement code (same convention as the sprite generators).
// biome-ignore-all format: see above.
/**
 * DEV-ONLY P2.1 Nul contact sheets and in-world viewer: `?scene=nul-sheet&view=frames|sil|compare|strip|world`.
 *   frames:  every one of the 22 frames (+ the ward rim variant), colour | glow | authored normal, on the storm-gold grade
 *   sil:     alpha silhouette at 50%, value (luma 0.5) silhouette at 50%, normal-map view, glow layer
 *   compare: Nul next to the hero, Hush Shade, Wisp, Willow core and Golem at in-game scales, storm-gold and neutral grey
 *   strip:   an animation strip (every anim, every frame, in order)
 *   world:   `&id=ch1-l05&pose=boss|battle:1&mood=storm|unwritten|none&ward=1` Nul on the real ruins biome through the real render core
 * Sets `window.__nulSheet = { ready, numbers }` (the measured luma / silhouette numbers) and `window.__renderTest.ready`.
 */
import { RenderWorld } from "../render";
import { BIOMES, type BiomeMood, blendMood } from "../render/biomes";
import { ProceduralSpriteSource } from "../render/sprites/ProceduralSpriteSource";
import {
  HERO_HEIGHT_TX,
  NUL_ANIMS,
  NUL_H,
  NUL_PLATE_Y_M,
  PART,
  renderNulRaw,
} from "../render/sprites/prologueArt";
import type { SpriteFrame } from "../render/sprites/SpriteSource";
import { buildWorld, loadLevel, toRenderBiome } from "../render/world";

type Img = CanvasImageSource & { width: number; height: number };
type Raw = ReturnType<typeof renderNulRaw>;

declare global {
  interface Window {
    __nulSheet?: { ready: boolean; numbers: Record<string, unknown>; [k: string]: unknown };
  }
}

/** The Word Gate segment grade (docs/vfx/prologue-art-direction.md 2.1) and UNWRITTEN (2.2): scratch copies for the viewer only. */
export const STORM_GOLD: BiomeMood = {
  ...BIOMES.ruins,
  amb: [0.26, 0.2, 0.31], gamb: [0.22, 0.13, 0.08], sunCol: [2.05, 1.22, 0.52], sunDir: [-0.38, 0.3, -0.87],
  fogCol: [0.7, 0.4, 0.21], fog: [0.011, 14, 0.26], scatter: 0.95, exposure: 1.0, lift: [0.026, 0.012, 0.042],
  gamma: [1, 1, 1.02], gain: [1.1, 0.98, 0.83], sat: 1.18, contrast: 1.15, sh: [0.02, 0.0, 0.055], hi: [0.065, 0.035, 0.0],
  bloom: 0.62, thr: 0.95, vig: 0.56, clear: [0.7, 0.4, 0.21], rays: 1.5, fill: 0.45, ambient: "embers",
};
export const UNWRITTEN: BiomeMood = {
  ...STORM_GOLD,
  amb: [0.22, 0.23, 0.26], gamb: [0.12, 0.12, 0.13], sunCol: [0.62, 0.64, 0.7], fogCol: [0.3, 0.31, 0.34], fog: [0.012, 14, 0.3],
  scatter: 0.35, exposure: 0.92, lift: [0.012, 0.014, 0.02], gain: [0.96, 0.98, 1.02], sat: 0.15, contrast: 1.0,
  sh: [0.0, 0.006, 0.02], hi: [0.0, 0.005, 0.015], bloom: 0.25, thr: 1.15, vig: 0.71, clear: [0.3, 0.31, 0.34], rays: 0.2, fill: 0.25, ambient: "none",
};

const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

function toCanvas(f: Raw, kind: "col" | "nrm" | "glw", black = false): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = f.w; c.height = f.h;
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  if (black) { x.fillStyle = "#000"; x.fillRect(0, 0, f.w, f.h); }
  const id = x.createImageData(f.w, f.h);
  id.data.set(f[kind]);
  if (black) { const t = document.createElement("canvas"); t.width = f.w; t.height = f.h; (t.getContext("2d") as CanvasRenderingContext2D).putImageData(id, 0, 0); x.drawImage(t, 0, 0); } else x.putImageData(id, 0, 0);
  return c;
}

/** Numbers for the R0 checklist (sprite-level; the in-render ones come from the Playwright still). */
export function measureNul(): Record<string, unknown> {
  const f = renderNulRaw(NUL_ANIMS.idle[0] as never, { outline: false, flip: false });
  let ms = 0, mn = 0, cs = 0, cn = 0, top = f.h, bottom = 0;
  for (let i = 0; i < f.w * f.h; i++) {
    if (!f.col[i * 4 + 3]) continue;
    const y = Math.floor(i / f.w);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    const l = lum(f.col[i * 4] ?? 0, f.col[i * 4 + 1] ?? 0, f.col[i * 4 + 2] ?? 0);
    if (f.part[i] === PART.mask) { ms += l; mn++; }
    else if (f.part[i] === PART.cloak) { cs += l; cn++; }
  }
  const m = ms / mn, c = cs / cn;
  return { heightTx: bottom - top + 1, heroTx: HERO_HEIGHT_TX, heightRatio: (bottom - top + 1) / HERO_HEIGHT_TX, maskLum: m, cloakLum: c, contrastRatio: (m + 0.05) / (c + 0.05), plainRatio: m / c, platey: NUL_PLATE_Y_M };
}

function sheet(canvas: HTMLCanvasElement, view: string): void {
  const src = new ProceduralSpriteSource();
  const W = 1920;
  const H = view === "frames" ? 1130 : view === "sil" ? 700 : view === "strip" ? 460 : 760;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const label = (t: string, x: number, y: number, size = 14, col = "#cfc6b0"): void => { g.font = `${size}px monospace`; g.fillStyle = col; g.fillText(t, x, y); };
  const storm = (x: number, y: number, w: number, h: number): void => {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#3a2850"); gr.addColorStop(0.45, "#c0703a"); gr.addColorStop(0.8, "#f0b060"); gr.addColorStop(1, "#4a3020");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const grey = (x: number, y: number, w: number, h: number): void => { g.fillStyle = "#6a6a72"; g.fillRect(x, y, w, h); };
  const draw = (im: Img, x: number, base: number, s: number): number => { g.drawImage(im, x, base - im.height * s, im.width * s, im.height * s); return im.width * s; };
  const nulFrames = src.frames("monster.nul", "idle");
  void nulFrames;
  const all: { name: string; f: Raw }[] = [];
  for (const [k, poses] of Object.entries(NUL_ANIMS)) { if (k === "atk") continue; poses.forEach((p: never, i: number) => {
      all.push({ name: `${k} ${i}`, f: renderNulRaw(p as never) });
    }); }
  const numbers = measureNul();

  if (view === "frames") {
    g.fillStyle = "#14141c"; g.fillRect(0, 0, W, H);
    label("NUL, THE SILENT KING: all 22 frames (3x) on the storm-gold backdrop; every frame shares one anchor (foot line = the rule)", 20, 24, 15, "#ffd27a");
    const cols = 8, cw = 232, ch = 270, S = 2.5;
    all.forEach((a, i) => {
      const ox = 12 + (i % cols) * cw, oy = 40 + Math.floor(i / cols) * ch;
      storm(ox, oy, cw - 8, ch - 8);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(ox, oy + ch - 8 - 2 * S, cw - 8, 1);
      draw(toCanvas(a.f, "col"), ox + (cw - 8) / 2 - 59 * S, oy + ch - 8 - 2 * S + 2, S);
      g.globalCompositeOperation = "lighter";
      draw(toCanvas(a.f, "glw"), ox + (cw - 8) / 2 - 59 * S, oy + ch - 8 - 2 * S + 2, S);
      g.globalCompositeOperation = "source-over";
      label(a.name, ox + 6, oy + 16, 13, "#fff");
    });
    // glow is drawn above: re-draw colour at reduced alpha is unnecessary; the glow layer here is additive-looking on purpose.
    done(numbers);
    return;
  }
  if (view === "sil") {
    g.fillStyle = "#14141c"; g.fillRect(0, 0, W, H);
    label("idle[0]: colour 4x | alpha silhouette 50% (x8) | value silhouette 50%, luma > 0.5 (x8) | normal map 4x | glow layer 4x", 20, 24, 15, "#ffd27a");
    const f = renderNulRaw(NUL_ANIMS.idle[0] as never);
    const hw = f.w >> 1, hh = f.h >> 1;
    const alpha = document.createElement("canvas"); alpha.width = hw; alpha.height = hh;
    const val = document.createElement("canvas"); val.width = hw; val.height = hh;
    const ax = alpha.getContext("2d") as CanvasRenderingContext2D, vx = val.getContext("2d") as CanvasRenderingContext2D;
    const ad = ax.createImageData(hw, hh), vd = vx.createImageData(hw, hh);
    let brightPx = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      let a = 0, s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = (2 * y + dy) * f.w + 2 * x + dx; if (f.col[i * 4 + 3]) { a++; s += lum(f.col[i * 4] ?? 0, f.col[i * 4 + 1] ?? 0, f.col[i * 4 + 2] ?? 0); } }
      const o = (y * hw + x) * 4, solid = a >= 2, bright = solid && s / a > 0.5;
      if (bright) brightPx++;
      ad.data.set(solid ? [0, 0, 0, 255] : [255, 255, 255, 255], o);
      vd.data.set(bright ? [255, 255, 255, 255] : solid ? [40, 40, 60, 255] : [0, 0, 0, 255], o);
    }
    ax.putImageData(ad, 0, 0); vx.putImageData(vd, 0, 0);
    numbers.valueBrightPx50 = brightPx;
    draw(toCanvas(f, "col"), 20, 650, 4);
    draw(alpha, 420, 650, 8);
    draw(val, 420 + hw * 8 + 30, 650, 8);
    draw(toCanvas(f, "nrm"), 420 + hw * 16 + 70, 650, 4);
    draw(toCanvas(f, "glw", true) as Img, 420 + hw * 16 + 70 + f.w * 4 + 30, 650, 4);
    done(numbers);
    return;
  }
  if (view === "strip") {
    storm(0, 0, W, H);
    label("NUL animation strip (idle x4, cast x3, write x3, catch x2, reach x2, hurt x2, intro x4, rise x2), 2x", 16, 22, 15, "#fff");
    const S = 1.55; let x = 8, y = 36, n = 0;
    for (const a of all) {
      draw(toCanvas(a.f, "col"), x, y + 100 * S, S);
      label(a.name, x + 20, y + 100 * S + 14, 11, "#fff");
      x += 96 * S * 0.95; n++;
      if (n % 12 === 0) { x = 8; y += 100 * S + 22; }
    }
    done(numbers);
    return;
  }
  // compare
  const frameOf = (k: string, a = "idle", i = 0): SpriteFrame => src.frames(k, a)[i] as SpriteFrame;
  const lineup: [string, SpriteFrame, number][] = [
    ["hero 1.0", frameOf("hero"), 1.0], ["shade 1.1", frameOf("monster.shade"), 1.1], ["wisp 1.2", frameOf("monster.wisp"), 1.2],
    ["golem 1.6", frameOf("monster.golem"), 1.6], ["willow core 1.15", frameOf("monster.willow", "p1"), 1.15 * 0.5],
  ];
  const nulF = rawFrame(all[0]?.f as Raw);
  const row = (y0: number, bg: (x: number, y: number, w: number, h: number) => void, title: string): void => {
    bg(0, y0, W, 360);
    label(title, 16, y0 + 20, 15, "#fff");
    const S = 3.0, base = y0 + 340;
    let x = 30;
    for (const [name, f, sc] of lineup) {
      const w = f.w * S * sc;
      g.drawImage(f.img as Img, x, base - f.h * S * sc + (f.h - f.ay) * S * sc, w, f.h * S * sc);
      label(name, x, base + 14, 12, "#fff");
      x += w + 20;
    }
    g.drawImage(nulF.img as Img, x, base - nulF.h * S + (nulF.h - nulF.ay) * S, nulF.w * S, nulF.h * S);
    label("NUL 1.0 (2.35x hero)", x + 80, base + 14, 12, "#ffd27a");
  };
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  row(0, storm, "storm-gold backdrop, in-game scale (3 screen px per texel at scale 1.0); willow core shown at half scale");
  row(380, grey, "neutral grey");
  done(numbers);
}

function rawFrame(f: Raw): { img: Img; w: number; h: number; ay: number } {
  return { img: toCanvas(f, "col"), w: f.w, h: f.h, ay: NUL_H - 2 };
}

function done(numbers: Record<string, unknown>): void {
  window.__nulSheet = { ready: true, numbers };
  (window as unknown as { __renderTest: unknown }).__renderTest = { ready: true, step: () => undefined };
}

function world(canvas: HTMLCanvasElement, q: URLSearchParams): void {
  const id = q.get("id") ?? "ch1-l05";
  const layout = loadLevel(id);
  const w = new RenderWorld({ biome: toRenderBiome(layout.biome), quality: 0 });
  w.init(canvas);
  const handle = buildWorld(layout, w, w.source);
  const moodName = q.get("mood") ?? "storm";
  const forced = moodName === "storm" ? STORM_GOLD : moodName === "unwritten" ? UNWRITTEN : moodName === "mid" ? blendMood(STORM_GOLD, UNWRITTEN, 0.5) : null;
  const applyMood = (): void => { if (forced) w.setMood(forced, "ruins"); }; // the segment mood would otherwise win every frame
  applyMood();
  const poseName = q.get("pose") ?? "boss";
  const idx = poseName === "boss" ? (layout.encounters.find((e) => e.boss)?.index ?? 1) : Number(poseName.split(":")[1]);
  const enc = handle.encounter(idx);
  handle.setLetterbox(q.get("bars") !== "0" && poseName === "boss");
  const cam = handle.cameraPose(poseName as never);
  const hero = w.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
  hero.setFrame(w.source.frames("hero", "idle")[0] as SpriteFrame);
  hero.place(enc.hero.x, 0, enc.hero.z);
  w.shadowFor(hero, enc.hero.x, enc.hero.z);
  const slot = enc.slots.find((s) => s.kind === "boss") ?? enc.slots[enc.slots.length - 1];
  const key = q.get("ward") === "1" ? "monster.nul.ward" : "monster.nul";
  const anim = q.get("anim") ?? "idle";
  const nul = w.addActor(key, anim, { scale: 1.0, rim: 1.4, blobW: 1.1 });
  nul.setFrame(w.source.frames(key, anim)[Number(q.get("frame") ?? "0")] as SpriteFrame);
  const nx = (slot?.x ?? enc.hero.x + 10) + Number(q.get("nx") ?? "0"), nz = slot?.z ?? enc.hero.z;
  nul.place(nx, 0, nz);
  w.shadowFor(nul, nx, nz);
  w.camera.setTarget(cam);
  w.camera.snap();
  handle.update(1 / 60, cam.x);
  applyMood();
  w.update(1 / 60);
  handle.warmUp(3, cam.x);
  const step = (n: number): void => { for (let i = 0; i < n; i++) { handle.update(1 / 60, w.camera.pose.x); applyMood(); w.update(1 / 60, 0); } w.render(); };
  const project = (x: number, y: number, z: number): { x: number; y: number } => {
    const p = w.camera.project(x, y, z), r = canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  };
  // screen points of interest (CSS px): mask forehead, mid cloak, the sky/fog just above-left of the shoulder, the boss plate anchor
  const pts = {
    mask: project(nx, 56.5 / 16, nz), cloak: project(nx, 20 / 16, nz), cloakHi: project(nx, 30 / 16, nz),
    backdrop: project(nx - 1.6, 3.6, nz), plate: project(nx, NUL_PLATE_Y_M, nz), crown: project(nx, 73 / 16, nz),
  };
  window.__nulSheet = { ready: true, numbers: {}, pts, step, nx, nz };
  (window as unknown as { __renderTest: unknown }).__renderTest = { world: w, step, ready: true };
  step(20);
}

export function start(canvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const view = q.get("view") ?? "frames";
  if (view === "world") world(canvas, q);
  else sheet(canvas, view);
}

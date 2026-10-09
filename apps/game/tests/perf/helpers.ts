import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

export interface FrameSample {
  dt: number;
  phase: string;
  calls: number;
  tris: number;
  /** Main-thread JS time spent in rAF callbacks this frame (sim step, HUD, render submit), ms. */
  cpu: number;
  /** Main-thread time inside hud.render (update + 2D draw) this frame, ms. */
  hud: number;
  /** Main-thread time inside world.render (three.js submit) this frame, ms. */
  gl: number;
}

interface Probe {
  frames: FrameSample[];
  last: number;
}

export interface Errors {
  list: string[];
  warnings: string[];
}

/** Collect console errors, page errors and unhandled rejections. Warnings are kept separately. */
export function watchErrors(page: Page): Errors {
  const e: Errors = { list: [], warnings: [] };
  page.on("console", (m) => {
    if (m.type() === "error") e.list.push(`console.error: ${m.text()}`);
    else if (m.type() === "warning") e.warnings.push(m.text());
  });
  page.on("pageerror", (err) => e.list.push(`pageerror: ${String(err)}`));
  // The console message for a failed fetch carries no URL; log it so a 404 can be traced.
  page.on("response", (r) => {
    if (r.status() >= 400) e.list.push(`http ${r.status()}: ${r.url()}`);
  });
  return e;
}

/** Return the unmasked WebGL renderer; fails the run unless it is a real Apple/Metal GPU. */
export async function assertRealGpu(page: Page): Promise<string> {
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    return g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "no-webgl2";
  });
  expect(gpu, `GPU string "${gpu}" is not a real Apple/Metal GPU`).toMatch(/Apple|Metal/i);
  expect(gpu).not.toMatch(/SwiftShader|llvmpipe|Software/i);
  return gpu;
}

export interface PlayOpts {
  tier?: number;
  wpm?: number;
  seed?: number;
  acc?: number;
}

export function playUrl(level: string, o: PlayOpts = {}): string {
  const q = new URLSearchParams({
    scene: "play",
    level,
    "wpm-bot": String(o.wpm ?? 60),
    tier: String(o.tier ?? 0),
    "bot-seed": String(o.seed ?? 3),
  });
  if (o.acc !== undefined) q.set("bot-acc", String(o.acc));
  return `/?${q.toString()}`;
}

export async function openLevel(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 60_000 });
}

/** In-page per-frame instrumentation: rAF delta, sim phase and summed draw calls / triangles per frame. */
export async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const play = window.__play as PlayDebug;
    const renderer = play.session.world.renderer;
    // The post chain renders several passes per frame, so info is not auto-reset: summed and reset per rAF.
    renderer.info.autoReset = false;
    const probe: Probe = { frames: [], last: 0 };
    (window as unknown as { __probe: Probe }).__probe = probe;
    // Time every rAF callback (the session re-arms through window.requestAnimationFrame each frame).
    const rawRaf = window.requestAnimationFrame.bind(window);
    let cpuAcc = 0;
    let hudAcc = 0;
    let glAcc = 0;
    const hud = play.session.hud;
    const world = play.session.world;
    const hudRender = hud.render.bind(hud);
    hud.render = (...a: Parameters<typeof hudRender>): void => {
      const s0 = performance.now();
      hudRender(...a);
      hudAcc += performance.now() - s0;
    };
    const glRender = world.render.bind(world);
    world.render = (...a: Parameters<typeof glRender>): void => {
      const s0 = performance.now();
      glRender(...a);
      glAcc += performance.now() - s0;
    };
    window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
      rawRaf((t) => {
        const s0 = performance.now();
        cb(t);
        cpuAcc += performance.now() - s0;
      });
    const tick = (t: number): void => {
      const i = renderer.info;
      if (probe.last > 0) {
        probe.frames.push({
          dt: t - probe.last,
          phase: play.phase(),
          calls: i.render.calls,
          tris: i.render.triangles,
          cpu: cpuAcc,
          hud: hudAcc,
          gl: glAcc,
        });
        cpuAcc = 0;
        hudAcc = 0;
        glAcc = 0;
      }
      probe.last = t;
      i.reset();
      rawRaf(tick);
    };
    rawRaf(tick);
  });
}

export async function drainFrames(page: Page): Promise<FrameSample[]> {
  return page.evaluate(() => (window as unknown as { __probe: Probe }).__probe.frames.splice(0));
}

export interface Summary {
  frames: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  calls: number;
  tris: number;
  cpuAvg: number;
  cpuP95: number;
  hudAvg: number;
  glAvg: number;
}

export function summarize(s: FrameSample[]): Summary {
  const dts = s.map((f) => f.dt).sort((a, b) => a - b);
  const q = (p: number): number =>
    dts.length ? (dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] ?? 0) : 0;
  const cpus = s.map((f) => f.cpu).sort((a, b) => a - b);
  const mean = (k: "calls" | "tris" | "cpu" | "hud" | "gl"): number =>
    s.length ? s.reduce((a, f) => a + f[k], 0) / s.length : 0;
  return {
    frames: dts.length,
    avg: dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: dts.length ? (dts[dts.length - 1] ?? 0) : 0,
    calls: mean("calls"),
    tris: mean("tris"),
    cpuAvg: mean("cpu"),
    hudAvg: mean("hud"),
    glAvg: mean("gl"),
    cpuP95: cpus[Math.min(cpus.length - 1, Math.floor(0.95 * cpus.length))] ?? 0,
  };
}

export const fmt = (n: number, d = 1): string => n.toFixed(d);

export const row = (label: string, s: Summary): string =>
  `${label} | frames ${s.frames} | avg ${fmt(s.avg)} p50 ${fmt(s.p50)} p95 ${fmt(s.p95)} p99 ${fmt(s.p99)} max ${fmt(s.max)} ms | cpu avg ${fmt(s.cpuAvg, 2)} (hud ${fmt(s.hudAvg, 2)} gl ${fmt(s.glAvg, 2)}) p95 ${fmt(s.cpuP95, 2)} | calls ${fmt(s.calls, 0)} tris ${fmt(s.tris, 0)}`;

/**
 * Count live WebGL objects (framebuffers = render targets, textures, buffers, ...) by wrapping create/delete on the
 * context prototype before any page script runs. Counts land in `window.__gl` keyed by object kind.
 */
export async function installGlCounters(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts: Record<string, number> = {};
    (window as unknown as { __gl: Record<string, number> }).__gl = counts;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    for (const kind of [
      "Framebuffer",
      "Renderbuffer",
      "Texture",
      "Buffer",
      "VertexArray",
      "Program",
    ]) {
      const key = (kind[0] ?? "").toLowerCase() + kind.slice(1);
      counts[key] = 0;
      const create = proto[`create${kind}`];
      const del = proto[`delete${kind}`];
      if (!create || !del) continue;
      proto[`create${kind}`] = function (this: unknown, ...a: unknown[]) {
        const o = create.apply(this, a);
        if (o) counts[key] = (counts[key] ?? 0) + 1;
        return o;
      };
      proto[`delete${kind}`] = function (this: unknown, ...a: unknown[]) {
        if (a[0]) counts[key] = (counts[key] ?? 0) - 1;
        return del.apply(this, a);
      };
    }
  });
}

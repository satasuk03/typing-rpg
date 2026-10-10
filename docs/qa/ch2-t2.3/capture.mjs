// T2.1 evidence capture on the real GPU (Metal via ANGLE). Run from the repo root with the dev server up:
//   node docs/qa/ch2-t2.1/capture.mjs shot <outDir> <port> <name>=<path+query>@<W>x<H> ...
//   node docs/qa/ch2-t2.1/capture.mjs bench <port> <path+query> [tier ...]        (frame ms per tier, uncapped)
//   node docs/qa/ch2-t2.1/capture.mjs hero <outDir> <port> <name>=<path+query>@<W>x<H> ...  (hero luminance / silhouette)
// PNGs land in <outDir>; docs/qa/ch2-t2.1/jpeg.py turns them into <400 KB JPEGs.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(new URL("../../../apps/game/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [mode, ...args] = process.argv.slice(2);
const uncapped = mode === "bench" ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [];
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", ...uncapped],
});
const errs = [];
const open = async (port, url, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(e.stack));
  await page.goto(`http://localhost:${port}${url}`);
  await page.waitForFunction(() => window.__renderTest?.ready === true || window.__levelScene?.ready === true, null, { timeout: 120000 });
  return page;
};
const parse = (spec) => {
  const i = spec.indexOf("=");
  const name = spec.slice(0, i);
  const m = spec.slice(i + 1).match(/^(.*)@(\d+)x(\d+)$/);
  return { name, url: m[1], w: Number(m[2]), h: Number(m[3]) };
};

if (mode === "shot") {
  const [outDir, port, ...specs] = args;
  for (const spec of specs) {
    const { name, url, w, h } = parse(spec);
    const page = await open(port, url, w, h);
    await page.evaluate(() => window.__renderTest.step(30, 1 / 60));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log("shot", name, w, h);
    await page.close();
  }
} else if (mode === "bench") {
  const [port, url, ...tiers] = args;
  const out = {};
  for (const t of tiers.length ? tiers : ["0", "1", "2"]) {
    const page = await open(port, `${url}&tier=${t}&freeze=1`, 1920, 1080);
    const gpu = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; });
    // capped (vsync) numbers come from the rAF loop in the unfrozen scene; the bench() call is the uncapped GPU cost
    const r = await page.evaluate((tt) => window.__renderTest.bench(tt, 300), Number(t));
    out[`tier${t}`] = { gpu, ...r };
    await page.close();
  }
  console.log(JSON.stringify(out, null, 1));
} else if (mode === "hero") {
  // Hero silhouette / luminance: render the same frame with the hero shown and hidden; the mask is every pixel that differs.
  //   silhouette = pixels of the hero that stand out from what is behind them (colour distance > 24) / pixels that differ at all
  //   contrast   = WCAG (L1 + .05)/(L2 + .05) between the hero's mean linear luminance and its surround (64 px ring)
  const [outDir, port, ...specs] = args;
  const res = {};
  for (const spec of specs) {
    const { name, url, w, h } = parse(spec);
    const page = await open(port, url, w, h);
    await page.evaluate(() => window.__renderTest.step(30, 1 / 60));
    const r = await page.evaluate(async () => {
      const grab = async (visible) => {
        window.__ch2Scene.setHeroVisible(visible);
        const gl = document.querySelector("canvas#gl") ?? document.querySelector("canvas");
        const c = document.createElement("canvas");
        c.width = gl.width; c.height = gl.height;
        const x = c.getContext("2d", { willReadFrequently: true });
        window.__renderTest.world.render();
        x.drawImage(gl, 0, 0);
        return x.getImageData(0, 0, c.width, c.height);
      };
      const shown = await grab(true);
      const hidden = await grab(false);
      window.__ch2Scene.setHeroVisible(true);
      const rc = window.__ch2Scene.heroRect();
      const gl = document.querySelector("canvas#gl") ?? document.querySelector("canvas");
      const k = gl.width / gl.getBoundingClientRect().width;
      const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      const x0 = Math.max(0, Math.round(rc.x * k)), y0 = Math.max(0, Math.round(rc.y * k));
      const x1 = Math.min(shown.width, Math.round((rc.x + rc.w) * k)), y1 = Math.min(shown.height, Math.round((rc.y + rc.h) * k));
      let anyDiff = 0, standOut = 0, heroL = 0, n = 0;
      const M = 64;
      let surL = 0, surN = 0;
      for (let y = Math.max(0, y0 - M); y < Math.min(shown.height, y1 + M); y++) for (let x = Math.max(0, x0 - M); x < Math.min(shown.width, x1 + M); x++) {
        const i = (y * shown.width + x) * 4;
        const dist = Math.hypot(shown.data[i] - hidden.data[i], shown.data[i + 1] - hidden.data[i + 1], shown.data[i + 2] - hidden.data[i + 2]);
        const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
        if (inside && dist > 0) { anyDiff++; if (dist > 24) { standOut++; heroL += lum(shown.data, i); n++; } }
        if (!inside) { surL += lum(hidden.data, i); surN++; }
      }
      const hl = n ? heroL / n : 0, sl = surN ? surL / surN : 0;
      // expected hero area: the sprite's opaque texels x (screen px per texel)^2, projected at the hero's depth
      const w = window.__renderTest.world, f = w.source.frames("hero", "idle")[0];
      const cc = document.createElement("canvas"); cc.width = f.img.width; cc.height = f.img.height;
      const cx = cc.getContext("2d", { willReadFrequently: true }); cx.drawImage(f.img, 0, 0);
      const ad = cx.getImageData(0, 0, cc.width, cc.height).data; let opaque = 0; for (let i = 3; i < ad.length; i += 4) if (ad[i] > 127) opaque++;
      const hp = window.__ch2Scene.heroWorld();
      const p0 = w.camera.project(hp.x, 1, hp.z), p1 = w.camera.project(hp.x + 1, 1, hp.z);
      const ppm = Math.abs(p1.x - p0.x) * 0.5 * gl.width;
      const expected = opaque * (ppm / 16) ** 2;
      return { anyDiff, standOut, expected: Math.round(expected), silhouette: Math.min(1, standOut / expected), silhouetteRaw: standOut / expected, heroLum: hl, surroundLum: sl, contrast: (Math.max(hl, sl) + 0.05) / (Math.min(hl, sl) + 0.05), rect: rc };
    });
    res[name] = r;
    console.log(name, JSON.stringify(r));
    await page.close();
  }
  writeFileSync(`${outDir}/hero-metrics.json`, JSON.stringify(res, null, 2));
}
if (errs.length) console.log("ERRORS", errs.slice(0, 5));
await browser.close();

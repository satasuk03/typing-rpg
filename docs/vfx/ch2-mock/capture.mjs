// C0.2 scratch: capture mock stills on the real GPU (Metal via ANGLE), 1920x1080 @ DPR 1.
//   node docs/vfx/ch2-mock/capture.mjs <outDir> <name>=<url> [<name>=<url> ...]
// Also: node capture.mjs <outDir> --bench <url>   (prints avg/p95 frame ms over 300 frames)
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/game/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [outDir, ...rest] = process.argv.slice(2);
const uncapped = rest[0] === "--bench" ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [];
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", ...uncapped],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${m.type()}]`, m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.stack));

if (rest[0] === "--bench") {
  const url = rest[1];
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  const gpu = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?"; });
  if (rest[2]) { const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(rest[2]) }); }
  const r = await page.evaluate(() => window.__mock.bench(300));
  console.log(JSON.stringify({ url, gpu, throttle: rest[2] ?? 1, ...r }));
} else {
  for (const spec of rest) {
    const i = spec.indexOf("=");
    const name = spec.slice(0, i), url = spec.slice(i + 1);
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true || window.__levelScene?.ready === true, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log("shot", name);
  }
}
await browser.close();

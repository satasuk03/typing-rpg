import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

/**
 * T6.3 level-data polish (backlog #4-#7, #21, #22): captures L4/L8/L9/L10 on the real GPU and asserts
 *  - L10 mean frame hue is violet (270-300 deg) in every pose,
 *  - L9 mean luma is >= 25 % above the pre-polish baseline (polish-baseline.json).
 * POLISH_PHASE=before records the baseline stats (no asserts); the default phase is "after".
 */
const here = dirname(fileURLToPath(import.meta.url));
const PHASE = process.env.POLISH_PHASE ?? "after";
const OUT = join(here, "__shots__", "polish", PHASE);
const BASELINE = join(here, "polish-baseline.json");
mkdirSync(OUT, { recursive: true });

const CASES: Array<{ id: string; poses: string[] }> = [
  { id: "ch1-l04", poses: ["walk", "battle:1"] },
  { id: "ch1-l08", poses: ["walk", "battle:1"] },
  { id: "ch1-l09", poses: ["walk", "battle:1"] },
  { id: "ch1-l10", poses: ["walk", "battle:1", "boss"] },
];

export interface FrameStats {
  luma: number;
  hue: number;
  sat: number;
}

/** Decode a PNG in the page and return mean luma (0..1, Rec.709 on display values) and the hue of the mean RGB. */
async function frameStats(page: Page, png: Buffer): Promise<FrameStats> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext("2d");
    if (!g) throw new Error("no 2d context");
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let r = 0;
    let gg = 0;
    let b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i] ?? 0;
      gg += d[i + 1] ?? 0;
      b += d[i + 2] ?? 0;
    }
    r /= n * 255;
    gg /= n * 255;
    b /= n * 255;
    const mx = Math.max(r, gg, b);
    const mn = Math.min(r, gg, b);
    const dl = mx - mn;
    let h = 0;
    if (dl > 0) {
      if (mx === r) h = ((gg - b) / dl) % 6;
      else if (mx === gg) h = (b - r) / dl + 2;
      else h = (r - gg) / dl + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { luma: 0.2126 * r + 0.7152 * gg + 0.0722 * b, hue: h, sat: mx === 0 ? 0 : dl / mx };
  }, png.toString("base64"));
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => window.__renderTest?.step(20, 1 / 60));
}

test("level polish captures + stats", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto("/");
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    return g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "no-webgl2";
  });
  expect(gpu, "must run on the real Metal GPU").toMatch(/Apple|Metal/i);

  const stats: Record<string, FrameStats> = {};
  for (const { id, poses } of CASES) {
    await page.goto(`/?scene=level&id=${id}&pose=${poses[0]}&tier=0&freeze=1`);
    await page.waitForFunction(() => window.__levelScene?.ready === true, undefined, {
      timeout: 120_000,
    });
    for (const pose of poses) {
      await page.evaluate((p) => window.__levelScene?.setPose(p), pose);
      await settle(page);
      const png = await page.screenshot({ path: join(OUT, `${id}-${pose.replace(":", "")}.png`) });
      stats[`${id}/${pose}`] = await frameStats(page, png);
    }
  }
  writeFileSync(join(OUT, "stats.json"), `${JSON.stringify({ gpu, stats }, null, 2)}\n`);
  expect(errors).toEqual([]);

  if (PHASE === "before") {
    writeFileSync(BASELINE, `${JSON.stringify(stats, null, 2)}\n`);
    return;
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, FrameStats>;
  for (const pose of ["walk", "battle:1", "boss"]) {
    const s = stats[`ch1-l10/${pose}`] as FrameStats;
    expect(s.hue, `L10 ${pose} mean hue ${s.hue.toFixed(1)}`).toBeGreaterThanOrEqual(270);
    expect(s.hue, `L10 ${pose} mean hue ${s.hue.toFixed(1)}`).toBeLessThanOrEqual(300);
  }
  for (const pose of ["walk", "battle:1"]) {
    const a = (stats[`ch1-l09/${pose}`] as FrameStats).luma;
    const b = (base[`ch1-l09/${pose}`] as FrameStats).luma;
    expect(a, `L9 ${pose} luma ${a.toFixed(4)} vs before ${b.toFixed(4)}`).toBeGreaterThanOrEqual(
      b * 1.25,
    );
  }
});

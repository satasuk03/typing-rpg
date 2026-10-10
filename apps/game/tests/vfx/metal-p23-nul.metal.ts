// biome-ignore-all format: dense measurement code (same convention as the sprite generators).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";

/**
 * P2.3 Nul polish stills + in-render numbers on Metal. Run twice (before / after the fix), with a unique port:
 *   NUL_TAG=after NUL_OUT=<dir> PW_PORT=5427 ./node_modules/.bin/playwright test -c tests/vfx/playwright.metal.config.ts metal-p23-nul
 */
const TAG = process.env.NUL_TAG ?? "after";
const OUT = process.env.NUL_OUT ?? join(process.cwd(), "tests", "vfx", "__shots__");
mkdirSync(OUT, { recursive: true });

async function open(page: Page, q: string): Promise<void> {
  await page.goto(`/?scene=nul-sheet&view=world&${q}&tier=0&freeze=1`);
  await page.waitForFunction(() => window.__nulSheet?.ready === true && (window.__nulSheet as { pts?: unknown }).pts !== undefined, undefined, { timeout: 120_000 });
  await page.evaluate(() => (window.__nulSheet as unknown as { step: (n: number) => void }).step(30));
}

/** Mean relative luminance of the rendered pixels at world samples (read back in the same task as the render). */
async function sample(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const s = window.__nulSheet as unknown as { step: (n: number) => void; nx: number; nz: number };
    const rt = window.__renderTest as unknown as { world: { camera: { project: (x: number, y: number, z: number) => { x: number; y: number } } } };
    s.step(1);
    const gl = document.querySelector("canvas") as HTMLCanvasElement;
    const c2 = document.createElement("canvas");
    c2.width = gl.width; c2.height = gl.height;
    const g = c2.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    g.drawImage(gl, 0, 0);
    const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const at = (x: number, y: number, z: number): number => {
      const p = rt.world.camera.project(x, y, z);
      const px = Math.round(((p.x + 1) / 2) * c2.width), py = Math.round(((1 - p.y) / 2) * c2.height);
      const d = g.getImageData(px, py, 1, 1).data;
      return 0.2126 * lin(d[0] as number) + 0.7152 * lin(d[1] as number) + 0.0722 * lin(d[2] as number);
    };
    const mean = (hs: number[], xs: number[]): number => { let t = 0, n = 0; for (const h of hs) for (const k of xs) { t += at(s.nx + k / 16, h / 16, s.nz); n++; } return t / n; };
    const range = (a: number, b: number, st: number): number[] => { const o: number[] = []; for (let v = a; v <= b; v += st) o.push(v); return o; };
    const cloak = mean(range(14, 30, 2), [-4, -2, 0, 2, 4]);
    const fore = mean(range(56, 59.5, 0.5), [-2, -1, 0, 1, 2]);
    return { forehead: fore, midCloak: cloak, foreheadOverCloak: (fore + 0.05) / (cloak + 0.05) };
  });
}

test(`nul polish stills ${TAG}`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, "id=ch1-l04&pose=battle:3&mood=storm&bars=0");
  const nums = await sample(page);
  console.log(`NUMBERS ${TAG} ${JSON.stringify(nums)}`);
  await page.screenshot({ path: join(OUT, `nul-world-${TAG}.jpg`), type: "jpeg", quality: 82 });
  // sprite sheet cells (2.5x, storm-gold): idle[0] (cloak folds, mask dither) and intro[3] (the two eye slits)
  await page.setViewportSize({ width: 1920, height: 1130 });
  await page.goto("/?scene=nul-sheet&view=frames");
  await page.waitForFunction(() => window.__nulSheet?.ready === true, undefined, { timeout: 120_000 });
  const cell = (i: number): { x: number; y: number; width: number; height: number } => ({ x: 12 + (i % 8) * 232, y: 40 + Math.floor(i / 8) * 270, width: 224, height: 262 });
  await page.screenshot({ path: join(OUT, `nul-idle0-${TAG}.jpg`), type: "jpeg", quality: 88, clip: cell(0) });
  await page.screenshot({ path: join(OUT, `nul-intro3-${TAG}.jpg`), type: "jpeg", quality: 88, clip: cell(19) });
});

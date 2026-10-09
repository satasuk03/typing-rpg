import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Renders the POC itself headlessly (file://, reference only: nothing is imported from it) so our
 * output can be compared apples-to-apples. The POC loads three from a CDN; we serve the repo's three
 * build through request interception instead, and block Google Fonts. HUD/overlay/toggles are hidden.
 */
const here = dirname(fileURLToPath(import.meta.url));
const POC = resolve(here, "../../../../poc/hd2d-poc-v2.html");
const THREE_DIR = resolve(here, "../../node_modules/three/build");
const OUT = join(here, "__shots__", "poc");
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: "forest", seek: "forestWalk", steps: 90 },
  { name: "ruins", seek: "ruinsBattle", steps: 90 },
  { name: "cave", seek: "caveWalk", steps: 90 },
  { name: "boss", seek: "boss", steps: 170 },
] as const;
const SIZES = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
] as const;

for (const s of SHOTS) {
  for (const { w, h } of SIZES) {
    test(`poc ${s.name} ${w}x${h}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/cdn.jsdelivr.net/**", (route) => {
        const file = route.request().url().split("/").pop() ?? "";
        const name = file.startsWith("three.core") ? "three.core.js" : "three.module.js";
        route.fulfill({
          status: 200,
          contentType: "text/javascript",
          headers: { "access-control-allow-origin": "*" },
          body: readFileSync(join(THREE_DIR, name)),
        });
      });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
      // the POC stage is min(100%, (100dvh-80px)*16/9) wide with 16px side padding: size the viewport so
      // the stage is exactly w x h.
      await page.setViewportSize({ width: w + 32, height: h + 80 });
      await page.goto(`file://${POC}?q=0`);
      await page.waitForFunction(
        () => (window as unknown as { __hd2d?: unknown }).__hd2d !== undefined,
        undefined,
        { timeout: 120_000 },
      );
      await page.addStyleTag({
        content:
          "#hud,.overlay,.toggles,.caption{display:none!important} body{padding:0!important}",
      });
      await page.evaluate(
        ({ seek, steps }) => {
          const g = (
            window as unknown as {
              __hd2d: {
                pause(v?: boolean): void;
                seek(n: string): void;
                step(n: number, dt?: number): void;
              };
            }
          ).__hd2d;
          g.pause(true);
          g.seek(seek);
          g.step(steps, 1 / 60);
        },
        { seek: s.seek, steps: s.steps },
      );
      const stage = page.locator("#stage");
      await stage.screenshot({ path: join(OUT, `${s.name}-${w}x${h}.png`) });
      expect(errors).toEqual([]);
    });
  }
}

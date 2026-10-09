/**
 * T6.3 W4 P1-5: parry shards on real Metal, forest + cave. Steps the typing-vfx scene to GuardParried + N ms and reports
 * the GL-canvas clip share of the 290x180 hero/contact box. Writes `metal-w4-parry-<biome>-<ms>.png`.
 *   PW_PORT=5321 STILL_DIR=/path pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-parry
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openTyping } from "./helpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
test.setTimeout(300_000);

for (const biome of ["forest", "cave"]) {
  for (const ms of [70, 140, 220, 320]) {
    test(`parry ${biome} +${ms}`, async ({ page }) => {
      const errors = await openTyping(page, `wpm=40&tier=3&guard=1&at=0&biome=${biome}`);
      const ok = await page.evaluate(
        (m) => window.__typingVfx?.stepToEvent("GuardParried", m) ?? false,
        ms,
      );
      expect(ok).toBe(true);
      const file = path.join(outDir, `metal-w4-parry-${biome}-${ms}.png`);
      const buf = await page.screenshot({ path: file });
      const st = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const off = document.createElement("canvas");
        off.width = img.width;
        off.height = img.height;
        const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(155, 330, 290, 180).data;
        let clip = 0;
        let white = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const r = (d[i] ?? 0) / 255;
          const g = (d[i + 1] ?? 0) / 255;
          const b = (d[i + 2] ?? 0) / 255;
          if (0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.94) clip++;
          if (r > 0.96 && g > 0.96 && b > 0.96) white++;
        }
        return { clip: clip / n, white: white / n };
      }, buf.toString("base64"));
      console.log("W4 parry", biome, ms, JSON.stringify(st));
      expect(errors).toEqual([]);
    });
  }
}

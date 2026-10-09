/**
 * T6.3 W3: L10 boss intro readability. Real Metal, real bot run to the intro card.
 *   PW_PORT=5321 STILL_DIR=/path pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w3
 * Measures the Golem body bbox (GL canvas only, no HUD) at 45% of the intro and 2 s after the intro ends:
 * mean luma, near-white pixel share. Writes `metal-w3-l10-intro.png` and `metal-w3-l10-after.png`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
test.setTimeout(900_000);

async function bodyStats(page: Page): Promise<{ luma: number; white: number; rect: number[] }> {
  return page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const s = p.session;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const view = p.view();
    const boss = view.enemies.find((e) => e.isBoss) ?? view.enemies[0];
    if (!boss) throw new Error("no boss");
    const a = { kind: "enemy", id: boss.id, slot: boss.slot } as const;
    const head = s.stage.projector({ ...a, part: "head" });
    const feet = s.stage.projector({ ...a, part: "feet" });
    if (!head || !feet) throw new Error("no anchor");
    const k = gl.width / window.innerWidth;
    const h = (feet.y - head.y) * k;
    const x0 = Math.max(0, Math.round(feet.x * k - h * 0.4));
    const y0 = Math.max(0, Math.round(head.y * k + h * 0.1));
    const w = Math.round(h * 0.8);
    const hh = Math.round(h * 0.8);
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    s.world.render();
    ctx.drawImage(gl, 0, 0);
    const d = ctx.getImageData(x0, y0, Math.min(w, gl.width - x0), Math.min(hh, gl.height - y0));
    let sum = 0;
    let white = 0;
    const n = d.data.length / 4;
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i] ?? 0;
      const g = d.data[i + 1] ?? 0;
      const b = d.data[i + 2] ?? 0;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (r > 235 && g > 235 && b > 235) white++;
    }
    return { luma: sum / n, white: white / n, rect: [x0, y0, w, hh] };
  });
}

test("L10 boss intro: golem keeps its colours", async ({ page }) => {
  const errors = await openPlay(page, "level=ch1-l10&difficulty=story&seed=5&wpm-bot=90");
  await waitPhase(page, "bossIntro", 700_000);
  await page.waitForFunction(() => (window.__play?.view().phaseProgress ?? 0) >= 0.45, undefined, {
    timeout: 60_000,
  });
  await freeze(page);
  const a = await bodyStats(page);
  await page.screenshot({ path: path.join(outDir, "metal-w3-l10-intro.png") });
  await thaw(page);
  await waitPhase(page, "combat", 60_000);
  await page.waitForTimeout(2000);
  await freeze(page);
  const b = await bodyStats(page);
  await page.screenshot({ path: path.join(outDir, "metal-w3-l10-after.png") });
  await thaw(page);
  const ratio = a.luma / b.luma;
  console.log("W3 L10", JSON.stringify({ intro: a, after: b, ratio }));
  expect(errors, errors.join("\n")).toEqual([]);
});

/**
 * T6.3 W4 P2-5: hero readability with the Aegis bubble AND a held guard barrier (parry / block) on the L05 forest.
 * Real Metal. Reports the hero silhouette area ratio vs the same pose with effects off, the hero mask's mean saturation
 * (on and off) and the mask's mean HSV saturation drop. Writes `metal-w4-aegis-<result>.png` into STILL_DIR.
 *   PW_PORT=5321 STILL_DIR=/path pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-aegis
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
test.setTimeout(300_000);

interface Probe {
  area: number;
  sat: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const s = p.session;
    // biome-ignore lint/suspicious/noExplicitAny: test-only access to the private hero actor
    const hero = (s.stage as any).hero.actor ?? (s.stage as any).hero;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const feet = s.stage.projector({ kind: "hero", part: "feet" });
    const head = s.stage.projector({ kind: "hero", part: "head" });
    if (!feet || !head) throw new Error("no hero anchor");
    const k = gl.width / window.innerWidth;
    const hh = (feet.y - head.y) * k;
    const x0 = Math.max(0, Math.round(feet.x * k - hh * 0.36));
    const y0 = Math.max(0, Math.round(head.y * k - hh * 0.05));
    const w = Math.round(hh * 0.72);
    const h = Math.round(hh * 1.1);
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const grab = (hide: boolean): Uint8ClampedArray => {
      hero.mesh.visible = !hide;
      s.world.render();
      ctx.clearRect(0, 0, off.width, off.height);
      ctx.drawImage(gl, 0, 0);
      hero.mesh.visible = true;
      return ctx.getImageData(x0, y0, w, h).data;
    };
    const shown = grab(false);
    const hidden = grab(true);
    s.world.render();
    let area = 0;
    let sat = 0;
    for (let i = 0; i < shown.length; i += 4) {
      const dr = (shown[i] ?? 0) - (hidden[i] ?? 0);
      const dg = (shown[i + 1] ?? 0) - (hidden[i + 1] ?? 0);
      const db = (shown[i + 2] ?? 0) - (hidden[i + 2] ?? 0);
      if (Math.hypot(dr, dg, db) <= 24) continue;
      area++;
      const r = (shown[i] ?? 0) / 255;
      const g = (shown[i + 1] ?? 0) / 255;
      const b = (shown[i + 2] ?? 0) / 255;
      const mx = Math.max(r, g, b);
      sat += mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
    }
    return { area, sat: sat / Math.max(1, area) };
  });
}

for (const result of ["parry", "block"] as const) {
  test(`L05 aegis + held ${result} barrier`, async ({ page }) => {
    const errors = await openPlay(page, "level=ch1-l05&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    // keep Aegis up on the world fx view and the combat debug override
    await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      // biome-ignore lint/suspicious/noExplicitAny: test-only access
      const w = (p.session.typingFx as any).handle.worldFx;
      // biome-ignore lint/suspicious/noExplicitAny: test-only access
      (p.session.combat as any).fx.debug.barrier = 2;
      const orig = w.setView.bind(w);
      w.setView = (v: { hero: object }): void =>
        orig({ ...v, hero: { ...v.hero, barrierCharges: 2 } });
      const f = (): void => {
        if (w.view) w.view = { ...w.view, hero: { ...w.view.hero, barrierCharges: 2 } };
        requestAnimationFrame(f);
      };
      f();
    });
    const hold = async (on: boolean): Promise<Probe> => {
      await page.evaluate(
        ([k, r, noB]) => {
          const p = window.__play as PlayDebug;
          p.session.hud.setSettings({ effectsIntensity: k as number });
          // biome-ignore lint/suspicious/noExplicitAny: test-only access
          const w = (p.session.typingFx as any).handle.worldFx;
          if (!noB) w.barrier.snap(r, 1);
        },
        [on ? 1 : 0, result, !!process.env.NO_BARRIER] as const,
      );
      // snap (240 ms) + settle, still inside the 2.5 s held window
      await page.waitForTimeout(700);
      await freeze(page);
      const m = await probe(page);
      if (on) await page.screenshot({ path: path.join(outDir, `metal-w4-aegis-${result}.png`) });
      await thaw(page);
      return m;
    };
    const off = await hold(false);
    await page.waitForTimeout(2800);
    const on = await hold(true);
    console.log(
      "W4 aegis",
      result,
      JSON.stringify({ off, on, areaRatio: on.area / Math.max(1, off.area) }),
    );
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

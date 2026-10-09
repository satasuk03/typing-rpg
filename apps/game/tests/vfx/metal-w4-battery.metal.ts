/**
 * T6.3 W4 P1-3: every demo effect on the L05 forest, worst 96 px window (GL canvas, luma >= 0.94) over the 1.4 s after it
 * starts. One page, effects played one at a time. EFFECTS=slash,crit,... to pick; BISECT=1 prints the mesh bisect of
 * the worst frame of every effect above 35%.
 *   PW_PORT=5321 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-battery
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { openPlay, waitPhase } from "./playHelpers";

test.setTimeout(900_000);

const ALL = [
  "slash",
  "crit",
  "dagger",
  "staff",
  "hammer",
  "weak",
  "shield",
  "break",
  "fireball",
  "slashWave",
  "thrust",
  "frost",
  "block",
  "parry",
  "death",
  "chest:Wooden",
  "chest:Gold",
  "coins",
  "passive",
];

test("L05 forest: every effect, worst 96 px window", async ({ page }) => {
  const names = process.env.EFFECTS?.split(",") ?? ALL;
  const errors = await openPlay(
    page,
    `level=${process.env.LEVEL ?? "ch1-l05"}&difficulty=story&seed=11`,
  );
  await waitPhase(page, "combat");
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const W = 96;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__w96 = (): { clip: number; x: number; y: number } => {
      p.session.world.render();
      ctx.drawImage(gl, 0, 0);
      const w = off.width;
      const h = off.height;
      const d = ctx.getImageData(0, 0, w, h).data;
      const S = new Int32Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0) >= 240)
            row++;
          S[(y + 1) * (w + 1) + x + 1] = (S[y * (w + 1) + x + 1] ?? 0) + row;
        }
      }
      let best = { clip: 0, x: 0, y: 0 };
      for (let y = 0; y + W <= h; y += 8)
        for (let x = 0; x + W <= w; x += 8) {
          const c =
            (S[(y + W) * (w + 1) + x + W] ?? 0) -
            (S[y * (w + 1) + x + W] ?? 0) -
            (S[(y + W) * (w + 1) + x] ?? 0) +
            (S[y * (w + 1) + x] ?? 0);
          if (c / (W * W) > best.clip) best = { clip: c / (W * W), x, y };
        }
      return best;
    };
  });
  for (const name of names) {
    const res = await page.evaluate(
      ([n, bis]) =>
        new Promise<{ max: number; at: number; x: number; y: number; bis: string[]; jpg: string }>(
          (resolve) => {
            const p = window.__play as PlayDebug;
            const s = p.session;
            // biome-ignore lint/suspicious/noExplicitAny: test-only global
            const w96 = (window as any).__w96 as () => { clip: number; x: number; y: number };
            if (!p.demo?.(n as string))
              return resolve({ max: -1, at: 0, x: 0, y: 0, bis: [], jpg: "" });
            const t0 = s.stage.time;
            let max = 0;
            let at = 0;
            let mx = 0;
            let my = 0;
            let bestBis: string[] = [];
            let jpg = "";
            const f = (): void => {
              const t = s.stage.time - t0;
              const r = w96();
              if (r.clip > max) {
                max = r.clip;
                at = t;
                mx = r.x;
                my = r.y;
                jpg = (document.getElementById("gl") as HTMLCanvasElement).toDataURL(
                  "image/jpeg",
                  0.85,
                );
                if (bis && r.clip > 0.35) {
                  const out: string[] = [];
                  // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
                  const ms: any[] = [];
                  // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
                  s.world.scene.traverse((o: any) => {
                    if (o.visible && (o.isMesh || o.isPoints)) ms.push(o);
                  });
                  for (const o of ms) {
                    o.visible = false;
                    const c = w96().clip;
                    o.visible = true;
                    if (r.clip - c > 0.06)
                      out.push(
                        `-${(r.clip - c).toFixed(2)} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} y${o.position.y.toFixed(1)} x${o.position.x.toFixed(1)} sc${o.scale.x.toFixed(1)}`,
                      );
                  }
                  bestBis = out;
                }
              }
              if (t < 1.4) requestAnimationFrame(f);
              else resolve({ max, at, x: mx, y: my, bis: bestBis, jpg });
            };
            f();
          },
        ),
      [name, !!process.env.BISECT] as const,
    );
    console.log(
      `W4 battery ${name} max ${res.max.toFixed(2)} @${res.x},${res.y} t${res.at.toFixed(2)} ${JSON.stringify(res.bis)}`,
    );
    if (process.env.STILL_DIR && res.jpg)
      fs.writeFileSync(
        path.join(process.env.STILL_DIR, `bat-${name.replace(":", "_")}.jpg`),
        Buffer.from(res.jpg.split(",")[1] ?? "", "base64"),
      );
    await page.evaluate(() => (window.__play as PlayDebug).demo?.("off"));
    await page.waitForTimeout(2200);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

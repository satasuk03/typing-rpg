/**
 * T6.3 W4 P1-3: forest glare. Real Metal, L05. The worst 96 px window (GL canvas only, luma >= 0.94 counts as clipped)
 * for the crit and chest+slash stills, plus a 60 WPM bot run sampled at ~15 Hz.
 *   PW_PORT=5321 STILL_DIR=/path pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-glare
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, playTo, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
test.setTimeout(900_000);

/** Installs `window.__w96()`: renders, then returns the worst 96 px window { clip, x, y }. */
async function install(page: Page): Promise<void> {
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
          const l = 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
          if (l >= 240) row++;
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
}

const STILLS: { name: string; demo: string[]; at: number; gap?: number }[] = [
  { name: "f-crit", demo: ["crit"], at: 0.64 },
  { name: "f-chest-slash", demo: ["chest:Gold", "slash"], at: 0.5, gap: 1.6 },
  { name: "f-fireball", demo: ["fireball"], at: 0.3 },
];

for (const s of STILLS) {
  test(`L05 ${s.name}: worst 96 px window`, async ({ page }) => {
    const errors = await openPlay(page, "level=ch1-l05&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    for (const d of s.demo.slice(0, -1)) await playTo(page, d, s.gap ?? 0.3);
    const last = s.demo[s.demo.length - 1];
    if (last) await playTo(page, last, s.at);
    await freeze(page);
    await install(page);
    const w = await page.evaluate(() => (window as unknown as { __w96: () => unknown }).__w96());
    console.log("W4 glare", s.name, JSON.stringify(w));
    await page.screenshot({ path: path.join(outDir, `metal-w4-${s.name}.png`) });
    if (process.env.BISECT) {
      const res = await page.evaluate(() => {
        const p = window.__play as PlayDebug;
        // biome-ignore lint/suspicious/noExplicitAny: test-only global
        const f = (window as any).__w96 as () => { clip: number };
        const base = f().clip;
        const out: string[] = [`base ${base.toFixed(3)}`];
        // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
        const ms: any[] = [];
        // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
        p.session.world.scene.traverse((o: any) => {
          if (o.visible && (o.isMesh || o.isPoints)) ms.push(o);
        });
        for (const o of ms) {
          o.visible = false;
          const c = f().clip;
          o.visible = true;
          if (base - c > 0.02)
            out.push(
              `-${(base - c).toFixed(3)} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} y${o.position.y.toFixed(1)} sc${o.scale.x.toFixed(1)} x${o.position.x.toFixed(1)}`,
            );
        }
        return out;
      });
      console.log("W4 bisect", s.name, JSON.stringify(res));
    }
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("L05 60 WPM bot run: max 96 px window", async ({ page }) => {
  const errors = await openPlay(page, "level=ch1-l05&difficulty=story&seed=4&wpm-bot=60");
  await install(page);
  page.on("console", (m) => {
    if (m.text().startsWith("W4B")) console.log(m.text());
  });
  await page.evaluate((BIS) => {
    const p = window.__play as PlayDebug;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const w = window as any;
    const res = {
      max: 0,
      over35: 0,
      frames: 0,
      worst: null as unknown,
      causes: {} as Record<string, number>,
      samples: [] as string[],
    };
    w.__w96res = res;
    const shots: string[] = [];
    w.__shots = shots;
    let lastShot = -9;
    let n = 0;
    let bis = 0;
    let lastBis = -9;
    let prev: Record<string, number> = {};
    const recent: { t: number; type: string }[] = [];
    const f = (): void => {
      const t = p.session.stage.time;
      const seen = p.seen();
      for (const k of Object.keys(seen))
        if ((seen[k] ?? 0) > (prev[k] ?? 0)) recent.push({ t, type: k });
      prev = { ...seen };
      while (recent.length > 0 && (recent[0]?.t ?? 0) < t - 1.0) recent.shift();
      if (p.phase() === "combat" && ++n % 4 === 0) {
        const r = w.__w96() as { clip: number; x: number; y: number };
        res.frames++;
        if (r.clip > 0.35) {
          res.over35++;
          const key = [
            ...new Set(
              recent
                .map((e) => e.type)
                .filter(
                  (e) =>
                    !/^(Plate|Focus|Target|CharCorrect|Atb|Word|Hit$|ComboTier|KeyStreak)/.test(e),
                ),
            ),
          ]
            .sort()
            .join("+");
          res.causes[key] = (res.causes[key] ?? 0) + 1;
          if (res.samples.length < 60)
            res.samples.push(`${r.clip.toFixed(2)}@${r.x},${r.y} t${t.toFixed(1)} ${key}`);
        }
        if (r.clip > 0.7 && shots.length < 10 && t - lastShot > 2) {
          lastShot = t;
          const gl = document.getElementById("gl") as HTMLCanvasElement;
          shots.push(`${t.toFixed(1)}_${r.clip.toFixed(2)}|${gl.toDataURL("image/jpeg", 0.85)}`);
        }
        if (BIS && r.clip > 0.6 && bis < 14 && t - lastBis > 1.5) {
          bis++;
          lastBis = t;
          const base = r.clip;
          const out: string[] = [
            `base ${base.toFixed(2)}@${r.x},${r.y} t${t.toFixed(1)} ${[...new Set(recent.map((e) => e.type))].filter((e) => !/^(Plate|Focus|Target|CharCorrect|Atb|Word|Hit$|ComboTier|KeyStreak|Passive|Typo)/.test(e)).join("+")}`,
          ];
          // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
          const ms: any[] = [];
          // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
          p.session.world.scene.traverse((o: any) => {
            if (o.visible && (o.isMesh || o.isPoints)) ms.push(o);
          });
          for (const o of ms) {
            o.visible = false;
            const c = (w.__w96() as { clip: number }).clip;
            o.visible = true;
            if (base - c > 0.08)
              out.push(
                `-${(base - c).toFixed(2)} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} a${o.material?.uniforms?.uAlpha?.value} y${o.position.y.toFixed(1)} x${o.position.x.toFixed(1)} sc${o.scale.x.toFixed(1)} ${o.name}`,
              );
          }
          console.log(`W4B ${JSON.stringify(out)}`);
        }
        if (r.clip > res.max) {
          res.max = r.clip;
          res.worst = { ...r, t };
        }
      }
      requestAnimationFrame(f);
    };
    f();
  }, !!process.env.BISECT);
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout: 800_000,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only global
  const res = await page.evaluate(() => (window as any).__w96res);
  console.log("W4 glare bot", JSON.stringify(res));
  // biome-ignore lint/suspicious/noExplicitAny: test-only global
  const shots = (await page.evaluate(() => (window as any).__shots)) as string[];
  for (const sh of shots) {
    const [tag, url] = sh.split("|");
    fs.writeFileSync(
      path.join(outDir, `bot-${tag}.jpg`),
      Buffer.from((url ?? "").split(",")[1] ?? "", "base64"),
    );
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

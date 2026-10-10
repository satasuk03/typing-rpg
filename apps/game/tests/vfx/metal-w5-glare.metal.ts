/**
 * T6.3 W5 R3-1: cave / forest hit glare, FX-only. Real Metal. Every sampled combat frame is rendered twice (as-is and
 * with the FX meshes and dynamic FX lights off); a pixel counts only if it clips (luma >= 240) WITH the effects and
 * not without. Prints the worst 96 px window per frame, aggregated: share of frames >= 60% / >= 35%, max.
 *   LEVEL=ch1-l09 WPM=90 PW_PORT=5321 STILL_DIR=/path pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w5-glare
 * Fixed-moment stills: `STILLS=1 TAG=before|after` (L09 auto / crit / fireball / break).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, playTo, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
test.setTimeout(1_200_000);

const RUNS = [
  { level: "ch1-l05", wpm: 60, seed: 4 },
  { level: "ch1-l09", wpm: 90, seed: 4 },
  { level: "ch1-l10", wpm: 90, seed: 5 },
];

/** Installs `window.__fx()`: renders with and without FX, returns the worst 96 px window clipped by FX only. */
async function installFx(page: Page): Promise<void> {
  await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const world = p.session.world;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const w = window as any;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const mk = (): CanvasRenderingContext2D => {
      const c = document.createElement("canvas");
      c.width = gl.width;
      c.height = gl.height;
      return c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    };
    const c1 = mk();
    const c2 = mk();
    const W = 96;
    const keep = new Set<unknown>();
    // biome-ignore lint/suspicious/noExplicitAny: test-only private access
    const wa = world as any;
    for (const f of wa.flames) {
      keep.add(f.mesh);
      keep.add(f.glow);
    }
    for (const ray of wa.rays) keep.add(ray.mesh);
    const fxMeshes: { visible: boolean }[] = [];
    // sprite hit-flash uniforms (enemy white flash): the FX-off render zeroes them so a flash-only clip counts as FX
    const flashU: { value: number }[] = [];
    const collectFlash = (): void => {
      flashU.length = 0;
      // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
      world.scene.traverse((o: any) => {
        const u = o.material?.uniforms?.uFlash;
        if (u && !flashU.includes(u)) flashU.push(u);
      });
    };
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    const walk = (o: any): void => {
      if ((o.isMesh || o.isPoints) && o.renderOrder >= 6 && !keep.has(o)) fxMeshes.push(o);
    };
    const lum = (d: Uint8ClampedArray, i: number): number =>
      0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
    const lightsUpdate = (): void => wa.lights.update(0, wa.camera.pose.x, wa.time);
    w.__fx = (): { clip: number; x: number; y: number } => {
      fxMeshes.length = 0;
      world.scene.traverse(walk);
      collectFlash();
      world.render();
      c1.drawImage(gl, 0, 0);
      const on = c1.getImageData(0, 0, gl.width, gl.height).data;
      const dyn = wa.lights.dynamics as { intensity: number }[];
      const saved = dyn.map((l) => l.intensity);
      const vis = fxMeshes.map((m) => m.visible);
      for (const l of dyn) if (l !== wa.fillLight) l.intensity = 0;
      for (const m of fxMeshes) m.visible = false;
      const flashSaved = flashU.map((u) => u.value);
      if (!w.__noSpriteFlash) for (const u of flashU) u.value = 0;
      lightsUpdate();
      world.render();
      c2.drawImage(gl, 0, 0);
      const off = c2.getImageData(0, 0, gl.width, gl.height).data;
      fxMeshes.forEach((m, i) => {
        m.visible = vis[i] as boolean;
      });
      dyn.forEach((l, i) => {
        l.intensity = saved[i] as number;
      });
      flashU.forEach((u, i) => {
        u.value = flashSaved[i] as number;
      });
      lightsUpdate();
      const w0 = gl.width;
      const h0 = gl.height;
      const S = new Int32Array((w0 + 1) * (h0 + 1));
      for (let y = 0; y < h0; y++) {
        let row = 0;
        for (let x = 0; x < w0; x++) {
          const i = (y * w0 + x) * 4;
          if (lum(on, i) >= 240 && lum(off, i) < 240) {
            row++;
            w.__fxTot = (w.__fxTot ?? 0) + 1;
            if (lum(off, i) > 120) w.__fxBright = (w.__fxBright ?? 0) + 1;
          }
          S[(y + 1) * (w0 + 1) + x + 1] = (S[y * (w0 + 1) + x + 1] ?? 0) + row;
        }
      }
      let best = { clip: 0, x: 0, y: 0 };
      for (let y = 0; y + W <= h0; y += 8)
        for (let x = 0; x + W <= w0; x += 8) {
          const c =
            (S[(y + W) * (w0 + 1) + x + W] ?? 0) -
            (S[y * (w0 + 1) + x + W] ?? 0) -
            (S[(y + W) * (w0 + 1) + x] ?? 0) +
            (S[y * (w0 + 1) + x] ?? 0);
          if (c / (W * W) > best.clip) best = { clip: c / (W * W), x, y };
        }
      return best;
    };
    w.__c1 = c1;
    w.__c2 = c2;
    w.__keep = keep;
  });
}

for (const r of RUNS) {
  const only = process.env.LEVEL;
  if (only && only !== r.level) continue;
  test(`${r.level} ${r.wpm} WPM bot run: FX-only 96 px window`, async ({ page }) => {
    test.skip(!!process.env.STILLS, "stills mode");
    const wpm = Number(process.env.WPM ?? r.wpm);
    const errors = await openPlay(
      page,
      `level=${r.level}&difficulty=story&seed=${process.env.SEED ?? r.seed}&wpm-bot=${wpm}`,
    );
    page.on("console", (m) => {
      if (m.text().startsWith("W5") || m.type() === "error") console.log(m.text());
    });
    page.on("pageerror", (e) => console.log("W5 pageerror", String(e)));
    await installFx(page);
    await page.evaluate((BIS) => {
      const p = window.__play as PlayDebug;
      const world = p.session.world;
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      const w = window as any;
      // biome-ignore lint/suspicious/noExplicitAny: test-only private access
      const wa = world as any;
      const gl = document.getElementById("gl") as HTMLCanvasElement;
      const { __c1: c1, __c2: c2, __keep: keep } = w;
      const res = {
        frames: 0,
        o60: 0,
        o35: 0,
        max: 0,
        worst: null as unknown,
        causes: {} as Record<string, number>,
        abl: {} as Record<string, number>,
        c60: {} as Record<string, number>,
      };
      w.__w5 = res;
      const shots: string[] = [];
      w.__shots = shots;
      let n = 0;
      let lastShot = -9;
      let bis = 0;
      let lastBis = -9;
      let prev: Record<string, number> = {};
      const recent: { t: number; type: string }[] = [];
      const skip =
        /^(Plate|Focus|Target|CharCorrect|Atb|Word|Hit$|ComboTier|KeyStreak|Passive|Typo)/;
      const f = (): void => {
        const t = p.session.stage.time;
        const seen = p.seen();
        for (const k of Object.keys(seen))
          if ((seen[k] ?? 0) > (prev[k] ?? 0)) recent.push({ t, type: k });
        prev = { ...seen };
        while (recent.length > 0 && (recent[0]?.t ?? 0) < t - 0.6) recent.shift();
        if (p.phase() === "combat" && ++n % 2 === 0) {
          const r = w.__fx() as { clip: number; x: number; y: number };
          res.frames++;
          if (res.frames % 100 === 0)
            console.log(`W5P ${res.frames} t${t.toFixed(1)} o60 ${res.o60} o35 ${res.o35}`);
          if (r.clip >= 0.6) {
            res.o60++;
            const k60 = [...new Set(recent.map((e) => e.type).filter((e) => !skip.test(e)))]
              .sort()
              .join("+");
            res.c60[k60] = (res.c60[k60] ?? 0) + 1;
          }
          if (r.clip >= 0.35) {
            res.o35++;
            const key = [...new Set(recent.map((e) => e.type).filter((e) => !skip.test(e)))]
              .sort()
              .join("+");
            res.causes[key] = (res.causes[key] ?? 0) + 1;
          }
          if (r.clip >= 0.6 && (BIS as boolean)) {
            // ablation: which group's removal takes this frame below 60%
            const groups: Record<string, (o: any) => boolean> = {
              disc: (o) =>
                o.material?.uniforms?.uKind?.value === 0 ||
                o.material?.uniforms?.uKind?.value === 1,
              guard: (o) => o.material?.uniforms?.uKind?.value === 4,
              beam: (o) => o.material?.uniforms?.uKind?.value === 3,
              ring: (o) => [2, 11, 10].includes(o.material?.uniforms?.uKind?.value),
              hex: (o) => o.material?.uniforms?.uKind?.value === 9,
              fire: (o) => o.material?.uniforms?.uKind?.value === 5,
              points: (o) =>
                !!o.isPoints ||
                (o.geometry?.isInstancedBufferGeometry &&
                  o.material?.uniforms?.uKind === undefined),
            };
            const all: any[] = [];
            world.scene.traverse((o: any) => {
              if ((o.isMesh || o.isPoints) && o.renderOrder >= 6 && o.visible && !keep.has(o))
                all.push(o);
            });
            res.abl.total = (res.abl.total ?? 0) + 1;
            for (const [gname, fn] of Object.entries(groups)) {
              const hid = all.filter(fn);
              for (const o of hid) o.visible = false;
              const c = (w.__fx() as { clip: number }).clip;
              for (const o of hid) o.visible = true;
              if (c < 0.6) res.abl[gname] = (res.abl[gname] ?? 0) + 1;
            }
          }
          if (r.clip >= 0.6 && bis < 14 && t - lastBis > 0.4 && (BIS as boolean)) {
            bis++;
            lastBis = t;
            const out: string[] = [
              `base ${r.clip.toFixed(2)} t${t.toFixed(1)} ${[...new Set(recent.map((e) => e.type).filter((e) => !skip.test(e)))].join("+")}`,
            ];
            const ms: {
              visible: boolean;
              renderOrder: number;
              position: { x: number; y: number };
              scale: { x: number };
              // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
              material?: any;
            }[] = [];
            // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
            world.scene.traverse((o: any) => {
              if ((o.isMesh || o.isPoints) && o.renderOrder >= 6 && o.visible) ms.push(o);
            });
            for (const o of ms) {
              o.visible = false;
              const c = (w.__fx() as { clip: number }).clip;
              o.visible = true;
              if (r.clip - c > 0.05)
                out.push(
                  `-${(r.clip - c).toFixed(2)} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} sc${o.scale.x.toFixed(1)} x${o.position.x.toFixed(1)} y${o.position.y.toFixed(1)}`,
                );
            }
            const dyn = wa.lights.dynamics as { intensity: number }[];
            const sv = dyn.map((l) => l.intensity);
            for (const l of dyn) if (l !== wa.fillLight) l.intensity = 0;
            wa.lights.update(0, wa.camera.pose.x, wa.time);
            const cl = (w.__fx() as { clip: number }).clip;
            dyn.forEach((l, i) => {
              l.intensity = sv[i] as number;
            });
            wa.lights.update(0, wa.camera.pose.x, wa.time);
            out.push(`lights off: ${cl.toFixed(2)}`);
            console.log(`W5B ${JSON.stringify(out)}`);
          }
          if (r.clip >= 0.6 && shots.length < 8 && t - lastShot > 3) {
            lastShot = t;
            shots.push(
              `${t.toFixed(1)}_${r.clip.toFixed(2)}_on|${c1.canvas.toDataURL("image/jpeg", 0.85)}`,
            );
            shots.push(
              `${t.toFixed(1)}_${r.clip.toFixed(2)}_off|${c2.canvas.toDataURL("image/jpeg", 0.85)}`,
            );
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
    for (let i = 0; i < 400; i++) {
      const st = await page.evaluate(() => ({
        done: window.__play?.resultsShown() === true,
        phase: window.__play?.phase(),
        // biome-ignore lint/suspicious/noExplicitAny: test-only global
        frames: (window as any).__w5?.frames,
        t: window.__play?.session.stage.time,
      }));
      if (i % 3 === 0) console.log("W5S", JSON.stringify(st));
      if (st.done) break;
      await page.waitForTimeout(5000);
    }
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const res = (await page.evaluate(() => (window as any).__w5)) as {
      frames: number;
      o60: number;
      o35: number;
      max: number;
    };
    console.log(
      `W5 ${r.level}@${wpm}`,
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      JSON.stringify(
        await page.evaluate(() => [(window as any).__fxTot, (window as any).__fxBright]),
      ),
      JSON.stringify(res),
      `>=60%: ${((100 * res.o60) / res.frames).toFixed(2)}%  >=35%: ${((100 * res.o35) / res.frames).toFixed(2)}%`,
    );
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const shots = (await page.evaluate(() => (window as any).__shots)) as string[];
    for (const sh of shots) {
      const [tag, url] = sh.split("|");
      fs.writeFileSync(
        path.join(outDir, `w5bot-${r.level}-${tag}.jpg`),
        Buffer.from((url ?? "").split(",")[1] ?? "", "base64"),
      );
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

const STILLS: { name: string; demo: string; at: number }[] = [
  { name: "auto", demo: "slash", at: 0.5 },
  { name: "crit", demo: "crit", at: 0.55 },
  { name: "fireball", demo: "fireball", at: 0.62 },
  { name: "break", demo: "break", at: 0.06 },
];
for (const s of STILLS) {
  test(`L09 still ${s.name}`, async ({ page }) => {
    test.skip(!process.env.STILLS, "set STILLS=1");
    const errors = await openPlay(page, "level=ch1-l09&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    await playTo(page, s.demo, s.at);
    await freeze(page);
    await page.screenshot({
      path: path.join(outDir, `${process.env.TAG ?? "x"}-l09-${s.name}.png`),
    });
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

const TL = [0.02, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6];
for (const demo of ["slash", "crit", "fireball", "break", "parry", "weak"]) {
  test(`L09 timeline ${demo}`, async ({ page }) => {
    test.skip(!process.env.TIMELINE, "set TIMELINE=1");
    const out: string[] = [];
    const errors = await openPlay(page, "level=ch1-l09&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await installFx(page);
    for (const at of TL) {
      await page.reload();
      await page.waitForFunction(() => window.__play?.ready === true, undefined, {
        timeout: 90_000,
      });
      await waitPhase(page, "combat");
      await installFx(page);
      await page.waitForTimeout(800);
      await playTo(page, demo, at);
      await freeze(page);
      const r = await page.evaluate(() =>
        (window as unknown as { __fx: () => { clip: number } }).__fx(),
      );
      out.push(`${at}:${r.clip.toFixed(2)}`);
    }
    console.log(`W5T ${demo} ${out.join(" ")}`);
    expect(errors.length).toBeLessThan(99);
  });
}

for (const demo of ["slash", "crit", "fireball", "break", "parry", "weak"]) {
  test(`L09 probe ${demo}`, async ({ page }) => {
    test.skip(!process.env.PROBE_AT, "set PROBE_AT=<stage seconds>");
    const errors = await openPlay(page, "level=ch1-l09&difficulty=story&seed=11");
    await waitPhase(page, "combat");
    await installFx(page);
    await page.waitForTimeout(800);
    if (process.env.PROBE_PRE) await playTo(page, process.env.PROBE_PRE, 0.01);
    await playTo(page, demo, Number(process.env.PROBE_AT));
    await freeze(page);
    const out = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      const w = window as any;
      const p = window.__play as PlayDebug;
      const r0 = w.__fx() as { clip: number };
      const lines = [`base ${r0.clip.toFixed(2)}`];
      // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
      const ms: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
      p.session.world.scene.traverse((o: any) => {
        if ((o.isMesh || o.isPoints) && o.renderOrder >= 6 && o.visible && !w.__keep.has(o))
          ms.push(o);
      });
      for (const o of ms) {
        o.visible = false;
        const c = (w.__fx() as { clip: number }).clip;
        o.visible = true;
        if (r0.clip - c > 0.03)
          lines.push(
            `-${(r0.clip - c).toFixed(2)} ${o.name || o.type} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} sc${o.scale.x.toFixed(1)} x${o.position.x.toFixed(1)} y${o.position.y.toFixed(1)} inst${o.geometry?.instanceCount}`,
          );
      }
      w.__fx();
      return {
        lines,
        on: w.__c1.canvas.toDataURL("image/jpeg", 0.8),
        off: w.__c2.canvas.toDataURL("image/jpeg", 0.8),
      };
    });
    console.log(`W5R ${demo}@${process.env.PROBE_AT} ${JSON.stringify(out.lines)}`);
    for (const k of ["on", "off"] as const)
      fs.writeFileSync(
        path.join(outDir, `probe-${demo}-${process.env.PROBE_AT}-${k}.jpg`),
        Buffer.from(out[k].split(",")[1] ?? "", "base64"),
      );
    expect(errors.length).toBeLessThan(99);
  });
}

test("L09 route: composite stills on Break / parry (PO deck #16)", async ({ page }) => {
  test.skip(!process.env.ROUTE_STILLS, "set ROUTE_STILLS=1");
  const errors = await openPlay(page, "level=ch1-l09&difficulty=story&seed=4&wpm-bot=90");
  await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    const w = window as any;
    w.__route = [] as string[];
    let prev: Record<string, number> = {};
    let fire = -1;
    let n = 0;
    const snap = (): string => {
      const out = document.createElement("canvas");
      out.width = 1280;
      out.height = 720;
      const ctx = out.getContext("2d") as CanvasRenderingContext2D;
      p.session.world.render();
      for (const c of Array.from(document.querySelectorAll("canvas")))
        if (c !== out && c.width > 0 && getComputedStyle(c).display !== "none")
          ctx.drawImage(c, 0, 0, 1280, 720);
      return out.toDataURL("image/jpeg", 0.85);
    };
    const f = (): void => {
      const t = p.session.stage.time;
      const seen = p.seen();
      if (
        (seen.Break ?? 0) > (prev.Break ?? 0) ||
        (seen.GuardParried ?? 0) > (prev.GuardParried ?? 0)
      )
        fire = n + 4;
      prev = { ...seen };
      n++;
      if (fire === n && w.__route.length < 12) w.__route.push(`${t.toFixed(1)}|${snap()}`);
      requestAnimationFrame(f);
    };
    f();
  });
  await page.waitForFunction(() => (window.__play?.session.stage.time ?? 0) > 60, undefined, {
    timeout: 300_000,
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only global
  const shots = (await page.evaluate(() => (window as any).__route)) as string[];
  for (const sh of shots) {
    const [tag, url] = sh.split("|");
    fs.writeFileSync(
      path.join(outDir, `route-${tag}.jpg`),
      Buffer.from((url ?? "").split(",")[1] ?? "", "base64"),
    );
  }
  expect(errors.length).toBeLessThan(99);
});

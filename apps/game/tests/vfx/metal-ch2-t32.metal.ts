/**
 * T3.2 Chapter II VFX captures, real Metal. Needs `&demo=1` (dev/ch2FxDemo.ts swaps in synthetic Ch2 enemies on the running
 * Ch1 level, so the REAL plates are on screen). Stills + the keep-out probe:
 *
 *   TAG=after PW_PORT=5395 STILL_DIR=/abs/dir pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-ch2-t32
 *
 * `TAG=before` is run from a checkout of `main` with `dev/ch2FxDemo.ts` copied over it (the stub bindings are silent there:
 * the honest "before"). Each still is frozen on the stage clock, so the capture does not depend on the frame rate.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { freeze, openPlay, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
const TAG = process.env.TAG ?? "after";
test.setTimeout(300_000);

/** Run a demo command now (no waiting). */
async function demo(page: Page, name: string): Promise<void> {
  const ok = await page.evaluate((n) => (window.__play as PlayDebug).demo?.(n) ?? false, name);
  expect(ok, `demo(${name})`).toBe(true);
}

/** Let `sec` of STAGE time pass (the stage clock pauses with a freeze). */
async function stageWait(page: Page, sec: number): Promise<void> {
  await page.evaluate(
    (s) =>
      new Promise<void>((resolve) => {
        const p = window.__play as PlayDebug;
        const t0 = p.session.stage.time + s;
        const giveUp = performance.now() + 30_000;
        const f = (): void => {
          if (p.session.stage.time >= t0 || performance.now() > giveUp) resolve();
          else requestAnimationFrame(f);
        };
        f();
      }),
    sec,
  );
}

async function still(page: Page, name: string): Promise<void> {
  await freeze(page);
  await page.screenshot({ path: path.join(outDir, `${TAG}-${name}.png`) });
  await thaw(page);
}

async function open(page: Page, extra = ""): Promise<string[]> {
  const errors = await openPlay(page, `level=ch1-l05&difficulty=story&seed=4${extra}`);
  await waitPhase(page, "combat");
  await page.waitForTimeout(600);
  return errors;
}

test("heal: beam + motes + pop", async ({ page }) => {
  const errors = await open(page);
  await demo(page, "ch2:heal");
  await stageWait(page, 0.4); // the wind-up ring is up
  await still(page, "heal-windup");
  await stageWait(page, 0.3); // 0.7 s: 100 ms after the heal lands
  await still(page, "heal");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("elite: sigil + rim + motes, then the howl telegraph", async ({ page }) => {
  const errors = await open(page);
  await demo(page, "ch2:elite");
  await stageWait(page, 1.6);
  await still(page, "elite");
  await demo(page, "ch2:howl");
  await stageWait(page, 1.9);
  await still(page, "howl");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("riddle: leaves, right burst, wrong wither", async ({ page }) => {
  const errors = await open(page);
  await demo(page, "ch2:riddle");
  await stageWait(page, 1.7);
  await still(page, "riddle-leaves");
  await demo(page, "ch2:pick:1");
  await stageWait(page, 0.1);
  await demo(page, "ch2:right:1");
  await stageWait(page, 0.3);
  await still(page, "riddle-right");
  await demo(page, "ch2:riddle");
  await stageWait(page, 1.7);
  await demo(page, "ch2:pick:2");
  await stageWait(page, 0.1);
  await demo(page, "ch2:wrong:2");
  await stageWait(page, 0.28);
  await still(page, "riddle-wrong");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("freed Willow finale", async ({ page }) => {
  const errors = await open(page);
  await demo(page, "ch2:freed");
  await stageWait(page, 0.25 + 1.06 + 0.35);
  await still(page, "freed-1");
  await stageWait(page, 0.9);
  await still(page, "freed-2");
  expect(errors, errors.join("\n")).toEqual([]);
});

/**
 * K2 keep-out probe: every sampled frame is rendered twice (as-is, and with the FX meshes and dynamic FX lights off); inside
 * every active plate rect inflated by 40 px, the FX must add no clipped pixel (luma >= 240) and nothing brighter than FX_MAX
 * (the 1.5 HDR budget after the grade). Also reports how many bright Ch2 spawns the gate dimmed.
 */
const FX_MAX = 215;
const SCENARIOS: { name: string; steps: { demo: string; wait: number }[] }[] = [
  { name: "heal", steps: [{ demo: "ch2:heal", wait: 0.9 }] },
  {
    name: "elite+howl",
    steps: [
      { demo: "ch2:elite", wait: 1.2 },
      { demo: "ch2:howl", wait: 2.2 },
    ],
  },
  {
    name: "riddle right",
    steps: [
      { demo: "ch2:riddle", wait: 1.6 },
      { demo: "ch2:pick:1", wait: 0.1 },
      { demo: "ch2:right:1", wait: 0.8 },
    ],
  },
  {
    name: "riddle wrong",
    steps: [
      { demo: "ch2:riddle", wait: 1.6 },
      { demo: "ch2:pick:2", wait: 0.1 },
      { demo: "ch2:wrong:2", wait: 0.8 },
    ],
  },
  { name: "freed", steps: [{ demo: "ch2:freed", wait: 3.4 }] },
];

test("keep-out probe: no bright Ch2 FX within 40 px of an active plate", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const world = p.session.world;
    // biome-ignore lint/suspicious/noExplicitAny: test-only global / private access
    const w = window as any;
    // biome-ignore lint/suspicious/noExplicitAny: test-only private access
    const wa = world as any;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const mk = (): CanvasRenderingContext2D => {
      const c = document.createElement("canvas");
      c.width = gl.width;
      c.height = gl.height;
      return c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    };
    const c1 = mk();
    const c2 = mk();
    const keep = new Set<unknown>();
    for (const f of wa.flames) {
      keep.add(f.mesh);
      keep.add(f.glow);
    }
    for (const ray of wa.rays) keep.add(ray.mesh);
    const lum = (d: Uint8ClampedArray, i: number): number =>
      0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
    w.__ko = (): { clip: number; max: number; plates: number } => {
      const fxMeshes: { visible: boolean }[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
      world.scene.traverse((o: any) => {
        if ((o.isMesh || o.isPoints) && o.renderOrder >= 6 && !keep.has(o)) fxMeshes.push(o);
      });
      world.render();
      c1.drawImage(gl, 0, 0);
      const on = c1.getImageData(0, 0, gl.width, gl.height).data;
      const dyn = wa.lights.dynamics as { intensity: number }[];
      const saved = dyn.map((l) => l.intensity);
      const vis = fxMeshes.map((m) => m.visible);
      for (const l of dyn) if (l !== wa.fillLight) l.intensity = 0;
      for (const m of fxMeshes) m.visible = false;
      world.render();
      c2.drawImage(gl, 0, 0);
      const off = c2.getImageData(0, 0, gl.width, gl.height).data;
      dyn.forEach((l, i) => {
        l.intensity = saved[i] as number;
      });
      fxMeshes.forEach((m, i) => {
        m.visible = vis[i] as boolean;
      });
      world.render();
      const k = gl.width / window.innerWidth;
      let clip = 0;
      let max = 0;
      let plates = 0;
      const R = { x: 0, y: 0, w: 0, h: 0 };
      for (const pl of p.view().plates) {
        if (!p.session.hud.getPlateRectInto(pl.id, R)) continue;
        plates++;
        const x0 = Math.max(0, Math.floor((R.x - 40) * k));
        const y0 = Math.max(0, Math.floor((R.y - 40) * k));
        const x1 = Math.min(gl.width, Math.ceil((R.x + R.w + 40) * k));
        const y1 = Math.min(gl.height, Math.ceil((R.y + R.h + 40) * k));
        for (let y = y0; y < y1; y += 2)
          for (let x = x0; x < x1; x += 2) {
            const i = (y * gl.width + x) * 4;
            const lo = lum(off, i);
            const lw = lum(on, i);
            if (lw - lo > max) max = lw - lo;
            if (lw >= 240 && lw - lo > 48) clip++; // clipped AND the FX added a visible amount
          }
      }
      return { clip, max, plates };
    };
  });
  const worst: Record<string, string> = {};
  for (const s of SCENARIOS) {
    let clip = 0;
    let max = 0;
    let plates = 0;
    for (const step of s.steps) {
      await demo(page, step.demo);
      // sample ~every 0.1 s of stage time through the step
      const n = Math.max(2, Math.round(step.wait / 0.1));
      for (let i = 0; i < n; i++) {
        await stageWait(page, step.wait / n);
        await freeze(page);
        const r = await page.evaluate(() =>
          (
            window as unknown as { __ko: () => { clip: number; max: number; plates: number } }
          ).__ko(),
        );
        await thaw(page);
        if (r.clip > 0 || process.env.KO_VERBOSE)
          console.log(`KO ${s.name} ${step.demo} #${i} clip=${r.clip} max=${r.max.toFixed(0)}`);
        clip += r.clip;
        max = Math.max(max, r.max);
        plates = Math.max(plates, r.plates);
      }
    }
    const ko = await page.evaluate(() => window.__ch2Demo?.keepOut());
    worst[s.name] =
      `clip=${clip} maxFxLuma=${max.toFixed(0)} plates=${plates} gate=${JSON.stringify(ko)}`;
    expect(clip, `${s.name}: FX-only clipped pixels inside a plate keep-out band`).toBe(0);
    expect(max, `${s.name}: FX luma inside a plate keep-out band`).toBeLessThanOrEqual(FX_MAX);
  }
  console.log(`KEEPOUT ${TAG} ${JSON.stringify(worst, null, 1)}`);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("capital accent: a shifted CharCorrect vs a plain one", async ({ page }) => {
  const errors = await open(page);
  const fire = (shifted: boolean): Promise<boolean> =>
    page.evaluate((sh) => {
      const p = window.__play as PlayDebug;
      const v = p.view();
      const plate = v.plates.find((x) => x.kind === "word");
      if (!plate || !p.session.typingFx) return false;
      p.session.typingFx.handle.onEvent({
        type: "CharCorrect",
        tick: v.tick,
        plateId: plate.id,
        ownerId: plate.ownerId,
        kind: plate.kind,
        index: 0,
        char: plate.text.charAt(0),
        isLast: false,
        keyStreakTier: 0,
        ...(sh ? { shifted: true } : {}),
        // biome-ignore lint/suspicious/noExplicitAny: synthetic event for a still
      } as any);
      return true;
    }, shifted);
  expect(await fire(true)).toBe(true);
  // 40 ms of real time: the crown + bar are up (the HUD clock is real time, not the stage clock)
  await page.waitForTimeout(40);
  await page.screenshot({ path: path.join(outDir, `${TAG}-capital.png`) });
  expect(errors, errors.join("\n")).toEqual([]);
});

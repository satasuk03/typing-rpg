import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { assertRealGpu, installGlCounters, openLevel, playUrl, watchErrors } from "./helpers";

/**
 * T6.4 memory soak: loop ch1-l05 with the 60 WPM bot, restarting (PlaySession.restart) whenever the level ends.
 * Samples every SOAK_SAMPLE_S (30) seconds for SOAK_MINUTES (5; use 30 for the report run):
 *   three.js renderer.info.memory (geometries, textures) + programs, live GL objects (framebuffers = render targets,
 *   renderbuffers, textures, buffers, vertex arrays, programs; counted by wrapping create/delete on the GL context),
 *   JS heap (after a forced GC; needs --expose-gc / --enable-precise-memory-info, set in the config), scene mesh count.
 * Asserts no monotonic growth after warm-up. CSV goes to tests/perf/out/soak-<minutes>m.csv (gitignored).
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const MINUTES = Number(process.env.SOAK_MINUTES ?? 5);
const SAMPLE_S = Number(process.env.SOAK_SAMPLE_S ?? 30);
const LEVEL = process.env.SOAK_LEVEL ?? "ch1-l05";

interface Sample {
  tMin: number;
  heapMB: number;
  geometries: number;
  textures: number;
  programs: number;
  fbo: number;
  rbo: number;
  glTextures: number;
  glBuffers: number;
  glVaos: number;
  glPrograms: number;
  meshes: number;
  restarts: number;
}

const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

test(`soak: ${LEVEL} for ${MINUTES} min, no leaks`, async ({ page }) => {
  test.setTimeout((MINUTES + 5) * 60_000);
  const errors = watchErrors(page);
  await installGlCounters(page);
  await openLevel(page, playUrl(LEVEL, { tier: 0, wpm: 60, seed: 11, acc: 0.97 }));
  const gpu = await assertRealGpu(page);

  // Auto-restart on level end. Runs in the page so it keeps going between samples.
  await page.evaluate(() => {
    const w = window as unknown as { __restarts: number };
    w.__restarts = 0;
    setInterval(() => {
      const p = window.__play;
      if (p?.result() && p.session.runner.terminal) {
        p.session.restart();
        w.__restarts++;
      }
    }, 500);
  });

  const samples: Sample[] = [];
  const total = Math.floor((MINUTES * 60) / SAMPLE_S);
  for (let i = 0; i <= total; i++) {
    if (i > 0) await page.waitForTimeout(SAMPLE_S * 1000);
    const s = await page.evaluate(
      (tMin) => {
        const w = window as unknown as {
          gc?: () => void;
          __restarts: number;
          __gl: Record<string, number>;
        };
        w.gc?.();
        const world = window.__play?.session.world;
        const r = world?.renderer;
        let meshes = 0;
        world?.scene.traverse((o) => {
          if ((o as { isMesh?: boolean }).isMesh) meshes++;
        });
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const gl = w.__gl;
        return {
          tMin,
          heapMB: (mem?.usedJSHeapSize ?? 0) / 1048576,
          geometries: r?.info.memory.geometries ?? 0,
          textures: r?.info.memory.textures ?? 0,
          programs: r?.info.programs?.length ?? 0,
          fbo: gl.framebuffer ?? 0,
          rbo: gl.renderbuffer ?? 0,
          glTextures: gl.texture ?? 0,
          glBuffers: gl.buffer ?? 0,
          glVaos: gl.vertexArray ?? 0,
          glPrograms: gl.program ?? 0,
          meshes,
          restarts: w.__restarts,
        };
      },
      (i * SAMPLE_S) / 60,
    );
    samples.push(s);
    console.log(`SOAK ${JSON.stringify(s)}`);
  }

  const out = path.join(dir, "out");
  mkdirSync(out, { recursive: true });
  const keys = Object.keys(samples[0] as Sample) as (keyof Sample)[];
  writeFileSync(
    path.join(out, `soak-${MINUTES}m.csv`),
    [keys.join(","), ...samples.map((s) => keys.map((k) => s[k].toFixed(2)).join(","))].join("\n"),
  );
  console.log(`SOAK GPU ${gpu}`);

  // Warm-up = the first full pass over the level: three.js counts a geometry only once it is first drawn, so the
  // camera walking into unseen scenery (and lazily built sprite frames) raises counts until the level has been seen
  // once. The first restart marks the end of that pass; everything after it must be flat.
  const firstRestart = samples.findIndex((s) => s.restarts > 0);
  expect(firstRestart, "level never restarted: soak did not exercise reset").toBeGreaterThan(0);
  const post = samples.slice(firstRestart + 1);
  expect(post.length, "soak too short to judge").toBeGreaterThanOrEqual(4);
  const head = post.slice(0, 3);
  const tail = post.slice(-3);
  const ratio = (k: keyof Sample): number =>
    median(tail.map((s) => s[k])) / Math.max(1e-9, median(head.map((s) => s[k])));
  // JS heap is GC-noisy: allow 10%. Counted GPU/scene objects must be flat (small slack for transient VFX pools).
  expect(ratio("heapMB"), "JS heap grew > 10%").toBeLessThan(1.1);
  for (const k of [
    "geometries",
    "textures",
    "programs",
    "fbo",
    "rbo",
    "glTextures",
    "glBuffers",
    "glVaos",
    "glPrograms",
    "meshes",
  ] as const) {
    const grow = median(tail.map((s) => s[k])) - median(head.map((s) => s[k]));
    expect(grow, `${k} grew by ${grow} after warm-up`).toBeLessThanOrEqual(
      Math.max(4, 0.02 * median(head.map((s) => s[k]))),
    );
  }
  expect(errors.list, errors.list.join("\n")).toEqual([]);
});

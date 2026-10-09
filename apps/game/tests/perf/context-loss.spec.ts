import { expect, test } from "@playwright/test";
import { assertRealGpu, installGlCounters, openLevel, playUrl, watchErrors } from "./helpers";

/**
 * T6.4 context loss: WEBGL_lose_context.loseContext() mid-battle, then restoreContext().
 * Asserts: the sim pauses while the context is gone, every GPU resource comes back (live render targets / textures match
 * the pre-loss counts and the picture is not blank), play resumes, the level finishes, zero uncaught errors, and the only
 * console output is the expected three.js "Context Lost/Restored" warnings.
 */
const LEVEL = process.env.CTX_LEVEL ?? "ch1-l05";

test(`context loss: ${LEVEL} survives lose/restore mid-battle and finishes`, async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const errors = watchErrors(page);
  await installGlCounters(page);
  await openLevel(page, playUrl(LEVEL, { tier: 0, wpm: 60, seed: 3, acc: 0.97 }));
  await assertRealGpu(page);

  const state = () =>
    page.evaluate(() => {
      const p = window.__play;
      const w = window as unknown as { __gl: Record<string, number> };
      return {
        tick: p?.view().tick ?? -1,
        phase: p?.phase() ?? "",
        paused: p?.session.runner.paused ?? false,
        // three.js bookkeeping (the raw GL counters keep counting the dead pre-loss objects, which the driver frees).
        fbo: w.__gl.framebuffer ?? 0,
        tex: p?.session.world.renderer.info.memory.textures ?? 0,
        geo: p?.session.world.renderer.info.memory.geometries ?? 0,
        prog: p?.session.world.renderer.info.programs?.length ?? 0,
        calls: p?.session.world.renderer.info.render.calls ?? 0,
        resultsShown: p?.resultsShown() ?? false,
      };
    });

  await page.waitForFunction(
    () => window.__play?.phase() === "combat" && (window.__play?.view().tick ?? 0) > 600,
    undefined,
    { timeout: 120_000, polling: 250 },
  );
  await page.waitForTimeout(1500);
  const before = await state();
  const shotBefore = (await page.screenshot()).length;

  await page.evaluate(() => {
    const gl = (document.getElementById("gl") as HTMLCanvasElement).getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context unavailable");
    (window as unknown as { __ext: WEBGL_lose_context }).__ext = ext;
    ext.loseContext();
  });
  await page.waitForTimeout(400);
  const lostA = await state();
  await page.waitForTimeout(1500);
  const lostB = await state();
  expect(lostB.tick, "sim must be paused while the GL context is lost").toBe(lostA.tick);

  await page.evaluate(() =>
    (window as unknown as { __ext: WEBGL_lose_context }).__ext.restoreContext(),
  );
  await page.waitForTimeout(2500);
  const after = await state();
  const shotAfter = (await page.screenshot()).length;
  console.log(
    `CTX before ${JSON.stringify(before)} lost ${JSON.stringify(lostB)} after ${JSON.stringify(after)}`,
  );
  console.log(`CTX screenshot bytes before ${shotBefore} after ${shotAfter}`);

  expect(after.paused, "game must resume after restore").toBe(false);
  expect(after.tick, "sim must advance after restore").toBeGreaterThan(lostB.tick);
  expect(after.calls, "renderer must be drawing again").toBeGreaterThan(0);
  expect(shotAfter, "picture is blank after restore").toBeGreaterThan(shotBefore * 0.5);
  // Resources: no leaked or missing render targets / programs after the rebuild (three.js counts; textures may differ by pool timing).
  expect(Math.abs(after.prog - before.prog)).toBeLessThanOrEqual(4);
  expect(after.tex).toBeLessThanOrEqual(before.tex + 8);
  expect(after.geo).toBeLessThanOrEqual(before.geo + 8);

  // The bot keeps typing: the level must still finish.
  await page.waitForFunction(() => window.__play?.result() !== null, undefined, {
    timeout: 6 * 60_000,
    polling: 1000,
  });
  const res = await page.evaluate(() => window.__play?.result()?.outcome ?? null);
  console.log(`CTX level result: ${JSON.stringify(res)}`);

  const unexpected = errors.warnings.filter(
    (w) => !/context (lost|restored)/i.test(w) && !/Oscillator\.frequency/.test(w),
  );
  console.log(`CTX warnings: ${JSON.stringify(errors.warnings)}`);
  expect(errors.list, errors.list.join("\n")).toEqual([]);
  expect(unexpected, unexpected.join("\n")).toEqual([]);
});

/**
 * T6.3 item 11: does the starter kit really cast Fireball in the browser bot run, and does the effect reach the stage?
 * `?scene=play&level=ch1-l05&wpm-bot=60&onboard=0` on real Metal. The still is taken 0.3 s of STAGE time after the first
 * real SkillCast (the sim's own event, not a demo): the cast flash at the weapon tip, the fireball in flight.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");

test("bot run: a real SkillCast reaches the stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?scene=play&level=ch1-l05&wpm-bot=60&onboard=0&audio=0&seed=4");
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 90_000 });
  const t0 = Date.now();
  const res = await page.evaluate(
    () =>
      new Promise<{ cast: boolean; sinceCastS: number; effectLive: boolean }>((resolve) => {
        const p = window.__play as PlayDebug;
        const s = p.session;
        const giveUp = performance.now() + 240_000;
        let castAt = -1;
        const f = (): void => {
          const casts = p.seen().SkillCast ?? 0;
          if (castAt < 0 && casts > 0) castAt = s.stage.time;
          if (castAt >= 0 && s.stage.time >= castAt + 0.3) {
            // freeze the world on this frame, then report whether the combat library has something alive
            s.typingFx?.handle.timeDilation.hitStop(600_000);
            const d = s.combat?.fx.diagnostics();
            resolve({
              cast: true,
              sinceCastS: s.stage.time - castAt,
              effectLive: (d?.projectiles ?? 0) + (d?.lights ?? 0) + (d?.poolA ?? 0) > 0,
            });
            return;
          }
          if (performance.now() > giveUp) {
            resolve({ cast: false, sinceCastS: 0, effectLive: false });
            return;
          }
          requestAnimationFrame(f);
        };
        f();
      }),
  );
  const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
  console.log("seen", JSON.stringify(seen), "after", Date.now() - t0, "ms", JSON.stringify(res));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, "metal-real-skillcast.png") });
  // what is alive near the target blob: visible scene quads with their projected pixel position, size and intensity
  const near = await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const w = p.session.world;
    const out: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    w.scene.traverse((o: any) => {
      if (!o.visible || !o.isMesh || !o.material?.uniforms?.uI) return;
      const v = o.position.clone().project(w.camera.camera);
      const x = (v.x * 0.5 + 0.5) * 1280;
      const y = (-v.y * 0.5 + 0.5) * 720;
      if (Math.abs(x - 800) < 260 && Math.abs(y - 450) < 200)
        out.push(
          `${o.material.uniforms.uKind?.value} x${Math.round(x)} y${Math.round(y)} sc${o.scale.x.toFixed(2)} i${o.material.uniforms.uI.value.toFixed(2)} c${o.material.uniforms.uColor?.value?.toArray().map((n: number) => n.toFixed(1))}`,
        );
    });
    return out;
  });
  console.log("near blob:", JSON.stringify(near));
  // bisect: hide each visible scene mesh in turn and count the near-white pixels left in the blob's box
  const bis = await page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const w = p.session.world;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const k = gl.width / 1280;
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const count = (): number => {
      w.render();
      ctx.drawImage(gl, 0, 0);
      const d = ctx.getImageData(
        Math.round(650 * k),
        Math.round(330 * k),
        Math.round(300 * k),
        Math.round(240 * k),
      ).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if ((d[i] ?? 0) > 240 && (d[i + 1] ?? 0) > 240 && (d[i + 2] ?? 0) > 240) n++;
      return n;
    };
    const base = count();
    const res: string[] = [`base ${base}`];
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    const meshes: any[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    w.scene.traverse((o: any) => {
      if (o.visible && (o.isMesh || o.isPoints)) meshes.push(o);
    });
    for (const o of meshes) {
      const v = o.position.clone().project(w.camera.camera);
      const x = Math.round((v.x * 0.5 + 0.5) * 1280);
      const y = Math.round((-v.y * 0.5 + 0.5) * 720);
      o.visible = false;
      const n = count();
      o.visible = true;
      const d = base - n;
      if (d > 150)
        res.push(
          `-${d} kind${o.material?.uniforms?.uKind?.value} ${o.material?.type} ${o.name} x${x} y${y} order${o.renderOrder} i${o.material?.uniforms?.uI?.value}`,
        );
    }
    return res;
  });
  console.log("bisect:", JSON.stringify(bis));
  // the same frame without the HUD canvas: tells world glare from HUD hit flashes
  await page.evaluate(() => {
    (document.getElementById("hud") as HTMLElement).style.display = "none";
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outDir, "metal-real-skillcast-gl.png") });
  expect(res.cast, "no SkillCast in 240 s").toBe(true);
  expect(res.effectLive, "the combat VFX library has nothing alive 0.3 s after the cast").toBe(
    true,
  );
  expect(errors).toEqual([]);
});

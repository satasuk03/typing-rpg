/**
 * T6.3 W4 P1-1 / P2-1 (streams every sample to the console: the page can navigate away at the results screen): L10 boss fight on real Metal. Every Break and BossPhaseChanged is sampled at +100 / +300 /
 * +600 ms: the golem body box (GL canvas only) clipped share, mean luma and saturation. Prints the worst values.
 *   PW_PORT=5321 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-fight
 */
import { expect, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { openPlay } from "./playHelpers";

test.setTimeout(900_000);

interface FightSample {
  ev: string;
  dt: number;
  clip: number;
  luma: number;
  sat: number;
}

test("L10 fight: boss Break / phase frames stay readable", async ({ page }) => {
  const errors = await openPlay(page, "level=ch1-l10&difficulty=story&seed=5&wpm-bot=90");
  page.on("console", (m) => {
    if (m.text().startsWith("W4")) console.log(m.text());
  });
  await page.evaluate((BIS) => {
    const p = window.__play as PlayDebug;
    const s = p.session;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const stats = (): { clip: number; luma: number; sat: number } | null => {
      const view = p.view();
      const boss = view.enemies.find((e) => e.isBoss && e.alive);
      if (!boss) return null;
      const a = { kind: "enemy", id: boss.id, slot: boss.slot } as const;
      const head = s.stage.projector({ ...a, part: "head" });
      const feet = s.stage.projector({ ...a, part: "feet" });
      if (!head || !feet) return null;
      const k = gl.width / window.innerWidth;
      const h = (feet.y - head.y) * k;
      const x0 = Math.max(0, Math.round(feet.x * k - h * 0.4));
      const y0 = Math.max(0, Math.round(head.y * k + h * 0.1));
      s.world.render();
      ctx.drawImage(gl, 0, 0);
      const d = ctx.getImageData(
        x0,
        y0,
        Math.min(Math.round(h * 0.8), gl.width - x0),
        Math.min(Math.round(h * 0.8), gl.height - y0),
      ).data;
      let clip = 0;
      let sum = 0;
      let sat = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const r = (d[i] ?? 0) / 255;
        const g = (d[i + 1] ?? 0) / 255;
        const b = (d[i + 2] ?? 0) / 255;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += l;
        if (l >= 0.94) clip++;
        const mx = Math.max(r, g, b);
        sat += mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
      }
      return { clip: clip / n, luma: sum / n, sat: sat / n };
    };
    const out: FightSample[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__w3 = out;
    let bisects = 0;
    let lastB = 0;
    let nextDemo = 0;
    let demoN = 0;
    let lastP = 0;
    const pend: { ev: string; at: number; dt: number }[] = [];
    const f = (): void => {
      const seen = p.seen();
      const b = seen.Break ?? 0;
      const ph = seen.BossPhaseChanged ?? 0;
      const now = s.stage.time * 1000;
      // extra, injected Break / phase VFX on the boss (the sim only Breaks it ~6 times per run); tagged d-*
      const boss = p.view().enemies.find((e) => e.isBoss && e.alive);
      if (boss && p.phase() === "combat" && now > nextDemo) {
        nextDemo = now + 5000;
        demoN++;
        const which = demoN % 4 === 0 ? "phase" : "break";
        if (p.demo?.(which)) {
          const dts = which === "phase" ? [100, 300] : [100, 300, 600];
          for (const dt of dts) pend.push({ ev: `d-${which}`, at: now + dt, dt });
        }
      }
      if (b > lastB) {
        lastB = b;
        for (const dt of [100, 300, 600]) pend.push({ ev: "break", at: now + dt, dt });
      }
      if (ph > lastP) {
        lastP = ph;
        for (const dt of [100, 300]) pend.push({ ev: "phase", at: now + dt, dt });
      }
      for (let i = pend.length - 1; i >= 0; i--) {
        const q = pend[i];
        if (q && now >= q.at) {
          pend.splice(i, 1);
          const st = stats();
          if (st) {
            out.push({ ev: q.ev, dt: q.dt, ...st });
            console.log(`W4S ${JSON.stringify({ ev: q.ev, dt: q.dt, ...st })}`);
          }
          if (BIS && st && st.clip > 0.12 && bisects < 6) {
            bisects++;
            // hide each visible scene mesh in turn: which ones carry the white?
            const res: string[] = [`base ${st.clip.toFixed(2)}`];
            // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
            const ms: any[] = [];
            // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
            s.world.scene.traverse((o: any) => {
              if (o.visible && (o.isMesh || o.isPoints)) ms.push(o);
            });
            for (const o of ms) {
              o.visible = false;
              const s2 = stats();
              o.visible = true;
              if (s2 && st.clip - s2.clip > 0.04)
                res.push(
                  `-${(st.clip - s2.clip).toFixed(2)} kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value} ${o.material?.type} y${o.position.y.toFixed(1)} sc${o.scale.x.toFixed(1)}`,
                );
            }
            // biome-ignore lint/suspicious/noExplicitAny: test-only global
            console.log(`W4B ${q.ev} ${q.dt} ${JSON.stringify(res)}`);
          }
        }
      }
      requestAnimationFrame(f);
    };
    f();
  }, !!process.env.BISECT);
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout: 800_000,
  });
  expect(errors, errors.join("\n")).toEqual([]);
});

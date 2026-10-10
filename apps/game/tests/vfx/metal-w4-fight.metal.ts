/**
 * T6.3 W4 P1-1 / P2-1 (streams every sample to the console: the page can navigate away at the results screen): L10 boss fight on real Metal. Every Break and BossPhaseChanged is sampled at +100 / +300 /
 * +600 ms: the golem body box (GL canvas only) clipped share, mean luma and saturation. Prints the worst values.
 *   PW_PORT=5321 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-fight
 */
import fs from "node:fs";
import path from "node:path";
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
  const errors = await openPlay(
    page,
    `level=ch1-l10&difficulty=story&seed=${process.env.SEED ?? 5}&wpm-bot=${process.env.WPM ?? 90}`,
  );
  page.on("console", (m) => {
    if (m.text().startsWith("W4J") && process.env.STILL_DIR) {
      const [tag, url] = m.text().slice(4).split("|");
      fs.writeFileSync(
        path.join(process.env.STILL_DIR, `fight-${tag}-${Date.now() % 100000}.jpg`),
        Buffer.from((url ?? "").split(",")[1] ?? "", "base64"),
      );
    } else if (m.text().startsWith("W4") && !m.text().startsWith("W4J")) console.log(m.text());
  });
  await page.evaluate(
    ([BIS, VARS, WHICH, PEEL]) => {
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
      let peels = 0;
      let lastB = 0;
      let nextDemo = 0;
      let prevSeen: Record<string, number> = {};
      const recent: { t: number; type: string }[] = [];
      let shotN = 0;
      let nextBase = 0;
      let demoN = 0;
      let lastP = 0;
      const pend: { ev: string; at: number; dt: number }[] = [];
      const f = (): void => {
        const seen = p.seen();
        for (const k of Object.keys(seen))
          if ((seen[k] ?? 0) > (prevSeen[k] ?? 0)) recent.push({ t: s.stage.time, type: k });
        prevSeen = { ...seen };
        while (recent.length > 0 && (recent[0]?.t ?? 0) < s.stage.time - 0.8) recent.shift();
        const b = seen.Break ?? 0;
        const ph = seen.BossPhaseChanged ?? 0;
        const now = s.stage.time * 1000;
        // extra, injected Break / phase VFX on the boss (the sim only Breaks it ~6 times per run); tagged d-*
        const boss = p.view().enemies.find((e) => e.isBoss && e.alive);
        if (boss && p.phase() === "combat" && now > nextDemo) {
          nextDemo = now + (VARS ? 2500 : 5000);
          demoN++;
          const which = VARS ? WHICH : demoN % 4 === 0 ? "phase" : "break";
          // variant probe: no-op one kit call for the duration of the injected effect (A/B on the same fight)
          const names = [
            "",
            "hex",
            "star",
            "flash",
            "lineRing",
            "sparks",
            "ring",
            "postFlash",
            "rim",
          ];
          const v = VARS ? names[demoN % names.length] : "";
          // biome-ignore lint/suspicious/noExplicitAny: test-only patching
          const kit = (p.session.combat as any)?.fx?.kit;
          const orig = v && kit ? kit[v] : null;
          if (v && kit && orig) kit[v] = () => {};
          const okDemo = p.demo?.(which);
          if (v && kit && orig) kit[v] = orig;
          if (okDemo) {
            const dts = which === "phase" ? [100, 300] : [100, 300, 600];
            const tag = `d-${which}${v ? `-${v}` : ""}`;
            for (const dt of dts) pend.push({ ev: tag, at: now + dt, dt });
          }
        }
        if (boss && p.phase() === "combat" && now > nextBase) {
          nextBase = now + 1500;
          pend.push({ ev: "base", at: now + 1, dt: 0 });
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
              if ((q.ev === "break" || q.ev === "phase") && q.dt < 400 && shotN < 12) {
                shotN++;
                console.log(
                  `W4J ${q.ev}-${q.dt}-${st.clip.toFixed(2)}|${gl.toDataURL("image/jpeg", 0.85)}`,
                );
              }
            }
            if (PEEL && st && st.clip > 0.12 && peels < 6 && q.dt === 100) {
              peels++;
              // cumulative peel: hide every visible fx mesh one after the other (highest render order first) and log the
              // clip / luma after each; single hides under-report when several additive layers overlap
              // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
              const ms: any[] = [];
              // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
              s.world.scene.traverse((o: any) => {
                if (o.visible && (o.isMesh || o.isPoints) && o.renderOrder >= 6) ms.push(o);
              });
              ms.sort((x, y) => y.renderOrder - x.renderOrder);
              // dynamic lights off first (they light the sprite, no mesh to hide)
              // biome-ignore lint/suspicious/noExplicitAny: test-only access
              const rig = (s.world as any).lights;
              const saved: number[] = [];
              for (const L of rig.dynamics) saved.push(L.intensity);
              for (const L of rig.dynamics) L.intensity = 0;
              rig.update(0, s.world.camera.pose.x, 0);
              const sl = stats();
              const lightsOff = sl ? `${sl.clip.toFixed(2)}/${sl.luma.toFixed(2)}` : "?";
              rig.dynamics.forEach((L: { intensity: number }, i: number) => {
                L.intensity = saved[i] ?? 0;
              });
              rig.update(0, s.world.camera.pose.x, 0);
              const out: string[] = [
                `${q.ev} base ${st.clip.toFixed(2)}/${st.luma.toFixed(2)} lightsOff ${lightsOff} nLights ${saved.length}`,
              ];
              let last = st.clip;
              let lastL = st.luma;
              for (const o of ms) {
                o.visible = false;
                const s2 = stats();
                if (s2 && (last - s2.clip > 0.012 || lastL - s2.luma > 0.03))
                  out.push(
                    `${s2.clip.toFixed(2)}/${s2.luma.toFixed(2)} (-${o.material?.uniforms?.uKind ? "" : "pool "}kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} i${o.material?.uniforms?.uI?.value?.toFixed?.(2)} y${o.position.y.toFixed(1)} sc${o.scale.x.toFixed(1)})`,
                  );
                if (s2) {
                  last = s2.clip;
                  lastL = s2.luma;
                }
              }
              for (const o of ms) o.visible = true;
              console.log(
                `W4B PEEL ${JSON.stringify(out)} EVENTS ${[...new Set(recent.map((e) => e.type))].join("+")}`,
              );
            }
            if (BIS && st && st.clip > 0.12 && bisects < 14) {
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
              console.log(`W4B ${q.ev} ${q.dt} ${JSON.stringify(res)}`);
            }
          }
        }
        requestAnimationFrame(f);
      };
      f();
    },
    [
      !!process.env.BISECT,
      !!process.env.VARIANTS,
      process.env.WHICH ?? "break",
      !!process.env.PEEL,
    ] as const,
  );
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout: 800_000,
  });
  expect(errors, errors.join("\n")).toEqual([]);
});

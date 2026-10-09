/**
 * Shared helpers for the real-runner (`?scene=play&demo=1`) world tests: open, freeze on the stage clock, run a
 * demo effect to a stage time, and probe the hero (silhouette area / edges / contrast, see `heroProbe.ts`).
 */
import { expect, type Page } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import type { HeroMetrics } from "../../src/render/vfx/heroProbe";

export async function openPlay(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=play&audio=0&demo=1&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 90_000 });
  return errors;
}

export async function waitPhase(page: Page, phase: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction((p) => window.__play?.phase() === p, phase, { timeout });
}

/** Freeze the world (stage, combat VFX, particle pools): the sim clock keeps going, presentation stops. */
export async function freeze(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.hitStop(600_000);
  });
  await page.waitForTimeout(250);
}
export async function thaw(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.reset();
  });
}

/** Play `name`, run `atSec` of STAGE time, then freeze. */
export async function playTo(page: Page, name: string, atSec: number): Promise<void> {
  const ok = await page.evaluate(
    ([n, at]) =>
      new Promise<boolean>((resolve) => {
        const p = window.__play as PlayDebug;
        const s = p.session;
        if (!(p.demo?.(n as string) ?? false)) return resolve(false);
        const t0 = s.stage.time + (at as number);
        const giveUp = performance.now() + 30_000;
        const f = (): void => {
          if (s.stage.time >= t0 || performance.now() > giveUp) resolve(true);
          else requestAnimationFrame(f);
        };
        f();
      }),
    [name, atSec] as const,
  );
  expect(ok, `demo(${name}) found nothing to aim at`).toBe(true);
}

export interface PlayProbe extends HeroMetrics {
  rect: { x: number; y: number; w: number; h: number };
}

/** Hero metrics of the CURRENT (frozen) frame, GL canvas only (the HUD sits above WebGL and is measured elsewhere). */
export async function probeHero(page: Page): Promise<PlayProbe> {
  return page.evaluate(async () => {
    const spec = "/src/render/vfx/heroProbe.ts";
    const { analyseHero } = (await import(
      /* @vite-ignore */ spec
    )) as typeof import("../../src/render/vfx/heroProbe");
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
    const M = 64;
    const rect = {
      x: Math.max(0, Math.round(feet.x * k - hh * 0.36)),
      y: Math.max(0, Math.round(head.y * k - hh * 0.05)),
      w: Math.round(hh * 0.72),
      h: Math.round(hh * 1.1),
    };
    const cx = Math.max(0, rect.x - M);
    const cy = Math.max(0, rect.y - M);
    const cw = Math.min(gl.width - cx, rect.w + 2 * M);
    const ch = Math.min(gl.height - cy, rect.h + 2 * M);
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const grab = (hide: boolean): ImageData => {
      hero.mesh.visible = !hide;
      s.world.render();
      ctx.clearRect(0, 0, off.width, off.height);
      ctx.drawImage(gl, 0, 0); // the back buffer is only readable in the task that rendered it
      hero.mesh.visible = true;
      return ctx.getImageData(cx, cy, cw, ch);
    };
    const shown = grab(false);
    const hidden = grab(true);
    s.world.render();
    const m = analyseHero(shown.data, hidden.data, cw, ch, 24, M);
    return { ...m, rect };
  });
}

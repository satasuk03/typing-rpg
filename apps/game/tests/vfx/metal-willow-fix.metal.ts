/**
 * Willow fix captures (P1-3, P2-2..P2-5), real Metal. Plays ch2-l10 with the bot and, at each Willow moment, grabs a run of
 * consecutive real-time frames (screenshot + a boss-vs-background probe: the boss mesh is hidden for a second render and the
 * two GL frames are diffed, the same trick as heroProbe). Frames go to STILL_DIR as `<TAG>-<moment>-NN.png`; a JSON line per
 * frame goes to stdout (`WF`).
 *
 *   TAG=after PW_PORT=5451 STILL_DIR=/abs/dir pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-willow-fix
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";
import { openPlay } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
const TAG = process.env.TAG ?? "after";
const FRAMES = Number(process.env.FRAMES ?? 14);
test.setTimeout(900_000);

interface Probe {
  t: number;
  state: string;
  flash: number;
  rim: number;
  bossL: number;
  bgL: number;
  ratio: number;
  cover: number;
  fog: number;
}

/** Boss-vs-background metrics of the CURRENT frame (render twice: boss shown / hidden). */
async function probe(page: Page): Promise<Probe | null> {
  return page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const s = p.session;
    const v = p.view();
    const boss = v.enemies.find((e) => e.isBoss);
    // biome-ignore lint/suspicious/noExplicitAny: test-only access to the private foe actors
    const foe = boss ? (s.stage as any).foes.get(boss.id) : null;
    if (!foe) return null;
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const k = gl.width / window.innerWidth;
    const c = s.stage.projector({ kind: "enemy", id: boss?.id ?? 0, slot: 0, part: "body" });
    if (!c) return null;
    const off = document.createElement("canvas");
    off.width = gl.width;
    off.height = gl.height;
    const ctx = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const R = { x: Math.max(0, Math.round(c.x * k - 520)), y: 0, w: 1040, h: gl.height };
    R.w = Math.min(R.w, gl.width - R.x);
    const grab = (hide: boolean): ImageData => {
      foe.actor.mesh.visible = !hide;
      s.world.render();
      ctx.clearRect(0, 0, off.width, off.height);
      ctx.drawImage(gl, 0, 0);
      foe.actor.mesh.visible = true;
      return ctx.getImageData(R.x, R.y, R.w, R.h);
    };
    const a = grab(false);
    const b = grab(true);
    s.world.render();
    let n = 0;
    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const la =
        0.2126 * (a.data[i] ?? 0) + 0.7152 * (a.data[i + 1] ?? 0) + 0.0722 * (a.data[i + 2] ?? 0);
      const lb =
        0.2126 * (b.data[i] ?? 0) + 0.7152 * (b.data[i + 1] ?? 0) + 0.0722 * (b.data[i + 2] ?? 0);
      if (Math.abs(la - lb) > 10) {
        n++;
        sumA += la;
        sumB += lb;
      }
    }
    const bossL = n ? sumA / n : 0;
    const bgL = n ? sumB / n : 0;
    // biome-ignore lint/suspicious/noExplicitAny: uniforms
    const u = (foe.actor.mesh.material as any).uniforms ?? {};
    return {
      t: s.stage.time,
      state: foe.wLast as string,
      flash: u.uFlash?.value ?? -1,
      rim: u.uRimFlash?.value ?? -1,
      bossL,
      bgL,
      ratio: (Math.max(bossL, bgL) + 16) / (Math.min(bossL, bgL) + 16),
      cover: n / (a.data.length / 4),
      fog: s.world.currentMood.fogCol[0],
    };
  });
}

async function strip(page: Page, name: string, n = FRAMES): Promise<void> {
  for (let i = 0; i < n; i++) {
    const pr = await probe(page);
    await page.screenshot({
      path: path.join(outDir, `${TAG}-${name}-${String(i).padStart(2, "0")}.png`),
    });
    console.log(`WF ${TAG} ${name} ${i} ${JSON.stringify(pr)}`);
  }
}

test("Willow moments", async ({ page }) => {
  fs.mkdirSync(outDir, { recursive: true });
  const errors = await openPlay(page, "level=ch2-l10&seed=7&wpm-bot=60&difficulty=story");
  const done = new Set<string>();
  const want = (process.env.MOMENTS ?? "p1,spell,riddle,freed").split(",");
  const seenRiddle = { n: 0 };
  const t0 = Date.now();
  while (Date.now() - t0 < 800_000 && want.some((w) => !done.has(w))) {
    const st = await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      const v = p.view();
      const boss = v.enemies.find((e) => e.isBoss);
      return {
        phase: v.phase,
        boss: boss ? { alive: boss.alive, frac: boss.hpFrac } : null,
        doom: v.doom !== null,
        riddle: v.minigame?.kind === "riddle",
        resolved: p.seen().RiddleResolved ?? 0,
        completed: p.seen().FinisherCompleted ?? 0,
        result: p.result() !== null,
      };
    });
    if (st.result) break;
    if (
      st.boss?.alive &&
      st.boss.frac > 0.9 &&
      st.phase === "combat" &&
      !st.doom &&
      !st.riddle &&
      !done.has("p1")
    ) {
      await page.waitForTimeout(1500);
      done.add("p1");
      await strip(page, "p1", 2);
    }
    if (st.doom && !done.has("spell") && want.includes("spell")) {
      await page.waitForTimeout(900);
      done.add("spell");
      await strip(page, "spell");
    }
    if (st.resolved > seenRiddle.n) {
      seenRiddle.n = st.resolved;
      if (!done.has("riddle") && want.includes("riddle")) {
        done.add("riddle");
        await strip(page, "riddle", 18);
      }
    }
    if (st.completed > 0 && !done.has("freed") && want.includes("freed")) {
      done.add("freed");
      for (const [i, w] of [0.4, 1.0, 1.2, 1.2, 1.6].entries()) {
        await page.waitForTimeout(w * 1000);
        await strip(page, `freed${i}`, 1);
      }
    }
    await page.waitForTimeout(80);
  }
  console.log(
    `MOMENTS done=${[...done].join(",")} phase=${await page.evaluate(() => (window.__play as PlayDebug).phase())}`,
  );
  expect(errors, errors.join("\n")).toEqual([]);
});

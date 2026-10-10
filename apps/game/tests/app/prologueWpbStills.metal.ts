/**
 * P4.2 WP-B before/after capture on real Metal: raw PNGs of the moments docs/qa/prologue-review-1.md measures, from the REAL
 * prologue session. Part A / C are parked with `__play.proSeek(t)`, Part B is live (wpm-bot). Raw PNGs go to $WPB_OUT (a scratch
 * dir); a python script measures them and writes the JPEG pairs into docs/qa/prologue-p4.2b/.
 *
 * The seek times are parameters so the same spec can shoot `main` (the "before" timeline) and this branch:
 *   WPB_A='[["a-4000",4000]]' WPB_C='[["c-300",300],["c-1200",1200]]' WPB_OUT=/tmp/x WPB_W=1920 WPB_H=1080 APP_PORT=5469 \
 *     ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueWpbStills
 * Defaults are the retimed (after) list. `WPB_PARTS` = any of A, B, C.
 */
import fs from "node:fs";
import path from "node:path";
import { type Page, test } from "@playwright/test";
import { expect, openApp, pressStart, proState, waitProPhase } from "./helpers";

const W = Number(process.env.WPB_W ?? 1920);
const H = Number(process.env.WPB_H ?? 1080);
const OUT = process.env.WPB_OUT ?? "/tmp/wpb";
const WPM = Number(process.env.WPB_WPM ?? 45);
const PARTS = process.env.WPB_PARTS ?? "ABC";
test.use({ viewport: { width: W, height: H } });
test.setTimeout(20 * 60_000);
fs.mkdirSync(OUT, { recursive: true });

type Shot = [string, number, number?];
const A_TIMES: Shot[] = process.env.WPB_A
  ? JSON.parse(process.env.WPB_A)
  : [
      ["a-3000", 3000],
      ["a-4000", 4000],
      ["a-5600", 5600],
      ["a-6400", 6400],
      ["a-7000", 7000],
    ];
const C_TIMES: Shot[] = process.env.WPB_C
  ? JSON.parse(process.env.WPB_C)
  : [
      ["c-300", 300],
      ["c-1200", 1200],
      ["c-3600", 3600],
      ["c-4400", 4400],
      ["c-7000", 7000],
      ["c-10400", 10400],
      ["c-11500", 11500],
      ["c-13200", 13200],
      ["c-14500", 14500],
      ["c-16050", 16050],
      ["c-16120", 16120],
      ["c-16400", 16400],
      ["c-16750", 16750],
      ["c-17000", 17000],
      ["c-18900", 18900],
      ["c-20000", 20000],
      ["c-22500", 22500],
      ["c-22900", 22900],
      ["c-23300", 23300],
      ["c-23600", 23600],
      ["c-24000", 24000],
      ["c-24500", 24500],
      ["c-26800", 26800],
      ["c-31500", 31500],
      ["c-34000", 34000],
      ["c-36300", 36300],
      ["c-37500", 37500],
      ["c-40500", 40500],
      ["c-41500", 41500],
      ["c-44000", 44000],
      ["c-44800", 44800],
      ["c-46500", 46500],
      ["c-47900", 47900],
      ["c-51000", 51000],
      ["c-54000", 54000],
    ];

const Q = `api=off&audio=0&dev=1&onboard=1&bot-seed=7&bot-acc=0.97&wpm-bot=${WPM}`;
const png = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const probes: Record<string, unknown> = {};

/** The HUD rects and the projected actor boxes (CSS px) of the frame on screen: the keep-out probe of the review (P1-3). */
async function probe(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    type Stage = {
      heroPos(o: { x: number; z: number }): void;
      enemyFeet(id: number, o: { x: number; y: number; z: number }): boolean;
      project(x: number, y: number, z: number): { x: number; y: number };
    };
    const w = window as unknown as {
      __play: {
        session: {
          stage: Stage;
          hud: {
            debugSnapshot(): {
              prologue?: {
                grimoireRect: unknown;
                dialogueRect: unknown;
                maskRect: unknown;
                emberRect: unknown;
                inkRect: unknown;
                swirlRect: unknown;
              };
              popRects: unknown[];
            };
          };
        };
        view(): { boss?: { enemyId: number } | null };
      };
    };
    const { stage, hud } = w.__play.session;
    const snap = hud.debugSnapshot();
    const hp = { x: 0, z: 0 };
    stage.heroPos(hp);
    const hf = stage.project(hp.x, 0, hp.z);
    const ht = stage.project(hp.x, 2.0, hp.z);
    const hw = Math.abs(hf.y - ht.y) * 0.3;
    const hero = { x0: hf.x - hw, y0: ht.y, x1: hf.x + hw, y1: hf.y };
    let nul: unknown = null;
    const id = w.__play.view().boss?.enemyId;
    const f = { x: 0, y: 0, z: 0 };
    if (id !== undefined && stage.enemyFeet(id, f)) {
      const a = stage.project(f.x, f.y, f.z);
      const b = stage.project(f.x, f.y + 4.56, f.z);
      const nw = Math.abs(a.y - b.y) * 0.19;
      nul = { x0: a.x - nw, y0: b.y, x1: a.x + nw, y1: a.y };
    }
    return { ...snap.prologue, popRects: snap.popRects, hero, nul };
  });
}

async function seek(page: Page, name: string, t: number, lc = -1, settle = 900): Promise<void> {
  const ok = await page.evaluate(
    ([tt, l]) => window.__play?.proSeek?.(tt as number, l as number, true),
    [t, lc],
  );
  expect(ok, `proSeek ${t}`).toBe(true);
  await page.waitForTimeout(settle);
  await png(page, name);
  probes[name] = await probe(page);
}

export type { Box };

test("WP-B captures", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "A");
  if (PARTS.includes("A")) for (const [n, t, lc] of A_TIMES) await seek(page, n, t, lc ?? -1, 1000);
  await page.evaluate(() => window.__play?.proSeek?.(-1));

  await waitProPhase(page, "B");
  const t0 = Date.now();
  let bossT = 0;
  let nb = 0;
  let gotFire = false;
  let introShots = 0;
  const meta: unknown[] = [];
  await page.evaluate(() => {
    const w = window as unknown as {
      __cap: { fire: number };
      __play: { session: { router: { register(t: string[], fn: (e: never) => void): void } } };
    };
    w.__cap = { fire: 0 };
    w.__play.session.router.register(["SkillCast"], ((e: { skillId: string }) => {
      if (e.skillId === "fireball" && !w.__cap.fire) w.__cap.fire = performance.now();
    }) as never);
  });
  let introSince = 0;
  while (Date.now() - t0 < 240_000) {
    const st = await proState(page);
    if (st?.phase === "C") break;
    const f = await page.evaluate(
      () => (window as unknown as { __cap: { fire: number } }).__cap.fire,
    );
    if (f && !gotFire) {
      gotFire = true;
      if (PARTS.includes("B")) {
        await page.waitForTimeout(90);
        await png(page, "b-fireball-a");
        await page.waitForTimeout(90);
        await png(page, "b-fireball-b");
        await page.waitForTimeout(90);
        await png(page, "b-fireball-c");
      }
    }
    const info = await page.evaluate(() => {
      const v = window.__play?.view() as unknown as {
        phase: string;
        enemies: { alive: boolean; statuses: { id: string }[] }[];
      };
      return v
        ? {
            phase: v.phase,
            frozen: v.enemies.some((e) => e.alive && e.statuses.some((s) => s.id === "freeze")),
            enemies: v.enemies.filter((e) => e.alive).length,
          }
        : null;
    });
    if (PARTS.includes("B")) {
      if (info?.phase === "bossIntro") {
        introSince ||= Date.now();
        const d = Date.now() - introSince;
        for (const [k, at] of [
          [0, 400],
          [1, 1300],
          [2, 2200],
          [3, 3200],
        ] as const)
          if (introShots === k && d >= at) {
            introShots++;
            await png(page, `b-intro-${k}`);
          }
      } else if (introSince && info) {
        if (Date.now() - bossT > 700 && nb < 40) {
          bossT = Date.now();
          await png(page, `bp-${String(nb).padStart(2, "0")}`);
          // the knight's face centre in CSS px (projected through the real camera), for the face-luma measurement
          const face = await page.evaluate(() => {
            const s = (
              window as unknown as {
                __play: {
                  session: {
                    stage: {
                      heroPos(o: { x: number; z: number }): void;
                      project(x: number, y: number, z: number): { x: number; y: number };
                    };
                  };
                };
              }
            ).__play.session.stage;
            const p = { x: 0, z: 0 };
            s.heroPos(p);
            return s.project(p.x + 0.1, 1.45, p.z);
          });
          meta.push({ n: nb, ...info, face });
          nb++;
        }
      }
    }
    await page.waitForTimeout(30);
  }
  fs.writeFileSync(path.join(OUT, "bp-meta.json"), JSON.stringify(meta));

  if (!PARTS.includes("C")) {
    expect(run.errors).toEqual([]);
    return;
  }
  await waitProPhase(page, "C", 60_000);
  for (const [n, t, lc] of C_TIMES)
    await seek(page, n, t, lc ?? -1, t >= 22000 && t <= 25000 ? 500 : 1000);
  await page.evaluate(() => window.__play?.proSeek?.(-1));
  fs.writeFileSync(path.join(OUT, "probes.json"), JSON.stringify(probes));
  expect(run.errors).toEqual([]);
});

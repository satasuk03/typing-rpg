/**
 * P4.2 WP-A before/after capture on real Metal: raw PNGs of the moments the review (docs/qa/prologue-review-1.md) measures, from the
 * REAL prologue session. Part A / C are parked with `__play.proSeek(t)`, Part B is live (wpm-bot). Raw PNGs go to $WPA_OUT (a scratch
 * dir); a python script measures them and writes the JPEG pairs into docs/qa/prologue-p4.2a/.
 *
 *   WPA_OUT=/path/before-1280 WPA_W=1280 WPA_H=720 APP_PORT=5465 ./node_modules/.bin/playwright test \
 *     -c tests/app/playwright.prologue.metal.config.ts prologueWpaStills
 */
import fs from "node:fs";
import path from "node:path";
import { type Page, test } from "@playwright/test";
import { expect, openApp, pressStart, proState, waitProPhase } from "./helpers";

const W = Number(process.env.WPA_W ?? 1280);
const H = Number(process.env.WPA_H ?? 720);
const OUT = process.env.WPA_OUT ?? "/tmp/wpa";
const WPM = Number(process.env.WPA_WPM ?? 45);
/** Which parts to shoot: any of A, B, C (default all). Part B always plays (the sim has to reach C). */
const PARTS = process.env.WPA_PARTS ?? "ABC";
test.use({ viewport: { width: W, height: H } });
test.setTimeout(20 * 60_000);
fs.mkdirSync(OUT, { recursive: true });

const Q = `api=off&audio=0&dev=1&onboard=1&bot-seed=7&bot-acc=0.97&wpm-bot=${WPM}`;
const png = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

async function seek(
  page: Page,
  name: string,
  t: number,
  lc = -1,
  settle = 700,
  jumped = true,
): Promise<void> {
  const ok = await page.evaluate(
    ([tt, l, j]) => window.__play?.proSeek?.(tt as number, l as number, j as boolean),
    [t, lc, jumped],
  );
  expect(ok, `proSeek ${t}`).toBe(true);
  await page.waitForTimeout(settle);
  await png(page, name);
}

test("WP-A captures", async ({ page }) => {
  const run = await openApp(page, Q);
  await pressStart(page);
  await waitProPhase(page, "A");
  const A_TIMES = [
    ["a-2600", 2600],
    ["a-4000", 4000],
    ["a-5200", 5200],
    ["a-6600", 6600],
    ["a-7000", 7000],
  ] as const;
  if (PARTS.includes("A")) for (const [n, t] of A_TIMES) await seek(page, n, t, -1, 900);
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
      await page.waitForTimeout(160);
      await png(page, "b-fireball");
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
    if (info?.phase === "bossIntro") {
      introSince ||= Date.now();
      const d = Date.now() - introSince;
      for (const [k, at] of [
        [0, 500],
        [1, 1800],
        [2, 3200],
      ] as const)
        if (introShots === k && d >= at) {
          introShots++;
          await png(page, `b-intro-${k}`);
        }
    } else if (introSince && info) {
      if (Date.now() - bossT > 900 && nb < 34) {
        bossT = Date.now();
        await png(page, `bp-${String(nb).padStart(2, "0")}`);
        meta.push({ n: nb, ...info });
        nb++;
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
  const C: [string, number, number?][] = [
    ["c-300", 300],
    ["c-1200", 1200],
    ["c-3600", 3600],
    ["c-7500", 7500, 1800],
    ["c-9000", 9000],
  ];
  for (const [n, t, lc] of C) await seek(page, n, t, lc ?? -1, 1000);
  for (let t = 13000; t <= 14400; t += 200) await seek(page, `c-${t}`, t, -1, 300);
  for (const t of [
    15700, 17000, 18500, 19900, 20000, 20200, 20400, 20600, 20900, 21200, 21500, 22000, 23000,
    28500,
  ])
    await seek(page, `c-${t}`, t, -1, t >= 20000 && t <= 22500 ? 400 : 900);
  for (const t of [
    31900, 32300, 33000, 36000, 37000, 38200, 40000, 41500, 42500, 44000, 46000, 49000, 52000,
  ])
    await seek(page, `c-${t}`, t, -1, 1100);
  await page.evaluate(() => window.__play?.proSeek?.(-1));
  expect(run.errors).toEqual([]);
});

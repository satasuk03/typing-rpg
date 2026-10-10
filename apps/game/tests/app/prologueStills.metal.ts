/**
 * P3.6 evidence on real Metal (1280x720): the 16 keyframe stills of docs/PROLOGUE_PLAN.md §6, a contact sheet, and the
 * boss-segment timing at 40 and 75 WPM. Everything comes from the REAL prologue session (fresh profile -> Start): Part A and
 * Part C frames are parked with the `__play.proSeek(t)` test hook (a pure seek of the same player), Part B frames are taken
 * live while the wpm-bot plays. Stills (JPEG, < 200 KB) go to docs/qa/prologue-p3.6/.
 *
 *   APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueStills
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import {
  PART_A_KEYFRAMES,
  PART_C_KEYFRAMES,
  UNWRITING_END_MS,
} from "../../src/cutscene/timelines/prologue";
import { expect, openApp, pressStart, proState, waitProPhase } from "./helpers";

test.setTimeout(20 * 60_000);

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(dir, "../../../../docs/qa/prologue-p3.6");
fs.mkdirSync(OUT, { recursive: true });

const Q = "api=off&audio=0&dev=1&onboard=1&bot-seed=7&bot-acc=0.97";
const MAX_BYTES = 200 * 1024;

/** A JPEG under 200 KB: quality steps down until it fits. */
async function shot(page: Page, name: string): Promise<number> {
  const file = path.join(OUT, `${name}.jpg`);
  let bytes = 0;
  for (const quality of [82, 74, 66, 58, 50]) {
    const buf = await page.screenshot({ type: "jpeg", quality });
    bytes = buf.length;
    fs.writeFileSync(file, buf);
    if (bytes <= MAX_BYTES) break;
  }
  expect(bytes, `${name}.jpg is over 200 KB`).toBeLessThanOrEqual(MAX_BYTES);
  return bytes;
}

/** Park the playing cutscene part on `t` and let the world settle (aura, dust, fog are frame-stepped). */
async function seekShot(
  page: Page,
  name: string,
  t: number,
  lc = -1,
  settleMs = 900,
  jumped = true,
): Promise<void> {
  const ok = await page.evaluate(
    ([tt, l, j]) => window.__play?.proSeek?.(tt as number, l as number, j as boolean),
    [t, lc, jumped],
  );
  expect(ok, `proSeek(${t}) for ${name}`).toBe(true);
  await page.waitForTimeout(settleMs);
  await shot(page, name);
}

const unpark = (page: Page): Promise<boolean | undefined> =>
  page.evaluate(() => window.__play?.proSeek?.(-1));

interface Cap {
  fireball: number;
  slashCrowd: number;
}

/** Start the in-page recorder for the Part B keyframes (first Fireball, Slash Wave on 2+ enemies). */
async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __cap: unknown;
      __play: {
        session: { router: { register(t: string[], fn: (e: never) => void): void } };
        view(): { enemies: { alive: boolean }[] };
      };
    };
    const cap = { fireball: 0, slashCrowd: 0 };
    w.__cap = cap;
    w.__play.session.router.register(["SkillCast"], ((e: { skillId: string }) => {
      if (e.skillId === "fireball" && !cap.fireball) cap.fireball = performance.now();
      if (e.skillId === "slashWave" && !cap.slashCrowd) {
        if (w.__play.view().enemies.filter((x) => x.alive).length >= 2)
          cap.slashCrowd = performance.now();
      }
    }) as never);
  });
}

const cap = (page: Page): Promise<Cap> =>
  page.evaluate(() => (window as unknown as { __cap: Cap }).__cap);

test("the 16 keyframes (A, B, C) from the real session on Metal", async ({ page }) => {
  const run = await openApp(page, `${Q}&wpm-bot=45`);
  await pressStart(page);
  await waitProPhase(page, "A");
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl2");
    const ext = g?.getExtension("WEBGL_debug_renderer_info");
    return g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
  });
  console.log("GPU", gpu);
  expect(gpu).toMatch(/Apple|Metal/i);
  const sizes: Record<string, number> = {};

  // ---- Part A: 2.5 crane, 6.0 ink drips
  await seekShot(page, "a1-crane", PART_A_KEYFRAMES.crane);
  await seekShot(page, "a2-ink-drips", PART_A_KEYFRAMES.inkDrips);
  await seekShot(page, "x-a-caption", 1200, -1, 1200);
  await seekShot(page, "x-a-nul-line", 7000, 1800, 900);
  await unpark(page);

  // ---- Part B: the first Fireball, Slash Wave on the crowd, the boss intro card (live, wpm-bot)
  await waitProPhase(page, "B");
  await installRecorder(page);
  let gotFire = false;
  let gotSlash = false;
  let gotIntro = false;
  let introSince = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const st = await proState(page);
    if (st?.phase === "C") break;
    const c = await cap(page);
    if (c.fireball && !gotFire) {
      gotFire = true;
      await page.waitForTimeout(160);
      await shot(page, "b1-first-fireball");
    }
    if (c.slashCrowd && !gotSlash) {
      gotSlash = true;
      await page.waitForTimeout(140);
      await shot(page, "b2-slash-wave-crowd");
    }
    const ph = await page.evaluate(() => window.__play?.phase());
    if (ph === "bossIntro") {
      introSince ||= Date.now();
      if (!gotIntro && Date.now() - introSince > 1700) {
        gotIntro = true;
        await shot(page, "b3-boss-intro-card");
      }
    }
    await page.waitForTimeout(40);
  }
  expect(gotFire, "never saw a Fireball cast").toBe(true);
  console.log(`B stills: fireball ${gotFire}, slash crowd ${gotSlash}, intro ${gotIntro}`);

  // ---- Part C keyframes (timeline ms; a held line shows when the time equals its `at`)
  await waitProPhase(page, "C", 60_000);
  const C = PART_C_KEYFRAMES;
  await seekShot(page, "c01-catch", C.catch);
  await seekShot(page, "c02-mask-push", C.maskPush);
  await seekShot(page, "c03-knight-flare", C.knightFlare, 1800, 1200);
  // the ink line is a HUD animation that holds 1.2 s once written: seek un-jumped, shoot inside the hold, then let it fade
  await seekShot(page, "c04-ink-line", C.inkLine, -1, 450, false);
  await page.waitForTimeout(2400);
  await seekShot(page, "c05-theft-3", C.theft3);
  await seekShot(page, "c06-theft-6", C.theft6);
  await seekShot(page, "c07-collapse-kneel", C.collapseKneel, -1, 1500);
  await seekShot(page, "c08-colour-swirl", C.colourSwirl, 1800, 1500);
  await seekShot(page, "c09-vortex-fog", C.vortexFog);
  await seekShot(page, "c10a-shards", C.shards, -1, 1200);
  await seekShot(page, "c10b-ember", C.ember, -1, 1200);
  // extras (not part of the 16): the line plates, the rise into the tear, the gate going dark, the end caption
  await seekShot(page, "x-line-enough", 4400, 1800, 700);
  await seekShot(page, "x-line-quiet", 23000, 1800, 700);
  await seekShot(page, "x-rise-1", 31800, -1, 900);
  await seekShot(page, "x-rise-2", 32800, -1, 900);
  await seekShot(page, "x-gate-dark", 28500, -1, 900);
  await seekShot(page, "x-theft-1", 13600, -1, 900);
  await seekShot(page, "x-end-caption", 49000, -1, 900);
  await page.evaluate((t) => window.__play?.proSeek?.(t), UNWRITING_END_MS - 100);
  await unpark(page);

  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith(".jpg")))
    sizes[f] = fs.statSync(path.join(OUT, f)).size;
  console.log("STILL SIZES", JSON.stringify(sizes));
  expect(run.errors).toEqual([]);
  expect(await page.evaluate(() => window.__app?.consoleErrors ?? [])).toEqual([]);
});

/** The idle auto-advance reaches Part C before Nul exists: the stage stands him up (`x-idle-fallback.jpg`, mask push). */
test("idle auto-advance still: Nul is on stage in Part C", async ({ page }) => {
  await openApp(page, `${Q}&pidle=0.04`);
  await pressStart(page);
  await waitProPhase(page, "C", 120_000);
  await seekShot(page, "x-idle-fallback", PART_C_KEYFRAMES.maskPush, -1, 1200);
});

/** The max-surge aura (surge x16 of a slow typist; a 9 WPM bot reaches it in the second servant wave). Part B, live. */
test("max-surge aura still (slow bot)", async ({ page }) => {
  await openApp(page, `${Q}&wpm-bot=9`);
  await pressStart(page);
  await waitProPhase(page, "B");
  const t0 = Date.now();
  let got = false;
  while (Date.now() - t0 < 600_000 && !got) {
    const st = await proState(page);
    if (st?.phase === "C") break;
    const m = await page.evaluate(() => window.__play?.view().prologue?.surgeMult ?? 1);
    if (m >= 16) {
      await page.waitForTimeout(2500); // the aura level ramps at 2.5 / s
      await shot(page, "b4-max-surge-aura");
      got = true;
    }
    await page.waitForTimeout(250);
  }
  expect(got, "the slow bot never reached surge x16").toBe(true);
});

/** Boss segment timing: BossIntroStarted's end (phase leaves bossIntro) -> PrologueClimax, in sim ticks (60 Hz) and wall time. */
for (const wpm of [40, 75]) {
  test(`boss segment timing at ${wpm} WPM`, async ({ page }) => {
    await openApp(page, `${Q}&wpm-bot=${wpm}`);
    await pressStart(page);
    await waitProPhase(page, "B");
    const r = await page.evaluate(async () => {
      const w = window as unknown as {
        __play: {
          view(): { phase: string; tick: number };
          seen(): Record<string, number>;
        };
      };
      let introEnd: { tick: number; ms: number } | null = null;
      let introStart: { tick: number; ms: number } | null = null;
      let climax: { tick: number; ms: number } | null = null;
      let encStart: { tick: number; ms: number } | null = null;
      let seenIntro = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 300_000) {
        const v = w.__play.view();
        const now = performance.now();
        if (!encStart) encStart = { tick: v.tick, ms: now };
        if (v.phase === "bossIntro") {
          seenIntro = true;
          introStart ??= { tick: v.tick, ms: now };
        } else if (seenIntro && !introEnd) introEnd = { tick: v.tick, ms: now };
        if (w.__play.seen().PrologueClimax && !climax) {
          climax = { tick: v.tick, ms: now };
          break;
        }
        await new Promise((res) => setTimeout(res, 25));
      }
      return { encStart, introStart, introEnd, climax };
    });
    expect(r.introEnd && r.climax, JSON.stringify(r)).toBeTruthy();
    const ticks = (r.climax?.tick ?? 0) - (r.introEnd?.tick ?? 0);
    const wall = ((r.climax?.ms ?? 0) - (r.introEnd?.ms ?? 0)) / 1000;
    const intro = ((r.introEnd?.tick ?? 0) - (r.introStart?.tick ?? 0)) / 60;
    const total = ((r.climax?.tick ?? 0) - (r.encStart?.tick ?? 0)) / 60;
    console.log(
      `BOSSSEG ${wpm} WPM: boss segment ${(ticks / 60).toFixed(1)} s sim (${wall.toFixed(1)} s wall), intro ${intro.toFixed(1)} s, run to climax ${total.toFixed(1)} s`,
    );
    fs.writeFileSync(
      path.join(OUT, `boss-segment-${wpm}wpm.txt`),
      `wpm-bot ${wpm}, accuracy 0.97, seed 7, Metal 1280x720\nBossIntro end -> PrologueClimax: ${(ticks / 60).toFixed(2)} s sim (${ticks} ticks), ${wall.toFixed(2)} s wall\nboss intro ${intro.toFixed(2)} s; Part B total (first poll -> climax) ${total.toFixed(2)} s\n`,
    );
    expect(ticks / 60).toBeGreaterThanOrEqual(20);
  });
}

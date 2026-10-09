/**
 * T2.3 combat VFX in the real level runner. Every effect of the library is played on the real stage, camera and
 * post pipeline (`?scene=play&demo=1`: `window.__play.demo(name)` feeds a synthetic event through the binding
 * table), the world is frozen on the stage clock at the interesting moment and a 1280x720 still is written to
 * `__shots__/combat-*.png`. Each still gets a fresh page so the real fight going on behind it (nobody is typing)
 * cannot down the hero. A real-play test runs the browser bot (real deaths dissolve, real chests and gold, the
 * real boss intro and a Doom aura) with the combat effects on. Zero console errors throughout.
 *
 * Run: pnpm exec playwright test -c tests/vfx/playwright.combat.config.ts
 *   COMBAT_STILLS_ONLY=1 / COMBAT_REAL_ONLY=1 pick one half.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import type { PlayDebug } from "../../src/level/session";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `combat-${name}.png`);

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=play&audio=0&demo=1&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 90_000 });
  return errors;
}

async function waitPhase(page: Page, phase: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction((p) => window.__play?.phase() === p, phase, { timeout });
}

/** World time x0.12 (render-only): headless SwiftShader renders ~3 fps, so this gives ~30 ms of world time per frame. */
async function slowWorld(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.slow(0.12, 3_600_000, 1);
  });
}

/** Freeze the whole world (stage, combat VFX, particle pools), write the still, thaw. */
async function freezeAndShoot(page: Page, file: string): Promise<void> {
  await page.evaluate(() => {
    (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.hitStop(30_000);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot(file) });
  await page.evaluate(() => {
    (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.reset();
  });
  await slowWorld(page);
}

/** Play `name`, run `atSec` of STAGE time, then freeze and capture. */
async function capture(page: Page, file: string, name: string, atSec: number): Promise<void> {
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
  await freezeAndShoot(page, file);
}

const STILLS: { file: string; demo: string; at: number; level?: string }[] = [
  {
    file: process.env.COMBAT_SUFFIX ? `l06-break-${process.env.COMBAT_SUFFIX}` : "l06-break",
    demo: "break",
    at: 0.22,
    level: "ch1-l06",
  },
  { file: "sword-slash", demo: "slash", at: 0.5 },
  { file: "crit", demo: "crit", at: 0.64 },
  { file: "break", demo: "break", at: 0.22 },
  { file: "fireball-flight", demo: "fireball", at: 0.27 },
  { file: "fireball-impact", demo: "fireball", at: 0.52 },
  { file: "aegis", demo: "aegis", at: 0.75 },
  { file: "frost-lock", demo: "frost", at: 0.8 },
  { file: "chest-gold", demo: "chest:Gold", at: 2.2 },
  { file: "coin-fountain", demo: "coins", at: 0.9 },
];

const COVERAGE = [
  "dagger",
  "staff",
  "hammer",
  "weak",
  "chip",
  "shield",
  "thrust",
  "slashWave",
  "mend",
  "burn",
  "bleed",
  "stagger",
  "windup",
  "lunge",
  "block",
  "parry",
  "rubble",
  "revive",
  "passive",
  "chest:Wooden",
  "chest:Iron",
  "chest:Mythic",
];

test.describe("combat VFX stills (real runner, demo events)", () => {
  test.skip(process.env.COMBAT_REAL_ONLY === "1");

  for (const s of STILLS)
    test(`still: ${s.file}`, async ({ page }) => {
      fs.mkdirSync(path.join(dir, "__shots__"), { recursive: true });
      const errors = await open(page, `level=${s.level ?? "ch1-l08"}&difficulty=story&seed=11`);
      await waitPhase(page, "combat");
      await page.waitForTimeout(800);
      await slowWorld(page);
      await capture(page, s.file, s.demo, s.at);
      expect(errors, errors.join("\n")).toEqual([]);
    });

  test("every other effect plays with zero console errors", async ({ page }) => {
    const errors = await open(page, "level=ch1-l01&difficulty=story&seed=2");
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    for (const n of COVERAGE) {
      expect(
        await page.evaluate((x) => (window.__play as PlayDebug).demo?.(x) ?? false, n),
        n,
      ).toBe(true);
      await page.waitForTimeout(450);
    }
    await page.evaluate(() => (window.__play as PlayDebug).demo?.("off"));
    await page.waitForTimeout(1000);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("reduced flash, reduced motion and intensity 0 run clean", async ({ page }) => {
    for (const q of ["reducedFlash=1&reducedMotion=1", "intensity=0", "intensity=0.4&tier=2"]) {
      const errors = await open(page, `level=ch1-l01&difficulty=story&seed=2&${q}`);
      await waitPhase(page, "combat");
      for (const n of [
        "crit",
        "fireball",
        "frost",
        "aegis",
        "windup",
        "lunge",
        "chest:Gold",
        "coins",
        "break",
        "revive",
      ]) {
        expect(
          await page.evaluate((x) => (window.__play as PlayDebug).demo?.(x) ?? false, n),
          `${q} ${n}`,
        ).toBe(true);
        await page.waitForTimeout(350);
      }
      if (q === "intensity=0") {
        const d = await page.evaluate(() =>
          (window.__play as PlayDebug).session.combat?.fx.diagnostics(),
        );
        // at k = 0 only the information layer remains: no arcs, no lights
        expect(d?.arcs ?? 0).toBe(0);
        expect(d?.lights ?? 0).toBe(0);
      }
      expect(errors, `${q}: ${errors.join("\n")}`).toEqual([]);
    }
  });
});

test.describe("combat VFX in real play", () => {
  test.skip(process.env.COMBAT_STILLS_ONLY === "1");

  test("L1 with the bot: real deaths dissolve, chests and gold play, no console errors", async ({
    page,
  }) => {
    const errors = await open(page, "level=ch1-l01&wpm-bot=70&seed=3");
    await slowWorld(page); // the sim keeps real time; only the presentation slows, so the dissolve can be caught
    await page.waitForFunction(() => (window.__play?.seen().EnemyDeath ?? 0) >= 1, undefined, {
      timeout: 240_000,
    });
    // 0.4 s of stage time into the first real death
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const s = (window.__play as PlayDebug).session;
          const t0 = s.stage.time + 0.4;
          const f = (): void => {
            if (s.stage.time >= t0) resolve();
            else requestAnimationFrame(f);
          };
          f();
        }),
    );
    await freezeAndShoot(page, "death-dissolve");
    await page.evaluate(() =>
      (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.reset(),
    );
    await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
      timeout: 480_000,
    });
    const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
    expect(seen.EnemyDeath ?? 0).toBeGreaterThan(0);
    expect(seen.Hit ?? 0).toBeGreaterThan(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("L10 with the bot: the real boss intro rune, then a Doom aura", async ({ page }) => {
    const errors = await open(page, "level=ch1-l10&difficulty=story&seed=5&wpm-bot=75");
    await waitPhase(page, "bossIntro", 540_000);
    await slowWorld(page);
    // freeze shortly after the rune ignites (35% of the intro), on the sim's own progress
    await page.waitForFunction(
      () => (window.__play?.view().phaseProgress ?? 0) >= 0.42,
      undefined,
      {
        timeout: 60_000,
      },
    );
    await freezeAndShoot(page, "boss-intro-rune");
    await page.evaluate(() =>
      (window.__play as PlayDebug).session.typingFx?.handle.timeDilation.reset(),
    );
    await page.waitForFunction(() => window.__play?.phase() !== "bossIntro", undefined, {
      timeout: 60_000,
    });
    await slowWorld(page);
    await capture(page, "doom-aura", "doom", 1.4);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

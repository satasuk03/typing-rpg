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
  expect(res.cast, "no SkillCast in 240 s").toBe(true);
  expect(res.effectLive, "the combat VFX library has nothing alive 0.3 s after the cast").toBe(
    true,
  );
  expect(errors).toEqual([]);
});

/** v1.9 guard leak in the mock HUD (`?scene=hud-test&leak=20`): badge + leak pops never break the readability invariants. */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });

for (const [scenario, wpm] of [
  ["forest", 40],
  ["cave", 90],
  ["boss", 40],
] as const) {
  test(`leaking ${scenario}@${wpm}: invariants hold over a 40 s sweep`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`/?scene=hud-test&scenario=${scenario}&wpm=${wpm}&at=0&pause=1&leak=20`);
    await page.waitForFunction(() => window.__hudDebug?.ready === true, undefined, {
      timeout: 20000,
    });
    const res = await page.evaluate(() => window.__hudDebug?.sweep(40, 0.1));
    expect(res?.violations, `${scenario}@${wpm}`).toEqual([]);
    expect(errors).toEqual([]);
  });
}

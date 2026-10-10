/**
 * P4.2 WP-A quick iteration: dev-scene stills of the prologue cues on real Metal (raw PNG into $WPA_OUT).
 *   WPA_OUT=/dir WPA_SHOTS='name|cue=theftStream&age=520&p.k=1;name2|cue=...' PW_PORT=5465 pnpm exec playwright test \
 *     -c tests/vfx/playwright.metal.config.ts prologue-wpa
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";

const OUT = process.env.WPA_OUT ?? "/tmp/wpa-dev";
mkdirSync(OUT, { recursive: true });
const W = Number(process.env.WPA_W ?? 1280);
const H = Number(process.env.WPA_H ?? 720);
test.use({ viewport: { width: W, height: H } });

const shots = (process.env.WPA_SHOTS ?? "")
  .split(";")
  .filter(Boolean)
  .map((s) => s.split("|") as [string, string]);

test("dev-scene stills", async ({ page }) => {
  for (const [name, q] of shots) {
    await page.goto(`/?scene=prologue&part=vfx&freeze=1&${q}`);
    await page.waitForFunction(() => window.__prologueVfx?.ready === true, undefined, {
      timeout: 120_000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
  }
});

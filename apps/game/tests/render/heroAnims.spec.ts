// biome-ignore-all format: dense measurement code (same convention as the sprite generators).
import { expect, test } from "@playwright/test";

/**
 * P2.3: every hero frame that existed before the cutscene anims is pixel-identical (FNV-1a over colour + glow + geometry,
 * pinned from main before the change), and the four cutscene anims exist.
 * Run: ./node_modules/.bin/playwright test -c tests/render/playwright.config.ts heroAnims   (RENDER_PORT=<free port>)
 */
const PINNED: Record<string, string[]> = {
  idle: ["471298eb", "611aa4fe", "21a28afe"],
  walk: ["2b524efc", "797e03db", "dbb0405a", "611490b4"],
  raise: ["ba17550a"],
  slash: ["3b89faca"],
  cast: ["2cc61b8a"],
  hurt: ["d2419296"],
  win: ["dd323d79"],
};
const NEW = { kneel: 3, rise: 3, reach: 2, swordOut: 2 } as const;

test("hero frames: old ones unchanged, new ones present", async ({ page }) => {
  await page.goto("/?scene=nul-sheet&view=hero");
  await page.waitForFunction(() => window.__nulSheet?.ready === true, undefined, { timeout: 120_000 });
  const h = await page.evaluate(
    () => (window.__nulSheet as unknown as { numbers: { heroHashes: Record<string, string[]> } }).numbers.heroHashes,
  );
  if (process.env.HERO_STRIP) await page.locator("canvas").first().screenshot({ path: process.env.HERO_STRIP, type: "jpeg", quality: 80 });
  for (const [anim, hashes] of Object.entries(PINNED)) expect(h[anim], anim).toEqual(hashes);
  expect(Object.keys(PINNED).sort()).toEqual(["cast", "hurt", "idle", "raise", "slash", "walk", "win"]);
  for (const [anim, n] of Object.entries(NEW)) expect(h[anim]?.length, anim).toBe(n);
});

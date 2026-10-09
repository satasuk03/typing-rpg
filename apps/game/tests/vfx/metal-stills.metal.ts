/**
 * T6.3 world polish: 1280x720 stills on real Metal (see playwright.metal.config.ts).
 *   PW_PORT=5291 STILL_DIR=/path/to/before pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-stills
 * Default output `__shots__/metal-<name>.png`; STILL_DIR redirects (before captures stay out of the repo).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { openTyping } from "./helpers";
import { freeze, openPlay, playTo, thaw, waitPhase } from "./playHelpers";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.STILL_DIR ?? path.join(dir, "__shots__");
const shot = (name: string): string => path.join(outDir, `metal-${name}.png`);
const only = process.env.STILLS_ONLY?.split(",");
const want = (n: string): boolean => !only || only.includes(n);
fs.mkdirSync(outDir, { recursive: true });

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(900_000);

const GUARD = "wpm=40&tier=3&guard=1&at=0&biome=cave";

// ------------------------------------------------------------------------------ typing scene

const TYPING: { name: string; params: string; run: (page: Page) => Promise<boolean> }[] = [
  {
    name: "t4-forest",
    params: "wpm=90&tier=4&at=2.4",
    run: (p) =>
      p.evaluate(() => window.__typingVfx?.stepToKey(95, { minIndex: 2, notLast: true }) ?? false),
  },
  {
    name: "t4-cave",
    params: "wpm=40&tier=4&at=3&biome=cave",
    run: (p) =>
      p.evaluate(() => window.__typingVfx?.stepToKey(60, { minIndex: 1, notLast: true }) ?? false),
  },
  {
    name: "parry",
    params: GUARD,
    run: (p) => p.evaluate(() => window.__typingVfx?.stepToEvent("GuardParried", 70) ?? false),
  },
  {
    name: "parry-forest",
    params: "wpm=40&tier=3&guard=1&at=0&biome=forest",
    run: (p) => p.evaluate(() => window.__typingVfx?.stepToEvent("GuardParried", 70) ?? false),
  },
  {
    name: "sentence-bolts",
    params: "wpm=90&tier=3&boss=1&at=0&biome=cave",
    // the bolt launches when the HUD orb lands: step on until one is in flight, then 100 ms of flight
    run: (p) =>
      p.evaluate(() => {
        const a = window.__typingVfx;
        if (!a?.stepToEvent("SentenceWordDone", 0, 2, 60000)) return false;
        for (let i = 0; i < 90 && (a.worldStats().boltsLive ?? 0) === 0; i++) a.step(16.7);
        a.step(100);
        return (a.worldStats().boltsLive ?? 0) > 0;
      }),
  },
  {
    name: "finisher",
    params: "wpm=90&tier=3&boss=1&at=0&biome=cave",
    run: (p) =>
      p.evaluate(
        () => window.__typingVfx?.stepToEvent("FinisherCompleted", 930, 1, 90000) ?? false,
      ),
  },
  {
    name: "finisher-resolve",
    params: "wpm=90&tier=3&boss=1&at=0&biome=cave",
    run: (p) =>
      p.evaluate(
        () => window.__typingVfx?.stepToEvent("FinisherCompleted", 1040, 1, 90000) ?? false,
      ),
  },
];

for (const t of TYPING) {
  if (!want(t.name)) continue;
  test(`still: ${t.name}`, async ({ page }) => {
    const errors = await openTyping(page, t.params);
    const ok = await t.run(page);
    if (!ok)
      console.log(
        t.name,
        JSON.stringify(await page.evaluate(() => window.__typingVfx?.eventCounts())),
      );
    expect(ok).toBe(true);
    await page.screenshot({ path: shot(t.name) });
    expect(errors).toEqual([]);
  });
}

// ------------------------------------------------------------------------------ real runner, demo events

const PLAY: {
  name: string;
  demo: string[];
  at: number;
  gap?: number;
  level?: string;
  aura4?: boolean;
}[] = [
  { name: "skill-fireball", demo: ["fireball"], at: 0.3 },
  { name: "skill-fireball-t4", demo: ["fireball"], at: 0.3, aura4: true },
  { name: "crit", demo: ["crit"], at: 0.64 },
  { name: "break", demo: ["break"], at: 0.22 },
  { name: "aegis", demo: ["aegis"], at: 0.75 },
  { name: "coin-fountain", demo: ["coins"], at: 0.9 },
  { name: "chest-slash", demo: ["chest:Gold", "slash"], at: 0.5, gap: 1.6 },
  { name: "l09-cave-hero", demo: [], at: 0.5, level: "ch1-l09" },
];

for (const s of PLAY) {
  if (!want(s.name)) continue;
  test(`still: ${s.name}`, async ({ page }) => {
    const errors = await openPlay(page, `level=${s.level ?? "ch1-l08"}&difficulty=story&seed=11`);
    await waitPhase(page, "combat");
    await page.waitForTimeout(800);
    if (s.aura4)
      await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: test-only
        ((window.__play as any).session.typingFx.handle.worldFx.aura as any).setForceMax(true);
      });
    for (const d of s.demo.slice(0, -1)) await playTo(page, d, s.gap ?? 0.3);
    const last = s.demo[s.demo.length - 1];
    if (last) await playTo(page, last, s.at);
    await freeze(page);
    await page.screenshot({ path: shot(s.name) });
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

if (want("l10-boss-intro"))
  test("still: l10-boss-intro (real bot run, violet torches)", async ({ page }) => {
    const errors = await openPlay(page, "level=ch1-l10&difficulty=story&seed=5&wpm-bot=90");
    await waitPhase(page, "bossIntro", 700_000);
    await page.waitForFunction(
      () => (window.__play?.view().phaseProgress ?? 0) >= 0.45,
      undefined,
      {
        timeout: 60_000,
      },
    );
    await freeze(page);
    await page.screenshot({ path: shot("l10-boss-intro") });
    await thaw(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

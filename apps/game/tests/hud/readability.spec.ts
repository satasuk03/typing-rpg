import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { HudDebugSnapshot } from "../../src/hud";
import { checkSnapshot } from "../../src/hud/invariants";

const dir = path.dirname(fileURLToPath(import.meta.url));
test.use({ viewport: { width: 1280, height: 720 } });

interface Case {
  name: string;
  scenario: string;
  wpm: number;
  at: number;
}
const CASES: Case[] = [
  { name: "forest-40wpm", scenario: "forest", wpm: 40, at: 6.9 },
  { name: "forest-90wpm", scenario: "forest", wpm: 90, at: 4.4 },
  { name: "cave-crit-break", scenario: "cave", wpm: 90, at: 1.75 },
  { name: "boss-sentence", scenario: "boss", wpm: 40, at: 11.9 },
  { name: "stress-6-plates", scenario: "stress", wpm: 40, at: 4 },
];

async function open(page: import("@playwright/test").Page, c: Case, extra = ""): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  // offline-first: no third-party requests (fonts are self-hosted)
  page.on("request", (r) => {
    const u = r.url();
    if (
      !u.startsWith(`http://localhost:${process.env.PW_PORT ?? 5173}`) &&
      !u.startsWith("data:") &&
      !u.startsWith("blob:")
    )
      errors.push(`external request: ${u}`);
  });
  await page.goto(
    `/?scene=hud-test&scenario=${c.scenario}&wpm=${c.wpm}&at=${c.at}&pause=1${extra}`,
  );
  await page.waitForFunction(() => window.__hudDebug?.ready === true, undefined, {
    timeout: 20000,
  });
  await page.waitForTimeout(150);
  return errors;
}

for (const c of CASES) {
  test(`readability: ${c.name}`, async ({ page }) => {
    const errors = await open(page, c);
    const snap: HudDebugSnapshot = await page.evaluate(() => {
      const d = window.__hudDebug;
      if (!d) throw new Error("no hook");
      return d.snapshot();
    });
    await page.screenshot({ path: path.join(dir, "__shots__", `hud-${c.name}.png`) });

    expect(snap.viewport.w).toBe(1280);
    expect(snap.plates.length).toBeGreaterThan(0);
    // plates pairwise non-overlapping
    for (let i = 0; i < snap.plates.length; i++) {
      for (let j = i + 1; j < snap.plates.length; j++) {
        const a = snap.plates[i];
        const b = snap.plates[j];
        if (!a || !b) continue;
        const overlap =
          a.rect.x < b.rect.x + b.rect.w &&
          a.rect.x + a.rect.w > b.rect.x &&
          a.rect.y < b.rect.y + b.rect.h &&
          a.rect.y + a.rect.h > b.rect.y;
        expect(overlap, `plates ${a.id}/${b.id} overlap`).toBe(false);
      }
    }
    for (const p of snap.plates) {
      // effective font >= 14px (at 1280 width the scale is 1)
      expect(p.fontPx, `plate ${p.id} font`).toBeGreaterThanOrEqual(14);
      // inside the viewport
      expect(p.rect.x).toBeGreaterThanOrEqual(0);
      expect(p.rect.y).toBeGreaterThanOrEqual(0);
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(snap.viewport.w);
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(snap.viewport.h);
      // letter contrast >= 4.5 vs plate background
      expect(p.contrast, `plate ${p.id} contrast`).toBeGreaterThanOrEqual(4.5);
      expect(p.letters.length).toBeGreaterThan(0);
    }
    // pops, tags and banners never cover a live plate's letters (same checks as the sweep)
    expect(checkSnapshot(snap)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("readability holds over a 40 s sweep of every scenario (40 and 90 wpm)", async ({ page }) => {
  test.setTimeout(120_000);
  for (const scenario of ["forest", "cave", "boss", "stress"]) {
    for (const wpm of [40, 90]) {
      const errors = await open(page, { name: "sweep", scenario, wpm, at: 0 });
      const res = await page.evaluate(() => window.__hudDebug?.sweep(40, 0.1));
      expect(res?.violations, `${scenario}@${wpm}`).toEqual([]);
      expect(res?.maxPlates).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    }
  }
});

test("accessibility settings: reduced flash/motion and zero intensity render without errors", async ({
  page,
}) => {
  const errors = await open(
    page,
    { name: "a11y", scenario: "cave", wpm: 90, at: 5 },
    "&reducedFlash=1&reducedMotion=1&intensity=0",
  );
  const snap = await page.evaluate(() => window.__hudDebug?.snapshot());
  expect(snap?.plates.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("HUD frame cost with 6 plates and active pops", async ({ page }) => {
  const errors = await open(page, { name: "bench", scenario: "stress", wpm: 90, at: 2 });
  const res = await page.evaluate(() => window.__hudDebug?.bench(300));
  console.log(`HUD frame cost (stress): ${JSON.stringify(res)}`);
  expect(res?.maxPlates).toBeGreaterThanOrEqual(6);
  expect(res?.p95Ms ?? 99).toBeLessThan(8);
  expect(errors).toEqual([]);
});

for (const w of [
  { name: "world-forest", scenario: "forest", wpm: 40, at: 6.9 },
  { name: "world-boss", scenario: "boss", wpm: 40, at: 11.9 },
]) {
  test(`projector contract on the real renderer: ${w.name}`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await open(page, w, "&backdrop=world");
    const snap = await page.evaluate(() => window.__hudDebug?.snapshot());
    await page.screenshot({ path: path.join(dir, "__shots__", `hud-${w.name}.png`) });
    expect(snap?.plates.length).toBeGreaterThan(0);
    expect(snap ? checkSnapshot(snap) : ["no snapshot"]).toEqual([]);
    expect(errors).toEqual([]);
  });
}

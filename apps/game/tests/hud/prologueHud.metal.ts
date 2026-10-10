/**
 * P3.3 evidence on real Metal: the prologue HUD stills (JPEG < 200 KB) and the per-frame cost of the Grimoire bar.
 *   PW_PORT=5448 ./node_modules/.bin/playwright test -c tests/hud/prologue.metal.config.ts
 * Writes docs/qa/prologue-p3.3/{*.jpg, perf.txt, sweep.txt}. The world behind the HUD is the Word Gate with Nul's sprite and the
 * knight standing in; the cutscene HUD state comes from the real `evaluate()` over the plan's Part C cues (devScene.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.STILL_DIR ?? join(here, "..", "..", "..", "..", "docs", "qa", "prologue-p3.3");
mkdirSync(OUT, { recursive: true });

test.setTimeout(600_000);

const STILL_FILES: Record<string, string> = {
  grimoireB: "grimoire-bar-partB",
  shatter1: "shatter-1-fireball",
  shatter3: "shatter-3-slashwave",
  shatter6: "shatter-6-frostlock",
  dialogueNul: "dialogue-nul",
  dialogueKnight: "dialogue-knight",
  ink: "ink-line",
  swirl: "colour-swirl",
  ember: "ember",
  skipRing: "skip-ring",
  nudge: "nudge",
};

async function open(page: import("@playwright/test").Page, extra = ""): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`/?scene=prologue&part=hud&wpm=90&quality=0${extra}`);
  await page.waitForFunction(() => window.__prologueHud?.ready === true, undefined, {
    timeout: 120_000,
  });
  return errors;
}

test("stills: Grimoire bar, shatter 1/3/6, dialogue (Nul, Knight), ink line, colourSwirl, ember, skip ring, nudge", async ({
  page,
}) => {
  const errors = await open(page);
  const notes: string[] = [];
  for (const [name, file] of Object.entries(STILL_FILES)) {
    const note = await page.evaluate((n) => window.__prologueHud?.still(n), name);
    await page.waitForTimeout(120);
    const jpg = await page.screenshot({ type: "jpeg", quality: 82 });
    writeFileSync(join(OUT, `${file}.jpg`), jpg);
    expect(jpg.length, `${file}.jpg size`).toBeLessThan(200 * 1024);
    notes.push(`${file}.jpg  ${(jpg.length / 1024).toFixed(0)} KB  ${note}`);
  }
  writeFileSync(join(OUT, "stills.txt"), `${notes.join("\n")}\n`);
  console.log(notes.join("\n"));
  expect(errors).toEqual([]);
});

test("Part B sweep on the real world: 0 violations", async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => window.__prologueHud?.sweep(24, 0.5));
  expect(r).toBeTruthy();
  if (!r) return;
  const lines = [
    "Part B at max FX on Metal (real world render each sample), wpm 90, tier-4 streak, quality 0, 24 s, sample every 0.5 s",
    `samples=${r.samples} (partB ${r.partB}, Part C overlap ${r.overlap}) violations=${r.violations.length}`,
    `next-letter contrast checked=${r.contrastChecked} minRing=${r.minRing.toFixed(2)} (>= 3) minCell=${r.minCell.toFixed(2)} (>= 4.5)`,
    `fxKeepOut max=${JSON.stringify(r.keepOutMax)}  maxPops=${r.maxPops}  popsNearMask=${r.popsNearMask}`,
    `events=${JSON.stringify(r.events)}`,
    ...r.violations.slice(0, 20),
  ];
  writeFileSync(join(OUT, "sweep.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  expect(r.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("per-frame HUD cost of the Grimoire bar (prologue mounted vs not)", async ({ page }) => {
  await open(page, "&render=0");
  const runs: { withMs: number; withoutMs: number; deltaMs: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const b = await page.evaluate(() => window.__prologueHud?.bench(600));
    if (b) runs.push(b);
  }
  runs.sort((a, b) => a.deltaMs - b.deltaMs);
  const best = runs[0];
  const lines = runs.map(
    (r, i) =>
      `run ${i}: with prologue ${r.withMs.toFixed(3)} ms/frame, without ${r.withoutMs.toFixed(3)} ms/frame, delta ${r.deltaMs.toFixed(3)} ms`,
  );
  writeFileSync(join(OUT, "perf.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  expect(best?.deltaMs ?? 99).toBeLessThan(0.5);
});

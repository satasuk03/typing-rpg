/**
 * P4.1 prologue readability probe on the REAL session (fresh profile -> Start -> Part A -> Part B with the wpm-bot ->
 * Part C), at max typing FX, with the bot at 40 and at 90 WPM. Not a mock driver.
 *
 * Part B: every `fxProbe.ts` invariant (next letter legible: ring >= 3 and cell >= 4.5 contrast; no pop / tag / banner over a
 * letter; no letter outside its plate; fxKeepOut = typing FX never on a guard label, panel text or the next letter) plus the
 * prologue snapshot invariants (`checkPrologueSnapshot`: no pop on Nul's mask, reserved rects clear, ...).
 * Part C: dialogue contrast >= 7 (panel and speaker plate), 2 lines at most, nothing over the dialogue box (pops, banners,
 * plates, grimoire, ember, ink line, hint), sampled through the whole timeline.
 * Any violation saves a forensic JPEG into docs/qa/prologue-p4.1/. Nothing is loosened: the spec fails on any violation.
 * Also saves a few stills of the guard-plate moments (the "orbiting letters bunch up" re-check) and counts how often
 * the typing FX queue peaks next to a guard plate.
 *
 * Run (from apps/game; Metal strongly recommended, the SwiftShader bot cannot hold 90 WPM):
 *   LEVEL_GL=metal LEVEL_PORT=5471 ./node_modules/.bin/playwright test -c tests/level/playwright.config.ts prologue-fx
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, test } from "@playwright/test";
import { checkSnapshot } from "../../src/hud/invariants";
import { checkPrologueSnapshot } from "../../src/hud/prologue/check";
import { expect, openApp, pressStart, proState, waitProPhase, waitRoute } from "../app/helpers";
import { sample } from "./fxProbe";

test.use({ viewport: { width: 1280, height: 720 } });
test.setTimeout(20 * 60_000);

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(dir, "../../../../docs/qa/prologue-p4.1");
mkdirSync(OUT, { recursive: true });
const MAX_STILLS = 6;

interface Report {
  samplesB: number;
  checkedLetters: number;
  samplesC: number;
  samplesCDialogue: number;
  samplesBMask: number;
  guardSamples: number;
  maxSparks: number;
  maxQueuedAtGuard: number;
  minRing: number;
  minCell: number;
  minDialogueContrast: number;
  violations: string[];
  stills: string[];
}

async function still(page: Page, name: string): Promise<string> {
  const file = `${name}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 70 });
  return file;
}

async function probeRun(page: Page, wpm: number): Promise<Report> {
  const rep: Report = {
    samplesB: 0,
    checkedLetters: 0,
    samplesC: 0,
    samplesCDialogue: 0,
    samplesBMask: 0,
    guardSamples: 0,
    maxSparks: 0,
    maxQueuedAtGuard: 0,
    minRing: 99,
    minCell: 99,
    minDialogueContrast: 99,
    violations: [],
    stills: [],
  };
  let violationStills = 0;
  let guardStills = 0;
  let lastGuardStill = -999;
  await pressStart(page);
  await waitProPhase(page, "B", 90_000);
  const t0 = Date.now();
  for (;;) {
    const ps = await proState(page);
    if (!ps || ps.phase === "C" || Date.now() - t0 > 6 * 60_000) break;
    if (ps.phase !== "B") {
      await page.waitForTimeout(100);
      continue;
    }
    const s = await sample(page);
    rep.samplesB++;
    const v = [...checkSnapshot(s.snapshot), ...checkPrologueSnapshot(s.snapshot)];
    const pro = s.snapshot.prologue;
    if (pro?.maskRect) rep.samplesBMask++;
    rep.maxSparks = Math.max(rep.maxSparks, s.sparks);
    if (s.contrastRing !== null && s.contrastCell !== null) {
      rep.checkedLetters++;
      rep.minRing = Math.min(rep.minRing, s.contrastRing);
      rep.minCell = Math.min(rep.minCell, s.contrastCell);
      if (s.contrastRing < 3 || s.contrastCell < 4.5)
        v.push(
          `next-letter contrast ring ${s.contrastRing.toFixed(2)} cell ${s.contrastCell.toFixed(2)} (${s.kind})`,
        );
    }
    const hasGuard = s.snapshot.plates.some((p) => p.kind === "guard");
    if (hasGuard) {
      rep.guardSamples++;
      rep.maxQueuedAtGuard = Math.max(rep.maxQueuedAtGuard, s.queued);
    }
    if (v.length > 0) {
      for (const x of v) rep.violations.push(`B tick ${s.tick} ${x}`);
      if (violationStills < MAX_STILLS) {
        violationStills++;
        rep.stills.push(await still(page, `violation-${wpm}wpm-B-${s.tick}`));
      }
    } else if (hasGuard && s.sparks >= 20 && guardStills < 3 && s.tick - lastGuardStill > 240) {
      guardStills++;
      lastGuardStill = s.tick;
      rep.stills.push(await still(page, `guard-${wpm}wpm-${guardStills}-sparks${s.sparks}`));
    }
    await page.waitForTimeout(150);
  }
  // Part C: dialogue contrast and keep-outs through the whole timeline
  await waitProPhase(page, "C", 60_000);
  const c0 = Date.now();
  while (Date.now() - c0 < 200_000) {
    const ps = await proState(page);
    if (ps?.phase !== "C") break;
    const snap = await page.evaluate(() => window.__play?.session.hud.debugSnapshot());
    if (snap) {
      rep.samplesC++;
      const v = [...checkPrologueSnapshot(snap), ...checkSnapshot(snap)];
      const d = snap.prologue?.dialogue;
      if (d) {
        rep.samplesCDialogue++;
        rep.minDialogueContrast = Math.min(rep.minDialogueContrast, d.contrast, d.speakerContrast);
      }
      if (v.length > 0) {
        for (const x of v) rep.violations.push(`C t ${ps.t.toFixed(0)} ${x}`);
        if (violationStills < MAX_STILLS) {
          violationStills++;
          rep.stills.push(await still(page, `violation-${wpm}wpm-C-${Math.round(ps.t)}`));
        }
      }
    }
    await page.waitForTimeout(200);
  }
  return rep;
}

for (const wpm of [40, 90]) {
  test(`prologue readability on the real session at ${wpm} WPM: 0 violations, 0 console errors`, async ({
    page,
  }) => {
    const run = await openApp(
      page,
      `api=off&dev=1&onboard=1&wpm-bot=${wpm}&bot-seed=3&bot-acc=0.97`,
    );
    const rep = await probeRun(page, wpm);
    console.log(
      `PROLOGUE-FX ${wpm}wpm ${JSON.stringify({ ...rep, violations: rep.violations.length })}`,
    );
    if (rep.violations.length) console.log(rep.violations.slice(0, 20).join("\n"));
    await waitRoute(page, "story", 200_000);
    expect(rep.violations, rep.violations.slice(0, 10).join("\n")).toEqual([]);
    // the probe must not be vacuous
    expect(rep.checkedLetters).toBeGreaterThan(40);
    expect(rep.samplesBMask, "Nul's mask rect was never present in Part B").toBeGreaterThan(0);
    expect(rep.samplesCDialogue, "no dialogue sampled in Part C").toBeGreaterThan(5);
    expect(rep.maxSparks, "the typing FX must be running").toBeGreaterThan(5);
    expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
    expect(rep.minRing).toBeGreaterThanOrEqual(3);
    expect(rep.minDialogueContrast).toBeGreaterThanOrEqual(7);
    expect(run.errors, run.errors.join("\n")).toEqual([]);
    const appErrs = await page.evaluate(() => window.__app?.consoleErrors ?? []);
    expect(appErrs).toEqual([]);
  });
}

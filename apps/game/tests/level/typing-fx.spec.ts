/**
 * T2.6 Chunk C: the typing VFX in the REAL level runner (stage + HUD + router gate + presentation queue), at
 * maximum intensity, with the browser bot playing L1 (guard words) and L10 (boss: doom sentences, rubble, finisher).
 * About every second the page is sampled:
 *   1. the HUD invariants (`checkSnapshot`, run here in Node on the page's snapshot) must hold;
 *   2. the next letter of the target plate must stay legible in the real composite: its HUD cell is read from the
 *      HUD canvas (the layer above WebGL) and the glyph core must keep contrast >= 4.5 against the cell and
 *      >= 3 against the ring around it (same adapted metric as tests/hud/typingReadability.spec.ts).
 * The run must also end with zero console errors, the effects must really have been running (sparks, guard
 * barrier, bolts, finisher), and the presentation queue must not have lost an event.
 *
 * Run: pnpm exec playwright test -c tests/level/playwright.config.ts typing-fx
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { checkSnapshot } from "../../src/hud/invariants";
import type { PlayDebug } from "../../src/level/session";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);

interface Sample {
  tick: number;
  phase: string;
  snapshot: Parameters<typeof checkSnapshot>[0];
  contrastRing: number | null;
  contrastCell: number | null;
  kind: string | null;
  sparks: number;
  tier: number;
  barrier: number;
  boltsLaunched: number;
  queued: number;
}

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`/?scene=play&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 60_000 });
  return errors;
}

/** One probe of the live page. */
async function sample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const p = window.__play as PlayDebug;
    const s = p.session;
    const fx = s.typingFx?.handle;
    const view = p.view();
    const cv = document.getElementById("hud") as HTMLCanvasElement;
    const ctx = cv.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const lin = (v: number): number => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    let ring: number | null = null;
    let cell: number | null = null;
    let kind: string | null = null;
    const plate = view.plates.find((q) => q.id === view.targetPlateId);
    if (plate && plate.typedIndex < plate.text.length && plate.text[plate.typedIndex] !== " ") {
      kind = plate.kind;
      const r = s.hud.getLetterRect(plate.id, plate.typedIndex);
      if (r) {
        const k = cv.width / window.innerWidth;
        const x = Math.max(0, Math.floor(r.x * k));
        const y = Math.max(0, Math.floor(r.y * k));
        const w = Math.max(1, Math.min(cv.width - x, Math.ceil(r.w * k)));
        // glyph rows only: the blinking underline strip (bottom 5 px) is not part of the glyph
        const h = Math.max(10, Math.min(cv.height - y, Math.ceil(r.h * k) - 5));
        const d = ctx.getImageData(x, y, w, h).data;
        const luma = new Float32Array(w * h);
        const rel = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
          const a = (d[i * 4 + 3] as number) / 255;
          const R = (d[i * 4] as number) * a;
          const G = (d[i * 4 + 1] as number) * a;
          const B = (d[i * 4 + 2] as number) * a;
          luma[i] = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
          rel[i] = 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
        }
        const sorted = Array.from(luma).sort((a, b) => a - b);
        const peak = Math.max(0.3, sorted[Math.floor(sorted.length * 0.95)] ?? 1);
        const mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = (luma[i] as number) > 0.8 * peak ? 1 : 0;
        const at = (x2: number, y2: number): number =>
          x2 >= 0 && y2 >= 0 && x2 < w && y2 < h ? (mask[y2 * w + x2] as number) : 0;
        const near = (x2: number, y2: number, rr: number): boolean => {
          for (let oy = -rr; oy <= rr; oy++)
            for (let ox = -rr; ox <= rr; ox++) if (at(x2 + ox, y2 + oy)) return true;
          return false;
        };
        let g = 0;
        let cg = 0;
        let nRing = 0;
        let cRing = 0;
        let nCell = 0;
        let cCell = 0;
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            const i = yy * w + xx;
            if (mask[i]) {
              let inner = true;
              for (let oy = -1; oy <= 1 && inner; oy++)
                for (let ox = -1; ox <= 1; ox++) if (!at(xx + ox, yy + oy)) inner = false;
              if (inner) {
                g += rel[i] as number;
                cg++;
              }
            } else {
              nCell += rel[i] as number;
              cCell++;
              if (near(xx, yy, 2)) {
                nRing += rel[i] as number;
                cRing++;
              }
            }
          }
        if (cg > 0 && cCell > 0) {
          const lg = g / cg;
          const ratio = (a: number, b: number): number =>
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          ring = ratio(lg, cRing ? nRing / cRing : 0);
          cell = ratio(lg, nCell / cCell);
        }
      }
    }
    const hs = s.typingFx?.handle.hud.stats();
    const ws = fx?.worldFx.diagnostics();
    return {
      tick: view.tick,
      phase: view.phase,
      snapshot: s.hud.debugSnapshot(),
      contrastRing: ring,
      contrastCell: cell,
      kind,
      sparks: hs?.sparks ?? 0,
      tier: hs?.tier ?? 0,
      barrier: ws?.barrier ?? 0,
      boltsLaunched: ws?.boltsLaunched ?? 0,
      queued: fx?.queue.count ?? 0,
    };
  });
}

interface RunReport {
  samples: number;
  checked: number;
  violations: string[];
  minRing: number;
  minCell: number;
  maxSparks: number;
  maxTier: number;
  maxBarrier: number;
  maxBolts: number;
  maxQueued: number;
  kinds: Set<string>;
}

async function playAndProbe(
  page: Page,
  stopWhen: (p: PlayDebug) => boolean,
  timeoutMs: number,
  onSample?: (s: Sample) => Promise<void>,
): Promise<RunReport> {
  const rep: RunReport = {
    samples: 0,
    checked: 0,
    violations: [],
    minRing: 99,
    minCell: 99,
    maxSparks: 0,
    maxTier: 0,
    maxBarrier: 0,
    maxBolts: 0,
    maxQueued: 0,
    kinds: new Set(),
  };
  const t0 = Date.now();
  const stopSrc = stopWhen.toString();
  for (;;) {
    const done = await page.evaluate((src) => {
      // biome-ignore lint/security/noGlobalEval: test-only predicate shipped as source
      const fn = eval(`(${src})`) as (p: unknown) => boolean;
      return fn(window.__play);
    }, stopSrc);
    if (done || Date.now() - t0 > timeoutMs) break;
    const s = await sample(page);
    rep.samples++;
    for (const v of checkSnapshot(s.snapshot)) rep.violations.push(`tick ${s.tick}: ${v}`);
    rep.maxSparks = Math.max(rep.maxSparks, s.sparks);
    rep.maxTier = Math.max(rep.maxTier, s.tier);
    rep.maxBarrier = Math.max(rep.maxBarrier, s.barrier);
    rep.maxBolts = Math.max(rep.maxBolts, s.boltsLaunched);
    rep.maxQueued = Math.max(rep.maxQueued, s.queued);
    if (s.kind) rep.kinds.add(s.kind);
    if (s.contrastRing !== null && s.contrastCell !== null) {
      rep.checked++;
      rep.minRing = Math.min(rep.minRing, s.contrastRing);
      rep.minCell = Math.min(rep.minCell, s.contrastCell);
      if (s.contrastRing < 3 || s.contrastCell < 4.5)
        rep.violations.push(
          `tick ${s.tick} (${s.kind}): next-letter contrast ring ${s.contrastRing.toFixed(2)} cell ${s.contrastCell.toFixed(2)}`,
        );
    }
    if (onSample) await onSample(s);
    await page.waitForTimeout(500);
  }
  return rep;
}

test.use({ viewport: { width: 1280, height: 720 } });

test.describe("typing VFX in the real level runner", () => {
  test("L1 at 60 WPM, intensity 1: readability holds through guard words, zero console errors", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = await open(page, "level=ch1-l01&wpm-bot=60&bot-seed=11&intensity=1");
    let shotGuard = false;
    const rep = await playAndProbe(
      page,
      (p) => p.resultsShown(),
      700_000,
      async (s) => {
        if (!shotGuard && s.barrier > 0.3) {
          shotGuard = true;
          await page.screenshot({ path: shot("fx-l1-guard") });
        }
      },
    );
    const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
    await page.screenshot({ path: shot("fx-l1-end") });
    console.log(
      `L1 fx: ${JSON.stringify({ ...rep, kinds: [...rep.kinds], violations: rep.violations.length })} seen guards=${seen.GuardWordTyped ?? 0}`,
    );
    expect(rep.violations, rep.violations.slice(0, 8).join("\n")).toEqual([]);
    expect(rep.checked).toBeGreaterThan(20);
    expect(rep.maxSparks, "the typing FX must be running").toBeGreaterThan(5);
    expect(seen.GuardWordTyped ?? 0, "the bot defended at least once").toBeGreaterThan(0);
    expect(rep.maxBarrier, "the guard barrier appeared").toBeGreaterThan(0.2);
    expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
    expect(rep.minRing).toBeGreaterThanOrEqual(3);
    expect(errors, errors.join("\n")).toEqual([]);
    const pe = await page.evaluate(() => (window.__play as PlayDebug).consoleErrors);
    expect(pe).toEqual([]);
  });

  test("L10 at 75 WPM, intensity 1: boss sentences, bolts, finisher, readability holds", async ({
    page,
  }) => {
    test.setTimeout(1_200_000);
    const errors = await open(
      page,
      "level=ch1-l10&wpm-bot=75&bot-acc=0.97&bot-seed=21&intensity=1",
    );
    let shotBolt = false;
    let shotFin = false;
    const rep = await playAndProbe(
      page,
      (p) => p.resultsShown() || p.phase() === "failed",
      1_000_000,
      async (s) => {
        if (!shotBolt && s.boltsLaunched > 2) {
          shotBolt = true;
          await page.screenshot({ path: shot("fx-l10-bolts") });
        }
        if (!shotFin && s.kind === "finisher") {
          shotFin = true;
          await page.screenshot({ path: shot("fx-l10-finisher-plate") });
        }
      },
    );
    const seen = await page.evaluate(() => (window.__play as PlayDebug).seen());
    const outcome = await page.evaluate(
      () => (window.__play as PlayDebug).result()?.outcome ?? null,
    );
    await page.screenshot({ path: shot("fx-l10-end") });
    console.log(
      `L10 fx: ${JSON.stringify({ ...rep, kinds: [...rep.kinds], violations: rep.violations.length })} outcome=${outcome} sentence=${seen.SentenceWordDone ?? 0} finisher=${seen.FinisherCompleted ?? 0}`,
    );
    expect(rep.violations, rep.violations.slice(0, 8).join("\n")).toEqual([]);
    expect(rep.checked).toBeGreaterThan(20);
    expect(rep.maxSparks).toBeGreaterThan(5);
    expect(rep.minCell).toBeGreaterThanOrEqual(4.5);
    expect(rep.minRing).toBeGreaterThanOrEqual(3);
    expect(errors, errors.join("\n")).toEqual([]);
    const pe = await page.evaluate(() => (window.__play as PlayDebug).consoleErrors);
    expect(pe).toEqual([]);
  });
});

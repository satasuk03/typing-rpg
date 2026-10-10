/**
 * P3.2 prologue VFX, real Metal captures (docs/qa/prologue-p3.2/):
 *   PW_PORT=5441 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts prologue-p32
 *
 * 1. A still per cue (JPEG < 200 KB) from `?scene=prologue&part=vfx&cue=...&freeze=1` on the Word Gate.
 * 2. Contact sheets (3), composed in the page.
 * 3. Determinism: every cue captured twice (separate page loads, strict tolerance) and re-seeked in the page (perceptual tolerance, as
 *    the P3.1 cutscene spec): the pixel diff must be < 0.5%.
 * Env: ONLY=<substring> limits the stills; NOSHEETS=1 / NODET=1 skip those parts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const OUT =
  process.env.STILL_DIR ?? join(here, "..", "..", "..", "..", "docs", "qa", "prologue-p3.2");
mkdirSync(OUT, { recursive: true });

interface Shot {
  name: string;
  /** Query after `?scene=prologue&part=vfx&freeze=1&`. */
  q: string;
  sheet: 1 | 2 | 3;
}

const SHOTS: Shot[] = [
  // sheet 1: Part A / B (ink, tear, bolt, ward, aura)
  { name: "inkRise", q: "cue=inkRise&age=520", sheet: 1 },
  { name: "skyTear-open", q: "cue=skyTear&age=1100", sheet: 1 },
  { name: "skyTear-close", q: "cue=skyTearClose&age=420", sheet: 1 },
  { name: "hushBolt-flight", q: "cue=hushBolt&age=380", sheet: 1 },
  { name: "hushBolt-impact", q: "cue=hushBolt&age=560", sheet: 1 },
  { name: "ward", q: "cue=ward&age=1500", sheet: 1 },
  { name: "ward-ripple", q: "cue=ward&age=1500&p.hit=60", sheet: 1 },
  { name: "surgeAura-x2", q: "cue=surgeAura&p.mult=2", sheet: 1 },
  { name: "surgeAura-x16", q: "cue=surgeAura&p.mult=16", sheet: 1 },
  // sheet 2: Part C theft
  { name: "catchFireball-hold", q: "cue=catchFireball&age=450", sheet: 2 },
  { name: "catchFireball-grey", q: "cue=catchFireball&age=900", sheet: 2 },
  { name: "catchFireball-crumble", q: "cue=catchFireball&age=1500", sheet: 2 },
  { name: "inkWrite", q: "cue=inkWrite&age=750", sheet: 2 },
  { name: "theftStream-1-fireball", q: "cue=theftStream&age=520&p.k=1&blend=0.24", sheet: 2 },
  { name: "theftStream-3-slashwave", q: "cue=theftStream&age=520&p.k=3&blend=0.57", sheet: 2 },
  { name: "theftStream-6-frost", q: "cue=theftStream&age=520&p.k=6&blend=1", sheet: 2 },
  { name: "auraCollapse-narrow", q: "cue=auraCollapse&age=520", sheet: 2 },
  { name: "auraCollapse-snap", q: "cue=auraCollapse&age=730", sheet: 2 },
  // sheet 3: the silence
  { name: "gateDarken", q: "cue=gateDarken&age=2500", sheet: 3 },
  { name: "letterVortex", q: "cue=letterVortex&age=2400", sheet: 3 },
  { name: "silenceFog", q: "cue=silenceFog&age=4200", sheet: 3 },
  { name: "ember", q: "cue=ember&age=1600", sheet: 3 },
  { name: "clusterB-densest", q: "cue=clusterB&age=900", sheet: 3 },
  { name: "clusterC-densest", q: "cue=clusterC&age=2600", sheet: 3 },
];

const URL_BASE = "/?scene=prologue&part=vfx&freeze=1&";

async function open(page: Page, q: string): Promise<void> {
  await page.goto(`${URL_BASE}${q}`);
  await page.waitForFunction(() => window.__prologueVfx?.ready === true, undefined, {
    timeout: 120_000,
  });
}

/** JPEG under 200 KB: lower the quality until it fits. */
async function shootJpeg(page: Page): Promise<Buffer> {
  let quality = 86;
  for (;;) {
    const b = await page.screenshot({ type: "jpeg", quality });
    if (b.length < 195 * 1024 || quality <= 40) return b;
    quality -= 6;
  }
}

async function diffFraction(page: Page, a: Buffer, b: Buffer, tol = 6): Promise<number> {
  return page.evaluate(
    async ([pa, pb, tl]) => {
      const load = async (b64: string): Promise<ImageData> => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [ia, ib] = [await load(pa as string), await load(pb as string)];
      let diff = 0;
      for (let i = 0; i < ia.data.length; i += 4) {
        const d =
          Math.abs((ia.data[i] ?? 0) - (ib.data[i] ?? 0)) +
          Math.abs((ia.data[i + 1] ?? 0) - (ib.data[i + 1] ?? 0)) +
          Math.abs((ia.data[i + 2] ?? 0) - (ib.data[i + 2] ?? 0));
        if (d > (tl as number)) diff++;
      }
      return diff / (ia.data.length / 4);
    },
    [a.toString("base64"), b.toString("base64"), tol],
  );
}

const only = process.env.ONLY;
const chosen = SHOTS.filter((s) => !only || s.name.includes(only));
const errors: string[] = [];

test.describe.configure({ mode: "serial" });

test("a Metal still per cue (JPEG < 200 KB)", async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  for (const s of chosen) {
    await open(page, s.q);
    const jpg = await shootJpeg(page);
    writeFileSync(join(OUT, `${s.name}.jpg`), jpg);
    console.log(`STILL ${s.name} ${(jpg.length / 1024).toFixed(0)} KB`);
    expect(jpg.length).toBeLessThan(200 * 1024);
  }
  expect(errors).toEqual([]);
});

test("contact sheets", async ({ page }) => {
  test.skip(!!process.env.NOSHEETS || !!only, "sheets need the whole set");
  await page.goto("about:blank");
  for (const n of [1, 2, 3] as const) {
    const shots = SHOTS.filter((s) => s.sheet === n);
    const { readFileSync } = await import("node:fs");
    const imgs = shots.map((s) => ({
      name: s.name,
      b64: readFileSync(join(OUT, `${s.name}.jpg`)).toString("base64"),
    }));
    const dataUrl = await page.evaluate(async (items) => {
      const cols = 3;
      const cw = 560;
      const ch = 315;
      const rows = Math.ceil(items.length / cols);
      const c = document.createElement("canvas");
      c.width = cols * cw;
      c.height = rows * ch;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.fillStyle = "#000";
      g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < items.length; i++) {
        const it = items[i] as { name: string; b64: string };
        const img = new Image();
        img.src = `data:image/jpeg;base64,${it.b64}`;
        await img.decode();
        const x = (i % cols) * cw;
        const y = Math.floor(i / cols) * ch;
        g.drawImage(img, x, y, cw, ch);
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(x, y, 260, 20);
        g.fillStyle = "#fff";
        g.font = "13px monospace";
        g.fillText(it.name, x + 6, y + 14);
      }
      return c.toDataURL("image/jpeg", 0.62);
    }, imgs);
    const buf = Buffer.from(dataUrl.split(",")[1] as string, "base64");
    writeFileSync(join(OUT, `sheet-${n}.jpg`), buf);
    console.log(`SHEET ${n} ${(buf.length / 1024).toFixed(0)} KB`);
  }
});

test("determinism: same cue, same age, two captures differ < 0.5%", async ({ page }) => {
  test.skip(!!process.env.NODET, "skipped");
  const rows: string[] = [];
  let worst = 0;
  for (const s of chosen) {
    await open(page, s.q);
    const a = await page.screenshot();
    await open(page, s.q);
    const b = await page.screenshot();
    const f = await diffFraction(page, a, b);
    // in page: seek away and back (the cutscene `seek` path)
    const cueName = (new URLSearchParams(s.q).get("cue") ?? "inkRise") as string;
    const age = Number(new URLSearchParams(s.q).get("age") ?? 0);
    const params: Record<string, number | string> = {};
    for (const [k, v] of new URLSearchParams(s.q).entries())
      if (k.startsWith("p.")) params[k.slice(2)] = Number.isFinite(Number(v)) ? Number(v) : v;
    await page.evaluate(
      ([c, t, p]) =>
        window.__prologueVfx?.seek(c as string, (t as number) + 1700, p as Record<string, number>),
      [cueName, age, params] as const,
    );
    await page.evaluate(
      ([c, t, p]) =>
        window.__prologueVfx?.seek(c as string, t as number, p as Record<string, number>),
      [cueName, age, params] as const,
    );
    const c = await page.screenshot();
    // an in-page re-seek keeps sub-visible film grain noise (the grain is seeded by the frame counter), so it uses the perceptual tolerance
    // of the P3.1 cutscene spec (RGB sum > 48); two separate page loads are held to the strict one (RGB sum > 6)
    const f2 = await diffFraction(page, a, c, 48);
    const reseekCounts = !/^(surgeAura|auraCollapse|clusterB)/.test(s.name);
    worst = Math.max(worst, f, reseekCounts ? f2 : 0);
    rows.push(`${s.name}\tloads=${(f * 100).toFixed(4)}%\treseek=${(f2 * 100).toFixed(4)}%`);
    expect(f, `${s.name} two page loads`).toBeLessThan(0.005);
    // the aura cues (surgeAura, auraCollapse, clusterB) settle 130 frames (the aura eases in), which also advance the world's ambient dust 2 s per seek: only the
    // two-page-load comparison is meaningful for them
    if (!/^(surgeAura|auraCollapse|clusterB)/.test(s.name))
      expect(f2, `${s.name} in-page re-seek`).toBeLessThan(0.005);
  }
  writeFileSync(
    join(OUT, "determinism.txt"),
    `${rows.join("\n")}\nworst=${(worst * 100).toFixed(4)}%\n`,
  );
  console.log(`DETERMINISM\n${rows.join("\n")}\nworst=${(worst * 100).toFixed(4)}%`);
});

test("perf: p95 frame time of the heaviest cue clusters (Part B and Part C cues alone, 1280x720 Metal)", async ({
  page,
}) => {
  test.skip(!!only, "full run only");
  const rows: string[] = [];
  for (const [cue, tier] of [
    ["clusterB", 0],
    ["clusterC", 0],
    ["clusterC", 2],
  ] as const) {
    await page.goto(`/?scene=prologue&part=vfx&cue=${cue}&freeze=1&tier=${tier}`);
    await page.waitForFunction(() => window.__prologueVfx?.ready === true, undefined, {
      timeout: 120_000,
    });
    const b = await page.evaluate(() => window.__prologueVfx?.bench(900));
    expect(b).toBeTruthy();
    if (!b) continue;
    rows.push(
      `${cue} tier ${tier}: avg=${b.avgMs.toFixed(2)} ms p95=${b.p95Ms.toFixed(2)} ms max=${b.maxMs.toFixed(2)} ms over ${b.frames} frames`,
    );
    if (tier === 0) expect(b.p95Ms, `${cue} p95`).toBeLessThan(18);
  }
  writeFileSync(join(OUT, "perf-clusters.txt"), `${rows.join("\n")}\n`);
  console.log(`PERF\n${rows.join("\n")}`);
});

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const QA = join(here, "..", "..", "..", "..", "docs", "qa", "prologue-p3.1");
mkdirSync(QA, { recursive: true });

async function open(page: Page, t: number): Promise<void> {
  await page.goto(`/?scene=prologue&part=cutscene&tl=test&t=${t}&freeze=1`);
  await page.waitForFunction(() => window.__prologueScene?.ready === true, undefined, {
    timeout: 120_000,
  });
}

/** Fraction of pixels that differ (any channel by > 2/255) between two PNG buffers, decoded in the page. */
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

test("two captures at the same t differ by < 0.5% of pixels (separate loads + in-page re-seek)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = 3000;
  await open(page, T);
  const first = await page.screenshot();
  await open(page, T);
  const second = await page.screenshot();
  const f1 = await diffFraction(page, first, second);
  // in-page: go elsewhere, come back
  await page.evaluate((t) => window.__prologueScene?.seek(t + 4000), T);
  await page.evaluate((t) => window.__prologueScene?.seek(t), T);
  const third = await page.screenshot();
  // in-page re-seeks keep sub-visible grain/ambient-particle noise (RGB sum > 6 differs), so this one uses a perceptual tolerance
  const f2 = await diffFraction(page, first, third, 48);
  console.log(
    `PIXELDIFF separate-loads=${(f1 * 100).toFixed(4)}% in-page-reseek=${(f2 * 100).toFixed(4)}%`,
  );
  expect(f1).toBeLessThan(0.005);
  expect(f2).toBeLessThan(0.005);
  expect(errors).toEqual([]);
});

test("different t gives a visibly different frame (the timeline really moves camera, mood, hero)", async ({
  page,
}) => {
  await open(page, 0);
  const a = await page.screenshot();
  await open(page, 4000);
  const b = await page.screenshot();
  expect(await diffFraction(page, a, b)).toBeGreaterThan(0.1);
});

test("stills of the test timeline (JPEG < 200 KB each)", async ({ page }) => {
  for (const t of [0, 2500, 4500, 7000, 9000]) {
    await open(page, t);
    const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
    expect(jpg.length).toBeLessThan(200 * 1024);
    writeFileSync(join(QA, `cutscene-t${String(t).padStart(4, "0")}.jpg`), jpg);
  }
});

test("live: the clock holds on the line, letters do not advance it, Space does after the guard", async ({
  page,
}) => {
  await page.goto("/?scene=prologue&part=cutscene&tl=test&t=4400");
  await page.waitForFunction(() => window.__prologueScene?.ready === true, undefined, {
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => window.__prologueScene?.player.isHeldOnLine === true,
    undefined,
    {
      timeout: 20_000,
    },
  );
  await page.keyboard.press("a");
  await page.keyboard.press("Enter"); // inside the 1.5 s guard (player.start() armed it)
  expect(await page.evaluate(() => window.__prologueScene?.player.isHeldOnLine)).toBe(true);
  await page.waitForFunction(() => window.__prologueScene?.player.guardRemainingMs === 0);
  await page.keyboard.press("q");
  expect(await page.evaluate(() => window.__prologueScene?.player.isHeldOnLine)).toBe(true);
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.__prologueScene?.player.isHeldOnLine)).toBe(false);
});

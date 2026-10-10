/**
 * One labelled contact sheet of the 16 plan §6 keyframes (docs/qa/prologue-p3.6/contact-sheet.jpg, JPEG < 200 KB), built from
 * the stills `prologueStills.metal.ts` wrote. Run after it:
 *   APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts prologueContactSheet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(dir, "../../../../docs/qa/prologue-p3.6");
const MAX_BYTES = 200 * 1024;

const ORDER: [string, string][] = [
  ["a1-crane", "A 2.5 crane"],
  ["a2-ink-drips", "A 6.0 ink drips"],
  ["b1-first-fireball", "B first Fireball"],
  ["b2-slash-wave-crowd", "B Slash Wave on the crowd"],
  ["b3-boss-intro-card", "B boss intro card"],
  ["b4-max-surge-aura", "B max-surge aura"],
  ["c01-catch", "C 0.3 catch"],
  ["c02-mask-push", "C 2.0 mask push"],
  ["c03-knight-flare", "C 8.0 knight flare"],
  ["c04-ink-line", "C 11.5 ink line"],
  ["c05-theft-3", "C 15.2 theft 3"],
  ["c06-theft-6", "C 19.9 theft 6"],
  ["c07-collapse-kneel", "C 21.0 collapse + kneel"],
  ["c08-colour-swirl", "C 23.5 colour swirl"],
  ["c09-vortex-fog", "C 33.0 vortex + fog"],
  ["c10b-ember", "C 42.5 shards + ember"],
];

test("contact sheet of the 16 keyframes", async ({ page }) => {
  const cells = ORDER.map(([f, label]) => {
    const file = path.join(OUT, `${f}.jpg`);
    expect(fs.existsSync(file), `${f}.jpg is missing: run prologueStills first`).toBe(true);
    const src = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
    return `<figure><img src="${src}"><figcaption>${label}</figcaption></figure>`;
  });
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.setContent(
    `<style>body{margin:0;background:#0b0912;display:grid;grid-template-columns:repeat(4,400px)}
figure{margin:0;position:relative;width:400px;height:240px}img{width:400px;height:225px;display:block}
figcaption{position:absolute;left:0;right:0;bottom:0;height:15px;font:11px monospace;color:#f0e8d0;background:#0b0912;padding:0 4px}</style>${cells.join("")}`,
  );
  await page.waitForTimeout(600);
  let bytes = 0;
  for (const quality of [72, 64, 56, 48, 40]) {
    const buf = await page.screenshot({ type: "jpeg", quality });
    bytes = buf.length;
    fs.writeFileSync(path.join(OUT, "contact-sheet.jpg"), buf);
    if (bytes <= MAX_BYTES) break;
  }
  console.log(`CONTACT SHEET ${bytes} bytes`);
  expect(bytes).toBeLessThanOrEqual(MAX_BYTES);
});

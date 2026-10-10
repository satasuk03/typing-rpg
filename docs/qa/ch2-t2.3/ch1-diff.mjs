// Ch1 pixel-identity check for T2.3: the same Ch1 stills rendered by the base commit (port A) and by this branch (port B).
//   node docs/qa/ch2-t2.3/ch1-diff.mjs <outDir> <basePort> <branchPort>
// Writes ch1-l02-before/after.png, ch1-l09-before/after.png (docs/qa/ch2-t2.3/jpeg.py builds the diff sheet from them).
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../apps/game/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [outDir, basePort, branchPort] = process.argv.slice(2);
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const shots = [
  ["ch1-l02", "/?scene=level&id=ch1-l02&pose=battle:1&freeze=1"],
  ["ch1-l09", "/?scene=level&id=ch1-l09&pose=battle:1&freeze=1"],
];
for (const [name, url] of shots) {
  for (const [tag, port] of [["before", basePort], ["after", branchPort]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${port}${url}`);
    await page.waitForFunction(() => window.__renderTest?.ready === true, null, { timeout: 120000 });
    await page.evaluate(() => window.__renderTest.step(30, 1 / 60));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${name}-${tag}.png` });
    console.log("shot", name, tag);
    await page.close();
  }
}
await browser.close();

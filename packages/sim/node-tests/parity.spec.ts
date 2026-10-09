// Node vs Chromium parity: the same toy replays run in both engines and must match each other and the golden fixture.
// Run: pnpm --filter @hd2d/sim test:parity
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { goldenHashes } from "../tests/toy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  fs.readFileSync(path.join(here, "../tests/fixtures/golden-replay.json"), "utf8"),
) as { hashes: Record<string, string> };

test("Chromium replay hashes equal Node's and the committed golden fixture", async ({ page }) => {
  const bundle = await build({
    entryPoints: [path.join(here, "browser-entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
  });
  const code = bundle.outputFiles[0]?.text ?? "";
  expect(code.length).toBeGreaterThan(0);

  await page.goto("about:blank");
  await page.addScriptTag({ content: code });
  const browserHashes = await page.evaluate(() =>
    (
      globalThis as unknown as { __parity: { goldenHashes: () => Record<string, string> } }
    ).__parity.goldenHashes(),
  );
  const nodeHashes = goldenHashes();
  console.log("node   :", JSON.stringify(nodeHashes));
  console.log("browser:", JSON.stringify(browserHashes));
  expect(browserHashes).toEqual(nodeHashes);
  expect(browserHashes).toEqual(golden.hashes);
});

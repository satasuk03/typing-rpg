// Node vs Chromium parity: the same replays run in both engines and must match each other and the golden fixtures.
//   1. the toy sim (kernel: rng, hash, runner)
//   2. the typing-only level (T1.2): scripted typing sessions through createLevel/applyInput/step/replay
// Run: pnpm --filter @hd2d/sim test:parity
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { build } from "esbuild";
import { goldenHashes } from "../tests/toy.ts";
import { type TrialGolden, trialGoldens } from "../tests/trialHarness.ts";
import { type TypingGolden, typingGoldens } from "../tests/typingGolden.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = <T>(rel: string): T =>
  JSON.parse(fs.readFileSync(path.join(here, rel), "utf8")) as T;
const golden = readJson<{ hashes: Record<string, string> }>("../tests/fixtures/golden-replay.json");
const typingGolden = readJson<{ goldens: Record<string, TypingGolden> }>(
  "../tests/fixtures/golden-typing.json",
);

const trialGolden = readJson<{ goldens: Record<string, TrialGolden> }>(
  "../tests/fixtures/golden-trial.json",
);

type Parity = {
  trialGoldens: () => Record<string, TrialGolden>;
  goldenHashes: () => Record<string, string>;
  typingGoldens: () => Record<string, TypingGolden>;
};

async function loadBundle(page: Page): Promise<void> {
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
}

test("Chromium replay hashes equal Node's and the committed golden fixture", async ({ page }) => {
  await loadBundle(page);
  const browserHashes = await page.evaluate(() =>
    (globalThis as unknown as { __parity: Parity }).__parity.goldenHashes(),
  );
  const nodeHashes = goldenHashes();
  console.log("node   :", JSON.stringify(nodeHashes));
  console.log("browser:", JSON.stringify(browserHashes));
  expect(browserHashes).toEqual(nodeHashes);
  expect(browserHashes).toEqual(golden.hashes);
});

test("typing-only level: Chromium scripted-session replays equal Node's and the golden fixture", async ({
  page,
}) => {
  await loadBundle(page);
  const browser = await page.evaluate(() =>
    (globalThis as unknown as { __parity: Parity }).__parity.typingGoldens(),
  );
  const node = typingGoldens();
  console.log("node   :", JSON.stringify(node));
  console.log("browser:", JSON.stringify(browser));
  expect(browser).toEqual(node);
  expect(browser).toEqual(typingGolden.goldens);
});

test("Typing Trial: Chromium scripted-session replays equal Node's and the golden fixture", async ({
  page,
}) => {
  await loadBundle(page);
  const browser = await page.evaluate(() =>
    (globalThis as unknown as { __parity: Parity }).__parity.trialGoldens(),
  );
  const node = trialGoldens();
  console.log("node   :", JSON.stringify(node));
  console.log("browser:", JSON.stringify(browser));
  expect(browser).toEqual(node);
  expect(browser).toEqual(trialGolden.goldens);
});

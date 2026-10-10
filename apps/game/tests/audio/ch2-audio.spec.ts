import { expect, test } from "@playwright/test";
import { CH2_TEST_SFX } from "../../src/dev/audioTestScene";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

/** T3.3 smoke: click every Ch2 button / key on ?scene=audio-test and require 0 console and audio errors. */
test("audio-test: every Chapter 2 loop, ambience, SFX and control runs with 0 errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/?scene=audio-test&biome=fen&state=battle");
  await page.waitForFunction(() => !!window.__audioTest);
  await page.keyboard.press("a"); // unlock (also applies the URL biome)
  await page.waitForFunction(() => window.__audioTest?.engine.context?.state === "running");
  expect(await page.evaluate(() => window.__audioTest?.engine.getBiome())).toBe("fen");
  expect(await page.evaluate(() => window.__audioTest?.engine.getMusicState())).toBe("battle");

  // Every labelled Ch2 button, by its visible text.
  for (const id of CH2_TEST_SFX) {
    await page.getByRole("button", { name: id, exact: true }).click();
    await page.waitForTimeout(40);
  }
  for (const name of [
    "hushwood loop",
    "fen loop",
    "grove / Willow walk",
    "Willow boss phase 1",
    "Willow boss phase 2",
    "Willow boss phase 3",
    "Willow freed (D major)",
    "whisper loop ON",
    "whisper loop OFF",
    "capital key x3",
    '"Hush now, Ember Knight" @90 WPM',
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(150);
  }

  // Keys: biomes 5-7, next / previous / replay, Shift+letter capital accent.
  for (const k of ["5", "6", "7", "]", "[", "\\", "Shift+H", "Shift+E", "h", "e"]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
  const pressed = await page.evaluate(() => window.__audioTest?.pressAllCh2() ?? 0);
  expect(pressed).toBeGreaterThanOrEqual(CH2_TEST_SFX.length + 11);

  // Let the Willow whispers, the ambience one-shots and the music run for a bit.
  await page.getByRole("button", { name: "whisper loop ON" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "whisper loop OFF" }).click();
  await page.waitForTimeout(600);

  const hook = await page.evaluate(() => ({
    errors: window.__audioTest?.errors ?? [],
    state: window.__audioTest?.engine.context?.state,
  }));
  expect(hook.errors).toEqual([]);
  expect(hook.state).toBe("running");
  expect(errors).toEqual([]);
});

test("capitalKey hot path costs about the same as key (no per-key allocation spike)", async ({
  page,
}, info) => {
  await page.goto("/?scene=audio-test");
  await page.waitForFunction(() => !!window.__audioTest);
  await page.keyboard.press("a");
  await page.waitForFunction(() => window.__audioTest?.engine.context?.state === "running");
  const r = await page.evaluate(() => {
    const engine = window.__audioTest?.engine;
    if (!engine) throw new Error("no engine");
    const bench = (id: "key" | "capitalKey"): { mean: number; p95: number } => {
      const run = (): number[] => {
        const out: number[] = [];
        for (let i = 0; i < 200; i++) {
          const t0 = performance.now();
          engine.play(id, { streak: i });
          out.push(performance.now() - t0);
        }
        return out;
      };
      run();
      const s = run().sort((a, b) => a - b);
      return { mean: s.reduce((a, b) => a + b, 0) / s.length, p95: s[190] ?? 0 };
    };
    return { key: bench("key"), capital: bench("capitalKey") };
  });
  const line = `capitalKey x200: mean=${r.capital.mean.toFixed(3)}ms p95=${r.capital.p95.toFixed(3)}ms | key mean=${r.key.mean.toFixed(3)}ms p95=${r.key.p95.toFixed(3)}ms`;
  console.log(line);
  info.annotations.push({ type: "latency", description: line });
  expect(r.capital.p95).toBeLessThan(10);
  expect(r.capital.mean).toBeLessThan(r.key.mean * 2 + 0.2);
});

import { expect, test } from "@playwright/test";
import type { AudioTestHook } from "../../src/dev/audioTestScene";

// Headless chromium needs autoplay allowed; a real keypress also provides the user gesture.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

declare global {
  interface Window {
    __audioTest?: AudioTestHook;
  }
}

test("audio-test scene: keys, typo, word, biomes and every Sfx id run without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/?scene=audio-test");
  await page.waitForFunction(() => !!window.__audioTest);

  // First keydown unlocks the context.
  await page.keyboard.press("a");
  await page.waitForFunction(() => window.__audioTest?.engine.context?.state === "running");

  for (const k of "typingtestwordabc") await page.keyboard.press(k);
  await page.keyboard.press("x");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  for (const k of ["1", "2", "3", "4"]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }

  // Every Sfx id via the engine.
  const result = await page.evaluate(() => {
    const t = window.__audioTest;
    if (!t) return { played: [] as string[], failed: ["no hook"] };
    const ids = [...document.querySelectorAll("#audio-test button")].length; // sanity: buttons exist
    const sfx = [
      "key",
      "typo",
      "wordComplete",
      "perfectWord",
      "tierUp",
      "slash",
      "hit",
      "crit",
      "guard",
      "parry",
      "enemyWindup",
      "heroHurt",
      "enemyDeath",
      "break",
      "chestLand",
      "chestOpen",
      "coin",
      "skillFire",
      "skillMagic",
      "explode",
      "heal",
      "encounter",
      "levelUp",
      "victory",
      "bossIntro",
      "uiClick",
      "uiConfirm",
    ] as const;
    const played: string[] = [];
    const failed: string[] = [];
    for (const id of sfx) {
      const ok = t.engine.play(id, { streak: 30, tier: 3, boss: true });
      (ok ? played : failed).push(id);
    }
    for (const tier of [1, 2, 3, 4]) t.engine.play("tierUp", { tier });
    for (const s of ["walk", "battle", "boss", "victory"] as const) t.engine.setMusicState(s);
    return { played, failed, buttons: ids };
  });
  expect(result.failed).toEqual([]);
  expect(result.played.length).toBe(27);

  await page.waitForTimeout(800); // let scheduled voices, ambience and music run
  const hook = await page.evaluate(() => ({
    errors: window.__audioTest?.errors ?? [],
    state: window.__audioTest?.engine.context?.state,
  }));
  expect(hook.errors).toEqual([]);
  expect(hook.state).toBe("running");
  expect(errors).toEqual([]);
});

test("latency: play('key') call cost and keydown handler time", async ({ page }, info) => {
  await page.goto("/?scene=audio-test");
  await page.waitForFunction(() => !!window.__audioTest);
  await page.keyboard.press("a");
  await page.waitForFunction(() => window.__audioTest?.engine.context?.state === "running");

  const bench = await page.evaluate(() => {
    const engine = window.__audioTest?.engine;
    if (!engine) throw new Error("no engine");
    const run = (): number[] => {
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const t0 = performance.now();
        engine.play("key", { streak: i });
        samples.push(performance.now() - t0);
      }
      return samples;
    };
    run(); // warm-up (JIT)
    const s = run().sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return { mean: sum / s.length, p50: s[100] ?? 0, p95: s[190] ?? 0, max: s[s.length - 1] ?? 0 };
  });

  // Real keydown path: handler time and event-timestamp -> after play().
  for (let i = 0; i < 20; i++) await page.keyboard.press("k");
  const kd = await page.evaluate(() => ({
    handlerMaxMs: window.__audioTest?.maxHandlerMs ?? -1,
    handlerLastMs: window.__audioTest?.lastHandlerMs ?? -1,
    dispatchLastMs: window.__audioTest?.lastDispatchMs ?? -1,
  }));

  const line = `LATENCY play('key') x200: mean=${bench.mean.toFixed(3)}ms p50=${bench.p50.toFixed(3)}ms p95=${bench.p95.toFixed(3)}ms max=${bench.max.toFixed(3)}ms | keydown handler last=${kd.handlerLastMs.toFixed(3)}ms max=${kd.handlerMaxMs.toFixed(3)}ms | event->play ${kd.dispatchLastMs.toFixed(3)}ms`;
  console.log(line);
  info.annotations.push({ type: "latency", description: line });
  expect(bench.p95).toBeLessThan(10);
  expect(bench.mean).toBeLessThan(10);
});

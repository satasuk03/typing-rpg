import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

interface ClickReport {
  baselineMaxDelta: number;
  silencedMaxDelta: number;
  retargetMaxDelta: number;
  abruptMaxDelta: number;
  directRmsSilenced: number;
  busRmsSilenced: number;
  restoredRatio: number;
}

/**
 * P3.4 acceptance: `Mixer.silence()` is click-free. An OfflineAudioContext renders the real Mixer with a tone on the
 * music bus and a tone on the ambience bus while silence(1) engages, is retargeted mid-ramp to 0.75, then released with
 * silence(0). The max sample-to-sample delta must not exceed the un-silenced baseline (the low-pass only removes
 * energy, so any extra jump would be a click). A negative control (an abrupt gain step) must exceed it by a wide margin.
 */
test("mixer.silence(): the offline render has no clicks, the motif bypasses it, silence(0) restores", async ({
  page,
}) => {
  await page.goto("/?scene=audio-test");
  await page.waitForFunction(() => !!window.__audioTest);
  const r = await page.evaluate(async (): Promise<ClickReport> => {
    // Indirection so the TS bundler of the spec does not try to resolve the dev-server module.
    const load = (p: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ p);
    const { Mixer } = (await load("/src/audio/mixer.ts")) as {
      Mixer: new (
        ctx: BaseAudioContext,
        rng: () => number,
      ) => {
        buses: Record<string, GainNode>;
        musicDirect: GainNode;
        silence(a: number, s?: number): void;
        apply(s: unknown, immediate?: boolean): void;
      };
    };
    const { DEFAULT_SETTINGS } = (await load("/src/audio/settings.ts")) as {
      DEFAULT_SETTINGS: unknown;
    };
    const SR = 48000;
    const SECONDS = 9;
    const rng = (): number => 0.5;

    const render = async (
      plan: (ctx: OfflineAudioContext, mixer: InstanceType<typeof Mixer>) => Promise<void>,
      toneFreqs: { bus: "music" | "ambience" | "direct"; hz: number; amp: number }[],
    ): Promise<Float32Array> => {
      const ctx = new OfflineAudioContext(2, SR * SECONDS, SR);
      const mixer = new Mixer(ctx, rng);
      mixer.apply(DEFAULT_SETTINGS, true);
      for (const t of toneFreqs) {
        const o = ctx.createOscillator();
        o.frequency.value = t.hz;
        const g = ctx.createGain();
        g.gain.value = t.amp;
        o.connect(g);
        g.connect(t.bus === "direct" ? mixer.musicDirect : (mixer.buses[t.bus] as GainNode));
        o.start(0);
      }
      await plan(ctx, mixer);
      const buf = await ctx.startRendering();
      return buf.getChannelData(0);
    };
    // Low tones keep the un-silenced max delta tiny (~0.005), so any jump from the gain or filter change would show.
    const tones = [
      { bus: "music" as const, hz: 110, amp: 0.2 },
      { bus: "ambience" as const, hz: 165, amp: 0.1 },
    ];
    const at = (ctx: OfflineAudioContext, t: number, fn: () => void): Promise<void> =>
      ctx.suspend(t).then(() => {
        fn();
        return ctx.resume();
      });
    const maxDelta = (d: Float32Array, from = 0.2): number => {
      let m = 0;
      for (let i = Math.floor(from * SR); i < d.length; i++)
        m = Math.max(m, Math.abs((d[i] as number) - (d[i - 1] as number)));
      return m;
    };
    const rms = (d: Float32Array, a: number, b: number): number => {
      let s = 0;
      for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) s += (d[i] as number) ** 2;
      return Math.sqrt(s / (Math.floor(b * SR) - Math.floor(a * SR)));
    };

    const baseline = await render(async () => {}, tones);

    const silenced = await render(async (ctx, mixer) => {
      void at(ctx, 1, () => mixer.silence(1, 1.2));
      void at(ctx, 4, () => mixer.silence(0.75, 2));
      void at(ctx, 6, () => mixer.silence(0, 1.2));
    }, tones);

    // Retarget while a ramp is still in flight (0.3 s into silence(1, 1.2), then again 0.2 s later).
    const retarget = await render(async (ctx, mixer) => {
      void at(ctx, 1, () => mixer.silence(1, 1.2));
      void at(ctx, 1.3, () => mixer.silence(0.2, 1.2));
      void at(ctx, 1.5, () => mixer.silence(1, 0.5));
    }, tones);

    // Negative control: an abrupt duck must register as a click on this metric.
    const abrupt = await render(async (ctx, mixer) => {
      for (let k = 0; k < 6; k++)
        void at(ctx, 1 + k * 0.053, () => {
          (mixer.buses.music as GainNode).gain.value = k % 2 === 0 ? 0.25 : 1;
        });
    }, tones);

    // Motif bypass: the same 3 kHz tone on the music bus vs the direct send, both under silence(1) fully engaged.
    const bus3k = await render(
      async (ctx, mixer) => void at(ctx, 0.1, () => mixer.silence(1, 0.3)),
      [{ bus: "music", hz: 3000, amp: 0.3 }],
    );
    const direct3k = await render(
      async (ctx, mixer) => void at(ctx, 0.1, () => mixer.silence(1, 0.3)),
      [{ bus: "direct", hz: 3000, amp: 0.3 }],
    );

    return {
      baselineMaxDelta: maxDelta(baseline),
      silencedMaxDelta: maxDelta(silenced),
      retargetMaxDelta: maxDelta(retarget),
      abruptMaxDelta: maxDelta(abrupt),
      directRmsSilenced: rms(direct3k, 5, 8),
      busRmsSilenced: rms(bus3k, 5, 8),
      // after silence(0) is fully open again the level matches the baseline
      restoredRatio: rms(silenced, 8, 9) / rms(baseline, 8, 9),
    };
  });

  console.log(`silence() click test: ${JSON.stringify(r)}`);
  test.info().annotations.push({ type: "silence-click", description: JSON.stringify(r) });
  const limit = r.baselineMaxDelta * 1.02;
  expect(r.silencedMaxDelta).toBeLessThanOrEqual(limit);
  expect(r.retargetMaxDelta).toBeLessThanOrEqual(limit);
  expect(r.abruptMaxDelta).toBeGreaterThan(r.baselineMaxDelta * 3); // the control is sensitive: an abrupt step is caught
  expect(r.directRmsSilenced).toBeGreaterThan(r.busRmsSilenced * 20);
  expect(r.restoredRatio).toBeGreaterThan(0.98);
  expect(r.restoredRatio).toBeLessThan(1.02);
});

/** P3.4 smoke: every prologue SFX and the whole music arc run with 0 console errors/warnings and 0 audio errors. */
test("audio-test: every prologue SFX and the music arc run with 0 errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/?scene=audio-test&biome=prologue&state=battle");
  await page.waitForFunction(() => !!window.__audioTest);
  await page.keyboard.press("a");
  await page.waitForFunction(() => window.__audioTest?.engine.context?.state === "running");
  expect(await page.evaluate(() => window.__audioTest?.engine.getBiome())).toBe("prologue");

  // Heroic theme for a few bars, then the arc: drone -> swell -> silence(1) -> silence(.75) -> motifs -> open.
  await page.waitForTimeout(2500);
  for (const name of [
    "drone (theft)",
    "swell",
    "silence(1) 1.2 s",
    "silence(0.75) 2 s",
    "spark motif",
    "spark motif (end)",
    "silence(0) open",
    "prologue theme (heroic, battle)",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(700);
  }
  // Every Prologue sound button, then all of them again back-to-back.
  const pressed = await page.evaluate(() => window.__audioTest?.pressAllPrologue() ?? 0);
  expect(pressed).toBeGreaterThanOrEqual(30);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__audioTest?.pressAllPrologue());
  await page.waitForTimeout(1500);
  await page.keyboard.press("8"); // biome key

  const hook = await page.evaluate(() => ({
    errors: window.__audioTest?.errors ?? [],
    state: window.__audioTest?.engine.context?.state,
  }));
  expect(hook.errors).toEqual([]);
  expect(hook.state).toBe("running");
  expect(errors).toEqual([]);
});

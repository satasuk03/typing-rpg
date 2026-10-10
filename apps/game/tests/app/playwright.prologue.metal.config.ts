import { defineConfig } from "@playwright/test";

/**
 * Real-GPU (Apple Metal via ANGLE) runs of the prologue integration specs (P3.6): `prologueStills.metal.ts` (the 16 plan §6
 * keyframes + the boss-segment timing) and `prologueFullRun.metal.ts` (fresh profile -> A -> B -> C -> story -> calibrate -> L1,
 * 0 console errors). Not `*.spec.ts`, so the default (SwiftShader) config and check.sh never pick them up. From apps/game:
 *   APP_PORT=5461 ./node_modules/.bin/playwright test -c tests/app/playwright.prologue.metal.config.ts [stills|fullRun]
 */
const PORT = Number(process.env.APP_PORT ?? 5461);

export default defineConfig({
  testDir: ".",
  testMatch: /prologue.*\.metal\.ts/,
  workers: 1,
  timeout: 15 * 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    channel: "chromium",
    launchOptions: {
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
      ],
    },
  },
  projects: [{ name: "chromium-metal" }],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: "../..",
  },
});

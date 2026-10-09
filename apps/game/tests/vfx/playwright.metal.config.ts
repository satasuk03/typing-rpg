import { defineConfig } from "@playwright/test";

/**
 * Real-GPU (Metal) captures for the T6.3 world polish. Run from apps/game with a unique port:
 *   PW_PORT=5291 pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts <file filter>
 * Runs the `*.metal.ts` captures (stills, real skill cast: deliberately NOT `.spec.ts`, so the default config skips them)
 * and the hero silhouette specs.
 * Chromium channel "chromium" with ANGLE-on-Metal, so frame times and bloom match a real desktop.
 */
const PORT = Number(process.env.PW_PORT ?? 5291);

export default defineConfig({
  testDir: ".",
  testMatch: /(\.metal|heroSilhouette.*\.spec)\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 720 } },
  projects: [
    {
      name: "chromium-metal",
      use: {
        channel: "chromium",
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: [
            "--use-angle=metal",
            "--enable-gpu",
            "--ignore-gpu-blocklist",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: "../..",
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Level runner browser tests (T3.1). Run from apps/game:
 *   pnpm exec playwright test -c tests/level/playwright.config.ts
 * Real-time: the browser bot plays whole levels at its WPM, so runs take minutes. Headless WebGL2 runs on
 * ANGLE/SwiftShader (software GL): frame times are indicative only.
 */
const PORT = Number(process.env.LEVEL_PORT ?? 5183);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 720 } },
  projects: [
    {
      name: "chromium-swiftshader",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--enable-webgl",
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

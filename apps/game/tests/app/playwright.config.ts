import { defineConfig, devices } from "@playwright/test";

/**
 * App screens browser tests (T3.2). Run from apps/game:
 *   pnpm exec playwright test -c tests/app/playwright.config.ts
 * `chapter.spec.ts` plays all of Chapter 1 with the browser bot (real time, so it takes a long while); the others are
 * fast. Headless WebGL2 runs on ANGLE/SwiftShader (software GL), so frame times are indicative only.
 */
const PORT = Number(process.env.APP_PORT ?? 5191);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
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

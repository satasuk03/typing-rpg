import { defineConfig, devices } from "@playwright/test";

/**
 * Render comparison specs. Run from apps/game:
 *   pnpm exec playwright test -c tests/render/playwright.config.ts
 * Headless WebGL2 runs on ANGLE/SwiftShader (software GL), so frame times are only indicative.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  reporter: "list",
  use: { baseURL: "http://localhost:5173" },
  projects: [
    {
      name: "chromium-swiftshader",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--enable-webgl",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
    cwd: "../..",
  },
});

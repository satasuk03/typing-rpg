import { defineConfig, devices } from "@playwright/test";

/**
 * T2.3 combat VFX stills in the REAL level runner (`?scene=play&demo=1`). Run from apps/game:
 *   pnpm exec playwright test -c tests/vfx/playwright.combat.config.ts
 * Headless WebGL2 runs on ANGLE/SwiftShader: frame times are indicative only, which is why the captures freeze the
 * world on the stage clock (frame-rate independent) instead of racing the wall clock.
 */
const PORT = Number(process.env.PW_PORT ?? 5183);

export default defineConfig({
  testDir: ".",
  testMatch: /combat-fx\.spec\.ts/,
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

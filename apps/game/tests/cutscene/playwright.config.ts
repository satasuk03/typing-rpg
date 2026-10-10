import { defineConfig } from "@playwright/test";

/**
 * P3.1 cutscene engine on a REAL GPU (Apple Metal via ANGLE). Run from apps/game:
 *   CUTSCENE_PORT=5409 pnpm exec playwright test -c tests/cutscene/playwright.config.ts
 */
const PORT = Number(process.env.CUTSCENE_PORT ?? 5409);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    channel: "chromium",
    launchOptions: {
      args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    },
  },
  projects: [{ name: "chromium-metal" }],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    cwd: "../..",
  },
});

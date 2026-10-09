import { defineConfig } from "@playwright/test";

/**
 * T6.3 level-polish captures + stats on the REAL GPU (Apple Metal via ANGLE). Run from apps/game:
 *   POLISH_PHASE=before|after pnpm exec playwright test -c tests/render/polish.config.ts
 */
const PORT = Number(process.env.POLISH_PORT ?? 5377);

export default defineConfig({
  testDir: ".",
  testMatch: /(polish|levels)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    channel: "chromium",
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
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

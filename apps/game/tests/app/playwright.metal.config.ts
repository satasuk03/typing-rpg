import { defineConfig } from "@playwright/test";

/** Real-GPU (Metal) run of the menu-backdrop stills spec. Run from apps/game with APP_PORT set:
 *  ./node_modules/.bin/playwright test -c tests/app/playwright.metal.config.ts */
const PORT = Number(process.env.APP_PORT ?? 5192);

export default defineConfig({
  testDir: ".",
  testMatch: /menuBackdrop\.spec\.ts/,
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    channel: "chromium",
    launchOptions: {
      args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
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

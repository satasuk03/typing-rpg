import { defineConfig } from "@playwright/test";

/**
 * Real-GPU (Metal) captures for the P3.3 prologue HUD stills and the per-frame cost. Run from apps/game with a unique port:
 *   PW_PORT=5448 ./node_modules/.bin/playwright test -c tests/hud/prologue.metal.config.ts
 * Runs `tests/hud/prologueHud.metal.ts` only (deliberately NOT `.spec.ts`, so the default configs skip it).
 */
const PORT = Number(process.env.PW_PORT ?? 5448);

export default defineConfig({
  testDir: ".",
  testMatch: /prologueHud\.metal\.ts$/,
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

import { defineConfig } from "@playwright/test";

/**
 * T6.4 perf and robustness on a REAL GPU (Apple Metal via ANGLE). Run from apps/game:
 *   pnpm exec playwright test -c tests/perf/playwright.config.ts [frame-budget|soak|context-loss|full-run]
 * Env: PERF_PORT (default 5291), PERF_HEADED=1 (headed window instead of new headless),
 *      PERF_DPR (1 or 2, default 1), PERF_UNCAPPED=1 (vsync off), SOAK_MINUTES (default 5), SOAK_SAMPLE_S (default 30).
 * Every spec fails if the WebGL renderer string is SwiftShader/llvmpipe (see helpers.ts assertRealGpu).
 */
const PORT = Number(process.env.PERF_PORT ?? 5291);
const DPR = Number(process.env.PERF_DPR ?? 1);
const headed = process.env.PERF_HEADED === "1";
// PERF_UNCAPPED=1 turns vsync off so rAF runs as fast as the GPU allows: frame time becomes the true per-frame cost.
const uncapped =
  process.env.PERF_UNCAPPED === "1" ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [];

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 3_600_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: DPR,
    headless: !headed,
    // New headless gets the real GPU; the legacy headless shell does not.
    channel: headed ? undefined : "chromium",
    launchOptions: {
      args: [
        "--use-angle=metal",
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--enable-precise-memory-info",
        "--js-flags=--expose-gc",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--autoplay-policy=no-user-gesture-required",
        ...uncapped,
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

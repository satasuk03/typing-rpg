import { defineConfig, devices } from "@playwright/test";

// PW_PORT lets parallel worktrees run their own dev server instead of reusing another one's.
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "audio/**/*.spec.ts", "hud/**/*.spec.ts", "vfx/**/*.spec.ts"],
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: port === 5173 ? "pnpm dev" : `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

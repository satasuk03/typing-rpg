// Net-layer e2e: the game dev server + a REAL `wrangler dev` Worker (fresh local D1, migrations applied,
// .dev.vars copied from the example). Own ports (game 5183, API 8793) so it never collides with other suites.
// Run: pnpm --filter game test:net
import { defineConfig, devices } from "@playwright/test";

const API_PORT = Number(process.env.NET_API_PORT ?? 8793);
const GAME_PORT = Number(process.env.NET_GAME_PORT ?? 5183);
const WRANGLER = "../../../../workers/api/node_modules/.bin/wrangler";

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e.spec.ts", "newGame.spec.ts"],
  fullyParallel: true,
  workers: 3,
  timeout: 180_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${GAME_PORT}`, ...devices["Desktop Chrome"] },
  projects: [{ name: "chromium" }],
  webServer: [
    {
      cwd: import.meta.dirname,
      command: [
        "rm -rf .e2e-state",
        "cp -f ../../../../workers/api/.dev.vars.example .dev.vars",
        `${WRANGLER} d1 migrations apply DB --local --config wrangler.e2e.toml --persist-to .e2e-state`,
        `exec ${WRANGLER} dev --config wrangler.e2e.toml --local --port ${API_PORT} --var ALLOWED_ORIGINS:http://localhost:${GAME_PORT} --persist-to .e2e-state`,
      ].join(" && "),
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      cwd: `${import.meta.dirname}/../..`,
      command: `pnpm exec vite --port ${GAME_PORT} --strictPort`,
      url: `http://localhost:${GAME_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/game",
      "packages/sim",
      "packages/content",
      "packages/shared",
      "workers/api",
      "tools/*",
    ],
  },
});

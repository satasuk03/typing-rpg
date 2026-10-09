import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "game",
    include: [
      "src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "tests/app/**/*.test.ts",
      "tests/audio/**/*.test.ts",
      "tests/hud/**/*.test.ts",
      "tests/level/**/*.test.ts",
      "tests/net/**/*.test.ts",
    ],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "game",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
  },
});

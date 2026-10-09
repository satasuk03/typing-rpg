import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@hd2d/sim",
    // *.spec.ts files are Playwright (pnpm --filter @hd2d/sim test:parity), not vitest.
    include: ["tests/**/*.test.ts", "node-tests/**/*.test.ts"],
  },
});

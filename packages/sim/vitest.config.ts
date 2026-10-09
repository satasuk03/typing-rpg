import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@hd2d/sim",
    // *.spec.ts files are Playwright (pnpm --filter @hd2d/sim test:parity), not vitest.
    // Property / statistical / bot tests are CPU-heavy (the property test alone takes ~20 s) and scripts/check.sh runs all
    // projects in parallel, so the 5 s default flakes under load.
    testTimeout: 120_000,
    include: ["tests/**/*.test.ts", "node-tests/**/*.test.ts"],
  },
});

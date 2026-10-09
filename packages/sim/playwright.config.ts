import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./node-tests",
  testMatch: "**/*.spec.ts",
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

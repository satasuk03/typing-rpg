import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the game under /<repo>/ (set by .github/workflows/deploy-pages.yml); "/" everywhere else.
  base: process.env.BASE_PATH ?? "/",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});

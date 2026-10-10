// C0.2 scratch: serves docs/vfx/ch2-mock with the game's render core importable from apps/game/src.
//   apps/game/node_modules/.bin/vite --config docs/vfx/ch2-mock/vite.config.mjs --port 5342
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");

export default {
  root: here,
  resolve: { alias: { three: resolve(repo, "apps/game/node_modules/three") } },
  server: { fs: { allow: [repo] }, strictPort: true },
  logLevel: "warn",
};

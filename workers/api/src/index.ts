import { createApp } from "./app.ts";
import { rebuildAllTopCaches } from "./lib/cache.ts";
import type { Env } from "./lib/env.ts";

export { createApp } from "./app.ts";
export type { Env } from "./lib/env.ts";

export const app = createApp();

export default {
  fetch: app.fetch,
  /** Cron (wrangler.toml [triggers], every minute): rebuild the KV top-100 for both scopes. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(rebuildAllTopCaches(env, Date.now()));
  },
};

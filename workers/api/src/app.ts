import { Hono } from "hono";
import { ApiError } from "./lib/errors.ts";
import type { AppEnv, Deps } from "./lib/http.ts";
import { bindingLimiter } from "./lib/ratelimit.ts";
import { authRoutes } from "./routes/auth.ts";
import { lbRoutes } from "./routes/lb.ts";
import { runRoutes } from "./routes/runs.ts";
import { saveRoutes } from "./routes/save.ts";

export type { AppEnv, Deps };

export function createApp(overrides: Partial<Deps> = {}): Hono<AppEnv> {
  const deps: Deps = { now: () => Date.now(), limiter: bindingLimiter, ...overrides };
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    c.set("user", null);
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/auth", authRoutes);
  app.route("/save", saveRoutes);
  app.route("/runs", runRoutes);
  app.route("/lb", lbRoutes);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "no such route" } }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(err.body(), err.status as 400);
    }
    console.error("unhandled", err);
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });
  return app;
}

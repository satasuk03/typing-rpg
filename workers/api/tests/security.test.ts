// API security-review fixes: H1 (shadow-flag oracle), M1-M3, L1-L8.
import { LbTrialResponse, RunSubmitResponse } from "@hd2d/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createApp } from "../src/app.ts";
import { JWT_AUDIENCE, signJwt } from "../src/lib/crypto.ts";
import type { Env } from "../src/lib/env.ts";
import { memoryLimiter } from "../src/lib/ratelimit.ts";
import { createTestEnv, TEST_SECRETS } from "./helpers.ts";
import {
  buildSubmission,
  type Clock,
  constantKeys,
  humanKeys,
  type J,
  jitterKeys,
  makeClient,
  newDeviceSecret,
  passageOf,
  signup,
  startRun,
  submit,
} from "./kit.ts";

let env: Env;
let dispose: () => Promise<void>;
const clock: Clock = { t: 1_900_000_000_000 };
let api: ReturnType<typeof makeClient>;

beforeAll(async () => {
  ({ env, dispose } = await createTestEnv());
  api = makeClient(env, clock);
});
afterAll(async () => {
  await dispose();
});

const count = async (sql: string, ...b: unknown[]): Promise<number> =>
  (
    await env.DB.prepare(sql)
      .bind(...b)
      .first<{ n: number }>()
  )?.n ?? -1;

type User = Awaited<ReturnType<typeof signup>>;
async function play(u: User, entries: (t: Awaited<ReturnType<typeof startRun>>) => J) {
  const t = await startRun(api, u.token);
  const sub = await buildSubmission(t, entries(t));
  clock.t = t.issuedAt + 62_000;
  return { t, r: await submit(api, u.token, sub) };
}

describe("H1: the shadow flag is not an oracle", () => {
  test("flagged and ok submissions with the same score get identical pb/rank/shape", async () => {
    const a = await signup(api); // will be flagged (constant IKIs, 300 perfect keys = 60.00 WPM)
    const b = await signup(api); // clean jittered run, same 300 perfect keys = same score
    const flagged = await play(a, (t) => constantKeys(passageOf(t), 150, 300));
    const ok = await play(b, (t) => jitterKeys(passageOf(t), 300, 7));
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='flagged'", flagged.t.runId),
    ).toBe(1);
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='accepted'", ok.t.runId),
    ).toBe(1);
    expect(flagged.r.status).toBe(200);
    expect(ok.r.status).toBe(200);
    // same keys, same types, same values (except runId)
    expect(Object.keys(flagged.r.body)).toEqual(Object.keys(ok.r.body));
    const strip = ({ runId: _r, ...rest }: J) => rest;
    expect(strip(flagged.r.body)).toEqual(strip(ok.r.body));
    expect(ok.r.body.pb).toBe(true);
    expect(ok.r.body.rank).toBeGreaterThanOrEqual(1);
    RunSubmitResponse.parse(flagged.r.body);
    RunSubmitResponse.parse(ok.r.body);
  });

  test("a flagged run that beats the PB reports pb:true and a rank, exactly like an ok one would", async () => {
    const u = await signup(api);
    const first = await play(u, (t) => jitterKeys(passageOf(t), 200, 11)); // ok, 40 WPM
    expect(first.r.raw).toContain("accepted");
    expect(first.r.body.pb).toBe(true);
    const better = await play(u, (t) => constantKeys(passageOf(t), 100, 500)); // flagged, 100 WPM
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='flagged'", better.t.runId),
    ).toBe(1);
    expect(better.r.body.pb).toBe(true); // previously false: the oracle
    expect(better.r.body.rank).toBeGreaterThanOrEqual(1);
    // a later worse ok run is not a PB (the shadow best still counts) and ranks the shadow best
    const worse = await play(u, (t) => jitterKeys(passageOf(t), 250, 12));
    expect(worse.r.body.pb).toBe(false);
    expect(worse.r.body.rank).toBe(better.r.body.rank);
    // an ok run that beats the shadow best is a PB and updates the public row
    const best = await play(u, (t) => jitterKeys(passageOf(t), 700, 13, 40, 80));
    expect(best.r.body.pb).toBe(true);
  });

  test("owner sees the flagged entry in top at its predicted rank; nobody else does", async () => {
    const owner = await signup(api);
    const other = await signup(api);
    const { r } = await play(owner, (t) => constantKeys(passageOf(t), 60, 900)); // 180 WPM flagged
    const pid = (
      await env.DB.prepare("SELECT public_id p FROM users WHERE id=?1")
        .bind(owner.userId)
        .first<J>()
    )?.p;
    const mine = await api("GET", "/lb/trial?scope=season&around=me", { token: owner.token });
    const parsed = LbTrialResponse.parse(mine.body);
    const row = parsed.top.find((e) => e.publicId === pid);
    expect(row?.isMe).toBe(true);
    expect(row?.rank).toBe(r.body.rank);
    expect(parsed.me?.rank).toBe(r.body.rank);
    expect(parsed.around?.some((e) => e.publicId === pid && e.isMe)).toBe(true);
    // ranks in the merged top list stay a contiguous 1..n
    expect(parsed.top.map((e) => e.rank)).toEqual(parsed.top.map((_, i) => i + 1));
    const theirs = await api("GET", "/lb/trial?scope=season&around=me", { token: other.token });
    expect(theirs.body.top.some((e: J) => e.publicId === pid)).toBe(false);
    expect(
      (await api("GET", "/lb/trial?scope=all")).body.top.some((e: J) => e.publicId === pid),
    ).toBe(false);
  });
});

describe("M1: fixed per-user passage sequence", () => {
  test("abandoning does not reroll; submitting advances; users differ; abandon_rate flag", async () => {
    const u = await signup(api);
    const t1 = await startRun(api, u.token);
    const t2 = await startRun(api, u.token); // abandons t1
    const t3 = await startRun(api, u.token);
    expect(t2.seed).toBe(t1.seed);
    expect(t3.seed).toBe(t1.seed);
    const sub = await buildSubmission(t3, jitterKeys(passageOf(t3), 100, 5));
    clock.t = t3.issuedAt + 62_000;
    expect((await submit(api, u.token, sub)).status).toBe(200);
    const t4 = await startRun(api, u.token);
    expect(t4.seed).not.toBe(t1.seed); // n advanced after a submitted run
    const other = await signup(api);
    expect((await startRun(api, other.token)).seed).not.toBe(t1.seed);
    // farm: start/abandon repeatedly -> a single abandon_rate review flag, same passage every time
    const seeds = new Set<number>();
    for (let i = 0; i < 12; i++) seeds.add((await startRun(api, u.token)).seed);
    expect(seeds.size).toBe(1);
    expect(
      await count(
        "SELECT COUNT(*) n FROM flags WHERE user_id=?1 AND reason_code='abandon_rate' AND severity='review'",
        u.userId,
      ),
    ).toBe(1);
  });
});

describe("M2/L8: CORS allowlist and response headers", () => {
  const corsEnv = (): Env => ({ ...env, ALLOWED_ORIGINS: "http://localhost:5173" });
  const app = createApp({ now: () => clock.t });
  const pre = (origin: string, path = "/runs/submit") =>
    app.request(
      path,
      {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,content-type,idempotency-key,if-match",
        },
      },
      corsEnv(),
    );

  test("preflight from an allowed origin", async () => {
    const r = await pre("http://localhost:5173");
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const allow = (r.headers.get("Access-Control-Allow-Headers") ?? "").toLowerCase();
    for (const h of ["authorization", "content-type", "if-match", "idempotency-key"]) {
      expect(allow).toContain(h);
    }
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("an origin that is not on the list gets no CORS headers (never reflected, never *)", async () => {
    for (const origin of ["https://evil.example", "http://localhost:5174", "null"]) {
      const r = await pre(origin);
      expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    const get = await app.request(
      "/health",
      { headers: { Origin: "https://evil.example" } },
      corsEnv(),
    );
    expect(get.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // no allowlist configured at all -> nobody is allowed
    const none = await app.request(
      "/health",
      { headers: { Origin: "http://localhost:5173" } },
      { ...env, ALLOWED_ORIGINS: "*" },
    );
    expect(none.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("actual responses expose ETag / Idempotent-Replay; nosniff everywhere; no-store on /auth and /save", async () => {
    const r = await app.request(
      "/health",
      { headers: { Origin: "http://localhost:5173" } },
      corsEnv(),
    );
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const expose = (r.headers.get("Access-Control-Expose-Headers") ?? "").toLowerCase();
    expect(expose).toContain("etag");
    expect(expose).toContain("idempotent-replay");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const u = await signup(api);
    const anon = await api("POST", "/auth/anon", {
      body: { deviceId: crypto.randomUUID(), deviceSecret: newDeviceSecret() },
    });
    expect(anon.headers.get("Cache-Control")).toBe("no-store");
    expect(anon.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const save = await api("GET", "/save", { token: u.token });
    expect(save.headers.get("Cache-Control")).toBe("no-store");
    const err = await api("GET", "/nope");
    expect(err.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("M3: rate limiting fails closed", () => {
  test("missing binding -> 500 unless RATE_LIMIT_DISABLED=1", async () => {
    const app = createApp({ now: () => clock.t }); // the real bindingLimiter
    const body = JSON.stringify({ deviceId: crypto.randomUUID(), deviceSecret: newDeviceSecret() });
    const headers = { "content-type": "application/json" };
    const closed = await app.request("/auth/anon", { method: "POST", headers, body }, env);
    expect(closed.status).toBe(500);
    const open = await app.request(
      "/auth/anon",
      { method: "POST", headers, body },
      { ...env, RATE_LIMIT_DISABLED: "1" },
    );
    expect(open.status).toBe(200);
    // a present binding is honoured
    let calls = 0;
    const bound = {
      limit: async () => {
        calls++;
        return { success: calls < 2 };
      },
    };
    const e2 = { ...env, RL_AUTH: bound };
    expect((await app.request("/auth/anon", { method: "POST", headers, body }, e2)).status).toBe(
      200,
    );
    expect((await app.request("/auth/anon", { method: "POST", headers, body }, e2)).status).toBe(
      429,
    );
  });
});

describe("L1: body size is enforced before reading", () => {
  test("oversize Content-Length -> 413 without reading the body", async () => {
    const app = createApp({ now: () => clock.t, limiter: memoryLimiter({}) });
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        pulls++;
        ctrl.enqueue(new TextEncoder().encode("{}"));
        ctrl.close();
      },
    });
    const res = await app.request(
      "/auth/anon",
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "10000000" },
        body: stream,
        // @ts-expect-error node/undici requires duplex for stream bodies
        duplex: "half",
      },
      env,
    );
    expect(res.status).toBe(413);
    expect(pulls).toBeLessThanOrEqual(1); // at most the runtime's eager first pull; the handler never drains it
  });

  test("a chunked body without Content-Length is cut off at the cap", async () => {
    const app = createApp({ now: () => clock.t, limiter: memoryLimiter({}) });
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        sent++;
        ctrl.enqueue(new Uint8Array(1024).fill(32));
        if (sent > 200) ctrl.close();
      },
    });
    const res = await app.request(
      "/auth/anon",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: stream,
        // @ts-expect-error node/undici requires duplex for stream bodies
        duplex: "half",
      },
      env,
    );
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(50);
  });
});

describe("L2: leaderboard reads", () => {
  test("IP rate limit on /lb/trial; a KV miss serves live D1 without writing KV", async () => {
    const limited = makeClient(
      env,
      clock,
      memoryLimiter({ lb: 2 }, 60_000, () => clock.t),
    );
    const s = [];
    for (let i = 0; i < 3; i++) s.push((await limited("GET", "/lb/trial")).status);
    expect(s).toEqual([200, 200, 429]);
    await env.LB_CACHE.delete("lb:trial_wpm:S1");
    const r = await api("GET", "/lb/trial?scope=season");
    expect(r.status).toBe(200);
    expect(await env.LB_CACHE.get("lb:trial_wpm:S1")).toBeNull();
  });
});

describe("L3: secrets are validated", () => {
  const body = () =>
    JSON.stringify({ deviceId: crypto.randomUUID(), deviceSecret: newDeviceSecret() });
  const hit = (e: Partial<Env>) =>
    createApp({ now: () => clock.t, limiter: memoryLimiter({}) }).request(
      "/auth/anon",
      { method: "POST", headers: { "content-type": "application/json" }, body: body() },
      { ...env, ...e },
    );
  test("short, identical, or dev-only secrets are refused (500); dev-only is fine with ENV=local", async () => {
    expect((await hit({})).status).toBe(200);
    expect((await hit({ JWT_SECRET: "too-short" })).status).toBe(500);
    expect((await hit({ TICKET_SECRET: undefined })).status).toBe(500);
    expect((await hit({ TICKET_SECRET: TEST_SECRETS.JWT_SECRET })).status).toBe(500);
    const dev = {
      JWT_SECRET: "dev-only-jwt-secret-change-me-0123456789abcdef",
      TICKET_SECRET: "dev-only-ticket-secret-change-me-0123456789abcdef",
    };
    expect((await hit(dev)).status).toBe(500);
    expect((await hit({ ...dev, ENV: "production" })).status).toBe(500);
    expect((await hit({ ...dev, ENV: "local" })).status).toBe(200);
  });
});

describe("L4: JWT audience", () => {
  test("a correctly signed token with the wrong or missing aud is rejected", async () => {
    const u = await signup(api);
    const now = Math.floor(clock.t / 1000);
    const claims = { sub: u.userId, ageBand: "unknown", region: null, iat: now, exp: now + 600 };
    const good = await signJwt(TEST_SECRETS.JWT_SECRET, { ...claims, aud: JWT_AUDIENCE });
    expect((await api("GET", "/save", { token: good })).status).toBe(404); // authenticated, no save yet
    const wrong = await signJwt(TEST_SECRETS.JWT_SECRET, { ...claims, aud: "someone-else" });
    expect((await api("GET", "/save", { token: wrong })).body.error.code).toBe("unauthorized");
    const missing = await signJwt(TEST_SECRETS.JWT_SECRET, claims as never);
    expect((await api("GET", "/save", { token: missing })).body.error.code).toBe("unauthorized");
  });
});

describe("L5: refresh grace window", () => {
  test("same parent within 10 s returns the SAME child; after 10 s it is reuse and revokes the family", async () => {
    const u = await signup(api);
    const t0 = clock.t;
    const a = await api("POST", "/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(a.status).toBe(200);
    // lost response: the client retries the same parent 3 s later
    clock.t = t0 + 3000;
    const retry = await api("POST", "/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(retry.status).toBe(200);
    expect(retry.body.refreshToken).toBe(a.body.refreshToken);
    expect(
      await count(
        "SELECT COUNT(*) n FROM refresh_tokens WHERE user_id=?1 AND revoked_at IS NOT NULL",
        u.userId,
      ),
    ).toBe(0);
    // the shared child still works, and rotates normally
    clock.t = t0 + 4000;
    const next = await api("POST", "/auth/refresh", {
      body: { refreshToken: a.body.refreshToken },
    });
    expect(next.status).toBe(200);
    // outside the window: the original parent is stale -> reuse -> family revoked (even the newest token)
    clock.t = t0 + 20_000;
    const stale = await api("POST", "/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe("refresh_reused");
    const dead = await api("POST", "/auth/refresh", {
      body: { refreshToken: next.body.refreshToken },
    });
    expect(dead.status).toBe(401);
  });

  test("inside the window but the child was already used -> treated as reuse (family revoked)", async () => {
    const u = await signup(api);
    const t0 = clock.t;
    const a = await api("POST", "/auth/refresh", { body: { refreshToken: u.refresh } });
    const used = await api("POST", "/auth/refresh", {
      body: { refreshToken: a.body.refreshToken },
    });
    expect(used.status).toBe(200);
    clock.t = t0 + 2000;
    const replay = await api("POST", "/auth/refresh", { body: { refreshToken: u.refresh } });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("refresh_reused");
    const dead = await api("POST", "/auth/refresh", {
      body: { refreshToken: used.body.refreshToken },
    });
    expect(dead.status).toBe(401);
    clock.t = t0 + 60_000;
  });
});

describe("L7: the period is fixed when the ticket is issued", () => {
  test("a run started in S1 is credited to S1 even if the season rolls over before submit", async () => {
    const s1 = makeClient({ ...env, SEASON_KEY: "S1" }, clock);
    const s2 = makeClient({ ...env, SEASON_KEY: "S2" }, clock);
    const u = await signup(s1);
    const t = await startRun(s1, u.token);
    expect(
      (await env.DB.prepare("SELECT period_key p FROM runs WHERE id=?1").bind(t.runId).first<J>())
        ?.p,
    ).toBe("S1");
    const sub = await buildSubmission(t, humanKeys(passageOf(t), 77));
    clock.t = t.issuedAt + 62_000;
    const r = await submit(s2, u.token, sub); // the Worker now believes it is season S2
    expect(r.status).toBe(200);
    const periods = (
      await env.DB.prepare(
        "SELECT period_key p FROM leaderboard_entries WHERE user_id=?1 ORDER BY p",
      )
        .bind(u.userId)
        .all<J>()
    ).results.map((x) => x.p);
    expect(periods).toEqual(["S1", "all"]);
  });
});

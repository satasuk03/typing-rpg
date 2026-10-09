// T5.2 integration tests: the Hono app against a real local D1 + KV (wrangler getPlatformProxy), real sim re-sim.
import { msToTick, SIM_VERSION } from "@hd2d/sim";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { rebuildAllTopCaches } from "../src/lib/cache.ts";
import type { Env } from "../src/lib/env.ts";
import { memoryLimiter } from "../src/lib/ratelimit.ts";
import { createTestEnv } from "./helpers.ts";
import {
  buildSubmission,
  type Clock,
  constantKeys,
  deflateRawB64,
  humanKeys,
  type J,
  makeClient,
  newDeviceSecret,
  passageOf,
  signup,
  startRun,
  submit,
} from "./kit.ts";

let env: Env;
let dispose: () => Promise<void>;
const clock: Clock = { t: 1_800_000_000_000 };
let api: ReturnType<typeof makeClient>;

beforeAll(async () => {
  ({ env, dispose } = await createTestEnv());
  api = makeClient(env, clock);
});
afterAll(async () => {
  await dispose();
});

const dbOf = () => env.DB;
const count = async (sql: string, ...b: unknown[]): Promise<number> =>
  (
    await dbOf()
      .prepare(sql)
      .bind(...b)
      .first<{ n: number }>()
  )?.n ?? -1;

/** start -> type for ~60 s -> wait past the Trial duration. */
async function legitRun(seed = 1, wpm = 60) {
  const u = await signup(api);
  const t = await startRun(api, u.token);
  const entries = humanKeys(passageOf(t), seed, wpm);
  const sub = await buildSubmission(t, entries);
  clock.t = t.issuedAt + 62_000;
  return { u, t, sub, entries };
}

describe("health", () => {
  test("GET /health", async () => {
    expect((await api("GET", "/health")).body).toEqual({ ok: true });
  });
});

describe("auth", () => {
  test("anon -> refresh rotation -> reuse of an old refresh token revokes the family", async () => {
    const device = crypto.randomUUID();
    const deviceSecret = newDeviceSecret();
    const a = await api("POST", "/auth/anon", { body: { deviceId: device, deviceSecret } });
    expect(a.status).toBe(200);
    expect(a.body.accessExpiresAt - clock.t).toBe(15 * 60_000);
    // same device + matching secret -> same account (legit re-login)
    const again = await api("POST", "/auth/anon", { body: { deviceId: device, deviceSecret } });
    expect(again.status).toBe(200);
    expect(again.body.userId).toBe(a.body.userId);

    const r1 = await api("POST", "/auth/refresh", { body: { refreshToken: a.body.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(a.body.refreshToken);
    // the rotated token works against an authenticated route
    expect((await api("GET", "/save", { token: r1.body.accessToken })).status).toBe(404);

    const r2 = await api("POST", "/auth/refresh", { body: { refreshToken: r1.body.refreshToken } });
    expect(r2.status).toBe(200);

    // present the FIRST (already rotated) token again -> reuse detected
    const reuse = await api("POST", "/auth/refresh", {
      body: { refreshToken: a.body.refreshToken },
    });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("refresh_reused");
    // the whole family is dead, including the newest token
    const dead = await api("POST", "/auth/refresh", {
      body: { refreshToken: r2.body.refreshToken },
    });
    expect(dead.status).toBe(401);
    expect(dead.body.error.code).toBe("refresh_reused");
    // a device re-login starts a fresh family
    const fresh = await api("POST", "/auth/anon", { body: { deviceId: device, deviceSecret } });
    expect(fresh.status).toBe(200);
  });

  test("SECURITY: a known deviceId is not a credential (wrong/missing secret -> 401, no tokens)", async () => {
    const device = crypto.randomUUID();
    const deviceSecret = newDeviceSecret();
    const owner = await api("POST", "/auth/anon", { body: { deviceId: device, deviceSecret } });
    expect(owner.status).toBe(200);
    // only sha256(secret) is stored, never the secret
    const row = await dbOf()
      .prepare("SELECT device_secret_hash h FROM devices WHERE device_id=?1")
      .bind(device)
      .first<J>();
    expect(row.h).toMatch(/^[0-9a-f]{64}$/);
    expect(row.h).not.toBe(deviceSecret);
    const attempts: unknown[] = [
      { deviceId: device, deviceSecret: newDeviceSecret() }, // wrong secret
      { deviceId: device }, // missing secret
      { deviceId: device, deviceSecret: "short" }, // malformed secret
      { deviceId: device, deviceSecret: "" },
    ];
    for (const body of attempts) {
      const r = await api("POST", "/auth/anon", { body });
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("unauthorized");
      expect(r.body.accessToken).toBeUndefined();
      expect(r.body.refreshToken).toBeUndefined();
    }
    // the attacker created nothing; the owner is unaffected
    expect(await count("SELECT COUNT(*) n FROM users WHERE id=?1", owner.body.userId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM devices WHERE device_id=?1", device)).toBe(1);
    // a pre-0006 device (no stored hash) can never be taken over via /auth/anon either
    const legacy = crypto.randomUUID();
    await dbOf()
      .prepare(
        "INSERT INTO devices (device_id, user_id, created_at, last_seen_at) VALUES (?1, ?2, 1, 1)",
      )
      .bind(legacy, owner.body.userId)
      .run();
    const l = await api("POST", "/auth/anon", {
      body: { deviceId: legacy, deviceSecret: newDeviceSecret() },
    });
    expect(l.status).toBe(401);
    // the legit client still gets in
    const ok = await api("POST", "/auth/anon", { body: { deviceId: device, deviceSecret } });
    expect(ok.status).toBe(200);
    expect(ok.body.userId).toBe(owner.body.userId);
  });

  test("unknown refresh token, bad body, missing/expired/garbage access token", async () => {
    const bad = await api("POST", "/auth/refresh", { body: { refreshToken: "x".repeat(43) } });
    expect(bad.body.error.code).toBe("refresh_invalid");
    expect(
      (
        await api("POST", "/auth/anon", {
          body: { deviceId: "nope", deviceSecret: newDeviceSecret() },
        })
      ).body.error.code,
    ).toBe("bad_request");
    expect((await api("GET", "/save")).body.error.code).toBe("unauthorized");
    expect((await api("GET", "/save", { token: "a.b.c" })).body.error.code).toBe("unauthorized");
    const u = await signup(api);
    const saved = clock.t;
    clock.t += 16 * 60_000;
    expect((await api("GET", "/save", { token: u.token })).body.error.code).toBe("token_expired");
    clock.t = saved;
  });

  test("rate limiting is behind an interface (anon 5/min/IP)", async () => {
    const limited = makeClient(
      env,
      clock,
      memoryLimiter({ auth: 2 }, 60_000, () => clock.t),
    );
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push(
        (
          await limited("POST", "/auth/anon", {
            body: { deviceId: crypto.randomUUID(), deviceSecret: newDeviceSecret() },
          })
        ).status,
      );
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe("save", () => {
  const summary = { schemaVersion: 1, levelMax: 1, stars: 2, playtimeSec: 30 };
  test("GET empty -> PUT rev 1 -> stale If-Match gets 409 with the server copy", async () => {
    const u = await signup(api);
    expect((await api("GET", "/save", { token: u.token })).status).toBe(404);
    expect(
      (await api("PUT", "/save", { token: u.token, body: { blob: "AAAA", summary } })).body.error
        .code,
    ).toBe("precondition_required");
    const p1 = await api("PUT", "/save", {
      token: u.token,
      body: { blob: "aGVsbG8=", summary },
      headers: { "If-Match": '"0"' },
    });
    expect(p1.status).toBe(200);
    expect(p1.body.revision).toBe(1);
    const g = await api("GET", "/save", { token: u.token });
    expect(g.status).toBe(200);
    expect(g.headers.get("ETag")).toBe('"1"');
    expect(g.body.blob).toBe("aGVsbG8=");
    expect(g.body.summary).toEqual(summary);

    const p2 = await api("PUT", "/save", {
      token: u.token,
      body: { blob: "d29ybGQ=", summary },
      headers: { "If-Match": '"1"' },
    });
    expect(p2.body.revision).toBe(2);
    // stale writer still believes revision 1
    const stale = await api("PUT", "/save", {
      token: u.token,
      body: { blob: "c3RhbGU=", summary },
      headers: { "If-Match": '"1"' },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("save_conflict");
    expect(stale.body.server.revision).toBe(2);
    expect(stale.body.server.blob).toBe("d29ybGQ=");
    // a create when one exists is also a conflict
    const dupe = await api("PUT", "/save", {
      token: u.token,
      body: { blob: "AAAA", summary },
      headers: { "If-Match": '"0"' },
    });
    expect(dupe.status).toBe(409);
  });

  test("If-Match != 0 when no save exists -> 404 not_found (not a schema-violating 409)", async () => {
    const u = await signup(api);
    const r = await api("PUT", "/save", {
      token: u.token,
      body: { blob: "AAAA", summary },
      headers: { "If-Match": '"3"' },
    });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("not_found");
  });

  test("oversize blob -> 413 payload_too_large; saves are per user", async () => {
    const u = await signup(api);
    const big = "A".repeat(Math.ceil((256 * 1024 * 4) / 3 / 4) * 4 + 4); // decodes to just over 256 KiB
    const r = await api("PUT", "/save", {
      token: u.token,
      body: { blob: big, summary },
      headers: { "If-Match": '"0"' },
    });
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("payload_too_large");
    const other = await signup(api);
    expect((await api("GET", "/save", { token: other.token })).status).toBe(404);
  });
});

describe("runs: start", () => {
  test("signed ticket, one open Trial ticket per user, old one abandoned", async () => {
    const u = await signup(api);
    const t1 = await startRun(api, u.token);
    expect(t1.expiresAt - t1.issuedAt).toBe(600_000);
    expect(t1.simVersion).toBe(SIM_VERSION);
    const t2 = await startRun(api, u.token);
    expect(t2.runId).not.toBe(t1.runId);
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE user_id=?1 AND status='open'", u.userId),
    ).toBe(1);
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='abandoned'", t1.runId),
    ).toBe(1);
    // submitting the abandoned ticket -> 409 run_already_submitted
    const sub = await buildSubmission(t1, humanKeys(passageOf(t1), 3));
    clock.t = t1.issuedAt + 62_000;
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("run_already_submitted");
  });
});

describe("runs: submit", () => {
  test("legit run (~60 WPM, jitter, typos) -> accepted; leaderboard shows it (KV top + around me)", async () => {
    const { u, t, sub } = await legitRun(11);
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("accepted");
    expect(r.body.runId).toBe(t.runId);
    expect(r.body.verified.wpmX100).toBe(sub.claimed.wpmX100);
    expect(r.body.verified.wpmX100).toBeGreaterThan(4500);
    expect(r.body.verified.wpmX100).toBeLessThan(7500);
    expect(r.body.verified.score).toBe(
      r.body.verified.wpmX100 * 10_000 + r.body.verified.accuracyBp,
    );
    expect(r.body.pb).toBe(true);
    expect(r.body.rank).toBeGreaterThanOrEqual(1);
    expect(sub.claimed.typos).toBeGreaterThan(0);

    const row = await dbOf()
      .prepare("SELECT status, verified_wpm_x100 w FROM runs WHERE id=?1")
      .bind(t.runId)
      .first<J>();
    expect(row.status).toBe("accepted");
    expect(row.w).toBe(r.body.verified.wpmX100);

    const lb = await api("GET", "/lb/trial?scope=season&around=me", { token: u.token });
    expect(lb.status).toBe(200);
    expect(lb.body.periodKey).toBe("S1");
    const mine = lb.body.top.find((e: J) => e.userId === u.userId);
    expect(mine.wpmX100).toBe(r.body.verified.wpmX100);
    expect(mine.isMe).toBe(true);
    expect(lb.body.me.rank).toBe(r.body.rank);
    expect(lb.body.around.some((e: J) => e.isMe)).toBe(true);
    // anonymous callers get the top list, no `me`
    const anon = await api("GET", "/lb/trial?scope=all");
    expect(anon.body.me).toBeNull();
    expect(anon.body.top.some((e: J) => e.userId === u.userId)).toBe(true);
    expect((await api("GET", "/lb/trial?around=me")).status).toBe(401);
    expect((await api("GET", "/lb/trial?scope=weird")).status).toBe(400);
  });

  test("FORGED RESULT: altered wpm / accuracy / score claim -> 422 resim_mismatch, nothing written", async () => {
    for (const field of ["wpmX100", "accuracyBp", "correctChars", "finalHash"] as const) {
      const { u, t, sub } = await legitRun(20 + field.length);
      const forged = structuredClone(sub);
      if (field === "finalHash") forged.claimed.finalHash = "deadbeef";
      else if (field === "accuracyBp") forged.claimed.accuracyBp = 10_000;
      else forged.claimed[field] += 1500;
      const r = await submit(api, u.token, forged);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("resim_mismatch");
      expect(r.body.error.details.fields).toContain(field);
      expect(
        await count("SELECT COUNT(*) n FROM leaderboard_entries WHERE user_id=?1", u.userId),
      ).toBe(0);
      expect(await count("SELECT COUNT(*) n FROM run_replays WHERE run_id=?1", t.runId)).toBe(0);
      expect(await count("SELECT COUNT(*) n FROM flags WHERE run_id=?1", t.runId)).toBe(0);
      const row = await dbOf()
        .prepare("SELECT status, error_code, verified_score s FROM runs WHERE id=?1")
        .bind(t.runId)
        .first<J>();
      expect(row.status).toBe("rejected");
      expect(row.error_code).toBe("resim_mismatch");
      expect(row.s).toBeNull(); // claimed numbers are never stored
      // terminal: the ticket is spent. A different log is refused...
      const other = await buildSubmission(t, humanKeys(passageOf(t), 99));
      expect((await submit(api, u.token, other)).body.error.code).toBe("run_already_submitted");
      // ...and the same log (honest claim or not) just replays the stored verdict
      expect((await submit(api, u.token, sub)).raw).toBe(r.raw);
      // ...but resubmitting the SAME forged payload replays the stored 422
      const again = await submit(api, u.token, forged);
      expect(again.status).toBe(422);
      expect(again.body).toEqual(r.body);
    }
  });

  test("FORGED RESULT: log edited after the fact (claim kept) is a mismatch too", async () => {
    const { u, t, sub, entries } = await legitRun(31);
    // same claim, but a log that drops the first 40 keys (the "score" is no longer reproducible)
    const tail = entries.slice(40);
    const t0 = tail[0]?.ms ?? 0;
    const rebased = tail.map((e) => ({
      ms: e.ms - t0,
      input: { ...e.input, tick: msToTick(e.ms - t0) },
    }));
    const edited = await buildSubmission(t, rebased);
    const forged = { ...edited, claimed: sub.claimed };
    const r = await submit(api, u.token, forged);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("resim_mismatch");
  });

  test("FORGED TIMING: every IKI 5 ms (self-consistent claim) -> flagged shadow row, owner-only", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const sub = await buildSubmission(t, constantKeys(passageOf(t), 5));
    clock.t = t.issuedAt + 62_000;
    const r = await submit(api, u.token, sub);
    // re-sim matches, so it is "accepted" on the wire (D28) but shadow-flagged server-side
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("accepted");
    const row = await dbOf()
      .prepare("SELECT status FROM runs WHERE id=?1")
      .bind(t.runId)
      .first<J>();
    expect(row.status).toBe("flagged");
    const lbRow = await dbOf()
      .prepare("SELECT status FROM leaderboard_entries WHERE user_id=?1 AND period_key='S1'")
      .bind(u.userId)
      .first<J>();
    expect(lbRow.status).toBe("flagged");
    const reasons = (
      await dbOf()
        .prepare("SELECT reason_code, severity FROM flags WHERE run_id=?1")
        .bind(t.runId)
        .all<J>()
    ).results;
    expect(reasons.filter((x) => x.severity === "shadow").map((x) => x.reason_code)).toEqual(
      expect.arrayContaining(["iki_cv", "fast_share"]),
    );
    expect(await count("SELECT COUNT(*) n FROM run_replays WHERE run_id=?1", t.runId)).toBe(1); // flagged runs keep their log
    // visible to the owner only
    const owner = await api("GET", "/lb/trial?scope=season&around=me", { token: u.token });
    expect(owner.body.me.userId).toBe(u.userId);
    expect(owner.body.around.some((e: J) => e.userId === u.userId)).toBe(true);
    const other = await signup(api);
    const outsider = await api("GET", "/lb/trial?scope=season&around=me", { token: other.token });
    expect(outsider.body.top.some((e: J) => e.userId === u.userId)).toBe(false);
    expect(outsider.body.around ?? []).toEqual([]);
    const anon = await api("GET", "/lb/trial?scope=all");
    expect(anon.body.top.some((e: J) => e.userId === u.userId)).toBe(false);
  });

  test("FORGED TIMING: perfectly constant IKIs (200 ms) -> flagged (iki_cv)", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const sub = await buildSubmission(t, constantKeys(passageOf(t), 200));
    clock.t = t.issuedAt + 62_000;
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(200);
    const row = await dbOf()
      .prepare("SELECT status FROM runs WHERE id=?1")
      .bind(t.runId)
      .first<J>();
    expect(row.status).toBe("flagged");
    expect(
      await count("SELECT COUNT(*) n FROM flags WHERE run_id=?1 AND reason_code='iki_cv'", t.runId),
    ).toBe(1);
  });

  test("TIMING IMPOSSIBLE: a 60 s log submitted after 10 s, or a 'finished' run submitted too early -> 422", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const sub = await buildSubmission(t, humanKeys(passageOf(t), 41));
    clock.t = t.issuedAt + 10_000; // log claims ~59 s of typing, only 10 s elapsed
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("timing_impossible");
    expect(
      await count("SELECT COUNT(*) n FROM leaderboard_entries WHERE user_id=?1", u.userId),
    ).toBe(0);

    const t2 = await startRun(api, u.token);
    const quick = await buildSubmission(t2, constantKeys(passageOf(t2), 5, 300)); // 1.5 s of typing
    clock.t = t2.issuedAt + 3_000; // a Trial lasts 60 s: cannot be finished after 3 s
    const r2 = await submit(api, u.token, quick);
    expect(r2.status).toBe(422);
    expect(r2.body.error.code).toBe("timing_impossible");
  });

  test("REPLAY: same runId + log -> identical stored response, no double leaderboard write", async () => {
    const { u, t, sub } = await legitRun(51);
    const r1 = await submit(api, u.token, sub);
    expect(r1.status).toBe(200);
    const r2 = await submit(api, u.token, sub);
    expect(r2.status).toBe(200);
    expect(r2.raw).toBe(r1.raw); // byte-identical stored body (pb/rank not recomputed)
    expect(r2.headers.get("Idempotent-Replay")).toBe("true");
    expect(
      await count("SELECT COUNT(*) n FROM leaderboard_entries WHERE user_id=?1", u.userId),
    ).toBe(2); // season + all, once
    expect(
      await count(
        "SELECT COUNT(*) n FROM flags WHERE run_id=?1 AND reason_code='ac_metrics'",
        t.runId,
      ),
    ).toBe(1);
    // a DIFFERENT log for the finished run is not accepted
    const other = await buildSubmission(t, humanKeys(passageOf(t), 52));
    const r3 = await submit(api, u.token, other);
    expect(r3.status).toBe(409);
    expect(r3.body.error.code).toBe("run_already_submitted");
  });

  test("two CONCURRENT identical submits: exactly one wins, one leaderboard write, same response", async () => {
    const { u, t, sub } = await legitRun(61);
    const [a, b] = await Promise.all([submit(api, u.token, sub), submit(api, u.token, sub)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.raw).toBe(b.raw);
    expect(
      await count("SELECT COUNT(*) n FROM leaderboard_entries WHERE user_id=?1", u.userId),
    ).toBe(2);
    expect(
      await count(
        "SELECT COUNT(*) n FROM flags WHERE run_id=?1 AND reason_code='ac_metrics'",
        t.runId,
      ),
    ).toBe(1);
    expect(
      await count("SELECT COUNT(*) n FROM run_replays WHERE run_id=?1", t.runId),
    ).toBeLessThanOrEqual(1);
  });

  test("a better run improves the PB; a worse one does not", async () => {
    const u = await signup(api);
    const play = async (seed: number, wpm: number) => {
      const t = await startRun(api, u.token);
      const sub = await buildSubmission(t, humanKeys(passageOf(t), seed, wpm));
      clock.t = t.issuedAt + 62_000;
      return (await submit(api, u.token, sub)).body;
    };
    const first = await play(71, 50);
    const better = await play(72, 80);
    const worse = await play(73, 40);
    expect(first.pb).toBe(true);
    expect(better.pb).toBe(true);
    expect(better.verified.wpmX100).toBeGreaterThan(first.verified.wpmX100);
    expect(worse.pb).toBe(false);
    const lb = await api("GET", "/lb/trial?scope=all", { token: u.token });
    expect(lb.body.me.wpmX100).toBe(better.verified.wpmX100);
  });

  test("bad ticket signature -> 403 bad_signature (non-terminal: the real sig still works)", async () => {
    const { u, t, sub } = await legitRun(81);
    const bad = await submit(api, u.token, { ...sub, sig: `${sub.sig.slice(0, -2)}AA` });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe("bad_signature");
    expect(await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='open'", t.runId)).toBe(
      1,
    );
    expect((await submit(api, u.token, { ...sub, sig: "!!notb64!!" })).body.error.code).toBe(
      "bad_signature",
    );
    expect((await submit(api, u.token, sub)).status).toBe(200);
  });

  test("someone else's run -> 404 run_not_found; Idempotency-Key mismatch -> 400", async () => {
    const { u, sub } = await legitRun(82);
    const thief = await signup(api);
    expect((await submit(api, thief.token, sub)).body.error.code).toBe("run_not_found");
    const wrongKey = await submit(api, u.token, sub, "something-else");
    expect(wrongKey.status).toBe(400);
    expect((await submit(api, u.token, { ...sub, runId: "nope" }, "nope")).body.error.code).toBe(
      "run_not_found",
    );
  });

  test("expired ticket -> 410 run_expired (terminal, stored)", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const sub = await buildSubmission(t, humanKeys(passageOf(t), 91));
    clock.t = t.expiresAt + 1;
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe("run_expired");
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='expired'", t.runId),
    ).toBe(1);
    expect((await submit(api, u.token, sub)).raw).toBe(r.raw);
  });

  test("wrong sim_version / content_version -> 409 version_mismatch (terminal)", async () => {
    for (const patch of [{ simVersion: SIM_VERSION + 1 }, { contentVersion: "ffffffff" }]) {
      const { u, t, sub } = await legitRun(92);
      const r = await submit(api, u.token, { ...sub, ...patch });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("version_mismatch");
      expect(
        await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='rejected'", t.runId),
      ).toBe(1);
    }
  });

  test("oversize log -> 413 payload_too_large (non-terminal); zip bomb / garbage / bad count -> 422 log_invalid", async () => {
    const { u, t, sub } = await legitRun(93);
    const huge = await submit(api, u.token, { ...sub, log: "A".repeat(43_693) });
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe("payload_too_large");
    expect(await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='open'", t.runId)).toBe(
      1,
    );

    const bomb = await deflateRawB64(new Uint8Array(200_000)); // tiny on the wire, 200 KB inflated
    expect(bomb.length).toBeLessThan(43_692);
    const r1 = await submit(api, u.token, { ...sub, log: bomb });
    expect(r1.status).toBe(422);
    expect(r1.body.error.code).toBe("log_invalid");
  });

  test("garbage deflate and count != eventCount -> 422 log_invalid", async () => {
    const a = await legitRun(94);
    const garbage = await submit(api, a.u.token, {
      ...a.sub,
      log: btoa("this is not deflate data at all"),
    });
    expect(garbage.status).toBe(422);
    expect(garbage.body.error.code).toBe("log_invalid");

    const b = await legitRun(95);
    const r = await submit(api, b.u.token, { ...b.sub, eventCount: b.sub.eventCount + 1 });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("log_invalid");
    expect(r.body.error.message).toContain("eventCount");
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='rejected'", b.t.runId),
    ).toBe(1);
  });

  test("fewer than AC_MIN_KEYS keys: accepted but not ranked", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const sub = await buildSubmission(t, constantKeys(passageOf(t), 150, 10));
    clock.t = t.issuedAt + 62_000;
    const r = await submit(api, u.token, sub);
    expect(r.status).toBe(200);
    expect(r.body.rank).toBeNull();
    expect(r.body.pb).toBe(false);
    expect(
      await count("SELECT COUNT(*) n FROM leaderboard_entries WHERE user_id=?1", u.userId),
    ).toBe(0);
  });
});

describe("leaderboard cache (cron)", () => {
  test("rebuild writes the KV top-100 and /lb/trial serves it", async () => {
    const { u, sub } = await legitRun(101, 70);
    await submit(api, u.token, sub);
    clock.t += 1000;
    await env.LB_CACHE.delete("lb:trial_wpm:S1");
    await env.LB_CACHE.delete("lb:trial_wpm:all");
    await rebuildAllTopCaches(env, clock.t); // what the scheduled() handler runs
    const cached = await env.LB_CACHE.get<J>("lb:trial_wpm:S1", "json");
    expect(cached.updatedAt).toBe(clock.t);
    expect(cached.top.length).toBeGreaterThan(0);
    expect(cached.top.length).toBeLessThanOrEqual(100);
    expect(cached.top.some((e: J) => e.userId === u.userId)).toBe(true);
    expect(cached.top.map((e: J) => e.rank)).toEqual(
      cached.top.map((_: unknown, i: number) => i + 1),
    );
    // prove /lb serves the cache (not live D1): tamper with a sentinel in KV
    cached.updatedAt = 42;
    cached.top = cached.top.slice(0, 1);
    await env.LB_CACHE.put("lb:trial_wpm:S1", JSON.stringify(cached));
    const served = await api("GET", "/lb/trial?scope=season");
    expect(served.body.updatedAt).toBe(42);
    expect(served.body.top.length).toBe(1);
    // around=me is live D1 regardless of the cache
    const around = await api("GET", "/lb/trial?scope=season&around=me", { token: u.token });
    expect(around.body.around.some((e: J) => e.userId === u.userId)).toBe(true);
    // cache miss falls back to a live build
    await env.LB_CACHE.delete("lb:trial_wpm:S1");
    const live = await api("GET", "/lb/trial?scope=season");
    expect(live.body.top.some((e: J) => e.userId === u.userId)).toBe(true);
  });

  test("cron sweep: expired open tickets -> expired; replays past TTL deleted; live ones kept", async () => {
    const u = await signup(api);
    const t = await startRun(api, u.token);
    const { sweepExpired } = await import("../src/lib/sweep.ts");
    await sweepExpired(env.DB, t.issuedAt + 1000); // earlier tests' stale tickets may be swept; this one is live
    expect(await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='open'", t.runId)).toBe(
      1,
    );
    // seed two replays for this run's user: one past TTL, one live
    const old = await startRun(api, (await signup(api)).token);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO run_replays (run_id, log_b64, expires_at) VALUES (?1, 'x', ?2)",
      ).bind(old.runId, t.issuedAt - 1),
      env.DB.prepare(
        "INSERT INTO run_replays (run_id, log_b64, expires_at) VALUES (?1, 'y', ?2)",
      ).bind(t.runId, t.issuedAt + 10 ** 9),
    ]);
    const r = await sweepExpired(env.DB, t.expiresAt + 1);
    expect(r.expiredRuns).toBeGreaterThanOrEqual(2);
    expect(r.deletedReplays).toBe(1);
    expect(
      await count("SELECT COUNT(*) n FROM runs WHERE id=?1 AND status='expired'", t.runId),
    ).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM run_replays WHERE run_id=?1", t.runId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM run_replays WHERE run_id=?1", old.runId)).toBe(0);
    // the user can start a fresh ticket
    expect((await startRun(api, u.token)).runId).not.toBe(t.runId);
  });

  test("the scheduled handler is exported", async () => {
    const mod = await import("../src/index.ts");
    expect(typeof mod.default.scheduled).toBe("function");
    expect(typeof mod.default.fetch).toBe("function");
  });
});

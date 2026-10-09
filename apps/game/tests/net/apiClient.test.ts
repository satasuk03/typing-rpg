import { describe, expect, test } from "vitest";
import { ApiClient, ApiError, NetworkError, ProtocolError, REACTION } from "../../src/net/index.ts";
import { err, fetchFrom, type Req } from "./fakeServer.ts";

const sleeps: number[] = [];
const mk = (handler: Parameters<typeof fetchFrom>[0], log: Req[] = [], maxAttempts = 4) =>
  new ApiClient({
    baseUrl: "http://api.test/",
    fetch: fetchFrom(handler, log),
    maxAttempts,
    baseDelayMs: 100,
    sleep: async (ms) => void sleeps.push(ms),
  });

const ticket = {
  runId: "r1",
  mode: "trial",
  boardId: "trial_wpm",
  trialId: "typing-trial",
  seed: 5,
  issuedAt: 1,
  expiresAt: 2,
  simVersion: 1,
  contentVersion: "abcd1234",
  sig: "s",
};

describe("ApiClient", () => {
  test("parses typed responses and sends auth + JSON headers", async () => {
    const log: Req[] = [];
    const api = mk(() => ({ status: 200, body: ticket }), log);
    const t = await api.runStart("TOKEN");
    expect(t.runId).toBe("r1");
    expect(log[0]?.method).toBe("POST");
    expect(log[0]?.path).toBe("/runs/start");
    expect(log[0]?.headers.authorization).toBe("Bearer TOKEN");
    expect(log[0]?.headers["content-type"]).toBe("application/json");
    expect(log[0]?.body).toEqual({ mode: "trial", boardId: "trial_wpm" });
  });

  test("submit sends Idempotency-Key = runId; save PUT sends a quoted If-Match", async () => {
    const log: Req[] = [];
    const api = mk(
      (r) =>
        r.path === "/save"
          ? { status: 200, body: { revision: 4, updatedAt: 9 } }
          : {
              status: 200,
              body: {
                status: "accepted",
                runId: "r1",
                verified: { wpmX100: 1, accuracyBp: 2, score: 3 },
                pb: true,
                rank: 1,
              },
            },
      log,
    );
    await api.runSubmit("T", { runId: "r1" } as never);
    expect(log[0]?.headers["idempotency-key"]).toBe("r1");
    await api.putSave("T", 3, {
      blob: "AAAA",
      summary: { schemaVersion: 1, levelMax: 0, stars: 0, playtimeSec: 0 },
    });
    expect(log[1]?.headers["if-match"]).toBe('"3"');
  });

  test("error envelope -> typed ApiError with code, status and reaction (HTTP errors are never retried)", async () => {
    const log: Req[] = [];
    const api = mk(() => err(422, "resim_mismatch", "nope", {}), log);
    const e = await api.runSubmit("T", { runId: "r1" } as never).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("resim_mismatch");
    expect(e.status).toBe(422);
    expect(e.reaction).toBe("new-run");
    expect(log).toHaveLength(1);
  });

  test("every error code has a reaction", () => {
    for (const code of Object.keys(REACTION))
      expect(REACTION[code as keyof typeof REACTION]).toBeTruthy();
    expect(REACTION.token_expired).toBe("refresh");
    expect(REACTION.refresh_reused).toBe("relogin");
    expect(REACTION.save_conflict).toBe("merge");
    expect(REACTION.rate_limited).toBe("backoff");
  });

  test("getSave: 404 -> null; 409 keeps the parsed server copy", async () => {
    const rec = {
      revision: 2,
      updatedAt: 1,
      blob: "AAAA",
      summary: { schemaVersion: 1, levelMax: 0, stars: 0, playtimeSec: 0 },
    };
    const api = mk((r) =>
      r.method === "GET" ? err(404, "not_found") : err(409, "save_conflict", "x", { server: rec }),
    );
    expect(await api.getSave("T")).toBeNull();
    const e = await api.putSave("T", 1, { blob: "AAAA", summary: rec.summary }).catch((x) => x);
    expect(e.code).toBe("save_conflict");
    expect(e.server).toEqual(rec);
  });

  test("network errors are retried with exponential backoff, then surface as NetworkError", async () => {
    sleeps.length = 0;
    let calls = 0;
    const api = new ApiClient({
      baseUrl: "http://x",
      maxAttempts: 4,
      baseDelayMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
      fetch: (async () => {
        calls++;
        throw new TypeError("offline");
      }) as never,
    });
    await expect(api.runStart("T")).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toBe(4);
    expect(sleeps).toEqual([100, 200, 400]);
  });

  test("a transient network failure followed by success returns the success (same request re-sent)", async () => {
    let n = 0;
    const log: Req[] = [];
    const inner = fetchFrom(() => ({ status: 200, body: ticket }), log);
    const api = new ApiClient({
      baseUrl: "http://x",
      sleep: async () => {},
      fetch: ((u: string, i: RequestInit) =>
        n++ < 2 ? Promise.reject(new TypeError("x")) : inner(u, i)) as never,
    });
    expect((await api.runStart("T")).runId).toBe("r1");
    expect(n).toBe(3);
  });

  test("garbage / schema-mismatching bodies are ProtocolErrors, not silent", async () => {
    const api = mk(() => ({ status: 200, body: { nope: true } }));
    await expect(api.runStart("T")).rejects.toBeInstanceOf(ProtocolError);
    const api2 = mk(() => ({ status: 500, body: { weird: 1 } }));
    await expect(api2.runStart("T")).rejects.toBeInstanceOf(ProtocolError);
  });
});

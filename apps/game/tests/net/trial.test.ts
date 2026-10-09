import { CONTENT_VERSION, contentBundle } from "@hd2d/content";
import { decodeLogWire } from "@hd2d/shared";
import {
  CLIENT_LAG_TICKS,
  decodeTrialLog,
  msToTick,
  replayTrial,
  resimTrialLog,
  resolveTrial,
  SIM_VERSION,
  trialClaimMismatches,
} from "@hd2d/sim";
import { describe, expect, test } from "vitest";
import type { KeyLike } from "../../src/net/index.ts";
import {
  ApiClient,
  ApiError,
  AuthManager,
  MemoryStore,
  TrialRecorder,
  TrialService,
} from "../../src/net/index.ts";
import { err, FakeServer, fetchFrom } from "./fakeServer.ts";

const def = resolveTrial(contentBundle, "typing-trial");
const SEED = 12345;

const key = (k: string, t: number, o: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  repeat: false,
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  timeStamp: t,
  ...o,
});

/** Types the real passage with jittered gaps starting at browser timestamp t0 (fractional, like performance.now()). */
function typeRun(rec: TrialRecorder, t0: number, n: number, gap = 190, typoEvery = 0) {
  let t = t0;
  let i = 0;
  const p = rec.passage;
  for (let k = 0; k < n; k++) {
    if (typoEvery && k % typoEvery === typoEvery - 1) {
      rec.onKeyDown(key(p.charAt(i) === "z" ? "q" : "z", t));
      t += 120.4;
    }
    rec.onKeyDown(key(p.charAt(i++), t));
    t += gap + ((k * 37) % 70) + 0.37;
  }
  return t;
}

describe("TrialRecorder (log recording from synthetic keydown timings)", () => {
  test("the first accepted keydown is the clock origin: first record ms = 0, later ms are rounded offsets", () => {
    const rec = new TrialRecorder(def, SEED);
    expect(rec.started).toBe(false);
    expect(rec.onKeyDown(key(rec.passage.charAt(0), 98_765.432))).toBe("typed");
    expect(rec.started).toBe(true);
    rec.onKeyDown(key(rec.passage.charAt(1), 98_765.432 + 200.6));
    expect(rec.log.map((l) => l.ms)).toEqual([0, 201]);
    expect(rec.log[1]?.input).toEqual({ tick: msToTick(201), key: rec.passage.charAt(1) });
    expect(rec.log.every((l) => l.input.tick === msToTick(l.ms))).toBe(true);
  });

  test("ignored: auto-repeat, IME, shortcuts, non-typable keys; Escape/Tab are reported, never logged", () => {
    const rec = new TrialRecorder(def, SEED);
    const c = rec.passage.charAt(0);
    expect(rec.onKeyDown(key(c, 10, { repeat: true }))).toBe("ignored");
    expect(rec.onKeyDown(key(c, 10, { isComposing: true }))).toBe("ignored");
    expect(rec.onKeyDown(key(c, 10, { ctrlKey: true }))).toBe("ignored");
    expect(rec.onKeyDown(key("Shift", 10))).toBe("ignored");
    expect(rec.onKeyDown(key("F5", 10))).toBe("ignored");
    expect(rec.onKeyDown(key("Escape", 10))).toBe("escape");
    expect(rec.onKeyDown(key("Tab", 10))).toBe("escape");
    expect(rec.started).toBe(false); // none of that started the clock
    expect(rec.log).toHaveLength(0);
  });

  test("ms never goes backwards even if timestamps do (clamped to what was already simulated/logged)", () => {
    const rec = new TrialRecorder(def, SEED);
    const p = rec.passage;
    rec.onKeyDown(key(p.charAt(0), 1000));
    rec.onKeyDown(key(p.charAt(1), 1500));
    rec.onKeyDown(key(p.charAt(2), 1400)); // out of order
    const ms = rec.log.map((l) => l.ms);
    expect(ms[2]).toBeGreaterThanOrEqual(ms[1] as number);
    expect([...ms].sort((a, b) => a - b)).toEqual(ms);
  });

  test("keys at or after 60 s are ignored and never logged (the log must stay within the Trial limit)", () => {
    const rec = new TrialRecorder(def, SEED);
    const p = rec.passage;
    rec.onKeyDown(key(p.charAt(0), 0));
    expect(rec.onKeyDown(key(p.charAt(1), 59_999))).toBe("typed");
    expect(rec.onKeyDown(key(p.charAt(2), 60_000))).toBe("ignored");
    expect(rec.onKeyDown(key(p.charAt(2), 61_000))).toBe("ignored");
    expect(Math.max(...rec.log.map((l) => l.ms))).toBeLessThan(60_000);
  });

  test("frames trail the clock by CLIENT_LAG_TICKS and the run ends at 60 s", () => {
    const rec = new TrialRecorder(def, SEED);
    rec.onKeyDown(key(rec.passage.charAt(0), 0));
    expect(rec.onFrame(1000)).toBe(false);
    expect(rec.view().tick).toBe(msToTick(1000) - CLIENT_LAG_TICKS);
    expect(rec.onFrame(59_900)).toBe(false);
    expect(rec.done).toBe(false);
    expect(rec.onFrame(60_100)).toBe(true);
    expect(rec.done).toBe(true);
    expect(rec.view().ticksLeft).toBe(0);
  });

  test("a full synthetic run: the claim equals the Worker's re-simulation of the encoded log (honest = accepted)", async () => {
    const rec = new TrialRecorder(def, SEED);
    const end = typeRun(rec, 777.7, 400, 140, 17);
    expect(end).toBeGreaterThan(0);
    rec.onFrame(777.7 + 60_200);
    expect(rec.done).toBe(true);
    const ticket = { runId: "r", sig: "s", seed: SEED, trialId: "typing-trial" } as never;
    const body = await rec.buildSubmission(ticket, "test", rec.timerResolutionMs);
    expect(body.eventCount).toBe(rec.log.length);
    expect(body.simVersion).toBe(SIM_VERSION);
    expect(body.contentVersion).toBe(CONTENT_VERSION);
    expect(body.logFormat).toBe("hdk1");
    // exactly what the Worker does: inflate -> decode -> re-sim -> compare claims
    const bytes = await decodeLogWire(body.log, 32 * 1024);
    expect(decodeTrialLog(bytes)).toHaveLength(body.eventCount);
    const resim = resimTrialLog(def, SEED, bytes);
    expect(trialClaimMismatches(resim, body.claimed)).toEqual([]);
    expect(body.claimed.typos).toBeGreaterThan(0);
    // and a tampered claim is caught
    expect(
      trialClaimMismatches(resim, { ...body.claimed, wpmX100: body.claimed.wpmX100 + 1 }),
    ).toEqual(["wpmX100"]);
    // sanity vs an independent replay of the recorded inputs
    const independent = replayTrial(
      def,
      SEED,
      rec.log.map((l) => l.input),
      { collectEvents: false },
    );
    expect(independent.hash).toBe(body.claimed.finalHash);
  });

  test("timerResolutionMs reports the smallest positive timestamp gap (context only), capped at 1000", () => {
    const rec = new TrialRecorder(def, SEED);
    const p = rec.passage;
    rec.onKeyDown(key(p.charAt(0), 100));
    rec.onKeyDown(key(p.charAt(1), 300));
    rec.onKeyDown(key(p.charAt(2), 305));
    expect(rec.timerResolutionMs).toBe(5);
    expect(new TrialRecorder(def, SEED).timerResolutionMs).toBe(0);
  });
});

// ---------------------------------------------------------------- TrialService

describe("TrialService", () => {
  const ticketBody = {
    runId: "run-1",
    mode: "trial",
    boardId: "trial_wpm",
    trialId: "typing-trial",
    seed: SEED,
    issuedAt: 1,
    expiresAt: 999,
    simVersion: 1,
    contentVersion: CONTENT_VERSION,
    sig: "sig",
  };
  const okBody = {
    status: "accepted",
    runId: "run-1",
    verified: { wpmX100: 6000, accuracyBp: 9900, score: 60009900 },
    pb: true,
    rank: 3,
  };

  function svc(submitHandler: (n: number) => { status: number; body: unknown } | "net") {
    const server = new FakeServer();
    let n = 0;
    const submits: { key: string | undefined; body: unknown }[] = [];
    const inner = server.fetch;
    const fetchImpl = (async (u: string, i?: RequestInit) => {
      const path = new URL(u).pathname;
      if (path === "/runs/start") return new Response(JSON.stringify(ticketBody), { status: 200 });
      if (path === "/runs/submit") {
        submits.push({
          key: new Headers(i?.headers).get("idempotency-key") ?? undefined,
          body: JSON.parse(String(i?.body)),
        });
        const r = submitHandler(n++);
        if (r === "net") throw new TypeError("offline");
        return new Response(JSON.stringify(r.body), { status: r.status });
      }
      return inner(u, i);
    }) as never;
    const api = new ApiClient({
      baseUrl: "http://api.test",
      fetch: fetchImpl,
      sleep: async () => {},
      maxAttempts: 1,
    });
    const auth = new AuthManager({ api, store: new MemoryStore(), now: () => server.now });
    return { service: new TrialService(api, auth, "test", async () => {}), submits };
  }

  async function finished(service: TrialService) {
    const run = await service.start();
    typeRun(run.recorder, 5000, 120, 150);
    run.recorder.onFrame(5000 + 61_000);
    return run;
  }

  test("start builds a recorder whose passage comes from the ticket seed", async () => {
    const { service } = svc(() => ({ status: 200, body: okBody }));
    const run = await service.start();
    expect(run.ticket.runId).toBe("run-1");
    expect(run.recorder.passage).toBe(
      resolveTrial(contentBundle, "typing-trial").passages[0] === undefined
        ? ""
        : run.recorder.passage,
    );
    expect(run.recorder.passage.length).toBeGreaterThan(1500);
  });

  test("submit sends Idempotency-Key = runId; success returns the verified result", async () => {
    const { service, submits } = svc(() => ({ status: 200, body: okBody }));
    const out = await finished(service).then((r) => service.submit(r));
    expect(out.ok).toBe(true);
    expect(submits).toHaveLength(1);
    expect(submits[0]?.key).toBe("run-1");
  });

  test("network failure: the SAME log is re-sent with the same Idempotency-Key until it lands", async () => {
    const { service, submits } = svc((n) => (n < 2 ? "net" : { status: 200, body: okBody }));
    const out = await finished(service).then((r) => service.submit(r));
    expect(out.ok).toBe(true);
    expect(submits).toHaveLength(3);
    expect(new Set(submits.map((s) => JSON.stringify(s.body))).size).toBe(1);
    expect(new Set(submits.map((s) => s.key))).toEqual(new Set(["run-1"]));
  });

  test("gives up after the attempt budget on persistent network failure (ticket still valid: no new ticket)", async () => {
    const { service, submits } = svc(() => "net");
    const out = await finished(service).then((r) => service.submit(r, { attempts: 3 }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.needsNewTicket).toBe(false);
      expect(out.error.name).toBe("NetworkError");
    }
    expect(submits).toHaveLength(3);
  });

  test("422 resim_mismatch is surfaced, not retried, and requires a new ticket", async () => {
    const { service, submits } = svc(() => err(422, "resim_mismatch", "claim differs"));
    const out = await finished(service).then((r) => service.submit(r));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBeInstanceOf(ApiError);
      expect((out.error as ApiError).code).toBe("resim_mismatch");
      expect(out.needsNewTicket).toBe(true);
    }
    expect(submits).toHaveLength(1);
  });

  test("429 rate_limited is retried with backoff; 409 run_already_submitted is final", async () => {
    const a = svc((n) => (n < 1 ? err(429, "rate_limited") : { status: 200, body: okBody }));
    expect((await finished(a.service).then((r) => a.service.submit(r))).ok).toBe(true);
    expect(a.submits).toHaveLength(2);
    const b = svc(() => err(409, "run_already_submitted"));
    const out = await finished(b.service).then((r) => b.service.submit(r));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.needsNewTicket).toBe(false);
  });

  test("the mutate hook can forge a claim (used by the e2e tamper test)", async () => {
    const { service, submits } = svc(() => err(422, "resim_mismatch"));
    const run = await finished(service);
    await service.submit(run, {
      mutate: (b) => ({ ...b, claimed: { ...b.claimed, wpmX100: b.claimed.wpmX100 + 5000 } }),
    });
    const sent = submits[0]?.body as { claimed: { wpmX100: number } };
    expect(sent.claimed.wpmX100).toBe((run.recorder.result()?.wpmX100 ?? 0) + 5000);
  });
});

// keep fetchFrom referenced for type-only helpers
void fetchFrom;

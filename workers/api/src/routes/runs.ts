// POST /runs/start and POST /runs/submit: the anti-cheat pipeline of docs/interfaces.md §10.
import { CONTENT_VERSION, contentBundle } from "@hd2d/content";
import { decodeLogWire, InflateError, RunStartRequest, RunSubmitRequest } from "@hd2d/shared";
import type { TrialResim } from "@hd2d/sim";
import {
  decodeTrialLog,
  LogError,
  replayTrial,
  resolveTrial,
  SIM_VERSION,
  trialClaimMismatches,
  trialScore,
} from "@hd2d/sim";
import { Hono } from "hono";
import type { NewFlag, RunRow, RunTransition } from "../db/index.ts";
import {
  createRun,
  getRun,
  hasOpenFlag,
  insertFlag,
  persistRunResult,
  predictRank,
  runCounters,
} from "../db/index.ts";
import { rebuildAllTopCaches } from "../lib/cache.ts";
import { deriveSeed, hmacB64Url, hmacVerifyB64Url, randomToken, sha256Hex } from "../lib/crypto.ts";
import { BOARD_ID, type Env, periodKeyFor, readAcConfig } from "../lib/env.ts";
import { ApiError, STATUS_OF } from "../lib/errors.ts";
import { analyzeTiming, type KeyRec } from "../lib/heuristics.ts";
import {
  type AppEnv,
  authenticate,
  type Ctx,
  defer,
  parseBody,
  rateLimit,
  secretOf,
} from "../lib/http.ts";
import { rankOfBest, standingOf } from "../lib/standing.ts";

export const runRoutes = new Hono<AppEnv>();

const MAX_LOG_B64 = 43_692; // interfaces §9.2
const MAX_LOG_BYTES = 32 * 1024; // inflated hdk1 bytes
const REPLAY_TTL_MS = 90 * 24 * 3_600_000;
const REPLAY_KEEP_RANK = 1000;
const TOP_N = 100;

// ---------------------------------------------------------------- ticket signature

/** HMAC message of interfaces §9.2. userId comes from the stored run row, never from the request. */
const ticketMessage = (r: {
  id: string;
  user_id: string;
  mode: string;
  board_id: string;
  seed: number;
  trial_id: string;
  issued_at: number;
  expires_at: number;
  sim_version: number;
  content_version: string;
}): string =>
  [
    "v1",
    r.id,
    r.user_id,
    r.mode,
    r.board_id,
    r.seed,
    r.trial_id,
    r.issued_at,
    r.expires_at,
    r.sim_version,
    r.content_version,
  ].join("|");

// ---------------------------------------------------------------- start

runRoutes.post("/start", async (c) => {
  const user = await authenticate(c, true);
  if (!user) throw new ApiError("unauthorized", "missing bearer token");
  await rateLimit(c, "run", user.sub);
  const body = await parseBody(c, RunStartRequest, 1024);
  const trial = contentBundle.trials[0];
  if (!trial) throw new ApiError("internal", "no trial content");
  const cfg = readAcConfig(c.env);
  const now = c.get("deps").now();
  const periodKey = periodKeyFor(c.env, "season");
  // M1: the passage is a fixed per-user, per-season sequence: seed = HMAC(TICKET_SECRET, user|season|n) where n counts
  // SUBMITTED runs. Abandoned/expired tickets do not advance n, so abandoning never rerolls the passage.
  const counters = await runCounters(c.env.DB, { userId: user.sub, periodKey });
  const seed = await deriveSeed(
    secretOf(c.env, "TICKET_SECRET"),
    user.sub,
    periodKey,
    counters.consumed,
  );
  if (
    counters.total >= cfg.abandonMinTickets &&
    counters.abandoned / counters.total > cfg.abandonMaxRate &&
    !(await hasOpenFlag(c.env.DB, { userId: user.sub, reasonCode: "abandon_rate" }))
  ) {
    await insertFlag(c.env.DB, {
      id: crypto.randomUUID(),
      runId: null,
      userId: user.sub,
      reasonCode: "abandon_rate",
      severity: "review",
      detailsJson: JSON.stringify({ ...counters, periodKey, maxRate: cfg.abandonMaxRate }),
      now,
    });
  }
  const row = {
    id: crypto.randomUUID(),
    user_id: user.sub,
    mode: body.mode,
    board_id: body.boardId,
    trial_id: trial.id,
    seed,
    issued_at: now,
    expires_at: now + cfg.runTtlMs,
    sim_version: SIM_VERSION as number,
    content_version: CONTENT_VERSION as string,
  };
  const sig = await hmacB64Url(secretOf(c.env, "TICKET_SECRET"), ticketMessage(row));
  // One open Trial ticket per user: createRun abandons the previous open one in the same batch.
  await createRun(c.env.DB, {
    id: row.id,
    userId: row.user_id,
    mode: body.mode,
    boardId: row.board_id,
    trialId: row.trial_id,
    seed: row.seed,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    simVersion: row.sim_version,
    contentVersion: row.content_version,
    sig,
    periodKey,
  });
  return c.json({
    runId: row.id,
    mode: row.mode,
    boardId: row.board_id,
    trialId: row.trial_id,
    seed: row.seed,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    simVersion: row.sim_version,
    contentVersion: row.content_version,
    sig,
  });
});

// ---------------------------------------------------------------- submit helpers

/** Answer for a run that is no longer open (§10 step 2a): the stored response iff the same log, else 409. */
function replayResponse(run: RunRow, logHash: string): Response {
  if (run.log_sha256 !== null && run.log_sha256 === logHash && run.response !== null) {
    const status = run.error_code
      ? (STATUS_OF[run.error_code as keyof typeof STATUS_OF] ?? 422)
      : 200;
    return new Response(run.response, {
      status,
      headers: { "content-type": "application/json", "Idempotent-Replay": "true" },
    });
  }
  throw new ApiError("run_already_submitted", `run is already ${run.status}`);
}

interface SubmitMeta {
  clientVersion: string;
  timerResolutionMs: number;
}

/**
 * Terminal rejection (steps 2b, 4-7): conditional open -> rejected/expired transition with the stored error body.
 * If another request already transitioned the run, answer per step 2a instead.
 */
async function rejectTerminal(
  c: Ctx,
  run: RunRow,
  logHash: string,
  meta: SubmitMeta,
  status: "rejected" | "expired",
  err: ApiError,
): Promise<Response> {
  const body = err.body();
  const won = await persistRunResult(c.env.DB, {
    transition: {
      runId: run.id,
      status,
      now: c.get("deps").now(),
      submitNonce: randomToken(16),
      logSha256: logHash,
      errorCode: err.code,
      response: JSON.stringify(body),
      clientVersion: meta.clientVersion,
      timerResolutionMs: meta.timerResolutionMs,
    },
  });
  if (!won) {
    const cur = await getRun(c.env.DB, run.id);
    if (cur) return replayResponse(cur, logHash);
  }
  return c.json(body, err.status as 400);
}

// ---------------------------------------------------------------- submit

runRoutes.post("/submit", async (c) => {
  // 1. auth + body + Idempotency-Key
  const user = await authenticate(c, true);
  if (!user) throw new ApiError("unauthorized", "missing bearer token");
  await rateLimit(c, "run", user.sub);
  const body = await parseBody(c, RunSubmitRequest, MAX_LOG_B64 + 4096, (raw) => {
    const log = (raw as { log?: unknown } | null)?.log;
    if (typeof log === "string" && log.length > MAX_LOG_B64) {
      throw new ApiError("payload_too_large", "log exceeds the size limit");
    }
  });
  if (c.req.header("Idempotency-Key") !== body.runId) {
    throw new ApiError("bad_request", "Idempotency-Key must equal runId");
  }
  const db = c.env.DB;
  const deps = c.get("deps");
  const cfg = readAcConfig(c.env);
  const now = deps.now();

  // 2. load run; 2a. already finished -> stored response (same log) or 409
  const run = await getRun(db, body.runId);
  if (!run || run.user_id !== user.sub) throw new ApiError("run_not_found", "no such run");
  const logHash = await sha256Hex(body.log);
  if (run.status !== "open") return replayResponse(run, logHash);
  const meta: SubmitMeta = {
    clientVersion: body.clientVersion,
    timerResolutionMs: body.timerResolutionMs,
  };

  // 2b. expiry
  if (now > run.expires_at) {
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "expired",
      new ApiError("run_expired", "run ticket expired"),
    );
  }

  // 3. ticket signature (non-terminal: the sender may not be the ticket holder)
  if (!(await hmacVerifyB64Url(secretOf(c.env, "TICKET_SECRET"), ticketMessage(run), body.sig))) {
    throw new ApiError("bad_signature", "ticket signature invalid");
  }

  // 4. sim + content version
  if (
    body.simVersion !== SIM_VERSION ||
    body.contentVersion !== CONTENT_VERSION ||
    run.sim_version !== SIM_VERSION ||
    run.content_version !== CONTENT_VERSION
  ) {
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "rejected",
      new ApiError("version_mismatch", "sim or content version mismatch", {
        simVersion: SIM_VERSION,
        contentVersion: CONTENT_VERSION,
      }),
    );
  }

  // 5. decode (limits) + count + first dt + commands
  let decoded: ReturnType<typeof decodeTrialLog>;
  try {
    decoded = decodeTrialLog(await decodeLogWire(body.log, MAX_LOG_BYTES));
    if (decoded.length !== body.eventCount) throw new LogError("count != eventCount");
  } catch (e) {
    if (!(e instanceof LogError || e instanceof InflateError)) throw e;
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "rejected",
      new ApiError("log_invalid", e.message),
    );
  }

  // 6. wall-clock plausibility
  const elapsed = now - run.issued_at;
  const lastMs = decoded[decoded.length - 1]?.ms ?? 0;
  if (lastMs > elapsed + cfg.clockSlackMs || elapsed < 60_000 - cfg.clockSlackMs) {
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "rejected",
      new ApiError("timing_impossible", "log duration is inconsistent with the ticket clock"),
    );
  }

  // 7. re-sim + claim compare
  const def = resolveTrial(contentBundle, run.trial_id);
  const rs = replayTrial(
    def,
    run.seed,
    decoded.map((d) => d.input),
    { collectEvents: false },
  );
  if (rs.result === null) {
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "rejected",
      new ApiError("log_invalid", "trial did not terminate"),
    );
  }
  const resim: TrialResim = { result: rs.result, hash: rs.hash, score: trialScore(rs.result) };
  const mismatches = trialClaimMismatches(resim, body.claimed);
  if (mismatches.length > 0) {
    return rejectTerminal(
      c,
      run,
      logHash,
      meta,
      "rejected",
      new ApiError("resim_mismatch", "claimed result does not match the re-simulation", {
        fields: mismatches,
      }),
    );
  }
  const { wpmX100, accuracyBp } = resim.result;
  const verified = { wpmX100, accuracyBp, score: resim.score };

  // 8. heuristics on the verified log
  const passage = rs.finalState.passage;
  const keys: KeyRec[] = [];
  let cursor = 0;
  for (const d of decoded) {
    if (!("key" in d.input) || d.input.key === "Escape" || d.input.tick >= def.durationTicks)
      continue;
    const correct = cursor < passage.length && d.input.key === passage.charAt(cursor);
    if (correct) cursor++;
    keys.push({ ms: d.ms, correct });
  }
  const { hits, metrics } = analyzeTiming(keys, verified, cfg);
  const ranked = keys.length >= cfg.minKeys;
  const flagged = ranked && hits.length > 0;

  const submitNonce = randomToken(16);
  const seasonKey = run.period_key ?? periodKeyFor(c.env, "season"); // L7: credit the period the ticket was issued in
  const allKey = periodKeyFor(c.env, "all");
  const periods = [seasonKey, allKey];
  const standings: Record<string, Awaited<ReturnType<typeof standingOf>>> = {};
  for (const p of periods) {
    standings[p] = await standingOf(db, { boardId: BOARD_ID, periodKey: p, userId: user.sub });
  }
  // H1: pb/rank are computed from the owner's EFFECTIVE best (public row or shadow row) and never look at whether
  // this run is flagged, so a flagged and an ok submission with the same score get byte-identical answers.
  const seasonSt = standings[seasonKey] as Awaited<ReturnType<typeof standingOf>>;
  const rankQ = { boardId: BOARD_ID, periodKey: seasonKey, userId: user.sub };
  let pb = false;
  let rank: number | null = null;
  if (ranked && seasonSt.kind !== "removed") {
    pb = seasonSt.kind === "none" || verified.score > seasonSt.best.score;
    if (pb) {
      rank = await predictRank(db, { ...rankQ, score: verified.score, achievedAt: now });
    } else if (seasonSt.kind === "best") {
      rank = await rankOfBest(db, rankQ, seasonSt.best);
    }
  }

  const flags: Omit<NewFlag, "guard">[] = [];
  const details = (extra: object) =>
    JSON.stringify({
      ...extra,
      metrics,
      timerResolutionMs: body.timerResolutionMs,
      clientVersion: body.clientVersion,
    });
  if (flagged) {
    for (const h of hits) {
      flags.push({
        id: crypto.randomUUID(),
        runId: run.id,
        userId: user.sub,
        reasonCode: h.code,
        severity: "shadow",
        detailsJson: details({ value: h.value, threshold: h.threshold }),
        now,
      });
    }
  }
  const allSt = standings[allKey];
  const prevAll = allSt?.kind === "best" ? allSt.best : null;
  if (ranked && prevAll && verified.wpmX100 - prevAll.wpm_x100 >= cfg.pbJumpReviewWpm * 100) {
    flags.push({
      id: crypto.randomUUID(),
      runId: run.id,
      userId: user.sub,
      reasonCode: "pb_jump",
      severity: "review",
      detailsJson: details({ previousWpmX100: prevAll.wpm_x100, wpmX100: verified.wpmX100 }),
      now,
    });
  }
  // Every heuristic value is logged for threshold tuning (the IKI rules are provisional).
  flags.push({
    id: crypto.randomUUID(),
    runId: run.id,
    userId: user.sub,
    reasonCode: "ac_metrics",
    severity: "info",
    detailsJson: details({ hits: hits.map((h) => h.code), ranked }),
    now,
  });

  const responseBody = { status: "accepted" as const, runId: run.id, verified, pb, rank };
  const transition: RunTransition = {
    runId: run.id,
    status: flagged ? "flagged" : "accepted",
    now,
    submitNonce,
    logSha256: logHash,
    response: JSON.stringify(responseBody),
    clientVersion: body.clientVersion,
    timerResolutionMs: body.timerResolutionMs,
    verified,
  };

  // 9. one batch: conditional UPDATE ... WHERE status='open' + nonce-guarded writes
  const won = await persistRunResult(db, {
    transition,
    // ok runs feed the public board; flagged runs feed the owner-only shadow table (never the public one).
    leaderboard:
      ranked && !flagged
        ? periods.map((periodKey) => ({
            boardId: BOARD_ID,
            periodKey,
            userId: user.sub,
            wpmX100,
            accuracyBp,
            achievedAt: now,
            status: "ok" as const,
          }))
        : [],
    shadow:
      ranked && flagged
        ? periods.map((periodKey) => ({
            boardId: BOARD_ID,
            periodKey,
            userId: user.sub,
            wpmX100,
            accuracyBp,
            achievedAt: now,
          }))
        : [],
    replay:
      ranked && (flagged || (pb && rank !== null && rank <= REPLAY_KEEP_RANK))
        ? { logB64: body.log, expiresAt: now + REPLAY_TTL_MS }
        : undefined,
    flags,
  });
  if (!won) {
    // Lost the race (a concurrent identical submit won): answer from the stored row.
    const cur = await getRun(db, run.id);
    if (!cur) throw new ApiError("internal", "run vanished");
    return replayResponse(cur, logHash);
  }
  // H1(c): the condition depends only on pb/rank (identical for flagged and ok runs) and the rebuild is always
  // deferred, so neither the work done nor the response time reveals the shadow flag.
  if (pb && rank !== null && rank <= TOP_N) {
    await defer(c, rebuildAllTopCaches(c.env as Env, now));
  }
  return c.json(responseBody);
});

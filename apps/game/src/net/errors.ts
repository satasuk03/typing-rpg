// Typed errors + the interfaces §9.2 status/reaction table.
import type { ErrorCode } from "@hd2d/shared";

export type Code = (typeof ErrorCode.options)[number];

/** What the caller should do about an error code (docs/interfaces.md §9.2 table). */
export type Reaction =
  | "bug" // schema drift / programming error: do not retry unchanged
  | "refresh" // POST /auth/refresh, then retry
  | "reauth" // access token rejected: refresh once, then re-login
  | "relogin" // refresh token dead: /auth/anon with the stored device credentials
  | "stop" // not allowed / too large / already done: surface, no retry
  | "none" // expected outcome (e.g. 404 = no save yet)
  | "merge" // save conflict: merge with the server copy and PUT again
  | "new-run" // the ticket is spent or invalid: start a new run
  | "reload" // client is stale: prompt a reload
  | "backoff"; // retry later with backoff

export const REACTION: Readonly<Record<Code, Reaction>> = {
  bad_request: "bug",
  unauthorized: "reauth",
  token_expired: "refresh",
  refresh_invalid: "relogin",
  refresh_reused: "relogin",
  forbidden: "stop",
  not_found: "none",
  save_conflict: "merge",
  precondition_required: "bug",
  payload_too_large: "stop",
  rate_limited: "backoff",
  run_not_found: "new-run",
  run_expired: "new-run",
  run_already_submitted: "stop",
  bad_signature: "new-run",
  version_mismatch: "reload",
  log_invalid: "new-run",
  resim_mismatch: "new-run",
  timing_impossible: "new-run",
  internal: "backoff",
};

/** A non-2xx response carrying the error envelope. */
export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly code: Code,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    /** present on 409 save_conflict */
    readonly server?: unknown,
  ) {
    super(message);
  }
  get reaction(): Reaction {
    return REACTION[this.code];
  }
}

/** fetch() itself failed (offline, DNS, connection reset). The only error class that is retried automatically. */
export class NetworkError extends Error {
  override name = "NetworkError";
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** The response was not an error envelope or did not match the shared schema (server/client version drift). */
export class ProtocolError extends Error {
  override name = "ProtocolError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
